-- ============================================================================
-- Analítico: o Direto do relatório com o Extra do colega forma PAR, e o aviso
-- vira card no chat
-- ============================================================================
--
-- Aplicada em 16/11/2026 pelo `apply_migration`, que registrou a versão
-- 20261116234244 — o arquivo foi renomeado para bater. Os comentários dentro
-- das funções ainda citam 20261117100000: é o texto que está no banco.
--
-- ## Por que (pedido do Cleber, 16/11/2026)
--
-- O Divergente do Analítico é de 28/09 e só conhecia uma saída: o acordo do
-- código está com outra pessoa → «Confirmar transferência» tira dela e dá ao
-- dono da linha. Em 28/10 entrou a primeira exceção (linha «Extra» com o
-- DIRETO do colega = tabulada no direto dele). Faltava o outro lado da mesma
-- informação:
--
--   a linha é DIRETO (Integral) para a Ayslan, o acordo DIRETO do código está
--   com a Quezia, e o relatório do mesmo mês mostra a Quezia recebendo esse
--   código como EXTRA.
--
-- Isso não é divergência: o relatório já diz quem é o Direto e quem é o Extra.
-- Transferir tirava o acordo da Quezia, que tem recebimento Extra nele.
--
-- ## A regra (decisão do Cleber, 16/11/2026)
--
-- Linha que NÃO é Extra + acordo DIRETO do código com outra pessoa:
--
--   • o relatório do mês mostra essa outra pessoa recebendo o código como
--     Extra, e o acordo dela ainda não tem vínculo → PAR PELO RELATÓRIO.
--     A linha fica «não tabulada» com `par_pelo_relatorio = true`; ao
--     confirmar, o acordo do colega vira EXTRA e o dono da linha ganha o
--     DIRETO, igual, ligado em par. Ninguém perde o acordo.
--   • senão → Divergente, e transfere como desde 28/09.
--
-- Regra Cofen: o relatório Cofen não traz «Tipo comissão». Sem linha Extra não
-- há par pelo relatório — nos setores Cofen o Divergente segue transferindo.
--
-- ## O aviso (decisão do Cleber, 16/11/2026)
--
-- Quem perde o acordo (transferência) ou vira Extra (par) recebe um CARD na
-- conversa direta com o dono da linha — `chat_mensagens.sistema =
-- 'acordo_vinculo'`, o mesmo card do par Direto/Extra, com `evento`
-- `transferido` ou `virou_extra`. Sem chat liberado para um dos dois, cai na
-- notificação comum. Os líderes dos dois lados seguem recebendo a notificação.
--
-- ## O que muda
--
--   1. `fn_analitico_par_pelo_relatorio` (nova, interna) — a pergunta acima.
--   2. `fn_analitico_avisar_no_chat` (nova, interna) — o card.
--   3. `fn_analitico_status_tabulacao` e `_lote` — respondem o par.
--   4. `fn_analitico_tabular_divergente` — forma o par (`par_formado`) ou
--      transfere; o aviso de quem saiu passa a ser o card.
--
-- Corpos copiados de 20261028180000, mudando só o descrito. Não escreve em
-- nenhuma linha: as linhas gravadas como «divergente» que agora são par se
-- acertam sozinhas quando a tela confere (`_lote`). Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. O relatório diz que o dono do acordo é o Extra? ──────────────────────

CREATE OR REPLACE FUNCTION public.fn_analitico_par_pelo_relatorio(
  p_empresa_id       UUID,
  p_codigo           TEXT,
  p_mes              DATE,
  p_alvo_acordo_id   UUID,
  p_alvo_operador_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p_alvo_acordo_id IS NOT NULL
     AND p_alvo_operador_id IS NOT NULL
     -- o colega recebeu este código como Extra, no mesmo mês
     AND EXISTS (
       SELECT 1
         FROM public.analitico_recebimentos r
        WHERE r.empresa_id     = p_empresa_id
          AND r.codigo         = p_codigo
          AND r.operador_id    = p_alvo_operador_id
          AND r.mes_referencia = p_mes
          AND COALESCE(r.tipo_comissao, '') ILIKE '%extra%')
     -- e o acordo dele é um DIRETO ainda sem par (com Extra pendurado, trocar
     -- o titular tiraria o lugar de um terceiro: segue Divergente)
     AND EXISTS (
       SELECT 1
         FROM public.acordos a
        WHERE a.id = p_alvo_acordo_id
          AND a.vinculo_operador_id IS NULL
          AND COALESCE(a.tipo_vinculo, 'direto') = 'direto');
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_par_pelo_relatorio(UUID, TEXT, DATE, UUID, UUID)
  FROM PUBLIC, anon, authenticated;

-- ── 2. O card na conversa das duas pessoas ──────────────────────────────────
--
-- `p_de` é quem tinha o acordo; `p_para` é o dono da linha. A conversa é aberta
-- do mesmo jeito que `fn_acordo_par_avisar` (20261030235500). A prévia não leva
-- NR nem cliente: número de 11 dígitos no texto acionaria o expurgo de CPF.

CREATE OR REPLACE FUNCTION public.fn_analitico_avisar_no_chat(
  p_evento  TEXT,      -- 'transferido' | 'virou_extra'
  p_empresa UUID,
  p_de      UUID,
  p_para    UUID,
  p_dados   JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_autor    UUID := auth.uid();
  v_nome     TEXT;
  v_de_nome  TEXT;
  v_pa_nome  TEXT;
  v_dados    JSONB;
  v_texto    TEXT;
  v_menor    UUID;
  v_maior    UUID;
  v_conversa UUID;
BEGIN
  IF v_autor IS NULL OR p_de IS NULL OR p_para IS NULL OR p_de = p_para THEN
    RETURN;
  END IF;

  SELECT COALESCE(nome, 'Alguém')         INTO v_nome    FROM public.perfis WHERE id = v_autor;
  SELECT COALESCE(nome, 'outro operador') INTO v_de_nome FROM public.perfis WHERE id = p_de;
  SELECT COALESCE(nome, 'outro operador') INTO v_pa_nome FROM public.perfis WHERE id = p_para;

  v_dados := COALESCE(p_dados, '{}'::jsonb) || jsonb_build_object(
    'evento',         p_evento,
    'origem',         'analitico',
    'feito_por',      v_autor,
    'feito_por_nome', v_nome,
    'de_id',          p_de,
    'de_nome',        v_de_nome,
    'para_id',        p_para,
    'para_nome',      v_pa_nome);

  v_texto := CASE p_evento
    WHEN 'virou_extra' THEN format('Analítico: %s entrou como Direto e %s ficou como Extra num acordo.',
                                   v_pa_nome, v_de_nome)
    ELSE format('Analítico: um acordo passou de %s para %s.', v_de_nome, v_pa_nome)
  END;

  -- Sem chat para um dos dois: notificação comum para quem tinha o acordo.
  IF NOT (public.fn_chat_pode_usar(p_de) AND public.fn_chat_pode_usar(p_para)) THEN
    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota, autor_id, autor_nome)
    SELECT p_de, p_empresa,
           CASE p_evento WHEN 'virou_extra' THEN 'Seu acordo virou Extra — Analítico'
                         ELSE 'Acordo transferido — Analítico' END,
           CASE p_evento
             WHEN 'virou_extra' THEN format(
               'O pagamento do %s %s entrou no Analítico como Direto de %s, e o seu recebimento desse código é Extra. '
               'Seu acordo continua com você, agora como Extra.',
               COALESCE(v_dados->>'rotulo', 'código'), COALESCE(v_dados->>'chave', ''), v_pa_nome)
             ELSE format(
               'O %s %s foi pago e o pagamento entrou no Analítico em nome de %s. '
               'Por isso o acordo desse código saiu da sua lista e passou para essa pessoa.',
               COALESCE(v_dados->>'rotulo', 'código'), COALESCE(v_dados->>'chave', ''), v_pa_nome)
           END,
           FALSE, '/analitico', v_autor, v_nome
     WHERE p_de <> v_autor;
    RETURN;
  END IF;

  v_menor := LEAST(p_de, p_para);
  v_maior := GREATEST(p_de, p_para);
  SELECT c.id INTO v_conversa
    FROM public.chat_conversas c
   WHERE c.tipo = 'direta' AND c.par_menor = v_menor AND c.par_maior = v_maior;

  IF v_conversa IS NULL THEN
    INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
    VALUES (p_empresa, v_menor, v_maior)
    ON CONFLICT (par_menor, par_maior) WHERE tipo = 'direta' DO NOTHING
    RETURNING id INTO v_conversa;
    IF v_conversa IS NULL THEN
      SELECT c.id INTO v_conversa FROM public.chat_conversas c
       WHERE c.tipo = 'direta' AND c.par_menor = v_menor AND c.par_maior = v_maior;
    END IF;
  END IF;

  INSERT INTO public.chat_participantes (conversa_id, perfil_id)
  VALUES (v_conversa, v_menor), (v_conversa, v_maior)
  ON CONFLICT DO NOTHING;

  -- Quem fez fora do par (líder, diretoria) não vira autor da conversa dos dois.
  INSERT INTO public.chat_mensagens (conversa_id, empresa_id, autor_id, texto, sistema, sistema_dados)
  VALUES (v_conversa, p_empresa,
          CASE WHEN v_autor IN (p_de, p_para) THEN v_autor END,
          v_texto, 'acordo_vinculo', v_dados);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_analitico_avisar_no_chat(TEXT, UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;

-- ── 3. Status de uma linha ──────────────────────────────────────────────────

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

  -- Direto do relatório, e o dono do acordo é o Extra do relatório: par, não
  -- divergência (20261117100000). A linha segue «não tabulada» até confirmar.
  IF v_achado.alvo_id IS NOT NULL
     AND public.fn_analitico_par_pelo_relatorio(
           v_linha.empresa_id, v_linha.codigo, v_linha.mes_referencia,
           v_achado.alvo_id, v_achado.alvo_operador_id) THEN
    RETURN jsonb_build_object(
      'status',              'nao_tabulado',
      'par_pelo_relatorio',  true,
      'acordo_id',           v_achado.alvo_id,
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

-- ── 4. Status em lote ───────────────────────────────────────────────────────

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
           r.tipo_comissao, r.mes_referencia
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
    ELSIF v_achado.alvo_id IS NOT NULL
          AND public.fn_analitico_par_pelo_relatorio(
                v_linha.empresa_id, v_linha.codigo, v_linha.mes_referencia,
                v_achado.alvo_id, v_achado.alvo_operador_id) THEN
      -- Par pelo relatório (20261117100000): a linha não guarda o acordo do
      -- colega; a resposta leva, para a tela dizer de quem é.
      v_status := 'nao_tabulado'; v_acordo := NULL;
      v_item   := jsonb_build_object(
        'status',              v_status,
        'par_pelo_relatorio',  true,
        'acordo_id',           v_achado.alvo_id,
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

-- ── 5. Confirmar: forma o par ou transfere ──────────────────────────────────

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
  v_rotulo    TEXT;
  v_direto_id UUID;
  v_hoje      DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
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

  v_rotulo := CASE WHEN public.fn_nr_campo_chave(v_acordo.nr_cliente, v_acordo.instituicao) = 'instituicao'
                   THEN 'Código' ELSE 'NR' END;

  -- ── Par pelo relatório: ninguém perde o acordo (20261117100000) ───────────
  IF public.fn_analitico_par_pelo_relatorio(
       v_linha.empresa_id, v_linha.codigo, v_linha.mes_referencia,
       v_acordo.id, v_acordo.operador_id) THEN
    BEGIN
      -- O acordo do colega vira EXTRA do dono da linha. `trg_sync_nr_registros`
      -- solta o NR neste UPDATE.
      UPDATE public.acordos
         SET tipo_vinculo          = 'extra',
             vinculo_operador_id   = v_novo.id,
             vinculo_operador_nome = v_novo.nome
       WHERE id = v_acordo.id;

      -- O DIRETO do dono da linha nasce igual ao do colega. `trg_vinculo_par_ins`
      -- liga as duas metades. As observações são de quem as escreveu: não vão.
      INSERT INTO public.acordos (
        nome_cliente, nr_cliente, instituicao, whatsapp, estado_uf,
        tipo, parcelas, operador_id, empresa_id, setor_id, data_cadastro,
        acordo_grupo_id, numero_parcela, tipo_vinculo, vinculo_operador_id,
        vinculo_operador_nome, valor_total, usou_quarenta_pct, valor_entrada,
        status, data_pagamento, valor, vencimento)
      VALUES (
        v_acordo.nome_cliente, v_acordo.nr_cliente, v_acordo.instituicao, v_acordo.whatsapp, v_acordo.estado_uf,
        v_acordo.tipo, v_acordo.parcelas, v_novo.id, v_acordo.empresa_id, v_novo.setor_id, v_hoje,
        CASE WHEN v_acordo.acordo_grupo_id IS NOT NULL THEN gen_random_uuid() END,
        v_acordo.numero_parcela, 'direto', v_acordo.operador_id,
        v_ant_nome, v_acordo.valor_total, COALESCE(v_acordo.usou_quarenta_pct, FALSE), v_acordo.valor_entrada,
        v_acordo.status, v_acordo.data_pagamento, v_acordo.valor, v_acordo.vencimento)
      RETURNING id INTO v_direto_id;
    EXCEPTION WHEN OTHERS THEN
      -- O bloco desfaz o UPDATE junto: nada fica pela metade.
      RETURN jsonb_build_object('ok', false, 'erro', 'par_recusado', 'detalhe', SQLERRM);
    END;

    UPDATE public.analitico_recebimentos
       SET status_tabulacao = 'tabulado', acordo_id = v_direto_id
     WHERE empresa_id  = v_linha.empresa_id
       AND codigo      = v_linha.codigo
       AND operador_id = v_novo.id;

    PERFORM public.fn_log_registrar(
      p_acao        => 'acordo_par_pelo_analitico',
      p_categoria   => 'acordo',
      p_severidade  => 'info',
      p_descricao   => format('Analítico — %s %s: %s entrou como DIRETO e %s ficou como EXTRA (o relatório mostra o recebimento Extra)',
                              v_rotulo, v_codigo, v_novo.nome, COALESCE(v_ant_nome, 'outro operador')),
      p_empresa_id  => v_linha.empresa_id,
      p_tabela      => 'acordos',
      p_registro_id => v_direto_id::TEXT,
      p_alvo_tipo   => 'acordo',
      p_alvo_rotulo => v_rotulo || ' ' || v_codigo,
      p_antes       => jsonb_build_object('tipo_vinculo', 'direto', 'operador_id', v_acordo.operador_id),
      p_depois      => jsonb_build_object('tipo_vinculo', 'extra', 'vinculo_operador_id', v_novo.id),
      p_campos      => ARRAY['tipo_vinculo', 'vinculo_operador_id'],
      p_detalhes    => jsonb_build_object(
                         'origem',             'analitico_par_pelo_relatorio',
                         'base_autorizacao',   v_base,
                         'linha_id',           v_linha.id,
                         'codigo',             v_codigo,
                         'extra_acordo_id',    v_acordo.id,
                         'extra_operador_id',  v_acordo.operador_id,
                         'extra_operador_nome', v_ant_nome,
                         'direto_acordo_id',   v_direto_id,
                         'direto_operador_id', v_novo.id,
                         'direto_operador_nome', v_novo.nome)
    );

    PERFORM public.fn_analitico_avisar_no_chat(
      'virou_extra', v_linha.empresa_id, v_acordo.operador_id, v_novo.id,
      jsonb_build_object(
        'rotulo',         v_rotulo,
        'chave',          v_codigo,
        'cliente',        v_acordo.nome_cliente,
        'valor_recebido', v_linha.valor_recebido,
        'acordos',        jsonb_build_object(v_acordo.operador_id::text, v_acordo.id,
                                             v_novo.id::text,            v_direto_id)));

    -- Os líderes dos dois lados. Quem clicou não se notifica.
    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT DISTINCT ON (d.usuario_id)
           d.usuario_id, v_linha.empresa_id,
           'Par Direto/Extra pelo Analítico — ' || lower(v_rotulo) || ' ' || v_codigo,
           format('O relatório mostra %s como Direto e %s como Extra do %s %s. '
                  'O acordo de %s virou Extra e %s entrou como Direto.',
                  v_novo.nome, COALESCE(v_ant_nome, 'outro operador'), lower(v_rotulo), v_codigo,
                  COALESCE(v_ant_nome, 'outro operador'), v_novo.nome),
           FALSE, '/analitico'
      FROM (VALUES (1, v_novo.lider_id), (2, v_ant_lider)) AS d(ordem, usuario_id)
     WHERE d.usuario_id IS NOT NULL
       AND d.usuario_id <> v_uid
     ORDER BY d.usuario_id, d.ordem;

    RETURN jsonb_build_object(
      'ok',                     true,
      'resultado',              'par_formado',
      'acordo_id',              v_direto_id,
      'extra_acordo_id',        v_acordo.id,
      'operador_anterior_id',   v_acordo.operador_id,
      'operador_anterior_nome', v_ant_nome,
      'operador_novo_id',       v_novo.id,
      'operador_novo_nome',     v_novo.nome);
  END IF;

  -- ── Divergente de verdade: o acordo troca de dono ─────────────────────────
  -- `trg_sync_nr_registros` move a titularidade do NR neste UPDATE.
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

  -- Quem perdeu o acordo: card na conversa com o novo dono (ou notificação,
  -- sem chat). O acordo agora é só do novo dono — é o que o card abre.
  PERFORM public.fn_analitico_avisar_no_chat(
    'transferido', v_linha.empresa_id, v_acordo.operador_id, v_novo.id,
    jsonb_build_object(
      'rotulo',         v_rotulo,
      'chave',          v_codigo,
      'cliente',        v_acordo.nome_cliente,
      'valor_recebido', v_linha.valor_recebido,
      'acordos',        jsonb_build_object(v_novo.id::text, v_acordo.id)));

  -- Os líderes dos dois lados. Quem clicou não se notifica; líder repetido
  -- (mesmo líder dos dois lados) recebe uma só.
  INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
  SELECT DISTINCT ON (d.usuario_id)
         d.usuario_id, v_linha.empresa_id,
         'Transferência pelo Analítico — cód. ' || v_codigo,
         format('O acordo do código %s saiu de %s e passou para %s (Divergente no Analítico). '
                'Confira o impacto na comissão.',
                v_codigo, COALESCE(v_ant_nome, 'outro operador'), v_novo.nome),
         FALSE, '/analitico'
    FROM (VALUES (1, v_novo.lider_id), (2, v_ant_lider)) AS d(ordem, usuario_id)
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

COMMIT;
