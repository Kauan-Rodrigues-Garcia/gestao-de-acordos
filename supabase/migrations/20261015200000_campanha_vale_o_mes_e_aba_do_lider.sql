-- ============================================================================
-- Campanha Fácil: a campanha vale até o fim do mês, e o líder ganha a aba
-- ============================================================================
--
-- ## Por que
--
-- Pedido do Cleber, 15/10/2026:
--
--   • "As campanhas ficam disponíveis por dois dias. Pode tirar essa trava e
--     deixar disponível durante o mês. Só tranca quando virar o mês."
--   • A campanha já pode ir para líderes (eles encaminham junto com os
--     operadores), mas a aba Campanhas de WhatsApp não estava liberada para o
--     cargo líder — a campanha chegava e ele não tinha onde abrir.
--
-- ## O que muda
--
-- 1. `fn_cf_fim_do_mes()` — o primeiro instante do mês seguinte, no horário de
--    Brasília. É a nova validade de toda campanha lançada ou relançada.
--
-- 2. `fn_campanha_facil_lote_ativar` — lançar/relançar grava a validade como o
--    fim do mês (era agora + 2 dias). O resto da função é a mesma da
--    20261007190000.
--
-- 3. `fn_campanha_facil_envios_faxina` — encerra a campanha lançada quando a
--    validade passa, ativa ou desativada. Sai a regra "desativada há mais de 2
--    dias encerra": desativada fica no histórico do líder, pronta para
--    relançar, até virar o mês. A nunca lançada continua saindo depois de 1 dia.
--
-- 4. As campanhas lançadas ESTE MÊS que ainda não encerraram passam a valer
--    até o fim do mês (campanha, envios e contatos). As de meses anteriores
--    já encerraram e ficam como estão.
--
-- 5. `ver_campanhas_whatsapp` ligada para o cargo `lider` da BookPlay — o
--    mesmo que ligar no painel de permissões. Só o líder: é o único cargo além
--    do operador que a Campanha Fácil oferece como destinatário.
--
-- Reaplicável.

BEGIN;

-- ── 1. Fim do mês ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_cf_fim_do_mes(p_agora TIMESTAMPTZ DEFAULT now())
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  -- Meia-noite do dia 1 do mês seguinte, em Brasília: a campanha some quando o
  -- mês vira para quem está aqui, não às 21h do último dia (meia-noite UTC).
  SELECT (date_trunc('month', p_agora AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 month')
         AT TIME ZONE 'America/Sao_Paulo';
$function$;

COMMENT ON FUNCTION public.fn_cf_fim_do_mes(TIMESTAMPTZ) IS
  'Validade da campanha da Campanha Fácil: o começo do mês seguinte, em Brasília. Ver 20261015200000.';

REVOKE ALL ON FUNCTION public.fn_cf_fim_do_mes(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cf_fim_do_mes(TIMESTAMPTZ) TO authenticated, service_role;

-- ── 2. Lançar / relançar vale até o fim do mês ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_lote_ativar(p_lote UUID, p_ativa BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  l          public.campanha_facil_lotes%ROWTYPE;
  v_expira   TIMESTAMPTZ := public.fn_cf_fim_do_mes();
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

-- ── 3. A faxina encerra quando o mês vira ────────────────────────────────────

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
         placar = COALESCE((
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
                WHERE e.lote_id = l.id
                GROUP BY e.operador_id
             ) x
         ), '[]'::JSONB)
   WHERE l.encerrada_em IS NULL
     AND (
       -- Lançada (ativa ou desativada): encerra quando a validade — o fim do
       -- mês em que foi lançada — passa.
       (l.lancada_em IS NOT NULL AND l.expira_em <= now())
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
  'Encerra campanhas cujo mês virou (placar congelado em campanha_facil_lotes) e apaga envios e contatos. '
  'Agendada de hora em hora. Ver 20260929100000, 20261007190000 e 20261015200000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_envios_faxina() FROM PUBLIC, anon, authenticated;

-- ── 4. As campanhas deste mês que estão abertas vão até o fim do mês ─────────

UPDATE public.campanha_facil_lotes l
   SET expira_em = public.fn_cf_fim_do_mes()
 WHERE l.encerrada_em IS NULL
   AND l.lancada_em IS NOT NULL
   AND l.lancada_em >= public.fn_cf_fim_do_mes() - INTERVAL '1 month'
   AND l.expira_em < public.fn_cf_fim_do_mes();

UPDATE public.campanha_facil_envios e
   SET expira_em = l.expira_em
  FROM public.campanha_facil_lotes l
 WHERE l.id = e.lote_id
   AND l.encerrada_em IS NULL
   AND e.expira_em < l.expira_em;

UPDATE public.campanha_facil_contatos c
   SET expira_em = e.expira_em
  FROM public.campanha_facil_envios e
 WHERE e.id = c.envio_id
   AND c.expira_em < e.expira_em;

-- ── 5. O líder abre a aba Campanhas de WhatsApp ──────────────────────────────

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object('ver_campanhas_whatsapp', true)
 WHERE cp.empresa_id IN (SELECT e.id FROM public.empresas e WHERE e.slug = 'bookplay')
   AND cp.cargo = 'lider'
   AND (cp.permissoes ->> 'ver_campanhas_whatsapp')::BOOLEAN IS DISTINCT FROM TRUE;

COMMIT;
