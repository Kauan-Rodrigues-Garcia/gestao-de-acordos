-- Migração: adiciona coluna estado_uf à tabela acordos
-- Remove o hack de serializar [ESTADO:SP] dentro do campo observacoes.
--
-- FASE 1 (este script): adiciona a coluna e backfill do valor.
--   O prefixo [ESTADO:SP] é preservado em observacoes para compatibilidade
--   com o código legado que ainda lê extractEstado(observacoes).
--   Quando o frontend for atualizado para usar getEstadoFromAcordo(),
--   rode a FASE 2 (limpeza do prefixo).
--
-- COMO APLICAR:
--   1. Acesse o Supabase Dashboard → SQL Editor
--   2. Cole e execute este script
--   3. É idempotente (ADD COLUMN IF NOT EXISTS) — pode rodar mais de uma vez.

-- 1. Adiciona a coluna (char(2) para exatamente 2 letras; NULL para acordos sem estado)
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS estado_uf char(2) DEFAULT NULL;

-- 2. Backfill: popula estado_uf a partir do prefixo [ESTADO:XX] em observacoes
--    NÃO remove o prefixo de observacoes nesta fase.
UPDATE public.acordos
SET estado_uf = (regexp_match(observacoes, '^\[ESTADO:([A-Z]{2})\]'))[1]
WHERE observacoes IS NOT NULL
  AND observacoes ~ '^\[ESTADO:[A-Z]{2}\]'
  AND estado_uf IS NULL;

-- 3. Índice para filtros por estado
CREATE INDEX IF NOT EXISTS idx_acordos_estado_uf
  ON public.acordos(estado_uf)
  WHERE estado_uf IS NOT NULL;

-- 4. Confirma resultado
SELECT
  count(*) FILTER (WHERE estado_uf IS NOT NULL) AS com_estado,
  count(*) FILTER (WHERE estado_uf IS NULL)     AS sem_estado,
  count(*)                                       AS total
FROM public.acordos;
