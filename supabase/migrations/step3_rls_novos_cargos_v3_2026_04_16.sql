
-- ============================================================
-- Step 3 (v3): Atualizar CHECK constraint + RLS + backfill
-- ============================================================

-- ── 0. Atualizar CHECK constraint na tabela perfis ───────────────────────────
-- O Supabase tem um check constraint que lista os valores válidos de perfil.
-- Precisa incluir os novos valores antes de qualquer UPDATE na tabela.
ALTER TABLE public.perfis
  DROP CONSTRAINT IF EXISTS perfis_perfil_check;

ALTER TABLE public.perfis
  ADD CONSTRAINT perfis_perfil_check
  CHECK (perfil::text IN (
    'operador', 'lider', 'administrador', 'super_admin',
    'elite', 'gerencia', 'diretoria'
  ));

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

-- ── 2. UPDATE pelo admin/super_admin ─────────────────────────────────────────
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

-- ── 3. UPDATE pelo líder/elite/gerência ──────────────────────────────────────
-- BUG: WITH CHECK exigia perfil='operador' → bloqueava atribuição de cargo novo.
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
UPDATE public.perfis p
SET perfil = lower(btrim(u.raw_user_meta_data->>'perfil'))
FROM auth.users u
WHERE p.id = u.id
  AND p.perfil::text = 'operador'
  AND lower(btrim(COALESCE(u.raw_user_meta_data->>'perfil', '')))
      IN ('elite', 'gerencia', 'diretoria');
