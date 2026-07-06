-- =====================================================================
-- Fix RLS de equipes: permitir super_admin (cross-empresa) + elite/gerencia
--
-- PROBLEMA:
--   As policies criadas em 14a_add_equipes.sql só aceitavam
--   perfil IN ('administrador','lider') E exigiam que o empresa_id do
--   usuário fosse igual ao da equipe. Um super_admin (perfil fora da
--   lista) criando equipe em outra empresa recebia:
--     403 - new row violates row-level security policy for table "equipes"
--
-- SOLUÇÃO:
--   Recria as policies usando os helpers de tenant/role
--   (fn_user_is_super_admin / fn_user_has_any_role / fn_can_access_empresa).
--   - super_admin: opera em qualquer empresa.
--   - administrador/lider/elite/gerencia: restritos à própria empresa.
--
-- DEPENDÊNCIAS: 11_tenant_lockdown.sql (helpers), 14a_add_equipes.sql
-- =====================================================================

-- SELECT: própria empresa OU super_admin
DROP POLICY IF EXISTS "equipes_select" ON public.equipes;
CREATE POLICY "equipes_select" ON public.equipes
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
  );

-- INSERT: role permitido E acesso à empresa da equipe
DROP POLICY IF EXISTS "equipes_insert_admin_lider" ON public.equipes;
CREATE POLICY "equipes_insert_admin_lider" ON public.equipes
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(
      ARRAY['administrador','lider','elite','gerencia','super_admin']
    )
  );

-- UPDATE: role permitido E acesso à empresa da equipe
DROP POLICY IF EXISTS "equipes_update_admin_lider" ON public.equipes;
CREATE POLICY "equipes_update_admin_lider" ON public.equipes
  FOR UPDATE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(
      ARRAY['administrador','lider','elite','gerencia','super_admin']
    )
  );

-- DELETE: administrador/super_admin, com acesso à empresa da equipe
DROP POLICY IF EXISTS "equipes_delete_admin" ON public.equipes;
CREATE POLICY "equipes_delete_admin" ON public.equipes
  FOR DELETE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  );
