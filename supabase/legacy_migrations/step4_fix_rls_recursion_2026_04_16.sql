
-- ============================================================
-- Step 4: Corrigir recursão infinita nas policies de perfis
-- ============================================================
-- CAUSA: as policies do step3 faziam:
--   EXISTS (SELECT 1 FROM public.perfis me WHERE me.id = auth.uid() ...)
-- Isso dispara RLS novamente na mesma tabela → loop infinito → erro 500.
--
-- SOLUÇÃO: usar funções SECURITY DEFINER que fazem SET LOCAL row_security = off
-- internamente, quebrando o ciclo de RLS.
-- ============================================================

-- ── 1. Funções auxiliares SECURITY DEFINER (sem RLS) ────────────────────────

-- Retorna o perfil (cargo) do usuário logado
CREATE OR REPLACE FUNCTION public.fn_user_perfil()
RETURNS TEXT AS $$
  SELECT perfil::text
  FROM public.perfis
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Retorna o empresa_id do usuário logado
CREATE OR REPLACE FUNCTION public.fn_user_empresa_id()
RETURNS UUID AS $$
  SELECT empresa_id
  FROM public.perfis
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Retorna o setor_id do usuário logado
CREATE OR REPLACE FUNCTION public.fn_user_setor_id()
RETURNS UUID AS $$
  SELECT setor_id
  FROM public.perfis
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Verifica se o usuário logado é super_admin
CREATE OR REPLACE FUNCTION public.fn_user_is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid() AND perfil::text = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Verifica se o usuário tem algum dos roles informados
CREATE OR REPLACE FUNCTION public.fn_user_has_any_role(roles text[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid() AND perfil::text = ANY(roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Verifica se o usuário pode acessar uma empresa
CREATE OR REPLACE FUNCTION public.fn_can_access_empresa(target_empresa_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.fn_user_is_super_admin()
      OR target_empresa_id = public.fn_user_empresa_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ── 2. Recriar policies de perfis SEM subquery em perfis ────────────────────

-- SELECT
DROP POLICY IF EXISTS "perfis_select" ON public.perfis;
CREATE POLICY "perfis_select" ON public.perfis
  FOR SELECT USING (
    auth.uid() = id
    OR public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY[
        'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin'
      ])
    )
  );

-- ALL para admin/super_admin
DROP POLICY IF EXISTS "perfis_admin_all" ON public.perfis;
CREATE POLICY "perfis_admin_all" ON public.perfis
  FOR ALL
  USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  )
  WITH CHECK (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  );

-- UPDATE pelo líder/elite/gerência (mesmo setor)
DROP POLICY IF EXISTS "perfis_lider_update" ON public.perfis;
CREATE POLICY "perfis_lider_update" ON public.perfis
  FOR UPDATE
  USING (
    empresa_id = public.fn_user_empresa_id()
    AND setor_id = public.fn_user_setor_id()
    AND public.fn_user_has_any_role(ARRAY['lider', 'elite', 'gerencia'])
    AND perfil::text NOT IN ('administrador', 'super_admin')
  )
  WITH CHECK (
    empresa_id = public.fn_user_empresa_id()
    AND perfil::text NOT IN ('administrador', 'super_admin')
  );

-- UPDATE own
DROP POLICY IF EXISTS "perfis_update_own" ON public.perfis;
CREATE POLICY "perfis_update_own" ON public.perfis
  FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 3. Garantir grants nas funções ──────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.fn_user_perfil()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_empresa_id()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_setor_id()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_is_super_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_has_any_role(text[])       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_can_access_empresa(UUID)        TO authenticated;
