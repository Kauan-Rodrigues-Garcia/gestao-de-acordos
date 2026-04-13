-- ============================================================
-- Migration 08: Corrigir políticas RLS para troca de setor
-- e operações de líderes sobre seus operadores.
-- Idempotente: usa DROP IF EXISTS antes de recriar.
-- ============================================================

-- ── 1. Policy: líderes podem atualizar operadores do mesmo setor ──────
-- Substitui a versão de 06/07 com condição baseada em setor_id
DROP POLICY IF EXISTS "perfis_lider_update" ON public.perfis;

CREATE POLICY "perfis_lider_update" ON public.perfis
FOR UPDATE USING (
  -- Apenas operadores (líderes não podem alterar outros líderes ou admins)
  perfis.perfil = 'operador'
  AND EXISTS (
    SELECT 1 FROM public.perfis me
    WHERE me.id = auth.uid()
      AND me.perfil = 'lider'
      AND me.setor_id = perfis.setor_id
  )
)
WITH CHECK (
  -- Após o update, o registro ainda deve ser de um operador
  perfis.perfil = 'operador'
);

-- ── 2. Garantir que líderes podem ver todos os perfis do seu setor ────
-- (necessário para listar operadores na página de usuários)
-- A policy "perfis_select" já cobre isso, mas confirmamos aqui:
-- SELECT está coberto por: auth.uid() = id OR perfil IN ('lider','administrador')
-- Nenhuma mudança necessária na perfis_select.

-- ── 3. Confirmar policies de delete em acordos ────────────────────────
-- (garantia extra, pode já existir da migration 06)
DROP POLICY IF EXISTS "acordos_delete_own" ON public.acordos;
CREATE POLICY "acordos_delete_own" ON public.acordos
  FOR DELETE USING (operador_id = auth.uid());

DROP POLICY IF EXISTS "acordos_delete_admin" ON public.acordos;
CREATE POLICY "acordos_delete_admin" ON public.acordos
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid()
        AND p.perfil IN ('administrador', 'lider')
    )
  );
