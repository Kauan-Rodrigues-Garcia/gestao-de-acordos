-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 19: Índices adicionais para paginação eficiente
-- ─────────────────────────────────────────────────────────────────────────────
-- Melhora a performance de queries paginadas na tabela acordos,
-- especialmente para empresas com alto volume de registros.
--
-- Estratégia:
--   - Índices compostos (empresa_id + campo de filtro) evitam Seq Scan
--   - Índice parcial para acordos ativos (excluindo nao_pago) agiliza
--     a verificação de NR duplicado
--   - Índice em acordo_grupo_id agiliza a deduplicação de parcelas

-- Índice composto: empresa + vencimento (ordenação padrão da listagem)
CREATE INDEX IF NOT EXISTS idx_acordos_empresa_vencimento
  ON public.acordos (empresa_id, vencimento ASC);

-- Índice composto: empresa + status + vencimento (filtro mais comum no dashboard)
CREATE INDEX IF NOT EXISTS idx_acordos_empresa_status_vencimento
  ON public.acordos (empresa_id, status, vencimento ASC);

-- Índice composto: empresa + operador + vencimento (visão do operador)
CREATE INDEX IF NOT EXISTS idx_acordos_empresa_operador_vencimento
  ON public.acordos (empresa_id, operador_id, vencimento ASC);

-- Índice composto: empresa + setor + vencimento (visão do líder)
CREATE INDEX IF NOT EXISTS idx_acordos_empresa_setor_vencimento
  ON public.acordos (empresa_id, setor_id, vencimento ASC);

-- Índice em acordo_grupo_id para deduplicação eficiente de parcelas
CREATE INDEX IF NOT EXISTS idx_acordos_grupo_parcela
  ON public.acordos (acordo_grupo_id, numero_parcela DESC)
  WHERE acordo_grupo_id IS NOT NULL;

-- Índice parcial: apenas acordos ativos, para verificação rápida de NR duplicado
-- (nr_registros.service.ts e verificarNrDuplicado excluem status 'nao_pago')
CREATE INDEX IF NOT EXISTS idx_acordos_nr_cliente_ativo
  ON public.acordos (empresa_id, nr_cliente)
  WHERE status <> 'nao_pago';

CREATE INDEX IF NOT EXISTS idx_acordos_instituicao_ativo
  ON public.acordos (empresa_id, instituicao)
  WHERE status <> 'nao_pago' AND instituicao IS NOT NULL;

-- Índice para busca textual por nome_cliente e whatsapp (ILIKE)
CREATE INDEX IF NOT EXISTS idx_acordos_nome_cliente_lower
  ON public.acordos (empresa_id, lower(nome_cliente));

-- Atualiza as estatísticas do PostgreSQL para os novos índices
ANALYZE public.acordos;
