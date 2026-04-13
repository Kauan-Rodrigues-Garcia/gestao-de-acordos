-- ============================================================
-- Migration 16: Improve buscar_email_por_usuario robustness
-- ============================================================
-- Changes over migration 15:
--   1. Guard against NULL / blank input — returns NULL immediately.
--   2. Does NOT filter by empresa_id, so the lookup works in any
--      deployment regardless of VITE_TENANT_SLUG configuration.
--   3. Adds a NULL-safe guard on the usuario column itself so rows
--      with a NULL username are never matched.
-- ============================================================

CREATE OR REPLACE FUNCTION public.buscar_email_por_usuario(p_usuario TEXT)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
BEGIN
  -- Reject blank / NULL input early
  IF p_usuario IS NULL OR btrim(p_usuario) = '' THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email
  FROM public.perfis
  WHERE usuario IS NOT NULL
    AND lower(btrim(usuario)) = lower(btrim(p_usuario))
    AND ativo = true
  LIMIT 1;

  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure both anon and authenticated roles can execute the function
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(TEXT) TO authenticated;
