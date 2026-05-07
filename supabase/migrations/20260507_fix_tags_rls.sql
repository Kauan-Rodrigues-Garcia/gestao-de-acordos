-- Fix: garante que todos os usuários autenticados da empresa podem ler tags.
-- A policy tags_select anterior usava subquery em perfis que pode causar
-- recursão em contextos de RLS (problema comum em Supabase).
-- Solução: usar a função SECURITY DEFINER fn_can_access_empresa() que é
-- usada pelas outras tabelas do projeto para evitar recursão.

-- Remove policy existente (se houver)
DROP POLICY IF EXISTS tags_select ON public.tags;

-- Recria usando a função helper existente (SECURITY DEFINER, sem recursão)
CREATE POLICY tags_select ON public.tags FOR SELECT
  USING (public.fn_can_access_empresa(empresa_id));

-- Confirma
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'tags' AND schemaname = 'public';
