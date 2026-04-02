-- ============================================================
-- Migration 11: Hardening multi-tenant isolation and site lock
-- ============================================================

-- ── 1. Papel global opcional ────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE public.perfil_usuario ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Tenant columns faltantes ─────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.historico_acordos ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.logs_whatsapp ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── 3. Backfill de empresa_id ───────────────────────────────────────────────
UPDATE public.historico_acordos h
SET empresa_id = a.empresa_id
FROM public.acordos a
WHERE h.acordo_id = a.id
  AND h.empresa_id IS NULL;

UPDATE public.logs_whatsapp l
SET empresa_id = a.empresa_id
FROM public.acordos a
WHERE l.acordo_id = a.id
  AND l.empresa_id IS NULL;

UPDATE public.notificacoes n
SET empresa_id = p.empresa_id
FROM public.perfis p
WHERE n.usuario_id = p.id
  AND n.empresa_id IS NULL;

UPDATE public.logs_sistema l
SET empresa_id = p.empresa_id
FROM public.perfis p
WHERE l.usuario_id = p.id
  AND l.empresa_id IS NULL;

DO $$ BEGIN
  UPDATE public.ai_config
  SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
  WHERE empresa_id IS NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

UPDATE public.logs_sistema
SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
WHERE empresa_id IS NULL;

UPDATE public.notificacoes
SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
WHERE empresa_id IS NULL;

UPDATE public.historico_acordos
SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
WHERE empresa_id IS NULL;

UPDATE public.logs_whatsapp
SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
WHERE empresa_id IS NULL;

-- ── 4. Restrições e índices ─────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.historico_acordos ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.logs_whatsapp ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.notificacoes ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.logs_sistema ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.ai_config ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; WHEN undefined_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_historico_empresa ON public.historico_acordos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_logs_whatsapp_empresa ON public.logs_whatsapp(empresa_id);
CREATE INDEX IF NOT EXISTS idx_logs_sistema_empresa_criado_em ON public.logs_sistema(empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_empresa_usuario ON public.notificacoes(empresa_id, usuario_id);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_ai_config_empresa ON public.ai_config(empresa_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── 5. Helpers de tenant/role ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    WHERE p.id = auth.uid()
      AND p.perfil = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.fn_user_has_any_role(roles text[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    WHERE p.id = auth.uid()
      AND p.perfil::text = ANY(roles)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.fn_can_access_empresa(target_empresa_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.fn_user_is_super_admin()
     OR target_empresa_id = public.fn_user_empresa_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 6. Trigger para preencher empresa_id automaticamente ────────────────────
CREATE OR REPLACE FUNCTION public.fn_resolver_empresa_id_padrao()
RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id UUID;
  v_usuario_id UUID;
  v_acordo_id UUID;
BEGIN
  v_empresa_id := NEW.empresa_id;
  v_usuario_id := NULLIF(to_jsonb(NEW)->>'usuario_id', '')::UUID;
  v_acordo_id := NULLIF(to_jsonb(NEW)->>'acordo_id', '')::UUID;

  IF v_empresa_id IS NULL AND TG_TABLE_NAME IN ('historico_acordos', 'logs_whatsapp') THEN
    SELECT a.empresa_id INTO v_empresa_id
    FROM public.acordos a
    WHERE a.id = v_acordo_id;
  END IF;

  IF v_empresa_id IS NULL AND v_usuario_id IS NOT NULL THEN
    SELECT p.empresa_id INTO v_empresa_id
    FROM public.perfis p
    WHERE p.id = v_usuario_id;
  END IF;

  IF v_empresa_id IS NULL AND auth.uid() IS NOT NULL THEN
    v_empresa_id := public.fn_user_empresa_id();
  END IF;

  IF v_empresa_id IS NOT NULL THEN
    NEW.empresa_id := v_empresa_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_perfis_empresa_default ON public.perfis;
CREATE TRIGGER trg_perfis_empresa_default
  BEFORE INSERT OR UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();

DROP TRIGGER IF EXISTS trg_acordos_empresa_default ON public.acordos;
CREATE TRIGGER trg_acordos_empresa_default
  BEFORE INSERT OR UPDATE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();

DROP TRIGGER IF EXISTS trg_setores_empresa_default ON public.setores;
CREATE TRIGGER trg_setores_empresa_default
  BEFORE INSERT OR UPDATE ON public.setores
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();

DROP TRIGGER IF EXISTS trg_modelos_empresa_default ON public.modelos_mensagem;
CREATE TRIGGER trg_modelos_empresa_default
  BEFORE INSERT OR UPDATE ON public.modelos_mensagem
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();

DROP TRIGGER IF EXISTS trg_notificacoes_empresa_default ON public.notificacoes;
CREATE TRIGGER trg_notificacoes_empresa_default
  BEFORE INSERT OR UPDATE ON public.notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();

DROP TRIGGER IF EXISTS trg_logs_sistema_empresa_default ON public.logs_sistema;
CREATE TRIGGER trg_logs_sistema_empresa_default
  BEFORE INSERT OR UPDATE ON public.logs_sistema
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();

DROP TRIGGER IF EXISTS trg_historico_empresa_default ON public.historico_acordos;
CREATE TRIGGER trg_historico_empresa_default
  BEFORE INSERT OR UPDATE ON public.historico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();

DROP TRIGGER IF EXISTS trg_logs_whatsapp_empresa_default ON public.logs_whatsapp;
CREATE TRIGGER trg_logs_whatsapp_empresa_default
  BEFORE INSERT OR UPDATE ON public.logs_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_ai_config_empresa_default ON public.ai_config;
  CREATE TRIGGER trg_ai_config_empresa_default
    BEFORE INSERT OR UPDATE ON public.ai_config
    FOR EACH ROW EXECUTE FUNCTION public.fn_resolver_empresa_id_padrao();
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── 7. Guard rails para self-update de perfis ───────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_guardar_update_perfil()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() = OLD.id AND NOT public.fn_user_is_super_admin() THEN
    IF NEW.perfil IS DISTINCT FROM OLD.perfil
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.ativo IS DISTINCT FROM OLD.ativo
       OR NEW.lider_id IS DISTINCT FROM OLD.lider_id
       OR NEW.setor_id IS DISTINCT FROM OLD.setor_id THEN
      RAISE EXCEPTION 'Atualização de perfil bloqueada para o próprio usuário';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_guardar_update_perfil ON public.perfis;
CREATE TRIGGER trg_guardar_update_perfil
  BEFORE UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_guardar_update_perfil();

-- ── 8. Trigger de criação de perfil ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_criar_perfil_novo_usuario()
RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id UUID;
  v_empresa_id_meta TEXT;
  v_empresa_slug TEXT;
BEGIN
  v_empresa_id_meta := NEW.raw_user_meta_data->>'empresa_id';
  v_empresa_slug := lower(COALESCE(NEW.raw_user_meta_data->>'empresa_slug', ''));

  IF v_empresa_id_meta IS NOT NULL AND v_empresa_id_meta <> '' THEN
    SELECT id INTO v_empresa_id
    FROM public.empresas
    WHERE id = v_empresa_id_meta::UUID;
  END IF;

  IF v_empresa_id IS NULL AND v_empresa_slug <> '' THEN
    SELECT id INTO v_empresa_id
    FROM public.empresas
    WHERE slug = v_empresa_slug;
  END IF;

  IF v_empresa_id IS NULL THEN
    SELECT id INTO v_empresa_id
    FROM public.empresas
    WHERE slug = 'bookplay';
  END IF;

  INSERT INTO public.perfis (id, nome, email, perfil, setor_id, empresa_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'perfil')::perfil_usuario, 'operador'),
    NULLIF(NEW.raw_user_meta_data->>'setor_id', '')::UUID,
    v_empresa_id
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    perfil = EXCLUDED.perfil,
    setor_id = COALESCE(EXCLUDED.setor_id, public.perfis.setor_id),
    empresa_id = COALESCE(EXCLUDED.empresa_id, public.perfis.empresa_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_novo_usuario ON auth.users;
CREATE TRIGGER trg_novo_usuario
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fn_criar_perfil_novo_usuario();

-- ── 9. Histórico automático precisa carregar empresa_id ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_historico_acordo()
RETURNS TRIGGER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  v_usuario_id := auth.uid();

  IF v_usuario_id IS NULL THEN
    v_usuario_id := NEW.operador_id;
  END IF;

  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.historico_acordos (acordo_id, usuario_id, empresa_id, campo_alterado, valor_anterior, valor_novo)
    VALUES (NEW.id, v_usuario_id, NEW.empresa_id, 'status', OLD.status::text, NEW.status::text);
  END IF;

  IF (TG_OP = 'UPDATE' AND OLD.valor IS DISTINCT FROM NEW.valor) THEN
    INSERT INTO public.historico_acordos (acordo_id, usuario_id, empresa_id, campo_alterado, valor_anterior, valor_novo)
    VALUES (NEW.id, v_usuario_id, NEW.empresa_id, 'valor', OLD.valor::text, NEW.valor::text);
  END IF;

  IF (TG_OP = 'UPDATE' AND OLD.vencimento IS DISTINCT FROM NEW.vencimento) THEN
    INSERT INTO public.historico_acordos (acordo_id, usuario_id, empresa_id, campo_alterado, valor_anterior, valor_novo)
    VALUES (NEW.id, v_usuario_id, NEW.empresa_id, 'vencimento', OLD.vencimento::text, NEW.vencimento::text);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.historico_acordos (acordo_id, usuario_id, empresa_id, campo_alterado, valor_anterior, valor_novo)
    VALUES (NEW.id, v_usuario_id, NEW.empresa_id, 'status', NULL, NEW.status::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_historico_acordo ON public.acordos;
CREATE TRIGGER trg_log_historico_acordo
  AFTER INSERT OR UPDATE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_acordo();

-- ── 10. Policies revisadas com isolamento de tenant ─────────────────────────
DROP POLICY IF EXISTS "empresas_admin" ON public.empresas;
CREATE POLICY "empresas_admin" ON public.empresas
  FOR ALL
  USING (public.fn_user_is_super_admin())
  WITH CHECK (public.fn_user_is_super_admin());

DROP POLICY IF EXISTS "empresas_select" ON public.empresas;
CREATE POLICY "empresas_select" ON public.empresas
  FOR SELECT USING (ativo = true);

DROP POLICY IF EXISTS "perfis_select" ON public.perfis;
CREATE POLICY "perfis_select" ON public.perfis
  FOR SELECT USING (
    auth.uid() = id
    OR (
      public.fn_can_access_empresa(empresa_id)
      AND public.fn_user_has_any_role(ARRAY['lider', 'administrador'])
    )
    OR public.fn_user_is_super_admin()
  );

DROP POLICY IF EXISTS "perfis_update_own" ON public.perfis;
CREATE POLICY "perfis_update_own" ON public.perfis
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "perfis_admin_all" ON public.perfis;
CREATE POLICY "perfis_admin_all" ON public.perfis
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

DROP POLICY IF EXISTS "perfis_lider_update" ON public.perfis;
CREATE POLICY "perfis_lider_update" ON public.perfis
  FOR UPDATE USING (
    perfis.perfil = 'operador'
    AND perfis.empresa_id = public.fn_user_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.perfil = 'lider'
        AND me.setor_id = perfis.setor_id
        AND me.empresa_id = perfis.empresa_id
    )
  )
  WITH CHECK (
    perfis.perfil = 'operador'
    AND perfis.empresa_id = public.fn_user_empresa_id()
  );

DROP POLICY IF EXISTS "acordos_access" ON public.acordos;
CREATE POLICY "acordos_access" ON public.acordos
  FOR ALL USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider', 'administrador'])
      OR public.fn_user_is_super_admin()
    )
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider', 'administrador'])
      OR public.fn_user_is_super_admin()
    )
  );

DROP POLICY IF EXISTS "acordos_delete_own" ON public.acordos;
CREATE POLICY "acordos_delete_own" ON public.acordos
  FOR DELETE USING (
    empresa_id = public.fn_user_empresa_id()
    AND operador_id = auth.uid()
  );

DROP POLICY IF EXISTS "acordos_delete_admin" ON public.acordos;
CREATE POLICY "acordos_delete_admin" ON public.acordos
  FOR DELETE USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador', 'lider'])
    )
  );

DROP POLICY IF EXISTS "setores_select" ON public.setores;
CREATE POLICY "setores_select" ON public.setores
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "setores_admin" ON public.setores;
CREATE POLICY "setores_admin" ON public.setores
  FOR ALL USING (
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

DROP POLICY IF EXISTS "modelos_select" ON public.modelos_mensagem;
CREATE POLICY "modelos_select" ON public.modelos_mensagem
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "modelos_admin" ON public.modelos_mensagem;
CREATE POLICY "modelos_admin" ON public.modelos_mensagem
  FOR ALL USING (
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

DROP POLICY IF EXISTS "notificacoes_own" ON public.notificacoes;
CREATE POLICY "notificacoes_own" ON public.notificacoes
  FOR ALL USING (
    (usuario_id = auth.uid() AND public.fn_can_access_empresa(empresa_id))
    OR public.fn_user_is_super_admin()
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      usuario_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['administrador', 'super_admin'])
    )
  );

DROP POLICY IF EXISTS "logs_sis_admin" ON public.logs_sistema;
CREATE POLICY "logs_sis_admin" ON public.logs_sistema
  FOR SELECT USING (
    public.fn_user_is_super_admin()
    OR (
      empresa_id = public.fn_user_empresa_id()
      AND public.fn_user_has_any_role(ARRAY['administrador'])
    )
  );

DROP POLICY IF EXISTS "logs_sis_insert" ON public.logs_sistema;
CREATE POLICY "logs_sis_insert" ON public.logs_sistema
  FOR INSERT
  WITH CHECK (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "historico_select" ON public.historico_acordos;
CREATE POLICY "historico_select" ON public.historico_acordos
  FOR SELECT USING (
    public.fn_user_is_super_admin()
    OR (
      public.fn_can_access_empresa(empresa_id)
      AND (
        usuario_id = auth.uid()
        OR public.fn_user_has_any_role(ARRAY['lider', 'administrador'])
      )
    )
  );

DROP POLICY IF EXISTS "historico_insert" ON public.historico_acordos;
CREATE POLICY "historico_insert" ON public.historico_acordos
  FOR INSERT
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      usuario_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider', 'administrador', 'super_admin'])
    )
  );

DROP POLICY IF EXISTS "logs_wa_select" ON public.logs_whatsapp;
CREATE POLICY "logs_wa_select" ON public.logs_whatsapp
  FOR SELECT USING (
    public.fn_user_is_super_admin()
    OR (
      public.fn_can_access_empresa(empresa_id)
      AND (
        usuario_id = auth.uid()
        OR public.fn_user_has_any_role(ARRAY['lider', 'administrador'])
      )
    )
  );

DROP POLICY IF EXISTS "logs_wa_insert" ON public.logs_whatsapp;
CREATE POLICY "logs_wa_insert" ON public.logs_whatsapp
  FOR INSERT
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND (
      usuario_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider', 'administrador', 'super_admin'])
    )
  );

DO $$ BEGIN
  DROP POLICY IF EXISTS "ai_config_select_auth" ON public.ai_config;
  CREATE POLICY "ai_config_select_auth" ON public.ai_config
    FOR SELECT USING (
      public.fn_can_access_empresa(empresa_id)
      OR public.fn_user_is_super_admin()
    );

  DROP POLICY IF EXISTS "ai_config_admin_write" ON public.ai_config;
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
