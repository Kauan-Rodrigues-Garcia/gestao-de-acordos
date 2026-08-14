-- Baseline oficial do schema public extraída do projeto vfrvvoetidtsqbbhdkmj.
-- Snapshot sem dados, gerado por pg_dump 17.11 contra PostgreSQL 17.6.
-- Os scripts anteriores estão preservados apenas como arquivo histórico e não devem ser reaplicados.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Extensions used by defaults and trigram indexes in the public schema.
-- pg_dump omits extension-owned objects from a schema-only dump, so the
-- extensions must be declared explicitly for a clean database reset.
--

CREATE SCHEMA IF NOT EXISTS "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";


--
-- Name: perfil_usuario; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."perfil_usuario" AS ENUM (
    'operador',
    'lider',
    'administrador',
    'super_admin',
    'elite',
    'gerencia',
    'diretoria',
    'ouvidoria'
);


--
-- Name: status_acordo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."status_acordo" AS ENUM (
    'pendente',
    'pago',
    'verificar',
    'vencido',
    'cancelado',
    'em_acompanhamento'
);


--
-- Name: tipo_acordo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."tipo_acordo" AS ENUM (
    'boleto',
    'pix',
    'cartao'
);


--
-- Name: buscar_email_por_usuario("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."buscar_email_por_usuario"("p_usuario" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Slug NULL = procura em todas as empresas. É o fallback do login cruzado:
  -- quem digita o nome de usuário no site da outra empresa chega aqui.
  --
  -- A trava de tenant continua valendo DEPOIS, no `fetchPerfil`: quem não é
  -- super_admin autentica e é recusado com "seu usuário está vinculado a outra
  -- empresa". Esta função resolve endereço, não decide acesso.
  RETURN public.buscar_email_por_usuario_empresa(p_usuario, NULL);
END $$;


--
-- Name: FUNCTION "buscar_email_por_usuario"("p_usuario" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."buscar_email_por_usuario"("p_usuario" "text") IS 'Resolve nome de usuário para e-mail em QUALQUER empresa — fallback do login pelo site da outra operação, usado por super_admin. NÃO pode ser sobrecarregada: duas versões deste nome tornam a chamada ambígua para o PostgREST (PGRST203) e derrubam o login cruzado. Ver 20260812c.';


--
-- Name: buscar_email_por_usuario_empresa("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."buscar_email_por_usuario_empresa"("p_usuario" "text", "p_empresa_slug" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: fn_acordo_exige_estado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_acordo_exige_estado"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_slug     TEXT;
  v_prefixo  TEXT;
  v_atual    TEXT;
BEGIN
  SELECT e.slug INTO v_slug FROM public.empresas e WHERE e.id = NEW.empresa_id;
  IF v_slug IS DISTINCT FROM 'pagueplay' THEN
    RETURN NEW;
  END IF;

  -- `estado_uf` é char(2): vem preenchido com espaço, então o TRIM é necessário
  -- para distinguir "sem estado" de "estado gravado".
  v_atual := NULLIF(TRIM(COALESCE(NEW.estado_uf, '')), '');

  IF v_atual IS NULL THEN
    -- Herda do prefixo legado [ESTADO:XX] em observacoes.
    v_prefixo := (regexp_match(COALESCE(NEW.observacoes, ''), '^\[ESTADO:([A-Za-z]{2})\]'))[1];
    IF v_prefixo IS NOT NULL THEN
      NEW.estado_uf := UPPER(v_prefixo);
      v_atual       := UPPER(v_prefixo);
    END IF;
  ELSE
    NEW.estado_uf := UPPER(v_atual);
  END IF;

  IF v_atual IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'Estado (UF) obrigatório: nenhum acordo da PaguePlay pode ser salvo sem o estado do cliente.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- UPDATE: só barra quem está APAGANDO um estado que existia.
  IF NULLIF(TRIM(COALESCE(OLD.estado_uf, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION
      'Estado (UF) obrigatório: não é possível remover o estado de um acordo já tabulado.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION "fn_acordo_exige_estado"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_acordo_exige_estado"() IS 'PaguePlay: exige estado_uf em todo INSERT de acordo e impede que um estado existente seja apagado. Normaliza a partir do prefixo [ESTADO:XX] de observacoes, que é como os fluxos de reagendamento transportam a UF.';


--
-- Name: fn_acordo_recusa_cpf(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_acordo_recusa_cpf"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- No UPDATE só interessa o campo que MUDOU: linha antiga com CPF segue
  -- editável (é assim que ela vai ser corrigida) e segue podendo ser paga.
  IF public.fn_texto_tem_cpf(NEW.instituicao)
     AND (TG_OP = 'INSERT' OR NEW.instituicao IS DISTINCT FROM OLD.instituicao) THEN
    RAISE EXCEPTION
      'CPF no campo de código: use o código do cliente no ERP. CPF não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.fn_texto_tem_cpf(NEW.nr_cliente)
     AND (TG_OP = 'INSERT' OR NEW.nr_cliente IS DISTINCT FROM OLD.nr_cliente) THEN
    RAISE EXCEPTION
      'CPF no campo de NR: use o código do cliente no ERP. CPF não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.fn_texto_tem_cpf(NEW.nome_cliente)
     AND (TG_OP = 'INSERT' OR NEW.nome_cliente IS DISTINCT FROM OLD.nome_cliente) THEN
    RAISE EXCEPTION
      'CPF no nome do cliente: remova o CPF. Dado pessoal não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF public.fn_texto_tem_cpf(NEW.observacoes)
     AND (TG_OP = 'INSERT' OR NEW.observacoes IS DISTINCT FROM OLD.observacoes) THEN
    RAISE EXCEPTION
      'CPF nas observações: remova o CPF. Dado pessoal não pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION "fn_acordo_recusa_cpf"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_acordo_recusa_cpf"() IS 'Recusa CPF em instituicao, nr_cliente, nome_cliente e observacoes, nas duas empresas. `whatsapp` fica de fora: celular tem 11 dígitos como o CPF e ~1% cairia nos verificadores por acaso. INSERT sempre; UPDATE só quando o campo muda, para que linhas antigas possam ser corrigidas.';


--
-- Name: fn_admin_apagar_acordos_do_usuario("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_admin_apagar_acordos_do_usuario"("p_user_id" "uuid", "p_empresa_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_apagados       INT := 0;
  v_empresa_escopo UUID;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para apagar acordos de usuário'
      USING ERRCODE = '42501';
  END IF;

  IF p_empresa_id IS NULL THEN
    SELECT empresa_id INTO v_empresa_escopo
      FROM public.perfis
     WHERE id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Perfil % não encontrado', p_user_id;
    END IF;
  ELSE
    v_empresa_escopo := p_empresa_id;
  END IF;

  IF NOT public.fn_can_access_empresa(v_empresa_escopo) THEN
    RAISE EXCEPTION 'Sem permissão para apagar acordos de usuário de outra empresa'
      USING ERRCODE = '42501';
  END IF;

  -- O acordo do outro operador sobrevive. Só a referência ao transferido sai:
  -- DIRETO fica sem EXTRA; EXTRA continua EXTRA, porém sem DIRETO associado.
  UPDATE public.acordos
     SET vinculo_operador_id   = NULL,
         vinculo_operador_nome = NULL
   WHERE vinculo_operador_id = p_user_id
     AND operador_id IS DISTINCT FROM p_user_id
     AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id);

  DELETE FROM public.acordos
   WHERE operador_id = p_user_id
     AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id);
  GET DIAGNOSTICS v_apagados = ROW_COUNT;

  -- Rastro deixado pelo perfil em acordos de terceiros. Mantém o comportamento
  -- anterior da rotina de exclusão/transferência.
  DELETE FROM public.historico_acordos WHERE usuario_id = p_user_id;
  DELETE FROM public.logs_whatsapp     WHERE usuario_id = p_user_id;

  -- Sobra defensiva: `nr_registros` é índice derivado e não tem FK.
  DELETE FROM public.nr_registros nr
   WHERE nr.operador_id = p_user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.acordos a WHERE a.id = nr.acordo_id
     );

  RETURN v_apagados;
END;
$$;


--
-- Name: FUNCTION "fn_admin_apagar_acordos_do_usuario"("p_user_id" "uuid", "p_empresa_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_admin_apagar_acordos_do_usuario"("p_user_id" "uuid", "p_empresa_id" "uuid") IS 'Apaga acordos do perfil e, atomicamente, remove o perfil dos vínculos de acordos sobreviventes sem mudar tipo_vinculo.';


--
-- Name: fn_admin_delete_user("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_admin_delete_user"("p_user_id" "uuid", "p_apagar_acordos" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_target_empresa UUID;
  v_apagados       INT := 0;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuários' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a si mesmo';
  END IF;

  SELECT empresa_id INTO v_target_empresa
  FROM public.perfis WHERE id = p_user_id;

  IF NOT public.fn_can_access_empresa(v_target_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuário de outra empresa' USING ERRCODE = '42501';
  END IF;

  IF p_apagar_acordos THEN
    v_apagados := public.fn_admin_apagar_acordos_do_usuario(p_user_id, NULL);
  END IF;

  -- Cascata de perfis.id -> auth.users(id) remove o perfil junto.
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', TRUE, 'acordos_apagados', v_apagados);
END;
$$;


--
-- Name: FUNCTION "fn_admin_delete_user"("p_user_id" "uuid", "p_apagar_acordos" boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_admin_delete_user"("p_user_id" "uuid", "p_apagar_acordos" boolean) IS 'Exclui o usuário. Com p_apagar_acordos, apaga antes as tabulações dele (libera os NRs) — a tela baixa o relatório ANTES de chamar. Não toca em analitico_recebimentos nem diario_recebimentos.';


--
-- Name: fn_admin_resumo_exclusao_usuario("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_admin_resumo_exclusao_usuario"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_empresa UUID;
  v_nome    TEXT;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuários' USING ERRCODE = '42501';
  END IF;

  SELECT empresa_id, nome INTO v_empresa, v_nome
  FROM public.perfis WHERE id = p_user_id;

  IF NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuário de outra empresa' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'nome',       v_nome,
    'empresa_id', v_empresa,
    'acordos',    (SELECT COUNT(*) FROM public.acordos           WHERE operador_id = p_user_id),
    'historico',  (SELECT COUNT(*) FROM public.historico_acordos WHERE usuario_id  = p_user_id),
    'logs',       (SELECT COUNT(*) FROM public.logs_whatsapp     WHERE usuario_id  = p_user_id)
  );
END;
$$;


--
-- Name: fn_analitico_atualizar_resumo("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_analitico_atualizar_resumo"("p_empresa_id" "uuid", "p_mes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_primeiro       DATE := (p_mes || '-01')::DATE;
  v_fim            DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                            + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_total_recebido NUMERIC;
  v_total_ho       NUMERIC;
  v_total_op       INTEGER;
  v_total_pgt      INTEGER;
  v_inicio         DATE;
  v_fim_data       DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(valor_recebido), 0),
    COALESCE(SUM(total_ho), 0),
    COUNT(DISTINCT operador_id) FILTER (WHERE operador_id IS NOT NULL),
    COUNT(*),
    MIN(data_pagamento),
    MAX(data_pagamento)
  INTO v_total_recebido, v_total_ho, v_total_op, v_total_pgt, v_inicio, v_fim_data
  FROM public.analitico_recebimentos
  WHERE empresa_id    = p_empresa_id
    AND data_pagamento BETWEEN v_primeiro AND v_fim;

  -- Mês sem nenhuma linha: o snapshot deixa de existir. Antes esta função
  -- retornava aqui e o snapshot velho continuava alimentando os cards.
  IF v_total_pgt = 0 THEN
    DELETE FROM public.analitico_resumo_mensal
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
    RETURN;
  END IF;

  INSERT INTO public.analitico_resumo_mensal (
    empresa_id, mes,
    total_recebido, total_ho, total_operadores, total_pagamentos,
    periodo_inicio, periodo_fim, atualizado_em
  ) VALUES (
    p_empresa_id, p_mes,
    v_total_recebido, v_total_ho, v_total_op, v_total_pgt,
    v_inicio, v_fim_data, NOW()
  )
  ON CONFLICT (empresa_id, mes) DO UPDATE SET
    total_recebido   = EXCLUDED.total_recebido,
    total_ho         = EXCLUDED.total_ho,
    total_operadores = EXCLUDED.total_operadores,
    total_pagamentos = EXCLUDED.total_pagamentos,
    periodo_inicio   = EXCLUDED.periodo_inicio,
    periodo_fim      = EXCLUDED.periodo_fim,
    atualizado_em    = EXCLUDED.atualizado_em;
END;
$$;


--
-- Name: FUNCTION "fn_analitico_atualizar_resumo"("p_empresa_id" "uuid", "p_mes" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_analitico_atualizar_resumo"("p_empresa_id" "uuid", "p_mes" "text") IS 'Recalcula o snapshot mensal do analítico a partir das linhas do mês. Mês sem linhas APAGA o snapshot — sem isso, "Limpar mês" esvaziava a tabela e deixava os cards de resumo exibindo os valores do mês já apagado.';


--
-- Name: fn_analitico_dashboard_mes("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_analitico_dashboard_mes"("p_empresa_id" "uuid", "p_mes" "text") RETURNS TABLE("dia" "date", "operador_id" "uuid", "forma_pagamento" "text", "forma_detalhe" "text", "status_tabulacao" "text", "total" numeric, "total_ho" numeric, "qtd" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_lider BOOLEAN;
  v_inicio   DATE := (p_mes || '-01')::DATE;
  v_fim      DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  v_is_lider := public.fn_user_has_any_role(
                  ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
                );

  RETURN QUERY
  SELECT
    ar.data_pagamento               AS dia,
    ar.operador_id,
    ar.forma_pagamento,
    ar.forma_detalhe,
    ar.status_tabulacao,
    SUM(ar.valor_recebido)::NUMERIC AS total,
    SUM(ar.total_ho)::NUMERIC       AS total_ho,
    COUNT(*)::BIGINT                AS qtd
  FROM public.analitico_recebimentos ar
  WHERE ar.empresa_id     = p_empresa_id
    AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    AND (v_is_lider OR ar.operador_id = auth.uid())
  GROUP BY ar.data_pagamento, ar.operador_id, ar.forma_pagamento,
           ar.forma_detalhe, ar.status_tabulacao
  -- Ordem TOTAL (todas as chaves do GROUP BY) — sem isso, paginar por range
  -- entre páginas fica indeterminado e o total pode duplicar/perder linhas.
  ORDER BY ar.data_pagamento,
           ar.operador_id      NULLS LAST,
           ar.forma_pagamento  NULLS LAST,
           ar.forma_detalhe    NULLS LAST,
           ar.status_tabulacao NULLS LAST;
END;
$$;


--
-- Name: fn_analitico_dashboard_mes_json("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_analitico_dashboard_mes_json"("p_empresa_id" "uuid", "p_mes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_lider BOOLEAN;
  v_inicio   DATE := (p_mes || '-01')::DATE;
  v_fim      DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_out      JSONB;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN '[]'::JSONB;
  END IF;

  v_is_lider := public.fn_user_has_any_role(
                  ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
                );

  SELECT COALESCE(jsonb_agg(t), '[]'::JSONB)
    INTO v_out
    FROM (
      SELECT
        ar.data_pagamento               AS dia,
        ar.operador_id,
        -- Setor da linha: o carimbado na importação; na falta dele (linhas
        -- anteriores à 20260712a) o setor de quem importou.
        COALESCE(ar.setor_id, imp.setor_id) AS setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        SUM(ar.valor_recebido)::NUMERIC AS total,
        SUM(ar.total_ho)::NUMERIC       AS total_ho,
        COUNT(*)::BIGINT                AS qtd
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis imp ON imp.id = ar.importado_por_id
      WHERE ar.empresa_id     = p_empresa_id
        AND ar.data_pagamento BETWEEN v_inicio AND v_fim
        AND (v_is_lider OR ar.operador_id = (SELECT auth.uid()))
      GROUP BY ar.data_pagamento, ar.operador_id,
               COALESCE(ar.setor_id, imp.setor_id),
               ar.forma_pagamento, ar.forma_detalhe, ar.status_tabulacao
    ) t;

  RETURN v_out;
END;
$$;


--
-- Name: FUNCTION "fn_analitico_dashboard_mes_json"("p_empresa_id" "uuid", "p_mes" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_analitico_dashboard_mes_json"("p_empresa_id" "uuid", "p_mes" "text") IS 'Agregado mensal do analítico para o dashboard, em um único JSONB. Devolve setor_id (carimbo da importação, com fallback no setor de quem importou) para o dashboard aplicar a MESMA regra de acumulado da aba Analítico: setor normal soma pelo carimbo, setor alternativo soma pelos usuários. Escopo: operador vê as próprias linhas, líder+ vê a empresa.';


--
-- Name: fn_analitico_destaques_dia("uuid", "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_analitico_destaques_dia"("p_empresa_id" "uuid", "p_mes" "text", "p_equipe_id" "uuid" DEFAULT NULL::"uuid", "p_setor_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("dia" "date", "operador_id" "uuid", "operador_usuario" "text", "operador_nome" "text", "total_recebido" numeric, "total_pagamentos" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (daily.dia)
    daily.dia,
    daily.operador_id,
    daily.operador_usuario,
    p.nome          AS operador_nome,
    daily.total_recebido,
    daily.total_pagamentos
  FROM (
    SELECT
      ar.data_pagamento               AS dia,
      ar.operador_id,
      ar.operador_usuario,
      SUM(ar.valor_recebido)::NUMERIC AS total_recebido,
      COUNT(*)::BIGINT                AS total_pagamentos
    FROM public.analitico_recebimentos ar
    JOIN public.perfis pf ON pf.id = ar.operador_id
    LEFT JOIN public.equipes eq ON eq.id = pf.equipe_id
    WHERE ar.empresa_id    = p_empresa_id
      AND ar.operador_id   IS NOT NULL
      AND ar.data_pagamento >= (p_mes || '-01')::DATE
      AND ar.data_pagamento <= (
            DATE_TRUNC('month', (p_mes || '-01')::DATE)
            + INTERVAL '1 month' - INTERVAL '1 day'
          )::DATE
      -- Equipe: a de origem OU uma em que o operador é clone
      AND (
            p_equipe_id IS NULL
            OR pf.equipe_id = p_equipe_id
            OR EXISTS (
                 SELECT 1
                 FROM public.equipe_operadores_clones c
                 WHERE c.operador_id = ar.operador_id
                   AND c.equipe_id   = p_equipe_id
               )
          )
      -- Setor: o de origem OU o dono de uma equipe em que ele é clone
      AND (
            p_setor_id IS NULL
            OR eq.setor_id = p_setor_id
            OR EXISTS (
                 SELECT 1
                 FROM public.equipe_operadores_clones c
                 JOIN public.equipes ec ON ec.id = c.equipe_id
                 WHERE c.operador_id = ar.operador_id
                   AND ec.setor_id   = p_setor_id
               )
          )
    GROUP BY ar.data_pagamento, ar.operador_id, ar.operador_usuario
  ) daily
  LEFT JOIN public.perfis p ON p.id = daily.operador_id
  ORDER BY daily.dia ASC, daily.total_recebido DESC;
END;
$$;


--
-- Name: fn_analitico_resumo_por_operador("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_analitico_resumo_por_operador"("p_empresa_id" "uuid", "p_mes" "text") RETURNS TABLE("operador_id" "uuid", "operador_usuario" "text", "operador_nome" "text", "total_recebido" numeric, "total_ho" numeric, "total_pagamentos" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_lider     BOOLEAN;
  v_equipe_id    UUID;
BEGIN
  -- Qualquer usuário da empresa (incluindo operador) pode consultar
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['operador','lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  -- Líder+ vê tudo; operador é restringido à própria equipe (server-side)
  v_is_lider := public.fn_user_has_any_role(
                  ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
                );

  IF NOT v_is_lider THEN
    SELECT equipe_id INTO v_equipe_id
    FROM public.perfis
    WHERE id = auth.uid();
  END IF;

  RETURN QUERY
  SELECT
    ar.operador_id,
    MIN(ar.operador_usuario)        AS operador_usuario,
    p.nome                          AS operador_nome,
    SUM(ar.valor_recebido)::NUMERIC AS total_recebido,
    SUM(ar.total_ho)::NUMERIC       AS total_ho,
    COUNT(*)::BIGINT                AS total_pagamentos
  FROM public.analitico_recebimentos ar
  LEFT JOIN public.perfis p ON p.id = ar.operador_id
  WHERE ar.empresa_id  = p_empresa_id
    AND ar.operador_id IS NOT NULL
    -- super_admin não é operador: não entra no resumo nem nas somas que saem daqui
    AND COALESCE(p.perfil, '') <> 'super_admin'
    AND ar.data_pagamento >= (p_mes || '-01')::DATE
    AND ar.data_pagamento <= (
          DATE_TRUNC('month', (p_mes || '-01')::DATE)
          + INTERVAL '1 month'
          - INTERVAL '1 day'
        )::DATE
    AND (
      -- Líder+ vê todos os operadores da empresa
      v_is_lider
      -- Operador com equipe: só a própria equipe
      OR (v_equipe_id IS NOT NULL AND p.equipe_id = v_equipe_id)
      -- Operador sem equipe: apenas a própria linha
      OR (v_equipe_id IS NULL AND ar.operador_id = auth.uid())
    )
  GROUP BY ar.operador_id, p.nome
  ORDER BY total_recebido DESC;
END;
$$;


--
-- Name: FUNCTION "fn_analitico_resumo_por_operador"("p_empresa_id" "uuid", "p_mes" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_analitico_resumo_por_operador"("p_empresa_id" "uuid", "p_mes" "text") IS 'Resumo de recebimento por operador no mês. Agrupa por PERFIL (não pela grafia do login) e ignora super_admin, que é conta de administração e não operador.';


--
-- Name: fn_api_rate_limit_consumir("uuid", "text", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_api_rate_limit_consumir"("p_usuario_id" "uuid", "p_rota" "text", "p_limite" integer, "p_janela_segundos" integer) RETURNS TABLE("permitido" boolean, "restantes" integer, "tentar_novamente_em_s" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: FUNCTION "fn_api_rate_limit_consumir"("p_usuario_id" "uuid", "p_rota" "text", "p_limite" integer, "p_janela_segundos" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_api_rate_limit_consumir"("p_usuario_id" "uuid", "p_rota" "text", "p_limite" integer, "p_janela_segundos" integer) IS 'Atomically consumes one backend-only API quota unit and returns remaining capacity/retry delay.';


--
-- Name: fn_arquivar_desligados_anteriores("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_arquivar_desligados_anteriores"("p_empresa_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_n INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN 0;
  END IF;
  UPDATE public.perfis
     SET arquivado = TRUE
   WHERE empresa_id = p_empresa_id
     AND situacao = 'desligado'
     AND arquivado = FALSE
     AND desligado_em IS NOT NULL
     AND desligado_em < date_trunc('month', now());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;


--
-- Name: fn_atualizar_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_atualizar_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$;


--
-- Name: fn_can_access_empresa("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_can_access_empresa"("target_empresa_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.fn_user_is_super_admin()
      OR target_empresa_id = public.fn_user_empresa_id();
$$;


--
-- Name: fn_comemoracao_alvo_direto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_comemoracao_alvo_direto"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.alvo_tipo = 'equipe' THEN
    NEW.setores_alvo := COALESCE((
      SELECT ARRAY[e.setor_id] FROM public.equipes e
       WHERE e.id = NEW.equipe_id AND e.setor_id IS NOT NULL
    ), '{}');
    NEW.empresa_inteira := false;
    NEW.equipes_alvo    := CASE WHEN NEW.somente_equipe
                                THEN ARRAY[NEW.equipe_id] ELSE '{}'::UUID[] END;

  ELSIF NEW.alvo_tipo = 'setor' THEN
    -- `setores_alvo` fica preenchido por consistência, mas quem manda aqui é
    -- `empresa_inteira`: meta de setor aparece para a empresa toda.
    NEW.setores_alvo    := ARRAY[NEW.setor_id];
    NEW.empresa_inteira := true;
    NEW.somente_equipe  := false;
    NEW.equipes_alvo    := '{}';

  ELSE
    -- Por operadores: quem preenche é o trigger dos homenageados, que só roda
    -- depois do INSERT da comemoração.
    NEW.empresa_inteira := false;
    NEW.equipes_alvo    := '{}';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_comemoracao_faxina(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_comemoracao_faxina"() RETURNS TABLE("midias_apagadas" integer, "comemoracoes_finalizadas" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caminhos TEXT[];
  v_midias   INT := 0;
  v_comem    INT := 0;
BEGIN
  WITH vencidas AS (
    DELETE FROM public.comemoracao_midias m
     WHERE m.expira_em IS NOT NULL AND m.expira_em <= NOW()
    RETURNING m.caminho
  )
  SELECT ARRAY_AGG(caminho), COUNT(*) INTO v_caminhos, v_midias FROM vencidas;

  -- O arquivo vai junto; sem isto o bucket engorda para sempre, que é
  -- exatamente o que o limite de validade existe para evitar.
  IF v_caminhos IS NOT NULL THEN
    DELETE FROM storage.objects
     WHERE bucket_id = 'comemoracoes' AND name = ANY (v_caminhos);
  END IF;

  WITH fechadas AS (
    UPDATE public.comemoracoes c
       SET finalizada_em = NOW()
     WHERE c.finalizada_em IS NULL
       AND NOW() >= c.inicia_em + (c.duracao_s || ' seconds')::INTERVAL
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_comem FROM fechadas;

  RETURN QUERY SELECT COALESCE(v_midias, 0), COALESCE(v_comem, 0);
END;
$$;


--
-- Name: FUNCTION "fn_comemoracao_faxina"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_comemoracao_faxina"() IS 'Apaga mídia vencida (linha + arquivo) e finaliza comemoração que passou da janela. Agendada no pg_cron; chamável à mão se a extensão não existir.';


--
-- Name: fn_comemoracao_finalizar("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.comemoracoes c
     SET finalizada_em = NOW()
   WHERE c.id = p_id
     AND c.finalizada_em IS NULL
     AND ((SELECT public.fn_user_is_super_admin())
          OR c.empresa_id = (SELECT public.fn_user_empresa_id()))
     AND (
       NOW() >= c.inicia_em + (c.duracao_s || ' seconds')::INTERVAL
       OR c.criado_por = (SELECT auth.uid())
     );
$$;


--
-- Name: FUNCTION "fn_comemoracao_finalizar"("p_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") IS 'Marca a comemoração como finalizada. Dentro da janela, só quem criou.';


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: comemoracao_midias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."comemoracao_midias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "url" "text" NOT NULL,
    "caminho" "text" NOT NULL,
    "criado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inicio_s" numeric(6,1) DEFAULT 0 NOT NULL,
    "trecho_s" numeric(4,1),
    "fixada" boolean DEFAULT false NOT NULL,
    "expira_em" timestamp with time zone DEFAULT ("now"() + '3 days'::interval),
    CONSTRAINT "comemoracao_midias_fixada_check" CHECK ((("fixada" AND ("expira_em" IS NULL)) OR ((NOT "fixada") AND ("expira_em" IS NOT NULL)))),
    CONSTRAINT "comemoracao_midias_nome_check" CHECK (("length"("btrim"("nome")) > 0)),
    CONSTRAINT "comemoracao_midias_tipo_check" CHECK (("tipo" = ANY (ARRAY['gif'::"text", 'imagem'::"text", 'som'::"text"]))),
    CONSTRAINT "comemoracao_midias_trecho_valido" CHECK ((("inicio_s" >= (0)::numeric) AND (("trecho_s" IS NULL) OR (("trecho_s" > (0)::numeric) AND ("trecho_s" <= (60)::numeric)))))
);


--
-- Name: TABLE "comemoracao_midias"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."comemoracao_midias" IS 'GIFs e sons enviados pelo líder para as comemorações. O catálogo padrão vive em código (src/pages/Comemoracoes/catalogo.ts) e não passa por aqui.';


--
-- Name: COLUMN "comemoracao_midias"."inicio_s"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracao_midias"."inicio_s" IS 'Segundo em que o som começa a tocar. Só vale para tipo = som.';


--
-- Name: COLUMN "comemoracao_midias"."trecho_s"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracao_midias"."trecho_s" IS 'Quantos segundos tocam a partir de inicio_s. NULL = arquivo inteiro.';


--
-- Name: COLUMN "comemoracao_midias"."expira_em"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracao_midias"."expira_em" IS 'Quando a faxina apaga. NULL = fixada, não expira.';


--
-- Name: fn_comemoracao_midia_fixar("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean) RETURNS "public"."comemoracao_midias"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_midia public.comemoracao_midias;
  v_fixas INT;
BEGIN
  SELECT * INTO v_midia FROM public.comemoracao_midias WHERE id = p_id;

  IF v_midia.id IS NULL THEN
    RAISE EXCEPTION 'Mídia não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT ((SELECT public.fn_user_is_super_admin())
          OR v_midia.empresa_id = (SELECT public.fn_user_empresa_id()))
     OR NOT (SELECT public.fn_comemoracao_pode_criar()) THEN
    RAISE EXCEPTION 'Sem permissão para fixar mídia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_fixar THEN
    SELECT COUNT(*) INTO v_fixas
      FROM public.comemoracao_midias m
     WHERE m.empresa_id = v_midia.empresa_id
       AND m.tipo = v_midia.tipo
       AND m.fixada
       AND m.id <> p_id;

    IF v_fixas >= 4 THEN
      RAISE EXCEPTION 'Já são 4 % fixados. Desafixe um antes.', v_midia.tipo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.comemoracao_midias
     SET fixada    = p_fixar,
         expira_em = CASE WHEN p_fixar THEN NULL ELSE NOW() + INTERVAL '3 days' END
   WHERE id = p_id
  RETURNING * INTO v_midia;

  RETURN v_midia;
END;
$$;


--
-- Name: fn_comemoracao_midias_teto(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_comemoracao_midias_teto"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM public.comemoracao_midias m
   WHERE m.empresa_id = NEW.empresa_id;

  IF v_total >= 30 THEN
    RAISE EXCEPTION 'Biblioteca cheia (30). Exclua uma mídia ou espere expirar.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_comemoracao_pode_criar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_comemoracao_pode_criar"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.fn_user_has_any_role(
    ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
  );
$$;


--
-- Name: fn_comemoracao_setores_alvo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_comemoracao_setores_alvo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_comemoracao UUID := COALESCE(NEW.comemoracao_id, OLD.comemoracao_id);
BEGIN
  UPDATE public.comemoracoes c
     SET setores_alvo = COALESCE((
           SELECT ARRAY(
             SELECT DISTINCT x.setor
               FROM public.comemoracao_homenageados h
               CROSS JOIN LATERAL (
                 -- Escolha explícita de quem montou…
                 SELECT UNNEST(h.setores_escolhidos) AS setor
                 UNION
                 -- …ou, sem escolha, o setor do perfil e SÓ ele. É aqui que a
                 -- união automática dos clones deixou de acontecer.
                 SELECT p.setor_id
                   FROM public.perfis p
                  WHERE p.id = h.operador_id
                    AND COALESCE(ARRAY_LENGTH(h.setores_escolhidos, 1), 0) = 0
               ) x
              WHERE h.comemoracao_id = v_comemoracao
                AND x.setor IS NOT NULL
           )
         ), '{}')
   WHERE c.id = v_comemoracao
     AND c.alvo_tipo = 'operadores';

  UPDATE public.comemoracoes c
     SET equipes_alvo = COALESCE((
           SELECT ARRAY(
             SELECT DISTINCT eq.equipe_id
               FROM public.comemoracao_homenageados h
               CROSS JOIN LATERAL public.fn_equipes_do_operador(h.operador_id) eq
              WHERE h.comemoracao_id = v_comemoracao
                AND eq.setor_id IS NOT NULL
                AND eq.setor_id = ANY (c.setores_alvo)
           )
         ), '{}')
   WHERE c.id = v_comemoracao
     AND c.alvo_tipo = 'operadores'
     AND c.somente_equipe;

  RETURN NULL;
END;
$$;


--
-- Name: fn_composicao_mes_congelar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_composicao_mes_congelar"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mes      TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM');
  v_empresa  RECORD;
  v_total    INTEGER := 0;
BEGIN
  FOR v_empresa IN SELECT id FROM public.empresas LOOP
    v_total := v_total + public.fn_composicao_mes_snapshot(v_empresa.id, v_mes);
  END LOOP;
  RETURN v_total;
END;
$$;


--
-- Name: fn_composicao_mes_snapshot("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


--
-- Name: fn_contrib_receptivo_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_contrib_receptivo_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.atualizado_em := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: fn_converter_para_extra("uuid", "uuid", "text", numeric, "date", "text", "text", "text", "text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_converter_para_extra"("p_acordo_id" "uuid", "p_novo_direto_op_id" "uuid", "p_novo_direto_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text" DEFAULT NULL::"text", "p_parcelas" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: fn_criar_perfil_novo_usuario(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_criar_perfil_novo_usuario"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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

  -- Allowlist de perfis válidos — agora com 'ouvidoria'
  IF v_perfil_meta IN (
    'operador', 'lider', 'administrador', 'super_admin',
    'elite', 'gerencia', 'diretoria', 'ouvidoria'
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
$$;


--
-- Name: fn_diario_preencher_setor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_diario_preencher_setor"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.setor_id := NULL;
  ELSIF NEW.operador_id IS DISTINCT FROM OLD.operador_id THEN
    NEW.setor_id := NULL;
  END IF;

  IF NEW.setor_id IS NULL THEN
    IF NEW.operador_id IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM public.perfis WHERE id = NEW.operador_id;
    END IF;
    IF NEW.setor_id IS NULL AND NEW.importado_por_id IS NOT NULL THEN
      SELECT setor_id INTO NEW.setor_id FROM public.perfis WHERE id = NEW.importado_por_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_diario_resumo_mensal("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_diario_resumo_mensal"("p_empresa_id" "uuid", "p_mes" "text") RETURNS TABLE("operador_id" "uuid", "operador_usuario" "text", "operador_nome" "text", "setor_geral" "uuid", "dia_referencia" "date", "fora_vinculo" boolean, "total_recebido" numeric, "total_pagamentos" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Apenas líder+ pode ver o resumo geral (mesma regra do analítico)
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dr.operador_id,
    COALESCE(p.usuario, dr.operador_usuario)          AS operador_usuario,
    p.nome                                            AS operador_nome,
    COALESCE(eq.setor_id, p.setor_id, pi.setor_id)    AS setor_geral,
    dr.dia_referencia,
    (dr.prox_contato IS NOT NULL
      AND dr.prox_contato <= dr.dia_referencia)       AS fora_vinculo,
    SUM(dr.valor_recebido)::NUMERIC                   AS total_recebido,
    COUNT(*)::BIGINT                                  AS total_pagamentos
  FROM public.diario_recebimentos dr
  LEFT JOIN public.perfis  p  ON p.id  = dr.operador_id
  LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
  LEFT JOIN public.perfis  pi ON pi.id = dr.importado_por_id
  WHERE dr.empresa_id = p_empresa_id
    AND dr.dia_referencia >= (p_mes || '-01')::DATE
    AND dr.dia_referencia <  ((p_mes || '-01')::DATE + INTERVAL '1 month')::DATE
  GROUP BY
    dr.operador_id,
    COALESCE(p.usuario, dr.operador_usuario),
    p.nome,
    COALESCE(eq.setor_id, p.setor_id, pi.setor_id),
    dr.dia_referencia,
    (dr.prox_contato IS NOT NULL AND dr.prox_contato <= dr.dia_referencia);
END;
$$;


--
-- Name: fn_diario_resumo_mes("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_diario_resumo_mes"("p_empresa_id" "uuid", "p_mes" "text") RETURNS TABLE("total_recebido" numeric, "total_dias" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_primeiro DATE := (p_mes || '-01')::DATE;
  v_fim      DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;
  IF NOT public.fn_user_has_any_role(
       ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
     ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(d.valor_recebido), 0)::NUMERIC,
    COUNT(DISTINCT d.dia_referencia)::INTEGER
  FROM public.diario_recebimentos d
  WHERE d.empresa_id     = p_empresa_id
    AND d.dia_referencia BETWEEN v_primeiro AND v_fim
    AND (d.prox_contato IS NULL OR d.prox_contato > CURRENT_DATE);
END;
$$;


--
-- Name: fn_direto_extra_ativo("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_direto_extra_ativo"("p_user_id" "uuid", "p_empresa_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: fn_doc_lgpd_set_atualizado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_doc_lgpd_set_atualizado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$;


--
-- Name: fn_eh_cpf("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_eh_cpf"("p_valor" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
DECLARE
  d    TEXT;
  soma INT;
  dig  INT;
  i    INT;
BEGIN
  IF p_valor IS NULL THEN RETURN FALSE; END IF;

  -- Aceita com ou sem máscara: 529.982.247-25 e 52998224725 são o mesmo CPF.
  d := regexp_replace(p_valor, '\D', '', 'g');
  IF length(d) <> 11 THEN RETURN FALSE; END IF;

  -- Sequência de um dígito só passa na conta dos verificadores; é o caso
  -- clássico que engana validador ingênuo. Não é CPF.
  IF d ~ '^(.)\1{10}$' THEN RETURN FALSE; END IF;

  -- 1º dígito verificador: pesos 10..2 sobre os 9 primeiros.
  soma := 0;
  FOR i IN 1..9 LOOP
    soma := soma + substr(d, i, 1)::INT * (11 - i);
  END LOOP;
  dig := (soma * 10) % 11;
  IF dig >= 10 THEN dig := 0; END IF;   -- regra da Receita, não arredondamento
  IF dig <> substr(d, 10, 1)::INT THEN RETURN FALSE; END IF;

  -- 2º dígito verificador: pesos 11..2 sobre os 10 primeiros.
  soma := 0;
  FOR i IN 1..10 LOOP
    soma := soma + substr(d, i, 1)::INT * (12 - i);
  END LOOP;
  dig := (soma * 10) % 11;
  IF dig >= 10 THEN dig := 0; END IF;
  RETURN dig = substr(d, 11, 1)::INT;
END;
$_$;


--
-- Name: FUNCTION "fn_eh_cpf"("p_valor" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_eh_cpf"("p_valor" "text") IS 'true quando o texto é um CPF válido (com ou sem máscara). Espelha src/lib/cpf.ts — os dois precisam mudar juntos.';


--
-- Name: fn_empresa_seed_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_empresa_seed_super_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes, descricao)
  VALUES (
    NEW.id,
    'super_admin',
    public.fn_super_admin_permissoes_completas(),
    'Acesso total ao sistema, nas duas operações. Cargo de administração da '
    'plataforma — não é operador. Ver migration 20260812b.'
  )
  ON CONFLICT (empresa_id, cargo) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Criar empresa não pode falhar por causa do seed de permissão.
  RAISE WARNING 'fn_empresa_seed_super_admin falhou para % : %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;


--
-- Name: fn_equipes_do_operador("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_equipes_do_operador"("p_operador" "uuid") RETURNS TABLE("equipe_id" "uuid", "setor_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT e.id, e.setor_id
    FROM public.perfis p
    JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.id = p_operador
  UNION
  SELECT e.id, e.setor_id
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
   WHERE c.operador_id = p_operador;
$$;


--
-- Name: FUNCTION "fn_equipes_do_operador"("p_operador" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_equipes_do_operador"("p_operador" "uuid") IS 'Equipes em que o operador aparece — a do perfil mais as clonadas — com o setor de cada uma.';


--
-- Name: fn_expurgar_cpf_chat(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_expurgar_cpf_chat"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_msgs   INTEGER;
  v_solic  INTEGER;
BEGIN
  UPDATE public.solicitacoes_whatsapp_mensagens
     SET conteudo     = public.fn_texto_censurado_cpf(),
         expurgado_em = now()
   WHERE tem_cpf
     AND expurgado_em IS NULL
     AND expurgar_em IS NOT NULL
     AND expurgar_em <= now();
  GET DIAGNOSTICS v_msgs = ROW_COUNT;

  UPDATE public.solicitacoes_whatsapp
     SET mensagem         = public.fn_texto_censurado_cpf(),
         msg_expurgado_em = now()
   WHERE msg_tem_cpf
     AND msg_expurgado_em IS NULL
     AND msg_expurgar_em IS NOT NULL
     AND msg_expurgar_em <= now();
  GET DIAGNOSTICS v_solic = ROW_COUNT;

  RETURN v_msgs + v_solic;
END;
$$;


--
-- Name: fn_get_perfil_usuario("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_get_perfil_usuario"("uid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT perfil FROM public.perfis WHERE id = uid LIMIT 1;
$$;


--
-- Name: fn_get_setor_usuario("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_get_setor_usuario"("uid" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT setor_id FROM public.perfis WHERE id = uid LIMIT 1;
$$;


--
-- Name: fn_impedir_transferencia_com_acordos_pendentes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_impedir_transferencia_com_acordos_pendentes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id AND EXISTS (
    SELECT 1
      FROM public.acordos a
     WHERE a.operador_id = OLD.id
        OR a.vinculo_operador_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'não é possível mudar a empresa: ainda existem acordos ou vínculos do perfil na empresa atual'
      USING ERRCODE = '23503',
            HINT = 'Use a transferência completa, que limpa os vínculos na mesma transação.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_log_auditoria(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_log_auditoria"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_categoria  TEXT := COALESCE(TG_ARGV[0], 'sistema');
  v_slug       TEXT := COALESCE(NULLIF(TG_ARGV[1], ''), TG_TABLE_NAME);
  v_alvo       TEXT := COALESCE(NULLIF(TG_ARGV[2], ''), TG_TABLE_NAME);
  -- COALESCE por fora: `string_to_array('', ',')` devolve array vazio no
  -- PostgreSQL atual, mas devolvia NULL em versões antigas — e `NULL || array` é
  -- NULL, o que faria a lista de ignorados desaparecer silenciosamente.
  v_cols_rot   TEXT[] := COALESCE(string_to_array(COALESCE(TG_ARGV[3], ''), ','), ARRAY[]::TEXT[]);
  -- Duas listas: a configurada na trigger (colunas que nunca interessam, como
  -- `dados_completos`) e ela mais os carimbos de tempo. A diferença importa no
  -- DELETE — ver o comentário lá embaixo.
  v_ignorar_cfg TEXT[] := COALESCE(string_to_array(COALESCE(TG_ARGV[4], ''), ','), ARRAY[]::TEXT[]);
  v_ignorar    TEXT[];
  v_col_emp    TEXT := COALESCE(NULLIF(TG_ARGV[5], ''), 'empresa_id');
  v_sev_base   TEXT := COALESCE(NULLIF(TG_ARGV[6], ''), 'info');

  v_antes_row  JSONB;
  v_depois_row JSONB;
  v_diff       JSONB;
  v_campos     TEXT[];
  v_antes      JSONB;
  v_depois     JSONB;

  v_empresa    UUID;
  v_registro   TEXT;
  v_rotulo     TEXT;
  v_acao       TEXT;
  v_sev        TEXT;
  v_descricao  TEXT;
  v_detalhes   JSONB := '{}'::jsonb;

  v_col        TEXT;
  v_pedaco     TEXT;
  v_pedacos    TEXT[] := ARRAY[]::TEXT[];
  v_de         TEXT;
  v_para       TEXT;
BEGIN
  -- Sempre ignorados NO DIFF: carimbos de tempo mudam em toda escrita e não são
  -- informação de auditoria — se só eles mudaram, não houve mudança.
  v_ignorar := v_ignorar_cfg || ARRAY['atualizado_em', 'updated_at', 'criado_em', 'created_at'];

  v_antes_row  := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_depois_row := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;

  -- ── Tenant e identidade da linha ──────────────────────────────────────────
  v_empresa  := NULLIF(COALESCE(v_depois_row, v_antes_row) ->> v_col_emp, '')::UUID;
  v_registro := COALESCE(v_depois_row, v_antes_row) ->> 'id';

  -- ── Rótulo humano ─────────────────────────────────────────────────────────
  FOREACH v_col IN ARRAY v_cols_rot LOOP
    v_col := btrim(v_col);
    CONTINUE WHEN v_col = '';
    v_pedaco := NULLIF(btrim(COALESCE(v_depois_row, v_antes_row) ->> v_col), '');
    IF v_pedaco IS NOT NULL THEN
      -- NR é o identificador que a operação fala em voz alta; ganha prefixo.
      IF v_col = 'nr_cliente' OR v_col = 'nr_value' THEN
        v_pedaco := 'NR ' || v_pedaco;
      END IF;
      v_pedacos := v_pedacos || v_pedaco;
    END IF;
  END LOOP;
  v_rotulo := NULLIF(array_to_string(v_pedacos, ' — '), '');

  -- ── Diff ──────────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN
    v_diff := public.fn_log_diff(v_antes_row, v_depois_row, v_ignorar);

    -- Só carimbo de tempo mudou: não é evento. Sai sem gravar nada — é isto que
    -- impede a tabela de encher de linhas que não dizem nada.
    IF v_diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    SELECT array_agg(k ORDER BY k) INTO v_campos FROM jsonb_object_keys(v_diff) AS k;

    SELECT jsonb_object_agg(k, v_diff -> k -> 'antes'),
           jsonb_object_agg(k, v_diff -> k -> 'depois')
      INTO v_antes, v_depois
      FROM jsonb_object_keys(v_diff) AS k;

    v_acao := v_slug || '_alterado';
    v_sev  := v_sev_base;

    -- Frase: "Alterou o acordo NR 123 — João: valor, vencimento".
    SELECT string_agg(public.fn_log_rotulo_campo(k), ', ' ORDER BY k)
      INTO v_pedaco
      FROM unnest(v_campos) AS k;
    v_descricao := 'Alterou ' || v_alvo
                   || COALESCE(' ' || v_rotulo, '')
                   || COALESCE(': ' || v_pedaco, '');

  ELSIF TG_OP = 'INSERT' THEN
    -- Em criação, `depois` guarda os campos-chave e não a linha inteira: o
    -- volume de INSERT é o maior de todos (importação) e a linha completa
    -- está no próprio registro, que acabou de nascer.
    v_diff := public.fn_log_diff('{}'::jsonb, v_depois_row, v_ignorar || ARRAY['id']);
    SELECT jsonb_object_agg(k, v_diff -> k -> 'depois') INTO v_depois
      FROM jsonb_object_keys(v_diff) AS k;
    v_acao      := v_slug || '_criado';
    v_sev       := v_sev_base;
    v_descricao := 'Criou ' || v_alvo || COALESCE(' ' || v_rotulo, '');

  ELSE  -- DELETE
    -- Exclusão guarda a linha inteira: é o único lugar onde ela ainda existe.
    --
    -- Menos as colunas que a trigger declarou ignorar — e essa subtração é o
    -- motivo de existirem duas listas. `lixeira_acordos.dados_completos` é o
    -- acordo inteiro em JSON: guardá-lo aqui gravaria o mesmo dado duas vezes, e
    -- em toda linha expurgada. Os carimbos de tempo, ao contrário, FICAM: em
    -- exclusão, saber quando o registro nasceu é informação, não ruído.
    v_antes := v_antes_row - v_ignorar_cfg;
    v_acao  := v_slug || '_excluido';
    -- Apagar é sempre pelo menos um aviso; o que já era crítico continua.
    v_sev   := CASE WHEN v_sev_base = 'critico' THEN 'critico' ELSE 'aviso' END;
    v_descricao := 'Excluiu ' || v_alvo || COALESCE(' ' || v_rotulo, '');
  END IF;

  -- ── Casos especiais: onde a frase genérica não serve ──────────────────────

  -- Acordo: mudança de status é o evento que a operação inteira acompanha.
  IF TG_TABLE_NAME = 'acordos' AND TG_OP = 'UPDATE' AND ('status' = ANY (v_campos)) THEN
    v_de   := v_antes  ->> 'status';
    v_para := v_depois ->> 'status';
    v_acao := 'acordo_status_alterado';
    v_sev  := CASE WHEN v_para = 'pago' THEN 'info' ELSE 'aviso' END;
    v_descricao := 'Mudou o status do acordo ' || COALESCE(v_rotulo, '')
                   || ' de "' || COALESCE(v_de, '—') || '" para "' || COALESCE(v_para, '—') || '"'
                   || CASE WHEN array_length(v_campos, 1) > 1
                           THEN ' (e mais ' || (array_length(v_campos, 1) - 1) || ' campo(s))'
                           ELSE '' END;
  END IF;

  -- Acordo excluído: dizer se foi para a lixeira e por quê. Sem isto, "Excluiu
  -- o acordo" não distingue soft delete de perda definitiva — e é justamente
  -- essa a pergunta de quem abre o log.
  IF TG_TABLE_NAME = 'acordos' AND TG_OP = 'DELETE' THEN
    SELECT l.motivo INTO v_pedaco
      FROM public.lixeira_acordos l
     WHERE l.acordo_id = OLD.id
     ORDER BY l.excluido_em DESC
     LIMIT 1;
    v_descricao := 'Excluiu o acordo ' || COALESCE(v_rotulo, '')
                   || CASE WHEN v_pedaco IS NOT NULL
                           THEN ' (foi para a lixeira: ' || v_pedaco || ')'
                           ELSE ' (sem passar pela lixeira)' END;
    IF v_pedaco IS NULL THEN
      v_sev := 'critico';   -- exclusão sem rede de segurança
    END IF;
    v_detalhes := v_detalhes || jsonb_build_object(
      'valor', OLD.valor, 'status', OLD.status, 'operador_id', OLD.operador_id
    );
  END IF;

  -- Usuário: cargo e situação não são "mais um campo".
  IF TG_TABLE_NAME = 'perfis' AND TG_OP = 'UPDATE' THEN
    IF 'perfil' = ANY (v_campos) THEN
      v_acao := 'usuario_cargo_alterado';
      v_sev  := 'critico';
      v_descricao := 'Mudou o cargo de ' || COALESCE(v_rotulo, 'um usuário')
                     || ' de "' || COALESCE(v_antes ->> 'perfil', '—')
                     || '" para "' || COALESCE(v_depois ->> 'perfil', '—') || '"';
    ELSIF ('ativo' = ANY (v_campos)) OR ('situacao' = ANY (v_campos))
       OR ('desligado_em' = ANY (v_campos)) OR ('arquivado' = ANY (v_campos)) THEN
      v_acao := 'usuario_situacao_alterada';
      v_sev  := 'aviso';
      v_descricao := 'Alterou a situação de ' || COALESCE(v_rotulo, 'um usuário')
                     || COALESCE(': ' || (
                          SELECT string_agg(public.fn_log_rotulo_campo(k) || ' → '
                                            || COALESCE(v_depois ->> k, 'nulo'), ', ' ORDER BY k)
                            FROM unnest(v_campos) AS k
                           WHERE k IN ('ativo', 'situacao', 'desligado_em', 'arquivado')
                        ), '');
    END IF;
  END IF;

  -- Permissões de cargo: o diff útil é chave por chave, não "o JSONB mudou".
  -- Sem isto, a linha diria apenas "alterou permissões" e a tela mostraria dois
  -- objetos de 40 chaves para o administrador comparar a olho.
  IF TG_TABLE_NAME = 'cargos_permissoes' AND TG_OP = 'UPDATE'
     AND ('permissoes' = ANY (v_campos)) THEN
    v_diff := public.fn_log_diff(
      COALESCE(v_antes_row -> 'permissoes', '{}'::jsonb),
      COALESCE(v_depois_row -> 'permissoes', '{}'::jsonb),
      ARRAY[]::TEXT[]
    );
    SELECT array_agg(k ORDER BY k) INTO v_campos FROM jsonb_object_keys(v_diff) AS k;
    SELECT jsonb_object_agg(k, v_diff -> k -> 'antes'),
           jsonb_object_agg(k, v_diff -> k -> 'depois')
      INTO v_antes, v_depois
      FROM jsonb_object_keys(v_diff) AS k;

    v_acao := 'permissoes_alteradas';
    v_sev  := 'critico';
    v_descricao := 'Alterou permissões do cargo "' || COALESCE(NEW.cargo, '—') || '": '
      || COALESCE((
           SELECT string_agg(
                    CASE WHEN (v_depois -> k)::text = 'true' THEN '+' ELSE '−' END || k,
                    ', ' ORDER BY k)
             FROM unnest(v_campos) AS k
         ), 'nenhuma chave');
  END IF;

  -- ── Grava ─────────────────────────────────────────────────────────────────
  PERFORM public.fn_log_registrar(
    p_acao        := v_acao,
    p_categoria   := v_categoria,
    p_severidade  := v_sev,
    p_descricao   := v_descricao,
    p_empresa_id  := v_empresa,
    p_tabela      := TG_TABLE_NAME,
    p_registro_id := v_registro,
    -- `alvo_tipo` guarda o SLUG, não a frase: é chave de agrupamento na tela
    -- ("todo o histórico de acordos"), e chave não leva artigo nem acento.
    p_alvo_tipo   := v_slug,
    p_alvo_rotulo := v_rotulo,
    p_antes       := v_antes,
    p_depois      := v_depois,
    p_campos      := v_campos,
    p_detalhes    := CASE WHEN v_detalhes = '{}'::jsonb THEN NULL ELSE v_detalhes END,
    p_origem      := 'trigger'
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

EXCEPTION WHEN OTHERS THEN
  -- Nenhuma operação do sistema pode morrer porque a auditoria tropeçou.
  RAISE WARNING 'fn_log_auditoria falhou (%.% %): %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;


--
-- Name: FUNCTION "fn_log_auditoria"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_log_auditoria"() IS 'Trigger genérica de auditoria: diff campo a campo, frase pronta em português, severidade e rótulo humano. Configurada por TG_ARGV: (0) categoria, (1) slug da ação, (2) substantivo da frase, (3) colunas do rótulo, (4) colunas ignoradas, (5) coluna do tenant, (6) severidade base. Nunca levanta exceção. Ver 20260812a.';


--
-- Name: fn_log_contexto("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_log_contexto"("p_header" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_headers TEXT := current_setting('request.headers', true);
  v_valor   TEXT;
BEGIN
  IF v_headers IS NULL OR v_headers = '' THEN
    RETURN NULL;
  END IF;
  v_valor := v_headers::json ->> p_header;
  -- x-forwarded-for pode vir com a cadeia inteira; o primeiro é o cliente.
  IF p_header = 'x-forwarded-for' AND v_valor IS NOT NULL THEN
    v_valor := split_part(v_valor, ',', 1);
  END IF;
  RETURN left(trim(v_valor), 400);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;


--
-- Name: fn_log_diff("jsonb", "jsonb", "text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_log_diff"("p_antes" "jsonb", "p_depois" "jsonb", "p_ignorar" "text"[] DEFAULT ARRAY[]::"text"[]) RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      chave,
      jsonb_build_object('antes', p_antes -> chave, 'depois', p_depois -> chave)
    ),
    '{}'::jsonb
  )
  FROM (
    SELECT k AS chave FROM jsonb_object_keys(COALESCE(p_antes,  '{}'::jsonb)) AS k
    UNION
    SELECT k          FROM jsonb_object_keys(COALESCE(p_depois, '{}'::jsonb)) AS k
  ) AS chaves
  WHERE NOT (chave = ANY (COALESCE(p_ignorar, ARRAY[]::TEXT[])))
    AND COALESCE(p_antes  -> chave, 'null'::jsonb)
        IS DISTINCT FROM
        COALESCE(p_depois -> chave, 'null'::jsonb);
$$;


--
-- Name: FUNCTION "fn_log_diff"("p_antes" "jsonb", "p_depois" "jsonb", "p_ignorar" "text"[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_log_diff"("p_antes" "jsonb", "p_depois" "jsonb", "p_ignorar" "text"[]) IS 'Diff de dois JSONB: {campo: {antes, depois}} só para o que mudou, ignorando as chaves pedidas. Ver 20260812a.';


--
-- Name: fn_log_historico_acordo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_log_historico_acordo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  v_usuario_id := auth.uid();
  IF v_usuario_id IS NULL THEN
    v_usuario_id := NEW.operador_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'status', NULL, NEW.status::text);
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'status', OLD.status::text, NEW.status::text);
  END IF;

  IF OLD.valor IS DISTINCT FROM NEW.valor THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'valor', OLD.valor::text, NEW.valor::text);
  END IF;

  IF OLD.vencimento IS DISTINCT FROM NEW.vencimento THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'vencimento', OLD.vencimento::text, NEW.vencimento::text);
  END IF;

  IF OLD.nome_cliente IS DISTINCT FROM NEW.nome_cliente THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'nome_cliente', OLD.nome_cliente, NEW.nome_cliente);
  END IF;

  IF OLD.operador_id IS DISTINCT FROM NEW.operador_id THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'operador_id', OLD.operador_id::text, NEW.operador_id::text);
  END IF;

  IF OLD.tipo_vinculo IS DISTINCT FROM NEW.tipo_vinculo THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'tipo_vinculo',
       COALESCE(OLD.tipo_vinculo, 'direto'),
       COALESCE(NEW.tipo_vinculo, 'direto'));
  END IF;

  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'tipo', OLD.tipo::text, NEW.tipo::text);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_log_login_recusado("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_log_login_recusado"("p_identificador" "text", "p_motivo" "text" DEFAULT 'credenciais_invalidas'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_id       UUID;
  v_nome     TEXT;
  v_empresa  UUID;
  v_recente  UUID;
  v_qtd      INT;
  v_ident    TEXT := left(btrim(COALESCE(p_identificador, '')), 200);
BEGIN
  IF v_ident = '' THEN
    RETURN;
  END IF;

  SELECT p.id, p.nome, p.empresa_id
    INTO v_id, v_nome, v_empresa
    FROM public.perfis p
   WHERE lower(p.usuario) = lower(v_ident)
      OR lower(p.email)   = lower(v_ident)
   LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;   -- não existe: nada a auditar, nada a revelar
  END IF;

  -- Janela de 30s: agrupa a rajada em vez de multiplicá-la.
  SELECT l.id, COALESCE((l.detalhes ->> 'tentativas_janela')::INT, 1)
    INTO v_recente, v_qtd
    FROM public.logs_sistema l
   WHERE l.acao = 'login_recusado'
     AND l.registro_id = v_id::TEXT
     AND l.criado_em > now() - interval '30 seconds'
   ORDER BY l.criado_em DESC
   LIMIT 1;

  IF v_recente IS NOT NULL THEN
    UPDATE public.logs_sistema
       SET detalhes = COALESCE(detalhes, '{}'::jsonb)
                      || jsonb_build_object('tentativas_janela', v_qtd + 1),
           severidade = CASE WHEN v_qtd + 1 >= 5 THEN 'critico' ELSE 'aviso' END,
           descricao  = 'Login recusado para ' || COALESCE(v_nome, v_ident)
                        || ' (' || (v_qtd + 1) || ' tentativas em menos de 1 minuto)'
     WHERE id = v_recente;
    RETURN;
  END IF;

  INSERT INTO public.logs_sistema (
    usuario_id, usuario_nome, empresa_id, acao, categoria, severidade,
    descricao, tabela, registro_id, alvo_tipo, alvo_rotulo,
    detalhes, origem, ip, user_agent
  ) VALUES (
    v_id, v_nome, v_empresa, 'login_recusado', 'autenticacao', 'aviso',
    'Login recusado para ' || COALESCE(v_nome, v_ident),
    'auth.users', v_id::TEXT, 'usuario', COALESCE(v_nome, v_ident),
    jsonb_build_object('motivo', p_motivo, 'identificador', v_ident, 'tentativas_janela', 1),
    'anon',
    public.fn_log_contexto('x-forwarded-for'),
    public.fn_log_contexto('user-agent')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_log_login_recusado falhou: %', SQLERRM;
END $$;


--
-- Name: FUNCTION "fn_log_login_recusado"("p_identificador" "text", "p_motivo" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_log_login_recusado"("p_identificador" "text", "p_motivo" "text") IS 'Registra tentativa de login recusada. Chamável por anônimo — só grava se o identificador existir, agrupa rajadas de 30s numa linha e nunca revela se a conta existe. Ver 20260812a.';


--
-- Name: fn_log_mascarar("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_log_mascarar"("p_dados" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_saida JSONB := '{}'::jsonb;
  v_chave TEXT;
  v_valor JSONB;
  v_texto TEXT;
BEGIN
  IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RETURN p_dados;
  END IF;

  FOR v_chave, v_valor IN SELECT * FROM jsonb_each(p_dados) LOOP
    -- Sensível: fica só o final, o suficiente para reconhecer sem expor.
    IF v_chave ~* '(whatsapp|telefone|celular|senha|password|token|secret|cpf|cnpj|documento)' THEN
      v_texto := NULLIF(v_valor #>> '{}', '');
      v_saida := v_saida || jsonb_build_object(
        v_chave,
        CASE
          WHEN v_texto IS NULL THEN v_valor
          WHEN length(v_texto) <= 4 THEN to_jsonb('••••'::text)
          ELSE to_jsonb('••••' || right(v_texto, 4))
        END
      );

    -- Texto longo: corta e diz quanto era.
    ELSIF jsonb_typeof(v_valor) = 'string' AND length(v_valor #>> '{}') > 500 THEN
      v_texto := v_valor #>> '{}';
      v_saida := v_saida || jsonb_build_object(
        v_chave,
        to_jsonb(left(v_texto, 500) || '… (' || length(v_texto) || ' caracteres)')
      );

    ELSE
      v_saida := v_saida || jsonb_build_object(v_chave, v_valor);
    END IF;
  END LOOP;

  RETURN v_saida;
END $$;


--
-- Name: FUNCTION "fn_log_mascarar"("p_dados" "jsonb"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_log_mascarar"("p_dados" "jsonb") IS 'Mascara dado pessoal sensível (mantendo os 4 últimos caracteres) e trunca texto acima de 500 caracteres antes de gravar no log. Ver 20260812a.';


--
-- Name: fn_log_registrar("text", "text", "text", "text", "uuid", "text", "text", "text", "text", "jsonb", "jsonb", "text"[], "jsonb", "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_log_registrar"("p_acao" "text", "p_categoria" "text" DEFAULT 'sistema'::"text", "p_severidade" "text" DEFAULT 'info'::"text", "p_descricao" "text" DEFAULT NULL::"text", "p_empresa_id" "uuid" DEFAULT NULL::"uuid", "p_tabela" "text" DEFAULT NULL::"text", "p_registro_id" "text" DEFAULT NULL::"text", "p_alvo_tipo" "text" DEFAULT NULL::"text", "p_alvo_rotulo" "text" DEFAULT NULL::"text", "p_antes" "jsonb" DEFAULT NULL::"jsonb", "p_depois" "jsonb" DEFAULT NULL::"jsonb", "p_campos" "text"[] DEFAULT NULL::"text"[], "p_detalhes" "jsonb" DEFAULT NULL::"jsonb", "p_origem" "text" DEFAULT 'ui'::"text", "p_rota" "text" DEFAULT NULL::"text", "p_usuario_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sessao     UUID := auth.uid();
  v_autor      UUID;
  v_nome       TEXT;
  v_email      TEXT;
  v_cargo      TEXT;
  v_empresa    UUID;
  v_minha      UUID;
  v_super      BOOLEAN := false;
  v_detalhes   JSONB := COALESCE(p_detalhes, '{}'::jsonb);
  v_id         UUID;
BEGIN
  -- Autoria: a sessão manda. Sem sessão, aceita o que foi informado.
  v_autor := COALESCE(v_sessao, p_usuario_id);
  IF v_sessao IS NOT NULL AND p_usuario_id IS NOT NULL AND p_usuario_id <> v_sessao THEN
    v_detalhes := v_detalhes || jsonb_build_object('usuario_informado', p_usuario_id);
  END IF;

  SELECT p.nome, p.email, p.perfil, p.empresa_id
    INTO v_nome, v_email, v_cargo, v_minha
    FROM public.perfis p
   WHERE p.id = v_autor;

  v_super := (v_cargo = 'super_admin');

  -- Empresa: super_admin escolhe (ele opera nas duas operações); os demais
  -- ficam na própria, independente do que mandaram.
  IF v_super THEN
    v_empresa := COALESCE(p_empresa_id, v_minha);
  ELSE
    v_empresa := COALESCE(v_minha, p_empresa_id);
    IF p_empresa_id IS NOT NULL AND v_minha IS NOT NULL AND p_empresa_id <> v_minha THEN
      v_detalhes := v_detalhes || jsonb_build_object('empresa_informada', p_empresa_id);
    END IF;
  END IF;

  -- `empresa_id` é NOT NULL desde 11_tenant_lockdown. Sem empresa não há onde
  -- pendurar o log: aborta em silêncio em vez de estourar na operação real.
  IF v_empresa IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.logs_sistema (
    usuario_id, usuario_nome, usuario_email, usuario_cargo,
    empresa_id, acao, categoria, severidade, descricao,
    tabela, registro_id, alvo_tipo, alvo_rotulo,
    antes, depois, campos, detalhes,
    origem, rota, ip, user_agent
  ) VALUES (
    v_autor, v_nome, v_email, v_cargo,
    v_empresa, p_acao,
    COALESCE(p_categoria, 'sistema'),
    COALESCE(p_severidade, 'info'),
    NULLIF(btrim(COALESCE(p_descricao, '')), ''),
    p_tabela, p_registro_id, p_alvo_tipo, NULLIF(btrim(COALESCE(p_alvo_rotulo, '')), ''),
    public.fn_log_mascarar(p_antes),
    public.fn_log_mascarar(p_depois),
    p_campos,
    CASE WHEN v_detalhes = '{}'::jsonb THEN NULL ELSE public.fn_log_mascarar(v_detalhes) END,
    COALESCE(p_origem, 'ui'),
    p_rota,
    public.fn_log_contexto('x-forwarded-for'),
    public.fn_log_contexto('user-agent')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- Auditoria é efeito colateral. Se ela falhar, quem falha é ela.
  RAISE WARNING 'fn_log_registrar falhou (acao=%): %', p_acao, SQLERRM;
  RETURN NULL;
END $$;


--
-- Name: FUNCTION "fn_log_registrar"("p_acao" "text", "p_categoria" "text", "p_severidade" "text", "p_descricao" "text", "p_empresa_id" "uuid", "p_tabela" "text", "p_registro_id" "text", "p_alvo_tipo" "text", "p_alvo_rotulo" "text", "p_antes" "jsonb", "p_depois" "jsonb", "p_campos" "text"[], "p_detalhes" "jsonb", "p_origem" "text", "p_rota" "text", "p_usuario_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_log_registrar"("p_acao" "text", "p_categoria" "text", "p_severidade" "text", "p_descricao" "text", "p_empresa_id" "uuid", "p_tabela" "text", "p_registro_id" "text", "p_alvo_tipo" "text", "p_alvo_rotulo" "text", "p_antes" "jsonb", "p_depois" "jsonb", "p_campos" "text"[], "p_detalhes" "jsonb", "p_origem" "text", "p_rota" "text", "p_usuario_id" "uuid") IS 'Única porta de escrita em logs_sistema. Resolve autor pela sessão (não aceita autoria forjada), força a empresa do autor para quem não é super_admin, mascara dado sensível e captura IP/user-agent dos headers. Nunca levanta exceção. Ver 20260812a.';


--
-- Name: fn_log_rotulo_campo("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_log_rotulo_campo"("p_campo" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE p_campo
    WHEN 'nome_cliente'       THEN 'cliente'
    WHEN 'nr_cliente'         THEN 'NR'
    WHEN 'valor'              THEN 'valor'
    WHEN 'valor_total'        THEN 'valor total'
    WHEN 'vencimento'         THEN 'vencimento'
    WHEN 'status'             THEN 'status'
    WHEN 'tipo'               THEN 'tipo'
    WHEN 'tipo_vinculo'       THEN 'Direto/Extra'
    WHEN 'parcelas'           THEN 'parcelas'
    WHEN 'numero_parcela'     THEN 'número da parcela'
    WHEN 'observacoes'        THEN 'observações'
    WHEN 'operador_id'        THEN 'operador'
    WHEN 'setor_id'           THEN 'setor'
    WHEN 'equipe_id'          THEN 'equipe'
    WHEN 'lider_id'           THEN 'líder'
    WHEN 'instituicao'        THEN 'instituição'
    WHEN 'estado_uf'          THEN 'estado'
    WHEN 'data_pagamento'     THEN 'data de pagamento'
    WHEN 'pago_em'            THEN 'pago em'
    WHEN 'usou_quarenta_pct'  THEN 'usou 40%'
    WHEN 'tag_ids'            THEN 'tags'
    WHEN 'perfil'             THEN 'cargo'
    WHEN 'ativo'              THEN 'ativo'
    WHEN 'situacao'           THEN 'situação'
    WHEN 'arquivado'          THEN 'arquivado'
    WHEN 'desligado_em'       THEN 'desligamento'
    WHEN 'permissoes'         THEN 'permissões'
    WHEN 'meta_valor'         THEN 'meta de valor'
    WHEN 'meta_acordos'       THEN 'meta de acordos'
    WHEN 'pct'                THEN 'percentual'
    WHEN 'pct_comissao'       THEN 'percentual de comissão'
    WHEN 'pago'               THEN 'pagamento'
    WHEN 'nivel'              THEN 'nível de acesso'
    WHEN 'conteudo'           THEN 'conteúdo'
    WHEN 'nome'               THEN 'nome'
    WHEN 'email'              THEN 'e-mail'
    WHEN 'usuario'            THEN 'usuário'
    WHEN 'cor'                THEN 'cor'
    WHEN 'escopo'             THEN 'escopo'
    WHEN 'referencia_id'      THEN 'referência'
    WHEN 'responsavel_id'     THEN 'responsável'
    WHEN 'categoria'          THEN 'categoria'
    WHEN 'mensagem'           THEN 'mensagem'
    ELSE replace(p_campo, '_', ' ')
  END;
$$;


--
-- Name: fn_logs_expurgar(integer, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_logs_expurgar"("p_dias" integer DEFAULT 180, "p_empresa_id" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_super   BOOLEAN := public.fn_user_is_super_admin();
  v_minha   UUID    := public.fn_user_empresa_id();
  v_empresa UUID;
  v_corte   TIMESTAMPTZ;
  v_qtd     INT;
BEGIN
  IF NOT v_super THEN
    RAISE EXCEPTION 'Apenas super_admin pode expurgar logs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Piso de 30 dias. "Apagar tudo agora" é o pedido de quem quer esconder algo,
  -- e é exatamente o que uma trilha de auditoria não deve oferecer com um
  -- clique. Quem precisar de menos, faz no SQL Editor e deixa rastro lá.
  IF p_dias IS NULL OR p_dias < 30 THEN
    RAISE EXCEPTION 'Retenção mínima de 30 dias (pedido: % dias).', p_dias
      USING ERRCODE = 'check_violation';
  END IF;

  v_empresa := COALESCE(p_empresa_id, v_minha);
  v_corte   := now() - make_interval(days => p_dias);

  DELETE FROM public.logs_sistema
   WHERE criado_em < v_corte
     AND (v_empresa IS NULL OR empresa_id = v_empresa);
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  -- O expurgo é um evento de auditoria como qualquer outro — e, por ser
  -- destrutivo, dos mais importantes.
  PERFORM public.fn_log_registrar(
    p_acao        := 'logs_expurgados',
    p_categoria   := 'seguranca',
    p_severidade  := 'critico',
    p_descricao   := 'Expurgou ' || v_qtd || ' registro(s) de log com mais de '
                     || p_dias || ' dias',
    p_empresa_id  := v_empresa,
    p_tabela      := 'logs_sistema',
    p_alvo_tipo   := 'trilha de auditoria',
    p_detalhes    := jsonb_build_object(
                       'dias_retencao', p_dias,
                       'corte', v_corte,
                       'removidos', v_qtd
                     ),
    p_origem      := 'ui'
  );

  RETURN v_qtd;
END $$;


--
-- Name: FUNCTION "fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid") IS 'Único caminho de exclusão em logs_sistema: super_admin, idade mínima de 30 dias, e registra o próprio expurgo. Ver 20260812a.';


--
-- Name: fn_logs_resumo("uuid", timestamp with time zone, timestamp with time zone, "text", "text", "text", "uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_logs_resumo"("p_empresa_id" "uuid" DEFAULT NULL::"uuid", "p_de" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_ate" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_categoria" "text" DEFAULT NULL::"text", "p_severidade" "text" DEFAULT NULL::"text", "p_acao" "text" DEFAULT NULL::"text", "p_usuario_id" "uuid" DEFAULT NULL::"uuid", "p_tabela" "text" DEFAULT NULL::"text", "p_origem" "text" DEFAULT NULL::"text", "p_busca" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH base AS (
    SELECT l.*
      FROM public.logs_sistema l
     WHERE (p_empresa_id IS NULL OR l.empresa_id = p_empresa_id)
       AND (p_de         IS NULL OR l.criado_em >= p_de)
       AND (p_ate        IS NULL OR l.criado_em <= p_ate)
       AND (p_categoria  IS NULL OR l.categoria = p_categoria)
       AND (p_severidade IS NULL OR l.severidade = p_severidade)
       AND (p_acao       IS NULL OR l.acao = p_acao)
       AND (p_usuario_id IS NULL OR l.usuario_id = p_usuario_id)
       AND (p_tabela     IS NULL OR l.tabela = p_tabela)
       AND (p_origem     IS NULL OR l.origem = p_origem)
       AND (
         p_busca IS NULL OR btrim(p_busca) = ''
         OR l.descricao    ILIKE '%' || p_busca || '%'
         OR l.alvo_rotulo  ILIKE '%' || p_busca || '%'
         OR l.usuario_nome ILIKE '%' || p_busca || '%'
         OR l.acao         ILIKE '%' || p_busca || '%'
         OR l.registro_id  ILIKE '%' || p_busca || '%'
       )
  )
  SELECT jsonb_build_object(
    'total',            (SELECT count(*)                        FROM base),
    'criticos',         (SELECT count(*) FROM base WHERE severidade = 'critico'),
    'avisos',           (SELECT count(*) FROM base WHERE severidade = 'aviso'),
    'exclusoes',        (SELECT count(*) FROM base WHERE acao LIKE '%_excluido%' OR acao LIKE '%exclu%'),
    'usuarios_ativos',  (SELECT count(DISTINCT usuario_id)      FROM base WHERE usuario_id IS NOT NULL),
    'automaticos',      (SELECT count(*) FROM base WHERE origem IN ('automatico', 'importacao')),
    'primeiro_em',      (SELECT min(criado_em)                  FROM base),
    'ultimo_em',        (SELECT max(criado_em)                  FROM base),

    'por_categoria', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT categoria AS chave, count(*) AS total
          FROM base GROUP BY categoria ORDER BY count(*) DESC
      ) x), '[]'::jsonb),

    'por_severidade', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT severidade AS chave, count(*) AS total
          FROM base GROUP BY severidade
      ) x), '[]'::jsonb),

    'por_acao', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT acao AS chave, count(*) AS total
          FROM base GROUP BY acao ORDER BY count(*) DESC LIMIT 12
      ) x), '[]'::jsonb),

    'por_usuario', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(usuario_nome, 'Sistema') AS chave,
               usuario_id                        AS id,
               count(*)                          AS total
          FROM base GROUP BY usuario_nome, usuario_id ORDER BY count(*) DESC LIMIT 8
      ) x), '[]'::jsonb),

    'por_tabela', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(tabela, '—') AS chave, count(*) AS total
          FROM base GROUP BY tabela ORDER BY count(*) DESC LIMIT 10
      ) x), '[]'::jsonb),

    -- Série diária no fuso de São Paulo: o gráfico tem de bater com o dia que
    -- a operação viveu, não com o dia UTC.
    'por_dia', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x ->> 'chave')) FROM (
        SELECT jsonb_build_object(
                 'chave', to_char((criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
                 'total', count(*),
                 'criticos', count(*) FILTER (WHERE severidade = 'critico')
               ) AS x
          FROM base
         GROUP BY (criado_em AT TIME ZONE 'America/Sao_Paulo')::date
      ) s), '[]'::jsonb),

    'por_hora', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x ->> 'chave')::INT) FROM (
        SELECT jsonb_build_object(
                 'chave', extract(hour FROM criado_em AT TIME ZONE 'America/Sao_Paulo')::INT,
                 'total', count(*)
               ) AS x
          FROM base
         GROUP BY extract(hour FROM criado_em AT TIME ZONE 'America/Sao_Paulo')
      ) s), '[]'::jsonb)
  );
$$;


--
-- Name: FUNCTION "fn_logs_resumo"("p_empresa_id" "uuid", "p_de" timestamp with time zone, "p_ate" timestamp with time zone, "p_categoria" "text", "p_severidade" "text", "p_acao" "text", "p_usuario_id" "uuid", "p_tabela" "text", "p_origem" "text", "p_busca" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_logs_resumo"("p_empresa_id" "uuid", "p_de" timestamp with time zone, "p_ate" timestamp with time zone, "p_categoria" "text", "p_severidade" "text", "p_acao" "text", "p_usuario_id" "uuid", "p_tabela" "text", "p_origem" "text", "p_busca" "text") IS 'Agregados da tela de Logs calculados sobre o filtro INTEIRO (não sobre a página carregada). SECURITY INVOKER: respeita o RLS de quem chama. Ver 20260812a.';


--
-- Name: fn_marcar_cpf_mensagem(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_marcar_cpf_mensagem"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Mensagem já expurgada não volta a ser marcada: o texto censurado não tem
  -- CPF, e rearmar o relógio deixaria a linha em ciclo eterno.
  IF NEW.expurgado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF public.fn_texto_tem_cpf(NEW.conteudo) THEN
    NEW.tem_cpf := TRUE;
    -- Só arma o relógio uma vez. Editar a mensagem depois não estica o prazo.
    NEW.expurgar_em := COALESCE(NEW.expurgar_em, now() + INTERVAL '12 hours');
  ELSE
    NEW.tem_cpf := FALSE;
    NEW.expurgar_em := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_marcar_cpf_solicitacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_marcar_cpf_solicitacao"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.msg_expurgado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF public.fn_texto_tem_cpf(NEW.mensagem) THEN
    NEW.msg_tem_cpf := TRUE;
    NEW.msg_expurgar_em := COALESCE(NEW.msg_expurgar_em, now() + INTERVAL '12 hours');
  ELSE
    NEW.msg_tem_cpf := FALSE;
    NEW.msg_expurgar_em := NULL;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_meta_esta_bloqueada("text", "uuid", "uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_meta_esta_bloqueada"("p_tipo" "text", "p_referencia_id" "uuid", "p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_setor_id UUID;
BEGIN
  IF p_tipo = 'setor' THEN
    v_setor_id := p_referencia_id;
  ELSIF p_tipo = 'equipe' THEN
    SELECT setor_id INTO v_setor_id FROM public.equipes WHERE id = p_referencia_id;
  ELSIF p_tipo = 'operador' THEN
    SELECT setor_id INTO v_setor_id FROM public.perfis WHERE id = p_referencia_id;
  END IF;

  -- Setor não resolvível (equipe/operador órfão): nada para travar.
  IF v_setor_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.metas_validacoes
    WHERE empresa_id = p_empresa_id AND setor_id = v_setor_id
      AND mes = p_mes AND ano = p_ano AND status = 'validado'
  );
END;
$$;


--
-- Name: fn_metas_esta_validada("uuid", "uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_metas_esta_validada"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.metas_validacoes
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
      AND mes = p_mes AND ano = p_ano AND status = 'validado'
  );
$$;


--
-- Name: fn_metas_reabrir_setor("uuid", "uuid", integer, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text") RETURNS TABLE("ok" boolean, "erro" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT; RETURN;
  END IF;
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RETURN QUERY SELECT false, 'motivo_obrigatorio'::TEXT; RETURN;
  END IF;

  UPDATE public.metas_validacoes
    SET status = 'aberto', reaberto_por = v_uid, reaberto_em = NOW(), motivo_reabertura = p_motivo
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id AND mes = p_mes AND ano = p_ano;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'nao_validado'::TEXT; RETURN;
  END IF;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'META_REABERTA', 'metas_validacoes', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano, 'motivo', p_motivo));

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;


--
-- Name: fn_metas_upsert("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_metas_upsert"("p_payloads" "jsonb") RETURNS TABLE("salvos" integer, "bloqueados" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_perfil     TEXT;
  v_empresa    UUID;
  v_item       JSONB;
  v_tipo       TEXT;
  v_ref        UUID;
  v_emp_item   UUID;
  v_mes        INTEGER;
  v_ano        INTEGER;
  v_salvos     INTEGER := 0;
  v_bloqueados JSONB := '[]'::JSONB;
BEGIN
  SELECT perfil::text, empresa_id INTO v_perfil, v_empresa FROM public.perfis WHERE id = auth.uid();

  IF v_perfil IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF v_perfil NOT IN ('administrador','lider','super_admin','elite','gerencia') THEN
    RAISE EXCEPTION 'Permissão negada: cargo % não pode salvar metas', v_perfil;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payloads) LOOP
    v_tipo     := v_item->>'tipo';
    v_ref      := (v_item->>'referencia_id')::UUID;
    v_emp_item := (v_item->>'empresa_id')::UUID;
    v_mes      := (v_item->>'mes')::INTEGER;
    v_ano      := (v_item->>'ano')::INTEGER;

    IF v_emp_item != v_empresa AND v_perfil != 'super_admin' THEN
      RAISE EXCEPTION 'Permissão negada: empresa_id inválido';
    END IF;

    IF public.fn_meta_esta_bloqueada(v_tipo, v_ref, v_emp_item, v_mes, v_ano) THEN
      v_bloqueados := v_bloqueados || jsonb_build_object('referencia_id', v_ref, 'tipo', v_tipo);
      CONTINUE;
    END IF;

    INSERT INTO public.metas
      (tipo, referencia_id, empresa_id, meta_valor, meta_acordos, meta_proporcional, metas_extras, mes, ano)
    VALUES (
      v_tipo, v_ref, v_emp_item,
      (v_item->>'meta_valor')::NUMERIC,
      COALESCE((v_item->>'meta_acordos')::INTEGER, 0),
      COALESCE((v_item->>'meta_proporcional')::BOOLEAN, false),
      COALESCE(v_item->'metas_extras', '[]'::jsonb),
      v_mes, v_ano
    )
    ON CONFLICT (tipo, referencia_id, empresa_id, mes, ano) DO UPDATE SET
      meta_valor        = EXCLUDED.meta_valor,
      meta_acordos      = EXCLUDED.meta_acordos,
      meta_proporcional = EXCLUDED.meta_proporcional,
      metas_extras      = CASE WHEN v_item ? 'metas_extras' THEN EXCLUDED.metas_extras ELSE public.metas.metas_extras END,
      updated_at        = now();

    v_salvos := v_salvos + 1;
  END LOOP;

  RETURN QUERY SELECT v_salvos, v_bloqueados;
END;
$$;


--
-- Name: fn_metas_validar_setor("uuid", "uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) RETURNS TABLE("ok" boolean, "erro" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT; RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.metas m
    WHERE m.empresa_id = p_empresa_id AND m.mes = p_mes AND m.ano = p_ano
      AND (
        (m.tipo = 'setor'    AND m.referencia_id = p_setor_id)
        OR (m.tipo = 'equipe'   AND m.referencia_id IN (SELECT id FROM public.equipes WHERE setor_id = p_setor_id))
        OR (m.tipo = 'operador' AND m.referencia_id IN (SELECT id FROM public.perfis  WHERE setor_id = p_setor_id))
      )
  ) THEN
    RETURN QUERY SELECT false, 'sem_metas_para_validar'::TEXT; RETURN;
  END IF;

  INSERT INTO public.metas_validacoes (empresa_id, setor_id, mes, ano, status, validado_por, validado_em)
  VALUES (p_empresa_id, p_setor_id, p_mes, p_ano, 'validado', v_uid, NOW())
  ON CONFLICT (empresa_id, setor_id, mes, ano) DO UPDATE
    SET status = 'validado', validado_por = v_uid, validado_em = NOW();

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'META_VALIDADA', 'metas_validacoes', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano));

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;


--
-- Name: fn_nr_campo_chave("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_nr_campo_chave"("p_nr_cliente" "text", "p_instituicao" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN TRIM(COALESCE(p_nr_cliente, ''))  <> '' THEN 'nr_cliente'
    WHEN TRIM(COALESCE(p_instituicao, '')) <> '' THEN 'instituicao'
    ELSE NULL
  END;
$$;


--
-- Name: FUNCTION "fn_nr_campo_chave"("p_nr_cliente" "text", "p_instituicao" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_nr_campo_chave"("p_nr_cliente" "text", "p_instituicao" "text") IS 'Qual campo vale como chave de NR: nr_cliente quando existe (BookPlay), senão instituicao (PaguePlay). Na BookPlay instituicao é categoria, não chave. Ver 20260810b.';


--
-- Name: fn_nr_dono_conflitante("uuid", "text", "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_nr_dono_conflitante"("p_empresa_id" "uuid", "p_nr" "text", "p_campo" "text", "p_operador_id" "uuid", "p_grupo_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT r.operador_nome
    FROM public.nr_registros r
    JOIN public.acordos a ON a.id = r.acordo_id
   WHERE r.empresa_id  = p_empresa_id
     AND r.nr_value    = p_nr
     AND r.campo       = p_campo
     AND r.operador_id IS DISTINCT FROM p_operador_id
     -- parcela do mesmo grupo não conflita: o pai já é dono do NR
     AND (p_grupo_id IS NULL OR a.acordo_grupo_id IS DISTINCT FROM p_grupo_id)
   LIMIT 1;
$$;


--
-- Name: fn_nr_exigir_livre("uuid", "text", "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_nr_exigir_livre"("p_empresa_id" "uuid", "p_nr" "text", "p_campo" "text", "p_operador_id" "uuid", "p_grupo_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_dono TEXT;
BEGIN
  v_dono := public.fn_nr_dono_conflitante(p_empresa_id, p_nr, p_campo, p_operador_id, p_grupo_id);
  IF v_dono IS NOT NULL THEN
    RAISE EXCEPTION
      'NR_JA_REGISTRADO: % "%" já está tabulado por %. Recarregue a lista e use o fluxo de autorização.',
      CASE WHEN p_campo = 'instituicao' THEN 'o Código' ELSE 'o NR' END,
      p_nr, v_dono;
  END IF;
END;
$$;


--
-- Name: fn_operador_clonado_no_setor("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_operador_clonado_no_setor"("p_operador_id" "uuid", "p_setor_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p_setor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
    WHERE c.operador_id = p_operador_id
      AND e.setor_id   = p_setor_id
  );
$$;


--
-- Name: fn_operador_setor_id("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_operador_setor_id"("p_operador_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.setor_id FROM public.perfis p WHERE p.id = p_operador_id;
$$;


--
-- Name: fn_ouvidoria_nivel("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_ouvidoria_nivel"("target_empresa_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN public.fn_user_has_any_role(ARRAY['ouvidoria','administrador','super_admin'])
      THEN 'editar'
    ELSE COALESCE(
      (SELECT a.nivel FROM public.ouvidoria_acessos a
        WHERE a.usuario_id = auth.uid()
          AND a.empresa_id = target_empresa_id
        LIMIT 1),
      'nenhum')
  END;
$$;


--
-- Name: fn_pet_admin_ajustar_moedas("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer) RETURNS TABLE("ok" boolean, "moedas_total" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_saldo INTEGER;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR p_usuario IS NULL OR p_delta IS NULL OR p_delta = 0 THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (p_usuario)
    ON CONFLICT (usuario_id) DO NOTHING;

  SELECT moedas INTO v_saldo FROM public.pet_estado WHERE usuario_id = p_usuario FOR UPDATE;

  IF v_saldo + p_delta < 0 THEN
    RETURN QUERY SELECT false, v_saldo; RETURN;
  END IF;

  UPDATE public.pet_estado
    SET moedas              = moedas + p_delta,
        moedas_ganhas_total = moedas_ganhas_total + GREATEST(p_delta, 0),
        moedas_gastas_total = moedas_gastas_total + GREATEST(-p_delta, 0),
        atualizado_em       = NOW()
    WHERE usuario_id = p_usuario
    RETURNING moedas INTO v_saldo;

  RETURN QUERY SELECT true, v_saldo;
END;
$$;


--
-- Name: fn_pet_admin_ajustar_moedas("uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer, "p_motivo" "text") RETURNS TABLE("ok" boolean, "moedas_total" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_saldo   INTEGER;
  v_empresa UUID;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR p_usuario IS NULL OR p_delta IS NULL OR p_delta = 0
     OR p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (p_usuario)
    ON CONFLICT (usuario_id) DO NOTHING;

  SELECT moedas INTO v_saldo FROM public.pet_estado WHERE usuario_id = p_usuario FOR UPDATE;

  IF v_saldo + p_delta < 0 THEN
    RETURN QUERY SELECT false, v_saldo; RETURN;
  END IF;

  UPDATE public.pet_estado
    SET moedas              = moedas + p_delta,
        moedas_ganhas_total = moedas_ganhas_total + GREATEST(p_delta, 0),
        moedas_gastas_total = moedas_gastas_total + GREATEST(-p_delta, 0),
        atualizado_em       = NOW()
    WHERE usuario_id = p_usuario
    RETURNING moedas INTO v_saldo;

  SELECT empresa_id INTO v_empresa FROM public.perfis WHERE id = p_usuario;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, v_empresa, 'PET_AJUSTE_MANUAL', 'pet_estado', p_usuario::TEXT,
          jsonb_build_object('usuario_alvo', p_usuario, 'delta', p_delta, 'motivo', p_motivo, 'saldo_resultante', v_saldo));

  RETURN QUERY SELECT true, v_saldo;
END;
$$;


--
-- Name: fn_pet_admin_listar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_admin_listar"() RETURNS TABLE("usuario_id" "uuid", "nome" "text", "cargo" "text", "moedas" integer, "moedas_ganhas_total" bigint, "moedas_gastas_total" bigint, "xp" integer, "nivel" integer, "streak" integer, "qtd_itens" integer, "roupa_equipada" "text", "ultimo_dia_ativo" "date")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT e.usuario_id, p.nome, p.perfil::text,
         e.moedas, e.moedas_ganhas_total, e.moedas_gastas_total,
         e.xp, e.nivel, e.streak,
         (SELECT COUNT(*) FROM jsonb_array_elements_text(e.itens_desbloqueados))::INTEGER,
         e.roupa_equipada, e.ultimo_dia_ativo
  FROM public.pet_estado e
  JOIN public.perfis p ON p.id = e.usuario_id
  WHERE public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  ORDER BY e.moedas DESC, p.nome;
$$;


--
-- Name: fn_pet_comprar_item("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_comprar_item"("p_item_id" "text") RETURNS TABLE("ok" boolean, "erro" "text", "moedas_total" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_item  public.pet_itens;
  v_saldo INTEGER;
BEGIN
  IF v_uid IS NULL OR p_item_id IS NULL THEN
    RETURN QUERY SELECT false, 'nao_encontrado'::TEXT, 0; RETURN;
  END IF;

  SELECT * INTO v_item FROM public.pet_itens WHERE id = p_item_id;

  IF v_item.id IS NULL THEN
    RETURN QUERY SELECT false, 'nao_encontrado'::TEXT, 0; RETURN;
  END IF;

  -- vendável agora? (ativo, não-exclusivo, com preço, dentro da janela)
  IF NOT v_item.ativo
     OR v_item.exclusivo
     OR v_item.preco_moedas IS NULL
     OR v_item.preco_moedas <= 0
     OR (v_item.disponivel_de  IS NOT NULL AND NOW() <  v_item.disponivel_de)
     OR (v_item.disponivel_ate IS NOT NULL AND NOW() >= v_item.disponivel_ate)
  THEN
    RETURN QUERY SELECT false, 'indisponivel'::TEXT, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;

  -- itens permanentes não podem ser comprados duas vezes
  IF v_item.tipo <> 'comida' AND EXISTS (
    SELECT 1 FROM public.pet_inventario
    WHERE usuario_id = v_uid AND item_id = v_item.id
  ) THEN
    RETURN QUERY SELECT false, 'ja_possui'::TEXT,
      (SELECT moedas FROM public.pet_estado WHERE usuario_id = v_uid);
    RETURN;
  END IF;

  SELECT moedas INTO v_saldo FROM public.pet_estado WHERE usuario_id = v_uid FOR UPDATE;

  IF v_saldo < v_item.preco_moedas THEN
    RETURN QUERY SELECT false, 'saldo'::TEXT, v_saldo; RETURN;
  END IF;

  UPDATE public.pet_estado
    SET moedas              = moedas - v_item.preco_moedas,
        moedas_gastas_total = moedas_gastas_total + v_item.preco_moedas,
        itens_desbloqueados = CASE
          WHEN v_item.tipo = 'comida' OR itens_desbloqueados ? v_item.id THEN itens_desbloqueados
          ELSE itens_desbloqueados || to_jsonb(v_item.id)
        END,
        atualizado_em       = NOW()
    WHERE usuario_id = v_uid
    RETURNING moedas INTO v_saldo;

  IF v_item.tipo <> 'comida' THEN
    INSERT INTO public.pet_inventario (usuario_id, item_id, origem)
      VALUES (v_uid, v_item.id, 'compra')
    ON CONFLICT (usuario_id, item_id) DO NOTHING;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT, v_saldo;
END;
$$;


--
-- Name: fn_pet_dias_disponiveis(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_dias_disponiveis"() RETURNS TABLE("dia" "date", "total_dia" numeric, "ja_resgatado" numeric, "delta" numeric, "setor_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_cargo  TEXT;
  v_base   TEXT;
  v_janela INTEGER;
  v_ativo  BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT p.perfil::text INTO v_cargo FROM public.perfis p WHERE p.id = v_uid;

  SELECT r.base_recebimento, r.janela_dias, r.ativo
    INTO v_base, v_janela, v_ativo
    FROM public.pet_economia_regras r
    WHERE r.cargo = v_cargo;

  IF NOT COALESCE(v_ativo, false) THEN RETURN; END IF;

  RETURN QUERY
  WITH receb AS (
    SELECT d.dia_referencia AS dia, d.setor_id AS setor_id, SUM(d.valor_recebido) AS total_setor_dia
    FROM public.diario_recebimentos d
    WHERE d.dia_referencia >= (CURRENT_DATE - (COALESCE(v_janela, 7) - 1))
      AND (d.prox_contato IS NULL OR d.prox_contato > CURRENT_DATE)
      AND (
        (v_base = 'proprio' AND d.operador_id = v_uid)
        OR (v_base = 'empresa' AND public.fn_can_access_empresa(d.empresa_id))
      )
    GROUP BY d.dia_referencia, d.setor_id
  ),
  capado AS (
    SELECT r.dia, r.setor_id,
           LEAST(r.total_setor_dia, COALESCE(v.valor_validado, 0)) AS valor_liberado
    FROM receb r
    LEFT JOIN public.relatorio_validacoes_dia v
      ON v.origem = 'diario' AND v.dia_referencia = r.dia AND v.setor_id = r.setor_id
  ),
  por_dia AS (
    SELECT c.dia,
           SUM(c.valor_liberado) AS total_dia,
           -- Só marca um setor "dono" quando o dia inteiro veio de um único
           -- setor (o caso normal de base 'proprio'). Base 'empresa' pode
           -- somar vários setores no mesmo dia — aí fica sem dono único.
           -- MIN(uuid) não existe no Postgres: agrega via texto e volta pra uuid.
           CASE WHEN COUNT(DISTINCT c.setor_id) = 1 THEN MIN(c.setor_id::text)::uuid ELSE NULL END AS setor_unico
    FROM capado c
    GROUP BY c.dia
  )
  SELECT pd.dia,
         pd.total_dia,
         COALESCE(pr.valor_resgatado, 0),
         GREATEST(pd.total_dia - COALESCE(pr.valor_resgatado, 0), 0),
         pd.setor_unico
  FROM por_dia pd
  LEFT JOIN public.pet_recompensas pr
    ON pr.usuario_id = v_uid AND pr.dia_referencia = pd.dia;
END;
$$;


--
-- Name: fn_pet_discrepancias_validacao("uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_discrepancias_validacao"("p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer) RETURNS TABLE("setor_id" "uuid", "setor_nome" "text", "dia_referencia" "date", "valor_validado" numeric, "valor_atual" numeric, "diferenca" numeric, "usuario_id" "uuid", "usuario_nome" "text", "moedas_creditadas" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inicio DATE := make_date(p_ano, p_mes, 1);
  v_fim    DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN RETURN; END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH atual AS (
    SELECT setor_id, dia_referencia AS dia, SUM(valor_recebido) AS total
    FROM public.diario_recebimentos
    WHERE empresa_id = p_empresa_id AND dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY setor_id, dia_referencia
  ),
  encolhidos AS (
    SELECT v.setor_id, v.dia_referencia AS dia, v.valor_validado,
           COALESCE(a.total, 0) AS valor_atual
    FROM public.relatorio_validacoes_dia v
    LEFT JOIN atual a ON a.setor_id = v.setor_id AND a.dia = v.dia_referencia
    WHERE v.empresa_id = p_empresa_id AND v.origem = 'diario'
      AND v.dia_referencia BETWEEN v_inicio AND v_fim
      AND v.valor_validado > COALESCE(a.total, 0)
  )
  SELECT e.setor_id, s.nome, e.dia, e.valor_validado, e.valor_atual,
         e.valor_validado - e.valor_atual,
         pr.usuario_id, p.nome, pr.moedas_creditadas
  FROM encolhidos e
  JOIN public.setores s ON s.id = e.setor_id
  LEFT JOIN public.pet_recompensas pr ON pr.setor_id = e.setor_id AND pr.dia_referencia = e.dia
  LEFT JOIN public.perfis p ON p.id = pr.usuario_id
  ORDER BY e.dia, s.nome;
END;
$$;


--
-- Name: pet_estado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pet_estado" (
    "usuario_id" "uuid" NOT NULL,
    "moedas" integer DEFAULT 0 NOT NULL,
    "moedas_ganhas_total" bigint DEFAULT 0 NOT NULL,
    "moedas_gastas_total" bigint DEFAULT 0 NOT NULL,
    "xp" integer DEFAULT 0 NOT NULL,
    "nivel" integer DEFAULT 1 NOT NULL,
    "streak" integer DEFAULT 0 NOT NULL,
    "ultimo_dia_ativo" "date",
    "roupa_equipada" "text" DEFAULT 'nenhuma'::"text" NOT NULL,
    "itens_desbloqueados" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "dormindo" boolean DEFAULT false NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: fn_pet_estado_get(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_estado_get"() RETURNS "public"."pet_estado"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.pet_estado;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;
  SELECT * INTO v_row FROM public.pet_estado WHERE usuario_id = v_uid;
  RETURN v_row;
END;
$$;


--
-- Name: fn_pet_gastar_moedas(integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_gastar_moedas"("p_valor" integer, "p_item" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "moedas_total" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_saldo INTEGER;
BEGIN
  IF p_item IS NOT NULL THEN
    RETURN QUERY SELECT c.ok, c.moedas_total FROM public.fn_pet_comprar_item(p_item) c;
    RETURN;
  END IF;

  IF v_uid IS NULL OR p_valor IS NULL OR p_valor <= 0 THEN
    RETURN QUERY SELECT false, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;

  SELECT moedas INTO v_saldo FROM public.pet_estado WHERE usuario_id = v_uid FOR UPDATE;

  IF v_saldo < p_valor THEN
    RETURN QUERY SELECT false, v_saldo; RETURN;
  END IF;

  UPDATE public.pet_estado
    SET moedas              = moedas - p_valor,
        moedas_gastas_total = moedas_gastas_total + p_valor,
        atualizado_em       = NOW()
    WHERE usuario_id = v_uid
    RETURNING moedas INTO v_saldo;

  RETURN QUERY SELECT true, v_saldo;
END;
$$;


--
-- Name: fn_pet_nome_resultado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_nome_resultado"() RETURNS TABLE("empresa_id" "uuid", "empresa_slug" "text", "nome_escolhido" "text", "votos" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT v.empresa_id, e.slug, v.nome_escolhido, COUNT(*)::BIGINT AS votos
  FROM public.pet_nome_votos v
  LEFT JOIN public.empresas e ON e.id = v.empresa_id
  WHERE public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
    AND (
      public.fn_user_has_any_role(ARRAY['super_admin'])
      OR public.fn_can_access_empresa(v.empresa_id)
    )
  GROUP BY v.empresa_id, e.slug, v.nome_escolhido
  ORDER BY e.slug, COUNT(*) DESC;
$$;


--
-- Name: fn_pet_recompensa_disponivel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_recompensa_disponivel"() RETURNS TABLE("valor_disponivel" numeric, "moedas_disponivel" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(SUM(delta), 0)::NUMERIC,
         FLOOR(COALESCE(SUM(delta), 0) * public.fn_pet_taxa())::INTEGER
  FROM public.fn_pet_dias_disponiveis();
$$;


--
-- Name: fn_pet_resgatar_recompensa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_resgatar_recompensa"() RETURNS TABLE("moedas_creditadas" integer, "valor_base" numeric, "moedas_total" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid    UUID    := auth.uid();
  v_taxa   NUMERIC := public.fn_pet_taxa();
  v_valor  NUMERIC := 0;
  v_moedas INTEGER := 0;
  rec      RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 0, 0::NUMERIC, 0; RETURN;
  END IF;

  INSERT INTO public.pet_estado (usuario_id) VALUES (v_uid)
    ON CONFLICT (usuario_id) DO NOTHING;

  FOR rec IN SELECT * FROM public.fn_pet_dias_disponiveis() WHERE delta > 0 LOOP
    v_valor := v_valor + rec.delta;
    INSERT INTO public.pet_recompensas
      (usuario_id, dia_referencia, valor_resgatado, moedas_creditadas, setor_id, valor_validado_no_momento)
      VALUES (v_uid, rec.dia, rec.total_dia, FLOOR(rec.delta * v_taxa)::INTEGER, rec.setor_id, rec.total_dia)
    ON CONFLICT (usuario_id, dia_referencia) DO UPDATE
      SET valor_resgatado           = EXCLUDED.valor_resgatado,
          moedas_creditadas         = public.pet_recompensas.moedas_creditadas + EXCLUDED.moedas_creditadas,
          setor_id                  = EXCLUDED.setor_id,
          valor_validado_no_momento = EXCLUDED.valor_validado_no_momento,
          atualizado_em             = NOW();
  END LOOP;

  v_moedas := FLOOR(v_valor * v_taxa)::INTEGER;

  IF v_moedas > 0 THEN
    UPDATE public.pet_estado
      SET moedas              = moedas + v_moedas,
          moedas_ganhas_total = moedas_ganhas_total + v_moedas,
          xp                  = xp + v_moedas,
          ultimo_dia_ativo    = CURRENT_DATE,
          atualizado_em       = NOW()
      WHERE usuario_id = v_uid;
  END IF;

  RETURN QUERY
    SELECT v_moedas, v_valor,
           (SELECT moedas FROM public.pet_estado WHERE usuario_id = v_uid);
END;
$$;


--
-- Name: fn_pet_salvar_visual("text", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_salvar_visual"("p_roupa" "text", "p_dormindo" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_permitida BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  v_permitida := COALESCE(p_roupa, 'nenhuma') = 'nenhuma'
    OR EXISTS (
      SELECT 1 FROM public.pet_itens i
      WHERE i.id = p_roupa AND i.tipo = 'roupa' AND i.preco_moedas = 0
    )
    OR EXISTS (
      SELECT 1 FROM public.pet_inventario inv
      WHERE inv.usuario_id = v_uid AND inv.item_id = p_roupa
    )
    OR EXISTS (
      SELECT 1 FROM public.pet_estado e
      WHERE e.usuario_id = v_uid AND e.itens_desbloqueados ? p_roupa
    );

  INSERT INTO public.pet_estado (usuario_id, roupa_equipada, dormindo)
    VALUES (v_uid,
            CASE WHEN v_permitida THEN COALESCE(p_roupa, 'nenhuma') ELSE 'nenhuma' END,
            COALESCE(p_dormindo, false))
  ON CONFLICT (usuario_id) DO UPDATE
    SET roupa_equipada = CASE WHEN v_permitida
                              THEN COALESCE(EXCLUDED.roupa_equipada, 'nenhuma')
                              ELSE public.pet_estado.roupa_equipada END,
        dormindo       = COALESCE(EXCLUDED.dormindo, false),
        atualizado_em  = NOW();
END;
$$;


--
-- Name: fn_pet_taxa(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pet_taxa"() RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE((
    SELECT r.moedas_por_real
    FROM public.pet_economia_regras r
    JOIN public.perfis p ON p.id = auth.uid()
    WHERE r.cargo = p.perfil::text AND r.ativo
  ), 0)::NUMERIC;
$$;


--
-- Name: fn_pix_congela_campos_do_operador(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_congela_campos_do_operador"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.fn_user_has_any_role(
       ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN
    RETURN NEW;
  END IF;

  NEW.empresa_id        := OLD.empresa_id;
  NEW.operador_id       := OLD.operador_id;
  NEW.operador_nome     := OLD.operador_nome;
  NEW.setor_id          := OLD.setor_id;
  NEW.status            := OLD.status;
  NEW.pct_comissao      := OLD.pct_comissao;
  NEW.avaliado_por      := OLD.avaliado_por;
  NEW.avaliado_por_nome := OLD.avaliado_por_nome;
  NEW.avaliado_em       := OLD.avaliado_em;
  NEW.pago              := OLD.pago;
  NEW.pago_em           := OLD.pago_em;
  NEW.pago_por          := OLD.pago_por;
  NEW.pago_por_nome     := OLD.pago_por_nome;
  NEW.criado_em         := OLD.criado_em;
  RETURN NEW;
END;
$$;


--
-- Name: fn_pix_dias_uteis_apos(timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_dias_uteis_apos"("p_base" timestamp with time zone, "p_dias" integer) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_data   TIMESTAMPTZ := p_base;
  v_faltam INT := p_dias;
BEGIN
  WHILE v_faltam > 0 LOOP
    v_data := v_data + INTERVAL '1 day';
    IF EXTRACT(DOW FROM v_data) NOT IN (0, 6) THEN
      v_faltam := v_faltam - 1;
    END IF;
  END LOOP;
  RETURN v_data;
END;
$$;


--
-- Name: fn_pix_expurga_desaprovados("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_apagados INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','administrador','super_admin'])
  THEN
    RETURN 0;
  END IF;

  WITH apagados AS (
    DELETE FROM public.pix_automatico_acordos a
     WHERE a.empresa_id  = p_empresa_id
       AND a.status      = 'desaprovado'
       AND a.avaliado_em IS NOT NULL
       AND public.fn_pix_dias_uteis_apos(a.avaliado_em, 2) <= NOW()
    RETURNING a.id
  )
  SELECT COUNT(*)::INTEGER INTO v_apagados FROM apagados;

  RETURN COALESCE(v_apagados, 0);
END;
$$;


--
-- Name: FUNCTION "fn_pix_expurga_desaprovados"("p_empresa_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") IS 'Apaga os acordos Pix desaprovados há mais de 2 dias úteis e devolve a contagem. Chamada ao abrir a aba Pix Automático (não há job agendado).';


--
-- Name: fn_pix_impede_excluir_pago(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_impede_excluir_pago"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.pago THEN
    RAISE EXCEPTION
      'PIX_PAGO_NAO_EXCLUI: o NR % já teve a comissão paga. Desfaça o pagamento antes de excluir.',
      OLD.nr_cliente
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: FUNCTION "fn_pix_impede_excluir_pago"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_pix_impede_excluir_pago"() IS 'Recusa a exclusão de registro do Pix cuja comissão já foi paga. É o outro lado do bloqueio por "aprovado + pago": sem isto, apagar a linha abriria o NR de novo. Ver 20260811a.';


--
-- Name: fn_pix_lixeira_purgar("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_lixeira_purgar"("p_empresa_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_qtd INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  WITH removidos AS (
    DELETE FROM public.lixeira_pix_automatico
     WHERE empresa_id = p_empresa_id AND expira_em <= NOW()
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_qtd FROM removidos;

  RETURN v_qtd;
END;
$$;


--
-- Name: fn_pix_log("uuid", "uuid", "text", "text", "text", numeric, "uuid", "text", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_log"("p_empresa_id" "uuid", "p_acordo_id" "uuid", "p_nr" "text", "p_acao" "text", "p_descricao" "text", "p_valor" numeric, "p_operador_id" "uuid", "p_operador_nome" "text", "p_antes" "jsonb" DEFAULT NULL::"jsonb", "p_depois" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_autor UUID := auth.uid();
  v_nome  TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém')
    INTO v_nome FROM public.perfis p WHERE p.id = v_autor;

  INSERT INTO public.pix_automatico_log (
    empresa_id, acordo_id, nr_cliente, acao, descricao, valor,
    operador_id, operador_nome, autor_id, autor_nome, antes, depois
  ) VALUES (
    p_empresa_id, p_acordo_id, p_nr, p_acao, p_descricao, p_valor,
    p_operador_id, p_operador_nome, v_autor, COALESCE(v_nome, 'Sistema'),
    p_antes, p_depois
  );
END;
$$;


--
-- Name: fn_pix_log_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_log_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE v_restaurando BOOLEAN := COALESCE(current_setting('pix.restaurando', true), '') = 'on';
BEGIN
  PERFORM public.fn_pix_log(
    NEW.empresa_id, NEW.id, NEW.nr_cliente,
    CASE WHEN v_restaurando THEN 'restaurado' ELSE 'registrado' END,
    CASE WHEN v_restaurando
         THEN 'Restaurou da lixeira o NR ' || NEW.nr_cliente
              || ' (R$ ' || public.fn_pix_valor_br(NEW.valor) || ', ' || NEW.status || ')'
         ELSE 'Registrou o NR ' || NEW.nr_cliente
              || ' no valor de R$ ' || public.fn_pix_valor_br(NEW.valor)
    END,
    NEW.valor, NEW.operador_id, NEW.operador_nome,
    NULL, to_jsonb(NEW)
  );
  RETURN NEW;
END;
$_$;


--
-- Name: fn_pix_log_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_log_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente,
      CASE NEW.status
        WHEN 'aprovado'    THEN 'aprovado'
        WHEN 'desaprovado' THEN 'desaprovado'
        ELSE 'voltou_pendente'
      END,
      CASE NEW.status
        WHEN 'aprovado'    THEN 'Aprovou o NR ' || NEW.nr_cliente
                                || ' (comissão de ' || COALESCE(NEW.pct_comissao::TEXT, '—') || '%)'
        WHEN 'desaprovado' THEN 'Desaprovou o NR ' || NEW.nr_cliente
        ELSE 'Voltou o NR ' || NEW.nr_cliente || ' para pendente'
      END,
      NEW.valor, NEW.operador_id, NEW.operador_nome,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'pct_comissao', NEW.pct_comissao)
    );
  END IF;

  IF NEW.pago IS DISTINCT FROM OLD.pago THEN
    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente,
      CASE WHEN NEW.pago THEN 'pago' ELSE 'pagamento_desfeito' END,
      CASE WHEN NEW.pago
           THEN 'Marcou como paga a comissão do NR ' || NEW.nr_cliente
           ELSE 'Desfez o pagamento da comissão do NR ' || NEW.nr_cliente
      END,
      NEW.valor, NEW.operador_id, NEW.operador_nome,
      jsonb_build_object('pago', OLD.pago, 'pago_em', OLD.pago_em),
      jsonb_build_object('pago', NEW.pago, 'pago_em', NEW.pago_em, 'pago_por_nome', NEW.pago_por_nome)
    );
  END IF;

  IF NEW.nr_cliente IS DISTINCT FROM OLD.nr_cliente
     OR NEW.valor   IS DISTINCT FROM OLD.valor THEN
    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente, 'editado',
      'Editou o registro: '
        || CASE WHEN NEW.nr_cliente IS DISTINCT FROM OLD.nr_cliente
                THEN 'NR ' || OLD.nr_cliente || ' → ' || NEW.nr_cliente || '. ' ELSE '' END
        || CASE WHEN NEW.valor IS DISTINCT FROM OLD.valor
                THEN 'Valor R$ ' || public.fn_pix_valor_br(OLD.valor)
                     || ' → R$ ' || public.fn_pix_valor_br(NEW.valor) || '.' ELSE '' END,
      NEW.valor, NEW.operador_id, NEW.operador_nome,
      jsonb_build_object('nr_cliente', OLD.nr_cliente, 'valor', OLD.valor),
      jsonb_build_object('nr_cliente', NEW.nr_cliente, 'valor', NEW.valor)
    );
  END IF;

  RETURN NEW;
END;
$_$;


--
-- Name: fn_pix_meta_equipe_do_setor(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_meta_equipe_do_setor"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_setor UUID;
BEGIN
  IF NEW.equipe_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.setor_id INTO v_setor FROM public.equipes e WHERE e.id = NEW.equipe_id;

  IF v_setor IS NULL THEN
    -- Equipe sem setor: a linha assume o setor informado, sem contradição.
    RETURN NEW;
  END IF;

  IF v_setor IS DISTINCT FROM NEW.setor_id THEN
    RAISE EXCEPTION
      'Equipe % pertence ao setor %, não ao setor % informado na meta de Pix',
      NEW.equipe_id, v_setor, NEW.setor_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_pix_notifica_desaprovacao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_notifica_desaprovacao"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.status <> 'desaprovado' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
  VALUES (
    NEW.operador_id,
    NEW.empresa_id,
    'Acordo Pix desaprovado — NR ' || NEW.nr_cliente,
    COALESCE(NEW.avaliado_por_nome, 'O líder')
      || ' desaprovou o acordo Pix do NR ' || NEW.nr_cliente
      || '. Você tem 2 dias úteis para verificar; depois disso o registro é'
      || ' excluído automaticamente e o NR volta a ficar disponível.',
    false,
    '/acordos?tab=pix'
  );
  RETURN NEW;
END;
$$;


--
-- Name: fn_pix_nr_apos_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_nr_apos_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.pix_automatico_nr_registro r
  WHERE r.empresa_id     = OLD.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(OLD.nr_cliente)
    AND r.acordo_id      = OLD.id
    AND r.status IN ('pendente', 'recusado');
  RETURN OLD;
END;
$$;


--
-- Name: fn_pix_nr_apos_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_nr_apos_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.pix_automatico_nr_registro
    (empresa_id, nr_normalizado, nr_cliente, acordo_id, operador_id, operador_nome, status)
  VALUES
    (NEW.empresa_id, public.fn_pix_nr_normalizar(NEW.nr_cliente), NEW.nr_cliente,
     NEW.id, NEW.operador_id, NEW.operador_nome, 'pendente')
  ON CONFLICT (empresa_id, nr_normalizado) DO UPDATE SET
    nr_cliente        = EXCLUDED.nr_cliente,
    acordo_id         = EXCLUDED.acordo_id,
    operador_id       = EXCLUDED.operador_id,
    operador_nome     = EXCLUDED.operador_nome,
    status            = 'pendente',
    avaliado_por      = NULL,
    avaliado_por_nome = NULL,
    avaliado_em       = NULL,
    atualizado_em     = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: fn_pix_nr_apos_troca(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_nr_apos_troca"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF public.fn_pix_nr_normalizar(NEW.nr_cliente)
     = public.fn_pix_nr_normalizar(OLD.nr_cliente) THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.pix_automatico_nr_registro r
   WHERE r.empresa_id     = OLD.empresa_id
     AND r.nr_normalizado = public.fn_pix_nr_normalizar(OLD.nr_cliente)
     AND r.acordo_id      = OLD.id
     AND r.status         = 'pendente';

  INSERT INTO public.pix_automatico_nr_registro
    (empresa_id, nr_normalizado, nr_cliente, acordo_id, operador_id, operador_nome, status)
  VALUES
    (NEW.empresa_id, public.fn_pix_nr_normalizar(NEW.nr_cliente), NEW.nr_cliente,
     NEW.id, NEW.operador_id, NEW.operador_nome, 'pendente')
  ON CONFLICT (empresa_id, nr_normalizado) DO UPDATE SET
    nr_cliente        = EXCLUDED.nr_cliente,
    acordo_id         = EXCLUDED.acordo_id,
    operador_id       = EXCLUDED.operador_id,
    operador_nome     = EXCLUDED.operador_nome,
    status            = 'pendente',
    avaliado_por      = NULL,
    avaliado_por_nome = NULL,
    avaliado_em       = NULL,
    atualizado_em     = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: fn_pix_nr_apos_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_nr_apos_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.pix_automatico_nr_registro r SET
    status            = CASE NEW.status
                          WHEN 'aprovado'    THEN 'validado'
                          WHEN 'desaprovado' THEN 'recusado'
                          ELSE 'pendente'
                        END,
    avaliado_por      = NEW.avaliado_por,
    avaliado_por_nome = NEW.avaliado_por_nome,
    avaliado_em       = NEW.avaliado_em,
    atualizado_em     = NOW()
  WHERE r.empresa_id = NEW.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(NEW.nr_cliente)
    AND (r.acordo_id = NEW.id OR r.acordo_id IS NULL);
  RETURN NEW;
END;
$$;


--
-- Name: fn_pix_nr_bloqueia_duplicado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_nr_bloqueia_duplicado"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_status TEXT;
BEGIN
  SELECT a.status INTO v_status
    FROM public.pix_automatico_acordos a
   WHERE a.empresa_id = NEW.empresa_id
     AND a.id <> NEW.id
     AND public.fn_pix_nr_normalizar(a.nr_cliente)
         = public.fn_pix_nr_normalizar(NEW.nr_cliente)
   LIMIT 1;

  IF v_status IS NOT NULL THEN
    RAISE EXCEPTION
      'NR % já está registrado no Pix automático (status: %). Exclua o registro existente para liberá-lo.',
      NEW.nr_cliente, v_status
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION "fn_pix_nr_bloqueia_duplicado"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_pix_nr_bloqueia_duplicado"() IS 'v4 — um NR só pode ter UM registro vivo, em qualquer status. Excluir a linha libera o NR. O registro histórico deixou de ser portão na v3 (era ele que travava NR de acordo já excluído). Ver 20260811c.';


--
-- Name: fn_pix_nr_bloqueia_troca(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_nr_bloqueia_troca"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_status TEXT;
BEGIN
  IF public.fn_pix_nr_normalizar(NEW.nr_cliente)
     = public.fn_pix_nr_normalizar(OLD.nr_cliente) THEN
    RETURN NEW;
  END IF;

  SELECT r.status INTO v_status
    FROM public.pix_automatico_nr_registro r
   WHERE r.empresa_id     = NEW.empresa_id
     AND r.nr_normalizado = public.fn_pix_nr_normalizar(NEW.nr_cliente)
     AND (r.acordo_id IS DISTINCT FROM NEW.id);

  IF v_status IN ('pendente', 'validado') THEN
    RAISE EXCEPTION 'NR % já registrado no Pix automático (status: %)', NEW.nr_cliente, v_status
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_pix_nr_normalizar("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_nr_normalizar"("p_nr" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$ SELECT lower(trim(p_nr)) $$;


--
-- Name: fn_pix_registrar_exclusao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_registrar_exclusao"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_quem UUID := auth.uid();
  v_nome TEXT;
  v_foto TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém'), p.foto_url
    INTO v_nome, v_foto
    FROM public.perfis p
   WHERE p.id = v_quem;

  PERFORM public.fn_pix_log(
    OLD.empresa_id, OLD.id, OLD.nr_cliente, 'excluido',
    'Excluiu o NR ' || OLD.nr_cliente
      || ' (R$ ' || public.fn_pix_valor_br(OLD.valor) || ', ' || OLD.status || ')',
    OLD.valor, OLD.operador_id, OLD.operador_nome,
    to_jsonb(OLD), NULL
  );

  -- Ninguém precisa ser avisado do próprio clique.
  IF OLD.operador_id IS NOT NULL
     AND (v_quem IS NULL OR OLD.operador_id <> v_quem) THEN
    INSERT INTO public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, lida, rota,
       autor_id, autor_nome, autor_foto)
    VALUES (
      OLD.operador_id,
      OLD.empresa_id,
      'Pix automático — registro excluído',
      COALESCE(v_nome, 'Alguém') || ' excluiu o seu registro do NR '
        || OLD.nr_cliente || ' (R$ ' || public.fn_pix_valor_br(OLD.valor)
        || ', ' || OLD.status || ').',
      false,
      '/acordos?tab=pix',
      v_quem,
      v_nome,
      v_foto
    );
  END IF;

  RETURN OLD;
END;
$_$;


--
-- Name: FUNCTION "fn_pix_registrar_exclusao"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_pix_registrar_exclusao"() IS 'Grava a exclusão no log da aba e avisa o operador dono quando quem apagou foi outra pessoa. Deixou de escrever em logs_sistema na 20260811c — aquela tabela só administrador lê.';


--
-- Name: fn_pix_restaurar_lixeira("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_item  public.lixeira_pix_automatico%ROWTYPE;
  v_dados JSONB;
  v_novo  UUID;
BEGIN
  SELECT * INTO v_item FROM public.lixeira_pix_automatico WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LIXEIRA_ITEM_NAO_ENCONTRADO';
  END IF;

  -- SECURITY DEFINER ignora RLS: a autorização é conferida aqui, à mão.
  IF NOT public.fn_can_access_empresa(v_item.empresa_id)
     OR NOT public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO_RESTAURAR';
  END IF;

  v_dados := v_item.dados_completos;

  -- Lida pelo trigger de log. `SET LOCAL` morre no fim da transação.
  PERFORM set_config('pix.restaurando', 'on', true);

  INSERT INTO public.pix_automatico_acordos (
    id, empresa_id, operador_id, operador_nome, setor_id,
    nr_cliente, valor, status, pct_comissao,
    avaliado_por, avaliado_por_nome, avaliado_em,
    pago, pago_em, pago_por, pago_por_nome, criado_em
  ) VALUES (
    v_item.acordo_id,
    v_item.empresa_id,
    (v_dados->>'operador_id')::UUID,
    v_dados->>'operador_nome',
    NULLIF(v_dados->>'setor_id', '')::UUID,
    v_dados->>'nr_cliente',
    (v_dados->>'valor')::NUMERIC,
    v_dados->>'status',
    NULLIF(v_dados->>'pct_comissao', '')::NUMERIC,
    NULLIF(v_dados->>'avaliado_por', '')::UUID,
    v_dados->>'avaliado_por_nome',
    NULLIF(v_dados->>'avaliado_em', '')::TIMESTAMPTZ,
    COALESCE((v_dados->>'pago')::BOOLEAN, FALSE),
    NULLIF(v_dados->>'pago_em', '')::TIMESTAMPTZ,
    NULLIF(v_dados->>'pago_por', '')::UUID,
    v_dados->>'pago_por_nome',
    COALESCE(NULLIF(v_dados->>'criado_em', '')::TIMESTAMPTZ, NOW())
  )
  RETURNING id INTO v_novo;

  PERFORM set_config('pix.restaurando', 'off', true);

  -- O AFTER INSERT acabou de gravar o registro de NR como 'pendente' — é o que
  -- ele faz para linha nova. Aqui a linha não é nova: ela volta com o status
  -- que tinha, e o registro precisa dizer o mesmo.
  UPDATE public.pix_automatico_nr_registro r SET
    status            = CASE v_dados->>'status'
                          WHEN 'aprovado'    THEN 'validado'
                          WHEN 'desaprovado' THEN 'recusado'
                          ELSE 'pendente'
                        END,
    avaliado_por      = NULLIF(v_dados->>'avaliado_por', '')::UUID,
    avaliado_por_nome = v_dados->>'avaliado_por_nome',
    avaliado_em       = NULLIF(v_dados->>'avaliado_em', '')::TIMESTAMPTZ,
    atualizado_em     = NOW()
  WHERE r.empresa_id     = v_item.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(v_item.nr_cliente)
    AND r.acordo_id      = v_novo;

  DELETE FROM public.lixeira_pix_automatico WHERE id = p_item_id;

  RETURN v_novo;
END;
$$;


--
-- Name: FUNCTION "fn_pix_restaurar_lixeira"("p_item_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") IS 'Restaura registro do Pix automático da lixeira: reinsere com o status e o PAGAMENTO originais, realinha o registro de NR e remove da lixeira, em uma transação. Só líder+. Ver 20260810c e 20260811a.';


--
-- Name: fn_pix_valida_pagamento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_valida_pagamento"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.pago AND NOT COALESCE(OLD.pago, FALSE) THEN
    IF NEW.status <> 'aprovado' THEN
      RAISE EXCEPTION
        'PIX_PAGA_SO_APROVADO: o NR % está como "%" — só acordo aprovado pode ser pago.',
        NEW.nr_cliente, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Segundo pagamento sobre o que já está pago. `pago` é booleano, então o
  -- clique repetido não somaria nada; o que ele faz é reescrever `pago_em` e
  -- `pago_por`, apagando quem de fato pagou e quando. É esse rastro que se
  -- protege aqui.
  IF NEW.pago AND COALESCE(OLD.pago, FALSE)
     AND (NEW.pago_em IS DISTINCT FROM OLD.pago_em
          OR NEW.pago_por IS DISTINCT FROM OLD.pago_por) THEN
    RAISE EXCEPTION
      'PIX_JA_PAGO: a comissão do NR % já foi paga. Use "Desfazer" antes de pagar de novo.',
      NEW.nr_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_pix_valor_br(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pix_valor_br"("p_valor" numeric) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$ SELECT replace(to_char(COALESCE(p_valor, 0), 'FM9999999990.00'), '.', ',') $$;


--
-- Name: fn_pode_editar_foto_setor("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pode_editar_foto_setor"("p_setor_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    p_setor_id IS NOT NULL
    AND (
      public.fn_user_is_super_admin()
      OR (
        -- O setor tem de ser da empresa de quem está editando. Sem isto, um
        -- líder da BookPlay poderia trocar a foto de um setor da PaguePlay:
        -- as duas empresas dividem o mesmo banco.
        EXISTS (
          SELECT 1 FROM public.setores s
          WHERE s.id = p_setor_id
            AND s.empresa_id = public.fn_user_empresa_id()
        )
        AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria','gerencia'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite'])
            AND public.fn_user_setor_id() = p_setor_id
          )
        )
      )
    );
$$;


--
-- Name: FUNCTION "fn_pode_editar_foto_setor"("p_setor_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_pode_editar_foto_setor"("p_setor_id" "uuid") IS 'Regra de escrita das fotos do setor. Diretoria/gerência/admin: qualquer setor da empresa. Líder/elite: só o próprio.';


--
-- Name: fn_pode_gerir_acordo("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pode_gerir_acordo"("p_setor_id" "uuid", "p_operador_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    p_operador_id = auth.uid()                                   -- dono do acordo
    OR public.fn_user_is_super_admin()
    OR public.fn_user_has_any_role(ARRAY['administrador'])       -- admin: tudo (ambos)
    OR (
      public.fn_user_empresa_is_pagueplay()
      AND public.fn_user_has_any_role(ARRAY['lider'])            -- PP: líder vê tudo (legado)
    )
    OR (
      NOT public.fn_user_empresa_is_pagueplay()                  -- BookPlay / não-PP (fail-closed)
      AND (
        public.fn_user_has_any_role(ARRAY['diretoria'])         -- diretoria: tudo
        OR (
          public.fn_user_has_any_role(ARRAY['lider','elite','gerencia'])
          AND (
            p_setor_id = public.fn_user_setor_id()
            OR (p_setor_id IS NULL AND public.fn_operador_setor_id(p_operador_id) = public.fn_user_setor_id())
          )
        )
      )
    );
$$;


--
-- Name: fn_profissional_registrar_uf("uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_profissional_registrar_uf"("p_empresa_id" "uuid", "p_codigo" "text", "p_estado_uf" "text", "p_nome" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_codigo TEXT := btrim(COALESCE(p_codigo, ''));
  v_uf     TEXT := upper(btrim(COALESCE(p_estado_uf, '')));
  v_nome   TEXT := btrim(COALESCE(p_nome, ''));
  v_id     UUID;
BEGIN
  -- Mesma checagem das policies da casa: ou é super admin, ou é a própria
  -- empresa. Sem isto o SECURITY DEFINER viraria uma porta para escrever em
  -- qualquer tenant.
  IF NOT (
    public.fn_user_is_super_admin()
    OR p_empresa_id = public.fn_user_empresa_id()
  ) THEN
    RAISE EXCEPTION 'sem permissão para gravar profissionais desta empresa'
      USING ERRCODE = '42501';
  END IF;

  IF v_codigo = '' THEN
    RAISE EXCEPTION 'código do cliente é obrigatório' USING ERRCODE = '22023';
  END IF;

  -- A coluna é char(2); qualquer coisa fora disso é entrada errada.
  IF length(v_uf) <> 2 THEN
    RAISE EXCEPTION 'UF inválida: %', p_estado_uf USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_id
    FROM public.profissionais
   WHERE empresa_id = p_empresa_id
     AND codigo     = v_codigo
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Só preenche buraco. Cadastro que já tem UF fica como está — o mailing é
    -- fonte melhor que um palpite digitado no meio da tabulação.
    UPDATE public.profissionais
       SET estado_uf     = v_uf,
           atualizado_em = NOW()
     WHERE id = v_id
       AND (estado_uf IS NULL OR btrim(estado_uf) = '');
    RETURN v_id;
  END IF;

  BEGIN
    INSERT INTO public.profissionais (empresa_id, codigo, nome, estado_uf)
    VALUES (p_empresa_id, v_codigo, NULLIF(v_nome, ''), v_uf)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Dois operadores tabulando o mesmo código ao mesmo tempo: o outro ganhou.
    SELECT id INTO v_id
      FROM public.profissionais
     WHERE empresa_id = p_empresa_id
       AND codigo     = v_codigo
     LIMIT 1;
  END;

  RETURN v_id;
END;
$$;


--
-- Name: FUNCTION "fn_profissional_registrar_uf"("p_empresa_id" "uuid", "p_codigo" "text", "p_estado_uf" "text", "p_nome" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_profissional_registrar_uf"("p_empresa_id" "uuid", "p_codigo" "text", "p_estado_uf" "text", "p_nome" "text") IS 'Cria o cadastro do cliente ou preenche a UF que faltava, a partir da tabulação do analítico. Nunca sobrescreve UF, nome ou telefone existentes.';


--
-- Name: fn_relatorio_reabrir_setor("uuid", "uuid", integer, integer, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_relatorio_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text", "p_origem" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "erro" "text", "dias_removidos" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_inicio   DATE := make_date(p_ano, p_mes, 1);
  v_fim      DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_snapshot JSONB;
  v_count    INTEGER;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT, 0; RETURN;
  END IF;
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RETURN QUERY SELECT false, 'motivo_obrigatorio'::TEXT, 0; RETURN;
  END IF;

  SELECT jsonb_agg(to_jsonb(t)) INTO v_snapshot
  FROM (
    SELECT origem, dia_referencia, valor_validado, qtd_registros_validados
    FROM public.relatorio_validacoes_dia
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
      AND dia_referencia BETWEEN v_inicio AND v_fim
      AND (p_origem IS NULL OR origem = p_origem)
  ) t;

  DELETE FROM public.relatorio_validacoes_dia
  WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
    AND dia_referencia BETWEEN v_inicio AND v_fim
    AND (p_origem IS NULL OR origem = p_origem);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'RELATORIO_REABERTO', 'relatorio_validacoes_dia', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano, 'origem', COALESCE(p_origem, 'ambas'),
                              'motivo', p_motivo, 'watermarks_removidos', COALESCE(v_snapshot, '[]'::jsonb)));

  RETURN QUERY SELECT true, NULL::TEXT, v_count;
END;
$$;


--
-- Name: fn_relatorio_status_validacao("uuid", "uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_relatorio_status_validacao"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) RETURNS TABLE("origem" "text", "dias_com_dado" integer, "dias_validados" integer, "valor_atual" numeric, "valor_validado" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inicio DATE := make_date(p_ano, p_mes, 1);
  v_fim    DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH atual_analitico AS (
    SELECT ar.data_pagamento AS dia, SUM(ar.valor_recebido) AS total
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis p_op  ON p_op.id  = ar.operador_id
    LEFT JOIN public.perfis p_imp ON p_imp.id = ar.importado_por_id
    WHERE ar.empresa_id = p_empresa_id
      AND COALESCE(ar.setor_id, p_op.setor_id, p_imp.setor_id) = p_setor_id
      AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    GROUP BY ar.data_pagamento
  ),
  valid_analitico AS (
    SELECT rvd.dia_referencia AS dia, rvd.valor_validado AS total
    FROM public.relatorio_validacoes_dia rvd
    WHERE rvd.empresa_id = p_empresa_id AND rvd.setor_id = p_setor_id AND rvd.origem = 'analitico'
      AND rvd.dia_referencia BETWEEN v_inicio AND v_fim
  ),
  atual_diario AS (
    SELECT dia_referencia AS dia, SUM(valor_recebido) AS total
    FROM public.diario_recebimentos
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
      AND dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY dia_referencia
  ),
  valid_diario AS (
    SELECT rvd.dia_referencia AS dia, rvd.valor_validado AS total
    FROM public.relatorio_validacoes_dia rvd
    WHERE rvd.empresa_id = p_empresa_id AND rvd.setor_id = p_setor_id AND rvd.origem = 'diario'
      AND rvd.dia_referencia BETWEEN v_inicio AND v_fim
  )
  SELECT 'analitico'::TEXT,
         (SELECT COUNT(*) FROM atual_analitico)::INTEGER,
         (SELECT COUNT(*) FROM atual_analitico a JOIN valid_analitico v ON v.dia = a.dia AND v.total = a.total)::INTEGER,
         (SELECT COALESCE(SUM(total), 0) FROM atual_analitico),
         (SELECT COALESCE(SUM(total), 0) FROM valid_analitico)
  UNION ALL
  SELECT 'diario'::TEXT,
         (SELECT COUNT(*) FROM atual_diario)::INTEGER,
         (SELECT COUNT(*) FROM atual_diario a JOIN valid_diario v ON v.dia = a.dia AND v.total = a.total)::INTEGER,
         (SELECT COALESCE(SUM(total), 0) FROM atual_diario),
         (SELECT COALESCE(SUM(total), 0) FROM valid_diario);
END;
$$;


--
-- Name: fn_relatorio_validar_setor("uuid", "uuid", integer, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "erro" "text", "dias_validados" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_inicio  DATE := make_date(p_ano, p_mes, 1);
  v_fim     DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_count_a INTEGER := 0;
  v_count_d INTEGER := 0;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
     OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RETURN QUERY SELECT false, 'sem_permissao'::TEXT, 0; RETURN;
  END IF;
  IF p_origem IS NOT NULL AND p_origem NOT IN ('analitico','diario') THEN
    RETURN QUERY SELECT false, 'origem_invalida'::TEXT, 0; RETURN;
  END IF;

  IF p_origem IS NULL OR p_origem = 'analitico' THEN
    INSERT INTO public.relatorio_validacoes_dia
      (empresa_id, setor_id, origem, dia_referencia, valor_validado, qtd_registros_validados, validado_por, validado_em)
    SELECT p_empresa_id, p_setor_id, 'analitico', ar.data_pagamento,
           SUM(ar.valor_recebido), COUNT(*), v_uid, NOW()
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis p_op  ON p_op.id  = ar.operador_id
    LEFT JOIN public.perfis p_imp ON p_imp.id = ar.importado_por_id
    WHERE ar.empresa_id = p_empresa_id
      AND COALESCE(ar.setor_id, p_op.setor_id, p_imp.setor_id) = p_setor_id
      AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    GROUP BY ar.data_pagamento
    ON CONFLICT (empresa_id, setor_id, origem, dia_referencia) DO UPDATE
      SET valor_validado           = EXCLUDED.valor_validado,
          qtd_registros_validados  = EXCLUDED.qtd_registros_validados,
          validado_por             = EXCLUDED.validado_por,
          validado_em              = NOW();
    GET DIAGNOSTICS v_count_a = ROW_COUNT;
  END IF;

  IF p_origem IS NULL OR p_origem = 'diario' THEN
    INSERT INTO public.relatorio_validacoes_dia
      (empresa_id, setor_id, origem, dia_referencia, valor_validado, qtd_registros_validados, validado_por, validado_em)
    SELECT p_empresa_id, p_setor_id, 'diario', d.dia_referencia,
           SUM(d.valor_recebido), COUNT(*), v_uid, NOW()
    FROM public.diario_recebimentos d
    WHERE d.empresa_id = p_empresa_id AND d.setor_id = p_setor_id
      AND d.dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY d.dia_referencia
    ON CONFLICT (empresa_id, setor_id, origem, dia_referencia) DO UPDATE
      SET valor_validado           = EXCLUDED.valor_validado,
          qtd_registros_validados  = EXCLUDED.qtd_registros_validados,
          validado_por             = EXCLUDED.validado_por,
          validado_em              = NOW();
    GET DIAGNOSTICS v_count_d = ROW_COUNT;
  END IF;

  INSERT INTO public.logs_sistema (usuario_id, empresa_id, acao, tabela, registro_id, detalhes)
  VALUES (v_uid, p_empresa_id, 'RELATORIO_VALIDADO', 'relatorio_validacoes_dia', p_setor_id::TEXT,
          jsonb_build_object('setor_id', p_setor_id, 'mes', p_mes, 'ano', p_ano, 'origem', COALESCE(p_origem, 'ambas')));

  RETURN QUERY SELECT true, NULL::TEXT, v_count_a + v_count_d;
END;
$$;


--
-- Name: fn_set_pago_em(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_set_pago_em"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'pago' AND OLD.status <> 'pago' THEN
      NEW.pago_em := NOW();
    END IF;
    IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
      NEW.pago_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_set_setor_foto("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_set_setor_foto"("p_setor_id" "uuid", "p_foto_url" "text", "p_campo" "text" DEFAULT 'placar'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_linhas INT;
BEGIN
  IF p_campo NOT IN ('placar', 'receptivo') THEN
    RAISE EXCEPTION 'Campo de foto inválido: %', p_campo
      USING HINT = 'Use ''placar'' ou ''receptivo''.';
  END IF;

  IF NOT public.fn_pode_editar_foto_setor(p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a foto deste setor.'
      USING ERRCODE = '42501';
  END IF;

  IF p_campo = 'placar' THEN
    UPDATE public.setores SET foto_url = p_foto_url WHERE id = p_setor_id;
  ELSE
    UPDATE public.setores SET foto_receptivo_url = p_foto_url WHERE id = p_setor_id;
  END IF;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$$;


--
-- Name: FUNCTION "fn_set_setor_foto"("p_setor_id" "uuid", "p_foto_url" "text", "p_campo" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_set_setor_foto"("p_setor_id" "uuid", "p_foto_url" "text", "p_campo" "text") IS 'Grava a foto do setor (placar ou receptivo). SECURITY DEFINER porque a policy setores_admin só deixa administrador escrever, e o card é de líder+. Levanta 42501 quando a regra recusa, em vez de gravar zero linhas em silêncio.';


--
-- Name: fn_setor_acordo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_setor_acordo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.setor_id IS NULL THEN
    SELECT setor_id INTO NEW.setor_id FROM public.perfis WHERE id = NEW.operador_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_setores_do_operador("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_setores_do_operador"("p_operador" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.setor_id
    FROM public.perfis p
   WHERE p.id = p_operador AND p.setor_id IS NOT NULL
  UNION
  SELECT e.setor_id
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
   WHERE c.operador_id = p_operador AND e.setor_id IS NOT NULL;
$$;


--
-- Name: FUNCTION "fn_setores_do_operador"("p_operador" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_setores_do_operador"("p_operador" "uuid") IS 'Setores em que o operador aparece: o do perfil mais os das equipes em que foi clonado.';


--
-- Name: fn_sincronizar_cartoes_pagos("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_sincronizar_cartoes_pagos"("p_empresa_id" "uuid", "p_mes" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_primeiro DATE := (p_mes || '-01')::DATE;
  v_fim      DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_count    INTEGER := 0;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN 0; END IF;

  -- 1. Atualiza acordos onde a linha analítica de cartão bate com o mesmo operador
  WITH matches AS (
    SELECT DISTINCT ON (a.id)
      a.id          AS acordo_id,
      ar.valor_recebido,
      ar.data_pagamento,
      ar.id         AS linha_id
    FROM public.analitico_recebimentos ar
    JOIN public.acordos a
      ON  a.empresa_id   = p_empresa_id
      AND a.instituicao  = ar.codigo
      AND a.operador_id  = ar.operador_id
      AND a.tipo_vinculo = 'direto'
      AND a.status      <> 'pago'
    WHERE ar.empresa_id      = p_empresa_id
      AND ar.forma_pagamento = 'cartao'
      AND ar.operador_id     IS NOT NULL
      AND ar.data_pagamento  BETWEEN v_primeiro AND v_fim
    ORDER BY a.id, ar.data_pagamento DESC
  )
  UPDATE public.acordos SET
    status     = 'pago',
    valor      = m.valor_recebido,
    vencimento = m.data_pagamento
  FROM matches m
  WHERE public.acordos.id = m.acordo_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 2. Marca as linhas analíticas correspondentes como tabuladas
  UPDATE public.analitico_recebimentos ar
  SET   status_tabulacao = 'tabulado',
        acordo_id        = a.id
  FROM  public.acordos a
  WHERE ar.empresa_id       = p_empresa_id
    AND ar.forma_pagamento  = 'cartao'
    AND ar.operador_id      IS NOT NULL
    AND ar.data_pagamento   BETWEEN v_primeiro AND v_fim
    AND a.empresa_id        = p_empresa_id
    AND a.instituicao       = ar.codigo
    AND a.operador_id       = ar.operador_id
    AND a.tipo_vinculo      = 'direto'
    AND a.status            = 'pago'
    AND ar.status_tabulacao <> 'tabulado';

  RETURN v_count;
END;
$$;


--
-- Name: fn_situacao_operador("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_situacao_operador"("p_operador_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_empresa   UUID;
  v_situacao  TEXT;
BEGIN
  IF p_operador_id IS NULL THEN RETURN NULL; END IF;

  SELECT empresa_id, COALESCE(situacao, 'ativo')
    INTO v_empresa, v_situacao
    FROM public.perfis
   WHERE id = p_operador_id;

  IF v_empresa IS NULL THEN RETURN NULL; END IF;
  IF NOT public.fn_can_access_empresa(v_empresa) THEN RETURN NULL; END IF;

  RETURN v_situacao;
END;
$$;


--
-- Name: fn_solicitacao_recusa_cpf(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_solicitacao_recusa_cpf"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- O código do cliente é o campo que mais recebe CPF por engano: os dois são
  -- "aquele número do cliente" na cabeça de quem digita depressa.
  IF public.fn_eh_cpf(NEW.codigo_cliente)
     AND (TG_OP = 'INSERT' OR NEW.codigo_cliente IS DISTINCT FROM OLD.codigo_cliente)
  THEN
    RAISE EXCEPTION
      'O codigo do cliente nao pode ser um CPF. Use o codigo do cliente no ERP.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Na mensagem o CPF vem no meio do texto ("cliente Joao, CPF 529...").
  --
  -- A condição de UPDATE é deliberada: linha ANTIGA que já tem CPF pode ser
  -- atualizada por outro motivo (status, responsável) sem tropeçar aqui. Só o
  -- conteúdo NOVO é recusado. Quem limpa o passivo é o expurgo da 20260803d.
  IF public.fn_texto_tem_cpf(NEW.mensagem)
     AND (TG_OP = 'INSERT' OR NEW.mensagem IS DISTINCT FROM OLD.mensagem)
  THEN
    RAISE EXCEPTION
      'A mensagem contem um CPF. Use o codigo do cliente - CPF nao pode ser gravado no sistema.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_super_admin_permissoes_completas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_super_admin_permissoes_completas"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  WITH canonicas(k) AS (
    -- Espelha `PERMISSOES` de src/pages/AdminCargos.tsx.
    SELECT unnest(ARRAY[
      'ver_acordos_proprios', 'ver_acordos_gerais', 'criar_acordos',
      'editar_acordos', 'excluir_acordos', 'excluir_em_lote',
      'importar_excel', 'importar_analitico', 'importar_diario',
      'ver_painel_lider', 'ver_analiticos_setor', 'ver_analiticos_global',
      'ver_todos_setores', 'filtrar_por_setor', 'filtrar_por_equipe',
      'filtrar_por_usuario', 'ver_usuarios', 'editar_usuarios',
      'ver_equipes', 'editar_equipes', 'ver_metas', 'gerenciar_metas',
      'ver_operadores', 'ver_lixeira', 'ver_logs', 'ver_configuracoes'
    ])
  ),
  existentes(k) AS (
    SELECT DISTINCT j.k
      FROM public.cargos_permissoes cp,
           jsonb_object_keys(cp.permissoes) AS j(k)
  ),
  todas(k) AS (
    SELECT k FROM canonicas
    UNION
    SELECT k FROM existentes
  )
  SELECT COALESCE(jsonb_object_agg(k, true), '{}'::jsonb) FROM todas;
$$;


--
-- Name: FUNCTION "fn_super_admin_permissoes_completas"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_super_admin_permissoes_completas"() IS 'Todas as chaves de permissão conhecidas, com valor true. União da lista canônica da tela de Cargos com as chaves já presentes na tabela, para não ficar desatualizada quando uma permissão nova aparecer. Ver 20260812b.';


--
-- Name: fn_sync_nr_registros(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_sync_nr_registros"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_empresa_id  UUID;
  v_operador_id UUID;
  v_acordo_id   UUID;
  v_grupo_id    UUID;
  v_nome_op     TEXT;
  -- campo/valor que valem como chave AGORA e ANTES
  v_campo       TEXT;
  v_valor       TEXT;
  v_campo_old   TEXT;
  v_valor_old   TEXT;
  v_era_titular BOOLEAN;
  v_e_titular   BOOLEAN;
BEGIN

  -- ── DELETE: liberar NR ────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.nr_registros WHERE acordo_id = OLD.id;
    RETURN OLD;
  END IF;

  v_empresa_id  := NEW.empresa_id;
  v_operador_id := NEW.operador_id;
  v_acordo_id   := NEW.id;
  v_grupo_id    := NEW.acordo_grupo_id;

  -- A chave é UMA só por acordo. Na BookPlay `instituicao` é categoria
  -- (BOOKPLAY, MUNDIAL EDITORA…) e registrá-la travava a categoria inteira
  -- para o primeiro operador que salvasse.
  v_campo := public.fn_nr_campo_chave(NEW.nr_cliente, NEW.instituicao);
  v_valor := CASE v_campo
               WHEN 'nr_cliente'  THEN TRIM(NEW.nr_cliente)
               WHEN 'instituicao' THEN TRIM(NEW.instituicao)
             END;

  -- Titular do NR é só o DIRETO ativo: EXTRA não registra (o NR pertence ao
  -- DIRETO do par) e nao_pago libera.
  v_e_titular := COALESCE(NEW.tipo_vinculo, 'direto') <> 'extra'
             AND NEW.status <> 'nao_pago'
             AND v_empresa_id  IS NOT NULL
             AND v_operador_id IS NOT NULL
             AND v_campo       IS NOT NULL;

  -- ── INSERT ────────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NOT v_e_titular THEN RETURN NEW; END IF;

    SELECT COALESCE(nome, email, 'Operador') INTO v_nome_op
      FROM public.perfis WHERE id = v_operador_id LIMIT 1;

    PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_valor, v_campo, v_operador_id, v_grupo_id);
    INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
    VALUES (v_empresa_id, v_valor, v_campo, v_operador_id, v_nome_op, v_acordo_id, NOW())
    ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
      operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
      acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();

    RETURN NEW;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN

    v_campo_old := public.fn_nr_campo_chave(OLD.nr_cliente, OLD.instituicao);
    v_valor_old := CASE v_campo_old
                     WHEN 'nr_cliente'  THEN TRIM(OLD.nr_cliente)
                     WHEN 'instituicao' THEN TRIM(OLD.instituicao)
                   END;

    v_era_titular := COALESCE(OLD.tipo_vinculo, 'direto') <> 'extra'
                 AND OLD.status <> 'nao_pago'
                 AND v_campo_old IS NOT NULL;

    -- Deixou de ser titular (virou EXTRA, virou nao_pago, ou perdeu a chave)
    -- ou a chave/dono mudou → solta o registro antigo antes de qualquer coisa.
    --
    -- O filtro por acordo_id é o que impede este acordo de apagar o registro
    -- de OUTRO acordo que legitimamente detenha o mesmo valor.
    IF v_era_titular AND (
         NOT v_e_titular
         OR v_campo IS DISTINCT FROM v_campo_old
         OR v_valor IS DISTINCT FROM v_valor_old
         OR v_operador_id IS DISTINCT FROM OLD.operador_id
       ) THEN
      DELETE FROM public.nr_registros
       WHERE acordo_id  = v_acordo_id
         AND empresa_id = COALESCE(OLD.empresa_id, v_empresa_id)
         AND nr_value   = v_valor_old
         AND campo      = v_campo_old;
    END IF;

    IF NOT v_e_titular THEN RETURN NEW; END IF;

    -- Já era titular do mesmo valor, mesmo campo e mesmo dono: nada mudou do
    -- ponto de vista do NR. Sair aqui evita cobrar `fn_nr_exigir_livre` de
    -- quem só editou valor, vencimento ou observação.
    IF v_era_titular
       AND v_campo = v_campo_old
       AND v_valor = v_valor_old
       AND v_operador_id IS NOT DISTINCT FROM OLD.operador_id THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(nome, email, 'Operador') INTO v_nome_op
      FROM public.perfis WHERE id = v_operador_id LIMIT 1;

    -- Passou a ser titular agora: EXTRA→DIRETO, nao_pago→ativo, chave nova,
    -- ou acordo transferido para outro operador.
    PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_valor, v_campo, v_operador_id, v_grupo_id);
    INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
    VALUES (v_empresa_id, v_valor, v_campo, v_operador_id, v_nome_op, v_acordo_id, NOW())
    ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
      operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
      acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION "fn_sync_nr_registros"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_sync_nr_registros"() IS 'v5 — UMA chave por acordo (fn_nr_campo_chave): nr_cliente na BookPlay, instituicao só na PaguePlay. RECUSA (NR_JA_REGISTRADO) quando o NR já é de outro operador, exceto parcela do mesmo grupo. UPDATE trata tipo_vinculo nos dois sentidos, troca de dono e mudança de chave. Ver 20260810b.';


--
-- Name: fn_sync_par_vinculo("uuid", numeric, "date", "text", "text", "text", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_sync_par_vinculo"("p_acordo_id" "uuid", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_whatsapp" "text" DEFAULT NULL::"text", "p_parcelas" integer DEFAULT 1, "p_status" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: FUNCTION "fn_sync_par_vinculo"("p_acordo_id" "uuid", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_whatsapp" "text", "p_parcelas" integer, "p_status" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_sync_par_vinculo"("p_acordo_id" "uuid", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_whatsapp" "text", "p_parcelas" integer, "p_status" "text") IS 'Sincroniza o par DIRETO/EXTRA. Acha o par pelo vínculo declarado nos dois lados, nunca por instituição solta — na BookPlay isso casava acordo alheio. Ver 20260809d.';


--
-- Name: fn_texto_censurado_cpf(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_texto_censurado_cpf"() RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$ SELECT '[mensagem apagada automaticamente: continha CPF]'::TEXT $$;


--
-- Name: fn_texto_tem_cpf("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_texto_tem_cpf"("p_texto" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  candidato TEXT;
BEGIN
  IF p_texto IS NULL OR p_texto = '' THEN RETURN FALSE; END IF;

  -- Varredura 1 — com separador: 529.982.247-25, 529 982 247 25. O formato
  -- 3-3-3-2 é específico o bastante para não colar em número vizinho.
  FOR candidato IN
    SELECT (regexp_matches(
              p_texto,
              '[0-9]{3}[.[:space:]][0-9]{3}[.[:space:]][0-9]{3}[-[:space:]][0-9]{2}',
              'g'
            ))[1]
  LOOP
    IF public.fn_eh_cpf(candidato) THEN RETURN TRUE; END IF;
  END LOOP;

  -- Varredura 2 — corrida de dígitos. `[0-9]+` é guloso e devolve a sequência
  -- INTEIRA: um CNPJ de 14 dígitos chega como 14 e `fn_eh_cpf` recusa por
  -- tamanho, e um CPF embutido num número maior nunca é recortado. É a
  -- fronteira de graça, sem depender de lookbehind — que nem toda versão do
  -- Postgres aceita e que era como esta função estava escrita.
  FOR candidato IN
    SELECT (regexp_matches(p_texto, '[0-9]+', 'g'))[1]
  LOOP
    IF public.fn_eh_cpf(candidato) THEN RETURN TRUE; END IF;
  END LOOP;

  RETURN FALSE;
END;
$$;


--
-- Name: FUNCTION "fn_texto_tem_cpf"("p_texto" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_texto_tem_cpf"("p_texto" "text") IS 'true quando um CPF válido aparece em qualquer posição do texto. Espelha contemCpf() de src/lib/cpf.ts — os dois precisam mudar juntos.';


--
-- Name: fn_transferencia_desfazer("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_transferencia_desfazer"("p_transferencia_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_t            public.perfis_transferencias%ROWTYPE;
  v_clone        JSONB;
  v_clones_volta INT := 0;
  v_usuario      TEXT;
  v_colide       BOOLEAN;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'sem permissão: desfazer transferência é de administrador';
  END IF;

  SELECT * INTO v_t FROM public.perfis_transferencias WHERE id = p_transferencia_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transferência % não encontrada', p_transferencia_id;
  END IF;
  IF v_t.desfeita_em IS NOT NULL THEN
    RAISE EXCEPTION 'esta transferência já foi desfeita em %', v_t.desfeita_em;
  END IF;

  -- Desfazer uma transferência de EMPRESA é atravessar a fronteira de volta:
  -- exige o mesmo cargo que a ida.
  IF v_t.tipo = 'empresa' AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'sem permissão: desfazer transferência de empresa é de super_admin';
  END IF;

  IF v_t.tipo = 'empresa' THEN
    SELECT usuario INTO v_usuario FROM public.perfis WHERE id = v_t.perfil_id;
    IF v_usuario IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.perfis
         WHERE usuario = v_usuario AND empresa_id = v_t.empresa_id
           AND id <> v_t.perfil_id
      ) INTO v_colide;
      IF v_colide THEN
        RAISE EXCEPTION
          'não dá para desfazer: o login "%" já está em uso na empresa de origem. '
          'Renomeie um dos dois antes.', v_usuario;
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.transferencia_em_curso', 'on', true);

  UPDATE public.perfis
     SET empresa_id = v_t.empresa_id,
         setor_id   = v_t.origem_setor_id,
         equipe_id  = v_t.origem_equipe_id
   WHERE id = v_t.perfil_id;

  PERFORM set_config('app.transferencia_em_curso', 'off', true);

  FOR v_clone IN SELECT * FROM jsonb_array_elements(v_t.clones_removidos)
  LOOP
    INSERT INTO public.equipe_operadores_clones
      (empresa_id, equipe_id, operador_id, conta_recebimento, criado_por)
    VALUES (
      v_t.empresa_id,
      (v_clone->>'equipe_id')::UUID,
      v_t.perfil_id,
      COALESCE((v_clone->>'conta_recebimento')::BOOLEAN, TRUE),
      auth.uid()
    )
    ON CONFLICT DO NOTHING;
    v_clones_volta := v_clones_volta + 1;
  END LOOP;

  UPDATE public.perfis_transferencias
     SET desfeita_em = NOW(), desfeita_por = auth.uid()
   WHERE id = p_transferencia_id;

  RETURN jsonb_build_object(
    'ok',                  TRUE,
    'perfil_id',           v_t.perfil_id,
    'voltou_para_setor',   v_t.origem_setor_id,
    'voltou_para_empresa', v_t.empresa_id,
    'clones_restaurados',  v_clones_volta,
    'acordos_nao_restaurados', v_t.acordos_apagados,
    'relatorio',           v_t.relatorio_arquivo
  );
END $$;


--
-- Name: fn_transferencia_mover_empresa("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_transferencia_mover_empresa"("p_perfil_id" "uuid", "p_empresa_id" "uuid", "p_setor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_antes            public.perfis%ROWTYPE;
  v_usuario          TEXT;
  v_colide           BOOLEAN;
  v_acordos_apagados INT := 0;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'sem permissão: mover alguém de empresa é de super_admin';
  END IF;

  IF p_setor_id IS NULL THEN
    RAISE EXCEPTION 'escolha o setor de destino';
  END IF;

  SELECT * INTO v_antes
    FROM public.perfis
   WHERE id = p_perfil_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'perfil % não encontrado', p_perfil_id;
  END IF;

  IF v_antes.empresa_id = p_empresa_id THEN
    RAISE EXCEPTION 'a empresa de destino é igual à empresa atual';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.setores
     WHERE id = p_setor_id
       AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'o setor escolhido não pertence à empresa de destino';
  END IF;

  v_usuario := v_antes.usuario;
  IF v_usuario IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.perfis
       WHERE usuario = v_usuario
         AND empresa_id = p_empresa_id
         AND id <> p_perfil_id
    ) INTO v_colide;

    IF v_colide THEN
      RAISE EXCEPTION
        'o login "%" já está em uso na empresa de destino; renomeie um dos dois antes',
        v_usuario;
    END IF;
  END IF;

  -- Relatório já foi gerado no cliente. Daqui até o UPDATE tudo é uma única
  -- transação: se qualquer passo falhar, acordos, vínculos e perfil voltam.
  v_acordos_apagados := public.fn_admin_apagar_acordos_do_usuario(
    p_perfil_id,
    v_antes.empresa_id
  );

  PERFORM set_config('app.transferencia_em_curso', 'on', true);

  UPDATE public.perfis
     SET empresa_id = p_empresa_id,
         setor_id   = p_setor_id,
         equipe_id  = NULL
   WHERE id = p_perfil_id;

  PERFORM set_config('app.transferencia_em_curso', 'off', true);

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'origem_empresa',    v_antes.empresa_id,
    'origem_setor',      v_antes.setor_id,
    'origem_equipe',     v_antes.equipe_id,
    'acordos_apagados',  v_acordos_apagados
  );
END;
$$;


--
-- Name: FUNCTION "fn_transferencia_mover_empresa"("p_perfil_id" "uuid", "p_empresa_id" "uuid", "p_setor_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_transferencia_mover_empresa"("p_perfil_id" "uuid", "p_empresa_id" "uuid", "p_setor_id" "uuid") IS 'Move perfil entre empresas e limpa acordos/vínculos da origem na mesma transação. Exige super_admin.';


--
-- Name: fn_transferir_acordo_nr("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_transferir_acordo_nr"("p_acordo_id" "uuid", "p_novo_operador_id" "uuid" DEFAULT NULL::"uuid", "p_motivo" "text" DEFAULT 'transferencia_nr'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_acordo     public.acordos%ROWTYPE;
  v_chamador   UUID := auth.uid();
  v_novo       UUID := COALESCE(p_novo_operador_id, auth.uid());
  v_sit_dono   TEXT;
  v_nome_dono  TEXT;
  v_nome_novo  TEXT;
  v_nome_chama TEXT;
  v_base       TEXT := NULL;   -- 'dono_desligado' | 'lider'
BEGIN
  IF v_chamador IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_acordo FROM public.acordos WHERE id = p_acordo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;

  IF NOT public.fn_can_access_empresa(v_acordo.empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_negada');
  END IF;

  -- O destinatário tem de ser da mesma empresa do acordo.
  IF NOT EXISTS (
    SELECT 1 FROM public.perfis
     WHERE id = v_novo AND empresa_id = v_acordo.empresa_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'destinatario_invalido');
  END IF;

  SELECT COALESCE(situacao, 'ativo'), nome
    INTO v_sit_dono, v_nome_dono
    FROM public.perfis WHERE id = v_acordo.operador_id;

  -- Base A: dono desligado, e quem chama está assumindo para si.
  IF v_sit_dono = 'desligado' AND v_novo = v_chamador THEN
    v_base := 'dono_desligado';
  END IF;

  -- Base B: quem chama é líder+ na empresa do acordo.
  IF v_base IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.perfis
       WHERE id = v_chamador
         AND empresa_id = v_acordo.empresa_id
         AND perfil IN ('lider','elite','gerencia','diretoria','administrador','super_admin')
    ) OR public.fn_user_is_super_admin() THEN
      v_base := 'lider';
    END IF;
  END IF;

  IF v_base IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  SELECT nome INTO v_nome_novo  FROM public.perfis WHERE id = v_novo;
  SELECT nome INTO v_nome_chama FROM public.perfis WHERE id = v_chamador;

  -- Snapshot na lixeira antes de excluir.
  INSERT INTO public.lixeira_acordos (
    acordo_id, empresa_id, operador_id, operador_nome,
    nome_cliente, nr_cliente, valor, vencimento, tipo, status,
    observacoes, instituicao, dados_completos, motivo,
    autorizado_por_id, autorizado_por_nome,
    transferido_para_id, transferido_para_nome
  ) VALUES (
    v_acordo.id, v_acordo.empresa_id, v_acordo.operador_id, v_nome_dono,
    v_acordo.nome_cliente, v_acordo.nr_cliente, v_acordo.valor, v_acordo.vencimento,
    v_acordo.tipo, v_acordo.status, v_acordo.observacoes, v_acordo.instituicao,
    to_jsonb(v_acordo), p_motivo,
    CASE WHEN v_base = 'lider' THEN v_chamador END,
    CASE WHEN v_base = 'lider' THEN v_nome_chama
         ELSE 'Sistema — operador desligado' END,
    v_novo, v_nome_novo
  );

  DELETE FROM public.acordos WHERE id = p_acordo_id;

  INSERT INTO public.logs_sistema (usuario_id, acao, tabela, registro_id, empresa_id, detalhes)
  VALUES (
    v_chamador,
    CASE WHEN v_base = 'dono_desligado' THEN 'transferencia_nr_desligado'
         ELSE 'transferencia_nr' END,
    'acordos', p_acordo_id, v_acordo.empresa_id,
    jsonb_build_object(
      'base_autorizacao',       v_base,
      'sem_autorizacao_lider',  v_base = 'dono_desligado',
      'motivo',                 p_motivo,
      'nr',                     COALESCE(v_acordo.nr_cliente, v_acordo.instituicao),
      'nome_cliente',           v_acordo.nome_cliente,
      'valor',                  v_acordo.valor,
      'operador_anterior',      v_acordo.operador_id,
      'operador_anterior_nome', v_nome_dono,
      'operador_novo',          v_novo,
      'operador_novo_nome',     v_nome_novo
    )
  );

  RETURN jsonb_build_object(
    'ok',                true,
    'base',              v_base,
    'operador_anterior', v_acordo.operador_id,
    'operador_ant_nome', v_nome_dono,
    'nome_cliente',      v_acordo.nome_cliente,
    'valor',             v_acordo.valor,
    'vencimento',        v_acordo.vencimento,
    'status',            v_acordo.status,
    'nr',                COALESCE(v_acordo.nr_cliente, v_acordo.instituicao)
  );
END;
$$;


--
-- Name: fn_user_empresa_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_user_empresa_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT empresa_id
  FROM public.perfis
  WHERE id = auth.uid()
  LIMIT 1;
$$;


--
-- Name: fn_user_empresa_is_bookplay(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_user_empresa_is_bookplay"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() AND lower(e.slug) = 'bookplay'
  );
$$;


--
-- Name: fn_user_empresa_is_pagueplay(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_user_empresa_is_pagueplay"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() AND lower(e.slug) = 'pagueplay'
  );
$$;


--
-- Name: fn_user_has_any_role("text"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_user_has_any_role"("roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid()
      AND (
        perfil::text = ANY(roles)
        OR (perfil::text = 'ouvidoria' AND 'lider' = ANY(roles))
      )
  );
$$;


--
-- Name: fn_user_is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_user_is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.perfis
    WHERE id = auth.uid() AND perfil::text = 'super_admin'
  );
$$;


--
-- Name: fn_user_perfil(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_user_perfil"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT perfil::text
  FROM public.perfis
  WHERE id = auth.uid()
  LIMIT 1;
$$;


--
-- Name: fn_user_setor_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_user_setor_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.setor_id FROM public.perfis p WHERE p.id = auth.uid();
$$;


--
-- Name: fn_validar_empresa_dos_perfis_do_acordo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_validar_empresa_dos_perfis_do_acordo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.operador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.perfis p
     WHERE p.id = NEW.operador_id
       AND p.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'o operador do acordo não pertence à empresa do acordo'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.vinculo_operador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.perfis p
     WHERE p.id = NEW.vinculo_operador_id
       AND p.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'o operador vinculado não pertence à empresa do acordo'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_vincular_extra_ao_direto("uuid", "uuid", "text", numeric, "date", "text", "text", "text", "text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_vincular_extra_ao_direto"("p_direto_id" "uuid", "p_extra_op_id" "uuid", "p_extra_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text" DEFAULT NULL::"text", "p_parcelas" integer DEFAULT 1) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


--
-- Name: fn_wpp_carimbos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_carimbos"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.atualizado_em := NOW();

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Primeira vez que entra em atendimento: guarda quando começou e com quem.
    IF NEW.status = 'em_andamento' AND NEW.iniciado_em IS NULL THEN
      NEW.iniciado_em := NOW();
      IF NEW.responsavel_id IS NULL THEN
        NEW.responsavel_id := auth.uid();
      END IF;
    END IF;

    IF NEW.status = 'feito' THEN
      NEW.finalizado_em := NOW();
    ELSE
      -- Reabriu (feito -> outro): o carimbo de fim deixa de valer.
      NEW.finalizado_em := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_wpp_chat_aberto("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_chat_aberto"("p_solicitacao_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.solicitacoes_whatsapp s
    WHERE s.id = p_solicitacao_id
      AND (
        s.status <> 'feito'
        OR s.finalizado_em IS NULL
        OR s.finalizado_em > NOW() - INTERVAL '24 hours'
      )
  );
$$;


--
-- Name: FUNCTION "fn_wpp_chat_aberto"("p_solicitacao_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_wpp_chat_aberto"("p_solicitacao_id" "uuid") IS 'True enquanto a conversa do atendimento aceita mensagem nova: chamado não fechado, ou fechado há menos de 24 h. Leitura do histórico não depende disto.';


--
-- Name: fn_wpp_diretorio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_diretorio"() RETURNS TABLE("id" "uuid", "nome" "text", "foto_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.nome, p.foto_url
  FROM public.perfis p
  WHERE p.empresa_id = public.fn_user_empresa_id()
  -- Inclui desligados de propósito: pedido antigo de quem saiu da empresa
  -- continua tendo que mostrar o nome de quem abriu.
$$;


--
-- Name: FUNCTION "fn_wpp_diretorio"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_wpp_diretorio"() IS 'Diretório mínimo (id, nome, foto_url) dos usuários da empresa do chamador. Existe porque perfis_select só deixa lider/administrador lerem outros perfis, e a aba de Solicitar Atendimento precisa mostrar de quem é cada pedido.';


--
-- Name: fn_wpp_eh_responsavel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_eh_responsavel"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.atendimento_responsaveis r
    WHERE r.usuario_id = auth.uid()
  );
$$;


--
-- Name: fn_wpp_limite_pendentes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_limite_pendentes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_pendentes INT;
BEGIN
  SELECT COUNT(*) INTO v_pendentes
  FROM public.solicitacoes_whatsapp
  WHERE solicitante_id = NEW.solicitante_id
    AND status = 'pendente';

  IF v_pendentes >= 10 THEN
    RAISE EXCEPTION
      'LIMITE_PENDENTES: voce ja tem % solicitacoes pendentes (maximo 10). Aguarde o atendimento das atuais.',
      v_pendentes
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_wpp_limpa_nao_concluido(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_limpa_nao_concluido"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'feito' AND NEW.nao_concluido_em IS NOT NULL THEN
    NEW.nao_concluido_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_wpp_marcar_nao_concluidos("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_marcar_nao_concluidos"("p_empresa_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_qtd INTEGER := 0;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO';
  END IF;

  WITH marcados AS (
    UPDATE public.solicitacoes_whatsapp s
       SET nao_concluido_em = NOW()
     WHERE s.empresa_id = p_empresa_id
       AND s.status IN ('pendente', 'em_andamento')
       AND s.nao_concluido_em IS NULL
       AND s.criado_em <= NOW() - INTERVAL '5 days'
    RETURNING s.id, s.empresa_id, s.codigo_cliente, s.nome_cliente,
              s.status, s.solicitante_id, s.responsavel_id
  ),
  -- Uma notificação por PESSOA envolvida. O UNION cobre o caso de o solicitante
  -- ser também o responsável (abriu e assumiu o próprio pedido) sem avisar duas
  -- vezes.
  avisos AS (
    INSERT INTO public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT DISTINCT
           d.destinatario,
           m.empresa_id,
           'Atendimento não concluído — '
             || COALESCE(NULLIF(TRIM(m.nome_cliente), ''), m.codigo_cliente),
           'O pedido de '
             || COALESCE(NULLIF(TRIM(m.nome_cliente), ''), m.codigo_cliente)
             || ' (' || m.codigo_cliente || ') está há mais de 5 dias '
             || CASE m.status
                  WHEN 'em_andamento' THEN 'em andamento'
                  ELSE 'pendente'
                END
             || ' e foi marcado como não concluído.',
           false,
           '/solicitacoes-whatsapp'
      FROM marcados m
      CROSS JOIN LATERAL (
        SELECT m.solicitante_id AS destinatario
        UNION
        SELECT m.responsavel_id
      ) AS d
     WHERE d.destinatario IS NOT NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_qtd FROM marcados;

  RETURN v_qtd;
END;
$$;


--
-- Name: FUNCTION "fn_wpp_marcar_nao_concluidos"("p_empresa_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_wpp_marcar_nao_concluidos"("p_empresa_id" "uuid") IS 'Marca como não concluídos os pedidos pendentes/em andamento há mais de 5 dias e avisa solicitante e responsável, uma vez só. Chamada pela tela ao abrir — não há job agendado neste projeto. Ver 20260811b.';


--
-- Name: fn_wpp_notificar_exclusao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_notificar_exclusao"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cliente TEXT;
  v_autor   TEXT;
  v_foto    TEXT;
  v_quem    UUID := auth.uid();
BEGIN
  v_cliente := COALESCE(NULLIF(TRIM(OLD.nome_cliente), ''), OLD.codigo_cliente, 'o cliente');

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém'), p.foto_url
    INTO v_autor, v_foto
    FROM public.perfis p
   WHERE p.id = v_quem;

  -- Solicitante e responsável, menos quem clicou. O DISTINCT cobre o caso de os
  -- dois serem a mesma pessoa (abriu e assumiu o próprio pedido).
  INSERT INTO public.notificacoes
    (usuario_id, empresa_id, titulo, mensagem, lida, rota,
     autor_id, autor_nome, autor_foto)
  SELECT DISTINCT
         destinatario,
         OLD.empresa_id,
         'Solicitação excluída — ' || v_cliente,
         COALESCE(SPLIT_PART(v_autor, ' ', 1), 'Alguém')
           || CASE WHEN destinatario = OLD.responsavel_id
                   THEN ' excluiu o pedido de ' || v_cliente
                        || ' (' || OLD.codigo_cliente || '), que estava com você.'
                   ELSE ' excluiu o seu pedido de ' || v_cliente
                        || ' (' || OLD.codigo_cliente || ').'
              END,
         false,
         '/solicitacoes-whatsapp',
         v_quem,
         v_autor,
         v_foto
    FROM (
      SELECT OLD.responsavel_id AS destinatario
      UNION
      SELECT OLD.solicitante_id
    ) AS envolvidos
   WHERE destinatario IS NOT NULL
     AND (v_quem IS NULL OR destinatario <> v_quem);

  RETURN OLD;
END;
$$;


--
-- Name: FUNCTION "fn_wpp_notificar_exclusao"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_wpp_notificar_exclusao"() IS 'Avisa solicitante e responsável quando o pedido é excluído por outra pessoa. Sem isto o atendimento sumia da tela de quem estava atendendo.';


--
-- Name: fn_wpp_notificar_mensagem(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_notificar_mensagem"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sol       public.solicitacoes_whatsapp%ROWTYPE;
  v_cliente   TEXT;
  v_autor     TEXT;
  v_foto      TEXT;
BEGIN
  SELECT * INTO v_sol
    FROM public.solicitacoes_whatsapp
   WHERE id = NEW.solicitacao_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_cliente := COALESCE(NULLIF(TRIM(v_sol.nome_cliente), ''), v_sol.codigo_cliente, 'cliente');

  -- Nome COMPLETO, não mais só o primeiro: agora ele é o título do aviso, e é
  -- onde a pessoa reconhece quem falou. O primeiro nome sozinho confunde quando
  -- há duas Marias na equipe.
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém'), p.foto_url
    INTO v_autor, v_foto
    FROM public.perfis p
   WHERE p.id = NEW.autor_id;

  -- Participantes da thread menos o autor. O DISTINCT cobre o caso de o
  -- solicitante ter assumido o próprio pedido (os dois campos iguais), que
  -- geraria duas notificações idênticas.
  INSERT INTO public.notificacoes
    (usuario_id, empresa_id, titulo, mensagem, lida, rota,
     autor_id, autor_nome, autor_foto)
  SELECT DISTINCT destinatario,
         NEW.empresa_id,
         'Nova mensagem — ' || v_cliente,
         LEFT(NEW.conteudo, 140),
         false,
         '/solicitacoes-whatsapp',
         NEW.autor_id,
         COALESCE(v_autor, 'Alguém'),
         v_foto
    FROM (
      SELECT v_sol.solicitante_id AS destinatario
      UNION
      SELECT v_sol.responsavel_id
    ) AS participantes
   WHERE destinatario IS NOT NULL
     AND destinatario <> NEW.autor_id;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION "fn_wpp_notificar_mensagem"(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_wpp_notificar_mensagem"() IS 'Mensagem nova no chat de uma solicitação vira notificação para o outro lado da thread, com autor, nome e foto em colunas próprias — a tela mostra a mensagem em destaque e a foto de quem escreveu. Ver 20260811d.';


--
-- Name: fn_wpp_pode_falar("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_pode_falar"("p_solicitacao_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.solicitacoes_whatsapp s
    WHERE s.id = p_solicitacao_id
      AND (s.solicitante_id = auth.uid() OR s.responsavel_id = auth.uid())
  );
$$;


--
-- Name: FUNCTION "fn_wpp_pode_falar"("p_solicitacao_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_wpp_pode_falar"("p_solicitacao_id" "uuid") IS 'True se o usuário é um dos DOIS envolvidos no atendimento (quem abriu ou quem está atendendo agora). Governa só o envio de mensagem; a leitura da conversa continua valendo para quem enxerga o pedido.';


--
-- Name: fn_wpp_pode_ver_solicitacao("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_pode_ver_solicitacao"("p_solicitacao_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.solicitacoes_whatsapp s
    WHERE s.id = p_solicitacao_id
      AND (s.solicitante_id = auth.uid() OR public.fn_wpp_tem_visao_geral())
  );
$$;


--
-- Name: fn_wpp_registrar_evento(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_registrar_evento"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.solicitacoes_whatsapp_eventos
      (empresa_id, solicitacao_id, tipo, status_anterior, status_novo, autor_id)
    VALUES (NEW.empresa_id, NEW.id, 'status', NULL, NEW.status, NEW.solicitante_id);
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.solicitacoes_whatsapp_eventos
      (empresa_id, solicitacao_id, tipo, status_anterior, status_novo, autor_id)
    VALUES (NEW.empresa_id, NEW.id, 'status', OLD.status, NEW.status, auth.uid());
  END IF;

  -- Troca de responsável. `status_novo` é NOT NULL, então repetimos o status
  -- atual — o que distingue a linha é o `tipo`.
  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    INSERT INTO public.solicitacoes_whatsapp_eventos
      (empresa_id, solicitacao_id, tipo, status_anterior, status_novo,
       responsavel_anterior, responsavel_novo, autor_id)
    VALUES (NEW.empresa_id, NEW.id, 'responsavel', NEW.status, NEW.status,
            OLD.responsavel_id, NEW.responsavel_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_wpp_tem_visao_geral(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wpp_tem_visao_geral"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.fn_user_has_any_role(
    ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
  )
  OR EXISTS (
    SELECT 1 FROM public.atendimento_responsaveis r
    WHERE r.usuario_id = auth.uid()
  );
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  _nome text;
  _setor text;
  _perfil text;
  _setores text[];
BEGIN
  -- Extrair metadados enviados no signUp (options.data)
  _nome := COALESCE(NEW.raw_user_meta_data ->> 'nome', '');
  _setor := COALESCE(NEW.raw_user_meta_data ->> 'setor', '');
  _perfil := COALESCE(NEW.raw_user_meta_data ->> 'perfil', 'setor');

  -- Montar setores_permitidos baseado no perfil
  IF _perfil = 'admin' THEN
    _setores := ARRAY['EM DIA', 'PLAY 1', 'PLAY 2', 'PLAY 3', 'PLAY 4', 'PLAY 5', 'PLAY 6'];
  ELSE
    _setores := ARRAY[_setor];
  END IF;

  INSERT INTO public.profiles (id, nome, setor, perfil, setores_permitidos)
  VALUES (NEW.id, _nome, _setor, _perfil, _setores);

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log do erro mas não bloqueia a criação do usuário
    RAISE WARNING 'Erro ao criar perfil para usuário %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


--
-- Name: prevent_empresa_id_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."prevent_empresa_id_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    -- `true` no segundo argumento = não estoura quando a chave nunca foi
    -- definida nesta sessão; devolve NULL, que não casa com 'on'.
    IF COALESCE(current_setting('app.transferencia_em_curso', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Não é permitido alterar o empresa_id'
        USING HINT = 'Use a transferência na aba Setores (fn_transferencia_mover_empresa).';
    END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_direto_extra_config_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_direto_extra_config_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: set_nr_registros_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_nr_registros_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at_cargos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at_cargos"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


--
-- Name: aceites_termo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."aceites_termo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "termo_id" "uuid" NOT NULL,
    "aceito_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip" "text",
    "user_agent" "text"
);


--
-- Name: acordos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."acordos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome_cliente" "text" NOT NULL,
    "nr_cliente" "text" NOT NULL,
    "data_cadastro" "date" DEFAULT CURRENT_DATE NOT NULL,
    "vencimento" "date" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "tipo" "text" NOT NULL,
    "parcelas" integer DEFAULT 1,
    "whatsapp" "text",
    "status" "text" NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "observacoes" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "setor_id" "uuid",
    "instituicao" "text",
    "empresa_id" "uuid" NOT NULL,
    "acordo_grupo_id" "uuid",
    "numero_parcela" integer DEFAULT 1,
    "tipo_receptivo" "text",
    "operador_vinculado_id" "uuid",
    "tipo_vinculo" "text" DEFAULT 'direto'::"text" NOT NULL,
    "vinculo_operador_id" "uuid",
    "vinculo_operador_nome" "text",
    "estado_uf" character(2) DEFAULT NULL::"bpchar",
    "tag_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "pago_em" timestamp with time zone,
    "valor_total" numeric(12,2) DEFAULT NULL::numeric,
    "data_pagamento" "date",
    "usou_quarenta_pct" boolean DEFAULT false NOT NULL,
    "valor_entrada" numeric(12,2) DEFAULT NULL::numeric,
    CONSTRAINT "acordos_status_check" CHECK (("status" = ANY (ARRAY['verificar_pendente'::"text", 'pago'::"text", 'nao_pago'::"text"]))),
    CONSTRAINT "acordos_tipo_check" CHECK (("tipo" = ANY (ARRAY['boleto'::"text", 'cartao_recorrente'::"text", 'pix_automatico'::"text", 'cartao'::"text", 'pix'::"text"]))),
    CONSTRAINT "acordos_tipo_vinculo_check" CHECK (("tipo_vinculo" = ANY (ARRAY['direto'::"text", 'extra'::"text"]))),
    CONSTRAINT "acordos_valor_entrada_positivo" CHECK ((("valor_entrada" IS NULL) OR ("valor_entrada" > (0)::numeric)))
);

ALTER TABLE ONLY "public"."acordos" REPLICA IDENTITY FULL;


--
-- Name: COLUMN "acordos"."tipo_vinculo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."acordos"."tipo_vinculo" IS 'direto = acordo principal; extra = acordo adicional sobre um NR já vinculado a outro operador';


--
-- Name: COLUMN "acordos"."vinculo_operador_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."acordos"."vinculo_operador_id" IS 'Operador que possui o vínculo DIRETO do mesmo NR (preenchido somente quando tipo_vinculo = extra)';


--
-- Name: COLUMN "acordos"."valor_total"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."acordos"."valor_total" IS 'Valor total do acordo parcelado (PaguePay). NULL = comportamento antigo/Bookplay.
   Quando preenchido: campo valor armazena o valor da 1ª parcela (pode usar 40%).';


--
-- Name: COLUMN "acordos"."valor_entrada"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."acordos"."valor_entrada" IS 'BookPlay: valor da entrada quando o 1º pagamento foi negociado como entrada. NULL no acordo comum. O valor das demais parcelas sai de (valor_total - valor_entrada) / (parcelas - 1).';


--
-- Name: acordos_deduplicados; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."acordos_deduplicados" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON (COALESCE(("acordo_grupo_id")::"text", ("id")::"text")) "id",
    "nome_cliente",
    "nr_cliente",
    "data_cadastro",
    "vencimento",
    "valor",
    "tipo",
    "parcelas",
    "whatsapp",
    "status",
    "operador_id",
    "observacoes",
    "criado_em",
    "atualizado_em",
    "setor_id",
    "instituicao",
    "empresa_id",
    "acordo_grupo_id",
    "numero_parcela",
    "tipo_receptivo",
    "operador_vinculado_id",
    "tipo_vinculo",
    "vinculo_operador_id",
    "vinculo_operador_nome",
    "estado_uf",
    "tag_ids"
   FROM "public"."acordos" "a"
  ORDER BY COALESCE(("acordo_grupo_id")::"text", ("id")::"text"), "numero_parcela" DESC NULLS LAST, "criado_em" DESC;


--
-- Name: ai_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ai_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "model" "text" DEFAULT 'gpt-4o-mini'::"text" NOT NULL,
    "temperature" numeric DEFAULT 0.2 NOT NULL,
    "max_rows" integer DEFAULT 120 NOT NULL,
    "max_cols" integer DEFAULT 20 NOT NULL,
    "prompt_system" "text" DEFAULT 'Você é um assistente que normaliza dados de acordos financeiros importados de planilhas. Responda APENAS com JSON válido, sem markdown.'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa_id" "uuid"
);


--
-- Name: analitico_exclusoes_setor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."analitico_exclusoes_setor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "setor_id" "uuid" NOT NULL,
    "mes" "text" NOT NULL,
    "setor_origem_id" "uuid",
    "excluido_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "analitico_exclusoes_setor_mes_check" CHECK (("mes" ~ '^\d{4}-\d{2}$'::"text"))
);


--
-- Name: analitico_recebimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."analitico_recebimentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "operador_id" "uuid",
    "operador_usuario" "text" NOT NULL,
    "codigo" "text" NOT NULL,
    "nome_cliente" "text",
    "forma_pagamento" "text" NOT NULL,
    "valor_recebido" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_ho" numeric(12,2) DEFAULT 0 NOT NULL,
    "data_pagamento" "date" NOT NULL,
    "mes_referencia" "date" NOT NULL,
    "acordo_id" "uuid",
    "status_tabulacao" "text" DEFAULT 'nao_tabulado'::"text" NOT NULL,
    "visto" boolean DEFAULT false NOT NULL,
    "importado_por_id" "uuid",
    "importado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lote_id" "uuid" NOT NULL,
    "pagamentos_detalhados" "jsonb",
    "instituicao" "text",
    "forma_detalhe" "text",
    "setor_id" "uuid",
    "tipo_comissao" "text",
    CONSTRAINT "analitico_recebimentos_forma_pagamento_check" CHECK (("forma_pagamento" = ANY (ARRAY['boleto_pix'::"text", 'cartao'::"text"]))),
    CONSTRAINT "analitico_recebimentos_status_tabulacao_check" CHECK (("status_tabulacao" = ANY (ARRAY['tabulado'::"text", 'nao_tabulado'::"text", 'divergente'::"text"])))
);


--
-- Name: COLUMN "analitico_recebimentos"."tipo_comissao"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."analitico_recebimentos"."tipo_comissao" IS 'Coluna "Tipo comissão" do relatório do ERP, texto cru (ex.: Extra, Integral). NULL = importado antes da 20260813a, ou relatório sem a coluna. A leitura normalizada é ehComissaoExtra() em src/services/analitico/analiticoComum.ts.';


--
-- Name: analitico_resumo_mensal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."analitico_resumo_mensal" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "mes" "text" NOT NULL,
    "total_recebido" numeric DEFAULT 0 NOT NULL,
    "total_ho" numeric DEFAULT 0 NOT NULL,
    "total_operadores" integer DEFAULT 0 NOT NULL,
    "total_pagamentos" integer DEFAULT 0 NOT NULL,
    "periodo_inicio" "date",
    "periodo_fim" "date",
    "atualizado_em" timestamp with time zone DEFAULT "now"()
);


--
-- Name: api_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."api_rate_limits" (
    "usuario_id" "uuid" NOT NULL,
    "rota" "text" NOT NULL,
    "janela_inicio" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requisicoes" integer DEFAULT 0 NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "api_rate_limits_requisicoes_check" CHECK (("requisicoes" >= 0))
);


--
-- Name: TABLE "api_rate_limits"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."api_rate_limits" IS 'Persistent per-user quotas for paid server-side endpoints. No browser role has direct access.';


--
-- Name: atendimento_responsaveis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."atendimento_responsaveis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "definido_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: campanha_facil_descontos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."campanha_facil_descontos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "overdue" numeric(6,2) DEFAULT 0 NOT NULL,
    "settlement" numeric(6,2) DEFAULT 0 NOT NULL,
    "interest" numeric(6,2) DEFAULT 0 NOT NULL,
    "bundle" numeric(6,2) DEFAULT 0 NOT NULL,
    "annual" numeric(6,2) DEFAULT 0 NOT NULL,
    "criado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: campanha_facil_mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."campanha_facil_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "categoria" "text" DEFAULT 'Personalizadas'::"text" NOT NULL,
    "corpo" "text" NOT NULL,
    "criado_por" "uuid",
    "criado_por_nome" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: campanha_facil_mensagens_ocultas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."campanha_facil_mensagens_ocultas" (
    "empresa_id" "uuid" NOT NULL,
    "template_id" "text" NOT NULL,
    "ocultado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: cargos_permissoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cargos_permissoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "cargo" "text" NOT NULL,
    "permissoes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "descricao" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."cargos_permissoes" REPLICA IDENTITY FULL;


--
-- Name: comemoracao_homenageados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."comemoracao_homenageados" (
    "comemoracao_id" "uuid" NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "setores_escolhidos" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL
);


--
-- Name: COLUMN "comemoracao_homenageados"."setores_escolhidos"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracao_homenageados"."setores_escolhidos" IS 'Setores em que ESTE homenageado deve ser comemorado. Vazio = o setor do perfil dele. Preenchido quando o operador é clone e quem montou escolheu.';


--
-- Name: comemoracao_parabens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."comemoracao_parabens" (
    "comemoracao_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "frase" "text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."comemoracao_parabens" REPLICA IDENTITY FULL;


--
-- Name: comemoracoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."comemoracoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "criado_por" "uuid",
    "titulo" "text" NOT NULL,
    "mensagem" "text",
    "efeito" "text" DEFAULT 'confete'::"text" NOT NULL,
    "som" "text" DEFAULT 'fanfarra'::"text" NOT NULL,
    "layout" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "inicia_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "duracao_s" integer DEFAULT 20 NOT NULL,
    "setores_alvo" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "cancelada_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gif_midia_id" "uuid",
    "som_midia_id" "uuid",
    "modelo" "text" DEFAULT 'midia_topo'::"text" NOT NULL,
    "anim_texto" "text" DEFAULT 'subir'::"text" NOT NULL,
    "volume" smallint DEFAULT 100 NOT NULL,
    "finalizada_em" timestamp with time zone,
    "alvo_tipo" "text" DEFAULT 'operadores'::"text" NOT NULL,
    "equipe_id" "uuid",
    "setor_id" "uuid",
    "empresa_inteira" boolean DEFAULT false NOT NULL,
    "somente_equipe" boolean DEFAULT false NOT NULL,
    "equipes_alvo" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    CONSTRAINT "comemoracoes_alvo_check" CHECK (((("alvo_tipo" = 'operadores'::"text") AND ("equipe_id" IS NULL) AND ("setor_id" IS NULL)) OR (("alvo_tipo" = 'equipe'::"text") AND ("equipe_id" IS NOT NULL) AND ("setor_id" IS NULL)) OR (("alvo_tipo" = 'setor'::"text") AND ("equipe_id" IS NULL) AND ("setor_id" IS NOT NULL)))),
    CONSTRAINT "comemoracoes_duracao_s_check" CHECK ((("duracao_s" >= 5) AND ("duracao_s" <= 60))),
    CONSTRAINT "comemoracoes_titulo_check" CHECK (("length"("btrim"("titulo")) > 0)),
    CONSTRAINT "comemoracoes_volume_check" CHECK ((("volume" >= 0) AND ("volume" <= 100)))
);

ALTER TABLE ONLY "public"."comemoracoes" REPLICA IDENTITY FULL;


--
-- Name: TABLE "comemoracoes"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."comemoracoes" IS 'Comemoração de meta: explode na tela de quem é do setor dos homenageados.';


--
-- Name: COLUMN "comemoracoes"."gif_midia_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracoes"."gif_midia_id" IS 'GIF enviado pelo líder. NULL = usa o efeito animado do catálogo (coluna efeito).';


--
-- Name: COLUMN "comemoracoes"."modelo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracoes"."modelo" IS 'Arranjo dos elementos: midia_topo | texto_sobre | midia_lado. O layout em % continua mandando — isto é o ponto de partida e o rótulo na tela.';


--
-- Name: COLUMN "comemoracoes"."volume"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracoes"."volume" IS 'PERCENTUAL do volume padrão de cada som, não ganho absoluto: 100 = como sempre foi. A música do líder e os sons sintetizados nascem calibrados diferente de propósito, e um ganho único obrigaria a estragar um dos dois.';


--
-- Name: COLUMN "comemoracoes"."finalizada_em"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracoes"."finalizada_em" IS 'Preenchida quando a comemoração termina. Finalizada nunca mais dispara.';


--
-- Name: COLUMN "comemoracoes"."alvo_tipo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracoes"."alvo_tipo" IS 'operadores (lista de homenageados) | equipe (explode no setor da equipe) | setor (explode na empresa inteira).';


--
-- Name: COLUMN "comemoracoes"."somente_equipe"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracoes"."somente_equipe" IS 'Estreita a plateia do setor para a equipe. Não se aplica a alvo_tipo = setor, que por definição vale para a empresa inteira.';


--
-- Name: COLUMN "comemoracoes"."equipes_alvo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."comemoracoes"."equipes_alvo" IS 'Equipes que veem a comemoração. Vazio = não estreita, vale setores_alvo.';


--
-- Name: composicao_mes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."composicao_mes" (
    "empresa_id" "uuid" NOT NULL,
    "mes" "text" NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "equipe_id" "uuid",
    "equipe_nome" "text",
    "setor_id" "uuid",
    "situacao" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "equipes_clone" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "composicao_mes_mes_check" CHECK (("mes" ~ '^\d{4}-\d{2}$'::"text"))
);


--
-- Name: composicao_mes_equipe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."composicao_mes_equipe" (
    "empresa_id" "uuid" NOT NULL,
    "mes" "text" NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "setor_id" "uuid",
    CONSTRAINT "composicao_mes_equipe_mes_check" CHECK (("mes" ~ '^\d{4}-\d{2}$'::"text"))
);


--
-- Name: contribuicao_receptivo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."contribuicao_receptivo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "setor_id" "uuid" NOT NULL,
    "mes" "text" NOT NULL,
    "acumulado" numeric(14,2) DEFAULT 0 NOT NULL,
    "meta" numeric(14,2) DEFAULT 0 NOT NULL,
    "atualizado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contribuicao_receptivo_mes_check" CHECK (("mes" ~ '^\d{4}-\d{2}$'::"text"))
);

ALTER TABLE ONLY "public"."contribuicao_receptivo" REPLICA IDENTITY FULL;


--
-- Name: TABLE "contribuicao_receptivo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."contribuicao_receptivo" IS 'Contribuição do Receptivo por setor/mês, preenchida à mão na aba Desempenho Equipes (BookPlay). Uma linha por (empresa, setor, mes); o acumulado soma no card consolidado do setor, a meta NÃO (decisão do usuário em 30/07/2026).';


--
-- Name: diario_recebimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."diario_recebimentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "operador_id" "uuid",
    "operador_usuario" "text" NOT NULL,
    "nome_cliente" "text",
    "acordo_codigo" "text",
    "forma_pagamento" "text" DEFAULT '—'::"text" NOT NULL,
    "valor_recebido" numeric(12,2) DEFAULT 0 NOT NULL,
    "data_pagamento" "date",
    "dia_referencia" "date" NOT NULL,
    "prox_contato" "date",
    "tabulacao" "text",
    "id_baixa" "text",
    "chave_unica" "text" NOT NULL,
    "import_index" integer DEFAULT 1 NOT NULL,
    "visto" boolean DEFAULT false NOT NULL,
    "importado_por_id" "uuid",
    "importado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lote_id" "uuid" NOT NULL,
    "instituicao" "text",
    "setor_id" "uuid",
    "cliente_codigo" "text"
);


--
-- Name: COLUMN "diario_recebimentos"."cliente_codigo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."diario_recebimentos"."cliente_codigo" IS 'Coluna "Cód.Cliente" do relatório do ERP, apenas dígitos (o ERP exporta com separador de milhar). Mesmo código usado na tabulação dos acordos.';


--
-- Name: direto_extra_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."direto_extra_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "escopo" "text" NOT NULL,
    "referencia_id" "uuid" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "direto_extra_config_escopo_check" CHECK (("escopo" = ANY (ARRAY['setor'::"text", 'equipe'::"text", 'usuario'::"text"])))
);


--
-- Name: TABLE "direto_extra_config"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."direto_extra_config" IS 'Ativação da lógica Direto e Extra — por setor, equipe ou usuário';


--
-- Name: COLUMN "direto_extra_config"."escopo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."direto_extra_config"."escopo" IS 'setor | equipe | usuario';


--
-- Name: COLUMN "direto_extra_config"."referencia_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."direto_extra_config"."referencia_id" IS 'ID do setor, equipe ou usuário (conforme escopo)';


--
-- Name: documentos_lgpd; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."documentos_lgpd" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid",
    "tipo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "versao" "text" DEFAULT '1.0'::"text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "documentos_lgpd_tipo_check" CHECK (("tipo" = ANY (ARRAY['politica_privacidade'::"text", 'ropa'::"text", 'aviso_privacidade_interno'::"text", 'politica_retencao_descarte'::"text", 'plano_resposta_incidentes'::"text", 'termo_responsabilidade_operador'::"text"])))
);


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."empresas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: equipe_lideres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."equipe_lideres" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "lider_id" "uuid" NOT NULL,
    "criado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: equipe_operadores_clones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."equipe_operadores_clones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "equipe_id" "uuid" NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "criado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "conta_recebimento" boolean DEFAULT true NOT NULL
);


--
-- Name: equipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."equipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "setor_id" "uuid",
    "empresa_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "treinamento" boolean DEFAULT false NOT NULL,
    "treinamento_inicio" "date"
);


--
-- Name: historico_acordos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."historico_acordos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "acordo_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "campo_alterado" "text" NOT NULL,
    "valor_anterior" "text",
    "valor_novo" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa_id" "uuid"
);


--
-- Name: lixeira_acordos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lixeira_acordos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acordo_id" "uuid" NOT NULL,
    "empresa_id" "uuid",
    "operador_id" "uuid",
    "operador_nome" "text",
    "nome_cliente" "text",
    "nr_cliente" "text",
    "valor" numeric,
    "vencimento" "date",
    "tipo" "text",
    "status" "text",
    "observacoes" "text",
    "instituicao" "text",
    "dados_completos" "jsonb",
    "motivo" "text",
    "autorizado_por_id" "uuid",
    "autorizado_por_nome" "text",
    "transferido_para_id" "uuid",
    "transferido_para_nome" "text",
    "excluido_em" timestamp with time zone DEFAULT "now"(),
    "expira_em" timestamp with time zone DEFAULT ("now"() + '3 days'::interval)
);

ALTER TABLE ONLY "public"."lixeira_acordos" REPLICA IDENTITY FULL;


--
-- Name: lixeira_pix_automatico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."lixeira_pix_automatico" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "acordo_id" "uuid" NOT NULL,
    "nr_cliente" "text" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "status" "text" NOT NULL,
    "operador_id" "uuid",
    "operador_nome" "text",
    "setor_id" "uuid",
    "dados_completos" "jsonb" NOT NULL,
    "excluido_por" "uuid",
    "excluido_por_nome" "text",
    "excluido_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expira_em" timestamp with time zone DEFAULT ("now"() + '3 days'::interval) NOT NULL
);


--
-- Name: logs_sistema; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."logs_sistema" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "usuario_id" "uuid",
    "acao" "text" NOT NULL,
    "tabela" "text",
    "registro_id" "text",
    "detalhes" "jsonb",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa_id" "uuid",
    "categoria" "text" DEFAULT 'sistema'::"text" NOT NULL,
    "severidade" "text" DEFAULT 'info'::"text" NOT NULL,
    "descricao" "text",
    "usuario_nome" "text",
    "usuario_email" "text",
    "usuario_cargo" "text",
    "alvo_tipo" "text",
    "alvo_rotulo" "text",
    "antes" "jsonb",
    "depois" "jsonb",
    "campos" "text"[],
    "origem" "text" DEFAULT 'ui'::"text" NOT NULL,
    "rota" "text",
    "ip" "text",
    "user_agent" "text",
    CONSTRAINT "logs_sistema_categoria_check" CHECK (("categoria" = ANY (ARRAY['acordo'::"text", 'financeiro'::"text", 'usuario'::"text", 'autenticacao'::"text", 'seguranca'::"text", 'configuracao'::"text", 'importacao'::"text", 'whatsapp'::"text", 'ouvidoria'::"text", 'meta'::"text", 'lixeira'::"text", 'comunicacao'::"text", 'sistema'::"text"]))),
    CONSTRAINT "logs_sistema_origem_check" CHECK (("origem" = ANY (ARRAY['ui'::"text", 'trigger'::"text", 'api'::"text", 'importacao'::"text", 'automatico'::"text", 'anon'::"text"]))),
    CONSTRAINT "logs_sistema_severidade_check" CHECK (("severidade" = ANY (ARRAY['info'::"text", 'aviso'::"text", 'critico'::"text"])))
);


--
-- Name: TABLE "logs_sistema"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."logs_sistema" IS 'Trilha de auditoria append-only. Escrita por fn_log_registrar (frontend e triggers) e por endpoints de servidor com service_role. Sem política de UPDATE nem de DELETE: para apagar existe fn_logs_expurgar, que só aceita super_admin, exige idade mínima e registra o próprio expurgo. Ver 20260812a.';


--
-- Name: COLUMN "logs_sistema"."categoria"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."logs_sistema"."categoria" IS 'Domínio do evento: acordo, financeiro, usuario, autenticacao, seguranca, configuracao, importacao, whatsapp, ouvidoria, meta, lixeira, comunicacao, sistema. Ver 20260812a.';


--
-- Name: COLUMN "logs_sistema"."severidade"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."logs_sistema"."severidade" IS 'info | aviso | critico. "critico" é o que o administrador precisa ver sem procurar (permissão, exclusão de usuário, concessão de acesso).';


--
-- Name: COLUMN "logs_sistema"."descricao"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."logs_sistema"."descricao" IS 'Frase pronta em português. Montada na origem do evento — a tela não reconstrói redação a partir de JSON.';


--
-- Name: COLUMN "logs_sistema"."usuario_nome"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."logs_sistema"."usuario_nome" IS 'Nome do autor no momento do evento. Desnormalizado de propósito: usuario_id é ON DELETE SET NULL e desligar alguém apagava a autoria do histórico dele.';


--
-- Name: COLUMN "logs_sistema"."antes"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."logs_sistema"."antes" IS 'Valores anteriores dos campos que mudaram — mascarados (telefone, senha, documento) e truncados em 500 caracteres. Nunca a linha inteira.';


--
-- Name: COLUMN "logs_sistema"."campos"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."logs_sistema"."campos" IS 'Nomes dos campos que mudaram. Permite filtrar "quem mexeu em valor" sem abrir o JSON.';


--
-- Name: COLUMN "logs_sistema"."origem"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."logs_sistema"."origem" IS 'ui | trigger | api | importacao | automatico | anon. Separa ação de pessoa de rotina de sistema.';


--
-- Name: logs_whatsapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."logs_whatsapp" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "acordo_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "mensagem" "text" NOT NULL,
    "enviado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa_id" "uuid"
);


--
-- Name: metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."metas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "referencia_id" "uuid" NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "meta_valor" numeric(15,2) DEFAULT 0 NOT NULL,
    "meta_acordos" integer DEFAULT 0 NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "criado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "metas_extras" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "meta_proporcional" boolean DEFAULT false NOT NULL,
    CONSTRAINT "metas_ano_check" CHECK (("ano" >= 2024)),
    CONSTRAINT "metas_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12))),
    CONSTRAINT "metas_tipo_check" CHECK (("tipo" = ANY (ARRAY['setor'::"text", 'equipe'::"text", 'operador'::"text"])))
);


--
-- Name: metas_config_mes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."metas_config_mes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "feriados" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "quartis" "jsonb" DEFAULT '[{"min_pct": 100, "quartil": 1}, {"min_pct": 80, "quartil": 2}, {"min_pct": 50, "quartil": 3}, {"min_pct": 0, "quartil": 4}]'::"jsonb" NOT NULL,
    "atualizado_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contar_dia_atual" boolean DEFAULT false NOT NULL,
    CONSTRAINT "metas_config_mes_ano_check" CHECK (("ano" >= 2024)),
    CONSTRAINT "metas_config_mes_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12)))
);


--
-- Name: metas_validacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."metas_validacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "setor_id" "uuid" NOT NULL,
    "mes" integer NOT NULL,
    "ano" integer NOT NULL,
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "validado_por" "uuid",
    "validado_em" timestamp with time zone,
    "reaberto_por" "uuid",
    "reaberto_em" timestamp with time zone,
    "motivo_reabertura" "text",
    CONSTRAINT "metas_validacoes_ano_check" CHECK (("ano" >= 2024)),
    CONSTRAINT "metas_validacoes_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12))),
    CONSTRAINT "metas_validacoes_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'validado'::"text"])))
);


--
-- Name: modelos_mensagem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."modelos_mensagem" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nome" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa_id" "uuid" NOT NULL
);


--
-- Name: notificacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "titulo" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "lida" boolean DEFAULT false NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa_id" "uuid",
    "acordo_id" "uuid",
    "rota" "text",
    "autor_id" "uuid",
    "autor_nome" "text",
    "autor_foto" "text"
);

ALTER TABLE ONLY "public"."notificacoes" REPLICA IDENTITY FULL;


--
-- Name: COLUMN "notificacoes"."rota"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."notificacoes"."rota" IS 'Para onde o clique leva (caminho interno, ex: /analitico?aba=diario). NULL = sem destino; a tela cai no palpite pelo título.';


--
-- Name: COLUMN "notificacoes"."autor_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."notificacoes"."autor_id" IS 'Quem causou a notificação (escreveu a mensagem, excluiu o registro). NULL quando não há pessoa por trás — importação, expurgo automático. Ver 20260811d.';


--
-- Name: COLUMN "notificacoes"."autor_nome"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."notificacoes"."autor_nome" IS 'Nome do autor no momento do aviso. Desnormalizado de propósito: o payload do realtime não traz junção. Ver 20260811d.';


--
-- Name: COLUMN "notificacoes"."autor_foto"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."notificacoes"."autor_foto" IS 'Foto do autor no momento do aviso. Mesmo motivo de autor_nome.';


--
-- Name: nr_registros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."nr_registros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "nr_value" "text" NOT NULL,
    "campo" "text" DEFAULT 'nr_cliente'::"text" NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "operador_nome" "text",
    "acordo_id" "uuid" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."nr_registros" REPLICA IDENTITY FULL;


--
-- Name: TABLE "nr_registros"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."nr_registros" IS 'Registro único de NR/Inscrição por empresa — controla qual operador possui vínculo ativo. Atualizado em tempo real.';


--
-- Name: COLUMN "nr_registros"."nr_value"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."nr_registros"."nr_value" IS 'Valor do NR (Bookplay: nr_cliente) ou Inscrição (PaguePay: instituicao)';


--
-- Name: COLUMN "nr_registros"."campo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."nr_registros"."campo" IS 'Coluna de origem: ''nr_cliente'' (Bookplay) | ''instituicao'' (PaguePay)';


--
-- Name: COLUMN "nr_registros"."operador_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."nr_registros"."operador_id" IS 'Operador que atualmente possui este NR em um acordo ativo';


--
-- Name: ouvidoria_acessos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ouvidoria_acessos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "nivel" "text" DEFAULT 'ver'::"text" NOT NULL,
    "concedido_por" "uuid",
    "concedido_por_nome" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: ouvidoria_atendimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ouvidoria_atendimentos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "criado_por" "uuid",
    "criado_por_nome" "text",
    "tipo" "text" DEFAULT 'reclamacao'::"text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "nome_cliente" "text" NOT NULL,
    "estado_uf" "text",
    "whatsapp" "text",
    "email" "text",
    "link" "text",
    "codigo" "text",
    "descricao" "text",
    "iniciado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolvido_em" timestamp with time zone,
    "resolvido_por" "uuid",
    "resolvido_por_nome" "text",
    "resolucao" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: perfis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."perfis" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "perfil" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "lider_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "setor_id" "uuid",
    "empresa_id" "uuid" NOT NULL,
    "usuario" "text",
    "equipe_id" "uuid",
    "foto_url" "text",
    "tampermonkey_configured" boolean DEFAULT false,
    "viu_notificacao_chatplay" boolean DEFAULT false,
    "senha_alterada" boolean DEFAULT false NOT NULL,
    "situacao" "text" DEFAULT 'ativo'::"text" NOT NULL,
    "desligado_em" timestamp with time zone,
    "arquivado" boolean DEFAULT false NOT NULL,
    "pet_despedida" "text",
    CONSTRAINT "perfis_perfil_check" CHECK (("perfil" = ANY (ARRAY['operador'::"text", 'lider'::"text", 'administrador'::"text", 'super_admin'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'ouvidoria'::"text"]))),
    CONSTRAINT "perfis_situacao_check" CHECK (("situacao" = ANY (ARRAY['ativo'::"text", 'ferias'::"text", 'desligado'::"text"])))
);


--
-- Name: COLUMN "perfis"."pet_despedida"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."perfis"."pet_despedida" IS 'Despedida do pet: ''pendente'' (deve ver o card), ''concluida'' (já se despediu), NULL (nunca conviveu com o pet). Ver 20260809c.';


--
-- Name: perfis_transferencias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."perfis_transferencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "perfil_id" "uuid" NOT NULL,
    "mes" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "origem_setor_id" "uuid",
    "origem_equipe_id" "uuid",
    "destino_empresa_id" "uuid" NOT NULL,
    "destino_setor_id" "uuid",
    "levou_acordos" boolean NOT NULL,
    "acordos_apagados" integer DEFAULT 0 NOT NULL,
    "relatorio_arquivo" "text",
    "clones_removidos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "fantasma_ativo" boolean DEFAULT true NOT NULL,
    "fantasma_removido_por" "uuid",
    "fantasma_removido_em" timestamp with time zone,
    "desfeita_em" timestamp with time zone,
    "desfeita_por" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "criado_por" "uuid",
    "perfil_nome" "text",
    CONSTRAINT "perfis_transferencias_mes_check" CHECK (("mes" ~ '^\d{4}-\d{2}$'::"text")),
    CONSTRAINT "perfis_transferencias_tipo_check" CHECK (("tipo" = ANY (ARRAY['setor'::"text", 'empresa'::"text"])))
);


--
-- Name: COLUMN "perfis_transferencias"."perfil_nome"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."perfis_transferencias"."perfil_nome" IS 'Nome de quem foi transferido, no momento da transferência. Cópia proposital: a empresa de ORIGEM não enxerga o perfil depois de uma troca de empresa.';


--
-- Name: pet_economia_regras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pet_economia_regras" (
    "cargo" "text" NOT NULL,
    "moedas_por_real" numeric DEFAULT 0.1 NOT NULL,
    "janela_dias" integer DEFAULT 7 NOT NULL,
    "base_recebimento" "text" DEFAULT 'proprio'::"text" NOT NULL,
    "ativo" boolean DEFAULT false NOT NULL,
    "observacao" "text",
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pet_economia_regras_base_recebimento_check" CHECK (("base_recebimento" = ANY (ARRAY['proprio'::"text", 'empresa'::"text", 'equipe'::"text"])))
);


--
-- Name: pet_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pet_inventario" (
    "usuario_id" "uuid" NOT NULL,
    "item_id" "text" NOT NULL,
    "origem" "text" DEFAULT 'compra'::"text" NOT NULL,
    "adquirido_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pet_inventario_origem_check" CHECK (("origem" = ANY (ARRAY['compra'::"text", 'recompensa'::"text", 'concessao'::"text", 'evento'::"text", 'inicial'::"text"])))
);


--
-- Name: pet_itens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pet_itens" (
    "id" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "emoji" "text",
    "raridade" "text" DEFAULT 'comum'::"text" NOT NULL,
    "preco_moedas" integer,
    "tenant" "text",
    "disponivel_de" timestamp with time zone,
    "disponivel_ate" timestamp with time zone,
    "exclusivo" boolean DEFAULT false NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pet_itens_raridade_check" CHECK (("raridade" = ANY (ARRAY['comum'::"text", 'raro'::"text", 'epico'::"text", 'lendario'::"text", 'exclusivo'::"text"]))),
    CONSTRAINT "pet_itens_tipo_check" CHECK (("tipo" = ANY (ARRAY['roupa'::"text", 'comida'::"text", 'movel'::"text", 'trofeu'::"text", 'colecionavel'::"text"])))
);


--
-- Name: pet_nome_votos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pet_nome_votos" (
    "usuario_id" "uuid" NOT NULL,
    "empresa_id" "uuid",
    "nome_escolhido" "text" NOT NULL,
    "votado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pet_nome_votos_nome_escolhido_check" CHECK (("nome_escolhido" = ANY (ARRAY['Aura'::"text", 'Lupi'::"text", 'Albi'::"text"])))
);


--
-- Name: pet_recompensas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pet_recompensas" (
    "usuario_id" "uuid" NOT NULL,
    "dia_referencia" "date" NOT NULL,
    "valor_resgatado" numeric(12,2) DEFAULT 0 NOT NULL,
    "moedas_creditadas" integer DEFAULT 0 NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "setor_id" "uuid",
    "valor_validado_no_momento" numeric(12,2)
);


--
-- Name: pix_automatico_acordos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pix_automatico_acordos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "operador_id" "uuid" NOT NULL,
    "operador_nome" "text",
    "setor_id" "uuid",
    "nr_cliente" "text" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "pct_comissao" numeric(6,4),
    "avaliado_por" "uuid",
    "avaliado_por_nome" "text",
    "avaliado_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pago" boolean DEFAULT false NOT NULL,
    "pago_em" timestamp with time zone,
    "pago_por" "uuid",
    "pago_por_nome" "text",
    CONSTRAINT "pix_automatico_acordos_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'aprovado'::"text", 'desaprovado'::"text"]))),
    CONSTRAINT "pix_automatico_acordos_valor_check" CHECK (("valor" > (0)::numeric))
);


--
-- Name: COLUMN "pix_automatico_acordos"."pago"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."pix_automatico_acordos"."pago" IS 'Comissão desta linha já foi paga ao operador. Independe de status: só faz sentido em linha aprovada, e é o líder+ quem marca.';


--
-- Name: pix_automatico_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pix_automatico_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "setor_id" "uuid" NOT NULL,
    "pct" numeric(6,4) DEFAULT 0.25 NOT NULL,
    "atualizado_por" "uuid",
    "atualizado_por_nome" "text",
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "permite_registro_operador" boolean DEFAULT true NOT NULL,
    "meta_acordos_dobra" smallint DEFAULT 18 NOT NULL,
    CONSTRAINT "pix_automatico_config_pct_check" CHECK ((("pct" >= (0)::numeric) AND ("pct" <= (100)::numeric))),
    CONSTRAINT "pix_cfg_meta_dobra_positiva" CHECK (("meta_acordos_dobra" > 0))
);


--
-- Name: COLUMN "pix_automatico_config"."meta_acordos_dobra"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."pix_automatico_config"."meta_acordos_dobra" IS 'Quantos acordos Pix o operador precisa fazer no mês para o requisito 1 da comissão dobrada. Padrão 18. Ver 20260810c.';


--
-- Name: pix_automatico_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pix_automatico_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "acordo_id" "uuid" NOT NULL,
    "nr_cliente" "text" NOT NULL,
    "acao" "text" NOT NULL,
    "descricao" "text" NOT NULL,
    "valor" numeric(12,2),
    "operador_id" "uuid",
    "operador_nome" "text",
    "autor_id" "uuid",
    "autor_nome" "text",
    "antes" "jsonb",
    "depois" "jsonb",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pix_automatico_log_acao_check" CHECK (("acao" = ANY (ARRAY['registrado'::"text", 'restaurado'::"text", 'editado'::"text", 'aprovado'::"text", 'desaprovado'::"text", 'voltou_pendente'::"text", 'pago'::"text", 'pagamento_desfeito'::"text", 'excluido'::"text"])))
);


--
-- Name: pix_automatico_metas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pix_automatico_metas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "setor_id" "uuid" NOT NULL,
    "mes" smallint NOT NULL,
    "ano" smallint NOT NULL,
    "meta_valor" numeric(14,2) DEFAULT 0 NOT NULL,
    "meta_acordos" integer DEFAULT 0 NOT NULL,
    "atualizado_por" "uuid",
    "atualizado_por_nome" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "equipe_id" "uuid",
    CONSTRAINT "pix_automatico_metas_ano_check" CHECK ((("ano" >= 2000) AND ("ano" <= 2100))),
    CONSTRAINT "pix_automatico_metas_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12))),
    CONSTRAINT "pix_automatico_metas_meta_acordos_check" CHECK (("meta_acordos" >= 0)),
    CONSTRAINT "pix_automatico_metas_meta_valor_check" CHECK (("meta_valor" >= (0)::numeric))
);


--
-- Name: TABLE "pix_automatico_metas"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."pix_automatico_metas" IS 'Meta de Pix automático por setor/mês (valor e quantidade). Separada de `metas`: o recebimento do Pix já entra no analítico e não pode ser contado duas vezes.';


--
-- Name: COLUMN "pix_automatico_metas"."equipe_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."pix_automatico_metas"."equipe_id" IS 'Equipe dona da meta. NULL = linha antiga, de quando a meta era do setor inteiro (20260804a); a UI nova grava sempre com equipe.';


--
-- Name: pix_automatico_nr_registro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pix_automatico_nr_registro" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "nr_normalizado" "text" NOT NULL,
    "nr_cliente" "text" NOT NULL,
    "acordo_id" "uuid",
    "operador_id" "uuid",
    "operador_nome" "text",
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "avaliado_por" "uuid",
    "avaliado_por_nome" "text",
    "avaliado_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pix_automatico_nr_registro_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'validado'::"text", 'recusado'::"text"])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nome" "text",
    "setor" "text",
    "perfil" "text" DEFAULT 'setor'::"text",
    "setores_permitidos" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "profiles_perfil_check" CHECK (("perfil" = ANY (ARRAY['admin'::"text", 'setor'::"text"])))
);


--
-- Name: profissionais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profissionais" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "telefone" "text",
    "estado_uf" character(2),
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: relatorio_validacoes_dia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."relatorio_validacoes_dia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "setor_id" "uuid" NOT NULL,
    "origem" "text" NOT NULL,
    "dia_referencia" "date" NOT NULL,
    "valor_validado" numeric(12,2) DEFAULT 0 NOT NULL,
    "qtd_registros_validados" integer DEFAULT 0 NOT NULL,
    "validado_por" "uuid",
    "validado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "relatorio_validacoes_dia_origem_check" CHECK (("origem" = ANY (ARRAY['analitico'::"text", 'diario'::"text"])))
);


--
-- Name: setores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."setores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "alternativo" boolean DEFAULT false NOT NULL,
    "foto_url" "text",
    "foto_receptivo_url" "text"
);


--
-- Name: COLUMN "setores"."alternativo"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."setores"."alternativo" IS 'Setor alternativo (sem relatório próprio): acumulado = soma dos usuários que pertencem a ele (membros + clones), em vez do total do relatório importado.';


--
-- Name: COLUMN "setores"."foto_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."setores"."foto_url" IS 'URL pública da foto do setor (bucket perfis, path setores/<id>). Exibida no card do setor em Desempenho Equipes.';


--
-- Name: COLUMN "setores"."foto_receptivo_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."setores"."foto_receptivo_url" IS 'URL pública da foto do card Contribuição Receptivo (bucket perfis, path setores/<id>-receptivo). Persiste entre meses.';


--
-- Name: solicitacoes_whatsapp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."solicitacoes_whatsapp" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "solicitante_id" "uuid" NOT NULL,
    "setor_id" "uuid",
    "equipe_id" "uuid",
    "codigo_cliente" "text" NOT NULL,
    "nome_cliente" "text",
    "estado_uf" "text",
    "whatsapp" "text" NOT NULL,
    "categoria" "text" NOT NULL,
    "mensagem" "text" NOT NULL,
    "status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "responsavel_id" "uuid",
    "iniciado_em" timestamp with time zone,
    "finalizado_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "msg_tem_cpf" boolean DEFAULT false NOT NULL,
    "msg_expurgar_em" timestamp with time zone,
    "msg_expurgado_em" timestamp with time zone,
    "nao_concluido_em" timestamp with time zone,
    CONSTRAINT "solicitacoes_whatsapp_categoria_check" CHECK (("categoria" = ANY (ARRAY['proposta'::"text", 'preventivo'::"text", 'quebra_acordo'::"text", 'outros'::"text"]))),
    CONSTRAINT "solicitacoes_whatsapp_status_check" CHECK (("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text", 'feito'::"text", 'falta_info'::"text"])))
);

ALTER TABLE ONLY "public"."solicitacoes_whatsapp" REPLICA IDENTITY FULL;


--
-- Name: TABLE "solicitacoes_whatsapp"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."solicitacoes_whatsapp" IS 'Pedidos de envio de mensagem no WhatsApp (PaguePlay): setor de ligação pede, digital executa. Status, responsável e carimbos de tempo; histórico em solicitacoes_whatsapp_eventos e conversa em solicitacoes_whatsapp_mensagens.';


--
-- Name: COLUMN "solicitacoes_whatsapp"."nao_concluido_em"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."solicitacoes_whatsapp"."nao_concluido_em" IS 'Quando o pedido passou dos 5 dias sem ser concluído e o aviso foi disparado. NULL = dentro do prazo. Serve para não notificar duas vezes. Ver 20260811b.';


--
-- Name: solicitacoes_whatsapp_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."solicitacoes_whatsapp_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "solicitacao_id" "uuid" NOT NULL,
    "status_anterior" "text",
    "status_novo" "text" NOT NULL,
    "autor_id" "uuid",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo" "text" DEFAULT 'status'::"text" NOT NULL,
    "responsavel_anterior" "uuid",
    "responsavel_novo" "uuid",
    CONSTRAINT "solicitacoes_whatsapp_eventos_tipo_check" CHECK (("tipo" = ANY (ARRAY['status'::"text", 'responsavel'::"text"])))
);


--
-- Name: solicitacoes_whatsapp_leitura; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."solicitacoes_whatsapp_leitura" (
    "empresa_id" "uuid" NOT NULL,
    "solicitacao_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "lido_ate" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_leitura" REPLICA IDENTITY FULL;


--
-- Name: TABLE "solicitacoes_whatsapp_leitura"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."solicitacoes_whatsapp_leitura" IS 'Até onde cada pessoa leu cada conversa. Substitui o carimbo único lida_em para efeito de "não lidas": aquele era por mensagem e sumia para todos quando qualquer um abria a thread.';


--
-- Name: solicitacoes_whatsapp_mensagens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."solicitacoes_whatsapp_mensagens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "solicitacao_id" "uuid" NOT NULL,
    "autor_id" "uuid" NOT NULL,
    "conteudo" "text" NOT NULL,
    "lida_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tem_cpf" boolean DEFAULT false NOT NULL,
    "expurgar_em" timestamp with time zone,
    "expurgado_em" timestamp with time zone,
    CONSTRAINT "solicitacoes_whatsapp_mensagens_conteudo_check" CHECK (("length"(TRIM(BOTH FROM "conteudo")) > 0))
);

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_mensagens" REPLICA IDENTITY FULL;


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "cor" "text" DEFAULT '#6366f1'::"text" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: termos_uso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."termos_uso" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empresa_id" "uuid" NOT NULL,
    "versao" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "conteudo" "text" NOT NULL,
    "ativo" boolean DEFAULT false NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: aceites_termo aceites_termo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."aceites_termo"
    ADD CONSTRAINT "aceites_termo_pkey" PRIMARY KEY ("id");


--
-- Name: aceites_termo aceites_termo_usuario_id_termo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."aceites_termo"
    ADD CONSTRAINT "aceites_termo_usuario_id_termo_id_key" UNIQUE ("usuario_id", "termo_id");


--
-- Name: acordos acordos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."acordos"
    ADD CONSTRAINT "acordos_pkey" PRIMARY KEY ("id");


--
-- Name: ai_config ai_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_config"
    ADD CONSTRAINT "ai_config_pkey" PRIMARY KEY ("id");


--
-- Name: analitico_exclusoes_setor analitico_exclusoes_setor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_exclusoes_setor"
    ADD CONSTRAINT "analitico_exclusoes_setor_pkey" PRIMARY KEY ("id");


--
-- Name: analitico_recebimentos analitico_recebimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_recebimentos"
    ADD CONSTRAINT "analitico_recebimentos_pkey" PRIMARY KEY ("id");


--
-- Name: analitico_resumo_mensal analitico_resumo_mensal_empresa_id_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_resumo_mensal"
    ADD CONSTRAINT "analitico_resumo_mensal_empresa_id_mes_key" UNIQUE ("empresa_id", "mes");


--
-- Name: analitico_resumo_mensal analitico_resumo_mensal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_resumo_mensal"
    ADD CONSTRAINT "analitico_resumo_mensal_pkey" PRIMARY KEY ("id");


--
-- Name: api_rate_limits api_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."api_rate_limits"
    ADD CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY ("usuario_id", "rota");


--
-- Name: atendimento_responsaveis atendimento_responsaveis_empresa_id_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."atendimento_responsaveis"
    ADD CONSTRAINT "atendimento_responsaveis_empresa_id_usuario_id_key" UNIQUE ("empresa_id", "usuario_id");


--
-- Name: atendimento_responsaveis atendimento_responsaveis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."atendimento_responsaveis"
    ADD CONSTRAINT "atendimento_responsaveis_pkey" PRIMARY KEY ("id");


--
-- Name: campanha_facil_descontos campanha_facil_descontos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."campanha_facil_descontos"
    ADD CONSTRAINT "campanha_facil_descontos_pkey" PRIMARY KEY ("id");


--
-- Name: campanha_facil_mensagens_ocultas campanha_facil_mensagens_ocultas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."campanha_facil_mensagens_ocultas"
    ADD CONSTRAINT "campanha_facil_mensagens_ocultas_pkey" PRIMARY KEY ("empresa_id", "template_id");


--
-- Name: campanha_facil_mensagens campanha_facil_mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."campanha_facil_mensagens"
    ADD CONSTRAINT "campanha_facil_mensagens_pkey" PRIMARY KEY ("id");


--
-- Name: cargos_permissoes cargos_permissoes_2026_04_16_empresa_id_cargo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cargos_permissoes"
    ADD CONSTRAINT "cargos_permissoes_2026_04_16_empresa_id_cargo_key" UNIQUE ("empresa_id", "cargo");


--
-- Name: cargos_permissoes cargos_permissoes_2026_04_16_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cargos_permissoes"
    ADD CONSTRAINT "cargos_permissoes_2026_04_16_pkey" PRIMARY KEY ("id");


--
-- Name: comemoracao_homenageados comemoracao_homenageados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_homenageados"
    ADD CONSTRAINT "comemoracao_homenageados_pkey" PRIMARY KEY ("comemoracao_id", "operador_id");


--
-- Name: comemoracao_midias comemoracao_midias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_midias"
    ADD CONSTRAINT "comemoracao_midias_pkey" PRIMARY KEY ("id");


--
-- Name: comemoracao_parabens comemoracao_parabens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_parabens"
    ADD CONSTRAINT "comemoracao_parabens_pkey" PRIMARY KEY ("comemoracao_id", "usuario_id");


--
-- Name: comemoracoes comemoracoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracoes"
    ADD CONSTRAINT "comemoracoes_pkey" PRIMARY KEY ("id");


--
-- Name: composicao_mes_equipe composicao_mes_equipe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."composicao_mes_equipe"
    ADD CONSTRAINT "composicao_mes_equipe_pkey" PRIMARY KEY ("empresa_id", "mes", "equipe_id");


--
-- Name: composicao_mes composicao_mes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."composicao_mes"
    ADD CONSTRAINT "composicao_mes_pkey" PRIMARY KEY ("empresa_id", "mes", "operador_id");


--
-- Name: contribuicao_receptivo contribuicao_receptivo_empresa_id_setor_id_mes_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contribuicao_receptivo"
    ADD CONSTRAINT "contribuicao_receptivo_empresa_id_setor_id_mes_key" UNIQUE ("empresa_id", "setor_id", "mes");


--
-- Name: contribuicao_receptivo contribuicao_receptivo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contribuicao_receptivo"
    ADD CONSTRAINT "contribuicao_receptivo_pkey" PRIMARY KEY ("id");


--
-- Name: diario_recebimentos diario_recebimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."diario_recebimentos"
    ADD CONSTRAINT "diario_recebimentos_pkey" PRIMARY KEY ("id");


--
-- Name: direto_extra_config direto_extra_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."direto_extra_config"
    ADD CONSTRAINT "direto_extra_config_pkey" PRIMARY KEY ("id");


--
-- Name: documentos_lgpd documentos_lgpd_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."documentos_lgpd"
    ADD CONSTRAINT "documentos_lgpd_pkey" PRIMARY KEY ("id");


--
-- Name: empresas empresas_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_nome_key" UNIQUE ("nome");


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_pkey" PRIMARY KEY ("id");


--
-- Name: empresas empresas_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."empresas"
    ADD CONSTRAINT "empresas_slug_key" UNIQUE ("slug");


--
-- Name: equipe_lideres equipe_lideres_equipe_id_lider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_lideres"
    ADD CONSTRAINT "equipe_lideres_equipe_id_lider_id_key" UNIQUE ("equipe_id", "lider_id");


--
-- Name: equipe_lideres equipe_lideres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_lideres"
    ADD CONSTRAINT "equipe_lideres_pkey" PRIMARY KEY ("id");


--
-- Name: equipe_operadores_clones equipe_operadores_clones_equipe_id_operador_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_operadores_clones"
    ADD CONSTRAINT "equipe_operadores_clones_equipe_id_operador_id_key" UNIQUE ("equipe_id", "operador_id");


--
-- Name: equipe_operadores_clones equipe_operadores_clones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_operadores_clones"
    ADD CONSTRAINT "equipe_operadores_clones_pkey" PRIMARY KEY ("id");


--
-- Name: equipes equipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipes"
    ADD CONSTRAINT "equipes_pkey" PRIMARY KEY ("id");


--
-- Name: historico_acordos historico_acordos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."historico_acordos"
    ADD CONSTRAINT "historico_acordos_pkey" PRIMARY KEY ("id");


--
-- Name: lixeira_acordos lixeira_acordos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lixeira_acordos"
    ADD CONSTRAINT "lixeira_acordos_pkey" PRIMARY KEY ("id");


--
-- Name: lixeira_pix_automatico lixeira_pix_automatico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lixeira_pix_automatico"
    ADD CONSTRAINT "lixeira_pix_automatico_pkey" PRIMARY KEY ("id");


--
-- Name: logs_sistema logs_sistema_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."logs_sistema"
    ADD CONSTRAINT "logs_sistema_pkey" PRIMARY KEY ("id");


--
-- Name: logs_whatsapp logs_whatsapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."logs_whatsapp"
    ADD CONSTRAINT "logs_whatsapp_pkey" PRIMARY KEY ("id");


--
-- Name: metas_config_mes metas_config_mes_empresa_id_mes_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_config_mes"
    ADD CONSTRAINT "metas_config_mes_empresa_id_mes_ano_key" UNIQUE ("empresa_id", "mes", "ano");


--
-- Name: metas_config_mes metas_config_mes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_config_mes"
    ADD CONSTRAINT "metas_config_mes_pkey" PRIMARY KEY ("id");


--
-- Name: metas metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas"
    ADD CONSTRAINT "metas_pkey" PRIMARY KEY ("id");


--
-- Name: metas metas_tipo_referencia_id_empresa_id_mes_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas"
    ADD CONSTRAINT "metas_tipo_referencia_id_empresa_id_mes_ano_key" UNIQUE ("tipo", "referencia_id", "empresa_id", "mes", "ano");


--
-- Name: metas_validacoes metas_validacoes_empresa_id_setor_id_mes_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_validacoes"
    ADD CONSTRAINT "metas_validacoes_empresa_id_setor_id_mes_ano_key" UNIQUE ("empresa_id", "setor_id", "mes", "ano");


--
-- Name: metas_validacoes metas_validacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_validacoes"
    ADD CONSTRAINT "metas_validacoes_pkey" PRIMARY KEY ("id");


--
-- Name: modelos_mensagem modelos_mensagem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."modelos_mensagem"
    ADD CONSTRAINT "modelos_mensagem_pkey" PRIMARY KEY ("id");


--
-- Name: notificacoes notificacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id");


--
-- Name: nr_registros nr_registros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."nr_registros"
    ADD CONSTRAINT "nr_registros_pkey" PRIMARY KEY ("id");


--
-- Name: ouvidoria_acessos ouvidoria_acessos_empresa_id_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ouvidoria_acessos"
    ADD CONSTRAINT "ouvidoria_acessos_empresa_id_usuario_id_key" UNIQUE ("empresa_id", "usuario_id");


--
-- Name: ouvidoria_acessos ouvidoria_acessos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ouvidoria_acessos"
    ADD CONSTRAINT "ouvidoria_acessos_pkey" PRIMARY KEY ("id");


--
-- Name: ouvidoria_atendimentos ouvidoria_atendimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ouvidoria_atendimentos"
    ADD CONSTRAINT "ouvidoria_atendimentos_pkey" PRIMARY KEY ("id");


--
-- Name: perfis perfis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_pkey" PRIMARY KEY ("id");


--
-- Name: perfis_transferencias perfis_transferencias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_pkey" PRIMARY KEY ("id");


--
-- Name: pet_economia_regras pet_economia_regras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_economia_regras"
    ADD CONSTRAINT "pet_economia_regras_pkey" PRIMARY KEY ("cargo");


--
-- Name: pet_estado pet_estado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_estado"
    ADD CONSTRAINT "pet_estado_pkey" PRIMARY KEY ("usuario_id");


--
-- Name: pet_inventario pet_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_inventario"
    ADD CONSTRAINT "pet_inventario_pkey" PRIMARY KEY ("usuario_id", "item_id");


--
-- Name: pet_itens pet_itens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_itens"
    ADD CONSTRAINT "pet_itens_pkey" PRIMARY KEY ("id");


--
-- Name: pet_nome_votos pet_nome_votos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_nome_votos"
    ADD CONSTRAINT "pet_nome_votos_pkey" PRIMARY KEY ("usuario_id");


--
-- Name: pet_recompensas pet_recompensas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_recompensas"
    ADD CONSTRAINT "pet_recompensas_pkey" PRIMARY KEY ("usuario_id", "dia_referencia");


--
-- Name: pix_automatico_acordos pix_automatico_acordos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_acordos"
    ADD CONSTRAINT "pix_automatico_acordos_pkey" PRIMARY KEY ("id");


--
-- Name: pix_automatico_config pix_automatico_config_empresa_id_setor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_config"
    ADD CONSTRAINT "pix_automatico_config_empresa_id_setor_id_key" UNIQUE ("empresa_id", "setor_id");


--
-- Name: pix_automatico_config pix_automatico_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_config"
    ADD CONSTRAINT "pix_automatico_config_pkey" PRIMARY KEY ("id");


--
-- Name: pix_automatico_log pix_automatico_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_log"
    ADD CONSTRAINT "pix_automatico_log_pkey" PRIMARY KEY ("id");


--
-- Name: pix_automatico_metas pix_automatico_metas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_metas"
    ADD CONSTRAINT "pix_automatico_metas_pkey" PRIMARY KEY ("id");


--
-- Name: pix_automatico_nr_registro pix_automatico_nr_registro_empresa_id_nr_normalizado_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_nr_registro"
    ADD CONSTRAINT "pix_automatico_nr_registro_empresa_id_nr_normalizado_key" UNIQUE ("empresa_id", "nr_normalizado");


--
-- Name: pix_automatico_nr_registro pix_automatico_nr_registro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_nr_registro"
    ADD CONSTRAINT "pix_automatico_nr_registro_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: profissionais profissionais_empresa_id_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profissionais"
    ADD CONSTRAINT "profissionais_empresa_id_codigo_key" UNIQUE ("empresa_id", "codigo");


--
-- Name: profissionais profissionais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profissionais"
    ADD CONSTRAINT "profissionais_pkey" PRIMARY KEY ("id");


--
-- Name: relatorio_validacoes_dia relatorio_validacoes_dia_empresa_id_setor_id_origem_dia_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."relatorio_validacoes_dia"
    ADD CONSTRAINT "relatorio_validacoes_dia_empresa_id_setor_id_origem_dia_ref_key" UNIQUE ("empresa_id", "setor_id", "origem", "dia_referencia");


--
-- Name: relatorio_validacoes_dia relatorio_validacoes_dia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."relatorio_validacoes_dia"
    ADD CONSTRAINT "relatorio_validacoes_dia_pkey" PRIMARY KEY ("id");


--
-- Name: setores setores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."setores"
    ADD CONSTRAINT "setores_pkey" PRIMARY KEY ("id");


--
-- Name: solicitacoes_whatsapp_eventos solicitacoes_whatsapp_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_eventos"
    ADD CONSTRAINT "solicitacoes_whatsapp_eventos_pkey" PRIMARY KEY ("id");


--
-- Name: solicitacoes_whatsapp_leitura solicitacoes_whatsapp_leitura_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_leitura"
    ADD CONSTRAINT "solicitacoes_whatsapp_leitura_pkey" PRIMARY KEY ("solicitacao_id", "usuario_id");


--
-- Name: solicitacoes_whatsapp_mensagens solicitacoes_whatsapp_mensagens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_mensagens"
    ADD CONSTRAINT "solicitacoes_whatsapp_mensagens_pkey" PRIMARY KEY ("id");


--
-- Name: solicitacoes_whatsapp solicitacoes_whatsapp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp"
    ADD CONSTRAINT "solicitacoes_whatsapp_pkey" PRIMARY KEY ("id");


--
-- Name: tags tags_empresa_id_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_empresa_id_nome_key" UNIQUE ("empresa_id", "nome");


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");


--
-- Name: termos_uso termos_uso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."termos_uso"
    ADD CONSTRAINT "termos_uso_pkey" PRIMARY KEY ("id");


--
-- Name: pix_automatico_metas uq_pix_metas_equipe; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_metas"
    ADD CONSTRAINT "uq_pix_metas_equipe" UNIQUE ("empresa_id", "equipe_id", "mes", "ano");


--
-- Name: CONSTRAINT "uq_pix_metas_equipe" ON "pix_automatico_metas"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT "uq_pix_metas_equipe" ON "public"."pix_automatico_metas" IS 'Uma meta de Pix por equipe/mês. Constraint (e não índice parcial) porque o upsert da tela usa ON CONFLICT, que só reconhece constraint ou índice total.';


--
-- Name: pix_automatico_metas uq_pix_metas_equipe_periodo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_metas"
    ADD CONSTRAINT "uq_pix_metas_equipe_periodo" UNIQUE ("empresa_id", "equipe_id", "mes", "ano");


--
-- Name: idx_aceites_termo_termo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_aceites_termo_termo" ON "public"."aceites_termo" USING "btree" ("termo_id");


--
-- Name: idx_aceites_termo_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_aceites_termo_usuario" ON "public"."aceites_termo" USING "btree" ("usuario_id");


--
-- Name: idx_acordos_com_entrada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_com_entrada" ON "public"."acordos" USING "btree" ("acordo_grupo_id") WHERE ("valor_entrada" IS NOT NULL);


--
-- Name: idx_acordos_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_criado_em" ON "public"."acordos" USING "btree" ("criado_em" DESC);


--
-- Name: idx_acordos_dedup_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_dedup_grupo" ON "public"."acordos" USING "btree" (COALESCE(("acordo_grupo_id")::"text", ("id")::"text"), "numero_parcela" DESC NULLS LAST, "criado_em" DESC);


--
-- Name: idx_acordos_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_empresa" ON "public"."acordos" USING "btree" ("empresa_id");


--
-- Name: idx_acordos_empresa_operador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_empresa_operador" ON "public"."acordos" USING "btree" ("empresa_id", "operador_id");


--
-- Name: idx_acordos_empresa_operador_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_empresa_operador_vencimento" ON "public"."acordos" USING "btree" ("empresa_id", "operador_id", "vencimento");


--
-- Name: idx_acordos_empresa_setor_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_empresa_setor_vencimento" ON "public"."acordos" USING "btree" ("empresa_id", "setor_id", "vencimento");


--
-- Name: idx_acordos_empresa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_empresa_status" ON "public"."acordos" USING "btree" ("empresa_id", "status");


--
-- Name: idx_acordos_empresa_status_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_empresa_status_vencimento" ON "public"."acordos" USING "btree" ("empresa_id", "status", "vencimento");


--
-- Name: idx_acordos_empresa_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_empresa_vencimento" ON "public"."acordos" USING "btree" ("empresa_id", "vencimento");


--
-- Name: idx_acordos_estado_uf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_estado_uf" ON "public"."acordos" USING "btree" ("estado_uf") WHERE ("estado_uf" IS NOT NULL);


--
-- Name: idx_acordos_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_grupo" ON "public"."acordos" USING "btree" ("acordo_grupo_id") WHERE ("acordo_grupo_id" IS NOT NULL);


--
-- Name: idx_acordos_grupo_parcela; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_grupo_parcela" ON "public"."acordos" USING "btree" ("acordo_grupo_id", "numero_parcela" DESC) WHERE ("acordo_grupo_id" IS NOT NULL);


--
-- Name: idx_acordos_instituicao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_instituicao" ON "public"."acordos" USING "btree" ("instituicao") WHERE ("instituicao" IS NOT NULL);


--
-- Name: idx_acordos_instituicao_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_instituicao_ativo" ON "public"."acordos" USING "btree" ("empresa_id", "instituicao") WHERE (("status" <> 'nao_pago'::"text") AND ("instituicao" IS NOT NULL));


--
-- Name: idx_acordos_nome_cliente_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_nome_cliente_lower" ON "public"."acordos" USING "btree" ("empresa_id", "lower"("nome_cliente"));


--
-- Name: idx_acordos_nr_cliente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_nr_cliente" ON "public"."acordos" USING "btree" ("nr_cliente");


--
-- Name: idx_acordos_nr_cliente_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_nr_cliente_ativo" ON "public"."acordos" USING "btree" ("empresa_id", "nr_cliente") WHERE ("status" <> 'nao_pago'::"text");


--
-- Name: idx_acordos_operador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_operador" ON "public"."acordos" USING "btree" ("operador_id");


--
-- Name: idx_acordos_pago_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_pago_em" ON "public"."acordos" USING "btree" ("pago_em" DESC) WHERE ("pago_em" IS NOT NULL);


--
-- Name: idx_acordos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_status" ON "public"."acordos" USING "btree" ("status");


--
-- Name: idx_acordos_tag_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_tag_ids" ON "public"."acordos" USING "gin" ("tag_ids") WHERE (("tag_ids" IS NOT NULL) AND ("tag_ids" <> '{}'::"uuid"[]));


--
-- Name: idx_acordos_tipo_vinculo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_tipo_vinculo" ON "public"."acordos" USING "btree" ("tipo_vinculo") WHERE ("tipo_vinculo" = 'extra'::"text");


--
-- Name: idx_acordos_vencimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_vencimento" ON "public"."acordos" USING "btree" ("vencimento");


--
-- Name: idx_acordos_vinculo_operador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_acordos_vinculo_operador" ON "public"."acordos" USING "btree" ("vinculo_operador_id") WHERE ("vinculo_operador_id" IS NOT NULL);


--
-- Name: idx_analitico_empresa_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_analitico_empresa_codigo" ON "public"."analitico_recebimentos" USING "btree" ("empresa_id", "codigo");


--
-- Name: idx_analitico_empresa_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_analitico_empresa_data" ON "public"."analitico_recebimentos" USING "btree" ("empresa_id", "data_pagamento");


--
-- Name: idx_analitico_empresa_op_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_analitico_empresa_op_data" ON "public"."analitico_recebimentos" USING "btree" ("empresa_id", "operador_id", "data_pagamento");


--
-- Name: idx_analitico_empresa_op_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_analitico_empresa_op_mes" ON "public"."analitico_recebimentos" USING "btree" ("empresa_id", "operador_id", "mes_referencia");


--
-- Name: idx_analitico_exclusoes_empresa_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_analitico_exclusoes_empresa_mes" ON "public"."analitico_exclusoes_setor" USING "btree" ("empresa_id", "mes");


--
-- Name: idx_analitico_exclusoes_unq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_analitico_exclusoes_unq" ON "public"."analitico_exclusoes_setor" USING "btree" ("empresa_id", "setor_id", "mes", COALESCE("setor_origem_id", '00000000-0000-0000-0000-000000000000'::"uuid"));


--
-- Name: idx_analitico_lote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_analitico_lote" ON "public"."analitico_recebimentos" USING "btree" ("lote_id");


--
-- Name: idx_analitico_recebimentos_setor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_analitico_recebimentos_setor" ON "public"."analitico_recebimentos" USING "btree" ("setor_id") WHERE ("setor_id" IS NOT NULL);


--
-- Name: idx_analitico_tipo_comissao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_analitico_tipo_comissao" ON "public"."analitico_recebimentos" USING "btree" ("empresa_id", "mes_referencia", "tipo_comissao") WHERE ("tipo_comissao" IS NOT NULL);


--
-- Name: idx_analitico_unicidade; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_analitico_unicidade" ON "public"."analitico_recebimentos" USING "btree" ("empresa_id", "codigo", "data_pagamento", "forma_pagamento", "operador_usuario");


--
-- Name: idx_atend_resp_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_atend_resp_empresa" ON "public"."atendimento_responsaveis" USING "btree" ("empresa_id");


--
-- Name: idx_cf_mensagens_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cf_mensagens_empresa" ON "public"."campanha_facil_mensagens" USING "btree" ("empresa_id", "criado_em");


--
-- Name: idx_comemoracao_midias_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_comemoracao_midias_empresa" ON "public"."comemoracao_midias" USING "btree" ("empresa_id", "tipo", "criado_em" DESC);


--
-- Name: idx_comemoracao_midias_expira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_comemoracao_midias_expira" ON "public"."comemoracao_midias" USING "btree" ("expira_em") WHERE ("expira_em" IS NOT NULL);


--
-- Name: idx_comemoracoes_janela; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_comemoracoes_janela" ON "public"."comemoracoes" USING "btree" ("empresa_id", "inicia_em") WHERE ("cancelada_em" IS NULL);


--
-- Name: idx_composicao_mes_empresa_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_composicao_mes_empresa_mes" ON "public"."composicao_mes" USING "btree" ("empresa_id", "mes");


--
-- Name: idx_composicao_mes_equipe_empresa_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_composicao_mes_equipe_empresa_mes" ON "public"."composicao_mes_equipe" USING "btree" ("empresa_id", "mes");


--
-- Name: idx_contrib_receptivo_empresa_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_contrib_receptivo_empresa_mes" ON "public"."contribuicao_receptivo" USING "btree" ("empresa_id", "mes");


--
-- Name: idx_diario_cliente_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_diario_cliente_codigo" ON "public"."diario_recebimentos" USING "btree" ("empresa_id", "cliente_codigo");


--
-- Name: idx_diario_empresa_dia_op; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_diario_empresa_dia_op" ON "public"."diario_recebimentos" USING "btree" ("empresa_id", "dia_referencia", "operador_id");


--
-- Name: idx_diario_lote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_diario_lote" ON "public"."diario_recebimentos" USING "btree" ("lote_id");


--
-- Name: idx_diario_recebimentos_setor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_diario_recebimentos_setor" ON "public"."diario_recebimentos" USING "btree" ("setor_id") WHERE ("setor_id" IS NOT NULL);


--
-- Name: idx_diario_unicidade; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_diario_unicidade" ON "public"."diario_recebimentos" USING "btree" ("empresa_id", "dia_referencia", "chave_unica");


--
-- Name: idx_direto_extra_config_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_direto_extra_config_ativo" ON "public"."direto_extra_config" USING "btree" ("empresa_id", "ativo");


--
-- Name: idx_direto_extra_config_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_direto_extra_config_empresa" ON "public"."direto_extra_config" USING "btree" ("empresa_id");


--
-- Name: idx_doc_lgpd_tipo_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_doc_lgpd_tipo_empresa" ON "public"."documentos_lgpd" USING "btree" ("empresa_id", "tipo") WHERE ("empresa_id" IS NOT NULL);


--
-- Name: idx_doc_lgpd_tipo_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_doc_lgpd_tipo_global" ON "public"."documentos_lgpd" USING "btree" ("tipo") WHERE ("empresa_id" IS NULL);


--
-- Name: idx_equipe_lideres_equipe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_equipe_lideres_equipe" ON "public"."equipe_lideres" USING "btree" ("equipe_id");


--
-- Name: idx_equipe_lideres_lider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_equipe_lideres_lider" ON "public"."equipe_lideres" USING "btree" ("lider_id");


--
-- Name: idx_equipes_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_equipes_empresa_id" ON "public"."equipes" USING "btree" ("empresa_id");


--
-- Name: idx_equipes_setor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_equipes_setor_id" ON "public"."equipes" USING "btree" ("setor_id");


--
-- Name: idx_historico_acordo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_historico_acordo" ON "public"."historico_acordos" USING "btree" ("acordo_id");


--
-- Name: idx_historico_campo_valor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_historico_campo_valor" ON "public"."historico_acordos" USING "btree" ("campo_alterado", "valor_novo");


--
-- Name: idx_historico_criado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_historico_criado_em" ON "public"."historico_acordos" USING "btree" ("criado_em" DESC);


--
-- Name: idx_historico_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_historico_usuario" ON "public"."historico_acordos" USING "btree" ("usuario_id");


--
-- Name: idx_lixeira_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lixeira_empresa" ON "public"."lixeira_acordos" USING "btree" ("empresa_id");


--
-- Name: idx_lixeira_nr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lixeira_nr" ON "public"."lixeira_acordos" USING "btree" ("nr_cliente");


--
-- Name: idx_lixeira_operador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lixeira_operador" ON "public"."lixeira_acordos" USING "btree" ("operador_id");


--
-- Name: idx_lixeira_pix_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lixeira_pix_empresa" ON "public"."lixeira_pix_automatico" USING "btree" ("empresa_id", "excluido_em" DESC);


--
-- Name: idx_lixeira_pix_expira; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lixeira_pix_expira" ON "public"."lixeira_pix_automatico" USING "btree" ("expira_em");


--
-- Name: idx_lixeira_pix_operador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_lixeira_pix_operador" ON "public"."lixeira_pix_automatico" USING "btree" ("empresa_id", "operador_id");


--
-- Name: idx_logs_alvo_rotulo_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_alvo_rotulo_trgm" ON "public"."logs_sistema" USING "gin" ("alvo_rotulo" "public"."gin_trgm_ops");


--
-- Name: idx_logs_campos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_campos" ON "public"."logs_sistema" USING "gin" ("campos");


--
-- Name: idx_logs_descricao_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_descricao_trgm" ON "public"."logs_sistema" USING "gin" ("descricao" "public"."gin_trgm_ops");


--
-- Name: idx_logs_empresa_acao_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_empresa_acao_criado" ON "public"."logs_sistema" USING "btree" ("empresa_id", "acao", "criado_em" DESC);


--
-- Name: idx_logs_empresa_categoria_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_empresa_categoria_criado" ON "public"."logs_sistema" USING "btree" ("empresa_id", "categoria", "criado_em" DESC);


--
-- Name: idx_logs_empresa_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_empresa_criado" ON "public"."logs_sistema" USING "btree" ("empresa_id", "criado_em" DESC);


--
-- Name: idx_logs_empresa_severidade_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_empresa_severidade_criado" ON "public"."logs_sistema" USING "btree" ("empresa_id", "severidade", "criado_em" DESC) WHERE ("severidade" <> 'info'::"text");


--
-- Name: idx_logs_empresa_tabela_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_empresa_tabela_criado" ON "public"."logs_sistema" USING "btree" ("empresa_id", "tabela", "criado_em" DESC);


--
-- Name: idx_logs_empresa_usuario_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_empresa_usuario_criado" ON "public"."logs_sistema" USING "btree" ("empresa_id", "usuario_id", "criado_em" DESC);


--
-- Name: idx_logs_registro; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_logs_registro" ON "public"."logs_sistema" USING "btree" ("registro_id", "criado_em" DESC) WHERE ("registro_id" IS NOT NULL);


--
-- Name: idx_metas_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_metas_empresa" ON "public"."metas" USING "btree" ("empresa_id");


--
-- Name: idx_metas_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_metas_periodo" ON "public"."metas" USING "btree" ("mes", "ano");


--
-- Name: idx_metas_referencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_metas_referencia" ON "public"."metas" USING "btree" ("referencia_id");


--
-- Name: idx_msgs_cpf_pendente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_msgs_cpf_pendente" ON "public"."solicitacoes_whatsapp_mensagens" USING "btree" ("expurgar_em") WHERE ("tem_cpf" AND ("expurgado_em" IS NULL));


--
-- Name: idx_notificacoes_acordo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_notificacoes_acordo" ON "public"."notificacoes" USING "btree" ("acordo_id");


--
-- Name: idx_nr_acordo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_nr_acordo" ON "public"."nr_registros" USING "btree" ("acordo_id");


--
-- Name: idx_nr_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_nr_empresa" ON "public"."nr_registros" USING "btree" ("empresa_id");


--
-- Name: idx_nr_operador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_nr_operador" ON "public"."nr_registros" USING "btree" ("operador_id");


--
-- Name: idx_ouvidoria_acessos_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ouvidoria_acessos_usuario" ON "public"."ouvidoria_acessos" USING "btree" ("usuario_id");


--
-- Name: idx_ouvidoria_atend_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ouvidoria_atend_codigo" ON "public"."ouvidoria_atendimentos" USING "btree" ("codigo");


--
-- Name: idx_ouvidoria_atend_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ouvidoria_atend_empresa" ON "public"."ouvidoria_atendimentos" USING "btree" ("empresa_id");


--
-- Name: idx_ouvidoria_atend_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ouvidoria_atend_status" ON "public"."ouvidoria_atendimentos" USING "btree" ("empresa_id", "status");


--
-- Name: idx_perfis_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_perfis_empresa" ON "public"."perfis" USING "btree" ("empresa_id");


--
-- Name: idx_perfis_equipe_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_perfis_equipe_id" ON "public"."perfis" USING "btree" ("equipe_id");


--
-- Name: idx_perfis_situacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_perfis_situacao" ON "public"."perfis" USING "btree" ("empresa_id", "situacao");


--
-- Name: idx_perfis_usuario_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_perfis_usuario_empresa" ON "public"."perfis" USING "btree" ("usuario", "empresa_id") WHERE ("usuario" IS NOT NULL);


--
-- Name: idx_perfis_usuario_empresa_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_perfis_usuario_empresa_lookup" ON "public"."perfis" USING "btree" ("lower"("btrim"("usuario")), "empresa_id") WHERE (("usuario" IS NOT NULL) AND ("btrim"("usuario") <> ''::"text"));


--
-- Name: idx_perfis_usuario_only; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_perfis_usuario_only" ON "public"."perfis" USING "btree" ("usuario") WHERE ("usuario" IS NOT NULL);


--
-- Name: idx_pet_itens_listagem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pet_itens_listagem" ON "public"."pet_itens" USING "btree" ("tipo", "ativo", "ordem");


--
-- Name: idx_pet_nome_votos_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pet_nome_votos_empresa" ON "public"."pet_nome_votos" USING "btree" ("empresa_id", "nome_escolhido");


--
-- Name: idx_pix_auto_aprovado_nao_pago; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_aprovado_nao_pago" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id", "setor_id") WHERE (("status" = 'aprovado'::"text") AND ("pago" = false));


--
-- Name: idx_pix_auto_desaprovado_avaliado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_desaprovado_avaliado" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id", "avaliado_em") WHERE ("status" = 'desaprovado'::"text");


--
-- Name: idx_pix_auto_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_empresa" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id");


--
-- Name: idx_pix_auto_empresa_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_empresa_criado" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id", "criado_em" DESC);


--
-- Name: idx_pix_auto_metas_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_metas_periodo" ON "public"."pix_automatico_metas" USING "btree" ("empresa_id", "ano", "mes");


--
-- Name: idx_pix_auto_nr_busca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_nr_busca" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id", "public"."fn_pix_nr_normalizar"("nr_cliente"));


--
-- Name: idx_pix_auto_nr_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_pix_auto_nr_unico" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id", "public"."fn_pix_nr_normalizar"("nr_cliente"));


--
-- Name: idx_pix_auto_operador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_operador" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id", "operador_id");


--
-- Name: idx_pix_auto_setor_criado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_setor_criado" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id", "setor_id", "criado_em" DESC);


--
-- Name: idx_pix_auto_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_auto_status" ON "public"."pix_automatico_acordos" USING "btree" ("empresa_id", "status");


--
-- Name: idx_pix_log_acordo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_log_acordo" ON "public"."pix_automatico_log" USING "btree" ("acordo_id", "criado_em" DESC);


--
-- Name: idx_pix_log_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_log_empresa" ON "public"."pix_automatico_log" USING "btree" ("empresa_id", "criado_em" DESC);


--
-- Name: idx_pix_log_operador; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_log_operador" ON "public"."pix_automatico_log" USING "btree" ("empresa_id", "operador_id", "criado_em" DESC);


--
-- Name: idx_pix_metas_setor_equipe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_metas_setor_equipe" ON "public"."pix_automatico_metas" USING "btree" ("empresa_id", "setor_id", "ano", "mes");


--
-- Name: idx_pix_nr_reg_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_pix_nr_reg_empresa" ON "public"."pix_automatico_nr_registro" USING "btree" ("empresa_id", "status");


--
-- Name: idx_profiles_perfil; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_perfil" ON "public"."profiles" USING "btree" ("perfil");


--
-- Name: idx_profiles_setor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_profiles_setor" ON "public"."profiles" USING "btree" ("setor");


--
-- Name: idx_setores_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_setores_empresa" ON "public"."setores" USING "btree" ("empresa_id");


--
-- Name: idx_sol_wpp_empresa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sol_wpp_empresa_status" ON "public"."solicitacoes_whatsapp" USING "btree" ("empresa_id", "status", "criado_em" DESC);


--
-- Name: idx_sol_wpp_eventos_solicitacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sol_wpp_eventos_solicitacao" ON "public"."solicitacoes_whatsapp_eventos" USING "btree" ("solicitacao_id", "criado_em");


--
-- Name: idx_sol_wpp_leitura_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sol_wpp_leitura_usuario" ON "public"."solicitacoes_whatsapp_leitura" USING "btree" ("empresa_id", "usuario_id");


--
-- Name: idx_sol_wpp_msg_nao_lidas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sol_wpp_msg_nao_lidas" ON "public"."solicitacoes_whatsapp_mensagens" USING "btree" ("empresa_id", "lida_em") WHERE ("lida_em" IS NULL);


--
-- Name: idx_sol_wpp_msg_solicitacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sol_wpp_msg_solicitacao" ON "public"."solicitacoes_whatsapp_mensagens" USING "btree" ("solicitacao_id", "criado_em");


--
-- Name: idx_sol_wpp_nao_concluido_pendente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sol_wpp_nao_concluido_pendente" ON "public"."solicitacoes_whatsapp" USING "btree" ("empresa_id", "criado_em") WHERE (("nao_concluido_em" IS NULL) AND ("status" = ANY (ARRAY['pendente'::"text", 'em_andamento'::"text"])));


--
-- Name: idx_sol_wpp_setor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sol_wpp_setor" ON "public"."solicitacoes_whatsapp" USING "btree" ("empresa_id", "setor_id", "criado_em" DESC);


--
-- Name: idx_sol_wpp_solicitante; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sol_wpp_solicitante" ON "public"."solicitacoes_whatsapp" USING "btree" ("empresa_id", "solicitante_id", "criado_em" DESC);


--
-- Name: idx_solic_cpf_pendente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_solic_cpf_pendente" ON "public"."solicitacoes_whatsapp" USING "btree" ("msg_expurgar_em") WHERE ("msg_tem_cpf" AND ("msg_expurgado_em" IS NULL));


--
-- Name: idx_tags_empresa_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tags_empresa_id" ON "public"."tags" USING "btree" ("empresa_id");


--
-- Name: idx_termos_uso_ativo_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_termos_uso_ativo_empresa" ON "public"."termos_uso" USING "btree" ("empresa_id") WHERE ("ativo" = true);


--
-- Name: idx_transferencias_fantasma; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transferencias_fantasma" ON "public"."perfis_transferencias" USING "btree" ("empresa_id", "mes") WHERE (("desfeita_em" IS NULL) AND "fantasma_ativo");


--
-- Name: idx_transferencias_perfil; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transferencias_perfil" ON "public"."perfis_transferencias" USING "btree" ("perfil_id", "criado_em" DESC);


--
-- Name: nr_registros_acordo_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "nr_registros_acordo_id_idx" ON "public"."nr_registros" USING "btree" ("acordo_id");


--
-- Name: uniq_direto_extra_config; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uniq_direto_extra_config" ON "public"."direto_extra_config" USING "btree" ("empresa_id", "escopo", "referencia_id");


--
-- Name: uniq_nr_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uniq_nr_empresa" ON "public"."nr_registros" USING "btree" ("empresa_id", "nr_value", "campo");


--
-- Name: uq_cf_descontos_empresa_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_cf_descontos_empresa_nome" ON "public"."campanha_facil_descontos" USING "btree" ("empresa_id", "lower"("nome"));


--
-- Name: uq_pix_metas_setor_periodo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_pix_metas_setor_periodo" ON "public"."pix_automatico_metas" USING "btree" ("empresa_id", "setor_id", "mes", "ano") WHERE ("equipe_id" IS NULL);


--
-- Name: perfis block_empresa_id_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "block_empresa_id_update" BEFORE UPDATE ON "public"."perfis" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_empresa_id_update"();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();


--
-- Name: acordos trg_acordos_exige_estado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_acordos_exige_estado" BEFORE INSERT OR UPDATE ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_acordo_exige_estado"();


--
-- Name: acordos trg_acordos_recusa_cpf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_acordos_recusa_cpf" BEFORE INSERT OR UPDATE ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_acordo_recusa_cpf"();


--
-- Name: acordos trg_acordos_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_acordos_updated" BEFORE UPDATE ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_atualizar_timestamp"();


--
-- Name: cargos_permissoes trg_cargos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_cargos_updated_at" BEFORE UPDATE ON "public"."cargos_permissoes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_cargos"();


--
-- Name: comemoracoes trg_comemoracao_alvo_direto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_comemoracao_alvo_direto" BEFORE INSERT OR UPDATE OF "alvo_tipo", "equipe_id", "setor_id", "somente_equipe" ON "public"."comemoracoes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_comemoracao_alvo_direto"();


--
-- Name: comemoracao_midias trg_comemoracao_midias_teto; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_comemoracao_midias_teto" BEFORE INSERT ON "public"."comemoracao_midias" FOR EACH ROW EXECUTE FUNCTION "public"."fn_comemoracao_midias_teto"();


--
-- Name: comemoracao_homenageados trg_comemoracao_setores_alvo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_comemoracao_setores_alvo" AFTER INSERT OR DELETE ON "public"."comemoracao_homenageados" FOR EACH ROW EXECUTE FUNCTION "public"."fn_comemoracao_setores_alvo"();


--
-- Name: contribuicao_receptivo trg_contrib_receptivo_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_contrib_receptivo_touch" BEFORE UPDATE ON "public"."contribuicao_receptivo" FOR EACH ROW EXECUTE FUNCTION "public"."fn_contrib_receptivo_touch"();


--
-- Name: diario_recebimentos trg_diario_preencher_setor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_diario_preencher_setor" BEFORE INSERT OR UPDATE ON "public"."diario_recebimentos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_diario_preencher_setor"();


--
-- Name: direto_extra_config trg_direto_extra_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_direto_extra_config_updated_at" BEFORE UPDATE ON "public"."direto_extra_config" FOR EACH ROW EXECUTE FUNCTION "public"."set_direto_extra_config_updated_at"();


--
-- Name: documentos_lgpd trg_doc_lgpd_atualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_doc_lgpd_atualizado" BEFORE UPDATE ON "public"."documentos_lgpd" FOR EACH ROW EXECUTE FUNCTION "public"."fn_doc_lgpd_set_atualizado"();


--
-- Name: empresas trg_empresa_seed_super_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_empresa_seed_super_admin" AFTER INSERT ON "public"."empresas" FOR EACH ROW EXECUTE FUNCTION "public"."fn_empresa_seed_super_admin"();


--
-- Name: empresas trg_empresas_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_empresas_updated" BEFORE UPDATE ON "public"."empresas" FOR EACH ROW EXECUTE FUNCTION "public"."fn_atualizar_timestamp"();


--
-- Name: perfis trg_impedir_transferencia_com_acordos_pendentes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_impedir_transferencia_com_acordos_pendentes" BEFORE UPDATE OF "empresa_id" ON "public"."perfis" FOR EACH ROW EXECUTE FUNCTION "public"."fn_impedir_transferencia_com_acordos_pendentes"();


--
-- Name: acordos trg_log_acordos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_acordos" AFTER INSERT OR DELETE OR UPDATE ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('acordo', 'acordo', 'o acordo', 'nr_cliente,nome_cliente', 'acordo_grupo_id', 'empresa_id', 'info');


--
-- Name: analitico_exclusoes_setor trg_log_analitico_exclusoes_setor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_analitico_exclusoes_setor" AFTER INSERT OR DELETE ON "public"."analitico_exclusoes_setor" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('importacao', 'analitico_exclusao', 'a origem no acumulado', 'mes', '', 'empresa_id', 'aviso');


--
-- Name: campanha_facil_descontos trg_log_campanha_facil_descontos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_campanha_facil_descontos" AFTER INSERT OR DELETE OR UPDATE ON "public"."campanha_facil_descontos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'campanha_desconto', 'o desconto de campanha', '', '', 'empresa_id', 'info');


--
-- Name: cargos_permissoes trg_log_cargos_permissoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_cargos_permissoes" AFTER INSERT OR DELETE OR UPDATE ON "public"."cargos_permissoes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('seguranca', 'cargo_permissoes', 'as permissões do cargo', 'cargo', '', 'empresa_id', 'critico');


--
-- Name: comemoracoes trg_log_comemoracoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_comemoracoes" AFTER INSERT OR DELETE OR UPDATE ON "public"."comemoracoes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('comunicacao', 'comemoracao', 'a comemoração', '', '', 'empresa_id', 'info');


--
-- Name: composicao_mes trg_log_composicao_mes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_composicao_mes" AFTER INSERT OR DELETE OR UPDATE ON "public"."composicao_mes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('importacao', 'composicao_mes', 'a composição do mês', '', '', 'empresa_id', 'aviso');


--
-- Name: direto_extra_config trg_log_direto_extra_config; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_direto_extra_config" AFTER INSERT OR DELETE OR UPDATE ON "public"."direto_extra_config" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'direto_extra', 'a regra Direto/Extra', 'escopo', '', 'empresa_id', 'aviso');


--
-- Name: documentos_lgpd trg_log_documentos_lgpd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_documentos_lgpd" AFTER INSERT OR DELETE OR UPDATE ON "public"."documentos_lgpd" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'documento_lgpd', 'o documento LGPD', 'titulo,tipo', '', 'empresa_id', 'aviso');


--
-- Name: empresas trg_log_empresas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_empresas" AFTER INSERT OR DELETE OR UPDATE ON "public"."empresas" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'empresa', 'a empresa', 'nome,slug', '', 'id', 'critico');


--
-- Name: equipe_lideres trg_log_equipe_lideres; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_equipe_lideres" AFTER INSERT OR DELETE OR UPDATE ON "public"."equipe_lideres" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('seguranca', 'equipe_lideranca', 'a liderança da equipe', '', '', 'empresa_id', 'aviso');


--
-- Name: equipe_operadores_clones trg_log_equipe_operadores_clones; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_equipe_operadores_clones" AFTER INSERT OR DELETE OR UPDATE ON "public"."equipe_operadores_clones" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'equipe_clone', 'o clone de operador', '', '', 'empresa_id', 'info');


--
-- Name: equipes trg_log_equipes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_equipes" AFTER INSERT OR DELETE OR UPDATE ON "public"."equipes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'equipe', 'a equipe', 'nome', '', 'empresa_id', 'info');


--
-- Name: acordos trg_log_historico_acordo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_historico_acordo" AFTER INSERT OR UPDATE ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_historico_acordo"();


--
-- Name: lixeira_acordos trg_log_lixeira_acordos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_lixeira_acordos" AFTER DELETE OR UPDATE ON "public"."lixeira_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('lixeira', 'lixeira_item', 'o item da lixeira', 'nr_cliente,nome_cliente', 'dados_completos,expira_em', 'empresa_id', 'aviso');


--
-- Name: lixeira_pix_automatico trg_log_lixeira_pix_automatico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_lixeira_pix_automatico" AFTER DELETE OR UPDATE ON "public"."lixeira_pix_automatico" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('financeiro', 'pix_lixeira', 'o Pix na lixeira', 'nr_cliente', 'dados_completos', 'empresa_id', 'aviso');


--
-- Name: metas trg_log_metas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_metas" AFTER INSERT OR DELETE OR UPDATE ON "public"."metas" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('meta', 'meta', 'a meta', 'tipo', '', 'empresa_id', 'aviso');


--
-- Name: metas_config_mes trg_log_metas_config_mes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_metas_config_mes" AFTER INSERT OR DELETE OR UPDATE ON "public"."metas_config_mes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('meta', 'meta_config', 'a configuração de metas', '', '', 'empresa_id', 'aviso');


--
-- Name: metas_validacoes trg_log_metas_validacoes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_metas_validacoes" AFTER INSERT OR DELETE OR UPDATE ON "public"."metas_validacoes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('meta', 'meta_validacao', 'a validação de meta', '', '', 'empresa_id', 'info');


--
-- Name: modelos_mensagem trg_log_modelos_mensagem; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_modelos_mensagem" AFTER INSERT OR DELETE OR UPDATE ON "public"."modelos_mensagem" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('comunicacao', 'modelo_mensagem', 'o modelo de mensagem', 'nome', '', 'empresa_id', 'info');


--
-- Name: nr_registros trg_log_nr_registros; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_nr_registros" AFTER DELETE OR UPDATE ON "public"."nr_registros" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('acordo', 'nr_titularidade', 'a titularidade de NR', 'nr_value,operador_nome', '', 'empresa_id', 'aviso');


--
-- Name: ouvidoria_acessos trg_log_ouvidoria_acessos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_ouvidoria_acessos" AFTER INSERT OR DELETE OR UPDATE ON "public"."ouvidoria_acessos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('seguranca', 'ouvidoria_acesso', 'o acesso à ouvidoria', 'concedido_por_nome', '', 'empresa_id', 'critico');


--
-- Name: ouvidoria_atendimentos trg_log_ouvidoria_atendimentos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_ouvidoria_atendimentos" AFTER INSERT OR DELETE OR UPDATE ON "public"."ouvidoria_atendimentos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('ouvidoria', 'ouvidoria_atend', 'o atendimento', '', '', 'empresa_id', 'aviso');


--
-- Name: perfis trg_log_perfis; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_perfis" AFTER INSERT OR DELETE OR UPDATE ON "public"."perfis" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('usuario', 'usuario', 'o usuário', 'nome,usuario', 'foto_url,viu_notificacao_chatplay,pet_despedida,tampermonkey_configured,senha_alterada', 'empresa_id', 'aviso');


--
-- Name: perfis_transferencias trg_log_perfis_transferencias; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_perfis_transferencias" AFTER INSERT OR UPDATE ON "public"."perfis_transferencias" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('usuario', 'transferencia_usuario', 'a transferência', 'tipo,mes', '', 'empresa_id', 'aviso');


--
-- Name: pix_automatico_acordos trg_log_pix_automatico_acordos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_pix_automatico_acordos" AFTER INSERT OR DELETE OR UPDATE ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('financeiro', 'pix_registro', 'o registro de Pix', 'nr_cliente,operador_nome', '', 'empresa_id', 'info');


--
-- Name: pix_automatico_config trg_log_pix_automatico_config; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_pix_automatico_config" AFTER INSERT OR DELETE OR UPDATE ON "public"."pix_automatico_config" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('financeiro', 'pix_config', 'a configuração do Pix', '', '', 'empresa_id', 'critico');


--
-- Name: pix_automatico_metas trg_log_pix_automatico_metas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_pix_automatico_metas" AFTER INSERT OR DELETE OR UPDATE ON "public"."pix_automatico_metas" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('financeiro', 'pix_meta', 'a meta de Pix', '', '', 'empresa_id', 'aviso');


--
-- Name: relatorio_validacoes_dia trg_log_relatorio_validacoes_dia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_relatorio_validacoes_dia" AFTER INSERT OR DELETE OR UPDATE ON "public"."relatorio_validacoes_dia" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('importacao', 'relatorio_dia', 'a validação do dia', '', '', 'empresa_id', 'info');


--
-- Name: setores trg_log_setores; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_setores" AFTER INSERT OR DELETE OR UPDATE ON "public"."setores" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'setor', 'o setor', 'nome', 'foto_url', 'empresa_id', 'info');


--
-- Name: solicitacoes_whatsapp trg_log_solicitacoes_whatsapp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_solicitacoes_whatsapp" AFTER INSERT OR DELETE OR UPDATE ON "public"."solicitacoes_whatsapp" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('whatsapp', 'solicitacao_wpp', 'a solicitação', 'codigo_cliente,nome_cliente', '', 'empresa_id', 'info');


--
-- Name: tags trg_log_tags; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_tags" AFTER INSERT OR DELETE OR UPDATE ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'tag', 'a tag', 'nome', '', 'empresa_id', 'info');


--
-- Name: termos_uso trg_log_termos_uso; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_log_termos_uso" AFTER INSERT OR DELETE OR UPDATE ON "public"."termos_uso" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_auditoria"('configuracao', 'termo_uso', 'o termo de uso', '', '', 'empresa_id', 'aviso');


--
-- Name: solicitacoes_whatsapp_mensagens trg_marcar_cpf_mensagem; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_marcar_cpf_mensagem" BEFORE INSERT OR UPDATE OF "conteudo" ON "public"."solicitacoes_whatsapp_mensagens" FOR EACH ROW EXECUTE FUNCTION "public"."fn_marcar_cpf_mensagem"();


--
-- Name: nr_registros trg_nr_registros_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_nr_registros_updated_at" BEFORE UPDATE ON "public"."nr_registros" FOR EACH ROW EXECUTE FUNCTION "public"."set_nr_registros_updated_at"();


--
-- Name: ouvidoria_atendimentos trg_ouvidoria_atend_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_ouvidoria_atend_updated" BEFORE UPDATE ON "public"."ouvidoria_atendimentos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_cargos"();


--
-- Name: perfis trg_perfis_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_perfis_updated" BEFORE UPDATE ON "public"."perfis" FOR EACH ROW EXECUTE FUNCTION "public"."fn_atualizar_timestamp"();


--
-- Name: pix_automatico_acordos trg_pix_a_impede_pago; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_a_impede_pago" BEFORE DELETE ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_impede_excluir_pago"();


--
-- Name: pix_automatico_acordos trg_pix_auto_congela_operador; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_auto_congela_operador" BEFORE UPDATE ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_congela_campos_do_operador"();


--
-- Name: pix_automatico_metas trg_pix_auto_metas_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_auto_metas_updated" BEFORE UPDATE ON "public"."pix_automatico_metas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_cargos"();


--
-- Name: pix_automatico_acordos trg_pix_auto_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_auto_updated" BEFORE UPDATE ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_cargos"();


--
-- Name: pix_automatico_acordos trg_pix_b_registra_exclusao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_b_registra_exclusao" BEFORE DELETE ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_registrar_exclusao"();


--
-- Name: pix_automatico_acordos trg_pix_log_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_log_insert" AFTER INSERT ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_log_insert"();


--
-- Name: pix_automatico_acordos trg_pix_log_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_log_update" AFTER UPDATE ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_log_update"();


--
-- Name: pix_automatico_metas trg_pix_meta_equipe_do_setor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_meta_equipe_do_setor" BEFORE INSERT OR UPDATE ON "public"."pix_automatico_metas" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_meta_equipe_do_setor"();


--
-- Name: pix_automatico_acordos trg_pix_notifica_desaprovacao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_notifica_desaprovacao" AFTER UPDATE OF "status" ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_notifica_desaprovacao"();


--
-- Name: pix_automatico_acordos trg_pix_nr_apos_troca; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_nr_apos_troca" AFTER UPDATE OF "nr_cliente" ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_nr_apos_troca"();


--
-- Name: pix_automatico_acordos trg_pix_nr_bloqueia; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_nr_bloqueia" BEFORE INSERT ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_nr_bloqueia_duplicado"();


--
-- Name: pix_automatico_acordos trg_pix_nr_bloqueia_troca; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_nr_bloqueia_troca" BEFORE UPDATE OF "nr_cliente" ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_nr_bloqueia_troca"();


--
-- Name: pix_automatico_acordos trg_pix_nr_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_nr_delete" AFTER DELETE ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_nr_apos_delete"();


--
-- Name: pix_automatico_acordos trg_pix_nr_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_nr_insert" AFTER INSERT ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_nr_apos_insert"();


--
-- Name: pix_automatico_acordos trg_pix_nr_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_nr_update" AFTER UPDATE OF "status" ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_nr_apos_update"();


--
-- Name: pix_automatico_acordos trg_pix_valida_pagamento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_pix_valida_pagamento" BEFORE UPDATE ON "public"."pix_automatico_acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_pix_valida_pagamento"();


--
-- Name: acordos trg_set_pago_em; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_pago_em" BEFORE UPDATE ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_pago_em"();


--
-- Name: acordos trg_setor_acordo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_setor_acordo" BEFORE INSERT ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_setor_acordo"();


--
-- Name: solicitacoes_whatsapp trg_solicitacao_recusa_cpf; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_solicitacao_recusa_cpf" BEFORE INSERT OR UPDATE OF "codigo_cliente", "mensagem" ON "public"."solicitacoes_whatsapp" FOR EACH ROW EXECUTE FUNCTION "public"."fn_solicitacao_recusa_cpf"();


--
-- Name: acordos trg_sync_nr_registros; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_sync_nr_registros" AFTER INSERT OR DELETE OR UPDATE ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_nr_registros"();


--
-- Name: acordos trg_validar_empresa_dos_perfis_do_acordo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_validar_empresa_dos_perfis_do_acordo" BEFORE INSERT OR UPDATE OF "operador_id", "vinculo_operador_id", "empresa_id" ON "public"."acordos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_validar_empresa_dos_perfis_do_acordo"();


--
-- Name: solicitacoes_whatsapp trg_wpp_carimbos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_wpp_carimbos" BEFORE UPDATE ON "public"."solicitacoes_whatsapp" FOR EACH ROW EXECUTE FUNCTION "public"."fn_wpp_carimbos"();


--
-- Name: solicitacoes_whatsapp trg_wpp_limite_pendentes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_wpp_limite_pendentes" BEFORE INSERT ON "public"."solicitacoes_whatsapp" FOR EACH ROW EXECUTE FUNCTION "public"."fn_wpp_limite_pendentes"();


--
-- Name: solicitacoes_whatsapp trg_wpp_limpa_nao_concluido; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_wpp_limpa_nao_concluido" BEFORE UPDATE OF "status" ON "public"."solicitacoes_whatsapp" FOR EACH ROW EXECUTE FUNCTION "public"."fn_wpp_limpa_nao_concluido"();


--
-- Name: solicitacoes_whatsapp trg_wpp_notificar_exclusao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_wpp_notificar_exclusao" BEFORE DELETE ON "public"."solicitacoes_whatsapp" FOR EACH ROW EXECUTE FUNCTION "public"."fn_wpp_notificar_exclusao"();


--
-- Name: solicitacoes_whatsapp_mensagens trg_wpp_notificar_mensagem; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_wpp_notificar_mensagem" AFTER INSERT ON "public"."solicitacoes_whatsapp_mensagens" FOR EACH ROW EXECUTE FUNCTION "public"."fn_wpp_notificar_mensagem"();


--
-- Name: solicitacoes_whatsapp trg_wpp_registrar_evento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_wpp_registrar_evento" AFTER INSERT OR UPDATE ON "public"."solicitacoes_whatsapp" FOR EACH ROW EXECUTE FUNCTION "public"."fn_wpp_registrar_evento"();


--
-- Name: aceites_termo aceites_termo_termo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."aceites_termo"
    ADD CONSTRAINT "aceites_termo_termo_id_fkey" FOREIGN KEY ("termo_id") REFERENCES "public"."termos_uso"("id") ON DELETE CASCADE;


--
-- Name: aceites_termo aceites_termo_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."aceites_termo"
    ADD CONSTRAINT "aceites_termo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: acordos acordos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."acordos"
    ADD CONSTRAINT "acordos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");


--
-- Name: acordos acordos_operador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."acordos"
    ADD CONSTRAINT "acordos_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."perfis"("id") ON DELETE RESTRICT;


--
-- Name: acordos acordos_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."acordos"
    ADD CONSTRAINT "acordos_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: ai_config ai_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ai_config"
    ADD CONSTRAINT "ai_config_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");


--
-- Name: analitico_exclusoes_setor analitico_exclusoes_setor_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_exclusoes_setor"
    ADD CONSTRAINT "analitico_exclusoes_setor_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: analitico_exclusoes_setor analitico_exclusoes_setor_excluido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_exclusoes_setor"
    ADD CONSTRAINT "analitico_exclusoes_setor_excluido_por_fkey" FOREIGN KEY ("excluido_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: analitico_exclusoes_setor analitico_exclusoes_setor_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_exclusoes_setor"
    ADD CONSTRAINT "analitico_exclusoes_setor_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE CASCADE;


--
-- Name: analitico_exclusoes_setor analitico_exclusoes_setor_setor_origem_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_exclusoes_setor"
    ADD CONSTRAINT "analitico_exclusoes_setor_setor_origem_id_fkey" FOREIGN KEY ("setor_origem_id") REFERENCES "public"."setores"("id") ON DELETE CASCADE;


--
-- Name: analitico_recebimentos analitico_recebimentos_acordo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_recebimentos"
    ADD CONSTRAINT "analitico_recebimentos_acordo_id_fkey" FOREIGN KEY ("acordo_id") REFERENCES "public"."acordos"("id") ON DELETE SET NULL;


--
-- Name: analitico_recebimentos analitico_recebimentos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_recebimentos"
    ADD CONSTRAINT "analitico_recebimentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: analitico_recebimentos analitico_recebimentos_importado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_recebimentos"
    ADD CONSTRAINT "analitico_recebimentos_importado_por_id_fkey" FOREIGN KEY ("importado_por_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: analitico_recebimentos analitico_recebimentos_operador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_recebimentos"
    ADD CONSTRAINT "analitico_recebimentos_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: analitico_recebimentos analitico_recebimentos_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_recebimentos"
    ADD CONSTRAINT "analitico_recebimentos_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: analitico_resumo_mensal analitico_resumo_mensal_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."analitico_resumo_mensal"
    ADD CONSTRAINT "analitico_resumo_mensal_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: api_rate_limits api_rate_limits_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."api_rate_limits"
    ADD CONSTRAINT "api_rate_limits_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: atendimento_responsaveis atendimento_responsaveis_definido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."atendimento_responsaveis"
    ADD CONSTRAINT "atendimento_responsaveis_definido_por_fkey" FOREIGN KEY ("definido_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: atendimento_responsaveis atendimento_responsaveis_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."atendimento_responsaveis"
    ADD CONSTRAINT "atendimento_responsaveis_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: atendimento_responsaveis atendimento_responsaveis_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."atendimento_responsaveis"
    ADD CONSTRAINT "atendimento_responsaveis_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: campanha_facil_descontos campanha_facil_descontos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."campanha_facil_descontos"
    ADD CONSTRAINT "campanha_facil_descontos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: campanha_facil_mensagens campanha_facil_mensagens_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."campanha_facil_mensagens"
    ADD CONSTRAINT "campanha_facil_mensagens_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: campanha_facil_mensagens_ocultas campanha_facil_mensagens_ocultas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."campanha_facil_mensagens_ocultas"
    ADD CONSTRAINT "campanha_facil_mensagens_ocultas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: cargos_permissoes cargos_permissoes_2026_04_16_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cargos_permissoes"
    ADD CONSTRAINT "cargos_permissoes_2026_04_16_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: comemoracao_homenageados comemoracao_homenageados_comemoracao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_homenageados"
    ADD CONSTRAINT "comemoracao_homenageados_comemoracao_id_fkey" FOREIGN KEY ("comemoracao_id") REFERENCES "public"."comemoracoes"("id") ON DELETE CASCADE;


--
-- Name: comemoracao_homenageados comemoracao_homenageados_operador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_homenageados"
    ADD CONSTRAINT "comemoracao_homenageados_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: comemoracao_midias comemoracao_midias_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_midias"
    ADD CONSTRAINT "comemoracao_midias_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: comemoracao_midias comemoracao_midias_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_midias"
    ADD CONSTRAINT "comemoracao_midias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: comemoracao_parabens comemoracao_parabens_comemoracao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_parabens"
    ADD CONSTRAINT "comemoracao_parabens_comemoracao_id_fkey" FOREIGN KEY ("comemoracao_id") REFERENCES "public"."comemoracoes"("id") ON DELETE CASCADE;


--
-- Name: comemoracao_parabens comemoracao_parabens_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracao_parabens"
    ADD CONSTRAINT "comemoracao_parabens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: comemoracoes comemoracoes_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracoes"
    ADD CONSTRAINT "comemoracoes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: comemoracoes comemoracoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracoes"
    ADD CONSTRAINT "comemoracoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: comemoracoes comemoracoes_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracoes"
    ADD CONSTRAINT "comemoracoes_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE SET NULL;


--
-- Name: comemoracoes comemoracoes_gif_midia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracoes"
    ADD CONSTRAINT "comemoracoes_gif_midia_id_fkey" FOREIGN KEY ("gif_midia_id") REFERENCES "public"."comemoracao_midias"("id") ON DELETE SET NULL;


--
-- Name: comemoracoes comemoracoes_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracoes"
    ADD CONSTRAINT "comemoracoes_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: comemoracoes comemoracoes_som_midia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comemoracoes"
    ADD CONSTRAINT "comemoracoes_som_midia_id_fkey" FOREIGN KEY ("som_midia_id") REFERENCES "public"."comemoracao_midias"("id") ON DELETE SET NULL;


--
-- Name: composicao_mes composicao_mes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."composicao_mes"
    ADD CONSTRAINT "composicao_mes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: composicao_mes_equipe composicao_mes_equipe_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."composicao_mes_equipe"
    ADD CONSTRAINT "composicao_mes_equipe_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: contribuicao_receptivo contribuicao_receptivo_atualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contribuicao_receptivo"
    ADD CONSTRAINT "contribuicao_receptivo_atualizado_por_fkey" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: contribuicao_receptivo contribuicao_receptivo_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contribuicao_receptivo"
    ADD CONSTRAINT "contribuicao_receptivo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: contribuicao_receptivo contribuicao_receptivo_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."contribuicao_receptivo"
    ADD CONSTRAINT "contribuicao_receptivo_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE CASCADE;


--
-- Name: diario_recebimentos diario_recebimentos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."diario_recebimentos"
    ADD CONSTRAINT "diario_recebimentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: diario_recebimentos diario_recebimentos_importado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."diario_recebimentos"
    ADD CONSTRAINT "diario_recebimentos_importado_por_id_fkey" FOREIGN KEY ("importado_por_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: diario_recebimentos diario_recebimentos_operador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."diario_recebimentos"
    ADD CONSTRAINT "diario_recebimentos_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: diario_recebimentos diario_recebimentos_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."diario_recebimentos"
    ADD CONSTRAINT "diario_recebimentos_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: documentos_lgpd documentos_lgpd_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."documentos_lgpd"
    ADD CONSTRAINT "documentos_lgpd_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: equipe_lideres equipe_lideres_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_lideres"
    ADD CONSTRAINT "equipe_lideres_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: equipe_lideres equipe_lideres_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_lideres"
    ADD CONSTRAINT "equipe_lideres_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: equipe_lideres equipe_lideres_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_lideres"
    ADD CONSTRAINT "equipe_lideres_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;


--
-- Name: equipe_lideres equipe_lideres_lider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_lideres"
    ADD CONSTRAINT "equipe_lideres_lider_id_fkey" FOREIGN KEY ("lider_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: equipe_operadores_clones equipe_operadores_clones_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_operadores_clones"
    ADD CONSTRAINT "equipe_operadores_clones_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: equipe_operadores_clones equipe_operadores_clones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_operadores_clones"
    ADD CONSTRAINT "equipe_operadores_clones_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: equipe_operadores_clones equipe_operadores_clones_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_operadores_clones"
    ADD CONSTRAINT "equipe_operadores_clones_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;


--
-- Name: equipe_operadores_clones equipe_operadores_clones_operador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipe_operadores_clones"
    ADD CONSTRAINT "equipe_operadores_clones_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: equipes equipes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipes"
    ADD CONSTRAINT "equipes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: equipes equipes_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."equipes"
    ADD CONSTRAINT "equipes_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE CASCADE;


--
-- Name: historico_acordos historico_acordos_acordo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."historico_acordos"
    ADD CONSTRAINT "historico_acordos_acordo_id_fkey" FOREIGN KEY ("acordo_id") REFERENCES "public"."acordos"("id") ON DELETE CASCADE;


--
-- Name: historico_acordos historico_acordos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."historico_acordos"
    ADD CONSTRAINT "historico_acordos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE RESTRICT;


--
-- Name: lixeira_pix_automatico lixeira_pix_automatico_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."lixeira_pix_automatico"
    ADD CONSTRAINT "lixeira_pix_automatico_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: logs_sistema logs_sistema_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."logs_sistema"
    ADD CONSTRAINT "logs_sistema_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");


--
-- Name: logs_sistema logs_sistema_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."logs_sistema"
    ADD CONSTRAINT "logs_sistema_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: logs_whatsapp logs_whatsapp_acordo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."logs_whatsapp"
    ADD CONSTRAINT "logs_whatsapp_acordo_id_fkey" FOREIGN KEY ("acordo_id") REFERENCES "public"."acordos"("id") ON DELETE CASCADE;


--
-- Name: logs_whatsapp logs_whatsapp_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."logs_whatsapp"
    ADD CONSTRAINT "logs_whatsapp_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE RESTRICT;


--
-- Name: metas_config_mes metas_config_mes_atualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_config_mes"
    ADD CONSTRAINT "metas_config_mes_atualizado_por_fkey" FOREIGN KEY ("atualizado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: metas_config_mes metas_config_mes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_config_mes"
    ADD CONSTRAINT "metas_config_mes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: metas metas_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas"
    ADD CONSTRAINT "metas_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: metas metas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas"
    ADD CONSTRAINT "metas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: metas_validacoes metas_validacoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_validacoes"
    ADD CONSTRAINT "metas_validacoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: metas_validacoes metas_validacoes_reaberto_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_validacoes"
    ADD CONSTRAINT "metas_validacoes_reaberto_por_fkey" FOREIGN KEY ("reaberto_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: metas_validacoes metas_validacoes_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_validacoes"
    ADD CONSTRAINT "metas_validacoes_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE CASCADE;


--
-- Name: metas_validacoes metas_validacoes_validado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."metas_validacoes"
    ADD CONSTRAINT "metas_validacoes_validado_por_fkey" FOREIGN KEY ("validado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: modelos_mensagem modelos_mensagem_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."modelos_mensagem"
    ADD CONSTRAINT "modelos_mensagem_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");


--
-- Name: notificacoes notificacoes_acordo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_acordo_id_fkey" FOREIGN KEY ("acordo_id") REFERENCES "public"."acordos"("id") ON DELETE SET NULL;


--
-- Name: notificacoes notificacoes_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: notificacoes notificacoes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");


--
-- Name: notificacoes notificacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notificacoes"
    ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: ouvidoria_acessos ouvidoria_acessos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ouvidoria_acessos"
    ADD CONSTRAINT "ouvidoria_acessos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: ouvidoria_acessos ouvidoria_acessos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ouvidoria_acessos"
    ADD CONSTRAINT "ouvidoria_acessos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: ouvidoria_atendimentos ouvidoria_atendimentos_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ouvidoria_atendimentos"
    ADD CONSTRAINT "ouvidoria_atendimentos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: ouvidoria_atendimentos ouvidoria_atendimentos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ouvidoria_atendimentos"
    ADD CONSTRAINT "ouvidoria_atendimentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: perfis perfis_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");


--
-- Name: perfis perfis_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE SET NULL;


--
-- Name: perfis perfis_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: perfis perfis_lider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_lider_id_fkey" FOREIGN KEY ("lider_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: perfis perfis_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: perfis_transferencias perfis_transferencias_criado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: perfis_transferencias perfis_transferencias_desfeita_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_desfeita_por_fkey" FOREIGN KEY ("desfeita_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: perfis_transferencias perfis_transferencias_destino_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_destino_empresa_id_fkey" FOREIGN KEY ("destino_empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: perfis_transferencias perfis_transferencias_destino_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_destino_setor_id_fkey" FOREIGN KEY ("destino_setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: perfis_transferencias perfis_transferencias_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: perfis_transferencias perfis_transferencias_fantasma_removido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_fantasma_removido_por_fkey" FOREIGN KEY ("fantasma_removido_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: perfis_transferencias perfis_transferencias_origem_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_origem_equipe_id_fkey" FOREIGN KEY ("origem_equipe_id") REFERENCES "public"."equipes"("id") ON DELETE SET NULL;


--
-- Name: perfis_transferencias perfis_transferencias_origem_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_origem_setor_id_fkey" FOREIGN KEY ("origem_setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: perfis_transferencias perfis_transferencias_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."perfis_transferencias"
    ADD CONSTRAINT "perfis_transferencias_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: pet_estado pet_estado_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_estado"
    ADD CONSTRAINT "pet_estado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: pet_inventario pet_inventario_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_inventario"
    ADD CONSTRAINT "pet_inventario_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."pet_itens"("id") ON DELETE CASCADE;


--
-- Name: pet_inventario pet_inventario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_inventario"
    ADD CONSTRAINT "pet_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: pet_nome_votos pet_nome_votos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_nome_votos"
    ADD CONSTRAINT "pet_nome_votos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE SET NULL;


--
-- Name: pet_nome_votos pet_nome_votos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_nome_votos"
    ADD CONSTRAINT "pet_nome_votos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: pet_recompensas pet_recompensas_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_recompensas"
    ADD CONSTRAINT "pet_recompensas_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: pet_recompensas pet_recompensas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pet_recompensas"
    ADD CONSTRAINT "pet_recompensas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_acordos pix_automatico_acordos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_acordos"
    ADD CONSTRAINT "pix_automatico_acordos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_acordos pix_automatico_acordos_operador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_acordos"
    ADD CONSTRAINT "pix_automatico_acordos_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_acordos pix_automatico_acordos_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_acordos"
    ADD CONSTRAINT "pix_automatico_acordos_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: pix_automatico_config pix_automatico_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_config"
    ADD CONSTRAINT "pix_automatico_config_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_config pix_automatico_config_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_config"
    ADD CONSTRAINT "pix_automatico_config_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_log pix_automatico_log_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_log"
    ADD CONSTRAINT "pix_automatico_log_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_metas pix_automatico_metas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_metas"
    ADD CONSTRAINT "pix_automatico_metas_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_metas pix_automatico_metas_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_metas"
    ADD CONSTRAINT "pix_automatico_metas_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_metas pix_automatico_metas_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_metas"
    ADD CONSTRAINT "pix_automatico_metas_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE CASCADE;


--
-- Name: pix_automatico_nr_registro pix_automatico_nr_registro_acordo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_nr_registro"
    ADD CONSTRAINT "pix_automatico_nr_registro_acordo_id_fkey" FOREIGN KEY ("acordo_id") REFERENCES "public"."pix_automatico_acordos"("id") ON DELETE SET NULL;


--
-- Name: pix_automatico_nr_registro pix_automatico_nr_registro_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pix_automatico_nr_registro"
    ADD CONSTRAINT "pix_automatico_nr_registro_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: profissionais profissionais_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profissionais"
    ADD CONSTRAINT "profissionais_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: relatorio_validacoes_dia relatorio_validacoes_dia_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."relatorio_validacoes_dia"
    ADD CONSTRAINT "relatorio_validacoes_dia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: relatorio_validacoes_dia relatorio_validacoes_dia_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."relatorio_validacoes_dia"
    ADD CONSTRAINT "relatorio_validacoes_dia_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE CASCADE;


--
-- Name: relatorio_validacoes_dia relatorio_validacoes_dia_validado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."relatorio_validacoes_dia"
    ADD CONSTRAINT "relatorio_validacoes_dia_validado_por_fkey" FOREIGN KEY ("validado_por") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: setores setores_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."setores"
    ADD CONSTRAINT "setores_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id");


--
-- Name: solicitacoes_whatsapp solicitacoes_whatsapp_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp"
    ADD CONSTRAINT "solicitacoes_whatsapp_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp solicitacoes_whatsapp_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp"
    ADD CONSTRAINT "solicitacoes_whatsapp_equipe_id_fkey" FOREIGN KEY ("equipe_id") REFERENCES "public"."equipes"("id") ON DELETE SET NULL;


--
-- Name: solicitacoes_whatsapp_eventos solicitacoes_whatsapp_eventos_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_eventos"
    ADD CONSTRAINT "solicitacoes_whatsapp_eventos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: solicitacoes_whatsapp_eventos solicitacoes_whatsapp_eventos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_eventos"
    ADD CONSTRAINT "solicitacoes_whatsapp_eventos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp_eventos solicitacoes_whatsapp_eventos_responsavel_anterior_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_eventos"
    ADD CONSTRAINT "solicitacoes_whatsapp_eventos_responsavel_anterior_fkey" FOREIGN KEY ("responsavel_anterior") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: solicitacoes_whatsapp_eventos solicitacoes_whatsapp_eventos_responsavel_novo_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_eventos"
    ADD CONSTRAINT "solicitacoes_whatsapp_eventos_responsavel_novo_fkey" FOREIGN KEY ("responsavel_novo") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: solicitacoes_whatsapp_eventos solicitacoes_whatsapp_eventos_solicitacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_eventos"
    ADD CONSTRAINT "solicitacoes_whatsapp_eventos_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."solicitacoes_whatsapp"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp_leitura solicitacoes_whatsapp_leitura_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_leitura"
    ADD CONSTRAINT "solicitacoes_whatsapp_leitura_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp_leitura solicitacoes_whatsapp_leitura_solicitacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_leitura"
    ADD CONSTRAINT "solicitacoes_whatsapp_leitura_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."solicitacoes_whatsapp"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp_leitura solicitacoes_whatsapp_leitura_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_leitura"
    ADD CONSTRAINT "solicitacoes_whatsapp_leitura_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp_mensagens solicitacoes_whatsapp_mensagens_autor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_mensagens"
    ADD CONSTRAINT "solicitacoes_whatsapp_mensagens_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp_mensagens solicitacoes_whatsapp_mensagens_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_mensagens"
    ADD CONSTRAINT "solicitacoes_whatsapp_mensagens_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp_mensagens solicitacoes_whatsapp_mensagens_solicitacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp_mensagens"
    ADD CONSTRAINT "solicitacoes_whatsapp_mensagens_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."solicitacoes_whatsapp"("id") ON DELETE CASCADE;


--
-- Name: solicitacoes_whatsapp solicitacoes_whatsapp_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp"
    ADD CONSTRAINT "solicitacoes_whatsapp_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "public"."perfis"("id") ON DELETE SET NULL;


--
-- Name: solicitacoes_whatsapp solicitacoes_whatsapp_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp"
    ADD CONSTRAINT "solicitacoes_whatsapp_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "public"."setores"("id") ON DELETE SET NULL;


--
-- Name: solicitacoes_whatsapp solicitacoes_whatsapp_solicitante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."solicitacoes_whatsapp"
    ADD CONSTRAINT "solicitacoes_whatsapp_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "public"."perfis"("id") ON DELETE CASCADE;


--
-- Name: tags tags_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: termos_uso termos_uso_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."termos_uso"
    ADD CONSTRAINT "termos_uso_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE CASCADE;


--
-- Name: perfis Admins podem atualizar qualquer perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins podem atualizar qualquer perfil" ON "public"."perfis" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "perfis_1"
  WHERE (("perfis_1"."id" = "auth"."uid"()) AND ("perfis_1"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis" "perfis_1"
  WHERE (("perfis_1"."id" = "auth"."uid"()) AND ("perfis_1"."perfil" = 'administrador'::"text")))));


--
-- Name: perfis Lideres podem atualizar perfis do setor; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lideres podem atualizar perfis do setor" ON "public"."perfis" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = 'lider'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = 'lider'::"text")))));


--
-- Name: profiles Service role gerencia todos perfis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role gerencia todos perfis" ON "public"."profiles" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: profiles Usuarios podem atualizar proprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem atualizar proprio perfil" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: profiles Usuarios podem inserir proprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem inserir proprio perfil" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: profiles Usuarios podem ver proprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios podem ver proprio perfil" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));


--
-- Name: aceites_termo aceites_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aceites_insert_own" ON "public"."aceites_termo" FOR INSERT WITH CHECK (("auth"."uid"() = "usuario_id"));


--
-- Name: aceites_termo aceites_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aceites_select_admin" ON "public"."aceites_termo" FOR SELECT USING ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"]));


--
-- Name: aceites_termo aceites_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aceites_select_own" ON "public"."aceites_termo" FOR SELECT USING (("auth"."uid"() = "usuario_id"));


--
-- Name: aceites_termo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."aceites_termo" ENABLE ROW LEVEL SECURITY;

--
-- Name: aceites_termo aceites_termo_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aceites_termo_super_admin_total" ON "public"."aceites_termo" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: acordos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."acordos" ENABLE ROW LEVEL SECURITY;

--
-- Name: acordos acordos_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acordos_delete_admin" ON "public"."acordos" FOR DELETE USING (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text"]) OR ("public"."fn_user_empresa_is_bookplay"() AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text"]) AND (("setor_id" = "public"."fn_user_setor_id"()) OR (("setor_id" IS NULL) AND ("public"."fn_operador_setor_id"("operador_id") = "public"."fn_user_setor_id"())) OR "public"."fn_operador_clonado_no_setor"("operador_id", "public"."fn_user_setor_id"()))) OR ((NOT "public"."fn_user_empresa_is_bookplay"()) AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text"]))))));


--
-- Name: acordos acordos_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acordos_delete_own" ON "public"."acordos" FOR DELETE USING ((("empresa_id" = "public"."fn_user_empresa_id"()) AND ("operador_id" = "auth"."uid"())));


--
-- Name: acordos acordos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acordos_insert" ON "public"."acordos" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND (("operador_id" = "auth"."uid"()) OR "public"."fn_user_is_super_admin"() OR ("public"."fn_user_empresa_is_bookplay"() AND ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'diretoria'::"text"]) OR ("public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text"]) AND (("setor_id" = "public"."fn_user_setor_id"()) OR (("setor_id" IS NULL) AND ("public"."fn_operador_setor_id"("operador_id") = "public"."fn_user_setor_id"())) OR "public"."fn_operador_clonado_no_setor"("operador_id", "public"."fn_user_setor_id"()))))) OR ((NOT "public"."fn_user_empresa_is_bookplay"()) AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'administrador'::"text"])))));


--
-- Name: acordos acordos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acordos_select" ON "public"."acordos" FOR SELECT USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (("operador_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR (( SELECT "public"."fn_user_empresa_is_bookplay"() AS "fn_user_empresa_is_bookplay") AND (( SELECT "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'diretoria'::"text"]) AS "fn_user_has_any_role") OR (( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text"]) AS "fn_user_has_any_role") AND (("setor_id" = ( SELECT "public"."fn_user_setor_id"() AS "fn_user_setor_id")) OR (("setor_id" IS NULL) AND ("public"."fn_operador_setor_id"("operador_id") = ( SELECT "public"."fn_user_setor_id"() AS "fn_user_setor_id"))) OR "public"."fn_operador_clonado_no_setor"("operador_id", ( SELECT "public"."fn_user_setor_id"() AS "fn_user_setor_id")))))) OR ((NOT ( SELECT "public"."fn_user_empresa_is_bookplay"() AS "fn_user_empresa_is_bookplay")) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'administrador'::"text"]) AS "fn_user_has_any_role")))));


--
-- Name: acordos acordos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acordos_super_admin_total" ON "public"."acordos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: acordos acordos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "acordos_update" ON "public"."acordos" FOR UPDATE USING (("public"."fn_can_access_empresa"("empresa_id") AND (("operador_id" = "auth"."uid"()) OR "public"."fn_user_is_super_admin"() OR ("public"."fn_user_empresa_is_bookplay"() AND ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'diretoria'::"text"]) OR ("public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text"]) AND (("setor_id" = "public"."fn_user_setor_id"()) OR (("setor_id" IS NULL) AND ("public"."fn_operador_setor_id"("operador_id") = "public"."fn_user_setor_id"())) OR "public"."fn_operador_clonado_no_setor"("operador_id", "public"."fn_user_setor_id"()))))) OR ((NOT "public"."fn_user_empresa_is_bookplay"()) AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'administrador'::"text"]))))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND (("operador_id" = "auth"."uid"()) OR "public"."fn_user_is_super_admin"() OR ("public"."fn_user_empresa_is_bookplay"() AND ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'diretoria'::"text"]) OR ("public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text"]) AND (("setor_id" = "public"."fn_user_setor_id"()) OR (("setor_id" IS NULL) AND ("public"."fn_operador_setor_id"("operador_id") = "public"."fn_user_setor_id"())) OR "public"."fn_operador_clonado_no_setor"("operador_id", "public"."fn_user_setor_id"()))))) OR ((NOT "public"."fn_user_empresa_is_bookplay"()) AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'administrador'::"text"])))));


--
-- Name: ai_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ai_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_config ai_config_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_config_admin_write" ON "public"."ai_config" USING (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"])))) WITH CHECK (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"]))));


--
-- Name: ai_config ai_config_select_auth; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_config_select_auth" ON "public"."ai_config" FOR SELECT USING (("public"."fn_can_access_empresa"("empresa_id") OR "public"."fn_user_is_super_admin"()));


--
-- Name: ai_config ai_config_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_config_super_admin_total" ON "public"."ai_config" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: analitico_recebimentos analitico_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_delete" ON "public"."analitico_recebimentos" FOR DELETE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: analitico_exclusoes_setor analitico_exclusoes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_exclusoes_delete" ON "public"."analitico_exclusoes_setor" FOR DELETE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: analitico_exclusoes_setor analitico_exclusoes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_exclusoes_insert" ON "public"."analitico_exclusoes_setor" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: analitico_exclusoes_setor analitico_exclusoes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_exclusoes_select" ON "public"."analitico_exclusoes_setor" FOR SELECT USING ((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))));


--
-- Name: analitico_exclusoes_setor; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."analitico_exclusoes_setor" ENABLE ROW LEVEL SECURITY;

--
-- Name: analitico_recebimentos analitico_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_insert" ON "public"."analitico_recebimentos" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: analitico_recebimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."analitico_recebimentos" ENABLE ROW LEVEL SECURITY;

--
-- Name: analitico_recebimentos analitico_recebimentos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_recebimentos_super_admin_total" ON "public"."analitico_recebimentos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: analitico_resumo_mensal; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."analitico_resumo_mensal" ENABLE ROW LEVEL SECURITY;

--
-- Name: analitico_resumo_mensal analitico_resumo_mensal_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_resumo_mensal_super_admin_total" ON "public"."analitico_resumo_mensal" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: analitico_recebimentos analitico_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_select" ON "public"."analitico_recebimentos" FOR SELECT USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ((("operador_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("operador_id" IS NOT NULL)) OR ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))));


--
-- Name: analitico_recebimentos analitico_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "analitico_update" ON "public"."analitico_recebimentos" FOR UPDATE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (("operador_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))));


--
-- Name: api_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."api_rate_limits" ENABLE ROW LEVEL SECURITY;

--
-- Name: analitico_resumo_mensal arm_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "arm_select" ON "public"."analitico_resumo_mensal" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: analitico_resumo_mensal arm_upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "arm_upsert" ON "public"."analitico_resumo_mensal" USING ("public"."fn_can_access_empresa"("empresa_id")) WITH CHECK ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: atendimento_responsaveis atend_resp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "atend_resp_delete" ON "public"."atendimento_responsaveis" FOR DELETE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: atendimento_responsaveis atend_resp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "atend_resp_insert" ON "public"."atendimento_responsaveis" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: atendimento_responsaveis atend_resp_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "atend_resp_select" ON "public"."atendimento_responsaveis" FOR SELECT USING ((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))));


--
-- Name: atendimento_responsaveis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."atendimento_responsaveis" ENABLE ROW LEVEL SECURITY;

--
-- Name: atendimento_responsaveis atendimento_responsaveis_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "atendimento_responsaveis_super_admin_total" ON "public"."atendimento_responsaveis" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: campanha_facil_descontos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."campanha_facil_descontos" ENABLE ROW LEVEL SECURITY;

--
-- Name: campanha_facil_descontos campanha_facil_descontos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campanha_facil_descontos_super_admin_total" ON "public"."campanha_facil_descontos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: campanha_facil_mensagens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."campanha_facil_mensagens" ENABLE ROW LEVEL SECURITY;

--
-- Name: campanha_facil_mensagens_ocultas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."campanha_facil_mensagens_ocultas" ENABLE ROW LEVEL SECURITY;

--
-- Name: campanha_facil_mensagens_ocultas campanha_facil_mensagens_ocultas_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campanha_facil_mensagens_ocultas_super_admin_total" ON "public"."campanha_facil_mensagens_ocultas" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: campanha_facil_mensagens campanha_facil_mensagens_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "campanha_facil_mensagens_super_admin_total" ON "public"."campanha_facil_mensagens" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: cargos_permissoes cargos_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cargos_admin_write" ON "public"."cargos_permissoes" USING (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE (("perfis"."id" = "auth"."uid"()) AND ("perfis"."perfil" = ANY (ARRAY['administrador'::"text", 'super_admin'::"text"]))))));


--
-- Name: cargos_permissoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cargos_permissoes" ENABLE ROW LEVEL SECURITY;

--
-- Name: cargos_permissoes cargos_permissoes_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cargos_permissoes_super_admin_total" ON "public"."cargos_permissoes" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: cargos_permissoes cargos_select_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cargos_select_empresa" ON "public"."cargos_permissoes" FOR SELECT USING (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: campanha_facil_descontos cf_descontos_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_descontos_delete" ON "public"."campanha_facil_descontos" FOR DELETE USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_descontos cf_descontos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_descontos_insert" ON "public"."campanha_facil_descontos" FOR INSERT WITH CHECK ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_descontos cf_descontos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_descontos_select" ON "public"."campanha_facil_descontos" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_descontos cf_descontos_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_descontos_update" ON "public"."campanha_facil_descontos" FOR UPDATE USING ("public"."fn_can_access_empresa"("empresa_id")) WITH CHECK ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_mensagens cf_mensagens_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_mensagens_delete" ON "public"."campanha_facil_mensagens" FOR DELETE USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_mensagens cf_mensagens_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_mensagens_insert" ON "public"."campanha_facil_mensagens" FOR INSERT WITH CHECK ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_mensagens cf_mensagens_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_mensagens_select" ON "public"."campanha_facil_mensagens" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_mensagens cf_mensagens_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_mensagens_update" ON "public"."campanha_facil_mensagens" FOR UPDATE USING ("public"."fn_can_access_empresa"("empresa_id")) WITH CHECK ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_mensagens_ocultas cf_ocultas_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_ocultas_delete" ON "public"."campanha_facil_mensagens_ocultas" FOR DELETE USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_mensagens_ocultas cf_ocultas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_ocultas_insert" ON "public"."campanha_facil_mensagens_ocultas" FOR INSERT WITH CHECK ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: campanha_facil_mensagens_ocultas cf_ocultas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cf_ocultas_select" ON "public"."campanha_facil_mensagens_ocultas" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: equipe_operadores_clones clones_select_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clones_select_empresa" ON "public"."equipe_operadores_clones" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: equipe_operadores_clones clones_write_gestao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clones_write_gestao" ON "public"."equipe_operadores_clones" USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: comemoracao_homenageados; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."comemoracao_homenageados" ENABLE ROW LEVEL SECURITY;

--
-- Name: comemoracao_homenageados comemoracao_homenageados_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_homenageados_delete" ON "public"."comemoracao_homenageados" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."comemoracoes" "c"
  WHERE (("c"."id" = "comemoracao_homenageados"."comemoracao_id") AND ("c"."criado_por" = ( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: comemoracao_homenageados comemoracao_homenageados_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_homenageados_insert" ON "public"."comemoracao_homenageados" FOR INSERT WITH CHECK ((( SELECT "public"."fn_comemoracao_pode_criar"() AS "fn_comemoracao_pode_criar") AND (EXISTS ( SELECT 1
   FROM "public"."comemoracoes" "c"
  WHERE (("c"."id" = "comemoracao_homenageados"."comemoracao_id") AND ("c"."criado_por" = ( SELECT "auth"."uid"() AS "uid")))))));


--
-- Name: comemoracao_homenageados comemoracao_homenageados_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_homenageados_select" ON "public"."comemoracao_homenageados" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."comemoracoes" "c"
  WHERE ("c"."id" = "comemoracao_homenageados"."comemoracao_id"))));


--
-- Name: comemoracao_homenageados comemoracao_homenageados_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_homenageados_super_admin_total" ON "public"."comemoracao_homenageados" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: comemoracao_midias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."comemoracao_midias" ENABLE ROW LEVEL SECURITY;

--
-- Name: comemoracao_midias comemoracao_midias_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_midias_delete" ON "public"."comemoracao_midias" FOR DELETE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (("criado_por" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."fn_user_has_any_role"(ARRAY['diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))));


--
-- Name: comemoracao_midias comemoracao_midias_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_midias_insert" ON "public"."comemoracao_midias" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("criado_por" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."fn_comemoracao_pode_criar"() AS "fn_comemoracao_pode_criar")));


--
-- Name: comemoracao_midias comemoracao_midias_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_midias_select" ON "public"."comemoracao_midias" FOR SELECT USING ((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))));


--
-- Name: comemoracao_midias comemoracao_midias_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_midias_super_admin_total" ON "public"."comemoracao_midias" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: comemoracao_parabens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."comemoracao_parabens" ENABLE ROW LEVEL SECURITY;

--
-- Name: comemoracao_parabens comemoracao_parabens_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_parabens_insert" ON "public"."comemoracao_parabens" FOR INSERT WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."comemoracoes" "c"
  WHERE ("c"."id" = "comemoracao_parabens"."comemoracao_id")))));


--
-- Name: comemoracao_parabens comemoracao_parabens_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_parabens_select" ON "public"."comemoracao_parabens" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."comemoracoes" "c"
  WHERE ("c"."id" = "comemoracao_parabens"."comemoracao_id"))));


--
-- Name: comemoracao_parabens comemoracao_parabens_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracao_parabens_super_admin_total" ON "public"."comemoracao_parabens" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: comemoracoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."comemoracoes" ENABLE ROW LEVEL SECURITY;

--
-- Name: comemoracoes comemoracoes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracoes_delete" ON "public"."comemoracoes" FOR DELETE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (("criado_por" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."fn_user_has_any_role"(ARRAY['diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))));


--
-- Name: comemoracoes comemoracoes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracoes_insert" ON "public"."comemoracoes" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("criado_por" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."fn_comemoracao_pode_criar"() AS "fn_comemoracao_pode_criar")));


--
-- Name: comemoracoes comemoracoes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracoes_select" ON "public"."comemoracoes" FOR SELECT USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("empresa_inteira" OR ("criado_por" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."fn_comemoracao_pode_criar"() AS "fn_comemoracao_pode_criar") OR (( SELECT "p"."setor_id"
   FROM "public"."perfis" "p"
  WHERE ("p"."id" = ( SELECT "auth"."uid"() AS "uid"))) = ANY ("setores_alvo")))));


--
-- Name: comemoracoes comemoracoes_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracoes_super_admin_total" ON "public"."comemoracoes" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: comemoracoes comemoracoes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "comemoracoes_update" ON "public"."comemoracoes" FOR UPDATE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (("criado_por" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."fn_user_has_any_role"(ARRAY['diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))));


--
-- Name: composicao_mes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."composicao_mes" ENABLE ROW LEVEL SECURITY;

--
-- Name: composicao_mes_equipe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."composicao_mes_equipe" ENABLE ROW LEVEL SECURITY;

--
-- Name: composicao_mes_equipe composicao_mes_equipe_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "composicao_mes_equipe_leitura" ON "public"."composicao_mes_equipe" FOR SELECT TO "authenticated" USING (("empresa_id" = ( SELECT "p"."empresa_id"
   FROM "public"."perfis" "p"
  WHERE ("p"."id" = "auth"."uid"()))));


--
-- Name: composicao_mes_equipe composicao_mes_equipe_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "composicao_mes_equipe_super_admin_total" ON "public"."composicao_mes_equipe" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: composicao_mes composicao_mes_leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "composicao_mes_leitura" ON "public"."composicao_mes" FOR SELECT TO "authenticated" USING (("empresa_id" = ( SELECT "p"."empresa_id"
   FROM "public"."perfis" "p"
  WHERE ("p"."id" = "auth"."uid"()))));


--
-- Name: composicao_mes composicao_mes_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "composicao_mes_super_admin_total" ON "public"."composicao_mes" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: contribuicao_receptivo contrib_receptivo_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contrib_receptivo_delete" ON "public"."contribuicao_receptivo" FOR DELETE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: contribuicao_receptivo contrib_receptivo_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contrib_receptivo_insert" ON "public"."contribuicao_receptivo" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: contribuicao_receptivo contrib_receptivo_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contrib_receptivo_select" ON "public"."contribuicao_receptivo" FOR SELECT USING ((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))));


--
-- Name: contribuicao_receptivo contrib_receptivo_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contrib_receptivo_update" ON "public"."contribuicao_receptivo" FOR UPDATE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))) WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: contribuicao_receptivo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."contribuicao_receptivo" ENABLE ROW LEVEL SECURITY;

--
-- Name: contribuicao_receptivo contribuicao_receptivo_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contribuicao_receptivo_super_admin_total" ON "public"."contribuicao_receptivo" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: diario_recebimentos diario_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "diario_delete" ON "public"."diario_recebimentos" FOR DELETE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: diario_recebimentos diario_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "diario_insert" ON "public"."diario_recebimentos" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: diario_recebimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."diario_recebimentos" ENABLE ROW LEVEL SECURITY;

--
-- Name: diario_recebimentos diario_recebimentos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "diario_recebimentos_super_admin_total" ON "public"."diario_recebimentos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: diario_recebimentos diario_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "diario_select" ON "public"."diario_recebimentos" FOR SELECT USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ((("operador_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("operador_id" IS NOT NULL)) OR ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))));


--
-- Name: diario_recebimentos diario_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "diario_update" ON "public"."diario_recebimentos" FOR UPDATE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (("operador_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))));


--
-- Name: direto_extra_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."direto_extra_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: direto_extra_config direto_extra_config_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "direto_extra_config_delete" ON "public"."direto_extra_config" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = ANY (ARRAY['lider'::"text", 'administrador'::"text", 'super_admin'::"text", 'gerencia'::"text"]))))));


--
-- Name: direto_extra_config direto_extra_config_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "direto_extra_config_insert" ON "public"."direto_extra_config" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = ANY (ARRAY['lider'::"text", 'administrador'::"text", 'super_admin'::"text", 'gerencia'::"text"]))))));


--
-- Name: direto_extra_config direto_extra_config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "direto_extra_config_select" ON "public"."direto_extra_config" FOR SELECT TO "authenticated" USING (true);


--
-- Name: direto_extra_config direto_extra_config_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "direto_extra_config_super_admin_total" ON "public"."direto_extra_config" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: direto_extra_config direto_extra_config_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "direto_extra_config_update" ON "public"."direto_extra_config" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfis" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = ANY (ARRAY['lider'::"text", 'administrador'::"text", 'super_admin'::"text", 'gerencia'::"text"])))))) WITH CHECK (true);


--
-- Name: documentos_lgpd doc_lgpd_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "doc_lgpd_insert" ON "public"."documentos_lgpd" FOR INSERT WITH CHECK ((("empresa_id" IS NOT NULL) AND "public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"])));


--
-- Name: documentos_lgpd doc_lgpd_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "doc_lgpd_select" ON "public"."documentos_lgpd" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"]) AND (("empresa_id" IS NULL) OR "public"."fn_can_access_empresa"("empresa_id"))));


--
-- Name: documentos_lgpd doc_lgpd_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "doc_lgpd_update" ON "public"."documentos_lgpd" FOR UPDATE USING ((("empresa_id" IS NOT NULL) AND "public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"]))) WITH CHECK ((("empresa_id" IS NOT NULL) AND "public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"])));


--
-- Name: documentos_lgpd; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."documentos_lgpd" ENABLE ROW LEVEL SECURITY;

--
-- Name: documentos_lgpd documentos_lgpd_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "documentos_lgpd_super_admin_total" ON "public"."documentos_lgpd" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: empresas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."empresas" ENABLE ROW LEVEL SECURITY;

--
-- Name: empresas empresas_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "empresas_admin" ON "public"."empresas" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: empresas empresas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "empresas_select" ON "public"."empresas" FOR SELECT USING (("ativo" = true));


--
-- Name: empresas empresas_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "empresas_super_admin_total" ON "public"."empresas" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: equipe_lideres; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."equipe_lideres" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipe_lideres equipe_lideres_select_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipe_lideres_select_empresa" ON "public"."equipe_lideres" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: equipe_lideres equipe_lideres_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipe_lideres_super_admin_total" ON "public"."equipe_lideres" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: equipe_lideres equipe_lideres_write_gestao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipe_lideres_write_gestao" ON "public"."equipe_lideres" USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: equipe_operadores_clones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."equipe_operadores_clones" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipe_operadores_clones equipe_operadores_clones_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipe_operadores_clones_super_admin_total" ON "public"."equipe_operadores_clones" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: equipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."equipes" ENABLE ROW LEVEL SECURITY;

--
-- Name: equipes equipes_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipes_delete_admin" ON "public"."equipes" FOR DELETE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"])));


--
-- Name: equipes equipes_insert_admin_lider; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipes_insert_admin_lider" ON "public"."equipes" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'lider'::"text", 'elite'::"text", 'gerencia'::"text", 'super_admin'::"text"])));


--
-- Name: equipes equipes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipes_select" ON "public"."equipes" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: equipes equipes_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipes_super_admin_total" ON "public"."equipes" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: equipes equipes_update_admin_lider; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "equipes_update_admin_lider" ON "public"."equipes" FOR UPDATE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'lider'::"text", 'elite'::"text", 'gerencia'::"text", 'super_admin'::"text"])));


--
-- Name: historico_acordos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."historico_acordos" ENABLE ROW LEVEL SECURITY;

--
-- Name: historico_acordos historico_acordos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "historico_acordos_super_admin_total" ON "public"."historico_acordos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: historico_acordos historico_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "historico_insert" ON "public"."historico_acordos" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND (("usuario_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: historico_acordos historico_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "historico_select" ON "public"."historico_acordos" FOR SELECT USING (("public"."fn_user_is_super_admin"() OR ("public"."fn_can_access_empresa"("empresa_id") AND (("usuario_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text"])))));


--
-- Name: lixeira_acordos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lixeira_acordos" ENABLE ROW LEVEL SECURITY;

--
-- Name: lixeira_acordos lixeira_acordos_select_empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_acordos_select_empresa" ON "public"."lixeira_acordos" FOR SELECT USING (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: lixeira_acordos lixeira_acordos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_acordos_super_admin_total" ON "public"."lixeira_acordos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: lixeira_acordos lixeira_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_delete" ON "public"."lixeira_acordos" FOR DELETE USING (true);


--
-- Name: lixeira_acordos lixeira_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_insert" ON "public"."lixeira_acordos" FOR INSERT WITH CHECK (true);


--
-- Name: lixeira_acordos lixeira_insert_empresa_2026; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_insert_empresa_2026" ON "public"."lixeira_acordos" FOR INSERT TO "authenticated" WITH CHECK (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: lixeira_pix_automatico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."lixeira_pix_automatico" ENABLE ROW LEVEL SECURITY;

--
-- Name: lixeira_pix_automatico lixeira_pix_automatico_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_pix_automatico_super_admin_total" ON "public"."lixeira_pix_automatico" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: lixeira_pix_automatico lixeira_pix_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_pix_delete" ON "public"."lixeira_pix_automatico" FOR DELETE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: lixeira_pix_automatico lixeira_pix_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_pix_insert" ON "public"."lixeira_pix_automatico" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND (("operador_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: lixeira_pix_automatico lixeira_pix_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lixeira_pix_select" ON "public"."lixeira_pix_automatico" FOR SELECT USING (("public"."fn_can_access_empresa"("empresa_id") AND (("operador_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: logs_sistema logs_sis_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs_sis_admin" ON "public"."logs_sistema" FOR SELECT USING (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"]))));


--
-- Name: logs_sistema logs_sis_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs_sis_insert" ON "public"."logs_sistema" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND ("usuario_id" = "auth"."uid"())));


--
-- Name: logs_sistema; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."logs_sistema" ENABLE ROW LEVEL SECURITY;

--
-- Name: logs_whatsapp logs_wa_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs_wa_insert" ON "public"."logs_whatsapp" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND (("usuario_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: logs_whatsapp logs_wa_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs_wa_select" ON "public"."logs_whatsapp" FOR SELECT USING (("public"."fn_user_is_super_admin"() OR ("public"."fn_can_access_empresa"("empresa_id") AND (("usuario_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text"])))));


--
-- Name: logs_whatsapp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."logs_whatsapp" ENABLE ROW LEVEL SECURITY;

--
-- Name: logs_whatsapp logs_whatsapp_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs_whatsapp_super_admin_total" ON "public"."logs_whatsapp" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: metas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."metas" ENABLE ROW LEVEL SECURITY;

--
-- Name: metas_config_mes metas_config_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_config_delete" ON "public"."metas_config_mes" FOR DELETE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"])));


--
-- Name: metas_config_mes metas_config_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_config_insert" ON "public"."metas_config_mes" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: metas_config_mes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."metas_config_mes" ENABLE ROW LEVEL SECURITY;

--
-- Name: metas_config_mes metas_config_mes_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_config_mes_super_admin_total" ON "public"."metas_config_mes" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: metas_config_mes metas_config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_config_select" ON "public"."metas_config_mes" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: metas_config_mes metas_config_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_config_update" ON "public"."metas_config_mes" FOR UPDATE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: metas metas_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_delete" ON "public"."metas" FOR DELETE USING (("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"]) AND (NOT "public"."fn_meta_esta_bloqueada"("tipo", "referencia_id", "empresa_id", "mes", "ano"))));


--
-- Name: metas metas_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_insert" ON "public"."metas" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'lider'::"text", 'super_admin'::"text", 'elite'::"text", 'gerencia'::"text"]) AND (NOT "public"."fn_meta_esta_bloqueada"("tipo", "referencia_id", "empresa_id", "mes", "ano"))));


--
-- Name: metas metas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_select" ON "public"."metas" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: metas metas_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_super_admin_total" ON "public"."metas" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: metas metas_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_update" ON "public"."metas" FOR UPDATE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'lider'::"text", 'super_admin'::"text", 'elite'::"text", 'gerencia'::"text"]) AND (NOT "public"."fn_meta_esta_bloqueada"("tipo", "referencia_id", "empresa_id", "mes", "ano")))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'lider'::"text", 'super_admin'::"text", 'elite'::"text", 'gerencia'::"text"]) AND (NOT "public"."fn_meta_esta_bloqueada"("tipo", "referencia_id", "empresa_id", "mes", "ano"))));


--
-- Name: metas metas_upsert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_upsert" ON "public"."metas" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis"
  WHERE (("perfis"."id" = "auth"."uid"()) AND ("perfis"."perfil" = ANY (ARRAY['administrador'::"text", 'lider'::"text", 'super_admin'::"text"]))))));


--
-- Name: metas_validacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."metas_validacoes" ENABLE ROW LEVEL SECURITY;

--
-- Name: metas_validacoes metas_validacoes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_validacoes_select" ON "public"."metas_validacoes" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: metas_validacoes metas_validacoes_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "metas_validacoes_super_admin_total" ON "public"."metas_validacoes" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: modelos_mensagem modelos_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "modelos_admin" ON "public"."modelos_mensagem" USING (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"])))) WITH CHECK (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"]))));


--
-- Name: modelos_mensagem; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."modelos_mensagem" ENABLE ROW LEVEL SECURITY;

--
-- Name: modelos_mensagem modelos_mensagem_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "modelos_mensagem_super_admin_total" ON "public"."modelos_mensagem" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: modelos_mensagem modelos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "modelos_select" ON "public"."modelos_mensagem" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: notificacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notificacoes" ENABLE ROW LEVEL SECURITY;

--
-- Name: notificacoes notificacoes_delete_own_2026; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes_delete_own_2026" ON "public"."notificacoes" FOR DELETE TO "authenticated" USING (("usuario_id" = "auth"."uid"()));


--
-- Name: notificacoes notificacoes_insert_empresa_2026; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes_insert_empresa_2026" ON "public"."notificacoes" FOR INSERT TO "authenticated" WITH CHECK (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: notificacoes notificacoes_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes_own" ON "public"."notificacoes" USING (((("usuario_id" = "auth"."uid"()) AND "public"."fn_can_access_empresa"("empresa_id")) OR "public"."fn_user_is_super_admin"())) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND (("usuario_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: notificacoes notificacoes_select_own_2026; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes_select_own_2026" ON "public"."notificacoes" FOR SELECT TO "authenticated" USING (("usuario_id" = "auth"."uid"()));


--
-- Name: notificacoes notificacoes_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes_super_admin_total" ON "public"."notificacoes" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: notificacoes notificacoes_update_own_2026; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notificacoes_update_own_2026" ON "public"."notificacoes" FOR UPDATE TO "authenticated" USING (("usuario_id" = "auth"."uid"())) WITH CHECK (("usuario_id" = "auth"."uid"()));


--
-- Name: nr_registros nr_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_delete_authenticated" ON "public"."nr_registros" FOR DELETE TO "authenticated" USING (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: nr_registros nr_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_insert_authenticated" ON "public"."nr_registros" FOR INSERT TO "authenticated" WITH CHECK (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: nr_registros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."nr_registros" ENABLE ROW LEVEL SECURITY;

--
-- Name: nr_registros nr_registros_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_registros_delete" ON "public"."nr_registros" FOR DELETE TO "authenticated" USING (true);


--
-- Name: nr_registros nr_registros_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_registros_insert" ON "public"."nr_registros" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: nr_registros nr_registros_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_registros_select" ON "public"."nr_registros" FOR SELECT TO "authenticated" USING (true);


--
-- Name: nr_registros nr_registros_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_registros_super_admin_total" ON "public"."nr_registros" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: nr_registros nr_registros_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_registros_update" ON "public"."nr_registros" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);


--
-- Name: nr_registros nr_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_select_authenticated" ON "public"."nr_registros" FOR SELECT TO "authenticated" USING (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: nr_registros nr_update_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nr_update_authenticated" ON "public"."nr_registros" FOR UPDATE TO "authenticated" USING (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"())))) WITH CHECK (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: ouvidoria_acessos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ouvidoria_acessos" ENABLE ROW LEVEL SECURITY;

--
-- Name: ouvidoria_acessos ouvidoria_acessos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ouvidoria_acessos_select" ON "public"."ouvidoria_acessos" FOR SELECT USING ((("usuario_id" = "auth"."uid"()) OR ("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['ouvidoria'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: ouvidoria_acessos ouvidoria_acessos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ouvidoria_acessos_super_admin_total" ON "public"."ouvidoria_acessos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: ouvidoria_acessos ouvidoria_acessos_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ouvidoria_acessos_write" ON "public"."ouvidoria_acessos" USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['ouvidoria'::"text", 'administrador'::"text", 'super_admin'::"text"]))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['ouvidoria'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: ouvidoria_atendimentos ouvidoria_atend_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ouvidoria_atend_delete" ON "public"."ouvidoria_atendimentos" FOR DELETE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['ouvidoria'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: ouvidoria_atendimentos ouvidoria_atend_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ouvidoria_atend_insert" ON "public"."ouvidoria_atendimentos" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND ("public"."fn_ouvidoria_nivel"("empresa_id") = 'editar'::"text")));


--
-- Name: ouvidoria_atendimentos ouvidoria_atend_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ouvidoria_atend_select" ON "public"."ouvidoria_atendimentos" FOR SELECT USING (("public"."fn_can_access_empresa"("empresa_id") AND ("public"."fn_ouvidoria_nivel"("empresa_id") = ANY (ARRAY['ver'::"text", 'editar'::"text"]))));


--
-- Name: ouvidoria_atendimentos ouvidoria_atend_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ouvidoria_atend_update" ON "public"."ouvidoria_atendimentos" FOR UPDATE USING (("public"."fn_can_access_empresa"("empresa_id") AND ("public"."fn_ouvidoria_nivel"("empresa_id") = 'editar'::"text"))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND ("public"."fn_ouvidoria_nivel"("empresa_id") = 'editar'::"text")));


--
-- Name: ouvidoria_atendimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ouvidoria_atendimentos" ENABLE ROW LEVEL SECURITY;

--
-- Name: ouvidoria_atendimentos ouvidoria_atendimentos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ouvidoria_atendimentos_super_admin_total" ON "public"."ouvidoria_atendimentos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: perfis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."perfis" ENABLE ROW LEVEL SECURITY;

--
-- Name: perfis perfis_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfis_admin_all" ON "public"."perfis" USING (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"])))) WITH CHECK (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"]))));


--
-- Name: perfis perfis_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfis_insert" ON "public"."perfis" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: perfis perfis_lider_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfis_lider_update" ON "public"."perfis" FOR UPDATE USING ((("empresa_id" = "public"."fn_user_empresa_id"()) AND ("setor_id" = "public"."fn_user_setor_id"()) AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text"]) AND ("perfil" <> ALL (ARRAY['administrador'::"text", 'super_admin'::"text"])))) WITH CHECK ((("empresa_id" = "public"."fn_user_empresa_id"()) AND ("perfil" <> ALL (ARRAY['administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: perfis perfis_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfis_select" ON "public"."perfis" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: perfis perfis_select_elevated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfis_select_elevated" ON "public"."perfis" FOR SELECT USING (("public"."fn_get_perfil_usuario"("auth"."uid"()) = ANY (ARRAY['lider'::"text", 'administrador'::"text"])));


--
-- Name: perfis perfis_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfis_select_own" ON "public"."perfis" FOR SELECT USING (("auth"."uid"() = "id"));


--
-- Name: perfis perfis_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfis_super_admin_total" ON "public"."perfis" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: perfis_transferencias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."perfis_transferencias" ENABLE ROW LEVEL SECURITY;

--
-- Name: perfis perfis_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfis_update_own" ON "public"."perfis" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: pet_economia_regras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pet_economia_regras" ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_economia_regras pet_economia_regras_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_economia_regras_super_admin_total" ON "public"."pet_economia_regras" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pet_estado; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pet_estado" ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_estado pet_estado_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_estado_select" ON "public"."pet_estado" FOR SELECT USING (("usuario_id" = "auth"."uid"()));


--
-- Name: pet_estado pet_estado_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_estado_super_admin_total" ON "public"."pet_estado" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pet_inventario; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pet_inventario" ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_inventario pet_inventario_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_inventario_select" ON "public"."pet_inventario" FOR SELECT USING (("usuario_id" = "auth"."uid"()));


--
-- Name: pet_inventario pet_inventario_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_inventario_super_admin_total" ON "public"."pet_inventario" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pet_itens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pet_itens" ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_itens pet_itens_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_itens_admin_write" ON "public"."pet_itens" USING ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"])) WITH CHECK ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"]));


--
-- Name: pet_itens pet_itens_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_itens_select" ON "public"."pet_itens" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: pet_itens pet_itens_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_itens_super_admin_total" ON "public"."pet_itens" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pet_nome_votos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pet_nome_votos" ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_nome_votos pet_nome_votos_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_nome_votos_insert" ON "public"."pet_nome_votos" FOR INSERT WITH CHECK (("usuario_id" = "auth"."uid"()));


--
-- Name: pet_nome_votos pet_nome_votos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_nome_votos_select" ON "public"."pet_nome_votos" FOR SELECT USING (("usuario_id" = "auth"."uid"()));


--
-- Name: pet_nome_votos pet_nome_votos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_nome_votos_super_admin_total" ON "public"."pet_nome_votos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pet_recompensas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pet_recompensas" ENABLE ROW LEVEL SECURITY;

--
-- Name: pet_recompensas pet_recompensas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_recompensas_select" ON "public"."pet_recompensas" FOR SELECT USING (("usuario_id" = "auth"."uid"()));


--
-- Name: pet_recompensas pet_recompensas_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_recompensas_super_admin_total" ON "public"."pet_recompensas" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pet_economia_regras pet_regras_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_regras_admin_write" ON "public"."pet_economia_regras" FOR UPDATE USING ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"])) WITH CHECK ("public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"]));


--
-- Name: pet_economia_regras pet_regras_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pet_regras_select" ON "public"."pet_economia_regras" FOR SELECT USING (("auth"."uid"() IS NOT NULL));


--
-- Name: pix_automatico_config pix_auto_cfg_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_cfg_select" ON "public"."pix_automatico_config" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: pix_automatico_config pix_auto_cfg_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_cfg_write" ON "public"."pix_automatico_config" USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: pix_automatico_acordos pix_auto_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_delete" ON "public"."pix_automatico_acordos" FOR DELETE USING (("public"."fn_can_access_empresa"("empresa_id") AND ((("operador_id" = "auth"."uid"()) AND ("status" = 'desaprovado'::"text")) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: pix_automatico_acordos pix_auto_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_insert" ON "public"."pix_automatico_acordos" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND ("status" = 'pendente'::"text") AND ("public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]) OR (("operador_id" = "auth"."uid"()) AND COALESCE(( SELECT "c"."permite_registro_operador"
   FROM "public"."pix_automatico_config" "c"
  WHERE (("c"."empresa_id" = "pix_automatico_acordos"."empresa_id") AND ("c"."setor_id" = "pix_automatico_acordos"."setor_id"))), true)))));


--
-- Name: pix_automatico_metas pix_auto_metas_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_metas_select" ON "public"."pix_automatico_metas" FOR SELECT USING (( SELECT "public"."fn_can_access_empresa"("pix_automatico_metas"."empresa_id") AS "fn_can_access_empresa"));


--
-- Name: pix_automatico_metas pix_auto_metas_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_metas_write" ON "public"."pix_automatico_metas" USING ((( SELECT "public"."fn_can_access_empresa"("pix_automatico_metas"."empresa_id") AS "fn_can_access_empresa") AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role"))) WITH CHECK ((( SELECT "public"."fn_can_access_empresa"("pix_automatico_metas"."empresa_id") AS "fn_can_access_empresa") AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: pix_automatico_acordos pix_auto_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_select" ON "public"."pix_automatico_acordos" FOR SELECT USING (("public"."fn_can_access_empresa"("empresa_id") AND (("operador_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: pix_automatico_acordos pix_auto_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_update" ON "public"."pix_automatico_acordos" FOR UPDATE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"]))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'administrador'::"text", 'super_admin'::"text"])));


--
-- Name: pix_automatico_acordos pix_auto_update_dono_pendente; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_auto_update_dono_pendente" ON "public"."pix_automatico_acordos" FOR UPDATE USING ((( SELECT "public"."fn_can_access_empresa"("pix_automatico_acordos"."empresa_id") AS "fn_can_access_empresa") AND ("operador_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pendente'::"text"))) WITH CHECK ((( SELECT "public"."fn_can_access_empresa"("pix_automatico_acordos"."empresa_id") AS "fn_can_access_empresa") AND ("operador_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pendente'::"text")));


--
-- Name: pix_automatico_acordos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pix_automatico_acordos" ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_automatico_acordos pix_automatico_acordos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_automatico_acordos_super_admin_total" ON "public"."pix_automatico_acordos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pix_automatico_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pix_automatico_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_automatico_config pix_automatico_config_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_automatico_config_super_admin_total" ON "public"."pix_automatico_config" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pix_automatico_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pix_automatico_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_automatico_log pix_automatico_log_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_automatico_log_super_admin_total" ON "public"."pix_automatico_log" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pix_automatico_metas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pix_automatico_metas" ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_automatico_metas pix_automatico_metas_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_automatico_metas_super_admin_total" ON "public"."pix_automatico_metas" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pix_automatico_nr_registro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pix_automatico_nr_registro" ENABLE ROW LEVEL SECURITY;

--
-- Name: pix_automatico_nr_registro pix_automatico_nr_registro_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_automatico_nr_registro_super_admin_total" ON "public"."pix_automatico_nr_registro" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: pix_automatico_log pix_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_log_select" ON "public"."pix_automatico_log" FOR SELECT USING (("public"."fn_can_access_empresa"("empresa_id") AND (("operador_id" = "auth"."uid"()) OR "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]))));


--
-- Name: pix_automatico_nr_registro pix_nr_reg_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pix_nr_reg_select" ON "public"."pix_automatico_nr_registro" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: profissionais prof_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prof_insert_admin" ON "public"."profissionais" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."perfis"
  WHERE (("perfis"."id" = "auth"."uid"()) AND ("perfis"."perfil" = ANY (ARRAY['administrador'::"text", 'super_admin'::"text"]))))));


--
-- Name: profissionais prof_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prof_select" ON "public"."profissionais" FOR SELECT USING (("empresa_id" = ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE ("perfis"."id" = "auth"."uid"()))));


--
-- Name: profissionais prof_upsert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prof_upsert_admin" ON "public"."profissionais" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."perfis"
  WHERE (("perfis"."id" = "auth"."uid"()) AND ("perfis"."perfil" = ANY (ARRAY['administrador'::"text", 'super_admin'::"text"]))))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles_super_admin_total" ON "public"."profiles" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: profissionais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profissionais" ENABLE ROW LEVEL SECURITY;

--
-- Name: profissionais profissionais_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profissionais_super_admin_total" ON "public"."profissionais" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: relatorio_validacoes_dia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."relatorio_validacoes_dia" ENABLE ROW LEVEL SECURITY;

--
-- Name: relatorio_validacoes_dia relatorio_validacoes_dia_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "relatorio_validacoes_dia_super_admin_total" ON "public"."relatorio_validacoes_dia" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: relatorio_validacoes_dia relatorio_validacoes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "relatorio_validacoes_select" ON "public"."relatorio_validacoes_dia" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: setores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."setores" ENABLE ROW LEVEL SECURITY;

--
-- Name: setores setores_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "setores_admin" ON "public"."setores" USING (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"])))) WITH CHECK (("public"."fn_user_is_super_admin"() OR (("empresa_id" = "public"."fn_user_empresa_id"()) AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text"]))));


--
-- Name: setores setores_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "setores_select" ON "public"."setores" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: setores setores_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "setores_super_admin_total" ON "public"."setores" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: solicitacoes_whatsapp sol_wpp_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_delete" ON "public"."solicitacoes_whatsapp" FOR DELETE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role") OR ("solicitante_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: solicitacoes_whatsapp_eventos sol_wpp_eventos_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_eventos_select" ON "public"."solicitacoes_whatsapp_eventos" FOR SELECT USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND "public"."fn_wpp_pode_ver_solicitacao"("solicitacao_id")));


--
-- Name: solicitacoes_whatsapp sol_wpp_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_insert" ON "public"."solicitacoes_whatsapp" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("solicitante_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: solicitacoes_whatsapp_leitura sol_wpp_leitura_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_leitura_insert" ON "public"."solicitacoes_whatsapp_leitura" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."fn_wpp_pode_ver_solicitacao"("solicitacao_id")));


--
-- Name: solicitacoes_whatsapp_leitura sol_wpp_leitura_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_leitura_select" ON "public"."solicitacoes_whatsapp_leitura" FOR SELECT USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND "public"."fn_wpp_pode_ver_solicitacao"("solicitacao_id")));


--
-- Name: solicitacoes_whatsapp_leitura sol_wpp_leitura_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_leitura_update" ON "public"."solicitacoes_whatsapp_leitura" FOR UPDATE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("usuario_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: solicitacoes_whatsapp_mensagens sol_wpp_msg_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_msg_insert" ON "public"."solicitacoes_whatsapp_mensagens" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("autor_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."fn_wpp_pode_falar"("solicitacao_id") AND "public"."fn_wpp_chat_aberto"("solicitacao_id")));


--
-- Name: solicitacoes_whatsapp_mensagens sol_wpp_msg_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_msg_select" ON "public"."solicitacoes_whatsapp_mensagens" FOR SELECT USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND "public"."fn_wpp_pode_ver_solicitacao"("solicitacao_id")));


--
-- Name: solicitacoes_whatsapp_mensagens sol_wpp_msg_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_msg_update" ON "public"."solicitacoes_whatsapp_mensagens" FOR UPDATE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("autor_id" <> ( SELECT "auth"."uid"() AS "uid")) AND "public"."fn_wpp_pode_ver_solicitacao"("solicitacao_id"))) WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ("autor_id" <> ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: solicitacoes_whatsapp sol_wpp_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_select" ON "public"."solicitacoes_whatsapp" FOR SELECT USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (("solicitante_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."fn_wpp_tem_visao_geral"() AS "fn_wpp_tem_visao_geral"))));


--
-- Name: solicitacoes_whatsapp sol_wpp_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sol_wpp_update" ON "public"."solicitacoes_whatsapp" FOR UPDATE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (( SELECT "public"."fn_wpp_tem_visao_geral"() AS "fn_wpp_tem_visao_geral") OR (("solicitante_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['pendente'::"text", 'falta_info'::"text"])))))) WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND (( SELECT "public"."fn_wpp_tem_visao_geral"() AS "fn_wpp_tem_visao_geral") OR ("solicitante_id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: solicitacoes_whatsapp; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."solicitacoes_whatsapp" ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitacoes_whatsapp_eventos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."solicitacoes_whatsapp_eventos" ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitacoes_whatsapp_eventos solicitacoes_whatsapp_eventos_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solicitacoes_whatsapp_eventos_super_admin_total" ON "public"."solicitacoes_whatsapp_eventos" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: solicitacoes_whatsapp_leitura; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."solicitacoes_whatsapp_leitura" ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitacoes_whatsapp_leitura solicitacoes_whatsapp_leitura_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solicitacoes_whatsapp_leitura_super_admin_total" ON "public"."solicitacoes_whatsapp_leitura" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: solicitacoes_whatsapp_mensagens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."solicitacoes_whatsapp_mensagens" ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitacoes_whatsapp_mensagens solicitacoes_whatsapp_mensagens_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solicitacoes_whatsapp_mensagens_super_admin_total" ON "public"."solicitacoes_whatsapp_mensagens" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: solicitacoes_whatsapp solicitacoes_whatsapp_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solicitacoes_whatsapp_super_admin_total" ON "public"."solicitacoes_whatsapp" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tags_delete" ON "public"."tags" FOR DELETE USING (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE (("perfis"."id" = "auth"."uid"()) AND ("perfis"."perfil" = ANY (ARRAY['administrador'::"text", 'super_admin'::"text"]))))));


--
-- Name: tags tags_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tags_insert" ON "public"."tags" FOR INSERT WITH CHECK (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE (("perfis"."id" = "auth"."uid"()) AND ("perfis"."perfil" = ANY (ARRAY['administrador'::"text", 'super_admin'::"text"]))))));


--
-- Name: tags tags_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tags_select" ON "public"."tags" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: tags tags_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tags_super_admin_total" ON "public"."tags" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: tags tags_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tags_update" ON "public"."tags" FOR UPDATE USING (("empresa_id" IN ( SELECT "perfis"."empresa_id"
   FROM "public"."perfis"
  WHERE (("perfis"."id" = "auth"."uid"()) AND ("perfis"."perfil" = ANY (ARRAY['administrador'::"text", 'super_admin'::"text"]))))));


--
-- Name: termos_uso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."termos_uso" ENABLE ROW LEVEL SECURITY;

--
-- Name: termos_uso termos_uso_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termos_uso_insert" ON "public"."termos_uso" FOR INSERT WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"])));


--
-- Name: termos_uso termos_uso_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termos_uso_select" ON "public"."termos_uso" FOR SELECT USING ("public"."fn_can_access_empresa"("empresa_id"));


--
-- Name: termos_uso termos_uso_super_admin_total; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termos_uso_super_admin_total" ON "public"."termos_uso" TO "authenticated" USING ("public"."fn_user_is_super_admin"()) WITH CHECK ("public"."fn_user_is_super_admin"());


--
-- Name: termos_uso termos_uso_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termos_uso_update" ON "public"."termos_uso" FOR UPDATE USING (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"]))) WITH CHECK (("public"."fn_can_access_empresa"("empresa_id") AND "public"."fn_user_has_any_role"(ARRAY['administrador'::"text", 'super_admin'::"text"])));


--
-- Name: perfis_transferencias transferencias_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transferencias_insert" ON "public"."perfis_transferencias" FOR INSERT WITH CHECK (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id")) OR ("destino_empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: perfis_transferencias transferencias_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transferencias_select" ON "public"."perfis_transferencias" FOR SELECT USING ((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id")) OR ("destino_empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))));


--
-- Name: perfis_transferencias transferencias_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transferencias_update" ON "public"."perfis_transferencias" FOR UPDATE USING (((( SELECT "public"."fn_user_is_super_admin"() AS "fn_user_is_super_admin") OR ("empresa_id" = ( SELECT "public"."fn_user_empresa_id"() AS "fn_user_empresa_id"))) AND ( SELECT "public"."fn_user_has_any_role"(ARRAY['lider'::"text", 'elite'::"text", 'gerencia'::"text", 'diretoria'::"text", 'administrador'::"text", 'super_admin'::"text"]) AS "fn_user_has_any_role")));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "buscar_email_por_usuario"("p_usuario" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."buscar_email_por_usuario"("p_usuario" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."buscar_email_por_usuario"("p_usuario" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_email_por_usuario"("p_usuario" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."buscar_email_por_usuario"("p_usuario" "text") TO "anon";


--
-- Name: FUNCTION "buscar_email_por_usuario_empresa"("p_usuario" "text", "p_empresa_slug" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."buscar_email_por_usuario_empresa"("p_usuario" "text", "p_empresa_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."buscar_email_por_usuario_empresa"("p_usuario" "text", "p_empresa_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_email_por_usuario_empresa"("p_usuario" "text", "p_empresa_slug" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."buscar_email_por_usuario_empresa"("p_usuario" "text", "p_empresa_slug" "text") TO "anon";


--
-- Name: FUNCTION "fn_acordo_exige_estado"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_acordo_exige_estado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_acordo_exige_estado"() TO "service_role";


--
-- Name: FUNCTION "fn_acordo_recusa_cpf"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_acordo_recusa_cpf"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_acordo_recusa_cpf"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_acordo_recusa_cpf"() TO "service_role";


--
-- Name: FUNCTION "fn_admin_apagar_acordos_do_usuario"("p_user_id" "uuid", "p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_admin_apagar_acordos_do_usuario"("p_user_id" "uuid", "p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_apagar_acordos_do_usuario"("p_user_id" "uuid", "p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_apagar_acordos_do_usuario"("p_user_id" "uuid", "p_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_admin_delete_user"("p_user_id" "uuid", "p_apagar_acordos" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_admin_delete_user"("p_user_id" "uuid", "p_apagar_acordos" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_delete_user"("p_user_id" "uuid", "p_apagar_acordos" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_delete_user"("p_user_id" "uuid", "p_apagar_acordos" boolean) TO "service_role";


--
-- Name: FUNCTION "fn_admin_resumo_exclusao_usuario"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_admin_resumo_exclusao_usuario"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_resumo_exclusao_usuario"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_resumo_exclusao_usuario"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_analitico_atualizar_resumo"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_analitico_atualizar_resumo"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_analitico_atualizar_resumo"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_analitico_atualizar_resumo"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";


--
-- Name: FUNCTION "fn_analitico_dashboard_mes"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_analitico_dashboard_mes"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_analitico_dashboard_mes"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_analitico_dashboard_mes"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";


--
-- Name: FUNCTION "fn_analitico_dashboard_mes_json"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_analitico_dashboard_mes_json"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_analitico_dashboard_mes_json"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_analitico_dashboard_mes_json"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";


--
-- Name: FUNCTION "fn_analitico_destaques_dia"("p_empresa_id" "uuid", "p_mes" "text", "p_equipe_id" "uuid", "p_setor_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_analitico_destaques_dia"("p_empresa_id" "uuid", "p_mes" "text", "p_equipe_id" "uuid", "p_setor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_analitico_destaques_dia"("p_empresa_id" "uuid", "p_mes" "text", "p_equipe_id" "uuid", "p_setor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_analitico_destaques_dia"("p_empresa_id" "uuid", "p_mes" "text", "p_equipe_id" "uuid", "p_setor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_analitico_resumo_por_operador"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_analitico_resumo_por_operador"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_analitico_resumo_por_operador"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_analitico_resumo_por_operador"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";


--
-- Name: FUNCTION "fn_api_rate_limit_consumir"("p_usuario_id" "uuid", "p_rota" "text", "p_limite" integer, "p_janela_segundos" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_api_rate_limit_consumir"("p_usuario_id" "uuid", "p_rota" "text", "p_limite" integer, "p_janela_segundos" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_api_rate_limit_consumir"("p_usuario_id" "uuid", "p_rota" "text", "p_limite" integer, "p_janela_segundos" integer) TO "service_role";


--
-- Name: FUNCTION "fn_arquivar_desligados_anteriores"("p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_arquivar_desligados_anteriores"("p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_arquivar_desligados_anteriores"("p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_arquivar_desligados_anteriores"("p_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_atualizar_timestamp"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_atualizar_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_atualizar_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_atualizar_timestamp"() TO "service_role";


--
-- Name: FUNCTION "fn_can_access_empresa"("target_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_can_access_empresa"("target_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_can_access_empresa"("target_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_can_access_empresa"("target_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_comemoracao_alvo_direto"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_alvo_direto"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_comemoracao_alvo_direto"() TO "service_role";


--
-- Name: FUNCTION "fn_comemoracao_faxina"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_faxina"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_comemoracao_faxina"() TO "service_role";


--
-- Name: FUNCTION "fn_comemoracao_finalizar"("p_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") TO "service_role";


--
-- Name: TABLE "comemoracao_midias"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."comemoracao_midias" TO "anon";
GRANT ALL ON TABLE "public"."comemoracao_midias" TO "authenticated";
GRANT ALL ON TABLE "public"."comemoracao_midias" TO "service_role";


--
-- Name: FUNCTION "fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean) TO "service_role";


--
-- Name: FUNCTION "fn_comemoracao_midias_teto"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_midias_teto"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_comemoracao_midias_teto"() TO "service_role";


--
-- Name: FUNCTION "fn_comemoracao_pode_criar"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_pode_criar"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_comemoracao_pode_criar"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_comemoracao_pode_criar"() TO "service_role";


--
-- Name: FUNCTION "fn_comemoracao_setores_alvo"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_setores_alvo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_comemoracao_setores_alvo"() TO "service_role";


--
-- Name: FUNCTION "fn_composicao_mes_congelar"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_composicao_mes_congelar"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_composicao_mes_congelar"() TO "service_role";


--
-- Name: FUNCTION "fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";


--
-- Name: FUNCTION "fn_contrib_receptivo_touch"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_contrib_receptivo_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_contrib_receptivo_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_contrib_receptivo_touch"() TO "service_role";


--
-- Name: FUNCTION "fn_converter_para_extra"("p_acordo_id" "uuid", "p_novo_direto_op_id" "uuid", "p_novo_direto_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text", "p_parcelas" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_converter_para_extra"("p_acordo_id" "uuid", "p_novo_direto_op_id" "uuid", "p_novo_direto_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text", "p_parcelas" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_converter_para_extra"("p_acordo_id" "uuid", "p_novo_direto_op_id" "uuid", "p_novo_direto_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text", "p_parcelas" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_converter_para_extra"("p_acordo_id" "uuid", "p_novo_direto_op_id" "uuid", "p_novo_direto_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text", "p_parcelas" integer) TO "service_role";


--
-- Name: FUNCTION "fn_criar_perfil_novo_usuario"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_criar_perfil_novo_usuario"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_criar_perfil_novo_usuario"() TO "service_role";


--
-- Name: FUNCTION "fn_diario_preencher_setor"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_diario_preencher_setor"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_diario_preencher_setor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_diario_preencher_setor"() TO "service_role";


--
-- Name: FUNCTION "fn_diario_resumo_mensal"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_diario_resumo_mensal"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_diario_resumo_mensal"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_diario_resumo_mensal"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";


--
-- Name: FUNCTION "fn_diario_resumo_mes"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_diario_resumo_mes"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_diario_resumo_mes"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_diario_resumo_mes"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";


--
-- Name: FUNCTION "fn_direto_extra_ativo"("p_user_id" "uuid", "p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_direto_extra_ativo"("p_user_id" "uuid", "p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_direto_extra_ativo"("p_user_id" "uuid", "p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_direto_extra_ativo"("p_user_id" "uuid", "p_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_doc_lgpd_set_atualizado"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_doc_lgpd_set_atualizado"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_doc_lgpd_set_atualizado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_doc_lgpd_set_atualizado"() TO "service_role";


--
-- Name: FUNCTION "fn_eh_cpf"("p_valor" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_eh_cpf"("p_valor" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_eh_cpf"("p_valor" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_eh_cpf"("p_valor" "text") TO "service_role";


--
-- Name: FUNCTION "fn_empresa_seed_super_admin"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_empresa_seed_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_empresa_seed_super_admin"() TO "service_role";


--
-- Name: FUNCTION "fn_equipes_do_operador"("p_operador" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_equipes_do_operador"("p_operador" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_equipes_do_operador"("p_operador" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_equipes_do_operador"("p_operador" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_expurgar_cpf_chat"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_expurgar_cpf_chat"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_expurgar_cpf_chat"() TO "service_role";


--
-- Name: FUNCTION "fn_get_perfil_usuario"("uid" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_get_perfil_usuario"("uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_get_perfil_usuario"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_get_perfil_usuario"("uid" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_get_setor_usuario"("uid" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_get_setor_usuario"("uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_get_setor_usuario"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_get_setor_usuario"("uid" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_impedir_transferencia_com_acordos_pendentes"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_impedir_transferencia_com_acordos_pendentes"() FROM PUBLIC;


--
-- Name: FUNCTION "fn_log_auditoria"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_log_auditoria"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_log_auditoria"() TO "service_role";


--
-- Name: FUNCTION "fn_log_contexto"("p_header" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_log_contexto"("p_header" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_log_contexto"("p_header" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_contexto"("p_header" "text") TO "service_role";


--
-- Name: FUNCTION "fn_log_diff"("p_antes" "jsonb", "p_depois" "jsonb", "p_ignorar" "text"[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_log_diff"("p_antes" "jsonb", "p_depois" "jsonb", "p_ignorar" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_log_diff"("p_antes" "jsonb", "p_depois" "jsonb", "p_ignorar" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_diff"("p_antes" "jsonb", "p_depois" "jsonb", "p_ignorar" "text"[]) TO "service_role";


--
-- Name: FUNCTION "fn_log_historico_acordo"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_log_historico_acordo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_log_historico_acordo"() TO "service_role";


--
-- Name: FUNCTION "fn_log_login_recusado"("p_identificador" "text", "p_motivo" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_log_login_recusado"("p_identificador" "text", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_log_login_recusado"("p_identificador" "text", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_login_recusado"("p_identificador" "text", "p_motivo" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."fn_log_login_recusado"("p_identificador" "text", "p_motivo" "text") TO "anon";


--
-- Name: FUNCTION "fn_log_mascarar"("p_dados" "jsonb"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_log_mascarar"("p_dados" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_log_mascarar"("p_dados" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_mascarar"("p_dados" "jsonb") TO "service_role";


--
-- Name: FUNCTION "fn_log_registrar"("p_acao" "text", "p_categoria" "text", "p_severidade" "text", "p_descricao" "text", "p_empresa_id" "uuid", "p_tabela" "text", "p_registro_id" "text", "p_alvo_tipo" "text", "p_alvo_rotulo" "text", "p_antes" "jsonb", "p_depois" "jsonb", "p_campos" "text"[], "p_detalhes" "jsonb", "p_origem" "text", "p_rota" "text", "p_usuario_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_log_registrar"("p_acao" "text", "p_categoria" "text", "p_severidade" "text", "p_descricao" "text", "p_empresa_id" "uuid", "p_tabela" "text", "p_registro_id" "text", "p_alvo_tipo" "text", "p_alvo_rotulo" "text", "p_antes" "jsonb", "p_depois" "jsonb", "p_campos" "text"[], "p_detalhes" "jsonb", "p_origem" "text", "p_rota" "text", "p_usuario_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_log_registrar"("p_acao" "text", "p_categoria" "text", "p_severidade" "text", "p_descricao" "text", "p_empresa_id" "uuid", "p_tabela" "text", "p_registro_id" "text", "p_alvo_tipo" "text", "p_alvo_rotulo" "text", "p_antes" "jsonb", "p_depois" "jsonb", "p_campos" "text"[], "p_detalhes" "jsonb", "p_origem" "text", "p_rota" "text", "p_usuario_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_registrar"("p_acao" "text", "p_categoria" "text", "p_severidade" "text", "p_descricao" "text", "p_empresa_id" "uuid", "p_tabela" "text", "p_registro_id" "text", "p_alvo_tipo" "text", "p_alvo_rotulo" "text", "p_antes" "jsonb", "p_depois" "jsonb", "p_campos" "text"[], "p_detalhes" "jsonb", "p_origem" "text", "p_rota" "text", "p_usuario_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_log_rotulo_campo"("p_campo" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_log_rotulo_campo"("p_campo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_log_rotulo_campo"("p_campo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_rotulo_campo"("p_campo" "text") TO "service_role";


--
-- Name: FUNCTION "fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_logs_resumo"("p_empresa_id" "uuid", "p_de" timestamp with time zone, "p_ate" timestamp with time zone, "p_categoria" "text", "p_severidade" "text", "p_acao" "text", "p_usuario_id" "uuid", "p_tabela" "text", "p_origem" "text", "p_busca" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_logs_resumo"("p_empresa_id" "uuid", "p_de" timestamp with time zone, "p_ate" timestamp with time zone, "p_categoria" "text", "p_severidade" "text", "p_acao" "text", "p_usuario_id" "uuid", "p_tabela" "text", "p_origem" "text", "p_busca" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_logs_resumo"("p_empresa_id" "uuid", "p_de" timestamp with time zone, "p_ate" timestamp with time zone, "p_categoria" "text", "p_severidade" "text", "p_acao" "text", "p_usuario_id" "uuid", "p_tabela" "text", "p_origem" "text", "p_busca" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_logs_resumo"("p_empresa_id" "uuid", "p_de" timestamp with time zone, "p_ate" timestamp with time zone, "p_categoria" "text", "p_severidade" "text", "p_acao" "text", "p_usuario_id" "uuid", "p_tabela" "text", "p_origem" "text", "p_busca" "text") TO "service_role";


--
-- Name: FUNCTION "fn_marcar_cpf_mensagem"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_marcar_cpf_mensagem"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_marcar_cpf_mensagem"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_marcar_cpf_mensagem"() TO "service_role";


--
-- Name: FUNCTION "fn_marcar_cpf_solicitacao"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_marcar_cpf_solicitacao"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_marcar_cpf_solicitacao"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_marcar_cpf_solicitacao"() TO "service_role";


--
-- Name: FUNCTION "fn_meta_esta_bloqueada"("p_tipo" "text", "p_referencia_id" "uuid", "p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_meta_esta_bloqueada"("p_tipo" "text", "p_referencia_id" "uuid", "p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_meta_esta_bloqueada"("p_tipo" "text", "p_referencia_id" "uuid", "p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_meta_esta_bloqueada"("p_tipo" "text", "p_referencia_id" "uuid", "p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer) TO "service_role";


--
-- Name: FUNCTION "fn_metas_esta_validada"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_metas_esta_validada"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_metas_esta_validada"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_metas_esta_validada"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) TO "service_role";


--
-- Name: FUNCTION "fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text") TO "service_role";


--
-- Name: FUNCTION "fn_metas_upsert"("p_payloads" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_metas_upsert"("p_payloads" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_metas_upsert"("p_payloads" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_metas_upsert"("p_payloads" "jsonb") TO "service_role";


--
-- Name: FUNCTION "fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) TO "service_role";


--
-- Name: FUNCTION "fn_nr_campo_chave"("p_nr_cliente" "text", "p_instituicao" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_nr_campo_chave"("p_nr_cliente" "text", "p_instituicao" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_nr_campo_chave"("p_nr_cliente" "text", "p_instituicao" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_nr_campo_chave"("p_nr_cliente" "text", "p_instituicao" "text") TO "service_role";


--
-- Name: FUNCTION "fn_nr_dono_conflitante"("p_empresa_id" "uuid", "p_nr" "text", "p_campo" "text", "p_operador_id" "uuid", "p_grupo_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_nr_dono_conflitante"("p_empresa_id" "uuid", "p_nr" "text", "p_campo" "text", "p_operador_id" "uuid", "p_grupo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_nr_dono_conflitante"("p_empresa_id" "uuid", "p_nr" "text", "p_campo" "text", "p_operador_id" "uuid", "p_grupo_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_nr_exigir_livre"("p_empresa_id" "uuid", "p_nr" "text", "p_campo" "text", "p_operador_id" "uuid", "p_grupo_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_nr_exigir_livre"("p_empresa_id" "uuid", "p_nr" "text", "p_campo" "text", "p_operador_id" "uuid", "p_grupo_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_nr_exigir_livre"("p_empresa_id" "uuid", "p_nr" "text", "p_campo" "text", "p_operador_id" "uuid", "p_grupo_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_operador_clonado_no_setor"("p_operador_id" "uuid", "p_setor_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_operador_clonado_no_setor"("p_operador_id" "uuid", "p_setor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_operador_clonado_no_setor"("p_operador_id" "uuid", "p_setor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_operador_clonado_no_setor"("p_operador_id" "uuid", "p_setor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_operador_setor_id"("p_operador_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_operador_setor_id"("p_operador_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_operador_setor_id"("p_operador_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_operador_setor_id"("p_operador_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_ouvidoria_nivel"("target_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_ouvidoria_nivel"("target_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ouvidoria_nivel"("target_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_ouvidoria_nivel"("target_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer) TO "service_role";


--
-- Name: FUNCTION "fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer, "p_motivo" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer, "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer, "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_admin_ajustar_moedas"("p_usuario" "uuid", "p_delta" integer, "p_motivo" "text") TO "service_role";


--
-- Name: FUNCTION "fn_pet_admin_listar"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_admin_listar"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_admin_listar"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_admin_listar"() TO "service_role";


--
-- Name: FUNCTION "fn_pet_comprar_item"("p_item_id" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_comprar_item"("p_item_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_comprar_item"("p_item_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_comprar_item"("p_item_id" "text") TO "service_role";


--
-- Name: FUNCTION "fn_pet_dias_disponiveis"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_dias_disponiveis"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_dias_disponiveis"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_dias_disponiveis"() TO "service_role";


--
-- Name: FUNCTION "fn_pet_discrepancias_validacao"("p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_discrepancias_validacao"("p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_discrepancias_validacao"("p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_discrepancias_validacao"("p_empresa_id" "uuid", "p_mes" integer, "p_ano" integer) TO "service_role";


--
-- Name: TABLE "pet_estado"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pet_estado" TO "anon";
GRANT ALL ON TABLE "public"."pet_estado" TO "authenticated";
GRANT ALL ON TABLE "public"."pet_estado" TO "service_role";


--
-- Name: FUNCTION "fn_pet_estado_get"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_estado_get"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_estado_get"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_estado_get"() TO "service_role";


--
-- Name: FUNCTION "fn_pet_gastar_moedas"("p_valor" integer, "p_item" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_gastar_moedas"("p_valor" integer, "p_item" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_gastar_moedas"("p_valor" integer, "p_item" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_gastar_moedas"("p_valor" integer, "p_item" "text") TO "service_role";


--
-- Name: FUNCTION "fn_pet_nome_resultado"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_nome_resultado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_nome_resultado"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_nome_resultado"() TO "service_role";


--
-- Name: FUNCTION "fn_pet_recompensa_disponivel"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_recompensa_disponivel"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_recompensa_disponivel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_recompensa_disponivel"() TO "service_role";


--
-- Name: FUNCTION "fn_pet_resgatar_recompensa"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_resgatar_recompensa"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_resgatar_recompensa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_resgatar_recompensa"() TO "service_role";


--
-- Name: FUNCTION "fn_pet_salvar_visual"("p_roupa" "text", "p_dormindo" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_salvar_visual"("p_roupa" "text", "p_dormindo" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_salvar_visual"("p_roupa" "text", "p_dormindo" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_salvar_visual"("p_roupa" "text", "p_dormindo" boolean) TO "service_role";


--
-- Name: FUNCTION "fn_pet_taxa"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pet_taxa"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pet_taxa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pet_taxa"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_congela_campos_do_operador"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_congela_campos_do_operador"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_congela_campos_do_operador"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_dias_uteis_apos"("p_base" timestamp with time zone, "p_dias" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_pix_dias_uteis_apos"("p_base" timestamp with time zone, "p_dias" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_pix_dias_uteis_apos"("p_base" timestamp with time zone, "p_dias" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pix_dias_uteis_apos"("p_base" timestamp with time zone, "p_dias" integer) TO "service_role";


--
-- Name: FUNCTION "fn_pix_expurga_desaprovados"("p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_pix_impede_excluir_pago"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_impede_excluir_pago"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_impede_excluir_pago"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_lixeira_purgar"("p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_lixeira_purgar"("p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_lixeira_purgar"("p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pix_lixeira_purgar"("p_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_pix_log"("p_empresa_id" "uuid", "p_acordo_id" "uuid", "p_nr" "text", "p_acao" "text", "p_descricao" "text", "p_valor" numeric, "p_operador_id" "uuid", "p_operador_nome" "text", "p_antes" "jsonb", "p_depois" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_log"("p_empresa_id" "uuid", "p_acordo_id" "uuid", "p_nr" "text", "p_acao" "text", "p_descricao" "text", "p_valor" numeric, "p_operador_id" "uuid", "p_operador_nome" "text", "p_antes" "jsonb", "p_depois" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_log"("p_empresa_id" "uuid", "p_acordo_id" "uuid", "p_nr" "text", "p_acao" "text", "p_descricao" "text", "p_valor" numeric, "p_operador_id" "uuid", "p_operador_nome" "text", "p_antes" "jsonb", "p_depois" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pix_log"("p_empresa_id" "uuid", "p_acordo_id" "uuid", "p_nr" "text", "p_acao" "text", "p_descricao" "text", "p_valor" numeric, "p_operador_id" "uuid", "p_operador_nome" "text", "p_antes" "jsonb", "p_depois" "jsonb") TO "service_role";


--
-- Name: FUNCTION "fn_pix_log_insert"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_log_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_log_insert"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_log_update"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_log_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_log_update"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_meta_equipe_do_setor"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_meta_equipe_do_setor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_meta_equipe_do_setor"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_notifica_desaprovacao"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_notifica_desaprovacao"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_notifica_desaprovacao"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_nr_apos_delete"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_nr_apos_delete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_nr_apos_delete"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_nr_apos_insert"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_nr_apos_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_nr_apos_insert"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_nr_apos_troca"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_nr_apos_troca"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_nr_apos_troca"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_nr_apos_update"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_nr_apos_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_nr_apos_update"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_nr_bloqueia_duplicado"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_nr_bloqueia_duplicado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_nr_bloqueia_duplicado"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_nr_bloqueia_troca"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_nr_bloqueia_troca"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_nr_bloqueia_troca"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_nr_normalizar"("p_nr" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_pix_nr_normalizar"("p_nr" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_pix_nr_normalizar"("p_nr" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pix_nr_normalizar"("p_nr" "text") TO "service_role";


--
-- Name: FUNCTION "fn_pix_registrar_exclusao"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_registrar_exclusao"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_registrar_exclusao"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_restaurar_lixeira"("p_item_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_pix_valida_pagamento"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_pix_valida_pagamento"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_pix_valida_pagamento"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pix_valida_pagamento"() TO "service_role";


--
-- Name: FUNCTION "fn_pix_valor_br"("p_valor" numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_pix_valor_br"("p_valor" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_pix_valor_br"("p_valor" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pix_valor_br"("p_valor" numeric) TO "service_role";


--
-- Name: FUNCTION "fn_pode_editar_foto_setor"("p_setor_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pode_editar_foto_setor"("p_setor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pode_editar_foto_setor"("p_setor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pode_editar_foto_setor"("p_setor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_pode_gerir_acordo"("p_setor_id" "uuid", "p_operador_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pode_gerir_acordo"("p_setor_id" "uuid", "p_operador_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_pode_gerir_acordo"("p_setor_id" "uuid", "p_operador_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pode_gerir_acordo"("p_setor_id" "uuid", "p_operador_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_profissional_registrar_uf"("p_empresa_id" "uuid", "p_codigo" "text", "p_estado_uf" "text", "p_nome" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_profissional_registrar_uf"("p_empresa_id" "uuid", "p_codigo" "text", "p_estado_uf" "text", "p_nome" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_profissional_registrar_uf"("p_empresa_id" "uuid", "p_codigo" "text", "p_estado_uf" "text", "p_nome" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_profissional_registrar_uf"("p_empresa_id" "uuid", "p_codigo" "text", "p_estado_uf" "text", "p_nome" "text") TO "service_role";


--
-- Name: FUNCTION "fn_relatorio_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text", "p_origem" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_relatorio_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text", "p_origem" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_relatorio_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text", "p_origem" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_relatorio_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text", "p_origem" "text") TO "service_role";


--
-- Name: FUNCTION "fn_relatorio_status_validacao"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_relatorio_status_validacao"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_relatorio_status_validacao"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_relatorio_status_validacao"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) TO "service_role";


--
-- Name: FUNCTION "fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text") TO "service_role";


--
-- Name: FUNCTION "fn_set_pago_em"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_set_pago_em"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_set_pago_em"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_set_pago_em"() TO "service_role";


--
-- Name: FUNCTION "fn_set_setor_foto"("p_setor_id" "uuid", "p_foto_url" "text", "p_campo" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_set_setor_foto"("p_setor_id" "uuid", "p_foto_url" "text", "p_campo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_set_setor_foto"("p_setor_id" "uuid", "p_foto_url" "text", "p_campo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_set_setor_foto"("p_setor_id" "uuid", "p_foto_url" "text", "p_campo" "text") TO "service_role";


--
-- Name: FUNCTION "fn_setor_acordo"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_setor_acordo"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_setor_acordo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_setor_acordo"() TO "service_role";


--
-- Name: FUNCTION "fn_setores_do_operador"("p_operador" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_setores_do_operador"("p_operador" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_setores_do_operador"("p_operador" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_setores_do_operador"("p_operador" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_sincronizar_cartoes_pagos"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_sincronizar_cartoes_pagos"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_sincronizar_cartoes_pagos"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sincronizar_cartoes_pagos"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";


--
-- Name: FUNCTION "fn_situacao_operador"("p_operador_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_situacao_operador"("p_operador_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_situacao_operador"("p_operador_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_situacao_operador"("p_operador_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_solicitacao_recusa_cpf"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_solicitacao_recusa_cpf"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_solicitacao_recusa_cpf"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_solicitacao_recusa_cpf"() TO "service_role";


--
-- Name: FUNCTION "fn_super_admin_permissoes_completas"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_super_admin_permissoes_completas"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_super_admin_permissoes_completas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_super_admin_permissoes_completas"() TO "service_role";


--
-- Name: FUNCTION "fn_sync_nr_registros"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_sync_nr_registros"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_sync_nr_registros"() TO "service_role";


--
-- Name: FUNCTION "fn_sync_par_vinculo"("p_acordo_id" "uuid", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_whatsapp" "text", "p_parcelas" integer, "p_status" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_sync_par_vinculo"("p_acordo_id" "uuid", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_whatsapp" "text", "p_parcelas" integer, "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_sync_par_vinculo"("p_acordo_id" "uuid", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_whatsapp" "text", "p_parcelas" integer, "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_par_vinculo"("p_acordo_id" "uuid", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_whatsapp" "text", "p_parcelas" integer, "p_status" "text") TO "service_role";


--
-- Name: FUNCTION "fn_texto_censurado_cpf"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_texto_censurado_cpf"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_texto_censurado_cpf"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_texto_censurado_cpf"() TO "service_role";


--
-- Name: FUNCTION "fn_texto_tem_cpf"("p_texto" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_texto_tem_cpf"("p_texto" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_texto_tem_cpf"("p_texto" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_texto_tem_cpf"("p_texto" "text") TO "service_role";


--
-- Name: FUNCTION "fn_transferencia_desfazer"("p_transferencia_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_transferencia_desfazer"("p_transferencia_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_transferencia_desfazer"("p_transferencia_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_transferencia_desfazer"("p_transferencia_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_transferencia_mover_empresa"("p_perfil_id" "uuid", "p_empresa_id" "uuid", "p_setor_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_transferencia_mover_empresa"("p_perfil_id" "uuid", "p_empresa_id" "uuid", "p_setor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_transferencia_mover_empresa"("p_perfil_id" "uuid", "p_empresa_id" "uuid", "p_setor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_transferencia_mover_empresa"("p_perfil_id" "uuid", "p_empresa_id" "uuid", "p_setor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_transferir_acordo_nr"("p_acordo_id" "uuid", "p_novo_operador_id" "uuid", "p_motivo" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_transferir_acordo_nr"("p_acordo_id" "uuid", "p_novo_operador_id" "uuid", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_transferir_acordo_nr"("p_acordo_id" "uuid", "p_novo_operador_id" "uuid", "p_motivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_transferir_acordo_nr"("p_acordo_id" "uuid", "p_novo_operador_id" "uuid", "p_motivo" "text") TO "service_role";


--
-- Name: FUNCTION "fn_user_empresa_id"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_user_empresa_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_user_empresa_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_user_empresa_id"() TO "service_role";


--
-- Name: FUNCTION "fn_user_empresa_is_bookplay"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_user_empresa_is_bookplay"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_user_empresa_is_bookplay"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_user_empresa_is_bookplay"() TO "service_role";


--
-- Name: FUNCTION "fn_user_empresa_is_pagueplay"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_user_empresa_is_pagueplay"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_user_empresa_is_pagueplay"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_user_empresa_is_pagueplay"() TO "service_role";


--
-- Name: FUNCTION "fn_user_has_any_role"("roles" "text"[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_user_has_any_role"("roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_user_has_any_role"("roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_user_has_any_role"("roles" "text"[]) TO "service_role";


--
-- Name: FUNCTION "fn_user_is_super_admin"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_user_is_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_user_is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_user_is_super_admin"() TO "service_role";


--
-- Name: FUNCTION "fn_user_perfil"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_user_perfil"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_user_perfil"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_user_perfil"() TO "service_role";


--
-- Name: FUNCTION "fn_user_setor_id"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_user_setor_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_user_setor_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_user_setor_id"() TO "service_role";


--
-- Name: FUNCTION "fn_validar_empresa_dos_perfis_do_acordo"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_validar_empresa_dos_perfis_do_acordo"() FROM PUBLIC;


--
-- Name: FUNCTION "fn_vincular_extra_ao_direto"("p_direto_id" "uuid", "p_extra_op_id" "uuid", "p_extra_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text", "p_parcelas" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_vincular_extra_ao_direto"("p_direto_id" "uuid", "p_extra_op_id" "uuid", "p_extra_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text", "p_parcelas" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_vincular_extra_ao_direto"("p_direto_id" "uuid", "p_extra_op_id" "uuid", "p_extra_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text", "p_parcelas" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_vincular_extra_ao_direto"("p_direto_id" "uuid", "p_extra_op_id" "uuid", "p_extra_op_nome" "text", "p_valor" numeric, "p_vencimento" "date", "p_nome_cliente" "text", "p_tipo" "text", "p_nr_cliente" "text", "p_instituicao" "text", "p_whatsapp" "text", "p_parcelas" integer) TO "service_role";


--
-- Name: FUNCTION "fn_wpp_carimbos"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_wpp_carimbos"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_wpp_carimbos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_carimbos"() TO "service_role";


--
-- Name: FUNCTION "fn_wpp_chat_aberto"("p_solicitacao_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_chat_aberto"("p_solicitacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_chat_aberto"("p_solicitacao_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_chat_aberto"("p_solicitacao_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wpp_diretorio"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_diretorio"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_diretorio"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_diretorio"() TO "service_role";


--
-- Name: FUNCTION "fn_wpp_eh_responsavel"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_eh_responsavel"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_eh_responsavel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_eh_responsavel"() TO "service_role";


--
-- Name: FUNCTION "fn_wpp_limite_pendentes"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_limite_pendentes"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_limite_pendentes"() TO "service_role";


--
-- Name: FUNCTION "fn_wpp_limpa_nao_concluido"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_wpp_limpa_nao_concluido"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_wpp_limpa_nao_concluido"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_limpa_nao_concluido"() TO "service_role";


--
-- Name: FUNCTION "fn_wpp_marcar_nao_concluidos"("p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_marcar_nao_concluidos"("p_empresa_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_marcar_nao_concluidos"("p_empresa_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_marcar_nao_concluidos"("p_empresa_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wpp_notificar_exclusao"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_notificar_exclusao"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_notificar_exclusao"() TO "service_role";


--
-- Name: FUNCTION "fn_wpp_notificar_mensagem"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_notificar_mensagem"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_notificar_mensagem"() TO "service_role";


--
-- Name: FUNCTION "fn_wpp_pode_falar"("p_solicitacao_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_pode_falar"("p_solicitacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_pode_falar"("p_solicitacao_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_pode_falar"("p_solicitacao_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wpp_pode_ver_solicitacao"("p_solicitacao_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_pode_ver_solicitacao"("p_solicitacao_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_pode_ver_solicitacao"("p_solicitacao_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_pode_ver_solicitacao"("p_solicitacao_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wpp_registrar_evento"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_registrar_evento"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_registrar_evento"() TO "service_role";


--
-- Name: FUNCTION "fn_wpp_tem_visao_geral"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_tem_visao_geral"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wpp_tem_visao_geral"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wpp_tem_visao_geral"() TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "prevent_empresa_id_update"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."prevent_empresa_id_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_empresa_id_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_empresa_id_update"() TO "service_role";


--
-- Name: FUNCTION "set_direto_extra_config_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_direto_extra_config_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_direto_extra_config_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_direto_extra_config_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_nr_registros_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_nr_registros_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_nr_registros_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_nr_registros_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_updated_at_cargos"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_updated_at_cargos"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_cargos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_cargos"() TO "service_role";


--
-- Name: FUNCTION "update_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


--
-- Name: TABLE "aceites_termo"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."aceites_termo" TO "anon";
GRANT ALL ON TABLE "public"."aceites_termo" TO "authenticated";
GRANT ALL ON TABLE "public"."aceites_termo" TO "service_role";


--
-- Name: TABLE "acordos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."acordos" TO "anon";
GRANT ALL ON TABLE "public"."acordos" TO "authenticated";
GRANT ALL ON TABLE "public"."acordos" TO "service_role";


--
-- Name: TABLE "acordos_deduplicados"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."acordos_deduplicados" TO "anon";
GRANT ALL ON TABLE "public"."acordos_deduplicados" TO "authenticated";
GRANT ALL ON TABLE "public"."acordos_deduplicados" TO "service_role";


--
-- Name: TABLE "ai_config"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ai_config" TO "anon";
GRANT ALL ON TABLE "public"."ai_config" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_config" TO "service_role";


--
-- Name: TABLE "analitico_exclusoes_setor"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."analitico_exclusoes_setor" TO "anon";
GRANT ALL ON TABLE "public"."analitico_exclusoes_setor" TO "authenticated";
GRANT ALL ON TABLE "public"."analitico_exclusoes_setor" TO "service_role";


--
-- Name: TABLE "analitico_recebimentos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."analitico_recebimentos" TO "anon";
GRANT ALL ON TABLE "public"."analitico_recebimentos" TO "authenticated";
GRANT ALL ON TABLE "public"."analitico_recebimentos" TO "service_role";


--
-- Name: TABLE "analitico_resumo_mensal"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."analitico_resumo_mensal" TO "anon";
GRANT ALL ON TABLE "public"."analitico_resumo_mensal" TO "authenticated";
GRANT ALL ON TABLE "public"."analitico_resumo_mensal" TO "service_role";


--
-- Name: TABLE "api_rate_limits"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."api_rate_limits" TO "service_role";


--
-- Name: TABLE "atendimento_responsaveis"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."atendimento_responsaveis" TO "anon";
GRANT ALL ON TABLE "public"."atendimento_responsaveis" TO "authenticated";
GRANT ALL ON TABLE "public"."atendimento_responsaveis" TO "service_role";


--
-- Name: TABLE "campanha_facil_descontos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."campanha_facil_descontos" TO "anon";
GRANT ALL ON TABLE "public"."campanha_facil_descontos" TO "authenticated";
GRANT ALL ON TABLE "public"."campanha_facil_descontos" TO "service_role";


--
-- Name: TABLE "campanha_facil_mensagens"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."campanha_facil_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."campanha_facil_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."campanha_facil_mensagens" TO "service_role";


--
-- Name: TABLE "campanha_facil_mensagens_ocultas"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."campanha_facil_mensagens_ocultas" TO "anon";
GRANT ALL ON TABLE "public"."campanha_facil_mensagens_ocultas" TO "authenticated";
GRANT ALL ON TABLE "public"."campanha_facil_mensagens_ocultas" TO "service_role";


--
-- Name: TABLE "cargos_permissoes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."cargos_permissoes" TO "anon";
GRANT ALL ON TABLE "public"."cargos_permissoes" TO "authenticated";
GRANT ALL ON TABLE "public"."cargos_permissoes" TO "service_role";


--
-- Name: TABLE "comemoracao_homenageados"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."comemoracao_homenageados" TO "anon";
GRANT ALL ON TABLE "public"."comemoracao_homenageados" TO "authenticated";
GRANT ALL ON TABLE "public"."comemoracao_homenageados" TO "service_role";


--
-- Name: TABLE "comemoracao_parabens"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."comemoracao_parabens" TO "anon";
GRANT ALL ON TABLE "public"."comemoracao_parabens" TO "authenticated";
GRANT ALL ON TABLE "public"."comemoracao_parabens" TO "service_role";


--
-- Name: TABLE "comemoracoes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."comemoracoes" TO "anon";
GRANT ALL ON TABLE "public"."comemoracoes" TO "authenticated";
GRANT ALL ON TABLE "public"."comemoracoes" TO "service_role";


--
-- Name: TABLE "composicao_mes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."composicao_mes" TO "anon";
GRANT ALL ON TABLE "public"."composicao_mes" TO "authenticated";
GRANT ALL ON TABLE "public"."composicao_mes" TO "service_role";


--
-- Name: TABLE "composicao_mes_equipe"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."composicao_mes_equipe" TO "anon";
GRANT ALL ON TABLE "public"."composicao_mes_equipe" TO "authenticated";
GRANT ALL ON TABLE "public"."composicao_mes_equipe" TO "service_role";


--
-- Name: TABLE "contribuicao_receptivo"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."contribuicao_receptivo" TO "anon";
GRANT ALL ON TABLE "public"."contribuicao_receptivo" TO "authenticated";
GRANT ALL ON TABLE "public"."contribuicao_receptivo" TO "service_role";


--
-- Name: TABLE "diario_recebimentos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."diario_recebimentos" TO "anon";
GRANT ALL ON TABLE "public"."diario_recebimentos" TO "authenticated";
GRANT ALL ON TABLE "public"."diario_recebimentos" TO "service_role";


--
-- Name: TABLE "direto_extra_config"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."direto_extra_config" TO "anon";
GRANT ALL ON TABLE "public"."direto_extra_config" TO "authenticated";
GRANT ALL ON TABLE "public"."direto_extra_config" TO "service_role";


--
-- Name: TABLE "documentos_lgpd"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."documentos_lgpd" TO "anon";
GRANT ALL ON TABLE "public"."documentos_lgpd" TO "authenticated";
GRANT ALL ON TABLE "public"."documentos_lgpd" TO "service_role";


--
-- Name: TABLE "empresas"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."empresas" TO "anon";
GRANT ALL ON TABLE "public"."empresas" TO "authenticated";
GRANT ALL ON TABLE "public"."empresas" TO "service_role";


--
-- Name: TABLE "equipe_lideres"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."equipe_lideres" TO "anon";
GRANT ALL ON TABLE "public"."equipe_lideres" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_lideres" TO "service_role";


--
-- Name: TABLE "equipe_operadores_clones"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."equipe_operadores_clones" TO "anon";
GRANT ALL ON TABLE "public"."equipe_operadores_clones" TO "authenticated";
GRANT ALL ON TABLE "public"."equipe_operadores_clones" TO "service_role";


--
-- Name: TABLE "equipes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."equipes" TO "anon";
GRANT ALL ON TABLE "public"."equipes" TO "authenticated";
GRANT ALL ON TABLE "public"."equipes" TO "service_role";


--
-- Name: TABLE "historico_acordos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."historico_acordos" TO "anon";
GRANT ALL ON TABLE "public"."historico_acordos" TO "authenticated";
GRANT ALL ON TABLE "public"."historico_acordos" TO "service_role";


--
-- Name: TABLE "lixeira_acordos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."lixeira_acordos" TO "anon";
GRANT ALL ON TABLE "public"."lixeira_acordos" TO "authenticated";
GRANT ALL ON TABLE "public"."lixeira_acordos" TO "service_role";


--
-- Name: TABLE "lixeira_pix_automatico"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."lixeira_pix_automatico" TO "anon";
GRANT ALL ON TABLE "public"."lixeira_pix_automatico" TO "authenticated";
GRANT ALL ON TABLE "public"."lixeira_pix_automatico" TO "service_role";


--
-- Name: TABLE "logs_sistema"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."logs_sistema" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."logs_sistema" TO "authenticated";
GRANT ALL ON TABLE "public"."logs_sistema" TO "service_role";


--
-- Name: TABLE "logs_whatsapp"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."logs_whatsapp" TO "anon";
GRANT ALL ON TABLE "public"."logs_whatsapp" TO "authenticated";
GRANT ALL ON TABLE "public"."logs_whatsapp" TO "service_role";


--
-- Name: TABLE "metas"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."metas" TO "anon";
GRANT ALL ON TABLE "public"."metas" TO "authenticated";
GRANT ALL ON TABLE "public"."metas" TO "service_role";


--
-- Name: TABLE "metas_config_mes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."metas_config_mes" TO "anon";
GRANT ALL ON TABLE "public"."metas_config_mes" TO "authenticated";
GRANT ALL ON TABLE "public"."metas_config_mes" TO "service_role";


--
-- Name: TABLE "metas_validacoes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."metas_validacoes" TO "anon";
GRANT ALL ON TABLE "public"."metas_validacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."metas_validacoes" TO "service_role";


--
-- Name: TABLE "modelos_mensagem"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."modelos_mensagem" TO "anon";
GRANT ALL ON TABLE "public"."modelos_mensagem" TO "authenticated";
GRANT ALL ON TABLE "public"."modelos_mensagem" TO "service_role";


--
-- Name: TABLE "notificacoes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."notificacoes" TO "anon";
GRANT ALL ON TABLE "public"."notificacoes" TO "authenticated";
GRANT ALL ON TABLE "public"."notificacoes" TO "service_role";


--
-- Name: TABLE "nr_registros"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."nr_registros" TO "anon";
GRANT ALL ON TABLE "public"."nr_registros" TO "authenticated";
GRANT ALL ON TABLE "public"."nr_registros" TO "service_role";


--
-- Name: TABLE "ouvidoria_acessos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ouvidoria_acessos" TO "anon";
GRANT ALL ON TABLE "public"."ouvidoria_acessos" TO "authenticated";
GRANT ALL ON TABLE "public"."ouvidoria_acessos" TO "service_role";


--
-- Name: TABLE "ouvidoria_atendimentos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ouvidoria_atendimentos" TO "anon";
GRANT ALL ON TABLE "public"."ouvidoria_atendimentos" TO "authenticated";
GRANT ALL ON TABLE "public"."ouvidoria_atendimentos" TO "service_role";


--
-- Name: TABLE "perfis"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."perfis" TO "anon";
GRANT ALL ON TABLE "public"."perfis" TO "authenticated";
GRANT ALL ON TABLE "public"."perfis" TO "service_role";


--
-- Name: TABLE "perfis_transferencias"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."perfis_transferencias" TO "anon";
GRANT ALL ON TABLE "public"."perfis_transferencias" TO "authenticated";
GRANT ALL ON TABLE "public"."perfis_transferencias" TO "service_role";


--
-- Name: TABLE "pet_economia_regras"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pet_economia_regras" TO "anon";
GRANT ALL ON TABLE "public"."pet_economia_regras" TO "authenticated";
GRANT ALL ON TABLE "public"."pet_economia_regras" TO "service_role";


--
-- Name: TABLE "pet_inventario"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pet_inventario" TO "anon";
GRANT ALL ON TABLE "public"."pet_inventario" TO "authenticated";
GRANT ALL ON TABLE "public"."pet_inventario" TO "service_role";


--
-- Name: TABLE "pet_itens"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pet_itens" TO "anon";
GRANT ALL ON TABLE "public"."pet_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."pet_itens" TO "service_role";


--
-- Name: TABLE "pet_nome_votos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pet_nome_votos" TO "anon";
GRANT ALL ON TABLE "public"."pet_nome_votos" TO "authenticated";
GRANT ALL ON TABLE "public"."pet_nome_votos" TO "service_role";


--
-- Name: TABLE "pet_recompensas"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pet_recompensas" TO "anon";
GRANT ALL ON TABLE "public"."pet_recompensas" TO "authenticated";
GRANT ALL ON TABLE "public"."pet_recompensas" TO "service_role";


--
-- Name: TABLE "pix_automatico_acordos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pix_automatico_acordos" TO "anon";
GRANT ALL ON TABLE "public"."pix_automatico_acordos" TO "authenticated";
GRANT ALL ON TABLE "public"."pix_automatico_acordos" TO "service_role";


--
-- Name: TABLE "pix_automatico_config"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pix_automatico_config" TO "anon";
GRANT ALL ON TABLE "public"."pix_automatico_config" TO "authenticated";
GRANT ALL ON TABLE "public"."pix_automatico_config" TO "service_role";


--
-- Name: TABLE "pix_automatico_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pix_automatico_log" TO "anon";
GRANT ALL ON TABLE "public"."pix_automatico_log" TO "authenticated";
GRANT ALL ON TABLE "public"."pix_automatico_log" TO "service_role";


--
-- Name: TABLE "pix_automatico_metas"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pix_automatico_metas" TO "anon";
GRANT ALL ON TABLE "public"."pix_automatico_metas" TO "authenticated";
GRANT ALL ON TABLE "public"."pix_automatico_metas" TO "service_role";


--
-- Name: TABLE "pix_automatico_nr_registro"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."pix_automatico_nr_registro" TO "anon";
GRANT ALL ON TABLE "public"."pix_automatico_nr_registro" TO "authenticated";
GRANT ALL ON TABLE "public"."pix_automatico_nr_registro" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "profissionais"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."profissionais" TO "anon";
GRANT ALL ON TABLE "public"."profissionais" TO "authenticated";
GRANT ALL ON TABLE "public"."profissionais" TO "service_role";


--
-- Name: TABLE "relatorio_validacoes_dia"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."relatorio_validacoes_dia" TO "anon";
GRANT ALL ON TABLE "public"."relatorio_validacoes_dia" TO "authenticated";
GRANT ALL ON TABLE "public"."relatorio_validacoes_dia" TO "service_role";


--
-- Name: TABLE "setores"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."setores" TO "anon";
GRANT ALL ON TABLE "public"."setores" TO "authenticated";
GRANT ALL ON TABLE "public"."setores" TO "service_role";


--
-- Name: TABLE "solicitacoes_whatsapp"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."solicitacoes_whatsapp" TO "anon";
GRANT ALL ON TABLE "public"."solicitacoes_whatsapp" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_whatsapp" TO "service_role";


--
-- Name: TABLE "solicitacoes_whatsapp_eventos"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_eventos" TO "anon";
GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_eventos" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_eventos" TO "service_role";


--
-- Name: TABLE "solicitacoes_whatsapp_leitura"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_leitura" TO "anon";
GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_leitura" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_leitura" TO "service_role";


--
-- Name: TABLE "solicitacoes_whatsapp_mensagens"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_mensagens" TO "anon";
GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_mensagens" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitacoes_whatsapp_mensagens" TO "service_role";


--
-- Name: TABLE "tags"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";


--
-- Name: TABLE "termos_uso"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."termos_uso" TO "anon";
GRANT ALL ON TABLE "public"."termos_uso" TO "authenticated";
GRANT ALL ON TABLE "public"."termos_uso" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--
