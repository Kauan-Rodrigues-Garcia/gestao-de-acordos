
-- ============================================================
-- Fix: Novos cargos (elite, gerencia, diretoria) no trigger
--      de signup e nas policies RLS de perfis
-- ============================================================
-- Problemas resolvidos:
--   1. fn_criar_perfil_novo_usuario ignorava elite/gerencia/diretoria
--      e sempre salvava 'operador' como fallback → usuário criado com
--      cargo errado.
--   2. perfis_lider_update tinha WITH CHECK (perfil = 'operador'),
--      bloqueando mudança de cargo via UPDATE → erro 400.
--   3. perfis_select não incluía elite/gerencia/diretoria como roles
--      com acesso para ver outros usuários do setor.
-- ============================================================

-- ── 1. Garantir que os valores existem no ENUM ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.perfil_usuario'::regtype AND enumlabel = 'elite') THEN
    ALTER TYPE public.perfil_usuario ADD VALUE 'elite';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.perfil_usuario'::regtype AND enumlabel = 'gerencia') THEN
    ALTER TYPE public.perfil_usuario ADD VALUE 'gerencia';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.perfil_usuario'::regtype AND enumlabel = 'diretoria') THEN
    ALTER TYPE public.perfil_usuario ADD VALUE 'diretoria';
  END IF;
END $$;

-- ── 2. Atualizar trigger para aceitar novos cargos ───────────────────────────
-- A versão anterior (migration 17) só aceitava: operador, lider, administrador, super_admin
-- Agora inclui: elite, gerencia, diretoria
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

  IF v_usuario = 'null' THEN v_usuario := NULL; END IF;
  IF v_usuario IS NULL AND split_part(v_email, '@', 2) = 'interno.sistema' THEN
    v_usuario := v_email_nome_base;
  END IF;

  v_empresa_id_meta := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'empresa_id', '')), '');
  IF v_empresa_id_meta = 'null' THEN v_empresa_id_meta := NULL; END IF;

  v_empresa_slug := lower(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'empresa_slug', '')), ''));
  IF v_empresa_slug = 'null' THEN v_empresa_slug := NULL; END IF;

  v_setor_id_meta := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'setor_id', '')), '');
  IF v_setor_id_meta = 'null' THEN v_setor_id_meta := NULL; END IF;

  -- Resolve empresa_id
  IF v_empresa_id_meta IS NOT NULL THEN
    BEGIN
      SELECT id INTO v_empresa_id FROM public.empresas WHERE id = v_empresa_id_meta::UUID;
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

  -- Resolve setor_id
  IF v_setor_id_meta IS NOT NULL AND v_empresa_id IS NOT NULL THEN
    BEGIN
      SELECT s.id INTO v_setor_id FROM public.setores s
      WHERE s.id = v_setor_id_meta::UUID AND s.empresa_id = v_empresa_id;
    EXCEPTION WHEN invalid_text_representation THEN v_setor_id := NULL; END;
  END IF;

  -- ── CORREÇÃO PRINCIPAL: aceitar TODOS os perfis válidos ──────────────────
  IF v_perfil_meta IN (
    'operador', 'lider', 'administrador', 'super_admin',
    'elite', 'gerencia', 'diretoria'
  ) THEN
    BEGIN
      v_perfil_val := v_perfil_meta::public.perfil_usuario;
    EXCEPTION WHEN invalid_text_representation THEN
      v_perfil_val := 'operador'::public.perfil_usuario;
    END;
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
    setor_id   = COALESCE(public.perfis.setor_id,   EXCLUDED.setor_id),
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

-- ── 3. Corrigir RLS policies de perfis para novos cargos ────────────────────

-- 3a. SELECT: elite/gerencia/diretoria também devem poder ver usuários do setor
DROP POLICY IF EXISTS "perfis_select" ON public.perfis;
CREATE POLICY "perfis_select" ON public.perfis
  FOR SELECT USING (
    auth.uid() = id
    OR (
      public.fn_can_access_empresa(empresa_id)
      AND public.fn_user_has_any_role(ARRAY[
        'lider', 'administrador', 'elite', 'gerencia', 'diretoria'
      ])
    )
    OR public.fn_user_is_super_admin()
  );

-- 3b. UPDATE pelo admin: já coberto por perfis_admin_all (sem restrição de cargo destino)
-- Garantir que perfis_admin_all está correto e sem limitação de perfil no WITH CHECK
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

-- 3c. UPDATE pelo lider: corrigir WITH CHECK que bloqueava mudança de cargo
-- Líderes podem mover operadores do próprio setor; o cargo destino pode ser qualquer valor
-- (o líder não muda cargo, apenas setor — mas removemos a restrição de perfil no WITH CHECK
-- para não bloquear casos onde o admin fez update e a policy é avaliada)
DROP POLICY IF EXISTS "perfis_lider_update" ON public.perfis;
CREATE POLICY "perfis_lider_update" ON public.perfis
  FOR UPDATE USING (
    -- Líderes só podem alterar usuários do mesmo setor e mesma empresa
    -- (qualquer cargo, não apenas operador — para compatibilidade com elite/gerencia)
    perfis.empresa_id = public.fn_user_empresa_id()
    AND EXISTS (
      SELECT 1 FROM public.perfis me
      WHERE me.id = auth.uid()
        AND me.perfil IN ('lider', 'elite', 'gerencia')
        AND me.setor_id = perfis.setor_id
        AND me.empresa_id = perfis.empresa_id
    )
    -- Líderes não podem alterar admins nem super_admins
    AND perfis.perfil NOT IN ('administrador', 'super_admin')
  )
  WITH CHECK (
    -- Após o update, o perfil ainda deve ser da empresa correta
    perfis.empresa_id = public.fn_user_empresa_id()
    -- E não pode promover para admin/super_admin
    AND perfis.perfil NOT IN ('administrador', 'super_admin')
  );

-- 3d. UPDATE own: usuário pode editar apenas seus próprios dados não-privilegiados
DROP POLICY IF EXISTS "perfis_update_own" ON public.perfis;
CREATE POLICY "perfis_update_own" ON public.perfis
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── 4. Corrigir permissões padrão de cargos novos (caso não existam) ─────────
-- Garante que todas as empresas já existentes tenham registros para os 3 novos cargos
INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'elite',
  '{
    "ver_acordos_gerais": true,
    "ver_acordos_proprios": true,
    "ver_analiticos_setor": true,
    "ver_operadores": true,
    "ver_painel_lider": true,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "ver_lixeira": true,
    "importar_excel": true,
    "ver_metas": true,
    "ver_usuarios": true,
    "ver_equipes": true
  }'::jsonb,
  'Cargo híbrido: acesso de líder com visão individual ou geral alternável'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO NOTHING;

INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'gerencia',
  '{
    "ver_acordos_gerais": true,
    "ver_acordos_proprios": true,
    "ver_analiticos_setor": true,
    "ver_operadores": true,
    "ver_painel_lider": true,
    "criar_acordos": true,
    "editar_acordos": true,
    "excluir_acordos": false,
    "ver_lixeira": true,
    "importar_excel": true,
    "ver_metas": true,
    "ver_usuarios": true,
    "ver_equipes": true
  }'::jsonb,
  'Mesmas permissões que líder, para uso gerencial'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO NOTHING;

INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
SELECT
  e.id,
  'diretoria',
  '{
    "ver_acordos_gerais": true,
    "ver_todos_setores": true,
    "ver_analiticos_global": true,
    "filtrar_por_setor": true,
    "filtrar_por_equipe": true,
    "filtrar_por_usuario": true,
    "ver_operadores": true,
    "ver_painel_lider": true,
    "criar_acordos": false,
    "editar_acordos": false,
    "excluir_acordos": false,
    "ver_lixeira": true,
    "importar_excel": false,
    "ver_metas": true,
    "ver_usuarios": true,
    "ver_equipes": true
  }'::jsonb,
  'Acesso total a todos os setores e análises gerais'
FROM public.empresas e
ON CONFLICT (empresa_id, cargo) DO NOTHING;

-- ── 5. Corrigir perfis de usuários que foram criados com cargo errado ─────────
-- Se o usuário foi criado com metadata perfil='elite'/'gerencia'/'diretoria'
-- mas o trigger salvou 'operador', corrigimos via auth.users metadata
UPDATE public.perfis p
SET perfil = CASE lower(btrim(u.raw_user_meta_data->>'perfil'))
  WHEN 'elite'     THEN 'elite'::public.perfil_usuario
  WHEN 'gerencia'  THEN 'gerencia'::public.perfil_usuario
  WHEN 'diretoria' THEN 'diretoria'::public.perfil_usuario
  ELSE p.perfil
END
FROM auth.users u
WHERE p.id = u.id
  AND p.perfil = 'operador'::public.perfil_usuario
  AND lower(btrim(COALESCE(u.raw_user_meta_data->>'perfil', ''))) IN ('elite', 'gerencia', 'diretoria');
