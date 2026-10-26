-- ============================================================================
-- Campanha Fácil: «este cliente já recebeu mensagem hoje»
-- ============================================================================
--
-- ## Por que
--
-- Pedido de 26/10/2026. Setores que cobram a mesma carteira mandam a mesma
-- campanha (os «não pagos», logo cedo) para o mesmo cliente: ele recebe três
-- mensagens no mesmo horário, fica bravo, denuncia, e o número é banido.
--
-- Decisões do Cleber:
--   • A chave é o Nr.Documento (`contrato`), e também os números de telefone da
--     lista — o cliente com dois contratos tem dois Nr.Documento, e o número
--     cobre o que o contrato não junta.
--   • Só o que sai pela Campanha Fácil. Não mostra setor nem operador: só o
--     número que recebeu e o horário. O número aparece inteiro.
--   • «Hoje» = desde 00:00 (horário de Brasília).
--   • O operador vê na mensagem; o líder vê um resumo ao montar a campanha e
--     pode mandar esses clientes para o fim da fila ou tirá-los.
--
-- ## O que muda
--
-- 1. `campanha_facil_disparos`: uma linha por clique em Enviar / Fone 2 /
--    Copiar mensagem, com o número usado (NULL = copiada, número não
--    informado). Tabela própria, sem FK para o contato, de propósito: o
--    «Finalizar» e a exclusão apagam os contatos na hora, e a mensagem que já
--    saiu continua tendo saído. Guarda 2 dias; job `campanha-facil-disparos-faxina`.
--    RLS ligada e sem policy: só as funções abaixo leem e gravam.
--
-- 2. `fn_campanha_facil_registrar_disparo(contato, numero)`: o operador
--    registra o envio de uma mensagem DELE. O número tem que ser o WhatsApp ou o
--    Fone 2 daquela mensagem (ou NULL). Duplo clique em 10 s não conta duas vezes.
--
-- 3. `fn_campanha_facil_ja_recebeu(itens)`: para cada item
--    {k: chave, e: empresa, c: Nr.Documento, n: [números]}, devolve os envios de
--    hoje com o mesmo Nr.Documento (na mesma empresa — o Nr.Documento é do ERP)
--    ou para um dos números (em qualquer empresa). Quando `k` é o id de um
--    contato, os envios DELE ficam de fora. Devolve só número e horário.
--
-- 4. O que já foi enviado hoje antes desta migration entra como envio de
--    número não informado (a tabela de contatos não guardava o número).
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Os envios ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campanha_facil_disparos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Sem FK: o contato é apagado no «Finalizar», o envio fica.
  contato_id  UUID,
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- O Nr.Documento, sem espaços nas pontas.
  contrato    TEXT,
  -- Só dígitos, com o 55 (como `campanha_facil_contatos.whatsapp`). NULL = copiada.
  numero      TEXT,
  enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campanha_facil_disparos IS
  'Cada mensagem da Campanha Fácil que saiu (Enviar, Fone 2 ou Copiar), com o número usado. '
  'Alimenta o aviso «já recebeu mensagem hoje». Guarda 2 dias. Ver 20261026190000.';

CREATE INDEX IF NOT EXISTS idx_cf_disparos_contrato
  ON public.campanha_facil_disparos (empresa_id, contrato, enviado_em) WHERE contrato IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cf_disparos_numero
  ON public.campanha_facil_disparos (numero, enviado_em) WHERE numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cf_disparos_contato
  ON public.campanha_facil_disparos (contato_id, enviado_em);
CREATE INDEX IF NOT EXISTS idx_cf_disparos_quando
  ON public.campanha_facil_disparos (enviado_em);

ALTER TABLE public.campanha_facil_disparos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campanha_facil_disparos FROM PUBLIC, anon, authenticated;

-- ── 2. Registrar um envio ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_registrar_disparo(p_contato UUID, p_numero TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_num TEXT := NULLIF(btrim(p_numero), '');
  c RECORD;
BEGIN
  -- Os mesmos critérios da policy de UPDATE do contato: é dele, ativa, no prazo.
  SELECT x.empresa_id, x.contrato, x.whatsapp, x.whatsapp2 INTO c
    FROM public.campanha_facil_contatos x
   WHERE x.id = p_contato
     AND x.operador_id = (SELECT auth.uid())
     AND x.ativa
     AND x.expira_em > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensagem não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF v_num IS NOT NULL AND v_num IS DISTINCT FROM c.whatsapp AND v_num IS DISTINCT FROM c.whatsapp2 THEN
    RAISE EXCEPTION 'O número não é o WhatsApp nem o Fone 2 desta mensagem.' USING ERRCODE = '22023';
  END IF;

  -- Duplo clique não é mensagem nova.
  IF EXISTS (
    SELECT 1 FROM public.campanha_facil_disparos d
     WHERE d.contato_id = p_contato
       AND d.numero IS NOT DISTINCT FROM v_num
       AND d.enviado_em > now() - INTERVAL '10 seconds'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.campanha_facil_disparos (contato_id, empresa_id, contrato, numero)
  VALUES (p_contato, c.empresa_id, NULLIF(btrim(c.contrato), ''), v_num);
END;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_registrar_disparo(UUID, TEXT) IS
  'O operador registra que uma mensagem dele saiu, e por qual número (NULL = copiada). Ver 20261026190000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_registrar_disparo(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_registrar_disparo(UUID, TEXT) TO authenticated;

-- ── 3. Quem já recebeu hoje ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_ja_recebeu(p_itens JSONB)
RETURNS TABLE (chave TEXT, numero TEXT, enviado_em TIMESTAMPTZ, mesmo_contrato BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH desde AS (
    SELECT date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' AS t
  ),
  i AS (
    SELECT x->>'k' AS k,
           NULLIF(x->>'e', '')::UUID AS e,
           NULLIF(btrim(x->>'c'), '') AS c,
           ARRAY(
             SELECT DISTINCT n FROM jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(x->'n') = 'array' THEN x->'n' ELSE '[]'::JSONB END
             ) AS n
              WHERE n <> ''
           ) AS n
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_itens) = 'array' THEN p_itens ELSE '[]'::JSONB END
           ) AS x
     -- Só quem está logado; e um teto para a chamada não virar varredura.
     WHERE (SELECT auth.uid()) IS NOT NULL
       AND jsonb_array_length(CASE WHEN jsonb_typeof(p_itens) = 'array' THEN p_itens ELSE '[]'::JSONB END) <= 5000
  ),
  achados AS (
    -- Mesmo Nr.Documento, na mesma empresa.
    SELECT i.k, d.id, d.numero, d.enviado_em, TRUE AS por_contrato
      FROM i
      JOIN public.campanha_facil_disparos d
        ON d.empresa_id = i.e AND d.contrato = i.c AND d.enviado_em >= (SELECT t FROM desde)
     WHERE d.contato_id::TEXT IS DISTINCT FROM i.k
    UNION ALL
    -- Mesmo número, de qualquer contrato e empresa.
    SELECT i.k, d.id, d.numero, d.enviado_em, FALSE
      FROM i
      CROSS JOIN LATERAL unnest(i.n) AS u(num)
      JOIN public.campanha_facil_disparos d
        ON d.numero = u.num AND d.enviado_em >= (SELECT t FROM desde)
     WHERE d.contato_id::TEXT IS DISTINCT FROM i.k
  )
  SELECT DISTINCT ON (a.k, a.id) a.k, a.numero, a.enviado_em, a.por_contrato
    FROM achados a
   ORDER BY a.k, a.id, a.por_contrato DESC;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_ja_recebeu(JSONB) IS
  'Envios de hoje (desde 00:00 de Brasília) pelo mesmo Nr.Documento ou para os mesmos números. '
  'Só número e horário — sem setor nem operador. Itens: [{k, e, c, n}], até 5000. Ver 20261026190000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_ja_recebeu(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_campanha_facil_ja_recebeu(JSONB) TO authenticated;

-- ── 4. O que já saiu hoje antes desta migration ──────────────────────────────

INSERT INTO public.campanha_facil_disparos (contato_id, empresa_id, contrato, numero, enviado_em)
SELECT c.id, c.empresa_id, NULLIF(btrim(c.contrato), ''), NULL, c.enviado_em
  FROM public.campanha_facil_contatos c
 WHERE c.status = 'enviado'
   AND c.enviado_em >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
   AND NOT EXISTS (SELECT 1 FROM public.campanha_facil_disparos d WHERE d.contato_id = c.id);

-- ── 5. Faxina ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_campanha_facil_disparos_faxina()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH apagados AS (
    DELETE FROM public.campanha_facil_disparos WHERE enviado_em < now() - INTERVAL '2 days' RETURNING 1
  )
  SELECT count(*)::INTEGER FROM apagados;
$function$;

COMMENT ON FUNCTION public.fn_campanha_facil_disparos_faxina() IS
  'Apaga os envios da Campanha Fácil com mais de 2 dias. Agendada 1x por dia. Ver 20261026190000.';

REVOKE ALL ON FUNCTION public.fn_campanha_facil_disparos_faxina() FROM PUBLIC, anon, authenticated;

DO $agenda$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campanha-facil-disparos-faxina') THEN
    PERFORM cron.unschedule('campanha-facil-disparos-faxina');
  END IF;
  -- 03:37 UTC (00:37 em Brasília), longe do robô do 59 (:07) e da faxina dos envios (:23).
  PERFORM cron.schedule(
    'campanha-facil-disparos-faxina',
    '37 3 * * *',
    'SELECT public.fn_campanha_facil_disparos_faxina();');
END
$agenda$;

COMMIT;
