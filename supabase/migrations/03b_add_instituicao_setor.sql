-- Migration 03: adiciona coluna instituicao na tabela acordos
-- e coluna setor_id que pode estar faltando

ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS instituicao TEXT,
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acordos_setor ON public.acordos(setor_id);
