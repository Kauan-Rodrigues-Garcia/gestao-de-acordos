-- ============================================================
-- Migration 12: Hardening signup/profile creation
-- ============================================================

-- Garantir tenants padrão usados pelo cadastro.
INSERT INTO public.empresas (nome, slug)
VALUES
  ('BOOKPLAY', 'bookplay'),
  ('PAGUEPLAY', 'pagueplay')
ON CONFLICT (slug) DO UPDATE
SET nome = EXCLUDED.nome;

-- Torna o trigger de signup resiliente a metadados inválidos ou incompletos.
CREATE OR REPLACE FUNCTION public.fn_criar_perfil_novo_usuario()
RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id UUID;
  v_empresa_id_meta TEXT;
  v_empresa_slug TEXT;
  v_nome TEXT;
  v_email TEXT;
  v_email_nome_base TEXT;
  v_perfil_meta TEXT;
  v_setor_id UUID;
  v_setor_id_meta TEXT;
BEGIN
  v_nome := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'nome', '')), '');
  v_email := lower(BTRIM(COALESCE(NEW.email, '')));
  v_email_nome_base := NULLIF(split_part(NULLIF(v_email, ''), '@', 1), '');
  v_perfil_meta := lower(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'perfil', '')), ''));
  v_empresa_id_meta := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'empresa_id', '')), '');
  v_empresa_slug := lower(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'empresa_slug', '')), ''));
  v_setor_id_meta := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'setor_id', '')), '');

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
        WHEN 'bookplay' THEN 0
        WHEN 'pagueplay' THEN 1
        ELSE 2
      END,
      criado_em
    LIMIT 1;
  END IF;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível resolver empresa_id para o novo usuário.';
  END IF;

  IF v_setor_id_meta IS NOT NULL THEN
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

  INSERT INTO public.perfis (id, nome, email, perfil, setor_id, empresa_id)
  VALUES (
    NEW.id,
    COALESCE(v_nome, v_email_nome_base, NEW.id::text),
    v_email,
    CASE
      WHEN v_perfil_meta IN ('operador', 'lider', 'administrador', 'super_admin')
        THEN v_perfil_meta::perfil_usuario
      ELSE 'operador'::perfil_usuario
    END,
    v_setor_id,
    v_empresa_id
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    perfil = EXCLUDED.perfil,
    setor_id = COALESCE(public.perfis.setor_id, EXCLUDED.setor_id),
    empresa_id = COALESCE(public.perfis.empresa_id, EXCLUDED.empresa_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
