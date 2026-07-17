-- Metas zeradas para o super_admin na BookPlay (aba Metas).
--
-- A policy de SELECT original (15a_add_metas.sql) era:
--   empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
--
-- Ou seja: só enxerga metas da empresa gravada no PRÓPRIO perfil. O
-- super_admin é cross-empresa (perfil em outra empresa ou empresa_id nulo),
-- então na BookPlay o SELECT devolvia zero linhas e a tela aparecia zerada —
-- enquanto o líder do setor (perfil na BookPlay) via tudo normalmente.
--
-- Correção: usar fn_can_access_empresa, a mesma função SECURITY DEFINER já
-- usada pelas policies de INSERT/UPDATE desta tabela (20260510_fix_metas_rls_v2)
-- e pelo resto do sistema: super_admin acessa qualquer empresa; os demais,
-- apenas a própria.

DROP POLICY IF EXISTS "metas_select" ON public.metas;

CREATE POLICY "metas_select" ON public.metas FOR SELECT USING (
  public.fn_can_access_empresa(empresa_id)
);
