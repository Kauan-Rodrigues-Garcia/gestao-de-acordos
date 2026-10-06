-- ============================================================================
-- Segurança: cadastro não escolhe cargo, ninguém se promove nem muda o
-- próprio alcance
-- ============================================================================
--
-- Auditoria de segurança de 06/10/2026 (conferida no banco):
--
--   1. `fn_criar_perfil_novo_usuario` gravava o cargo vindo de
--      `raw_user_meta_data`, inclusive `super_admin`. Com o cadastro público
--      ligado (a tela de Usuários criava contas por `signUp` no navegador),
--      qualquer pessoa com a chave pública criava a própria conta super_admin.
--      Agora o cargo e o setor do metadado só valem em script manual
--      (`session_user = 'postgres'`: SQL Editor, psql). Pelo GoTrue — cadastro
--      ou Admin API — a conta nasce `operador`, sem setor; quem cria pela
--      administração é `/api/criar-usuario`, que grava cargo e setor depois.
--
--   2. `fn_impedir_escalada_de_cargo` só barrava mudar o PRÓPRIO cargo. Quem
--      tinha `usuarios_administrar` dava `super_admin` a outra pessoa. Agora:
--      `super_admin` só é dado ou tirado por super_admin; `administrador`, só
--      pela administração. A trava passa a valer também no INSERT (a policy
--      `perfis_insert` deixa a pessoa inserir a própria linha): linha própria
--      nasce `operador`.
--
--   3. `perfis_update_own` deixava a pessoa mudar o próprio setor, equipe,
--      situação, ativo... — o próprio alcance. Gatilho novo
--      `fn_perfis_proprio_sem_alcance` barra essas colunas na própria linha,
--      salvo super_admin e quem tem `usuarios_administrar`. Foto, tour,
--      senha, nome e afins continuam livres.
--
-- Sem sessão de usuário (service_role, robô, SQL Editor) nada muda.
-- Só funções e gatilhos. Reaplicável.
--
-- APLICADA em 06/10/2026 pelo SQL Editor (Cleber), conferida pelo MCP logo
-- depois: funções trocadas, os 3 gatilhos de pé, anon sem EXECUTE no cadastro.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. Cadastro: o cargo não vem do usuário ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_criar_perfil_novo_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Script manual (SQL Editor / psql). Pelo GoTrue a sessão é
  -- `supabase_auth_admin`, e o metadado é de quem se cadastrou: não decide nada.
  v_manual          BOOLEAN := session_user = 'postgres';
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

  -- Setor: só em script manual. Pela administração, `/api/criar-usuario` grava.
  IF v_manual AND v_setor_id_meta IS NOT NULL AND v_empresa_id IS NOT NULL THEN
    BEGIN
      SELECT s.id INTO v_setor_id FROM public.setores s
      WHERE s.id = v_setor_id_meta::UUID AND s.empresa_id = v_empresa_id;
    EXCEPTION WHEN invalid_text_representation THEN v_setor_id := NULL; END;
  END IF;

  -- Cargo: só em script manual; senão, `operador`.
  v_perfil_val := 'operador'::public.perfil_usuario;
  IF v_manual AND v_perfil_meta IN (
    'operador', 'lider', 'administrador', 'super_admin',
    'elite', 'gerencia', 'diretoria', 'ouvidoria'
  ) THEN
    BEGIN
      v_perfil_val := v_perfil_meta::public.perfil_usuario;
    EXCEPTION WHEN invalid_text_representation THEN
      v_perfil_val := 'operador'::public.perfil_usuario;
    END;
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
    -- Linha que já existia mantém o cargo, salvo script manual.
    perfil     = CASE WHEN v_manual THEN EXCLUDED.perfil ELSE public.perfis.perfil END,
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
$function$;

-- ── 2. Ninguém se promove; só super_admin dá super_admin ───────────────────

CREATE OR REPLACE FUNCTION public.fn_impedir_escalada_de_cargo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- A tela de usuários manda `perfil` no payload mesmo quando só corrigiu o
  -- nome. Valor igual não é mudança de cargo.
  IF TG_OP = 'UPDATE' AND NEW.perfil IS NOT DISTINCT FROM OLD.perfil THEN
    RETURN NEW;
  END IF;

  -- Sem sessão de usuário: service_role, robô, SQL Editor, migrations.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- super_admin é a saída de manutenção.
  IF public.fn_user_is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    -- `perfis_insert` deixa a pessoa criar a própria linha: ela nasce operador.
    IF TG_OP = 'INSERT' AND NEW.perfil::TEXT = 'operador' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Ninguém altera o próprio cargo. Peça a um administrador.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.perfil::TEXT = 'super_admin'
     OR (TG_OP = 'UPDATE' AND OLD.perfil::TEXT = 'super_admin') THEN
    RAISE EXCEPTION 'Só um super_admin dá ou tira o cargo de super_admin.'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.perfil::TEXT = 'administrador' OR (TG_OP = 'UPDATE' AND OLD.perfil::TEXT = 'administrador'))
     AND public.fn_user_perfil() IS DISTINCT FROM 'administrador' THEN
    RAISE EXCEPTION 'Só a administração dá ou tira o cargo de administrador.'
      USING ERRCODE = '42501';
  END IF;

  -- O resto (quem pode mexer no cargo de quem) é da RLS de `perfis`.
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_impedir_escalada_de_cargo ON public.perfis;
CREATE TRIGGER trg_impedir_escalada_de_cargo
  BEFORE INSERT OR UPDATE OF perfil ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_impedir_escalada_de_cargo();

-- ── 3. Ninguém muda o próprio alcance ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_perfis_proprio_sem_alcance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NEW.id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  IF public.fn_user_is_super_admin() OR public.fn_user_tem('usuarios_administrar') THEN
    RETURN NEW;
  END IF;
  IF NEW.setor_id            IS DISTINCT FROM OLD.setor_id
  OR NEW.equipe_id           IS DISTINCT FROM OLD.equipe_id
  OR NEW.subgrupo_id         IS DISTINCT FROM OLD.subgrupo_id
  OR NEW.situacao            IS DISTINCT FROM OLD.situacao
  OR NEW.ativo               IS DISTINCT FROM OLD.ativo
  OR NEW.arquivado           IS DISTINCT FROM OLD.arquivado
  OR NEW.robo                IS DISTINCT FROM OLD.robo
  OR NEW.lider_id            IS DISTINCT FROM OLD.lider_id
  OR NEW.ia_tipo_id          IS DISTINCT FROM OLD.ia_tipo_id
  OR NEW.acesso_multiempresa IS DISTINCT FROM OLD.acesso_multiempresa
  OR NEW.desligado_em        IS DISTINCT FROM OLD.desligado_em
  OR NEW.chat_bloqueado      IS DISTINCT FROM OLD.chat_bloqueado THEN
    RAISE EXCEPTION 'Ninguém altera o próprio setor, equipe ou situação. Peça a um administrador.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_perfis_proprio_sem_alcance ON public.perfis;
CREATE TRIGGER trg_perfis_proprio_sem_alcance
  BEFORE UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.fn_perfis_proprio_sem_alcance();

-- Gatilhos não precisam de EXECUTE para ninguém.
REVOKE ALL ON FUNCTION public.fn_criar_perfil_novo_usuario()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_impedir_escalada_de_cargo()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_perfis_proprio_sem_alcance() FROM PUBLIC, anon, authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF pg_get_functiondef('public.fn_criar_perfil_novo_usuario()'::regprocedure) NOT LIKE '%v_manual%' THEN
    RAISE EXCEPTION 'O gatilho de cadastro não foi trocado.';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.perfis'::regclass AND NOT tgisinternal
         AND tgname IN ('trg_impedir_escalada_de_cargo', 'trg_perfis_proprio_sem_alcance')) <> 2 THEN
    RAISE EXCEPTION 'Gatilhos de perfis ausentes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_novo_usuario' AND tgrelid = 'auth.users'::regclass) THEN
    RAISE EXCEPTION 'O gatilho de cadastro em auth.users sumiu.';
  END IF;
END
$prova$;

COMMIT;
