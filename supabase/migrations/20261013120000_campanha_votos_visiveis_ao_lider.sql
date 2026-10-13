-- ============================================================================
-- Campanha Fácil: o líder vê QUEM votou, não só quantos — 13/10/2026
-- ============================================================================
--
-- Pedido do Cleber: «na lista do líder onde ele acompanha cada usuário, no
-- mesmo card dos operadores aparece um joinha para cima em quem votou positivo
-- naquela campanha e um joinha negativo em quem votou negativamente.»
--
-- A 20261009150000 decidiu o contrário («o líder vê só os números»): a policy
-- deixava cada operador ler só o próprio voto. Esta acrescenta uma segunda
-- policy de leitura — policies do mesmo comando somam (OR) — para quem lançou
-- a campanha ler os votos dela. O operador continua sem ver o voto dos
-- colegas, e a escrita segue só pela `fn_campanha_facil_avaliar`.
--
-- O subselect em `campanha_facil_lotes` passa pela RLS dela
-- (`criado_por = auth.uid()`), a mesma regra que já decide quem vê a campanha.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

DROP POLICY IF EXISTS cf_avaliacoes_select_autor ON public.campanha_facil_avaliacoes;
CREATE POLICY cf_avaliacoes_select_autor ON public.campanha_facil_avaliacoes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campanha_facil_lotes l
     WHERE l.id = campanha_facil_avaliacoes.lote_id
       AND l.criado_por = (SELECT auth.uid())
  ));

COMMENT ON TABLE public.campanha_facil_avaliacoes IS
  'Voto do operador sobre o retorno da campanha (bom = joinha). Lê o próprio operador e quem lançou a campanha. Escrita só por fn_campanha_facil_avaliar. Ver 20261009150000 e 20261013120000.';

-- ── Verificação ─────────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.campanha_facil_avaliacoes', 'DELETE') THEN
    RAISE EXCEPTION 'campanha_facil_avaliacoes aceita escrita direta.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'campanha_facil_avaliacoes' AND policyname = 'cf_avaliacoes_select'
  ) THEN
    RAISE EXCEPTION 'A policy do próprio voto (cf_avaliacoes_select) sumiu.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261013120000', 'campanha_votos_visiveis_ao_lider', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
