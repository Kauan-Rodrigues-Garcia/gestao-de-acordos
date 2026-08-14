-- =====================================================================
-- Migration 14a: Adicionar tabela equipes e campo equipe_id em perfis
--
-- CONTEXTO:
--   Primeira parte da migration 14, focada na estrutura de equipes.
--   Deve ser executada ANTES de 14b_auth_username.sql.
--
-- DEPENDÊNCIAS: 09_multi_empresa.sql (tabelas empresas e perfis)
-- =====================================================================

-- Tabela equipes
CREATE TABLE IF NOT EXISTS public.equipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  setor_id UUID REFERENCES public.setores(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar campo equipe_id em perfis (se não existir)
ALTER TABLE public.perfis 
  ADD COLUMN IF NOT EXISTS equipe_id UUID REFERENCES public.equipes(id) ON DELETE SET NULL;

-- RLS para equipes
ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "equipes_select" ON public.equipes
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

CREATE POLICY "equipes_insert_admin_lider" ON public.equipes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfis 
      WHERE id = auth.uid() 
      AND perfil IN ('administrador', 'lider')
      AND empresa_id = equipes.empresa_id
    )
  );

CREATE POLICY "equipes_update_admin_lider" ON public.equipes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.perfis 
      WHERE id = auth.uid() 
      AND perfil IN ('administrador', 'lider')
    )
  );

CREATE POLICY "equipes_delete_admin" ON public.equipes
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.perfis 
      WHERE id = auth.uid() 
      AND perfil = 'administrador'
    )
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_equipes_setor_id ON public.equipes(setor_id);
CREATE INDEX IF NOT EXISTS idx_equipes_empresa_id ON public.equipes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_perfis_equipe_id ON public.perfis(equipe_id);
