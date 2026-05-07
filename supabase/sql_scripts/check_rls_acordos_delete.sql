
-- Verificar as policies de DELETE na tabela acordos
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'acordos'
ORDER BY cmd, policyname;
