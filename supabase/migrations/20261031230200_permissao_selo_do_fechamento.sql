-- ============================================================================
-- Permissão: Fechamento › Selo do mês (fechamento_sub_selo)
-- ============================================================================
--
-- Auditoria do fechamento de outubro (31/10/2026). O selo (`fechamento_mes`,
-- 20261029201000) guarda os números oficiais de cada mês fechado, mas nenhuma
-- tela o mostrava. Ele ganha uma aba interna no Fechamento, e toda aba nova
-- passa pelo catálogo (REGRAS-DE-NEGOCIO §2.4-b).
--
-- ## A chave
--
--   fechamento_sub_selo  ver a aba «Selo do mês» no Fechamento. Os números
--                        mostrados seguem o alcance da própria aba Fechamento
--                        (`fechamento_escopo_*`, §2.4-c).
--
-- ## O padrão
--
-- Cada cargo da BookPlay nasce com o MESMO valor que tem hoje em
-- `ver_fechamento`: quem abre o Fechamento vê o selo do mesmo alcance; quem
-- não abre, não ganha nada. Ninguém ganha nem perde acesso a dado (§2.4-b,
-- item 3). Selar de novo continua só do super admin (`fn_fechamento_mes_selar`).
--
-- Mesmo encadeamento das migrations de permissão: a função vigente vira o
-- retrato `_antes_selo_20261031`, e a nova soma a chave.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_selo_20261031()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_selo_20261031;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_selo_20261031() IS
  'Retrato do catalogo antes de fechamento_sub_selo (31/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_selo_20261031()
  UNION ALL
  SELECT * FROM (VALUES
    ('fechamento_sub_selo', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261031230200 soma fechamento_sub_selo.';

-- Cada cargo da BookPlay com o valor que tem em ver_fechamento.
UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object(
         'fechamento_sub_selo', COALESCE((cp.permissoes->>'ver_fechamento')::BOOLEAN, false))
  FROM public.empresas e
 WHERE e.id = cp.empresa_id
   AND e.slug = 'bookplay'
   AND NOT (cp.permissoes ? 'fechamento_sub_selo');

DO $verificacao$
BEGIN
  IF (SELECT count(*) FROM public.fn_permissoes_catalogo() c
       WHERE c.chave = 'fechamento_sub_selo') <> 1 THEN
    RAISE EXCEPTION 'A chave fechamento_sub_selo nao entrou no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_fechamento') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cargos_permissoes cp
      JOIN public.empresas e ON e.id = cp.empresa_id
     WHERE e.slug = 'bookplay'
       AND (NOT (cp.permissoes ? 'fechamento_sub_selo')
            OR (cp.permissoes->>'fechamento_sub_selo')::BOOLEAN
               IS DISTINCT FROM COALESCE((cp.permissoes->>'ver_fechamento')::BOOLEAN, false))
  ) THEN
    RAISE EXCEPTION 'Algum cargo da BookPlay ficou com fechamento_sub_selo diferente de ver_fechamento.';
  END IF;
END;
$verificacao$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261031230200', 'permissao_selo_do_fechamento', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
