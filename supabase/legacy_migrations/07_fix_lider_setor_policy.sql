-- ============================================================
-- Migration 07: Corrigir RLS policy para líderes atualizarem
-- perfis de operadores sob sua gestão (troca de setor)
-- ============================================================

-- Recriar policy com condição mais abrangente:
-- permite atualizar operadores que estão no mesmo setor do líder
-- OU que têm lider_id = auth.uid()
DROP POLICY IF EXISTS "perfis_lider_update" ON public.perfis;

CREATE POLICY "perfis_lider_update" ON public.perfis
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid()
      AND p.perfil = 'lider'
  )
  AND (
    perfis.lider_id = auth.uid()
    OR perfis.setor_id IN (
      SELECT setor_id FROM public.perfis WHERE id = auth.uid()
    )
  )
);
