-- ============================================================
-- Migration 14: Username-based login + Clear Logs policy
-- ============================================================

-- ── 1. Add usuario (username) column to perfis ───────────────────────────────
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS usuario TEXT;

-- Unique username per company (partial index: only non-null usernames)
CREATE UNIQUE INDEX IF NOT EXISTS idx_perfis_usuario_empresa
  ON public.perfis(usuario, empresa_id)
  WHERE usuario IS NOT NULL;

-- ── 2. Update trigger to also persist usuario from metadata ──────────────────
-- Based on migration 13 (fully resilient version), extended with usuario field.
CREATE OR REPLACE FUNCTION public.fn_criar_perfil_novo_usuario()
RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id      UUID;
  v_empresa_id_meta TEXT;
  v_empresa_slug    TEXT;
  v_nome            TEXT;
  v_email           TEXT;
  v_email_nome_base TEXT;
  v_perfil_meta     TEXT;
  v_perfil_val      perfil_usuario;
  v_setor_id        UUID;
  v_setor_id_meta   TEXT;
  v_usuario         TEXT;
BEGIN
  -- ── Extract metadata ──────────────────────────────────────────────────────
  v_nome            := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'nome', '')), '');
  v_email           := lower(BTRIM(COALESCE(NEW.email, '')));
  v_email_nome_base := NULLIF(split_part(NULLIF(v_email, ''), '@', 1), '');
  v_perfil_meta     := lower(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'perfil', '')), ''));
  v_usuario         := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'usuario', '')), '');

  -- Treat the literal string "null" (serialised from JS null) as NULL
  v_empresa_id_meta := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'empresa_id', '')), '');
  IF v_empresa_id_meta = 'null' THEN
    v_empresa_id_meta := NULL;
  END IF;

  v_empresa_slug := lower(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'empresa_slug', '')), ''));
  IF v_empresa_slug = 'null' THEN
    v_empresa_slug := NULL;
  END IF;

  v_setor_id_meta := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'setor_id', '')), '');
  IF v_setor_id_meta = 'null' THEN
    v_setor_id_meta := NULL;
  END IF;

  -- Sanitise usuario: treat "null" string as NULL
  IF v_usuario = 'null' THEN
    v_usuario := NULL;
  END IF;

  -- ── Resolve empresa_id ────────────────────────────────────────────────────
  -- Priority: metadata UUID → metadata slug → 'bookplay' slug → any active
  IF v_empresa_id_meta IS NOT NULL THEN
    BEGIN
      SELECT id INTO v_empresa_id
      FROM public.empresas
      WHERE id = v_empresa_id_meta::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_empresa_id := NULL;
    END;
  END IF;

  IF v_empresa_id IS NULL AND v_empresa_slug IS NOT NULL THEN
    SELECT id INTO v_empresa_id
    FROM public.empresas
    WHERE slug = v_empresa_slug;
  END IF;

  IF v_empresa_id IS NULL THEN
    SELECT id INTO v_empresa_id
    FROM public.empresas
    WHERE slug = 'bookplay';
  END IF;

  IF v_empresa_id IS NULL THEN
    SELECT id INTO v_empresa_id
    FROM public.empresas
    WHERE ativo = true
    ORDER BY
      CASE slug
        WHEN 'bookplay'  THEN 0
        WHEN 'pagueplay' THEN 1
        ELSE 2
      END,
      criado_em
    LIMIT 1;
  END IF;

  -- ── Resolve setor_id ──────────────────────────────────────────────────────
  IF v_setor_id_meta IS NOT NULL AND v_empresa_id IS NOT NULL THEN
    BEGIN
      SELECT s.id INTO v_setor_id
      FROM public.setores s
      WHERE s.id = v_setor_id_meta::UUID
        AND s.empresa_id = v_empresa_id;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_setor_id := NULL;
    END;
  END IF;

  -- ── Resolve perfil ────────────────────────────────────────────────────────
  IF v_perfil_meta IN ('operador', 'lider', 'administrador') THEN
    v_perfil_val := v_perfil_meta::perfil_usuario;
  ELSIF v_perfil_meta = 'super_admin' THEN
    BEGIN
      v_perfil_val := 'super_admin'::perfil_usuario;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_perfil_val := 'operador'::perfil_usuario;
    END;
  ELSE
    v_perfil_val := 'operador'::perfil_usuario;
  END IF;

  -- ── Insert / upsert perfil ────────────────────────────────────────────────
  INSERT INTO public.perfis (id, nome, email, perfil, setor_id, empresa_id, usuario)
  VALUES (
    NEW.id,
    COALESCE(v_nome, v_email_nome_base, NEW.id::text),
    v_email,
    v_perfil_val,
    v_setor_id,
    v_empresa_id,
    v_usuario
  )
  ON CONFLICT (id) DO UPDATE SET
    nome       = EXCLUDED.nome,
    email      = EXCLUDED.email,
    perfil     = EXCLUDED.perfil,
    setor_id   = COALESCE(public.perfis.setor_id,   EXCLUDED.setor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id),
    usuario    = COALESCE(EXCLUDED.usuario, public.perfis.usuario);

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Last-resort fallback: create a minimal profile so the signup never fails.
    INSERT INTO public.perfis (id, nome, email, perfil, empresa_id)
    VALUES (
      NEW.id,
      COALESCE(
        NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'nome', '')), ''),
        split_part(lower(BTRIM(COALESCE(NEW.email, ''))), '@', 1),
        NEW.id::text
      ),
      lower(BTRIM(COALESCE(NEW.email, ''))),
      'operador'::perfil_usuario,
      v_empresa_id
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger (idempotent)
DROP TRIGGER IF EXISTS trg_novo_usuario ON auth.users;
CREATE TRIGGER trg_novo_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_criar_perfil_novo_usuario();

-- ── 3. RLS policy for DELETE on logs_sistema ─────────────────────────────────
DROP POLICY IF EXISTS "logs_sis_delete_admin" ON public.logs_sistema;
CREATE POLICY "logs_sis_delete_admin" ON public.logs_sistema
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.perfis p
      WHERE p.id = auth.uid()
        AND p.perfil IN ('administrador', 'super_admin')
    )
  );
