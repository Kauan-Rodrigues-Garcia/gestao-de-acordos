
-- ── Verificar e corrigir políticas RLS da tabela nr_registros ────────────────
-- Garantir que operadores autenticados possam fazer SELECT para verificar conflitos

-- Listar políticas existentes
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'nr_registros' AND schemaname = 'public';

-- Remover políticas existentes e recriar de forma limpa
DROP POLICY IF EXISTS "nr_registros_select_empresa"    ON public.nr_registros;
DROP POLICY IF EXISTS "nr_registros_insert_empresa"    ON public.nr_registros;
DROP POLICY IF EXISTS "nr_registros_update_empresa"    ON public.nr_registros;
DROP POLICY IF EXISTS "nr_registros_delete_empresa"    ON public.nr_registros;
DROP POLICY IF EXISTS "nr_registros_all_authenticated" ON public.nr_registros;
DROP POLICY IF EXISTS "Users can view nr_registros"    ON public.nr_registros;
DROP POLICY IF EXISTS "Users can insert nr_registros"  ON public.nr_registros;
DROP POLICY IF EXISTS "Users can update nr_registros"  ON public.nr_registros;
DROP POLICY IF EXISTS "Users can delete nr_registros"  ON public.nr_registros;

-- Habilitar RLS (idempotente)
ALTER TABLE public.nr_registros ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer usuário autenticado pode ler registros da sua empresa
-- (necessário para verificarNrRegistro no frontend)
CREATE POLICY "nr_select_authenticated"
  ON public.nr_registros FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- INSERT: qualquer usuário autenticado pode registrar NR da sua empresa
CREATE POLICY "nr_insert_authenticated"
  ON public.nr_registros FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- UPDATE: qualquer usuário autenticado pode atualizar NR da sua empresa
CREATE POLICY "nr_update_authenticated"
  ON public.nr_registros FOR UPDATE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- DELETE: qualquer usuário autenticado pode liberar NR da sua empresa
CREATE POLICY "nr_delete_authenticated"
  ON public.nr_registros FOR DELETE
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- Verificar resultado
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'nr_registros' AND schemaname = 'public'
ORDER BY policyname;
