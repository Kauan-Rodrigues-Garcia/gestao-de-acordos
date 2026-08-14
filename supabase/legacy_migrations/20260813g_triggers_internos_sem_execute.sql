-- ═══════════════════════════════════════════════════════════════════════════════
-- 20260813g — Funções internas de trigger não são endpoints da Data API
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- O projeto concede EXECUTE em novas funções de `public` para os papéis da API
-- por default privilege. Revogar só de PUBLIC não remove essas concessões
-- explícitas. Estas funções são chamadas exclusivamente pelos próprios triggers.

REVOKE ALL ON FUNCTION public.fn_validar_empresa_dos_perfis_do_acordo()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_impedir_transferencia_com_acordos_pendentes()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.fn_validar_empresa_dos_perfis_do_acordo()',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.fn_validar_empresa_dos_perfis_do_acordo()',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.fn_impedir_transferencia_com_acordos_pendentes()',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.fn_impedir_transferencia_com_acordos_pendentes()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'função interna de trigger continua exposta à Data API';
  END IF;

  RAISE NOTICE 'Funções internas dos triggers sem EXECUTE para papéis da API.';
END;
$$;
