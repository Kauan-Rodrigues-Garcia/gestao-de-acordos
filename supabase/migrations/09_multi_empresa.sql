-- ============================================================
-- Migration 09: Infraestrutura Multi-Empresa
-- ============================================================
-- Idempotente: usa IF NOT EXISTS, DROP IF EXISTS, ON CONFLICT DO NOTHING
-- Todos os dados existentes são migrados para BOOKPLAY automaticamente
-- ============================================================

-- ── 1. Criar tabela empresas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empresas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL UNIQUE,
  slug          TEXT NOT NULL UNIQUE,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  config        JSONB DEFAULT '{}',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE TRIGGER trg_empresas_updated
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.fn_atualizar_timestamp();

-- Seed das duas empresas
INSERT INTO public.empresas (nome, slug) VALUES
  ('BOOKPLAY', 'bookplay'),
  ('PAGUEPLAY', 'pagueplay')
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Adicionar empresa_id nas tabelas (nullable primeiro) ───────────────

-- perfis
DO $$ BEGIN
  ALTER TABLE public.perfis ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- acordos
DO $$ BEGIN
  ALTER TABLE public.acordos ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- setores
DO $$ BEGIN
  ALTER TABLE public.setores ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- modelos_mensagem
DO $$ BEGIN
  ALTER TABLE public.modelos_mensagem ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- notificacoes
DO $$ BEGIN
  ALTER TABLE public.notificacoes ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- logs_sistema
DO $$ BEGIN
  ALTER TABLE public.logs_sistema ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ai_config (se existir)
DO $$ BEGIN
  ALTER TABLE public.ai_config ADD COLUMN empresa_id UUID REFERENCES public.empresas(id);
EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- ── 3. Migrar dados existentes para BOOKPLAY ──────────────────────────────
UPDATE public.perfis
  SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
  WHERE empresa_id IS NULL;

UPDATE public.acordos
  SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
  WHERE empresa_id IS NULL;

UPDATE public.setores
  SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
  WHERE empresa_id IS NULL;

UPDATE public.modelos_mensagem
  SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
  WHERE empresa_id IS NULL;

UPDATE public.notificacoes
  SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
  WHERE empresa_id IS NULL;

UPDATE public.logs_sistema
  SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
  WHERE empresa_id IS NULL;

DO $$ BEGIN
  UPDATE public.ai_config
    SET empresa_id = (SELECT id FROM public.empresas WHERE slug = 'bookplay')
    WHERE empresa_id IS NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── 4. Tornar NOT NULL após popular ──────────────────────────────────────
-- Usamos blocos individuais para resiliência (caso a coluna já seja NOT NULL)

DO $$ BEGIN
  ALTER TABLE public.perfis ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.acordos ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.setores ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.modelos_mensagem ALTER COLUMN empresa_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- notificacoes e logs_sistema ficam nullable para compatibilidade com inserções legadas
-- (o código pode inserir sem empresa_id em alguns contextos)

-- ── 5. Criar índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_perfis_empresa    ON public.perfis(empresa_id);
CREATE INDEX IF NOT EXISTS idx_acordos_empresa   ON public.acordos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_setores_empresa   ON public.setores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_acordos_empresa_status   ON public.acordos(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_acordos_empresa_operador ON public.acordos(empresa_id, operador_id);

-- ── 6. Criar helper function fn_user_empresa_id ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_empresa_id()
RETURNS UUID AS $$
  SELECT empresa_id FROM public.perfis WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 7. Habilitar RLS na tabela empresas ───────────────────────────────────
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Leitura para todos os usuários autenticados
DROP POLICY IF EXISTS "empresas_select" ON public.empresas;
CREATE POLICY "empresas_select" ON public.empresas
  FOR SELECT USING (auth.role() = 'authenticated');

-- Escrita apenas para admins
DROP POLICY IF EXISTS "empresas_admin" ON public.empresas;
CREATE POLICY "empresas_admin" ON public.empresas
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid() AND p.perfil = 'administrador'
    )
  );

-- ── 8. Atualizar RLS policies com filtro por empresa ─────────────────────

-- === perfis ===
DROP POLICY IF EXISTS "perfis_select" ON public.perfis;
CREATE POLICY "perfis_select" ON public.perfis FOR SELECT USING (
  auth.uid() = id
  OR (
    empresa_id = public.fn_user_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid() AND p.perfil IN ('lider', 'administrador')
    )
  )
);

DROP POLICY IF EXISTS "perfis_update_own" ON public.perfis;
CREATE POLICY "perfis_update_own" ON public.perfis FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "perfis_admin_all" ON public.perfis;
CREATE POLICY "perfis_admin_all" ON public.perfis FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid() AND p.perfil = 'administrador'
  )
);

DROP POLICY IF EXISTS "perfis_lider_update" ON public.perfis;
CREATE POLICY "perfis_lider_update" ON public.perfis FOR UPDATE USING (
  perfis.perfil = 'operador'
  AND empresa_id = public.fn_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.perfis me
    WHERE me.id = auth.uid()
      AND me.perfil = 'lider'
      AND me.setor_id = perfis.setor_id
  )
)
WITH CHECK (perfis.perfil = 'operador');

-- === acordos ===
DROP POLICY IF EXISTS "acordos_access" ON public.acordos;
CREATE POLICY "acordos_access" ON public.acordos FOR ALL USING (
  empresa_id = public.fn_user_empresa_id()
  AND (
    operador_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.perfis p
      WHERE p.id = auth.uid() AND p.perfil IN ('lider', 'administrador')
    )
  )
);

DROP POLICY IF EXISTS "acordos_delete_own" ON public.acordos;
CREATE POLICY "acordos_delete_own" ON public.acordos FOR DELETE USING (
  empresa_id = public.fn_user_empresa_id()
  AND operador_id = auth.uid()
);

DROP POLICY IF EXISTS "acordos_delete_admin" ON public.acordos;
CREATE POLICY "acordos_delete_admin" ON public.acordos FOR DELETE USING (
  empresa_id = public.fn_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid() AND p.perfil IN ('administrador', 'lider')
  )
);

-- === setores ===
DROP POLICY IF EXISTS "setores_select" ON public.setores;
CREATE POLICY "setores_select" ON public.setores FOR SELECT USING (
  empresa_id = public.fn_user_empresa_id()
);

DROP POLICY IF EXISTS "setores_admin" ON public.setores;
CREATE POLICY "setores_admin" ON public.setores FOR ALL USING (
  empresa_id = public.fn_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid() AND p.perfil = 'administrador'
  )
);

-- === modelos_mensagem ===
DROP POLICY IF EXISTS "modelos_select" ON public.modelos_mensagem;
CREATE POLICY "modelos_select" ON public.modelos_mensagem FOR SELECT USING (
  empresa_id = public.fn_user_empresa_id()
);

DROP POLICY IF EXISTS "modelos_admin" ON public.modelos_mensagem;
CREATE POLICY "modelos_admin" ON public.modelos_mensagem FOR ALL USING (
  empresa_id = public.fn_user_empresa_id()
  AND EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid() AND p.perfil = 'administrador'
  )
);

-- === notificacoes ===
DROP POLICY IF EXISTS "notificacoes_own" ON public.notificacoes;
CREATE POLICY "notificacoes_own" ON public.notificacoes FOR ALL USING (
  usuario_id = auth.uid()
);

-- === logs_sistema ===
DROP POLICY IF EXISTS "logs_sis_admin" ON public.logs_sistema;
CREATE POLICY "logs_sis_admin" ON public.logs_sistema FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.perfis p
    WHERE p.id = auth.uid() AND p.perfil = 'administrador'
  )
);

DROP POLICY IF EXISTS "logs_sis_insert" ON public.logs_sistema;
CREATE POLICY "logs_sis_insert" ON public.logs_sistema FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ── 9. Atualizar trigger fn_criar_perfil_novo_usuario ─────────────────────
-- Agora inclui empresa_id via raw_user_meta_data->>'empresa_id' ou default BOOKPLAY
CREATE OR REPLACE FUNCTION public.fn_criar_perfil_novo_usuario()
RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id UUID;
  v_empresa_id_meta TEXT;
BEGIN
  -- Tentar obter empresa_id do metadata
  v_empresa_id_meta := NEW.raw_user_meta_data->>'empresa_id';

  IF v_empresa_id_meta IS NOT NULL AND v_empresa_id_meta <> '' THEN
    -- Validar que o UUID existe
    SELECT id INTO v_empresa_id FROM public.empresas WHERE id = v_empresa_id_meta::UUID;
  END IF;

  -- Se não encontrou por ID, tentar por slug
  IF v_empresa_id IS NULL THEN
    DECLARE
      v_empresa_slug TEXT;
    BEGIN
      v_empresa_slug := NEW.raw_user_meta_data->>'empresa_slug';
      IF v_empresa_slug IS NOT NULL AND v_empresa_slug <> '' THEN
        SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = v_empresa_slug;
      END IF;
    END;
  END IF;

  -- Fallback: BOOKPLAY
  IF v_empresa_id IS NULL THEN
    SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = 'bookplay';
  END IF;

  INSERT INTO public.perfis (id, nome, email, perfil, empresa_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'perfil')::perfil_usuario, 'operador'),
    v_empresa_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger (já existe, mas função foi atualizada)
DROP TRIGGER IF EXISTS trg_novo_usuario ON auth.users;
CREATE TRIGGER trg_novo_usuario
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.fn_criar_perfil_novo_usuario();

-- ── 10. Atualizar trigger fn_log_historico_acordo (compatibilidade) ───────
-- Garantir que o trigger de histórico continua funcionando com o novo schema
-- (o trigger existente usa campos básicos, não precisa de empresa_id)
-- Verificamos se existe antes de tentar recriar
DO $$ BEGIN
  -- Compatibilidade: não há mudanças necessárias no trigger de histórico
  -- pois ele captura campos de acordo e não precisa de empresa_id
  NULL;
END $$;
