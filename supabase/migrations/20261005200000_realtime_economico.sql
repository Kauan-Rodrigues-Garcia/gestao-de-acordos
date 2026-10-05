-- ============================================================================
-- Realtime econômico: sinais agrupados, saída silenciosa e tabulação em lote
-- ============================================================================
--
-- Auditoria de 05/10/2026: o projeto passou de 5 milhões de mensagens do
-- Realtime no ciclo, e a empresa quer manter a conta na faixa de US$ 30. Três
-- peças, todas despachadas pelo mesmo agendador de 15 s (`realtime-despachar`).
--
-- ## 1. Sinal «mudou» agrupado (B1)
--
-- `fn_realtime_sinal_mudou` mandava um aviso para a EMPRESA INTEIRA (~150
-- pessoas) a cada comando que tocasse `analitico_recebimentos`, `vendas`,
-- `diario_recebimentos`, `rh_*` e permissões. Gravar o status de 30 linhas do
-- Analítico, uma a uma, eram 30 avisos × 150 pessoas, e 150 telas relendo.
--
-- Agora cada tópico manda no máximo UM aviso a cada 10 s. O que chega dentro
-- da janela vai para `realtime_sinal_fila` e sai junto, num aviso só, na
-- próxima volta do agendador (até 15 s depois). O conteúdo é a soma: se houve
-- INSERT ou DELETE no meio, o aviso não diz «só UPDATE»; `importado_por` é a
-- união de todos.
--
-- Sem espera entre gravações: quem decide mandar pega um `pg_try_advisory_
-- xact_lock` do tópico. Quem não pega (outro está mandando, ou uma importação
-- longa segura o tópico até o COMMIT) só enfileira — ninguém fica parado
-- esperando trava de ninguém.
--
-- ## 2. Saída silenciosa do online (A4)
--
-- Recarregar a página custava um «saiu» e um «entrou» para ~150 pessoas, e um
-- deploy multiplicava isso pela operação inteira. Agora `fn_presenca_sair` só
-- MARCA a saída (`saindo_em`). Se a pessoa volta em até 15 s (F5, deploy, a
-- outra aba dela bate), a marca some e ninguém é avisado. Se não volta, o
-- agendador apaga a linha e avisa «saiu». Quem caiu sem avisar (150 s sem
-- batida) também sai pelo agendador, com aviso — antes só sumia na batida
-- seguinte de cada um.
--
-- ## 3. Tabulação do Analítico em lote (A3)
--
-- Cada linha não tabulada da tela chamava `fn_analitico_status_tabulacao`
-- sozinha (162 mil chamadas em 5 dias) e, se o status tinha mudado, gravava
-- a linha com um UPDATE próprio — um sinal para a empresa por linha.
-- `fn_analitico_status_tabulacao_lote` confere até 500 linhas numa chamada e
-- grava as que mudaram num UPDATE só. A regra de cada linha é a mesma da
-- função de uma linha (`fn_analitico_acordos_do_codigo`).
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. Sinais agrupados ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.realtime_sinal_ultimo (
  topico      text PRIMARY KEY,
  enviado_em  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.realtime_sinal_fila (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topico     text        NOT NULL,
  payload    jsonb       NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS realtime_sinal_fila_topico ON public.realtime_sinal_fila (topico, id);

COMMENT ON TABLE public.realtime_sinal_ultimo IS
  'Quando cada tópico de sinal «mudou» foi avisado pela última vez. Ver 20261005200000.';
COMMENT ON TABLE public.realtime_sinal_fila IS
  'Sinais «mudou» que chegaram dentro da janela de 10 s e esperam o agendador. Ver 20261005200000.';

ALTER TABLE public.realtime_sinal_ultimo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_sinal_fila   ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.realtime_sinal_ultimo FROM anon, authenticated;
REVOKE ALL ON public.realtime_sinal_fila   FROM anon, authenticated;
GRANT ALL ON public.realtime_sinal_ultimo TO service_role;
GRANT ALL ON public.realtime_sinal_fila   TO service_role;

-- Junta vários payloads de «mudou» num só.
CREATE OR REPLACE FUNCTION public.fn_realtime_sinal_juntar(p_payloads jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'tabela',   (SELECT e ->> 'tabela' FROM jsonb_array_elements(p_payloads) e LIMIT 1),
    'operacao', coalesce(
                  (SELECT e ->> 'operacao' FROM jsonb_array_elements(p_payloads) e
                    WHERE e ->> 'operacao' IS DISTINCT FROM 'UPDATE' LIMIT 1),
                  'UPDATE'),
    'importado_por', coalesce(
                  (SELECT jsonb_agg(DISTINCT p)
                     FROM jsonb_array_elements(p_payloads) e,
                          jsonb_array_elements_text(coalesce(e -> 'importado_por', '[]'::jsonb)) p),
                  '[]'::jsonb));
$function$;

-- Manda o sinal agora (se a janela de 10 s passou e ninguém está mandando) ou
-- enfileira. Usado pelo gatilho e pelo agendador.
CREATE OR REPLACE FUNCTION public.fn_realtime_sinal_emitir(p_topico text, p_payload jsonb, p_forcar boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ultimo   timestamptz;
  v_juntos   jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('realtime-sinal:' || p_topico)) THEN
    IF p_payload IS NOT NULL THEN
      INSERT INTO public.realtime_sinal_fila (topico, payload) VALUES (p_topico, p_payload);
    END IF;
    RETURN false;
  END IF;

  SELECT u.enviado_em INTO v_ultimo FROM public.realtime_sinal_ultimo u WHERE u.topico = p_topico;
  IF NOT p_forcar AND v_ultimo IS NOT NULL AND v_ultimo > clock_timestamp() - interval '10 seconds' THEN
    IF p_payload IS NOT NULL THEN
      INSERT INTO public.realtime_sinal_fila (topico, payload) VALUES (p_topico, p_payload);
    END IF;
    RETURN false;
  END IF;

  -- O que esperava na fila sai junto com este.
  WITH saidos AS (
    DELETE FROM public.realtime_sinal_fila f WHERE f.topico = p_topico RETURNING f.payload
  )
  SELECT jsonb_agg(x.payload) INTO v_juntos
    FROM (SELECT s.payload FROM saidos s
          UNION ALL
          SELECT p_payload WHERE p_payload IS NOT NULL) x;

  IF v_juntos IS NULL THEN
    RETURN false;
  END IF;

  PERFORM realtime.send(public.fn_realtime_sinal_juntar(v_juntos), 'mudou', p_topico, true);

  INSERT INTO public.realtime_sinal_ultimo AS u (topico, enviado_em)
  VALUES (p_topico, clock_timestamp())
  ON CONFLICT (topico) DO UPDATE SET enviado_em = excluded.enviado_em;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_realtime_sinal_juntar(jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_realtime_sinal_emitir(text, jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- O gatilho: mesmos alvos de antes, agora pela porta que agrupa.
CREATE OR REPLACE FUNCTION public.fn_realtime_sinal_mudou()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_prefixo constant text := tg_argv[0];
  v_alvos   jsonb;
  v_alvo    record;
begin
  -- `importado_por_id` só existe no analítico: nas outras tabelas o `->>` dá
  -- nulo e a lista sai vazia.
  if tg_op = 'INSERT' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_alvos
      from (select u.empresa_id,
                   coalesce(jsonb_agg(distinct u.por) filter (where u.por is not null),
                            '[]'::jsonb) as importado_por
              from (select n.empresa_id, to_jsonb(n) ->> 'importado_por_id' as por
                      from novas n) u
             where u.empresa_id is not null
             group by u.empresa_id) x;
  elsif tg_op = 'UPDATE' then
    -- Uma linha que troca de empresa avisa as duas.
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_alvos
      from (select u.empresa_id,
                   coalesce(jsonb_agg(distinct u.por) filter (where u.por is not null),
                            '[]'::jsonb) as importado_por
              from (select n.empresa_id, to_jsonb(n) ->> 'importado_por_id' as por from novas n
                    union all
                    select a.empresa_id, null::text from antigas a) u
             where u.empresa_id is not null
             group by u.empresa_id) x;
  else
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_alvos
      from (select a.empresa_id, '[]'::jsonb as importado_por
              from antigas a
             where a.empresa_id is not null
             group by a.empresa_id) x;
  end if;

  for v_alvo in
    select * from jsonb_to_recordset(v_alvos) as t(empresa_id uuid, importado_por jsonb)
  loop
    perform public.fn_realtime_sinal_emitir(
      v_prefixo || ':' || v_alvo.empresa_id::text,
      jsonb_build_object(
        'tabela',        tg_table_name,
        'operacao',      tg_op,
        'importado_por', v_alvo.importado_por));
  end loop;

  return null;
end;
$function$;

-- ── 2. Saída silenciosa do online ───────────────────────────────────────────
ALTER TABLE public.presenca_online ADD COLUMN IF NOT EXISTS saindo_em timestamptz;

CREATE OR REPLACE FUNCTION public.fn_presenca_bater(p_empresa uuid, p_versao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_empresa     uuid;
  v_visto_antes timestamptz;
  v_emp_antes   uuid;
  v_entrou      boolean;
  v_lista       jsonb;
  v_versao      text;
  v_agora_ms    bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  IF p_empresa IS NOT NULL AND public.fn_can_access_empresa(p_empresa) THEN
    v_empresa := p_empresa;
  ELSE
    SELECT p.empresa_id INTO v_empresa FROM public.perfis p WHERE p.id = v_uid;
  END IF;

  SELECT o.visto_em, o.empresa_id INTO v_visto_antes, v_emp_antes
    FROM public.presenca_online o WHERE o.user_id = v_uid;
  -- Linha com saída marcada e ainda dentro da validade: é quem só recarregou.
  -- A marca some e ninguém é avisado.
  v_entrou := v_visto_antes IS NULL
           OR v_visto_antes <= now() - interval '150 seconds'
           OR v_emp_antes IS DISTINCT FROM v_empresa;

  INSERT INTO public.presenca_online AS o (user_id, empresa_id, visto_em, saindo_em)
  VALUES (v_uid, v_empresa, now(), NULL)
  ON CONFLICT ON CONSTRAINT presenca_online_pkey DO UPDATE
     SET empresa_id = excluded.empresa_id,
         visto_em   = excluded.visto_em,
         saindo_em  = NULL
   WHERE o.visto_em < now() - interval '10 seconds'
      OR o.empresa_id IS DISTINCT FROM excluded.empresa_id
      OR o.saindo_em IS NOT NULL;

  IF v_entrou THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('tipo', 'entrou', 'pessoa', v_uid, 'empresa', v_empresa, 'em', v_agora_ms),
        'presenca', 'presenca:global', true);
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- o aviso é atalho; a lista da próxima batida corrige
    END;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_array(o.user_id, o.empresa_id) ORDER BY o.user_id), '[]'::jsonb)
    INTO v_lista
    FROM public.presenca_online o
   WHERE o.visto_em > now() - interval '150 seconds'
     AND (o.saindo_em IS NULL OR o.saindo_em > now() - interval '15 seconds');

  v_versao := md5(v_lista::text);
  IF v_versao = p_versao THEN
    RETURN jsonb_build_object('versao', v_versao, 'agora', v_agora_ms);
  END IF;
  RETURN jsonb_build_object('versao', v_versao, 'agora', v_agora_ms, 'online', v_lista);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_presenca_sair()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  -- Só marca. Quem avisa «saiu» é o agendador, se a pessoa não voltar em 15 s.
  UPDATE public.presenca_online o
     SET saindo_em = now()
   WHERE o.user_id = auth.uid() AND o.saindo_em IS NULL;
END;
$function$;

COMMENT ON FUNCTION public.fn_presenca_sair() IS
  'Marca a saída de quem chama (aba fechada, logout). O agendador avisa «saiu» se a pessoa '
  'não voltar em 15 s. Ver 20261005200000.';

-- Quem saiu de verdade (marca com mais de 15 s) ou caiu sem avisar (150 s sem
-- batida): apaga e avisa, um aviso por pessoa.
CREATE OR REPLACE FUNCTION public.fn_presenca_varrer()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_saida record;
  v_n     integer := 0;
BEGIN
  FOR v_saida IN
    DELETE FROM public.presenca_online o
     WHERE (o.saindo_em IS NOT NULL AND o.saindo_em <= now() - interval '15 seconds')
        OR o.visto_em <= now() - interval '150 seconds'
    RETURNING o.user_id, o.empresa_id
  LOOP
    v_n := v_n + 1;
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('tipo', 'saiu', 'pessoa', v_saida.user_id, 'empresa', v_saida.empresa_id,
                           'em', floor(extract(epoch FROM clock_timestamp()) * 1000)),
        'presenca', 'presenca:global', true);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_presenca_varrer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_presenca_bater(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_presenca_sair()            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_presenca_bater(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_presenca_sair()            TO authenticated;

-- ── O agendador de 15 s ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_realtime_despachar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_topico text;
BEGIN
  PERFORM public.fn_presenca_varrer();
  FOR v_topico IN SELECT DISTINCT f.topico FROM public.realtime_sinal_fila f LOOP
    PERFORM public.fn_realtime_sinal_emitir(v_topico, NULL, true);
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_realtime_despachar() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('realtime-despachar')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'realtime-despachar');
  PERFORM cron.schedule('realtime-despachar', '15 seconds', 'SELECT public.fn_realtime_despachar();');

  -- 5.760 execuções por dia: o histórico do pg_cron não pode guardar todas.
  PERFORM cron.unschedule('realtime-despachar-faxina')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'realtime-despachar-faxina');
  PERFORM cron.schedule('realtime-despachar-faxina', '33 4 * * *',
    $faxina$DELETE FROM cron.job_run_details d USING cron.job j
             WHERE d.jobid = j.jobid AND j.jobname = 'realtime-despachar'
               AND d.start_time < now() - interval '1 day'$faxina$);
END;
$$;

-- ── 3. Tabulação em lote ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_analitico_status_tabulacao_lote(p_linha_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_linha        record;
  v_achado       record;
  v_res          jsonb := '{}'::jsonb;
  v_status       text;
  v_acordo       uuid;
  v_item         jsonb;
  v_ids          uuid[] := '{}';
  v_sts          text[] := '{}';
  v_acs          uuid[] := '{}';
  v_emp_vista    uuid;
  v_emp_pode     boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('erro', 'sem_sessao');
  END IF;
  IF coalesce(array_length(p_linha_ids, 1), 0) > 500 THEN
    RETURN jsonb_build_object('erro', 'lote_grande');
  END IF;

  FOR v_linha IN
    SELECT r.id, r.empresa_id, r.codigo, r.operador_id, r.status_tabulacao, r.acordo_id
      FROM public.analitico_recebimentos r
     WHERE r.id = ANY (p_linha_ids)
     ORDER BY r.empresa_id
  LOOP
    -- A permissão é por empresa: confere uma vez por empresa do lote.
    IF v_emp_vista IS DISTINCT FROM v_linha.empresa_id THEN
      v_emp_vista := v_linha.empresa_id;
      v_emp_pode  := coalesce(public.fn_can_access_empresa(v_linha.empresa_id), false);
    END IF;
    CONTINUE WHEN NOT v_emp_pode;

    SELECT * INTO v_achado
      FROM public.fn_analitico_acordos_do_codigo(v_linha.empresa_id, v_linha.codigo, v_linha.operador_id);

    IF v_achado.meu_id IS NOT NULL THEN
      v_status := 'tabulado';   v_acordo := v_achado.meu_id;
      v_item   := jsonb_build_object('status', v_status, 'acordo_id', v_acordo);
    ELSIF v_achado.alvo_id IS NOT NULL THEN
      v_status := 'divergente'; v_acordo := v_achado.alvo_id;
      v_item   := jsonb_build_object(
        'status',              v_status,
        'acordo_id',           v_acordo,
        'outro_operador_id',   v_achado.alvo_operador_id,
        'outro_operador_nome', v_achado.alvo_operador_nome);
    ELSE
      v_status := 'nao_tabulado'; v_acordo := NULL;
      v_item   := jsonb_build_object('status', v_status);
    END IF;

    v_res := v_res || jsonb_build_object(v_linha.id::text, v_item);

    IF v_linha.status_tabulacao IS DISTINCT FROM v_status OR v_linha.acordo_id IS DISTINCT FROM v_acordo THEN
      v_ids := array_append(v_ids, v_linha.id);
      v_sts := array_append(v_sts, v_status);
      v_acs := array_append(v_acs, v_acordo);
    END IF;
  END LOOP;

  -- Um UPDATE só para o lote inteiro: um sinal para a empresa, não um por linha.
  IF array_length(v_ids, 1) > 0 THEN
    UPDATE public.analitico_recebimentos r
       SET status_tabulacao = u.status, acordo_id = u.acordo
      FROM unnest(v_ids, v_sts, v_acs) AS u(id, status, acordo)
     WHERE r.id = u.id;
  END IF;

  RETURN jsonb_build_object('linhas', v_res, 'gravadas', coalesce(array_length(v_ids, 1), 0));
END;
$function$;

COMMENT ON FUNCTION public.fn_analitico_status_tabulacao_lote(uuid[]) IS
  'Status de tabulação de até 500 linhas do Analítico numa chamada, gravando as que mudaram '
  'num UPDATE só. Mesma regra de fn_analitico_status_tabulacao. Ver 20261005200000.';

REVOKE ALL ON FUNCTION public.fn_analitico_status_tabulacao_lote(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_analitico_status_tabulacao_lote(uuid[]) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  v_juntou jsonb;
BEGIN
  v_juntou := public.fn_realtime_sinal_juntar(
    '[{"tabela":"t","operacao":"UPDATE","importado_por":["a"]},
      {"tabela":"t","operacao":"INSERT","importado_por":["b","a"]}]'::jsonb);
  IF v_juntou ->> 'operacao' <> 'INSERT' OR jsonb_array_length(v_juntou -> 'importado_por') <> 2 THEN
    RAISE EXCEPTION 'fn_realtime_sinal_juntar não juntou direito: %', v_juntou;
  END IF;
  IF (public.fn_realtime_sinal_juntar('[{"tabela":"t","operacao":"UPDATE"}]'::jsonb)) ->> 'operacao' <> 'UPDATE' THEN
    RAISE EXCEPTION 'só UPDATE deveria continuar UPDATE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'realtime-despachar' AND active) THEN
    RAISE EXCEPTION 'agenda realtime-despachar não ficou ativa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'presenca_online' AND column_name = 'saindo_em') THEN
    RAISE EXCEPTION 'presenca_online.saindo_em não criada';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_analitico_status_tabulacao_lote(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'tabulação em lote sem EXECUTE para authenticated';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_realtime_sinal_emitir(text,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_presenca_varrer()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_realtime_despachar()', 'EXECUTE') THEN
    RAISE EXCEPTION 'peças internas do Realtime ficaram abertas ao app';
  END IF;
END
$prova$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261005200000', 'realtime_economico')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'realtime-despachar' AND active)          AS despachante,
  to_regprocedure('public.fn_analitico_status_tabulacao_lote(uuid[])') IS NOT NULL         AS tabulacao_lote,
  (SELECT count(*) FROM public.presenca_online WHERE saindo_em IS NOT NULL)                AS saindo_agora,
  (SELECT count(*) FROM public.realtime_sinal_fila)                                        AS sinais_na_fila;
