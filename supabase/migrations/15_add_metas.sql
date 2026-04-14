-- Migration: Sistema de Metas por Setor, Equipe e Operador

CREATE TABLE IF NOT EXISTS public.metas (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo         TEXT NOT NULL CHECK (tipo IN ('setor','equipe','operador')),
  referencia_id UUID NOT NULL,   -- setor_id | equipe_id | perfil_id (operador)
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  meta_valor   NUMERIC(15,2) NOT NULL DEFAULT 0,  -- meta em R$
  meta_acordos INTEGER NOT NULL DEFAULT 0,         -- meta em quantidade de acordos
  mes          INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano          INTEGER NOT NULL CHECK (ano >= 2024),
  criado_por   UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tipo, referencia_id, empresa_id, mes, ano)
);

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;

-- SELECT: todos da empresa veem metas da própria empresa
CREATE POLICY "metas_select" ON public.metas FOR SELECT USING (
  empresa_id IN (SELECT empresa_id FROM public.perfis WHERE id = auth.uid())
);

-- INSERT/UPDATE: admin e líder (líder só para seu setor/equipe)
CREATE POLICY "metas_upsert" ON public.metas FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND perfil IN ('administrador','lider','super_admin'))
);
CREATE POLICY "metas_update" ON public.metas FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND perfil IN ('administrador','lider','super_admin'))
);
CREATE POLICY "metas_delete" ON public.metas FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.perfis WHERE id = auth.uid() AND perfil IN ('administrador','super_admin'))
);

CREATE INDEX IF NOT EXISTS idx_metas_referencia ON public.metas(referencia_id);
CREATE INDEX IF NOT EXISTS idx_metas_empresa    ON public.metas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_metas_periodo    ON public.metas(mes, ano);
