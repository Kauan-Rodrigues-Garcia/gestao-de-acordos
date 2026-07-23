-- ═══════════════════════════════════════════════════════════════════════════
-- ITEM 3 — Isolamento de acordos por SETOR (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- BUG (segurança): a política `acordos_access` (11_tenant_lockdown.sql) dava a
-- QUALQUER usuário com cargo 'lider'/'administrador' acesso a TODOS os acordos
-- da empresa — sem qualquer recorte por setor. Resultado: um líder do setor
-- receptivo enxergava acordos dos setores Play 4/5, etc.
--
-- Correção (só BookPlay — PaguePlay e demais empresas mantêm o comportamento
-- antigo, porque as duas operações dividem o MESMO banco/RLS):
--   • líder, elite e gerência ficam presos ao PRÓPRIO setor;
--   • diretoria, administrador e super_admin continuam vendo todos os setores;
--   • operador continua vendo só os próprios acordos.
--
-- O setor do acordo vem de `acordos.setor_id` (carimbado a partir do setor do
-- operador na criação). Acordos legados podem ter setor_id NULL — nesse caso
-- caímos no setor do próprio operador do acordo.
--
-- A política antiga era FOR ALL (um só predicado para SELECT/INSERT/UPDATE/
-- DELETE). Trocamos por políticas separadas: uma FOR ALL permissiva reabriria
-- o SELECT via OR, então SELECT/INSERT/UPDATE ficam explícitos.

-- ─── Helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_setor_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.setor_id FROM public.perfis p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.fn_operador_setor_id(p_operador_id UUID)
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.setor_id FROM public.perfis p WHERE p.id = p_operador_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_user_empresa_is_bookplay()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() AND lower(e.slug) = 'bookplay'
  );
$$;

-- ─── Predicado de visibilidade (reutilizado nas políticas) ───────────────────
-- true quando o usuário atual PODE enxergar/mexer no acordo (linha corrente).
-- Não é helper de tabela — é a mesma expressão repetida abaixo, comentada aqui:
--
--   fn_can_access_empresa(empresa_id) AND (
--     operador_id = auth.uid()                                   -- dono
--     OR fn_user_is_super_admin()                               -- super vê tudo
--     OR ( fn_user_empresa_is_bookplay() AND (
--            fn_user_has_any_role(['administrador','diretoria']) -- BP: gestão vê tudo
--            OR ( fn_user_has_any_role(['lider','elite','gerencia'])
--                 AND ( setor_id = fn_user_setor_id()
--                       OR (setor_id IS NULL
--                           AND fn_operador_setor_id(operador_id) = fn_user_setor_id()) ) ) ) )
--     OR ( NOT fn_user_empresa_is_bookplay()                    -- PP/demais: comportamento antigo
--          AND fn_user_has_any_role(['lider','administrador']) )
--   )

-- ─── Substitui a política FOR ALL ────────────────────────────────────────────
DROP POLICY IF EXISTS "acordos_access" ON public.acordos;

-- SELECT: leitura escopada por setor (BookPlay)
DROP POLICY IF EXISTS "acordos_select" ON public.acordos;
CREATE POLICY "acordos_select" ON public.acordos
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR (
        public.fn_user_empresa_is_bookplay() AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
            AND (
              setor_id = public.fn_user_setor_id()
              OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
            )
          )
        )
      )
      OR (
        NOT public.fn_user_empresa_is_bookplay()
        AND public.fn_user_has_any_role(ARRAY['lider','administrador'])
      )
    )
  );

-- INSERT: mesma regra de visibilidade no WITH CHECK
DROP POLICY IF EXISTS "acordos_insert" ON public.acordos;
CREATE POLICY "acordos_insert" ON public.acordos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR (
        public.fn_user_empresa_is_bookplay() AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
            AND (
              setor_id = public.fn_user_setor_id()
              OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
            )
          )
        )
      )
      OR (
        NOT public.fn_user_empresa_is_bookplay()
        AND public.fn_user_has_any_role(ARRAY['lider','administrador'])
      )
    )
  );

-- UPDATE: mesma regra na leitura da linha e na versão gravada
DROP POLICY IF EXISTS "acordos_update" ON public.acordos;
CREATE POLICY "acordos_update" ON public.acordos
  FOR UPDATE
  USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR (
        public.fn_user_empresa_is_bookplay() AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
            AND (
              setor_id = public.fn_user_setor_id()
              OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
            )
          )
        )
      )
      OR (
        NOT public.fn_user_empresa_is_bookplay()
        AND public.fn_user_has_any_role(ARRAY['lider','administrador'])
      )
    )
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR (
        public.fn_user_empresa_is_bookplay() AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
            AND (
              setor_id = public.fn_user_setor_id()
              OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
            )
          )
        )
      )
      OR (
        NOT public.fn_user_empresa_is_bookplay()
        AND public.fn_user_has_any_role(ARRAY['lider','administrador'])
      )
    )
  );

-- DELETE (admin/gestão): admin e super seguem globais; na BookPlay o líder/
-- elite/gerência só apaga do próprio setor; PaguePlay mantém líder global.
DROP POLICY IF EXISTS "acordos_delete_admin" ON public.acordos;
CREATE POLICY "acordos_delete_admin" ON public.acordos
  FOR DELETE USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND (
        public.fn_user_has_any_role(ARRAY['administrador'])
        OR (
          public.fn_user_empresa_is_bookplay()
          AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
          AND (
            setor_id = public.fn_user_setor_id()
            OR (setor_id IS NULL AND public.fn_operador_setor_id(operador_id) = public.fn_user_setor_id())
          )
        )
        OR (
          NOT public.fn_user_empresa_is_bookplay()
          AND public.fn_user_has_any_role(ARRAY['lider'])
        )
      )
    )
  );

-- (acordos_delete_own permanece: operador apaga o próprio — não alterada aqui.)

GRANT EXECUTE ON FUNCTION public.fn_user_setor_id()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_operador_setor_id(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_empresa_is_bookplay()    TO authenticated;
