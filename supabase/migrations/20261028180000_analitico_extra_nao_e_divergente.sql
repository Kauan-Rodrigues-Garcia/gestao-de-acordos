-- ============================================================================
-- Analítico: o Extra do relatório não é Divergente
-- ============================================================================
--
-- ## O que o banco mostrou (28/10/2026, consulta autorizada)
--
-- Linhas de outubro com status «divergente», por tipo de comissão:
--
--   Receptivo, Extra ............ 464 linhas, R$ 196.543,73
--   Receptivo, Integral .......... 61 linhas, R$  14.903,82
--   outros setores, Integral .... 436 linhas, R$ 116.668,49
--   sem tipo (Cofen, Jornada…) ... 19 linhas, R$   6.374,27
--
-- O relatório traz «Tipo comissão = Extra» quando o NR é vinculado a OUTRO
-- operador: o acordo direto é do colega, e quem recebeu é o extra. Para o
-- Receptivo, que trabalha como extra, esse é o caso normal. A regra de
-- 20260928111922 não olhava essa coluna: sem acordo do próprio dono da linha e
-- com o DIRETO de outra pessoa, a linha virava Divergente — e «Confirmar
-- transferência» tirava o direto do colega e o dava ao extra, desfazendo o par
-- Direto/Extra.
--
-- ## A regra (decisão do usuário, 28/10/2026)
--
-- Linha com «Tipo comissão» Extra cujo acordo DIRETO é de outra pessoa é
-- TABULADA, ligada a esse acordo direto. O operador do extra não precisa
-- registrar nada. A resposta diz `extra_do_direto` e quem é o dono do direto,
-- para a tela mostrar «Extra · direto de Fulano».
--
--   • `fn_analitico_status_tabulacao` e `_lote` respondem assim;
--   • `fn_analitico_tabular_divergente` NUNCA transfere o direto de uma linha
--     Extra: liga a linha ao direto e devolve `extra_do_direto`;
--   • as linhas Extra já gravadas como «divergente» são acertadas aqui mesmo
--     (bloco 4), em todos os meses.
--
-- Integral e sem tipo continuam como estavam: ali o Divergente é de verdade.
--
-- Copia os corpos de 20260928111922 (status e transferência) e de
-- 20261005200000 (lote), mudando só o ramo do Extra. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. Status de uma linha ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_analitico_status_tabulacao(p_linha_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_linha  public.analitico_recebimentos%ROWTYPE;
  v_achado RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_linha FROM public.analitico_recebimentos WHERE id = p_linha_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro', 'linha_inexistente');
  END IF;

  IF NOT public.fn_can_access_empresa(v_linha.empresa_id) THEN
    RETURN jsonb_build_object('erro', 'empresa_negada');
  END IF;

  SELECT * INTO v_achado
    FROM public.fn_analitico_acordos_do_codigo(v_linha.empresa_id, v_linha.codigo, v_linha.operador_id);

  IF v_achado.meu_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'tabulado', 'acordo_id', v_achado.meu_id);
  END IF;

  -- Extra do relatório: o direto do colega é o par dele, não uma divergência.
  IF v_achado.alvo_id IS NOT NULL AND COALESCE(v_linha.tipo_comissao, '') ILIKE '%extra%' THEN
    RETURN jsonb_build_object(
      'status',              'tabulado',
      'acordo_id',           v_achado.alvo_id,
      'extra_do_direto',     true,
      'outro_operador_id',   v_achado.alvo_operador_id,
      'outro_operador_nome', v_achado.alvo_operador_nome);
  END IF;

  IF v_achado.alvo_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status',              'divergente',
      'acordo_id',           v_achado.alvo_id,
      'outro_operador_id',   v_achado.alvo_operador_id,
      'outro_operador_nome', v_achado.alvo_operador_nome);
  END IF;

  RETURN jsonb_build_object('status', 'nao_tabulado');
END
$function$;

-- ── 2. Status em lote ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_analitico_status_tabulacao_lote(p_linha_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_linha        record;
  v_achado       record;
  v_res          jsonb := '{}'::jsonb;
  v_status       text;
  v_acordo       uuid;
  v_item         jsonb;
  v_ids          uuid[] := '{}';
  v_sts          text[] := '{}';
  v_acs          uuid[] := '{}';
  v_emp_vista    uuid;
  v_emp_pode     boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;
  IF coalesce(array_length(p_linha_ids, 1), 0) > 500 THEN
    RETURN jsonb_build_object('erro', 'lote_grande');
  END IF;

  FOR v_linha IN
    SELECT r.id, r.empresa_id, r.codigo, r.operador_id, r.status_tabulacao, r.acordo_id,
           r.tipo_comissao
      FROM public.analitico_recebimentos r
     WHERE r.id = ANY (p_linha_ids)
     ORDER BY r.empresa_id
  LOOP
    -- A permissão é por empresa: confere uma vez por empresa do lote.
    IF v_emp_vista IS DISTINCT FROM v_linha.empresa_id THEN
      v_emp_vista := v_linha.empresa_id;
      v_emp_pode  := coalesce(public.fn_can_access_empresa(v_linha.empresa_id), false);
    END IF;
    CONTINUE WHEN NOT v_emp_pode;

    SELECT * INTO v_achado
      FROM public.fn_analitico_acordos_do_codigo(v_linha.empresa_id, v_linha.codigo, v_linha.operador_id);

    IF v_achado.meu_id IS NOT NULL THEN
      v_status := 'tabulado';   v_acordo := v_achado.meu_id;
      v_item   := jsonb_build_object('status', v_status, 'acordo_id', v_acordo);
    ELSIF v_achado.alvo_id IS NOT NULL AND COALESCE(v_linha.tipo_comissao, '') ILIKE '%extra%' THEN
      -- Extra do relatório: tabulada no direto do colega (20261028180000).
      v_status := 'tabulado';   v_acordo := v_achado.alvo_id;
      v_item   := jsonb_build_object(
        'status',              v_status,
        'acordo_id',           v_acordo,
        'extra_do_direto',     true,
        'outro_operador_id',   v_achado.alvo_operador_id,
        'outro_operador_nome', v_achado.alvo_operador_nome);
    ELSIF v_achado.alvo_id IS NOT NULL THEN
      v_status := 'divergente'; v_acordo := v_achado.alvo_id;
      v_item   := jsonb_build_object(
        'status',              v_status,
        'acordo_id',           v_acordo,
        'outro_operador_id',   v_achado.alvo_operador_id,
        'outro_operador_nome', v_achado.alvo_operador_nome);
    ELSE
      v_status := 'nao_tabulado'; v_acordo := NULL;
      v_item   := jsonb_build_object('status', v_status);
    END IF;

    v_res := v_res || jsonb_build_object(v_linha.id::text, v_item);

    IF v_linha.status_tabulacao IS DISTINCT FROM v_status OR v_linha.acordo_id IS DISTINCT FROM v_acordo THEN
      v_ids := array_append(v_ids, v_linha.id);
      v_sts := array_append(v_sts, v_status);
      v_acs := array_append(v_acs, v_acordo);
    END IF;
  END LOOP;

  -- Um UPDATE só para o lote inteiro: um sinal para a empresa, não um por linha.
  IF array_length(v_ids, 1) > 0 THEN
    UPDATE public.analitico_recebimentos r
       SET status_tabulacao = u.status, acordo_id = u.acordo
      FROM unnest(v_ids, v_sts, v_acs) AS u(id, status, acordo)
     WHERE r.id = u.id;
  END IF;

  RETURN jsonb_build_object('linhas', v_res, 'gravadas', coalesce(array_length(v_ids, 1), 0));
END;
$function$;

-- ── 3. A transferência nunca leva o direto de uma linha Extra ───────────────

CREATE OR REPLACE FUNCTION public.fn_analitico_tabular_divergente(p_linha_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid       UUID := auth.uid();
  v_linha     public.analitico_recebimentos%ROWTYPE;
  v_novo      public.perfis%ROWTYPE;
  v_acordo    public.acordos%ROWTYPE;
  v_achado    RECORD;
  v_campo     TEXT;
  v_codigo    TEXT;
  v_ant_nome  TEXT;
  v_ant_lider UUID;
  v_base      TEXT;
  v_extras    INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_linha FROM public.analitico_recebimentos WHERE id = p_linha_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'linha_inexistente');
  END IF;

  IF NOT public.fn_can_access_empresa(v_linha.empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_negada');
  END IF;

  IF v_linha.operador_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'linha_sem_operador');
  END IF;

  v_codigo := btrim(COALESCE(v_linha.codigo, ''));
  IF v_codigo = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'linha_sem_codigo');
  END IF;

  SELECT * INTO v_novo
    FROM public.perfis
   WHERE id = v_linha.operador_id AND empresa_id = v_linha.empresa_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'destinatario_invalido');
  END IF;
  IF COALESCE(v_novo.situacao, 'ativo') = 'desligado' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'destinatario_desligado');
  END IF;

  SELECT * INTO v_achado
    FROM public.fn_analitico_acordos_do_codigo(v_linha.empresa_id, v_codigo, v_novo.id);

  -- Já é dele (DIRETO ou EXTRA): não há o que transferir.
  IF v_achado.meu_id IS NOT NULL THEN
    UPDATE public.analitico_recebimentos
       SET status_tabulacao = 'tabulado', acordo_id = v_achado.meu_id
     WHERE id = p_linha_id;
    RETURN jsonb_build_object('ok', true, 'resultado', 'ja_era_seu', 'acordo_id', v_achado.meu_id);
  END IF;

  -- O acordo sumiu desde que a tela olhou: o código está livre.
  IF v_achado.alvo_id IS NULL THEN
    UPDATE public.analitico_recebimentos
       SET status_tabulacao = 'nao_tabulado', acordo_id = NULL
     WHERE id = p_linha_id;
    RETURN jsonb_build_object('ok', true, 'resultado', 'livre');
  END IF;

  -- Extra do relatório: o direto do colega é o par dele. Nunca transfere —
  -- liga a linha ao direto (20261028180000).
  IF COALESCE(v_linha.tipo_comissao, '') ILIKE '%extra%' THEN
    UPDATE public.analitico_recebimentos
       SET status_tabulacao = 'tabulado', acordo_id = v_achado.alvo_id
     WHERE id = p_linha_id;
    RETURN jsonb_build_object(
      'ok', true, 'resultado', 'extra_do_direto', 'acordo_id', v_achado.alvo_id,
      'operador_anterior_nome', v_achado.alvo_operador_nome);
  END IF;

  SELECT * INTO v_acordo FROM public.acordos WHERE id = v_achado.alvo_id FOR UPDATE;

  -- Quem pode: o dono da linha (o pagamento é dele) ou quem o painel deixa
  -- alterar o acordo que sai — a escada da policy `acordos_update`.
  IF v_uid = v_novo.id THEN
    v_base := 'dono_da_linha';
  ELSIF public.fn_user_is_super_admin()
     OR public.fn_user_escopo('acordos') >= 3
     OR (public.fn_user_escopo('acordos') >= 2
         AND (v_acordo.setor_id = public.fn_user_setor_id()
              OR (v_acordo.setor_id IS NULL
                  AND public.fn_operador_setor_id(v_acordo.operador_id) = public.fn_user_setor_id())
              OR public.fn_operador_clonado_no_setor(v_acordo.operador_id, public.fn_user_setor_id())))
  THEN
    v_base := 'painel';
  ELSE
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  SELECT nome, lider_id INTO v_ant_nome, v_ant_lider
    FROM public.perfis WHERE id = v_acordo.operador_id;

  -- A troca. `trg_sync_nr_registros` move a titularidade do NR neste UPDATE.
  UPDATE public.acordos
     SET operador_id = v_novo.id,
         setor_id    = v_novo.setor_id
   WHERE id = v_acordo.id;

  -- O EXTRA do par passa a apontar para o novo dono.
  IF v_acordo.vinculo_operador_id IS NOT NULL THEN
    v_campo := public.fn_analitico_campo_tabulacao(v_linha.empresa_id);
    EXECUTE format(
      'UPDATE public.acordos
          SET vinculo_operador_id = $1, vinculo_operador_nome = $2
        WHERE empresa_id = $3
          AND tipo_vinculo = ''extra''
          AND vinculo_operador_id = $4
          AND %I = $5', v_campo)
    USING v_novo.id, v_novo.nome, v_linha.empresa_id, v_acordo.operador_id, v_codigo;
    GET DIAGNOSTICS v_extras = ROW_COUNT;
  END IF;

  -- As linhas do novo dono com esse código ficam tabuladas neste acordo...
  UPDATE public.analitico_recebimentos
     SET status_tabulacao = 'tabulado', acordo_id = v_acordo.id
   WHERE empresa_id  = v_linha.empresa_id
     AND codigo      = v_linha.codigo
     AND operador_id = v_novo.id;

  -- ...e as de quem perdeu voltam a ser conferidas pela tela.
  UPDATE public.analitico_recebimentos
     SET status_tabulacao = 'nao_tabulado', acordo_id = NULL
   WHERE acordo_id = v_acordo.id
     AND operador_id IS DISTINCT FROM v_novo.id;

  PERFORM public.fn_log_registrar(
    p_acao        => 'acordo_transferido',
    p_categoria   => 'acordo',
    p_severidade  => 'aviso',
    p_descricao   => format('Divergente no Analítico — o código %s saiu de %s para %s, sem autorização de líder',
                            v_codigo, COALESCE(v_ant_nome, 'outro operador'), v_novo.nome),
    p_empresa_id  => v_linha.empresa_id,
    p_tabela      => 'acordos',
    p_registro_id => v_acordo.id::TEXT,
    p_alvo_tipo   => 'acordo',
    p_alvo_rotulo => 'Código ' || v_codigo,
    p_antes       => jsonb_build_object('operador_id', v_acordo.operador_id, 'setor_id', v_acordo.setor_id),
    p_depois      => jsonb_build_object('operador_id', v_novo.id, 'setor_id', v_novo.setor_id),
    p_campos      => ARRAY['operador_id', 'setor_id'],
    p_detalhes    => jsonb_build_object(
                       'origem',             'analitico_divergente',
                       'base_autorizacao',   v_base,
                       'linha_id',           v_linha.id,
                       'codigo',             v_codigo,
                       'de_operador_id',     v_acordo.operador_id,
                       'de_operador_nome',   v_ant_nome,
                       'para_operador_id',   v_novo.id,
                       'para_operador_nome', v_novo.nome,
                       'extras_reapontados', v_extras)
  );

  -- Quem perdeu o acordo e os líderes dos dois lados. Quem clicou não se
  -- notifica; líder repetido (mesmo líder dos dois lados) recebe uma só.
  INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
  SELECT DISTINCT ON (d.usuario_id)
         d.usuario_id, v_linha.empresa_id, d.titulo, d.mensagem, FALSE, '/analitico'
    FROM (VALUES
      (1, v_acordo.operador_id,
       'Acordo transferido — Analítico',
       format('O código %s foi pago e o pagamento entrou no Analítico em nome de %s. '
              'Por isso o acordo desse código saiu da sua lista e passou para essa pessoa.',
              v_codigo, v_novo.nome)),
      (2, v_novo.lider_id,
       'Transferência pelo Analítico — cód. ' || v_codigo,
       format('O acordo do código %s saiu de %s e passou para %s (Divergente no Analítico). '
              'Confira o impacto na comissão.',
              v_codigo, COALESCE(v_ant_nome, 'outro operador'), v_novo.nome)),
      (3, v_ant_lider,
       'Transferência pelo Analítico — cód. ' || v_codigo,
       format('O acordo do código %s saiu de %s e passou para %s (Divergente no Analítico). '
              'Confira o impacto na comissão.',
              v_codigo, COALESCE(v_ant_nome, 'outro operador'), v_novo.nome))
    ) AS d(ordem, usuario_id, titulo, mensagem)
   WHERE d.usuario_id IS NOT NULL
     AND d.usuario_id <> v_uid
   ORDER BY d.usuario_id, d.ordem;

  RETURN jsonb_build_object(
    'ok',                     true,
    'resultado',              'transferido',
    'acordo_id',              v_acordo.id,
    'operador_anterior_id',   v_acordo.operador_id,
    'operador_anterior_nome', v_ant_nome,
    'operador_novo_id',       v_novo.id,
    'operador_novo_nome',     v_novo.nome,
    'extras_reapontados',     v_extras);
END
$function$;

-- ── 4. As linhas Extra já gravadas como Divergente ──────────────────────────
-- Em outubro/2026, 464 linhas do Receptivo (R$ 196.543,73). Mesma regra das
-- funções acima: com acordo do próprio dono, tabulada nele; senão, no direto
-- do colega. Só mexe em status_tabulacao e acordo_id.
UPDATE public.analitico_recebimentos r
   SET status_tabulacao = 'tabulado',
       acordo_id        = COALESCE(x.meu_id, x.alvo_id)
  FROM (
    SELECT l.id, a.meu_id, a.alvo_id
      FROM public.analitico_recebimentos l
     CROSS JOIN LATERAL public.fn_analitico_acordos_do_codigo(l.empresa_id, l.codigo, l.operador_id) a
     WHERE l.status_tabulacao = 'divergente'
       AND COALESCE(l.tipo_comissao, '') ILIKE '%extra%'
  ) x
 WHERE r.id = x.id
   AND COALESCE(x.meu_id, x.alvo_id) IS NOT NULL;

COMMIT;
