-- Fix definitivo das policies de metas usando fn_user_has_any_role (SECURITY DEFINER).
-- A query inline em perfis usada nas policies originais é inconsistente com a camada
-- de funções SECURITY DEFINER adotada no step4. Substituímos por fn_user_has_any_role
-- que bypassa RLS em perfis e funciona para todos os cargos.

-- Remove TODAS as policies de escrita existentes na tabela metas
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'metas'
      AND cmd IN ('INSERT','UPDATE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.metas', pol.policyname);
  END LOOP;
END;
$$;

-- INSERT: administrador, lider, super_admin, elite, gerencia
CREATE POLICY "metas_insert" ON public.metas FOR INSERT WITH CHECK (
  public.fn_can_access_empresa(empresa_id)
  AND public.fn_user_has_any_role(ARRAY['administrador','lider','super_admin','elite','gerencia'])
);

-- UPDATE: idem
CREATE POLICY "metas_update" ON public.metas FOR UPDATE
USING (
  public.fn_can_access_empresa(empresa_id)
  AND public.fn_user_has_any_role(ARRAY['administrador','lider','super_admin','elite','gerencia'])
)
WITH CHECK (
  public.fn_can_access_empresa(empresa_id)
  AND public.fn_user_has_any_role(ARRAY['administrador','lider','super_admin','elite','gerencia'])
);
