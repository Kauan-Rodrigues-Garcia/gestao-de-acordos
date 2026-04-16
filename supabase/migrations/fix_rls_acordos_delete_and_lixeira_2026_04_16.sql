-- ─────────────────────────────────────────────────────────────────────────────
-- fix_rls_acordos_delete_and_lixeira_2026_04_16.sql
--
-- Problema 1: O DELETE de acordo na transferência falha porque a policy de
--   DELETE só permite que o próprio operador delete seu acordo.
--   Mas o usuário que está fazendo a transferência é outro operador —
--   e o líder só foi autenticado via REST (não troca o token do Supabase client).
--
-- Solução: Permitir DELETE para qualquer usuário autenticado da mesma empresa.
--   (A lógica de autorização do líder já é feita no frontend via REST auth check)
--
-- Problema 2: A tabela lixeira_acordos pode ter RLS restritiva para leitura
--   de operadores — garantir que operadores possam ler itens da própria empresa.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ACORDOS: ajustar/criar policy de DELETE ───────────────────────────────

-- Remover qualquer policy de DELETE existente para recriar
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'acordos' AND cmd = 'DELETE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.acordos', pol.policyname);
  END LOOP;
END $$;

-- Recriar: qualquer usuário autenticado pode deletar acordos da sua empresa
-- (a verificação de permissão do líder é feita no frontend)
CREATE POLICY "acordos_delete_empresa"
  ON public.acordos
  FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- ── 2. LIXEIRA_ACORDOS: garantir SELECT para operadores ──────────────────────

-- Remover policies de SELECT existentes
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lixeira_acordos' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.lixeira_acordos', pol.policyname);
  END LOOP;
END $$;

-- Recriar: qualquer usuário autenticado da mesma empresa pode ver a lixeira
CREATE POLICY "lixeira_acordos_select_empresa"
  ON public.lixeira_acordos
  FOR SELECT
  USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- Garantir RLS habilitado
ALTER TABLE public.acordos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lixeira_acordos ENABLE ROW LEVEL SECURITY;

-- ── 3. REPLICA IDENTITY FULL — garantir que está aplicado ────────────────────
-- Necessário para que o Realtime envie payload.old com todos os campos no DELETE
ALTER TABLE public.acordos        REPLICA IDENTITY FULL;
ALTER TABLE public.notificacoes   REPLICA IDENTITY FULL;
ALTER TABLE public.nr_registros   REPLICA IDENTITY FULL;
ALTER TABLE public.lixeira_acordos REPLICA IDENTITY FULL;

-- ── 4. Garantir publicação supabase_realtime ─────────────────────────────────
DO $$
BEGIN
  -- acordos
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'acordos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.acordos;
  END IF;
  -- notificacoes
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notificacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
  END IF;
  -- nr_registros
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'nr_registros'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nr_registros;
  END IF;
  -- lixeira_acordos
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lixeira_acordos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lixeira_acordos;
  END IF;
END $$;
