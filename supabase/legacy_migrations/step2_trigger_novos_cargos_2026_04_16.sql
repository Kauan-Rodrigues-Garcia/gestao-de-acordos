
-- ============================================================
-- Step 2: Corrigir trigger de signup para aceitar novos cargos
-- ============================================================
-- PROBLEMA: a migration 17 tinha a lógica:
--   IF v_perfil_meta IN ('operador','lider','administrador','super_admin') ...
--   ELSE v_perfil_val := 'operador'
-- → qualquer cargo fora dessa lista (elite/gerencia/diretoria) era
--   silenciosamente rebaixado para 'operador'.
-- CORREÇÃO: adicionar os 3 novos cargos à lista aceita.

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
  v_perfil_val      public.perfil_usuario;
  v_setor_id        UUID;
  v_setor_id_meta   TEXT;
  v_usuario         TEXT;
BEGIN
  -- ── Extrair metadados ────────────────────────────────────────────────────
  v_nome            := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'nome', '')), '');
  v_email           := lower(BTRIM(COALESCE(NEW.email, '')));
  v_email_nome_base := NULLIF(split_part(NULLIF(v_email, ''), '@', 1), '');
  v_perfil_meta     := lower(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'perfil', '')), ''));
  v_usuario         := NULLIF(lower(BTRIM(COALESCE(NEW.raw_user_meta_data->>'usuario', ''))), '');

  IF v_usuario = 'null' THEN v_usuario := NULL; END IF;
  -- Emails @interno.sistema usam a parte local como username
  IF v_usuario IS NULL AND split_part(v_email, '@', 2) = 'interno.sistema' THEN
    v_usuario := v_email_nome_base;
  END IF;

  v_empresa_id_meta := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'empresa_id', '')), '');
  IF v_empresa_id_meta = 'null' THEN v_empresa_id_meta := NULL; END IF;

  v_empresa_slug := lower(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'empresa_slug', '')), ''));
  IF v_empresa_slug = 'null' THEN v_empresa_slug := NULL; END IF;

  v_setor_id_meta := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'setor_id', '')), '');
  IF v_setor_id_meta = 'null' THEN v_setor_id_meta := NULL; END IF;

  -- ── Resolver empresa_id ──────────────────────────────────────────────────
  IF v_empresa_id_meta IS NOT NULL THEN
    BEGIN
      SELECT id INTO v_empresa_id
      FROM public.empresas WHERE id = v_empresa_id_meta::UUID;
    EXCEPTION WHEN invalid_text_representation THEN v_empresa_id := NULL; END;
  END IF;

  IF v_empresa_id IS NULL AND v_empresa_slug IS NOT NULL THEN
    SELECT id INTO v_empresa_id FROM public.empresas WHERE slug = v_empresa_slug;
  END IF;

  IF v_empresa_id IS NULL THEN
    SELECT id INTO v_empresa_id FROM public.empresas
    WHERE ativo = true
    ORDER BY CASE slug WHEN 'bookplay' THEN 0 WHEN 'pagueplay' THEN 1 ELSE 2 END, criado_em
    LIMIT 1;
  END IF;

  -- ── Resolver setor_id ────────────────────────────────────────────────────
  IF v_setor_id_meta IS NOT NULL AND v_empresa_id IS NOT NULL THEN
    BEGIN
      SELECT s.id INTO v_setor_id
      FROM public.setores s
      WHERE s.id = v_setor_id_meta::UUID AND s.empresa_id = v_empresa_id;
    EXCEPTION WHEN invalid_text_representation THEN v_setor_id := NULL; END;
  END IF;

  -- ── Resolver perfil — TODOS os cargos válidos incluídos ─────────────────
  -- BUG ANTERIOR: só aceitava operador/lider/administrador/super_admin.
  -- CORREÇÃO: inclui elite, gerencia e diretoria.
  IF v_perfil_meta IN (
    'operador', 'lider', 'administrador', 'super_admin',
    'elite', 'gerencia', 'diretoria'
  ) THEN
    BEGIN
      v_perfil_val := v_perfil_meta::public.perfil_usuario;
    EXCEPTION WHEN invalid_text_representation THEN
      -- enum pode não ter o valor ainda em DBs muito antigos
      v_perfil_val := 'operador'::public.perfil_usuario;
    END;
  ELSE
    v_perfil_val := 'operador'::public.perfil_usuario;
  END IF;

  -- ── Inserir / upsert perfil ──────────────────────────────────────────────
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
    -- Fallback de último recurso: nunca deixar o signup falhar
    INSERT INTO public.perfis (id, nome, email, perfil, empresa_id, usuario)
    VALUES (
      NEW.id,
      COALESCE(
        NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'nome', '')), ''),
        split_part(lower(BTRIM(COALESCE(NEW.email, ''))), '@', 1),
        NEW.id::text
      ),
      lower(BTRIM(COALESCE(NEW.email, ''))),
      'operador'::public.perfil_usuario,
      v_empresa_id,
      COALESCE(
        NULLIF(lower(BTRIM(COALESCE(NEW.raw_user_meta_data->>'usuario', ''))), ''),
        CASE
          WHEN split_part(lower(BTRIM(COALESCE(NEW.email, ''))), '@', 2) = 'interno.sistema'
            THEN NULLIF(split_part(lower(BTRIM(COALESCE(NEW.email, ''))), '@', 1), '')
          ELSE NULL
        END
      )
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar trigger (idempotente)
DROP TRIGGER IF EXISTS trg_novo_usuario ON auth.users;
CREATE TRIGGER trg_novo_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_criar_perfil_novo_usuario();
