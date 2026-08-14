-- =====================================================================
-- RPC: excluir usuário de verdade (auth.users), sem Edge Function
--
-- PROBLEMA:
--   A exclusão de usuário no app tentava a Edge Function 'admin-delete-user'
--   (que nunca foi implantada) e, no fallback, apagava só a linha de
--   public.perfis. O registro em auth.users ficava órfão. Ao recriar o
--   usuário (ex.: trocar de empresa), o signUp acusava:
--     "User already registered" / "usuário já existe"
--   mesmo sem constar em public.perfis.
--
-- SOLUÇÃO:
--   Função SECURITY DEFINER que apaga o registro em auth.users. Como
--   public.perfis.id referencia auth.users(id) ON DELETE CASCADE, o perfil
--   é removido junto. Guardas de permissão: só administrador/super_admin,
--   sem excluir a si mesmo, e admin normal restrito à própria empresa
--   (super_admin cross-empresa).
--
-- DEPENDÊNCIAS: 11_tenant_lockdown.sql (helpers), 01_schema_completo.sql (FK)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_admin_delete_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_target_empresa UUID;
BEGIN
  -- Só administrador / super_admin podem excluir
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuários';
  END IF;

  -- Não pode excluir a si mesmo
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a si mesmo';
  END IF;

  -- Empresa do alvo (NULL se o perfil já não existir / órfão)
  SELECT empresa_id INTO v_target_empresa
  FROM public.perfis
  WHERE id = p_user_id;

  -- Admin normal só exclui da própria empresa; super_admin em qualquer.
  -- (Se o perfil já não existe, v_target_empresa é NULL e apenas
  --  super_admin passa — permite limpar registros órfãos.)
  IF NOT public.fn_can_access_empresa(v_target_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuário de outra empresa';
  END IF;

  -- Apaga o usuário de auth.users (cascata remove o perfil via FK)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_admin_delete_user(UUID) TO authenticated;
