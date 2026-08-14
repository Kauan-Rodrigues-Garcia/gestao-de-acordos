-- ============================================================
-- Migration 17: Signup/login tenant hardening
-- ============================================================
-- Fixes:
--   1. Keeps username lookup tenant-aware for Bookplay/PaguePlay.
--   2. Backfills missing perfis/usuario from auth.users metadata.
--   3. Makes the auth.users trigger preserve usuario even on fallback.
-- ============================================================

ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS usuario TEXT;

UPDATE public.perfis
SET usuario = lower(btrim(usuario))
WHERE usuario IS NOT NULL
  AND usuario <> lower(btrim(usuario));

CREATE INDEX IF NOT EXISTS idx_perfis_usuario_empresa_lookup
  ON public.perfis (lower(btrim(usuario)), empresa_id)
  WHERE usuario IS NOT NULL AND btrim(usuario) <> '';

UPDATE public.perfis p
SET usuario = COALESCE(
  NULLIF(lower(btrim(u.raw_user_meta_data->>'usuario')), ''),
  CASE
    WHEN lower(split_part(COALESCE(u.email, ''), '@', 2)) = 'interno.sistema'
      THEN NULLIF(lower(split_part(u.email, '@', 1)), '')
    ELSE NULL
  END
)
FROM auth.users u
WHERE p.id = u.id
  AND (p.usuario IS NULL OR btrim(p.usuario) = '')
  AND COALESCE(
    NULLIF(lower(btrim(u.raw_user_meta_data->>'usuario')), ''),
    CASE
      WHEN lower(split_part(COALESCE(u.email, ''), '@', 2)) = 'interno.sistema'
        THEN NULLIF(lower(split_part(u.email, '@', 1)), '')
      ELSE NULL
    END
  ) IS NOT NULL;

WITH auth_data AS (
  SELECT
    u.id,
    COALESCE(
      NULLIF(btrim(u.raw_user_meta_data->>'nome'), ''),
      NULLIF(split_part(lower(COALESCE(u.email, '')), '@', 1), ''),
      u.id::text
    ) AS nome,
    lower(btrim(COALESCE(u.email, ''))) AS email,
    COALESCE(
      NULLIF(lower(btrim(u.raw_user_meta_data->>'usuario')), ''),
      CASE
        WHEN lower(split_part(COALESCE(u.email, ''), '@', 2)) = 'interno.sistema'
          THEN NULLIF(lower(split_part(u.email, '@', 1)), '')
        ELSE NULL
      END
    ) AS usuario,
    NULLIF(lower(btrim(u.raw_user_meta_data->>'empresa_slug')), '') AS empresa_slug,
    NULLIF(btrim(u.raw_user_meta_data->>'empresa_id'), '') AS empresa_id_meta,
    NULLIF(lower(btrim(u.raw_user_meta_data->>'perfil')), '') AS perfil_meta
  FROM auth.users u
),
resolved AS (
  SELECT
    a.id,
    a.nome,
    a.email,
    a.usuario,
    CASE
      WHEN a.perfil_meta IN ('operador', 'lider', 'administrador', 'super_admin')
        THEN a.perfil_meta::public.perfil_usuario
      ELSE 'operador'::public.perfil_usuario
    END AS perfil,
    COALESCE(e_by_id.id, e_by_slug.id, e_default.id) AS empresa_id
  FROM auth_data a
  LEFT JOIN public.empresas e_by_id
    ON e_by_id.id = CASE
      WHEN a.empresa_id_meta ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN a.empresa_id_meta::uuid
      ELSE NULL
    END
  LEFT JOIN public.empresas e_by_slug
    ON e_by_slug.slug = a.empresa_slug
  LEFT JOIN LATERAL (
    SELECT id
    FROM public.empresas
    WHERE ativo = true
    ORDER BY
      CASE slug
        WHEN 'bookplay' THEN 0
        WHEN 'pagueplay' THEN 1
        ELSE 2
      END,
      criado_em
    LIMIT 1
  ) e_default ON true
)
INSERT INTO public.perfis (id, nome, email, perfil, empresa_id, usuario)
SELECT id, nome, email, perfil, empresa_id, usuario
FROM resolved
WHERE NOT EXISTS (
  SELECT 1
  FROM public.perfis p
  WHERE p.id = resolved.id
)
ON CONFLICT (id) DO UPDATE SET
  usuario = COALESCE(public.perfis.usuario, EXCLUDED.usuario),
  empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id),
  email = COALESCE(NULLIF(public.perfis.email, ''), EXCLUDED.email),
  nome = COALESCE(NULLIF(public.perfis.nome, ''), EXCLUDED.nome);

UPDATE public.perfis p
SET perfil = 'lider'::public.perfil_usuario
FROM auth.users u
WHERE p.id = u.id
  AND p.perfil = 'operador'::public.perfil_usuario
  AND lower(btrim(u.raw_user_meta_data->>'source')) = 'self_registration';

CREATE OR REPLACE FUNCTION public.buscar_email_por_usuario_empresa(
  p_usuario TEXT,
  p_empresa_slug TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
  v_usuario TEXT;
  v_slug TEXT;
BEGIN
  v_usuario := NULLIF(lower(btrim(COALESCE(p_usuario, ''))), '');
  v_slug := NULLIF(lower(btrim(COALESCE(p_empresa_slug, ''))), '');

  IF v_usuario IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.email INTO v_email
  FROM public.perfis p
  LEFT JOIN public.empresas e ON e.id = p.empresa_id
  WHERE p.usuario IS NOT NULL
    AND lower(btrim(p.usuario)) = v_usuario
    AND p.ativo = true
    AND (v_slug IS NULL OR e.slug = v_slug)
  ORDER BY p.criado_em DESC
  LIMIT 1;

  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.buscar_email_por_usuario(p_usuario TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.buscar_email_por_usuario_empresa(p_usuario, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario_empresa(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario_empresa(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(TEXT) TO authenticated;

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
  v_nome            := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'nome', '')), '');
  v_email           := lower(BTRIM(COALESCE(NEW.email, '')));
  v_email_nome_base := NULLIF(split_part(NULLIF(v_email, ''), '@', 1), '');
  v_perfil_meta     := lower(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'perfil', '')), ''));
  v_usuario         := NULLIF(lower(BTRIM(COALESCE(NEW.raw_user_meta_data->>'usuario', ''))), '');

  IF v_usuario = 'null' THEN
    v_usuario := NULL;
  END IF;

  IF v_usuario IS NULL AND split_part(v_email, '@', 2) = 'interno.sistema' THEN
    v_usuario := v_email_nome_base;
  END IF;

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
    WHERE ativo = true
    ORDER BY
      CASE slug
        WHEN 'bookplay' THEN 0
        WHEN 'pagueplay' THEN 1
        ELSE 2
      END,
      criado_em
    LIMIT 1;
  END IF;

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

  IF v_perfil_meta IN ('operador', 'lider', 'administrador', 'super_admin') THEN
    v_perfil_val := v_perfil_meta::public.perfil_usuario;
  ELSE
    v_perfil_val := 'operador'::public.perfil_usuario;
  END IF;

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
    setor_id   = COALESCE(public.perfis.setor_id, EXCLUDED.setor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id),
    usuario    = COALESCE(EXCLUDED.usuario, public.perfis.usuario);

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
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

DROP TRIGGER IF EXISTS trg_novo_usuario ON auth.users;
CREATE TRIGGER trg_novo_usuario
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_criar_perfil_novo_usuario();
