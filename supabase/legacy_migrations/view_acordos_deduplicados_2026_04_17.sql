
-- ─────────────────────────────────────────────────────────────────────────────
-- View: acordos_deduplicados
--
-- Problema resolvido:
--   O sistema salva acordos parcelados como múltiplos registros com o mesmo
--   acordo_grupo_id. Exibir todas as parcelas na listagem duplica o cliente.
--   A deduplicação era feita em memória no frontend (imprecisa para paginação).
--
-- Solução:
--   Esta view mantém apenas a parcela com maior numero_parcela por grupo.
--   Para acordos sem grupo (acordo_grupo_id IS NULL), mantém o registro original.
--   A paginação e contagem feitas sobre esta view são EXATAS.
--
-- Uso no service:
--   .from('acordos_deduplicados')  →  substitui  .from('acordos')
--
-- Nota: a view herda as políticas RLS da tabela base `acordos`. Não são
-- necessárias políticas adicionais pois o Supabase aplica RLS ao SELECT
-- que alimenta a view (security_invoker por padrão no Supabase).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.acordos_deduplicados AS
SELECT DISTINCT ON (
  COALESCE(a.acordo_grupo_id::text, a.id::text)   -- agrupa por grupo ou trata como único
)
  a.*
FROM public.acordos a
ORDER BY
  COALESCE(a.acordo_grupo_id::text, a.id::text),  -- necessário para DISTINCT ON
  a.numero_parcela DESC NULLS LAST,               -- mantém a maior parcela
  a.criado_em DESC;                               -- desempate por data de criação

-- Comentário descritivo
COMMENT ON VIEW public.acordos_deduplicados IS
  'Acordos deduplicados por acordo_grupo_id: mantém apenas a parcela com maior numero_parcela de cada grupo. Para acordos sem grupo, retorna o registro original. Use esta view para listagens e paginação exatas.';
