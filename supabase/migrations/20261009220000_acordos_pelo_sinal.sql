-- ============================================================================
-- Tempo real de `acordos`: Postgres Changes → aviso com os ids (09/10/2026)
-- ============================================================================
--
-- Continuação de 20261009201000 (quedas por falta de memória). `acordos` era a
-- maior assinatura de Postgres Changes: uma por aba aberta (~215), e cada
-- mudança conferida contra a RLS de cada uma.
--
-- POR QUE NÃO MANDAR A LINHA: a leitura de acordos é por pessoa (o operador vê
-- os seus, o líder a equipe, o setor, a gerência a empresa — `acordos_select`,
-- com clones e setor alternativo). Um tópico por empresa com a linha dentro
-- entregaria nome do cliente, valor e NR de colegas a quem não pode vê-los.
--
-- Então o banco avisa SÓ QUAIS acordos mudaram (ids), sem conteúdo:
--
--   `acordos-op:<operador_id>`  o dono do acordo (policy: tópico = auth.uid())
--   `acordos:<empresa_id>`      quem tem escopo de acordos além de «os meus»
--                               (`fn_user_escopo_acordos() >= 1`) ou é
--                               super_admin
--
-- A tela relê esses ids com a RLS de sempre — quem não pode ver um acordo não
-- recebe a linha. Para quem ouve a empresa, o id de um acordo fora do alcance
-- chega e a releitura volta vazia; ninguém recebe conteúdo que não poderia ler.
--
-- Um aviso por COMANDO (não por linha). Acima de 200 ids, só «recarregar».
-- Volume medido: ~1.500 mudanças em 29 h.
--
-- Ordem do deploy: migration ANTES do código. Aba antiga deixa de receber
-- acordos ao vivo até recarregar; a próxima leitura traz tudo.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. O aviso ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_realtime_acordos_avisar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_linhas jsonb;
  r        record;
  c_teto   CONSTANT integer := 200;
BEGIN
  IF tg_op = 'INSERT' THEN
    SELECT jsonb_agg(jsonb_build_object('id', n.id, 'e', n.empresa_id, 'o', n.operador_id))
      INTO v_linhas FROM novas n;
  ELSIF tg_op = 'UPDATE' THEN
    -- Antes e depois: acordo transferido avisa o dono antigo e o novo.
    SELECT jsonb_agg(x) INTO v_linhas FROM (
      SELECT jsonb_build_object('id', n.id, 'e', n.empresa_id, 'o', n.operador_id) AS x FROM novas n
      UNION ALL
      SELECT jsonb_build_object('id', a.id, 'e', a.empresa_id, 'o', a.operador_id) FROM antigas a
    ) t;
  ELSE
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'e', a.empresa_id, 'o', a.operador_id))
      INTO v_linhas FROM antigas a;
  END IF;

  IF v_linhas IS NULL THEN
    RETURN NULL;
  END IF;

  -- Por empresa.
  FOR r IN
    SELECT l ->> 'e' AS alvo, jsonb_agg(DISTINCT l -> 'id') AS ids
      FROM jsonb_array_elements(v_linhas) l
     WHERE l ->> 'e' IS NOT NULL
     GROUP BY 1
  LOOP
    PERFORM realtime.send(
      CASE WHEN jsonb_array_length(r.ids) > c_teto
           THEN jsonb_build_object('operacao', tg_op, 'recarregar', true)
           ELSE jsonb_build_object('operacao', tg_op, 'ids', r.ids) END,
      'mudou', 'acordos:' || r.alvo, true);
  END LOOP;

  -- Por dono.
  FOR r IN
    SELECT l ->> 'o' AS alvo, jsonb_agg(DISTINCT l -> 'id') AS ids
      FROM jsonb_array_elements(v_linhas) l
     WHERE l ->> 'o' IS NOT NULL
     GROUP BY 1
  LOOP
    PERFORM realtime.send(
      CASE WHEN jsonb_array_length(r.ids) > c_teto
           THEN jsonb_build_object('operacao', tg_op, 'recarregar', true)
           ELSE jsonb_build_object('operacao', tg_op, 'ids', r.ids) END,
      'mudou', 'acordos-op:' || r.alvo, true);
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_realtime_acordos_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_realtime_acordos_ins ON public.acordos;
DROP TRIGGER IF EXISTS trg_realtime_acordos_upd ON public.acordos;
DROP TRIGGER IF EXISTS trg_realtime_acordos_del ON public.acordos;

CREATE TRIGGER trg_realtime_acordos_ins AFTER INSERT ON public.acordos
  REFERENCING NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_acordos_avisar();
CREATE TRIGGER trg_realtime_acordos_upd AFTER UPDATE ON public.acordos
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_acordos_avisar();
CREATE TRIGGER trg_realtime_acordos_del AFTER DELETE ON public.acordos
  REFERENCING OLD TABLE AS antigas FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_acordos_avisar();

-- ── 2. Quem pode ouvir ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS acordos_sinal_dono ON realtime.messages;
CREATE POLICY acordos_sinal_dono ON realtime.messages
  FOR SELECT TO authenticated
  USING (((extension = 'broadcast'::text)
    AND (split_part((SELECT realtime.topic()), ':'::text, 1) = 'acordos-op'::text)
    AND (SELECT public.fn_realtime_posso_ouvir_usuario((SELECT realtime.topic())))));

DROP POLICY IF EXISTS acordos_sinal_empresa ON realtime.messages;
CREATE POLICY acordos_sinal_empresa ON realtime.messages
  FOR SELECT TO authenticated
  USING (((extension = 'broadcast'::text)
    AND (split_part((SELECT realtime.topic()), ':'::text, 1) = 'acordos'::text)
    AND (SELECT public.fn_realtime_posso_ouvir_empresa((SELECT realtime.topic())))
    AND (((SELECT public.fn_user_escopo_acordos()) >= 1) OR (SELECT public.fn_user_is_super_admin()))));

-- ── 3. Fora da publicação ───────────────────────────────────────────────────

DO $publicacao$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'acordos') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.acordos;
  END IF;
END;
$publicacao$;

-- ── 4. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM pg_trigger
       WHERE NOT tgisinternal AND tgrelid = 'public.acordos'::regclass AND tgname LIKE 'trg_realtime_acordos_%') <> 3 THEN
    RAISE EXCEPTION 'Faltou gatilho do aviso de acordos (esperados 3).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'acordos') THEN
    RAISE EXCEPTION 'acordos ainda está na publicação.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages'
        AND policyname IN ('acordos_sinal_dono', 'acordos_sinal_empresa')) <> 2 THEN
    RAISE EXCEPTION 'Faltou policy de quem ouve os acordos.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261009220000', 'acordos_pelo_sinal', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
