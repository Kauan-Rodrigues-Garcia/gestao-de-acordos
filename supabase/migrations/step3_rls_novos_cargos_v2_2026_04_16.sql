
-- ============================================================
-- Step 3 (v2): Corrigir políticas RLS da tabela perfis para
--              suportar os novos cargos elite, gerencia e diretoria
-- ============================================================
-- Nota: a coluna perfis.perfil é do tipo text (não o enum),
-- então comparações são feitas como texto puro.
-- ============================================================

-- ── 1. SELECT: novos cargos gerenciais podem ver outros usuários ─────────────
DROP POLICY IF EXISTS "perfis_select" ON public.perfis;
CREATE POLICY "perfis_select" ON public.perfis
  FOR SELECT USING (
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.empresa_id = perfis.empresa_id
        AND me.perfil::text IN (
          'lider', 'elite', 'gerencia', 'diretoria',
          'administrador', 'super_admin'
        )
    )
  );

-- ── 2. UPDATE pelo admin/super_admin: sem restrição de cargo destino ─────────
DROP POLICY IF EXISTS "perfis_admin_all" ON public.perfis;
CREATE POLICY "perfis_admin_all" ON public.perfis
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid() AND me.perfil::text = 'super_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.empresa_id = perfis.empresa_id
        AND me.perfil::text = 'administrador'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid() AND me.perfil::text = 'super_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.empresa_id = perfis.empresa_id
        AND me.perfil::text = 'administrador'
    )
  );

-- ── 3. UPDATE pelo líder/elite/gerência: mesmo setor, não-admin ─────────────
-- BUG ANTERIOR: WITH CHECK exigia perfil='operador' após o update.
-- CORREÇÃO: remove essa restrição — só bloqueia promoção para admin/super_admin.
DROP POLICY IF EXISTS "perfis_lider_update" ON public.perfis;
CREATE POLICY "perfis_lider_update" ON public.perfis
  FOR UPDATE
  USING (
    perfis.empresa_id = (
      SELECT me.empresa_id FROM public.perfis me WHERE me.id = auth.uid()
    )
    AND perfis.setor_id = (
      SELECT me.setor_id FROM public.perfis me WHERE me.id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.perfil::text IN ('lider', 'elite', 'gerencia')
    )
    AND perfis.perfil::text NOT IN ('administrador', 'super_admin')
  )
  WITH CHECK (
    perfis.empresa_id = (
      SELECT me.empresa_id FROM public.perfis me WHERE me.id = auth.uid()
    )
    AND perfis.perfil::text NOT IN ('administrador', 'super_admin')
  );

-- ── 4. UPDATE own ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "perfis_update_own" ON public.perfis;
CREATE POLICY "perfis_update_own" ON public.perfis
  FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 5. Backfill: corrigir perfis salvos como 'operador' por causa do bug ─────
-- Usuários criados com perfil='elite'/'gerencia'/'diretoria' mas que o trigger
-- antigo rebaixou para 'operador' têm o cargo correto nos metadados do auth.
UPDATE public.perfis p
SET perfil = lower(btrim(u.raw_user_meta_data->>'perfil'))::public.perfil_usuario
FROM auth.users u
WHERE p.id = u.id
  AND p.perfil::text = 'operador'
  AND lower(btrim(COALESCE(u.raw_user_meta_data->>'perfil', '')))
      IN ('elite', 'gerencia', 'diretoria');
