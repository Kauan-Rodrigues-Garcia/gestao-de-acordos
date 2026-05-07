SELECT policyname, cmd, qual::text, with_check::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'acordos'
ORDER BY cmd, policyname;