
-- Verifica tabelas específicas do projeto
SELECT 
  table_name,
  'EXISTS' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('acordos', 'perfis', 'empresas', 'nr_registros', 'lixeira_acordos', 'notificacoes', 'logs_sistema', 'setores', 'equipes')
ORDER BY table_name;
