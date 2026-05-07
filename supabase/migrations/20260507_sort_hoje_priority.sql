-- Migração: adiciona coluna sort_prioridade à view acordos_deduplicados
--
-- Problema: O sort "hoje-primeiro" era feito client-side sobre a página atual.
-- Se existem acordos com datas antigas (vencimento < hoje), eles ocupam as
-- primeiras páginas e os acordos de hoje só aparecem na sua posição natural.
--
-- Solução: sort_prioridade = 0 para acordos com vencimento = hoje e status != 'pago',
-- 1 para todos os demais. A query ordena por sort_prioridade ASC, vencimento ASC
-- antes de aplicar o LIMIT/OFFSET da paginação, garantindo que acordos de hoje
-- sempre apareçam no topo da primeira página.
--
-- COMO APLICAR:
--   1. Acesse o Supabase Dashboard → SQL Editor
--   2. Cole e execute este script
--   3. É idempotente — pode rodar mais de uma vez.

CREATE OR REPLACE VIEW public.acordos_deduplicados AS
SELECT DISTINCT ON (
  COALESCE(a.acordo_grupo_id::text, a.id::text)
)
  a.*,
  CASE
    WHEN a.vencimento = CURRENT_DATE
     AND a.status NOT IN ('pago')
    THEN 0
    ELSE 1
  END AS sort_prioridade
FROM public.acordos a
ORDER BY
  COALESCE(a.acordo_grupo_id::text, a.id::text),
  a.numero_parcela DESC NULLS LAST,
  a.criado_em DESC;

COMMENT ON VIEW public.acordos_deduplicados IS
  'Acordos deduplicados por acordo_grupo_id: mantém a parcela com maior numero_parcela.
   Coluna sort_prioridade=0 para acordos que vencem hoje e não estão pagos (usado para
   ordenação prioritária na listagem paginada). Para acordos sem grupo, retorna o registro original.';
