-- ============================================================================
-- Campanha Fácil: a incompleta vai para o histórico em 3 dias; a completa, só
-- quando o líder finaliza
-- ============================================================================
--
-- ## Por que
--
-- Pedido de 20/10/2026:
--
--   • "As campanhas que não foram enviadas por completo vão para o histórico
--     após 3 dias."
--   • "Campanhas que já foram enviadas por completo não vão mais de forma
--     automática para o histórico."
--   • "Em vez disso terá um botão para finalizar a campanha. Ele só aparece
--     depois de encaminhar todas as mensagens, ou caso as que faltaram estejam
--     marcadas «não deu»."
--
-- Até aqui a campanha valia até o mês virar (20261015200000) e a faxina
-- encerrava todas ao mesmo tempo, completas ou não.
--
-- ## O que muda
--
-- 1. `fn_cf_placar_do_lote(lote)` — o placar por operador que a faxina
--    congelava, agora numa função só: a faxina e o «Finalizar» usam a mesma.
--
-- 2. `fn_campanha_facil_lote_ativar` — lançar e relançar valem 3 dias (era o
--    fim do mês). O resto da função é a da 20261015200000.
--
-- 3. `fn_campanha_facil_envios_faxina` — encerra a campanha lançada cuja
--    validade passou SÓ SE ainda tem mensagem pendente (ou não tem mensagem
--    nenhuma). A completa — toda mensagem `enviado` ou `nao_enviado` — fica
--    aberta até o líder finalizar. A nunca lançada continua saindo em 1 dia.
--
-- 4. `fn_campanha_facil_lote_finalizar(lote)` — o botão «Finalizar». Só quem
--    lançou, só campanha completa. Congela o placar, encerra, avisa a aba dos
--    operadores e apaga envios e contatos (o que a faxina faria na hora
--    seguinte).
--
-- 5. As campanhas abertas hoje passam a valer no máximo 3 dias a partir de
--    agora — ninguém perde uma campanha incompleta sem aviso no meio do dia.
--
-- `fn_cf_fim_do_mes` fica no banco, sem uso.
--
-- Reaplicável.

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. O placar da campanha ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cf_placar_do_lote(p_lote UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'operador_id', x.operador_id, 'nome', x.nome, 'total', x.total,
             'enviados', x.enviados, 'nao_enviados', x.nao_enviados) ORDER BY x.nome)
      FROM (
        SELECT e.operador_id, max(e.operador_nome) AS nome,
               count(c.id)::INTEGER AS total,
               count(c.id) FILTER (WHERE c.status = 'enviado')::INTEGER AS enviados,
               count(c.id) FILTER (WHERE c.status = 'nao_enviado')::INTEGER AS nao_enviados
          FROM public.campanha_facil_envios e
          LEFT JOIN public.campanha_facil_contatos c ON c.envio_id = e.id
         WHERE e.lote_id = p_lote
         GROUP BY e.operador_id
      ) x
  ), '[]'::JSONB);
$function$;

COMMENT ON FUNCTION public.fn_cf_placar_do_lote(UUID) IS
  'Placar por operador da campanha (total, enviados, não enviados), congelado ao encerrar. Ver 20261020120000.';

REVOKE ALL ON FUNCTION public.fn_cf_placar_do_lote(UUID) FROM PUBLIC, anon, authenticated;

-- Completa: tem mensagem e nenhuma está pendente.
CREATE OR REPLACE FUNCTION public.fn_cf_lote_completo(p_lote UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM public.campanha_facil_contatos c
             JOIN public.campanha_facil_envios e ON e.id = c.envio_id
            WHERE e.lote_id = p_lote)
     AND NOT EXISTS (
           SELECT 1 FROM public.campanha_facil_contatos c
             JOIN public.campanha_facil_envios e ON e.id = c.envio_id
            WHERE e.lote_id = p_lote AND c.status = 'pendente');
$function$;

COMMENT ON FUNCTION public.fn_cf_lote_completo(UUID) IS
  'A campanha tem mensagens e todas estão enviadas ou marcadas «não deu». Ver 20261020120000.';

REVOKE ALL ON FUNCTION public.fn_cf_lote_completo(UUID) FROM PUBLIC, anon, authenticated;

-- ── 2. Lançar / relançar vale 3 dias ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_lote_ativar(p_lote UUID, p_ativa BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  l          public.campanha_facil_lotes%ROWTYPE;
  v_expira   TIMESTAMPTZ := now() + INTERVAL '3 days';
  v_primeira BOOLEAN;
  v_envios   UUID[];
BEGIN
  SELECT * INTO l FROM public.campanha_facil_lotes
   WHERE id = p_lote AND criado_por = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF l.encerrada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta campanha já encerrou e não pode ser reativada.';
  END IF;

  IF p_ativa THEN
    IF l.ativa THEN RETURN; END IF;
    SELECT array_agg(e.id) INTO v_envios FROM public.campanha_facil_envios e WHERE e.lote_id = l.id;
    IF v_envios IS NULL THEN
      RAISE EXCEPTION 'A campanha não tem mensagens.';
    END IF;
    v_primeira := l.lancada_em IS NULL;

    UPDATE public.campanha_facil_lotes
       SET ativa = TRUE, desativada_em = NULL, expira_em = v_expira,
           lancada_em = COALESCE(lancada_em, now()),
           relancada_em = CASE WHEN v_primeira THEN NULL ELSE now() END
     WHERE id = l.id;
    UPDATE public.campanha_facil_envios SET ativa = TRUE, expira_em = v_expira WHERE lote_id = l.id;
    UPDATE public.campanha_facil_contatos c SET ativa = TRUE, expira_em = v_expira
      FROM public.campanha_facil_envios e
     WHERE e.id = c.envio_id AND e.lote_id = l.id;

    IF v_primeira THEN
      PERFORM public.fn_cf_avisar(v_envios, 'Campanha de WhatsApp pronta', 'para você enviar.');
    ELSE
      PERFORM public.fn_cf_avisar(v_envios, 'Campanha de WhatsApp liberada de novo',
                                  'para você enviar. O líder atualizou a campanha.');
    END IF;
    PERFORM public.fn_cf_sinalizar(l.id, 'ativada');
  ELSE
    IF NOT l.ativa THEN RETURN; END IF;
    UPDATE public.campanha_facil_lotes SET ativa = FALSE, desativada_em = now() WHERE id = l.id;
    UPDATE public.campanha_facil_envios SET ativa = FALSE WHERE lote_id = l.id;
    UPDATE public.campanha_facil_contatos c SET ativa = FALSE
      FROM public.campanha_facil_envios e
     WHERE e.id = c.envio_id AND e.lote_id = l.id;
    PERFORM public.fn_cf_sinalizar(l.id, 'desativada');
  END IF;
END;
$function$;

-- ── 3. A faxina encerra só a incompleta ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_envios_faxina()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_n INTEGER;
BEGIN
  UPDATE public.campanha_facil_lotes l
     SET encerrada_em = now(),
         ativa = FALSE,
         placar = public.fn_cf_placar_do_lote(l.id)
   WHERE l.encerrada_em IS NULL
     AND (
       -- Lançada (ativa ou desativada): encerra quando os 3 dias passam e
       -- ainda falta mensagem. A completa espera o líder finalizar.
       (l.lancada_em IS NOT NULL AND l.expira_em <= now() AND NOT public.fn_cf_lote_completo(l.id))
       -- Nunca lançada (liberação que falhou no meio): sai depois de 1 dia.
       OR (l.lancada_em IS NULL AND l.criado_em <= now() - INTERVAL '1 day')
     );

  DELETE FROM public.campanha_facil_lotes WHERE lancada_em IS NULL AND encerrada_em IS NOT NULL;

  WITH apagados AS (
    DELETE FROM public.campanha_facil_envios e
     USING public.campanha_facil_lotes l
     WHERE l.id = e.lote_id AND l.encerrada_em IS NOT NULL
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_n FROM apagados;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_envios_faxina() IS
  'Encerra campanhas incompletas com 3 dias vencidos (placar congelado em campanha_facil_lotes) e apaga envios e contatos. '
  'A completa espera o líder finalizar. Agendada de hora em hora. Ver 20260929100000, 20261007190000 e 20261020120000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_envios_faxina() FROM PUBLIC, anon, authenticated;

-- ── 4. Finalizar ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_lote_finalizar(p_lote UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  l public.campanha_facil_lotes%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.campanha_facil_lotes
   WHERE id = p_lote AND criado_por = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF l.encerrada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta campanha já está no histórico.';
  END IF;
  IF l.lancada_em IS NULL THEN
    RAISE EXCEPTION 'A campanha ainda não foi lançada.';
  END IF;
  IF NOT public.fn_cf_lote_completo(l.id) THEN
    RAISE EXCEPTION 'Ainda há mensagens pendentes. Finalize quando todas estiverem enviadas ou marcadas «não deu».';
  END IF;

  UPDATE public.campanha_facil_lotes
     SET encerrada_em = now(), ativa = FALSE, placar = public.fn_cf_placar_do_lote(l.id)
   WHERE id = l.id;

  -- Sinaliza antes de apagar: o sinal procura os operadores pelos envios.
  PERFORM public.fn_cf_sinalizar(l.id, 'finalizada');
  DELETE FROM public.campanha_facil_envios WHERE lote_id = l.id;
END;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_lote_finalizar(UUID) IS
  'Botão «Finalizar» da Campanha Fácil: manda a campanha completa para o histórico. Ver 20261020120000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_lote_finalizar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_lote_finalizar(UUID) TO authenticated;

-- ── 5. As abertas hoje valem no máximo 3 dias a partir de agora ──────────────

UPDATE public.campanha_facil_lotes l
   SET expira_em = now() + INTERVAL '3 days'
 WHERE l.encerrada_em IS NULL
   AND l.lancada_em IS NOT NULL
   AND l.expira_em > now() + INTERVAL '3 days';

UPDATE public.campanha_facil_envios e
   SET expira_em = l.expira_em
  FROM public.campanha_facil_lotes l
 WHERE l.id = e.lote_id
   AND l.encerrada_em IS NULL
   AND e.expira_em > l.expira_em;

UPDATE public.campanha_facil_contatos c
   SET expira_em = e.expira_em
  FROM public.campanha_facil_envios e
 WHERE e.id = c.envio_id
   AND c.expira_em > e.expira_em;

COMMIT;
