-- ============================================================================
-- Analítico › Divergente: o acordo muda de dono no servidor, direto
-- ============================================================================
--
-- ## A regra
--
-- Na planilha de acordos, tabular um NR/Código que já é de outra pessoa passa
-- pela escada de `decidirConflitoNr` — autorização de líder, com as exceções de
-- Direto/Extra e de dono desligado (REGRAS-DE-NEGOCIO § 7.3).
--
-- No Analítico existe um atalho: a linha veio do relatório do ERP, ou seja, o
-- pagamento JÁ ENTROU e entrou em nome de quem está na linha. Se o acordo desse
-- código está registrado por outra pessoa, a linha fica «Divergente» e o
-- acordo tem de sair de um e entrar no outro DIRETAMENTE, sem líder.
--
-- ## Por que não funcionava
--
-- O fluxo inteiro rodava no navegador, com a RLS de quem clicava. Dois
-- defeitos, um escondendo o outro:
--
--   1. A checagem (`verificarStatusTabulacao`) lia `acordos` com a RLS do
--      operador. Com o alcance «próprios» — o padrão do cargo — a policy
--      `acordos_select` só devolve os acordos DELE. O acordo do colega nunca
--      aparecia, a linha nunca virava Divergente, o botão abria o formulário
--      de acordo novo e o formulário esbarrava na trava de NR → pedido de
--      autorização ao líder. Exatamente o que o atalho existe para evitar.
--
--   2. Quando a linha chegava a Divergente (quem tem alcance de equipe), o
--      «Confirmar transferência» fazia `DELETE` do acordo alheio pelo cliente.
--      A policy `acordos_delete_own` só deixa apagar o próprio; o DELETE
--      afetava zero linhas, SEM erro, e o código não conferia o resultado. O
--      snapshot ia para a lixeira, a notificação «seu acordo foi transferido»
--      saía, e o acordo continuava lá, com o dono antigo. O formulário que abria
--      em seguida batia de novo na trava de NR.
--
-- Havia ainda um terceiro: a checagem só olhava acordos DIRETO. Quem é o EXTRA
-- de um NR via a própria linha como Divergente — e confirmar arrancaria o
-- DIRETO do parceiro, desfazendo um par que a regra de Direto/Extra criou de
-- propósito.
--
-- ## O que muda
--
-- Duas funções, as duas `SECURITY DEFINER`, as duas partindo da LINHA do
-- analítico (não de um operador/código que o cliente informa):
--
--   • `fn_analitico_status_tabulacao(linha)` — só leitura. Responde
--     tabulado / divergente / nao_tabulado olhando TODOS os acordos da empresa,
--     independente do alcance de quem olha. O dono da linha ter o acordo como
--     DIRETO ou como EXTRA conta como tabulado.
--
--   • `fn_analitico_tabular_divergente(linha)` — a transferência, numa
--     transação só: o acordo troca de `operador_id` (e de `setor_id`, que segue
--     o novo dono, como o gatilho de INSERT faria). Nada vai para a lixeira,
--     nada precisa ser redigitado: valor, vencimento, parcelas, estado e
--     histórico continuam os mesmos. O `trg_sync_nr_registros` move a
--     titularidade do NR no mesmo UPDATE — o ramo de «troca de dono» dele
--     existe desde a 20260810b.
--
-- Quem recebe o acordo é SEMPRE o operador da linha — quem clicou pode ser ele
-- ou um líder olhando a visão geral.
--
-- ## Quem pode confirmar
--
--   • o próprio dono da linha: o pagamento é dele. É o piso de qualquer pessoa
--     sobre o próprio trabalho, a mesma exceção que `acordos_select` já faz;
--   • quem o painel deixa ALTERAR o acordo que sai — a mesma escada da policy
--     `acordos_update` (super_admin, alcance ≥ 3, ou ≥ 2 no setor do acordo).
--
-- Nenhuma lista de cargo: fora o dono da linha, quem responde é o painel.
--
-- ## Par Direto/Extra
--
-- Se o acordo que muda de dono é o DIRETO de um par, o EXTRA aponta
-- (`vinculo_operador_id`) para o dono antigo. Ele é re-apontado para o novo
-- dono no mesmo comando — senão o par ficaria com uma ponta num operador que
-- não tem mais nada com aquele NR.
--
-- ## O que NÃO muda
--
-- • A escada de conflito da planilha (`decidirConflitoNr`) e a autorização de
--   líder — continuam iguais para quem tabula pela planilha.
-- • `fn_transferir_acordo_nr` — segue servindo a autorização de líder e o dono
--   desligado.
-- • Parcelas: muda de dono o acordo titular do NR (o mesmo que a autorização de
--   líder substituiria). Parcelas antigas do mesmo grupo continuam com quem
--   estavam — já foram contadas no mês delas.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 0. Qual coluna do acordo casa com o código do relatório ────────────────
--
-- A mesma decisão do cliente (`tenant.isPaguePlay ? 'instituicao' :
-- 'nr_cliente'`): na PaguePlay o código É a instituição; na BookPlay o código
-- do relatório é o NR.
CREATE OR REPLACE FUNCTION public.fn_analitico_campo_tabulacao(p_empresa_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT CASE WHEN lower(e.slug) = 'pagueplay' THEN 'instituicao' ELSE 'nr_cliente' END
    FROM public.empresas e
   WHERE e.id = p_empresa_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_campo_tabulacao(UUID) FROM PUBLIC, anon, authenticated;

-- ── 1. Achar os acordos do código ──────────────────────────────────────────
--
-- Interna: só as duas funções abaixo chamam. Devolve
--   • meu_id — um acordo (DIRETO ou EXTRA) do próprio dono da linha;
--   • alvo_* — o acordo DIRETO de outra pessoa que ocupa o código.
--
-- O alvo preferido é o titular em `nr_registros` (é ele que trava o NR); na
-- falta, o ativo mais recente. SQL dinâmico só para a coluna — `%I` —, e a
-- comparação é direta na coluna para os índices `(nr_cliente)` e
-- `(instituicao)` servirem.
CREATE OR REPLACE FUNCTION public.fn_analitico_acordos_do_codigo(
  p_empresa_id  UUID,
  p_codigo      TEXT,
  p_operador_id UUID
)
RETURNS TABLE (meu_id UUID, alvo_id UUID, alvo_operador_id UUID, alvo_operador_nome TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_campo TEXT := public.fn_analitico_campo_tabulacao(p_empresa_id);
BEGIN
  IF v_campo IS NULL OR p_operador_id IS NULL OR btrim(COALESCE(p_codigo, '')) = '' THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($q$
    SELECT
      (SELECT a.id
         FROM public.acordos a
        WHERE a.empresa_id  = $1
          AND a.%1$I        = $2
          AND a.operador_id = $3
        ORDER BY (a.status <> 'nao_pago') DESC, a.criado_em DESC
        LIMIT 1),
      o.id, o.operador_id, o.nome
    FROM (SELECT 1) AS um
    LEFT JOIN LATERAL (
      SELECT a.id, a.operador_id, p.nome
        FROM public.acordos a
        LEFT JOIN public.perfis p ON p.id = a.operador_id
        LEFT JOIN public.nr_registros r
               ON r.empresa_id = a.empresa_id
              AND r.campo      = %2$L
              AND r.nr_value   = $2
              AND r.acordo_id  = a.id
       WHERE a.empresa_id  = $1
         AND a.%1$I        = $2
         AND a.operador_id IS DISTINCT FROM $3
         AND COALESCE(a.tipo_vinculo, 'direto') = 'direto'
       ORDER BY (r.acordo_id IS NOT NULL) DESC,
                (a.status <> 'nao_pago') DESC,
                a.criado_em DESC
       LIMIT 1
    ) o ON true
  $q$, v_campo, v_campo)
  USING p_empresa_id, btrim(p_codigo), p_operador_id;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_acordos_do_codigo(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ── 2. Status da linha (só leitura) ────────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.fn_analitico_status_tabulacao(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_status_tabulacao(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_status_tabulacao(UUID) IS
  'Status de tabulacao de uma linha do Analitico, olhando TODOS os acordos da '
  'empresa (a RLS de quem olha escondia o acordo do colega). DIRETO ou EXTRA do '
  'dono da linha = tabulado. Ver 20260928100000.';

-- ── 3. A transferência ─────────────────────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.fn_analitico_tabular_divergente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_tabular_divergente(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_analitico_tabular_divergente(UUID) IS
  'Divergente no Analitico: o acordo DIRETO do codigo passa, numa transacao, '
  'para o operador da linha (o pagamento ja entrou em nome dele). Sem lixeira e '
  'sem autorizacao de lider. Pode: o dono da linha, ou quem o painel deixa '
  'alterar o acordo. Re-aponta o EXTRA do par. Ver 20260928100000.';

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_analitico_campo_tabulacao(uuid)',
    'public.fn_analitico_acordos_do_codigo(uuid,text,uuid)',
    'public.fn_analitico_status_tabulacao(uuid)',
    'public.fn_analitico_tabular_divergente(uuid)'
  ] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure) THEN
      RAISE EXCEPTION '% deveria ser SECURITY DEFINER', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% nao pode ser executavel por anon', v_fn;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('authenticated', 'public.fn_analitico_status_tabulacao(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_analitico_tabular_divergente(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'as duas RPCs do Divergente precisam ser executaveis por authenticated';
  END IF;

  IF has_function_privilege('authenticated', 'public.fn_analitico_acordos_do_codigo(uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_analitico_campo_tabulacao(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'os auxiliares do Divergente sao internos — authenticated nao executa';
  END IF;
END
$prova$;

COMMIT;
