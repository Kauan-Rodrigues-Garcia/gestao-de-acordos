-- Migração: restaura view acordos_deduplicados ao estado original
--
-- A abordagem anterior tentava adicionar uma coluna sort_prioridade à view
-- para ordenar no banco, mas causou erros de tipo (date vs text) e
-- dependência de coluna não-standard.
--
-- A ordenação "hoje-primeiro" foi reimplementada no service (fetchAcordos)
-- via duas queries: uma busca todos os acordos de hoje (sem paginação) e
-- outra busca o resto paginado com offset ajustado. Nenhuma mudança de
-- schema é necessária.
--
-- Este script restaura a view ao seu estado original caso tenha sido
-- alterada pelas migrações anteriores desta sessão.
--
-- É idempotente — pode rodar mais de uma vez.

CREATE OR REPLACE VIEW public.acordos_deduplicados AS
SELECT DISTINCT ON (
  COALESCE(a.acordo_grupo_id::text, a.id::text)
)
  a.*
FROM public.acordos a
ORDER BY
  COALESCE(a.acordo_grupo_id::text, a.id::text),
  a.numero_parcela DESC NULLS LAST,
  a.criado_em DESC;

COMMENT ON VIEW public.acordos_deduplicados IS
  'Acordos deduplicados por acordo_grupo_id: mantém apenas a parcela com maior numero_parcela de cada grupo. Para acordos sem grupo, retorna o registro original. Use esta view para listagens e paginação exatas.';
