SELECT relname, relreplident
FROM pg_class
WHERE relname IN ('acordos','notificacoes','nr_registros','lixeira_acordos')
  AND relkind = 'r';