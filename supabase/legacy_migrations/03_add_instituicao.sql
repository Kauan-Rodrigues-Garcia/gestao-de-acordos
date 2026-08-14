-- =====================================================================
-- Migration 03: Adicionar coluna `instituicao` na tabela `acordos`
-- 
-- COMO EXECUTAR:
-- 1. Acesse o Dashboard do Supabase: https://supabase.com/dashboard
-- 2. Selecione seu projeto
-- 3. Vá em: Database → SQL Editor
-- 4. Cole e execute o SQL abaixo
-- =====================================================================

-- Adiciona a coluna `instituicao` (nullable, sem default)
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS instituicao TEXT;

-- Índice opcional para buscas por instituição
CREATE INDEX IF NOT EXISTS idx_acordos_instituicao
  ON public.acordos(instituicao)
  WHERE instituicao IS NOT NULL;

-- Confirmar que a coluna foi criada
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'acordos'
  AND column_name  = 'instituicao';
