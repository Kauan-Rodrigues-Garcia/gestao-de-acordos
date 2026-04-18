-- =====================================================================
-- Migration 03b: Complemento da migration 03 — adiciona setor_id em acordos
--
-- CONTEXTO:
--   Arquivo 03_add_instituicao.sql adicionou apenas a coluna `instituicao`.
--   Este arquivo (03b) é o complemento dessa mesma migration, adicionando
--   também a coluna `setor_id` que pode estar ausente em ambientes que
--   executaram a migration 03 original sem esta coluna.
--
--   O sufixo "b" indica que este script é dependente e complementar ao 03,
--   devendo ser executado APÓS o 03_add_instituicao.sql.
--
-- COMO EXECUTAR:
--   Execute após 03_add_instituicao.sql no SQL Editor do Supabase.
-- =====================================================================

-- Garante que ambas as colunas existam (idempotente)
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS instituicao TEXT,
  ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acordos_setor ON public.acordos(setor_id);
