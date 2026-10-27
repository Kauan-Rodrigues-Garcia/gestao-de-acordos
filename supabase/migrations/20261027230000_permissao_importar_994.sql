-- ============================================================================
-- Permissão própria para o botão do 994 (Retenção do Jornada)
-- ============================================================================
--
-- O botão «Importar 994 · Retenção» (20261027210000) aparecia para quem tinha
-- `importar_analitico` — a liderança de TODOS os setores, para um relatório de
-- um setor só. Agora ele tem chave própria, `importar_analitico_retencao`, e o
-- painel de permissões decide quem o vê.
--
-- Nasce DESLIGADA em todo cargo. Administrador e super_admin veem sempre (o
-- atalho do acesso total). Para a liderança do Jornada, liga-se no painel —
-- por cargo, por setor ou por pessoa.
--
-- A chave só mostra o botão: gravar no Analítico continua exigindo
-- `importar_analitico` (policy `analitico_insert`). O catálogo declara a
-- dependência, e o painel avisa.
--
-- Só BookPlay: o Jornada é de lá, e é lá que o 59 roda.
--
-- Não mexe em linha de dado nenhuma — só no catálogo e nos mapas de cargo.
-- Reexecutável.
-- ============================================================================

BEGIN;

-- ── 1. O catálogo ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_importar_994_20261027()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_importar_994_20261027;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_importar_994_20261027() IS
  'Retrato do catalogo antes de importar_analitico_retencao (27/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_importar_994_20261027()
  UNION ALL
  SELECT * FROM (VALUES
    -- Nasce desligada: liga-se para quem importa a Retenção.
    ('importar_analitico_retencao', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261027230000 soma importar_analitico_retencao.';

-- ── 2. Os mapas de cargo da BookPlay ganham a chave, desligada ──────────────
--
-- Chave ausente já é «não» (useCargoPermissoes, passo 4), mas o painel lê o
-- mapa: todo cargo tem o catálogo inteiro (20260815154058).

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object('importar_analitico_retencao', false)
  FROM public.empresas e
 WHERE e.id = cp.empresa_id
   AND e.slug = 'bookplay'
   AND NOT (cp.permissoes ? 'importar_analitico_retencao');

-- ── 3. Verificação ──────────────────────────────────────────────────────────

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM public.fn_permissoes_catalogo() c
       WHERE c.chave = 'importar_analitico_retencao') <> 1 THEN
    RAISE EXCEPTION 'A chave importar_analitico_retencao nao entrou no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'importar_analitico') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
     WHERE e.slug = 'bookplay'
       AND NOT (cp.permissoes ? 'importar_analitico_retencao')
  ) THEN
    RAISE EXCEPTION 'Algum cargo da BookPlay ficou sem a chave nova.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261027230000', 'permissao_importar_994', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
