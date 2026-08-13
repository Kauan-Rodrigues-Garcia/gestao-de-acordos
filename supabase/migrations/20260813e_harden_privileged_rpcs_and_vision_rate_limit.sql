-- Security hardening for privileged RPCs and the paid vision endpoint.
--
-- The project historically granted every SECURITY DEFINER function to PUBLIC,
-- anon and authenticated.  A SECURITY DEFINER function bypasses RLS, so the
-- write RPCs below must authenticate and authorize their caller internally.

-- ---------------------------------------------------------------------------
-- 1. Direto/Extra: replace the two legacy signatures with tenant-safe RPCs.
--    The NR/institution is now part of the request so the database can prove
--    that the caller is acting on the agreement that actually conflicted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_direto_extra_ativo(
  p_user_id    UUID,
  p_empresa_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_id  UUID;
  v_equipe_id UUID;
  v_ativo     BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: empresa fora do escopo do usuário'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.setor_id, p.equipe_id
    INTO v_setor_id, v_equipe_id
    FROM public.perfis p
   WHERE p.id = p_user_id
     AND p.empresa_id = p_empresa_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT c.ativo INTO v_ativo
    FROM public.direto_extra_config c
   WHERE c.empresa_id = p_empresa_id
     AND c.escopo = 'usuario'
     AND c.referencia_id = p_user_id
   LIMIT 1;
  IF FOUND THEN RETURN v_ativo; END IF;

  IF v_equipe_id IS NOT NULL THEN
    SELECT c.ativo INTO v_ativo
      FROM public.direto_extra_config c
     WHERE c.empresa_id = p_empresa_id
       AND c.escopo = 'equipe'
       AND c.referencia_id = v_equipe_id
     LIMIT 1;
    IF FOUND THEN RETURN v_ativo; END IF;
  END IF;

  IF v_setor_id IS NOT NULL THEN
    SELECT c.ativo INTO v_ativo
      FROM public.direto_extra_config c
     WHERE c.empresa_id = p_empresa_id
       AND c.escopo = 'setor'
       AND c.referencia_id = v_setor_id
     LIMIT 1;
    IF FOUND THEN RETURN v_ativo; END IF;
  END IF;

  RETURN FALSE;
END;
$$;

DROP FUNCTION IF EXISTS public.fn_vincular_extra_ao_direto(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, INTEGER
);

CREATE FUNCTION public.fn_vincular_extra_ao_direto(
  p_direto_id       UUID,
  p_extra_op_id     UUID,
  p_extra_op_nome   TEXT,
  p_valor           NUMERIC,
  p_vencimento      DATE,
  p_nome_cliente    TEXT,
  p_tipo            TEXT,
  p_nr_cliente      TEXT,
  p_instituicao     TEXT,
  p_whatsapp        TEXT DEFAULT NULL,
  p_parcelas        INTEGER DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              UUID := auth.uid();
  v_empresa_id       UUID;
  v_direto_operador  UUID;
  v_direto_tipo      TEXT;
  v_direto_vinculo   UUID;
  v_direto_nr        TEXT;
  v_direto_inst      TEXT;
  v_empresa_slug     TEXT;
  v_nome_real        TEXT;
  v_perfil_ativo     BOOLEAN;
  v_situacao         TEXT;
  v_arquivado        BOOLEAN;
BEGIN
  IF v_uid IS NULL OR v_uid IS DISTINCT FROM p_extra_op_id THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: o operador do vínculo deve ser o usuário autenticado'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.empresa_id, p.nome, p.ativo, p.situacao, p.arquivado, e.slug
    INTO v_empresa_id, v_nome_real, v_perfil_ativo, v_situacao, v_arquivado,
         v_empresa_slug
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
   WHERE p.id = v_uid;

  IF NOT FOUND OR NOT COALESCE(v_perfil_ativo, FALSE)
     OR COALESCE(v_arquivado, FALSE) OR v_situacao = 'desligado' THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: perfil inativo ou inexistente'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.operador_id, a.tipo_vinculo, a.vinculo_operador_id,
         TRIM(COALESCE(a.nr_cliente, '')), TRIM(COALESCE(a.instituicao, ''))
    INTO v_direto_operador, v_direto_tipo, v_direto_vinculo,
         v_direto_nr, v_direto_inst
    FROM public.acordos a
   WHERE a.id = p_direto_id
     AND a.empresa_id = v_empresa_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACORDO_NAO_ENCONTRADO: acordo fora da empresa do usuário'
      USING ERRCODE = '42501';
  END IF;

  IF v_direto_operador = v_uid
     OR COALESCE(v_direto_tipo, 'direto') <> 'direto'
     OR v_direto_vinculo IS NOT NULL THEN
    RAISE EXCEPTION 'VINCULO_INVALIDO: o acordo não é um DIRETO livre';
  END IF;

  IF (v_empresa_slug <> 'pagueplay' AND (
       v_direto_nr = ''
       OR v_direto_nr IS DISTINCT FROM TRIM(COALESCE(p_nr_cliente, ''))
     ))
     OR (v_empresa_slug = 'pagueplay' AND (
       v_direto_inst = ''
       OR v_direto_inst IS DISTINCT FROM TRIM(COALESCE(p_instituicao, ''))
     )) THEN
    RAISE EXCEPTION 'CHAVE_DIVERGENTE: NR/código não pertence ao acordo informado'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_direto_extra_ativo(v_uid, v_empresa_id)
     OR public.fn_direto_extra_ativo(v_direto_operador, v_empresa_id) THEN
    RAISE EXCEPTION 'REGRA_DIRETO_EXTRA_INVALIDA: configuração dos operadores não permite este vínculo'
      USING ERRCODE = '42501';
  END IF;

  -- The EXTRA is inserted first by the UI.  Requiring that reciprocal row
  -- prevents a caller from using this RPC as an arbitrary agreement updater.
  IF NOT EXISTS (
    SELECT 1
      FROM public.acordos e
     WHERE e.empresa_id = v_empresa_id
       AND e.operador_id = v_uid
       AND e.tipo_vinculo = 'extra'
       AND e.vinculo_operador_id = v_direto_operador
       AND (
         (v_empresa_slug <> 'pagueplay'
          AND TRIM(COALESCE(e.nr_cliente, '')) = v_direto_nr)
         OR (v_empresa_slug = 'pagueplay'
             AND TRIM(COALESCE(e.instituicao, '')) = v_direto_inst)
       )
  ) THEN
    RAISE EXCEPTION 'VINCULO_INVALIDO: acordo EXTRA correspondente não encontrado'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.acordos SET
    vinculo_operador_id   = v_uid,
    vinculo_operador_nome = v_nome_real,
    valor                 = p_valor,
    vencimento            = p_vencimento,
    nome_cliente          = p_nome_cliente,
    tipo                  = p_tipo,
    whatsapp              = p_whatsapp,
    parcelas              = p_parcelas
  WHERE id = p_direto_id;

  -- Kept only for wire compatibility; names are always sourced from perfis.
  PERFORM p_extra_op_nome;
END;
$$;

DROP FUNCTION IF EXISTS public.fn_converter_para_extra(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, INTEGER
);

CREATE FUNCTION public.fn_converter_para_extra(
  p_acordo_id           UUID,
  p_novo_direto_op_id   UUID,
  p_novo_direto_op_nome TEXT,
  p_valor               NUMERIC,
  p_vencimento          DATE,
  p_nome_cliente        TEXT,
  p_tipo                TEXT,
  p_nr_cliente          TEXT,
  p_instituicao         TEXT,
  p_whatsapp            TEXT DEFAULT NULL,
  p_parcelas            INTEGER DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              UUID := auth.uid();
  v_empresa_id       UUID;
  v_antigo_operador  UUID;
  v_tipo_vinculo     TEXT;
  v_vinculo_atual    UUID;
  v_nr_atual         TEXT;
  v_inst_atual       TEXT;
  v_empresa_slug     TEXT;
  v_nome_real        TEXT;
  v_perfil_ativo     BOOLEAN;
  v_situacao         TEXT;
  v_arquivado        BOOLEAN;
BEGIN
  IF v_uid IS NULL OR v_uid IS DISTINCT FROM p_novo_direto_op_id THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: o novo DIRETO deve ser o usuário autenticado'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.empresa_id, p.nome, p.ativo, p.situacao, p.arquivado, e.slug
    INTO v_empresa_id, v_nome_real, v_perfil_ativo, v_situacao, v_arquivado,
         v_empresa_slug
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
   WHERE p.id = v_uid;

  IF NOT FOUND OR NOT COALESCE(v_perfil_ativo, FALSE)
     OR COALESCE(v_arquivado, FALSE) OR v_situacao = 'desligado' THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: perfil inativo ou inexistente'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.operador_id, a.tipo_vinculo, a.vinculo_operador_id,
         TRIM(COALESCE(a.nr_cliente, '')), TRIM(COALESCE(a.instituicao, ''))
    INTO v_antigo_operador, v_tipo_vinculo, v_vinculo_atual,
         v_nr_atual, v_inst_atual
    FROM public.acordos a
   WHERE a.id = p_acordo_id
     AND a.empresa_id = v_empresa_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACORDO_NAO_ENCONTRADO: acordo fora da empresa do usuário'
      USING ERRCODE = '42501';
  END IF;

  IF v_antigo_operador = v_uid
     OR COALESCE(v_tipo_vinculo, 'direto') <> 'direto'
     OR v_vinculo_atual IS NOT NULL THEN
    RAISE EXCEPTION 'VINCULO_INVALIDO: somente um DIRETO livre pode virar EXTRA';
  END IF;

  IF (v_empresa_slug <> 'pagueplay' AND (
       v_nr_atual = ''
       OR v_nr_atual IS DISTINCT FROM TRIM(COALESCE(p_nr_cliente, ''))
     ))
     OR (v_empresa_slug = 'pagueplay' AND (
       v_inst_atual = ''
       OR v_inst_atual IS DISTINCT FROM TRIM(COALESCE(p_instituicao, ''))
     )) THEN
    RAISE EXCEPTION 'CHAVE_DIVERGENTE: NR/código não pertence ao acordo informado'
      USING ERRCODE = '42501';
  END IF;

  IF public.fn_direto_extra_ativo(v_uid, v_empresa_id)
     OR NOT public.fn_direto_extra_ativo(v_antigo_operador, v_empresa_id) THEN
    RAISE EXCEPTION 'REGRA_DIRETO_EXTRA_INVALIDA: configuração dos operadores não permite esta conversão'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.acordos SET
    tipo_vinculo          = 'extra',
    vinculo_operador_id   = v_uid,
    vinculo_operador_nome = v_nome_real,
    valor                 = p_valor,
    vencimento            = p_vencimento,
    nome_cliente          = p_nome_cliente,
    tipo                  = p_tipo,
    whatsapp              = p_whatsapp,
    parcelas              = p_parcelas
  WHERE id = p_acordo_id;

  DELETE FROM public.nr_registros WHERE acordo_id = p_acordo_id;

  -- Kept only for wire compatibility; names are always sourced from perfis.
  PERFORM p_novo_direto_op_nome;
END;
$$;

-- Synchronization can update the other operator's row by design.  Check the
-- caller against the same centralized permission rule used by Acordos RLS.
CREATE OR REPLACE FUNCTION public.fn_sync_par_vinculo(
  p_acordo_id    UUID,
  p_valor        NUMERIC,
  p_vencimento   DATE,
  p_nome_cliente TEXT,
  p_tipo         TEXT,
  p_whatsapp     TEXT DEFAULT NULL,
  p_parcelas     INTEGER DEFAULT 1,
  p_status       TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   UUID;
  v_nr_cliente   TEXT;
  v_instituicao  TEXT;
  v_tipo_vinculo TEXT;
  v_operador_id  UUID;
  v_vinculo_op   UUID;
  v_setor_id     UUID;
  v_num_parcela  INTEGER;
  v_par_id       UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  SELECT empresa_id, TRIM(COALESCE(nr_cliente, '')),
         TRIM(COALESCE(instituicao, '')), tipo_vinculo, operador_id,
         vinculo_operador_id, setor_id, numero_parcela
    INTO v_empresa_id, v_nr_cliente, v_instituicao, v_tipo_vinculo,
         v_operador_id, v_vinculo_op, v_setor_id, v_num_parcela
    FROM public.acordos
   WHERE id = p_acordo_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACORDO_NAO_ENCONTRADO';
  END IF;

  IF NOT public.fn_can_access_empresa(v_empresa_id)
     OR NOT public.fn_pode_gerir_acordo(v_setor_id, v_operador_id) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: usuário não pode gerir o acordo de origem'
      USING ERRCODE = '42501';
  END IF;

  IF v_vinculo_op IS NULL THEN RETURN; END IF;

  SELECT a.id INTO v_par_id
    FROM public.acordos a
   WHERE a.empresa_id = v_empresa_id
     AND a.id <> p_acordo_id
     AND a.operador_id = v_vinculo_op
     AND a.vinculo_operador_id = v_operador_id
     AND a.tipo_vinculo = CASE WHEN v_tipo_vinculo = 'extra' THEN 'direto' ELSE 'extra' END
     AND (
       (v_nr_cliente <> '' AND TRIM(COALESCE(a.nr_cliente, '')) = v_nr_cliente)
       OR (v_nr_cliente = '' AND v_instituicao <> ''
           AND TRIM(COALESCE(a.instituicao, '')) = v_instituicao)
     )
   ORDER BY (a.numero_parcela IS DISTINCT FROM v_num_parcela),
            a.numero_parcela NULLS LAST, a.criado_em
   LIMIT 1
   FOR UPDATE;

  IF v_par_id IS NULL THEN RETURN; END IF;

  UPDATE public.acordos SET
    valor        = p_valor,
    vencimento   = p_vencimento,
    nome_cliente = p_nome_cliente,
    tipo         = p_tipo,
    whatsapp     = p_whatsapp,
    parcelas     = p_parcelas,
    status       = COALESCE(p_status, status)
  WHERE id = v_par_id;
END;
$$;

-- The monthly snapshot previously accepted any company id from any logged-in
-- user.  Only leaders/management of that tenant (or super_admin) may rebuild it.
CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(
  p_empresa_id UUID,
  p_mes        TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linhas INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.fn_can_access_empresa(p_empresa_id)
    OR NOT (
      public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(
        ARRAY['lider','elite','gerencia','diretoria','administrador']
      )
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: usuário não pode gerar este retrato'
      USING ERRCODE = '42501';
  END IF;

  -- Calls without a JWT are accepted only for the database owner/pg_cron.
  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  DELETE FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  DELETE FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id;

  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone)
  SELECT p_empresa_id, p_mes, p.id, p.equipe_id,
         COALESCE(e.nome, 'Sem equipe'), COALESCE(e.setor_id, p.setor_id),
         COALESCE(p.situacao, 'ativo'),
         COALESCE((
           SELECT array_agg(c.equipe_id)
             FROM public.equipe_operadores_clones c
            WHERE c.empresa_id = p_empresa_id
              AND c.operador_id = p.id
              AND COALESCE(c.conta_recebimento, TRUE)
         ), '{}'::UUID[])
    FROM public.perfis p
    LEFT JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Persistent, concurrency-safe quota for paid server-side APIs.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  usuario_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rota             TEXT NOT NULL,
  janela_inicio    TIMESTAMPTZ NOT NULL DEFAULT now(),
  requisicoes      INTEGER NOT NULL DEFAULT 0 CHECK (requisicoes >= 0),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, rota)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.fn_api_rate_limit_consumir(
  p_usuario_id      UUID,
  p_rota            TEXT,
  p_limite          INTEGER,
  p_janela_segundos INTEGER
) RETURNS TABLE (
  permitido             BOOLEAN,
  restantes             INTEGER,
  tentar_novamente_em_s INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agora   TIMESTAMPTZ := clock_timestamp();
  v_inicio  TIMESTAMPTZ;
  v_contagem INTEGER;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: apenas o backend pode consumir a cota'
      USING ERRCODE = '42501';
  END IF;

  IF p_usuario_id IS NULL OR NULLIF(TRIM(p_rota), '') IS NULL
     OR p_limite < 1 OR p_limite > 10000
     OR p_janela_segundos < 1 OR p_janela_segundos > 86400 THEN
    RAISE EXCEPTION 'PARAMETROS_INVALIDOS: configuração de rate limit inválida';
  END IF;

  INSERT INTO public.api_rate_limits
    (usuario_id, rota, janela_inicio, requisicoes, atualizado_em)
  VALUES (p_usuario_id, TRIM(p_rota), v_agora, 0, v_agora)
  ON CONFLICT (usuario_id, rota) DO NOTHING;

  SELECT r.janela_inicio, r.requisicoes
    INTO v_inicio, v_contagem
    FROM public.api_rate_limits r
   WHERE r.usuario_id = p_usuario_id AND r.rota = TRIM(p_rota)
   FOR UPDATE;

  IF v_inicio <= v_agora - make_interval(secs => p_janela_segundos) THEN
    v_inicio := v_agora;
    v_contagem := 0;
  END IF;

  IF v_contagem >= p_limite THEN
    permitido := FALSE;
    restantes := 0;
    tentar_novamente_em_s := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (
        v_inicio + make_interval(secs => p_janela_segundos) - v_agora
      )))::INTEGER
    );
  ELSE
    v_contagem := v_contagem + 1;
    permitido := TRUE;
    restantes := GREATEST(0, p_limite - v_contagem);
    tentar_novamente_em_s := 0;
  END IF;

  UPDATE public.api_rate_limits
     SET janela_inicio = v_inicio,
         requisicoes = v_contagem,
         atualizado_em = v_agora
   WHERE usuario_id = p_usuario_id AND rota = TRIM(p_rota);

  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Privileges: SECURITY DEFINER is never available through PUBLIC.  The only
--    anonymous exceptions are the deliberately pre-login functions.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_func RECORD;
BEGIN
  FOR v_func IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      v_func.assinatura
    );
  END LOOP;

  -- Trigger functions and database maintenance jobs are not public RPCs.
  FOR v_func IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM authenticated',
      v_func.assinatura
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_comemoracao_faxina() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_composicao_mes_congelar() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_expurgar_cpf_chat() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_nr_dono_conflitante(UUID, TEXT, TEXT, UUID, UUID)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_nr_exigir_livre(UUID, TEXT, TEXT, UUID, UUID)
  FROM authenticated;

GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_email_por_usuario_empresa(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_log_login_recusado(TEXT, TEXT) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_vincular_extra_ao_direto(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_converter_para_extra(
  UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_par_vinculo(
  UUID, NUMERIC, DATE, TEXT, TEXT, TEXT, INTEGER, TEXT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_direto_extra_ativo(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_composicao_mes_snapshot(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_api_rate_limit_consumir(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_api_rate_limit_consumir(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMENT ON TABLE public.api_rate_limits IS
  'Persistent per-user quotas for paid server-side endpoints. No browser role has direct access.';
COMMENT ON FUNCTION public.fn_api_rate_limit_consumir(UUID, TEXT, INTEGER, INTEGER) IS
  'Atomically consumes one backend-only API quota unit and returns remaining capacity/retry delay.';
