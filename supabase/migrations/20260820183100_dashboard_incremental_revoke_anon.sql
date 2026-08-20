-- O projeto possui um GRANT explícito legado para anon em funções públicas.
-- A revogação de PUBLIC na migration anterior não remove esse privilégio.
BEGIN;

REVOKE ALL ON FUNCTION public.fn_acordos_empresas_permitidas(TEXT[],BOOLEAN)
  FROM anon;

COMMIT;
