-- ARQUIVO DE AUDITORIA — NAO EXECUTE.
--
-- Este e o rollback que reverteu no banco as oito migrations de 2026-08-20,
-- pareando com o commit c953f04 ("revert: restore project before Aug 20").
-- Ele rodou uma unica vez no projeto vfrvvoetidtsqbbhdkmj em 2026-08-20
-- 23:23:02 UTC e ficou registrado em supabase_migrations.schema_migrations
-- como 20260820232302_rollback_all_changes_20260820.
--
-- Por que mora aqui e nao em supabase/migrations/:
-- o script NAO e reexecutavel. Ele comeca exigindo que a tabela
-- public.permissoes_backup_20260820 exista e termina dropando essa mesma
-- tabela. Num `supabase db reset` a cadeia ativa nunca cria esse backup,
-- entao o script abortaria em "Backup inicial de permissoes nao existe".
--
-- O registro dele foi removido do historico remoto (repair --status reverted)
-- para que `supabase migration list` volte a bater com a pasta ativa.
--
-- Abaixo segue o statement exato recuperado do banco, sem edicoes.
-- ---------------------------------------------------------------------------


BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $verify_backups$
BEGIN
  IF to_regclass('public.permissoes_backup_20260820') IS NULL THEN
    RAISE EXCEPTION 'Backup inicial de permissões não existe; rollback cancelado';
  END IF;
  IF (SELECT count(*) FROM public.permissoes_backup_20260820 WHERE origem='cargo') <> 16
     OR (SELECT count(*) FROM public.permissoes_backup_20260820 WHERE origem='pessoa') <> 1 THEN
    RAISE EXCEPTION 'Contagem do backup inicial divergiu; rollback cancelado';
  END IF;
END
$verify_backups$;

LOCK TABLE public.cargos_permissoes, public.perfis_permissoes IN EXCLUSIVE MODE;

ALTER TABLE public.cargos_permissoes DISABLE TRIGGER USER;
ALTER TABLE public.perfis_permissoes DISABLE TRIGGER USER;

DELETE FROM public.cargos_permissoes;
INSERT INTO public.cargos_permissoes
SELECT (jsonb_populate_record(NULL::public.cargos_permissoes, dados)).*
FROM public.permissoes_backup_20260820
WHERE origem='cargo';

DELETE FROM public.perfis_permissoes;
INSERT INTO public.perfis_permissoes
SELECT (jsonb_populate_record(NULL::public.perfis_permissoes, dados)).*
FROM public.permissoes_backup_20260820
WHERE origem='pessoa';

ALTER TABLE public.cargos_permissoes ENABLE TRIGGER USER;
ALTER TABLE public.perfis_permissoes ENABLE TRIGGER USER;

DO $verify_permission_restore$
BEGIN
  IF EXISTS (
    (SELECT to_jsonb(cp) FROM public.cargos_permissoes cp
     EXCEPT SELECT dados FROM public.permissoes_backup_20260820 WHERE origem='cargo')
    UNION ALL
    (SELECT dados FROM public.permissoes_backup_20260820 WHERE origem='cargo'
     EXCEPT SELECT to_jsonb(cp) FROM public.cargos_permissoes cp)
    UNION ALL
    (SELECT to_jsonb(pp) FROM public.perfis_permissoes pp
     EXCEPT SELECT dados FROM public.permissoes_backup_20260820 WHERE origem='pessoa')
    UNION ALL
    (SELECT dados FROM public.permissoes_backup_20260820 WHERE origem='pessoa'
     EXCEPT SELECT to_jsonb(pp) FROM public.perfis_permissoes pp)
  ) THEN
    RAISE EXCEPTION 'Permissões restauradas não conferem com o backup';
  END IF;
END
$verify_permission_restore$;

-- Remove somente os registros de auditoria produzidos pelas alterações de
-- permissões de hoje; logs operacionais das demais tabelas são preservados.
DELETE FROM public.logs_sistema
WHERE tabela IN ('cargos_permissoes','perfis_permissoes')
  AND criado_em >= timestamptz '2026-08-20 00:00:00-03'
  AND criado_em <  timestamptz '2026-08-21 00:00:00-03';

DO $drop_today_policies$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND (policyname LIKE 'permissoes3\_%' ESCAPE '\'
        OR policyname LIKE 'permissoes4\_%' ESCAPE '\')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;
END
$drop_today_policies$;

DROP TRIGGER IF EXISTS trg_permissoes4_acordo_validar_update ON public.acordos;

DROP FUNCTION IF EXISTS public.fn_analitico_dashboard_mes_json(UUID,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.fn_analitico_dashboard_mes(UUID,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.fn_analitico_resumo_por_operador(UUID,TEXT,TEXT);
DROP FUNCTION IF EXISTS public.fn_diario_resumo_mensal(UUID,TEXT,TEXT);

-- Restaurada de 20260817120000_logs_higiene_e_cobertura.sql
create OR REPLACE FUNCTION public.fn_admin_apagar_acordos_do_usuario(
  p_user_id uuid, p_empresa_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_apagados       int := 0;
  v_empresa_escopo uuid;
begin
  if not public.fn_user_has_any_role(array['administrador','super_admin']) then
    raise exception 'Sem permissão para apagar acordos de usuário' using errcode = '42501';
  end if;

  if p_empresa_id is null then
    select empresa_id into v_empresa_escopo from public.perfis where id = p_user_id;
    if not found then
      raise exception 'Perfil % não encontrado', p_user_id;
    end if;
  else
    v_empresa_escopo := p_empresa_id;
  end if;

  if not public.fn_can_access_empresa(v_empresa_escopo) then
    raise exception 'Sem permissão para apagar acordos de usuário de outra empresa'
      using errcode = '42501';
  end if;

  -- O acordo do outro operador sobrevive. Só a referência ao transferido sai:
  -- DIRETO fica sem EXTRA; EXTRA continua EXTRA, porém sem DIRETO associado.
  update public.acordos
     set vinculo_operador_id   = null,
         vinculo_operador_nome = null
   where vinculo_operador_id = p_user_id
     and operador_id is distinct from p_user_id
     and (p_empresa_id is null or empresa_id = p_empresa_id);

  delete from public.acordos
   where operador_id = p_user_id
     and (p_empresa_id is null or empresa_id = p_empresa_id);
  get diagnostics v_apagados = row_count;

  -- Rastro deixado pelo perfil em acordos de terceiros.
  delete from public.historico_acordos where usuario_id = p_user_id;

  -- Aqui existia `DELETE FROM logs_whatsapp`, que nunca apagou nada (tabela
  -- vazia, hoje removida). NÃO ganhou substituto: a trilha de auditoria é
  -- append-only, e exclusão de usuário não apaga auditoria. Expurgo de trilha
  -- tem caminho próprio, com piso de idade e registro — `fn_logs_expurgar`.

  -- Sobra defensiva: `nr_registros` é índice derivado e não tem FK.
  delete from public.nr_registros nr
   where nr.operador_id = p_user_id
     and not exists (select 1 from public.acordos a where a.id = nr.acordo_id);

  return v_apagados;
end;
$$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_admin_delete_user("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_admin_delete_user"("p_user_id" "uuid", "p_apagar_acordos" boolean DEFAULT false) RETURNS "jsonb"
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

-- Restaurada de 20260817120000_logs_higiene_e_cobertura.sql
-- ============================================================================
-- 5. `logs_whatsapp` — tabela morta que fazia uma contagem mentir
-- ============================================================================
-- Zero linhas. Nunca escrita, nunca lida pelo aplicativo. Sobreviveu em dois
-- lugares do baseline, e um deles é pior que inútil:
--
--   • `fn_admin_resumo_exclusao_usuario` conta essa tabela e devolve o número
--     no campo `logs` do resumo mostrado antes de excluir um usuário. Como a
--     tabela está vazia, o resumo SEMPRE diz zero — enquanto a pessoa pode ter
--     centenas de eventos em `logs_sistema`. Um relatório de exclusão que
--     afirma "0 logs" é pior que um relatório sem o campo.
--
--   • `fn_admin_apagar_acordos_do_usuario` faz um DELETE que nunca apaga nada.
--
-- A contagem passa a sair de `logs_sistema`, com o nome `logs_auditoria` para
-- dizer o que é. E ela é INFORMATIVA: a trilha é append-only e a exclusão do
-- usuário não a toca — quem apaga auditoria é `fn_logs_expurgar`, com piso de
-- 30 dias e registro próprio. O DELETE morto sai sem substituto, de propósito:
-- pedido de exclusão de usuário não apaga trilha de auditoria.
-- ============================================================================

create OR REPLACE FUNCTION public.fn_admin_resumo_exclusao_usuario(p_user_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_empresa uuid;
  v_nome    text;
begin
  if not public.fn_user_has_any_role(array['administrador','super_admin']) then
    raise exception 'Sem permissão para excluir usuários' using errcode = '42501';
  end if;

  select empresa_id, nome into v_empresa, v_nome
    from public.perfis where id = p_user_id;

  if not public.fn_can_access_empresa(v_empresa) then
    raise exception 'Sem permissão para excluir usuário de outra empresa' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'nome',       v_nome,
    'empresa_id', v_empresa,
    'acordos',    (select count(*) from public.acordos           where operador_id = p_user_id),
    'historico',  (select count(*) from public.historico_acordos where usuario_id  = p_user_id),
    -- Informativo: a trilha NÃO é apagada com o usuário. O campo existe para o
    -- administrador saber o tamanho do rastro que fica, não o que sai.
    'logs_auditoria', (select count(*) from public.logs_sistema  where usuario_id  = p_user_id)
  );
end;
$$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_analitico_dashboard_mes("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_analitico_dashboard_mes"("p_empresa_id" "uuid", "p_mes" "text") RETURNS TABLE("dia" "date", "operador_id" "uuid", "forma_pagamento" "text", "forma_detalhe" "text", "status_tabulacao" "text", "total" numeric, "total_ho" numeric, "qtd" bigint)
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_analitico_dashboard_mes_json("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_analitico_dashboard_mes_json"("p_empresa_id" "uuid", "p_mes" "text") RETURNS "jsonb"
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_analitico_destaques_dia("uuid", "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_analitico_destaques_dia"("p_empresa_id" "uuid", "p_mes" "text", "p_equipe_id" "uuid" DEFAULT NULL::"uuid", "p_setor_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("dia" "date", "operador_id" "uuid", "operador_usuario" "text", "operador_nome" "text", "total_recebido" numeric, "total_pagamentos" bigint)
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_analitico_resumo_por_operador("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_analitico_resumo_por_operador"("p_empresa_id" "uuid", "p_mes" "text") RETURNS TABLE("operador_id" "uuid", "operador_usuario" "text", "operador_nome" "text", "total_recebido" numeric, "total_ho" numeric, "total_pagamentos" bigint)
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

-- Restaurada de 20260818300000_acesso_multiempresa.sql
-- As 68 policies (e as funcoes do analitico) que ja passavam por aqui.

create OR REPLACE FUNCTION public.fn_can_access_empresa(target_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  SELECT public.fn_user_is_super_admin()
      OR public.fn_user_acesso_multiempresa()
      OR target_empresa_id = public.fn_user_empresa_id();
$fn$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_comemoracao_finalizar("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") RETURNS "void"
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_comemoracao_midia_fixar("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean) RETURNS "public"."comemoracao_midias"
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_comemoracao_pode_criar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_comemoracao_pode_criar"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.fn_user_has_any_role(
    ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
  );
$$;

-- Restaurada de 20260818340000_lider_conta_na_equipe.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- O recebimento do LÍDER passa a contar na equipe que ele lidera
-- ─────────────────────────────────────────────────────────────────────────────
-- O PROBLEMA
-- Um líder também atende, e as linhas dele entram no analítico como as de
-- qualquer um. Mas o retrato do mês (`composicao_mes`) monta a equipe de cada
-- pessoa a partir de `perfis.equipe_id` — o modelo LEGADO. Quem foi vinculado
-- pela tela de Equipes está em `equipe_lideres` (20260725b) e continua com
-- `perfis.equipe_id` NULO.
--
-- Medido na BookPlay em 2026-08: R$ 4.597,92 recebidos por cargos de liderança
-- no mês. Só o líder Matheus Costa tem R$ 1.316,17 — ele é o líder explícito da
-- equipe "Matheus", e no retrato do mês está gravado como "Sem equipe". O
-- dinheiro aparecia no total do SETOR (que sai do carimbo do relatório) e não
-- aparecia em card de equipe nenhum: o setor não fechava com a soma das equipes.
--
-- A REGRA
-- Vale `perfis.equipe_id` quando existe; na falta dele, o vínculo explícito de
-- `equipe_lideres` — e SÓ quando ele é único. Quem lidera três equipes não tem
-- "a sua equipe": creditar as três contaria o mesmo dinheiro três vezes dentro
-- do mesmo setor. Esse caso fica como está (conta no setor, não na equipe).
--
-- É a mesma regra do caminho ao vivo, em `src/services/equipes/equipeDoLider.ts`
-- e `buscarComposicaoAoVivo`. As duas fontes do `operadorEquipeMap` têm que
-- concordar, senão o painel muda de número quando o mês é congelado.

CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(p_empresa_id uuid, p_mes text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linhas          INTEGER;
  v_equipes         INTEGER;
  v_antes_operador  INTEGER;
  v_antes_equipe    INTEGER;
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

  -- Contagem anterior: é o que permite ler no log se o retrato cresceu,
  -- encolheu ou ficou igual — a única pergunta que as 240 linhas por execução
  -- respondiam, e respondiam mal.
  SELECT count(*) INTO v_antes_operador
    FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  SELECT count(*) INTO v_antes_equipe
    FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  DELETE FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  DELETE FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone)
  SELECT p_empresa_id, p_mes, p.id, v.equipe_id,
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
    -- A equipe do líder explícito entra AQUI, e não num COALESCE solto no
    -- SELECT, porque o LEFT JOIN de `equipes` logo abaixo precisa enxergá-la —
    -- é dele que saem o nome e o setor gravados no retrato.
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        p.equipe_id,
        (SELECT (array_agg(DISTINCT el.equipe_id))[1]
           FROM public.equipe_lideres el
          WHERE el.empresa_id = p_empresa_id
            AND el.lider_id   = p.id
         -- Agregado sem GROUP BY devolve UMA linha; o HAVING a descarta quando
         -- o líder comanda mais de uma equipe. Ver o cabeçalho da migration.
         HAVING count(DISTINCT el.equipe_id) = 1)
      ) AS equipe_id
    ) v ON TRUE
    LEFT JOIN public.equipes e ON e.id = v.equipe_id
   WHERE p.empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  -- Um log por execução. `fn_log_registrar` nunca levanta exceção, então o
  -- retrato não deixa de ser gravado se a auditoria falhar.
  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => format(
      'Regerou a composição do mês %s — %s operador(es) e %s equipe(s)',
      p_mes, v_linhas, v_equipes
    ),
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes',                p_mes,
      'operadores',         v_linhas,
      'equipes',            v_equipes,
      'operadores_antes',   v_antes_operador,
      'equipes_antes',      v_antes_equipe
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_diario_resumo_mensal("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_diario_resumo_mensal"("p_empresa_id" "uuid", "p_mes" "text") RETURNS TABLE("operador_id" "uuid", "operador_usuario" "text", "operador_nome" "text", "setor_geral" "uuid", "dia_referencia" "date", "fora_vinculo" boolean, "total_recebido" numeric, "total_pagamentos" bigint)
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_diario_resumo_mes("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_diario_resumo_mes"("p_empresa_id" "uuid", "p_mes" "text") RETURNS TABLE("total_recebido" numeric, "total_dias" integer)
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

-- Restaurada de 20260815164700_perfis_rls_sem_atalho_legado.sql
-- ── 2. Ninguém muda o próprio cargo ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_impedir_escalada_de_cargo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- O caminho comum: a tela de usuários manda `perfil` no payload mesmo quando
  -- só corrigiu o nome. Valor igual não é mudança de cargo.
  IF NEW.perfil IS NOT DISTINCT FROM OLD.perfil THEN
    RETURN NEW;
  END IF;

  -- Sem sessão de usuário: service_role, SQL Editor, migrations, seeds. Barrar
  -- aqui deixaria o banco sem manutenção possível.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- super_admin é a saída de manutenção, a mesma do cadeado do mês.
  IF public.fn_user_is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    RAISE EXCEPTION
      'Ninguém altera o próprio cargo. Peça a um administrador.'
      USING ERRCODE = '42501';
  END IF;

  -- Mudar o cargo de OUTRA pessoa continua sendo assunto da RLS: quem chega até
  -- aqui já passou por `perfis_admin_all` ou `perfis_lider_update`. Repetir a
  -- regra na trigger criaria duas fontes para a mesma pergunta, que é como as
  -- políticas desta tabela divergiram em primeiro lugar.
  RETURN NEW;
END;
$function$;

-- Restaurada de 20260817140000_logs_retencao_730_dias.sql
-- ============================================================================
-- 2. O padrão da função de botão passa a ser o da política
-- ============================================================================
-- `fn_logs_expurgar` continua existindo para o expurgo manual, com o piso de 30
-- dias e a confirmação digitada. Só o valor DEFAULT muda: 180 dias era um
-- número de antes de haver política, e uma chamada sem argumento sugeria uma
-- retenção mais curta do que a que foi decidida.
-- ============================================================================

create OR REPLACE FUNCTION public.fn_logs_expurgar(
  p_dias integer default 730, p_empresa_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_super   boolean := public.fn_user_is_super_admin();
  v_minha   uuid    := public.fn_user_empresa_id();
  v_empresa uuid;
  v_corte   timestamptz;
  v_qtd     int;
begin
  if not v_super then
    raise exception 'Apenas super_admin pode expurgar logs.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Piso de 30 dias. "Apagar tudo agora" é o pedido de quem quer esconder algo,
  -- e é exatamente o que uma trilha de auditoria não deve oferecer com um
  -- clique. Quem precisar de menos, faz no SQL Editor e deixa rastro lá.
  if p_dias is null or p_dias < 30 then
    raise exception 'Retenção mínima de 30 dias (pedido: % dias).', p_dias
      using errcode = 'check_violation';
  end if;

  v_empresa := coalesce(p_empresa_id, v_minha);
  v_corte   := now() - make_interval(days => p_dias);

  delete from public.logs_sistema
   where criado_em < v_corte
     and (v_empresa is null or empresa_id = v_empresa);
  get diagnostics v_qtd = row_count;

  -- O expurgo é um evento de auditoria como qualquer outro — e, por ser
  -- destrutivo, dos mais importantes.
  perform public.fn_log_registrar(
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

  return v_qtd;
end
$$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_metas_reabrir_setor("uuid", "uuid", integer, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text") RETURNS TABLE("ok" boolean, "erro" "text")
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_metas_validar_setor("uuid", "uuid", integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) RETURNS TABLE("ok" boolean, "erro" "text")
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

-- Restaurada de 20260818300000_acesso_multiempresa.sql
create OR REPLACE FUNCTION public.fn_multiempresa_definir(
  p_usuario_id uuid,
  p_liberado   boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_perfil text;
  v_nome   text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  end if;

  if not public.fn_user_is_super_admin() then
    return jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  end if;

  select p.perfil, p.nome into v_perfil, v_nome
    from public.perfis p where p.id = p_usuario_id;

  if v_perfil is null then
    return jsonb_build_object('ok', false, 'erro', 'usuario_nao_encontrado');
  end if;

  -- Super_admin ja tem por cargo. Ligar a flag nele nao mudaria nada e faria a
  -- lista sugerir que o acesso dele depende de uma liberacao que pode ser tirada.
  if v_perfil = 'super_admin' then
    return jsonb_build_object('ok', false, 'erro', 'super_admin_ja_tem');
  end if;

  -- Revogar vale para qualquer cargo: e assim que se limpa a flag de quem foi
  -- rebaixado. Conceder e que exige o cargo certo.
  if p_liberado and v_perfil not in ('gerencia', 'diretoria') then
    return jsonb_build_object('ok', false, 'erro', 'cargo_nao_elegivel', 'perfil', v_perfil);
  end if;

  update public.perfis
     set acesso_multiempresa        = p_liberado,
         acesso_multiempresa_por_id = case when p_liberado then auth.uid() else null end,
         acesso_multiempresa_em     = case when p_liberado then now()      else null end
   where id = p_usuario_id;

  return jsonb_build_object('ok', true, 'liberado', p_liberado, 'nome', v_nome);
end;
$fn$;

-- Restaurada de 20260818300000_acesso_multiempresa.sql
create OR REPLACE FUNCTION public.fn_multiempresa_elegiveis()
returns table (
  usuario_id   uuid,
  nome         text,
  email        text,
  perfil       text,
  foto_url     text,
  empresa_nome text
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p.id, p.nome, p.email, p.perfil, p.foto_url, e.nome
    from public.perfis p
    left join public.empresas e on e.id = p.empresa_id
   where public.fn_user_is_super_admin()
     and p.perfil in ('gerencia', 'diretoria')
     and not p.acesso_multiempresa
     and coalesce(p.arquivado, false) = false
     and coalesce(p.situacao, 'ativo') <> 'desligado'
   order by e.nome, p.nome;
$fn$;

-- Restaurada de 20260818300000_acesso_multiempresa.sql
-- ── As RPCs da tela ───────────────────────────────────────────────────────

create OR REPLACE FUNCTION public.fn_multiempresa_listar()
returns table (
  usuario_id    uuid,
  nome          text,
  email         text,
  perfil        text,
  foto_url      text,
  empresa_nome  text,
  e_super_admin boolean,
  concedido_por text,
  concedido_em  timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p.id, p.nome, p.email, p.perfil, p.foto_url,
         e.nome,
         p.perfil = 'super_admin',
         q.nome,
         p.acesso_multiempresa_em
    from public.perfis p
    left join public.empresas e on e.id = p.empresa_id
    left join public.perfis   q on q.id = p.acesso_multiempresa_por_id
   where public.fn_user_is_super_admin()
     and coalesce(p.arquivado, false) = false
     and (
       p.perfil = 'super_admin'
       or (p.acesso_multiempresa and p.perfil in ('gerencia', 'diretoria'))
     )
   order by (p.perfil = 'super_admin') desc, p.nome;
$fn$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_ouvidoria_nivel("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_ouvidoria_nivel"("target_empresa_id" "uuid") RETURNS "text"
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

-- Restaurada de 20260818300000_acesso_multiempresa.sql
-- ── So o super_admin mexe na liberacao ────────────────────────────────────
--
-- `perfis` tem UPDATE liberado para administrador (`perfis_admin_all`) e para
-- lider/elite/gerencia sobre o proprio setor (`perfis_lider_update`). Sem esta
-- trava, um administrador — ou uma gerencia sobre um subordinado — ligaria a
-- flag por baixo, e a tela de Configuracoes deixaria de ser a fonte da verdade.
--
-- `auth.uid() is null` passa de proposito: e o caso de migration, `service_role`
-- e job de manutencao, que ja passam por cima de RLS de qualquer forma.

create OR REPLACE FUNCTION public.fn_perfis_guardar_multiempresa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.acesso_multiempresa        is distinct from old.acesso_multiempresa
  or new.acesso_multiempresa_por_id is distinct from old.acesso_multiempresa_por_id
  or new.acesso_multiempresa_em     is distinct from old.acesso_multiempresa_em then
    if auth.uid() is not null and not public.fn_user_is_super_admin() then
      raise exception 'Acesso multiempresa so pode ser alterado por super_admin'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$fn$;

-- Restaurada de 20260817120000_logs_higiene_e_cobertura.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- E a SEMEADURA, senão a próxima empresa nasce com o mesmo problema.
--
-- O padrão de cada permissão existe em dois lugares: `permissoes-catalogo.ts`,
-- que a tela usa, e `fn_permissoes_catalogo()`, que semeia empresa nova por
-- gatilho. Desligar só no TypeScript corrigiria a tela de hoje e deixaria a
-- armadilha armada para a terceira operação que entrar no sistema.
--
-- A função é recolada INTEIRA, com uma linha mudada — `ver_logs` de `cupula`
-- para `ninguem`. Tentei fazer a troca por `regexp_replace` sobre
-- `pg_get_functiondef` para não repetir 40 chaves, e o teste de contrato
-- `permissoes-catalogo.sql.test.ts` recusou: ele lê a LISTA no arquivo da
-- migration, e uma função montada em tempo de execução some da leitura. O teste
-- está certo — quem revisa a migration precisa ver o valor, não um regex que
-- promete alterá-lo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  WITH atalhos AS (
    SELECT
      ARRAY['lider','elite','gerencia','diretoria']::TEXT[] AS lideranca,
      ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[] AS todos,
      ARRAY['gerencia','diretoria']::TEXT[] AS cupula,
      ARRAY[]::TEXT[] AS ninguem
  )
  -- `t.*`, nunca `*`: as colunas de `atalhos` também entrariam no retorno e o
  -- tipo declarado não bateria.
  SELECT t.* FROM atalhos, LATERAL (VALUES
    -- Abas e telas
    ('ver_acordos',                 ARRAY['bookplay'],  todos,     false),
    ('ver_analitico',               NULL::TEXT[],       todos,     false),
    ('ver_painel_lider',            NULL::TEXT[],       lideranca, false),
    ('ver_painel_diretoria',        NULL::TEXT[],       ARRAY['diretoria'], false),
    ('ver_ouvidoria',               ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('ver_campanha_facil',          ARRAY['bookplay'],  lideranca, false),
    ('ver_solicitacoes_whatsapp',   NULL::TEXT[],       todos,     false),
    ('ver_pix_automatico',          ARRAY['bookplay'],  todos,     false),
    ('ver_lixeira',                 NULL::TEXT[],       todos,     false),
    -- Trilha de auditoria: NINGUÉM por padrão.
    -- A leitura de `logs_sistema` é limitada pelo RLS a super_admin (política
    -- `logs_sis_admin`). Conceder aqui a outro cargo não dá acesso: dá uma aba
    -- VAZIA, porque o RLS devolve zero linhas e `fn_logs_resumo`, que é
    -- SECURITY INVOKER, devolve zeros. Era `cupula` até 17/08/2026, e na
    -- PaguePlay havia dois diretores com a aba e sem nada dentro dela.
    -- Mexer aqui exige mexer na política, na mesma migration.
    ('ver_logs',                    NULL::TEXT[],       ninguem,   false),
    ('ver_configuracoes',           NULL::TEXT[],       ninguem,   false),
    -- Acordos
    ('ver_acordos_gerais',          NULL::TEXT[],       lideranca, false),
    ('criar_acordos',               NULL::TEXT[],       todos,     false),
    ('editar_acordos',              NULL::TEXT[],       todos,     false),
    ('excluir_acordos',             NULL::TEXT[],       todos,     false),
    ('excluir_em_lote',             NULL::TEXT[],       lideranca, false),
    -- Importações
    ('importar_excel',              NULL::TEXT[],       todos,     false),
    ('importar_analitico',          NULL::TEXT[],       lideranca, false),
    ('importar_diario',             NULL::TEXT[],       lideranca, false),
    -- Gestão de pessoas
    ('ver_usuarios',                NULL::TEXT[],       lideranca, false),
    ('editar_usuarios',             NULL::TEXT[],       ninguem,   false),
    ('ver_equipes',                 NULL::TEXT[],       lideranca, false),
    ('editar_equipes',              NULL::TEXT[],       ninguem,   false),
    ('ver_operadores',              NULL::TEXT[],       lideranca, false),
    -- Metas
    ('ver_metas',                   NULL::TEXT[],       lideranca, false),
    ('gerenciar_metas',             NULL::TEXT[],       cupula,    false),
    -- Filtros e visão
    ('ver_todos_setores',           NULL::TEXT[],       cupula,    false),
    ('ver_analiticos_global',       NULL::TEXT[],       cupula,    false),
    ('filtrar_por_setor',           NULL::TEXT[],       lideranca, false),
    ('filtrar_por_equipe',          NULL::TEXT[],       lideranca, false),
    ('filtrar_por_usuario',         NULL::TEXT[],       lideranca, false),
    -- Ações específicas
    ('editar_ouvidoria',            ARRAY['pagueplay'], ARRAY['ouvidoria'], false),
    ('gerenciar_acessos_ouvidoria', ARRAY['pagueplay'], ninguem,   false),
    ('criar_solicitacao_whatsapp',  NULL::TEXT[],       todos,     false),
    ('aprovar_pix_automatico',      ARRAY['bookplay'],  lideranca, false),
    -- Escrever em mês fechado: explícita, e desligada para todos.
    ('ignorar_fechamento_mes',      NULL::TEXT[],       ninguem,   true)
  ) AS t(chave, tenants, padrao, explicita);
$function$;

-- Restaurada de 20260815164659_fechamento_configuravel_e_semeadura_com_padrao.sql
-- ── 2. A semeadura ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_permissoes_semear_empresa(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slug    TEXT;
  v_cargo   TEXT;
  v_mapa    JSONB;
  v_atual   JSONB;
  r         RECORD;
  v_total   INTEGER := 0;
BEGIN
  SELECT slug INTO v_slug FROM public.empresas WHERE id = p_empresa_id;

  FOREACH v_cargo IN ARRAY ARRAY[
    'operador','ouvidoria','lider','elite','gerencia','diretoria',
    'administrador','super_admin'
  ] LOOP
    SELECT COALESCE(permissoes, '{}'::jsonb) INTO v_atual
      FROM public.cargos_permissoes
     WHERE empresa_id = p_empresa_id AND cargo = v_cargo;
    v_atual := COALESCE(v_atual, '{}'::jsonb);

    v_mapa := '{}'::jsonb;

    FOR r IN
      SELECT c.chave, c.tenants, c.padrao, c.explicita
        FROM public.fn_permissoes_catalogo() c
    LOOP
      -- Permissão de outra operação não entra: um toggle de Ouvidoria na
      -- BookPlay controlaria um módulo que não existe lá.
      CONTINUE WHEN r.tenants IS NOT NULL
                AND (v_slug IS NULL OR NOT (v_slug = ANY(r.tenants)));

      v_mapa := v_mapa || jsonb_build_object(
        r.chave,
        CASE
          -- Acesso total por construção (20260812b) — menos o que exige
          -- concessão nominal, que cai nas regras de baixo como qualquer cargo.
          WHEN v_cargo IN ('administrador','super_admin') AND NOT r.explicita
            THEN true
          -- Valor já gravado manda. É o que preserva a configuração que o
          -- administrador ajustou na tela, inclusive uma chave explícita que ele
          -- tenha concedido de propósito.
          WHEN v_atual ? r.chave
            THEN (v_atual -> r.chave)::boolean
          -- Chave nova (ou empresa nova) nasce no padrão do catálogo, e não
          -- negada: uma empresa recém-criada com os oito cargos zerados não
          -- deixa ninguém trabalhar, e não dá pista de quais eram os valores
          -- certos.
          ELSE (v_cargo = ANY(COALESCE(r.padrao, ARRAY[]::TEXT[])))
        END
      );
    END LOOP;

    INSERT INTO public.cargos_permissoes (empresa_id, cargo, permissoes)
    VALUES (p_empresa_id, v_cargo, v_mapa)
    ON CONFLICT (empresa_id, cargo) DO UPDATE SET permissoes = EXCLUDED.permissoes;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_pix_congela_campos_do_operador(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_pix_congela_campos_do_operador"() RETURNS "trigger"
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_pix_expurga_desaprovados("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") RETURNS integer
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_pix_restaurar_lixeira("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") RETURNS "uuid"
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_pode_editar_foto_setor("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_pode_editar_foto_setor"("p_setor_id" "uuid") RETURNS boolean
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_pode_gerir_acordo("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_pode_gerir_acordo"("p_setor_id" "uuid", "p_operador_id" "uuid") RETURNS boolean
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_profissional_registrar_uf("uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_profissional_registrar_uf"("p_empresa_id" "uuid", "p_codigo" "text", "p_estado_uf" "text", "p_nome" "text" DEFAULT NULL::"text") RETURNS "uuid"
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_relatorio_reabrir_setor("uuid", "uuid", integer, integer, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_relatorio_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text", "p_origem" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "erro" "text", "dias_removidos" integer)
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_relatorio_validar_setor("uuid", "uuid", integer, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text" DEFAULT NULL::"text") RETURNS TABLE("ok" boolean, "erro" "text", "dias_validados" integer)
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

-- Restaurada de 20260819100000_tickets.sql
-- Quem abre: lideranca para cima. Operador nao abre ticket — o pedido dele
-- passa pelo lider, que e quem tem o contexto.
CREATE OR REPLACE FUNCTION public.fn_ticket_pode_abrir()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','ouvidoria']
         );
$$;

-- Restaurada de 20260819100000_tickets.sql
-- ── Quem pode atender ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_ticket_pode_atender()
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(ARRAY['administrador'])
      OR EXISTS (
           SELECT 1 FROM public.tickets_atendentes a
            WHERE a.perfil_id = (SELECT auth.uid())
         );
$$;

-- Restaurada de 20260819100000_tickets.sql
CREATE OR REPLACE FUNCTION public.fn_ticket_visivel(
  p_empresa_id UUID, p_setor_id UUID, p_aberto_por UUID
)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.fn_can_access_empresa(p_empresa_id)
     AND (
          p_aberto_por = (SELECT auth.uid())
       OR public.fn_ticket_pode_atender()
       -- Diretoria enxerga todos os setores, sem atender.
       OR public.fn_user_has_any_role(ARRAY['diretoria'])
       -- Lideranca: o proprio setor, e so ele.
       OR (public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','ouvidoria'])
           AND p_setor_id IS NOT DISTINCT FROM public.fn_user_setor_id())
     );
$$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_transferencia_desfazer("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_transferencia_desfazer"("p_transferencia_id" "uuid") RETURNS "jsonb"
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_transferencia_mover_empresa("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_transferencia_mover_empresa"("p_perfil_id" "uuid", "p_empresa_id" "uuid", "p_setor_id" "uuid") RETURNS "jsonb"
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

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_transferir_acordo_nr("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_transferir_acordo_nr"("p_acordo_id" "uuid", "p_novo_operador_id" "uuid" DEFAULT NULL::"uuid", "p_motivo" "text" DEFAULT 'transferencia_nr'::"text") RETURNS "jsonb"
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

-- Restaurada de 20260818300000_acesso_multiempresa.sql
-- ── Quem tem, de fato ─────────────────────────────────────────────────────

create OR REPLACE FUNCTION public.fn_user_acesso_multiempresa()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1
      from public.perfis p
     where p.id = auth.uid()
       and p.acesso_multiempresa
       and p.perfil in ('gerencia', 'diretoria')
  );
$fn$;

-- Restaurada de 20260813225412_remote_schema_baseline.sql
--
-- Name: fn_wpp_tem_visao_geral(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION "public"."fn_wpp_tem_visao_geral"() RETURNS boolean
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
-- Name: FUNCTION "fn_can_access_empresa"("target_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_can_access_empresa"("target_empresa_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_can_access_empresa"("target_empresa_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_can_access_empresa"("target_empresa_id" "uuid") TO "service_role";

--
-- Name: FUNCTION "fn_comemoracao_finalizar"("p_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_comemoracao_finalizar"("p_id" "uuid") TO "service_role";

--
-- Name: FUNCTION "fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean) TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_comemoracao_midia_fixar"("p_id" "uuid", "p_fixar" boolean) TO "service_role";

--
-- Name: FUNCTION "fn_comemoracao_pode_criar"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_comemoracao_pode_criar"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_comemoracao_pode_criar"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_comemoracao_pode_criar"() TO "service_role";

--
-- Name: FUNCTION "fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_composicao_mes_snapshot"("p_empresa_id" "uuid", "p_mes" "text") TO "service_role";

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
-- Name: FUNCTION "fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_logs_expurgar"("p_dias" integer, "p_empresa_id" "uuid") TO "service_role";

--
-- Name: FUNCTION "fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_metas_reabrir_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_motivo" "text") TO "service_role";

--
-- Name: FUNCTION "fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_metas_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer) TO "service_role";

--
-- Name: FUNCTION "fn_ouvidoria_nivel"("target_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_ouvidoria_nivel"("target_empresa_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_ouvidoria_nivel"("target_empresa_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_ouvidoria_nivel"("target_empresa_id" "uuid") TO "service_role";

--
-- Name: FUNCTION "fn_pix_congela_campos_do_operador"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_congela_campos_do_operador"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_pix_congela_campos_do_operador"() TO "service_role";

--
-- Name: FUNCTION "fn_pix_expurga_desaprovados"("p_empresa_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_pix_expurga_desaprovados"("p_empresa_id" "uuid") TO "service_role";

--
-- Name: FUNCTION "fn_pix_restaurar_lixeira"("p_item_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_pix_restaurar_lixeira"("p_item_id" "uuid") TO "service_role";

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
-- Name: FUNCTION "fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_relatorio_validar_setor"("p_empresa_id" "uuid", "p_setor_id" "uuid", "p_mes" integer, "p_ano" integer, "p_origem" "text") TO "service_role";

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
-- Name: FUNCTION "fn_wpp_tem_visao_geral"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wpp_tem_visao_geral"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."fn_wpp_tem_visao_geral"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."fn_wpp_tem_visao_geral"() TO "service_role";

REVOKE ALL ON FUNCTION public.fn_permissoes_semear_empresa(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_ticket_pode_atender()               FROM anon, public;

REVOKE ALL ON FUNCTION public.fn_ticket_pode_abrir()                 FROM anon, public;

REVOKE ALL ON FUNCTION public.fn_ticket_visivel(UUID, UUID, UUID)    FROM anon, public;

GRANT EXECUTE ON FUNCTION public.fn_ticket_pode_atender()            TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_ticket_pode_abrir()              TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_ticket_visivel(UUID, UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.fn_acordo_validar_tipo_update();
DROP FUNCTION IF EXISTS public.fn_acordos_empresas_permitidas(TEXT[],BOOLEAN);
DROP FUNCTION IF EXISTS public.fn_contexto_dados_analiticos_permitido(TEXT,UUID,UUID,UUID);
DROP FUNCTION IF EXISTS public.fn_usuario_no_escopo_aba(TEXT,UUID,UUID,UUID);
DROP FUNCTION IF EXISTS public.fn_tem_escopo_aba(TEXT,TEXT,UUID);
DROP FUNCTION IF EXISTS public.fn_permissoes_abas_novas(JSONB);
DROP FUNCTION IF EXISTS public.fn_tem_permissao(TEXT,UUID);
DROP FUNCTION IF EXISTS public.fn_permissoes_dependencias();
DROP FUNCTION IF EXISTS public.fn_permissoes_dependencias_v3_legacy();
DROP FUNCTION IF EXISTS public.fn_permissoes_catalogo_v3_legacy();

DROP INDEX IF EXISTS public.idx_acordos_empresa_vencimento_id;
ALTER TABLE public.acordos REPLICA IDENTITY DEFAULT;

DROP TABLE IF EXISTS public.menu_lateral_config;

ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS pet_despedida TEXT;
COMMENT ON COLUMN public.perfis.pet_despedida IS
  'Despedida do pet: ''pendente'' (deve ver o card), ''concluida'' (já se despediu), NULL (nunca conviveu com o pet). Ver 20260809c.';

DO $verify_schema_restore$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND (policyname LIKE 'permissoes3\_%' ESCAPE '\'
        OR policyname LIKE 'permissoes4\_%' ESCAPE '\')
  ) THEN
    RAISE EXCEPTION 'Ainda existem políticas criadas em 2026-08-20';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND pg_get_functiondef(p.oid) ILIKE '%fn_tem_permissao%'
  ) THEN
    RAISE EXCEPTION 'Ainda existem funções ligadas ao modelo de permissões de 2026-08-20';
  END IF;
  IF to_regprocedure('public.fn_analitico_dashboard_mes(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_analitico_dashboard_mes_json(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_analitico_resumo_por_operador(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_diario_resumo_mensal(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'RPCs analíticas antigas não foram restauradas';
  END IF;
  IF to_regprocedure('public.fn_analitico_dashboard_mes(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.fn_analitico_dashboard_mes_json(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.fn_analitico_resumo_por_operador(uuid,text,text)') IS NOT NULL
     OR to_regprocedure('public.fn_diario_resumo_mensal(uuid,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'RPCs analíticas criadas em 2026-08-20 ainda existem';
  END IF;
  IF to_regclass('public.menu_lateral_config') IS NOT NULL
     OR to_regclass('public.idx_acordos_empresa_vencimento_id') IS NOT NULL THEN
    RAISE EXCEPTION 'Objetos estruturais de 2026-08-20 ainda existem';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='perfis'
      AND column_name='pet_despedida' AND data_type='text'
  ) THEN
    RAISE EXCEPTION 'Coluna perfis.pet_despedida não foi restaurada';
  END IF;
END
$verify_schema_restore$;

DROP TABLE IF EXISTS public.permissoes_backup_20260820_abas_pessoas;
DROP TABLE IF EXISTS public.permissoes_backup_20260820_abas_cargos;
DROP TABLE IF EXISTS public.permissoes_backup_20260820;

COMMIT;

