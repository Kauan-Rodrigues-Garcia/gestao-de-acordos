-- ═══════════════════════════════════════════════════════════════════════════
-- 20260729a — PERFORMANCE: RLS por-linha e índice ausente no Analítico/Diário
-- ═══════════════════════════════════════════════════════════════════════════
-- Sintoma relatado: a aba Analítico demora muito para carregar.
--
-- Este é o MESMO problema que a migration 20260726a diagnosticou e corrigiu em
-- `acordos` ("canceling statement due to statement timeout"), e que nunca foi
-- aplicado às tabelas de recebimento. Duas causas somadas:
--
-- CAUSA 1 — funções SECURITY DEFINER avaliadas POR LINHA.
--   As policies de analitico_recebimentos e diario_recebimentos chamam
--   fn_can_access_empresa(empresa_id) e fn_user_has_any_role(ARRAY[...]) sem
--   embrulhar em (SELECT ...). Ambas dependem SÓ de auth.uid() — têm o mesmo
--   valor em toda linha da query —, mas são reavaliadas em cada uma, e cada
--   avaliação faz um SELECT em `perfis`. Num mês com 20 mil linhas isso são
--   ~40 mil selects em perfis, multiplicados ainda pelo número de páginas que
--   o cliente busca (max_rows=1000) e pelos consumidores simultâneos do hook.
--
--   Embrulhar em (SELECT ...) faz o planner promover a chamada a InitPlan e
--   avaliá-la UMA vez por query. É exatamente a técnica da 20260726a.
--
-- CAUSA 2 — nenhum índice serve o filtro principal do Analítico.
--   Todas as queries quentes filtram `empresa_id = $ AND data_pagamento BETWEEN`.
--   Os índices existentes são (empresa_id, operador_id, mes_referencia),
--   (empresa_id, codigo) e (lote_id) — nenhum cobre data_pagamento
--   (mes_referencia é outra coluna, truncada ao 1º do mês). Resultado: seq scan
--   da tabela inteira a cada carga.
--
--   `diario_recebimentos` já tem o índice correto para o seu filtro
--   (empresa_id, dia_referencia, operador_id) — lá só a CAUSA 1 se aplica.
--
-- ⚠️  SEMÂNTICA DE ACESSO PRESERVADA. Cada policy abaixo é o equivalente lógico
--     EXATO da anterior. fn_can_access_empresa(x) é, por definição
--     (11_tenant_lockdown / step4_fix_rls_recursion):
--         fn_user_is_super_admin() OR x = fn_user_empresa_id()
--     e foi inlined nessa forma para que as duas chamadas de sessão virem
--     InitPlan. Nenhum usuário ganha ou perde visibilidade.
--
-- Idempotente. Sem lock longo: CREATE INDEX aqui é o padrão (bloqueia escrita
-- na tabela por alguns segundos). Se a base já estiver grande e a importação
-- não puder parar, rode os dois CREATE INDEX manualmente com CONCURRENTLY
-- (fora de transação) antes de aplicar o resto.

-- ─── 1. Índices do Analítico ────────────────────────────────────────────────
-- Casa com: WHERE empresa_id = $ AND data_pagamento BETWEEN $ AND $
--           (+ ORDER BY data_pagamento DESC em buscarAnalitico)
CREATE INDEX IF NOT EXISTS idx_analitico_empresa_data
  ON public.analitico_recebimentos (empresa_id, data_pagamento);

-- Casa com o mesmo filtro + operador_id (visão do próprio operador, e o
-- filtro de líder por operador). Também serve o recorte de órfãos
-- (operador_id IS NULL), que é o caso do bucket "sem match".
CREATE INDEX IF NOT EXISTS idx_analitico_empresa_op_data
  ON public.analitico_recebimentos (empresa_id, operador_id, data_pagamento);

-- ─── 2. RLS de analitico_recebimentos com InitPlan ──────────────────────────

-- SELECT: operador vê somente as próprias linhas (operador_id = auth.uid());
--         líder+ vê tudo da empresa; linhas órfãs (operador_id NULL) só líder+.
DROP POLICY IF EXISTS "analitico_select" ON public.analitico_recebimentos;
CREATE POLICY "analitico_select" ON public.analitico_recebimentos
  FOR SELECT USING (
    -- fn_can_access_empresa(empresa_id), inlined
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (
      (operador_id = (SELECT auth.uid()) AND operador_id IS NOT NULL)
      OR (SELECT public.fn_user_has_any_role(
            ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
          ))
    )
  );

-- INSERT: somente líder+ pode importar.
DROP POLICY IF EXISTS "analitico_insert" ON public.analitico_recebimentos;
CREATE POLICY "analitico_insert" ON public.analitico_recebimentos
  FOR INSERT WITH CHECK (
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (SELECT public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
        ))
  );

-- UPDATE: operador atualiza as próprias linhas (visto, status_tabulacao);
--         líder+ atualiza qualquer linha da empresa.
DROP POLICY IF EXISTS "analitico_update" ON public.analitico_recebimentos;
CREATE POLICY "analitico_update" ON public.analitico_recebimentos
  FOR UPDATE USING (
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (
      operador_id = (SELECT auth.uid())
      OR (SELECT public.fn_user_has_any_role(
            ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
          ))
    )
  );

-- DELETE: somente líder+.
DROP POLICY IF EXISTS "analitico_delete" ON public.analitico_recebimentos;
CREATE POLICY "analitico_delete" ON public.analitico_recebimentos
  FOR DELETE USING (
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (SELECT public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
        ))
  );

-- ─── 3. RLS de diario_recebimentos com InitPlan ─────────────────────────────
-- Mesmas policies, mesma semântica. O índice do diário já existe
-- (idx_diario_empresa_dia_op), então aqui só a CAUSA 1 é tratada.

DROP POLICY IF EXISTS "diario_select" ON public.diario_recebimentos;
CREATE POLICY "diario_select" ON public.diario_recebimentos
  FOR SELECT USING (
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (
      (operador_id = (SELECT auth.uid()) AND operador_id IS NOT NULL)
      OR (SELECT public.fn_user_has_any_role(
            ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
          ))
    )
  );

DROP POLICY IF EXISTS "diario_insert" ON public.diario_recebimentos;
CREATE POLICY "diario_insert" ON public.diario_recebimentos
  FOR INSERT WITH CHECK (
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (SELECT public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
        ))
  );

DROP POLICY IF EXISTS "diario_update" ON public.diario_recebimentos;
CREATE POLICY "diario_update" ON public.diario_recebimentos
  FOR UPDATE USING (
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (
      operador_id = (SELECT auth.uid())
      OR (SELECT public.fn_user_has_any_role(
            ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
          ))
    )
  );

DROP POLICY IF EXISTS "diario_delete" ON public.diario_recebimentos;
CREATE POLICY "diario_delete" ON public.diario_recebimentos
  FOR DELETE USING (
    (
      (SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id())
    )
    AND (SELECT public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
        ))
  );

-- ─── 4. Estatísticas ────────────────────────────────────────────────────────
-- Índice novo sem estatística fresca pode não ser escolhido pelo planner na
-- primeira query. ANALYZE é rápido e evita a impressão de "não melhorou nada".
ANALYZE public.analitico_recebimentos;
ANALYZE public.diario_recebimentos;
