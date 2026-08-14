-- Migration 10: Índices compostos para performance multi-empresa
-- Melhora consultas filtradas por empresa_id nas principais tabelas.

CREATE INDEX IF NOT EXISTS idx_acordos_empresa_vencimento
  ON acordos(empresa_id, vencimento);

CREATE INDEX IF NOT EXISTS idx_acordos_empresa_status
  ON acordos(empresa_id, status);

CREATE INDEX IF NOT EXISTS idx_acordos_empresa_operador
  ON acordos(empresa_id, operador_id);

CREATE INDEX IF NOT EXISTS idx_perfis_empresa
  ON perfis(empresa_id);

CREATE INDEX IF NOT EXISTS idx_logs_empresa
  ON logs_sistema(empresa_id);

CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario
  ON notificacoes(usuario_id, lida);
