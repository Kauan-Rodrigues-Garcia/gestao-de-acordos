
-- ══════════════════════════════════════════════════════════════════════════════
-- FIX 1: RLS tabela "acordos"
-- Permitir SELECT de acordos da mesma empresa (não apenas os próprios)
-- Necessário para buscar o acordo anterior de outro operador na transferência de NR
-- ══════════════════════════════════════════════════════════════════════════════

-- Ver políticas existentes
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'acordos' AND schemaname = 'public' ORDER BY cmd, policyname;
