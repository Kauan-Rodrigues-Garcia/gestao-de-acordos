-- Migração: adiciona coluna estado_uf à tabela acordos
-- Remove o hack de serializar [ESTADO:SP] dentro do campo observacoes.
--
-- COMO APLICAR:
--   1. Acesse o Supabase Dashboard → SQL Editor
--   2. Cole e execute este script
--
-- BACKFILL: extrai o código de estado do prefixo [ESTADO:XX] em observacoes
-- e limpa o prefixo do campo original (preserva o texto restante).
--
-- SEGURANÇA: usa ADD COLUMN IF NOT EXISTS — idempotente, pode rodar mais de uma vez.

-- 1. Adiciona a coluna (char(2) para garantir exatamente 2 letras; NULL para acordos Bookplay)
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS estado_uf char(2) DEFAULT NULL;

-- 2. Backfill: popula estado_uf a partir do prefixo [ESTADO:XX] em observacoes
UPDATE public.acordos
SET
  estado_uf   = (regexp_match(observacoes, '^\[ESTADO:([A-Z]{2})\]'))[1],
  observacoes = regexp_replace(observacoes, '^\[ESTADO:[A-Z]{2}\]\n?', '', 'g')
WHERE observacoes IS NOT NULL
  AND observacoes ~ '^\[ESTADO:[A-Z]{2}\]';

-- 3. Índice para filtros por estado (opcional mas recomendado)
CREATE INDEX IF NOT EXISTS idx_acordos_estado_uf
  ON public.acordos(estado_uf)
  WHERE estado_uf IS NOT NULL;

-- 4. Confirma resultado
SELECT
  count(*) FILTER (WHERE estado_uf IS NOT NULL) AS com_estado,
  count(*) FILTER (WHERE estado_uf IS NULL)     AS sem_estado,
  count(*)                                       AS total
FROM public.acordos;
