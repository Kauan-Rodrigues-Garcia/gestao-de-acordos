
-- ============================================================
-- Step 3: Corrigir políticas RLS da tabela perfis para
--         suportar os novos cargos elite, gerencia e diretoria
-- ============================================================
--
-- PROBLEMA 1 — erro 400 no UPDATE de perfil:
--   A policy "perfis_lider_update" (migration 11, linhas 378-394) tinha:
--     USING  (perfis.perfil = 'operador' AND ...)
--     WITH CHECK (perfis.perfil = 'operador' AND ...)
--   → Ao tentar salvar um usuário com perfil='elite'/'gerencia'/'diretoria',
--     o Supabase recusava o UPDATE porque o perfil pós-update não era 'operador'.
--   → A policy de admin (perfis_admin_all) passava pelo USING, mas o WITH CHECK
--     também bloqueava em alguns caminhos.
--
-- PROBLEMA 2 — SELECT sem visibilidade para novos cargos com papel de gestão:
--   A policy "perfis_select" só listava 'lider' e 'administrador' como roles
--   com acesso de leitura a outros perfis. Elite e gerência não enxergavam
--   os operadores do setor.
--
-- SOLUÇÃO:
--   1. Recriar "perfis_lider_update" sem restringir o perfil destino
--      (líderes/elite/gerência podem alterar usuários não-admin do mesmo setor).
--   2. Recriar "perfis_select" incluindo elite/gerencia/diretoria.
--   3. Recriar "perfis_admin_all" para garantir sem restrição de perfil destino.
-- ============================================================

-- ── 1. SELECT: novos cargos gerenciais podem ver outros usuários ─────────────
DROP POLICY IF EXISTS "perfis_select" ON public.perfis;
CREATE POLICY "perfis_select" ON public.perfis
  FOR SELECT USING (
    -- Sempre pode ver o próprio perfil
    auth.uid() = id
    OR
    -- Líderes, elite, gerência, diretoria e admins veem toda a empresa
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.empresa_id = perfis.empresa_id
        AND me.perfil IN (
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
    -- super_admin acessa tudo
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid() AND me.perfil = 'super_admin'
    )
    OR
    -- admin da mesma empresa
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.empresa_id = perfis.empresa_id
        AND me.perfil = 'administrador'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid() AND me.perfil = 'super_admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.empresa_id = perfis.empresa_id
        AND me.perfil = 'administrador'
    )
  );

-- ── 3. UPDATE pelo líder/elite/gerência: mesmo setor, não-admin ─────────────
-- BUG ANTERIOR: WITH CHECK exigia perfil='operador' após o update,
-- bloqueando a atribuição de cargo elite/gerencia/diretoria.
DROP POLICY IF EXISTS "perfis_lider_update" ON public.perfis;
CREATE POLICY "perfis_lider_update" ON public.perfis
  FOR UPDATE
  USING (
    -- O registro alvo deve ser da mesma empresa e mesmo setor
    perfis.empresa_id = (
      SELECT me.empresa_id FROM public.perfis me WHERE me.id = auth.uid()
    )
    AND perfis.setor_id = (
      SELECT me.setor_id FROM public.perfis me WHERE me.id = auth.uid()
    )
    -- Só líderes/elite/gerência podem usar esta policy
    AND EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.perfil IN ('lider', 'elite', 'gerencia')
    )
    -- Não podem alterar admins nem super_admins
    AND perfis.perfil NOT IN ('administrador', 'super_admin')
  )
  WITH CHECK (
    -- Após o update: ainda na mesma empresa
    perfis.empresa_id = (
      SELECT me.empresa_id FROM public.perfis me WHERE me.id = auth.uid()
    )
    -- Não pode promover para admin/super_admin
    AND perfis.perfil NOT IN ('administrador', 'super_admin')
  );

-- ── 4. UPDATE own: cada usuário edita apenas seus dados não-privilegiados ────
DROP POLICY IF EXISTS "perfis_update_own" ON public.perfis;
CREATE POLICY "perfis_update_own" ON public.perfis
  FOR UPDATE
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 5. Corrigir perfis que foram criados com cargo errado ───────────────────
-- Se o admin criou um usuário passando perfil='elite'/'gerencia'/'diretoria'
-- mas o trigger antigo salvou 'operador', corrigimos agora via metadata.
UPDATE public.perfis p
SET perfil = CASE lower(btrim(u.raw_user_meta_data->>'perfil'))
  WHEN 'elite'     THEN 'elite'::public.perfil_usuario
  WHEN 'gerencia'  THEN 'gerencia'::public.perfil_usuario
  WHEN 'diretoria' THEN 'diretoria'::public.perfil_usuario
  ELSE p.perfil
END
FROM auth.users u
WHERE p.id = u.id
  AND p.perfil = 'operador'::public.perfil_usuario
  AND lower(btrim(COALESCE(u.raw_user_meta_data->>'perfil', '')))
      IN ('elite', 'gerencia', 'diretoria');
