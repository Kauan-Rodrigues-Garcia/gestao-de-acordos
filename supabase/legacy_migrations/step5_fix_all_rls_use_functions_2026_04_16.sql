
-- ============================================================
-- Step 5: Recriar policies de outras tabelas que faziam
--         subquery em perfis (causando recursão via cascata)
-- ============================================================
-- As policies das tabelas empresas, acordos, setores, etc.
-- usavam fn_can_access_empresa e fn_user_has_any_role que agora
-- são SECURITY DEFINER corretas. Mas algumas ainda tinham
-- EXISTS (SELECT FROM perfis ...) inline — vamos garantir que
-- todas usem as funções auxiliares.
-- ============================================================

-- ── empresas ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "empresas_admin"  ON public.empresas;
DROP POLICY IF EXISTS "empresas_select" ON public.empresas;

CREATE POLICY "empresas_select" ON public.empresas
  FOR SELECT USING (ativo = true);

CREATE POLICY "empresas_admin" ON public.empresas
  FOR ALL
  USING (public.fn_user_is_super_admin())
  WITH CHECK (public.fn_user_is_super_admin());

-- ── acordos ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "acordos_access"      ON public.acordos;
DROP POLICY IF EXISTS "acordos_delete_own"  ON public.acordos;
DROP POLICY IF EXISTS "acordos_delete_admin" ON public.acordos;

CREATE POLICY "acordos_access" ON public.acordos
  FOR ALL USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'])
    )
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'])
    )
  );

CREATE POLICY "acordos_delete_own" ON public.acordos
  FOR DELETE USING (
    empresa_id = public.fn_user_empresa_id()
    AND operador_id = auth.uid()
  );

CREATE POLICY "acordos_delete_admin" ON public.acordos
  FOR DELETE USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador','lider','elite','gerencia'])
    )
  );

-- ── setores ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "setores_select" ON public.setores;
DROP POLICY IF EXISTS "setores_admin"  ON public.setores;

CREATE POLICY "setores_select" ON public.setores
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

CREATE POLICY "setores_admin" ON public.setores
  FOR ALL
  USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  )
  WITH CHECK (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  );

-- ── modelos_mensagem ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "modelos_select" ON public.modelos_mensagem;
DROP POLICY IF EXISTS "modelos_admin"  ON public.modelos_mensagem;

CREATE POLICY "modelos_select" ON public.modelos_mensagem
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

CREATE POLICY "modelos_admin" ON public.modelos_mensagem
  FOR ALL
  USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  )
  WITH CHECK (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  );

-- ── notificacoes ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notificacoes_own" ON public.notificacoes;

CREATE POLICY "notificacoes_own" ON public.notificacoes
  FOR ALL
  USING (
    (usuario_id = auth.uid() AND public.fn_can_access_empresa(empresa_id))
    OR public.fn_user_is_super_admin()
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      usuario_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
    )
  );

-- ── logs_sistema ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "logs_sis_admin"  ON public.logs_sistema;
DROP POLICY IF EXISTS "logs_sis_insert" ON public.logs_sistema;

CREATE POLICY "logs_sis_admin" ON public.logs_sistema
  FOR SELECT USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  );

CREATE POLICY "logs_sis_insert" ON public.logs_sistema
  FOR INSERT WITH CHECK (public.fn_can_access_empresa(empresa_id));

-- ── historico_acordos ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "historico_select" ON public.historico_acordos;
DROP POLICY IF EXISTS "historico_insert" ON public.historico_acordos;

CREATE POLICY "historico_select" ON public.historico_acordos
  FOR SELECT USING (
    public.fn_user_is_super_admin()
    OR (
      public.fn_can_access_empresa(empresa_id)
      AND (
        usuario_id = auth.uid()
        OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador'])
      )
    )
  );

CREATE POLICY "historico_insert" ON public.historico_acordos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      usuario_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
    )
  );

-- ── logs_whatsapp ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "logs_wa_select" ON public.logs_whatsapp;
DROP POLICY IF EXISTS "logs_wa_insert" ON public.logs_whatsapp;

CREATE POLICY "logs_wa_select" ON public.logs_whatsapp
  FOR SELECT USING (
    public.fn_user_is_super_admin()
    OR (
      public.fn_can_access_empresa(empresa_id)
      AND (
        usuario_id = auth.uid()
        OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador'])
      )
    )
  );

CREATE POLICY "logs_wa_insert" ON public.logs_whatsapp
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      usuario_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
    )
  );

-- ── ai_config ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  DROP POLICY IF EXISTS "ai_config_select_auth"  ON public.ai_config;
  DROP POLICY IF EXISTS "ai_config_admin_write"  ON public.ai_config;

  CREATE POLICY "ai_config_select_auth" ON public.ai_config
    FOR SELECT USING (
      public.fn_can_access_empresa(empresa_id)
      OR public.fn_user_is_super_admin()
    );

  CREATE POLICY "ai_config_admin_write" ON public.ai_config
    FOR ALL
    USING (
      public.fn_user_is_super_admin()
      OR (
        empresa_id = public.fn_user_empresa_id()
        AND public.fn_user_has_any_role(ARRAY['administrador'])
      )
    )
    WITH CHECK (
      public.fn_user_is_super_admin()
      OR (
        empresa_id = public.fn_user_empresa_id()
        AND public.fn_user_has_any_role(ARRAY['administrador'])
      )
    );
EXCEPTION WHEN undefined_table THEN NULL; END $$;
