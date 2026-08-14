
-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: RLS tabela "acordos"
-- Garantir SELECT de qualquer acordo da mesma empresa
-- (operador precisa ler acordo de outro operador para fazer transferência)
-- ══════════════════════════════════════════════════════════════════════════════

-- Remover políticas de SELECT existentes que podem estar restringindo
DROP POLICY IF EXISTS "Usuários veem acordos da empresa"        ON public.acordos;
DROP POLICY IF EXISTS "Operadores veem seus acordos"           ON public.acordos;
DROP POLICY IF EXISTS "acordos_select_own"                     ON public.acordos;
DROP POLICY IF EXISTS "acordos_select_empresa"                 ON public.acordos;
DROP POLICY IF EXISTS "Users can view their own acordos"        ON public.acordos;
DROP POLICY IF EXISTS "Users can view company acordos"         ON public.acordos;
DROP POLICY IF EXISTS "Operadores podem ver acordos da empresa" ON public.acordos;

-- Criar política de SELECT: qualquer autenticado pode ver acordos da sua empresa
CREATE POLICY "acordos_select_empresa_2026"
  ON public.acordos FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: RLS tabela "notificacoes"
-- Permitir INSERT para qualquer usuario_id da mesma empresa
-- (precisamos notificar outro operador, não apenas a nós mesmos)
-- ══════════════════════════════════════════════════════════════════════════════

-- Remover políticas de INSERT existentes
DROP POLICY IF EXISTS "Usuários criam suas notificações"           ON public.notificacoes;
DROP POLICY IF EXISTS "notificacoes_insert_own"                    ON public.notificacoes;
DROP POLICY IF EXISTS "notificacoes_insert_empresa"                ON public.notificacoes;
DROP POLICY IF EXISTS "Users can insert own notificacoes"          ON public.notificacoes;
DROP POLICY IF EXISTS "Users can create notificacoes"              ON public.notificacoes;
DROP POLICY IF EXISTS "Operadores podem criar notificações"        ON public.notificacoes;
DROP POLICY IF EXISTS "Allow insert notificacoes for own user"     ON public.notificacoes;

-- Criar política de INSERT: pode inserir notificação para qualquer usuário
-- da mesma empresa (verificado pelo empresa_id)
CREATE POLICY "notificacoes_insert_empresa_2026"
  ON public.notificacoes FOR INSERT
  TO authenticated
  WITH CHECK (
    -- A notificação deve pertencer a um usuário da mesma empresa do autor
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- Garantir que SELECT mostra apenas notificações do próprio usuário
DROP POLICY IF EXISTS "Usuários veem suas notificações"        ON public.notificacoes;
DROP POLICY IF EXISTS "notificacoes_select_own"                ON public.notificacoes;
DROP POLICY IF EXISTS "Users can view own notificacoes"        ON public.notificacoes;
DROP POLICY IF EXISTS "notificacoes_select_empresa_2026"       ON public.notificacoes;

CREATE POLICY "notificacoes_select_own_2026"
  ON public.notificacoes FOR SELECT
  TO authenticated
  USING (usuario_id = auth.uid());

-- UPDATE (marcar como lida): apenas o dono
DROP POLICY IF EXISTS "Usuários atualizam suas notificações"   ON public.notificacoes;
DROP POLICY IF EXISTS "notificacoes_update_own"                ON public.notificacoes;
DROP POLICY IF EXISTS "Users can update own notificacoes"      ON public.notificacoes;

CREATE POLICY "notificacoes_update_own_2026"
  ON public.notificacoes FOR UPDATE
  TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

-- DELETE: apenas o dono
DROP POLICY IF EXISTS "Usuários deletam suas notificações"     ON public.notificacoes;
DROP POLICY IF EXISTS "notificacoes_delete_own"                ON public.notificacoes;
DROP POLICY IF EXISTS "Users can delete own notificacoes"      ON public.notificacoes;

CREATE POLICY "notificacoes_delete_own_2026"
  ON public.notificacoes FOR DELETE
  TO authenticated
  USING (usuario_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: RLS tabela "lixeira_acordos"
-- Garantir que operadores podem INSERT na lixeira (movendo acordo de outro)
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Usuários criam entradas na lixeira"     ON public.lixeira_acordos;
DROP POLICY IF EXISTS "lixeira_insert_empresa"                 ON public.lixeira_acordos;
DROP POLICY IF EXISTS "Users can insert lixeira_acordos"       ON public.lixeira_acordos;
DROP POLICY IF EXISTS "lixeira_insert_empresa_2026"            ON public.lixeira_acordos;

CREATE POLICY "lixeira_insert_empresa_2026"
  ON public.lixeira_acordos FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- SELECT lixeira: ver todos da empresa
DROP POLICY IF EXISTS "Usuários veem lixeira da empresa"        ON public.lixeira_acordos;
DROP POLICY IF EXISTS "lixeira_select_empresa"                  ON public.lixeira_acordos;
DROP POLICY IF EXISTS "Users can view lixeira_acordos"          ON public.lixeira_acordos;
DROP POLICY IF EXISTS "lixeira_select_empresa_2026"             ON public.lixeira_acordos;

CREATE POLICY "lixeira_select_empresa_2026"
  ON public.lixeira_acordos FOR SELECT
  TO authenticated
  USING (
    empresa_id IN (
      SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
    )
  );

-- Confirmar políticas criadas
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('acordos', 'notificacoes', 'lixeira_acordos')
ORDER BY tablename, cmd, policyname;
