
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('acordos', 'notificacoes', 'lixeira_acordos')
ORDER BY tablename, cmd, policyname;
