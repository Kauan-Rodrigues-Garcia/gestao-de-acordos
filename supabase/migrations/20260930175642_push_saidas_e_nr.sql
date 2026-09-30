-- ============================================================================
-- Aviso de pagamento que SAIU do recebimento + NR e «hoje» nos avisos
-- 30/09/2026 — APLICADA com «pode» e registrada como 20260930175642.
-- ============================================================================
--
-- ## O pedido (30/09/2026)
--
--   «Quando for identificado que um pagamento foi removido da pessoa, cria uma
--    notificação dizendo que o valor saiu do recebimento, e sempre mostra o
--    valor total recebido no dia.»
--
--   E, para os avisos de pagamento: «o nome, abaixo do nome o NR, e depois o
--   valor». O NR é o `codigo` da linha do analítico — a fila já o guarda, mas
--   `fn_push_pegar_lote` não o entregava à Edge Function.
--
-- ## O que «saiu» quer dizer
--
--   * a linha foi APAGADA (exclusão na tela, reconciliação do NR);
--   * a linha foi TRANSFERIDA para outra pessoa (UPDATE de `operador_id`,
--     sincronização do 59).
--
-- Os totais já acompanham sozinhos: o card do mês, o «hoje» e o diário somam
-- as linhas que existem. O que faltava era AVISAR.
--
-- ## As três travas contra aviso falso
--
--   1. ESPERA: a saída só vira aviso depois de `saida_espera_min` (15) minutos,
--      e só se o pagamento NÃO voltou para a mesma pessoa nesse meio tempo.
--      «Limpar dados» + reimportar apaga e insere de novo — volta, e ninguém é
--      avisado (situação 'voltou').
--   2. MASSA: um comando que apaga mais de `saida_limite_massa` (300) linhas é
--      limpeza de mês, não «um pagamento saiu da pessoa» — não entra na fila.
--   3. MEMÓRIA: único por (pagamento, pessoa). O mesmo pagamento não avisa duas
--      vezes a mesma pessoa enquanto a linha estiver guardada (7 dias).
--
-- Só entra quem tem aparelho inscrito e pagamento do MÊS corrente. Gatilhos por
-- comando (tabela de transição), como o da fila de entrada; erro é engolido e
-- registrado — nunca derruba importação, exclusão nem sincronização.
--
-- Tabela nova + 2 gatilhos + funções. `fn_push_pegar_lote` e `fn_push_disparar`
-- são redefinidas (mesmo corpo, com o NR, o «hoje» e as saídas). Nenhuma linha
-- existente muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE public.push_config
  ADD COLUMN IF NOT EXISTS saida_espera_min   INTEGER NOT NULL DEFAULT 15
    CHECK (saida_espera_min BETWEEN 1 AND 240),
  ADD COLUMN IF NOT EXISTS saida_limite_massa INTEGER NOT NULL DEFAULT 300
    CHECK (saida_limite_massa BETWEEN 1 AND 100000);

-- ── A fila das saídas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_saidas (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id        UUID    NOT NULL,
  codigo            TEXT    NOT NULL,
  data_pagamento    DATE    NOT NULL,
  forma_pagamento   TEXT    NOT NULL,
  perfil_id         UUID    NOT NULL,
  valor             NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_ho          NUMERIC(12,2) NOT NULL DEFAULT 0,
  forma_detalhe     TEXT,
  nome_cliente      TEXT,
  -- 'removido' (DELETE) | 'transferido' (UPDATE de operador_id)
  motivo            TEXT    NOT NULL,
  criada_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  verificar_apos    TIMESTAMPTZ NOT NULL,
  pego_em           TIMESTAMPTZ,
  enviado_em        TIMESTAMPTZ,
  -- 'enviado' | 'voltou' | 'sem_aparelho' | 'inativo' | 'expirado' | 'falhou'
  situacao          TEXT,
  tentativas        SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT push_saidas_unica
    UNIQUE (empresa_id, codigo, data_pagamento, forma_pagamento, perfil_id)
);

CREATE INDEX IF NOT EXISTS push_saidas_pendentes_idx
  ON public.push_saidas (verificar_apos) WHERE enviado_em IS NULL;
CREATE INDEX IF NOT EXISTS push_saidas_criada_idx ON public.push_saidas (criada_em);

ALTER TABLE public.push_saidas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_saidas FROM anon, authenticated;

COMMENT ON TABLE public.push_saidas IS
  'Pagamentos que sairam do recebimento de alguem (apagados ou transferidos). '
  'Gravada so pelos gatilhos de analitico_recebimentos; lida so pela Edge '
  'Function enviar-push, depois da espera e se o pagamento nao voltou '
  '(20260930175642).';

-- ── Gatilho de DELETE: um por comando ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_push_saida_de_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.push_config%ROWTYPE;
  v_ini DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
BEGIN
  SELECT * INTO v_cfg FROM public.push_config WHERE ativo;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Limpeza de mês não é «um pagamento saiu da pessoa».
  IF (SELECT count(*) FROM velhas) > v_cfg.saida_limite_massa THEN RETURN NULL; END IF;

  INSERT INTO public.push_saidas (
    empresa_id, codigo, data_pagamento, forma_pagamento, perfil_id,
    valor, valor_ho, forma_detalhe, nome_cliente, motivo, verificar_apos
  )
  SELECT v.empresa_id, v.codigo, v.data_pagamento, v.forma_pagamento, v.operador_id,
         COALESCE(v.valor_recebido, 0), COALESCE(v.total_ho, 0),
         v.forma_detalhe, v.nome_cliente, 'removido',
         now() + make_interval(mins => v_cfg.saida_espera_min)
    FROM velhas v
   WHERE v.operador_id IS NOT NULL
     AND v.data_pagamento >= v_ini
     AND EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = v.operador_id)
  ON CONFLICT ON CONSTRAINT push_saidas_unica DO NOTHING;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[push] saida (delete) nao gravada: %', SQLERRM;
  RETURN NULL;
END;
$function$;

-- ── Gatilho de UPDATE: só quando o operador da linha muda ───────────────────
-- Tabela de transição não aceita lista de colunas; o filtro de `operador_id`
-- mudou fica no JOIN. O `upsert` da importação, que regrava a linha com o
-- mesmo operador, não produz nada aqui.
CREATE OR REPLACE FUNCTION public.fn_push_saida_de_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.push_config%ROWTYPE;
  v_ini DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
BEGIN
  SELECT * INTO v_cfg FROM public.push_config WHERE ativo;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO public.push_saidas (
    empresa_id, codigo, data_pagamento, forma_pagamento, perfil_id,
    valor, valor_ho, forma_detalhe, nome_cliente, motivo, verificar_apos
  )
  SELECT a.empresa_id, a.codigo, a.data_pagamento, a.forma_pagamento, a.operador_id,
         COALESCE(a.valor_recebido, 0), COALESCE(a.total_ho, 0),
         a.forma_detalhe, a.nome_cliente, 'transferido',
         now() + make_interval(mins => v_cfg.saida_espera_min)
    FROM antes a
    JOIN depois d ON d.id = a.id
   WHERE a.operador_id IS NOT NULL
     AND a.operador_id IS DISTINCT FROM d.operador_id
     AND a.data_pagamento >= v_ini
     AND EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = a.operador_id)
  ON CONFLICT ON CONSTRAINT push_saidas_unica DO NOTHING;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[push] saida (update) nao gravada: %', SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_saida_de_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_push_saida_de_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_analitico_push_saida_delete ON public.analitico_recebimentos;
CREATE TRIGGER trg_analitico_push_saida_delete
AFTER DELETE ON public.analitico_recebimentos
REFERENCING OLD TABLE AS velhas
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_push_saida_de_delete();

DROP TRIGGER IF EXISTS trg_analitico_push_saida_update ON public.analitico_recebimentos;
CREATE TRIGGER trg_analitico_push_saida_update
AFTER UPDATE ON public.analitico_recebimentos
REFERENCING OLD TABLE AS antes NEW TABLE AS depois
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_push_saida_de_update();

-- ── O cron chama a função com entrada pendente OU saída vencida ─────────────
CREATE OR REPLACE FUNCTION public.fn_push_disparar()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.push_config%ROWTYPE;
BEGIN
  SELECT * INTO v_cfg FROM public.push_config WHERE ativo;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_fila WHERE enviado_em IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.push_saidas
                      WHERE enviado_em IS NULL AND verificar_apos <= now()) THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_cfg.url_funcao,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-segredo', v_cfg.segredo),
    body    := jsonb_build_object('acao', 'rodada'),
    timeout_milliseconds := 55000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_disparar() FROM PUBLIC, anon, authenticated;

-- ── A rodada das entradas: o mesmo corpo de 20260930124757 + NR + «hoje» ────
CREATE OR REPLACE FUNCTION public.fn_push_pegar_lote(p_limite INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_itens   JSONB;
  v_pessoas JSONB;
  v_corte   INTEGER;
BEGIN
  SELECT c.corte INTO v_corte FROM public.push_config c WHERE c.ativo;
  IF v_corte IS NULL THEN
    RETURN jsonb_build_object('corte', 3, 'itens', '[]'::JSONB, 'pessoas', '{}'::JSONB);
  END IF;

  UPDATE public.push_fila f
     SET enviado_em = now(), situacao = 'expirado'
   WHERE f.enviado_em IS NULL
     AND f.criada_em < now() - INTERVAL '6 hours';

  UPDATE public.push_fila f
     SET enviado_em = now(), situacao = 'inativo'
    FROM public.perfis p
   WHERE f.enviado_em IS NULL
     AND p.id = f.perfil_id
     AND (p.ativo IS FALSE OR COALESCE(p.situacao, 'ativo') <> 'ativo');

  UPDATE public.push_fila f
     SET enviado_em = now(), situacao = 'sem_aparelho'
   WHERE f.enviado_em IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = f.perfil_id);

  WITH pegos AS (
    UPDATE public.push_fila f
       SET pego_em = now(), tentativas = f.tentativas + 1
     WHERE f.id IN (
       SELECT x.id FROM public.push_fila x
        WHERE x.enviado_em IS NULL
          AND (x.pego_em IS NULL OR x.pego_em < now() - INTERVAL '2 minutes')
        ORDER BY x.id
        LIMIT p_limite
        FOR UPDATE SKIP LOCKED)
    RETURNING f.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', g.id, 'empresa_id', g.empresa_id, 'perfil_id', g.perfil_id,
           'valor', g.valor, 'valor_ho', g.valor_ho, 'codigo', g.codigo,
           'forma_pagamento', g.forma_pagamento, 'forma_detalhe', g.forma_detalhe,
           'nome_cliente', g.nome_cliente, 'data_pagamento', g.data_pagamento,
           'tentativas', g.tentativas) ORDER BY g.id), '[]'::JSONB)
    INTO v_itens
    FROM pegos g;

  -- Por pessoa: mês corrente (São Paulo), unidade da empresa.
  WITH pessoas AS (
    SELECT DISTINCT (i->>'perfil_id')::UUID AS perfil_id, (i->>'empresa_id')::UUID AS empresa_id
      FROM jsonb_array_elements(v_itens) i
  ),
  ref AS (
    SELECT date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE AS ini
  ),
  unidade AS (
    SELECT p.perfil_id, p.empresa_id,
           (em.slug = 'pagueplay') AS em_ho,
           public.fn_pp_ho_percentual() AS pct
      FROM pessoas p JOIN public.empresas em ON em.id = p.empresa_id
  ),
  acumulado AS (
    SELECT u.perfil_id,
           COALESCE((SELECT SUM(CASE WHEN u.em_ho THEN ar.total_ho ELSE ar.valor_recebido END)
                       FROM public.analitico_recebimentos ar, ref
                      WHERE ar.operador_id = u.perfil_id
                        AND ar.empresa_id  = u.empresa_id
                        AND ar.data_pagamento >= ref.ini
                        AND ar.data_pagamento <  (ref.ini + INTERVAL '1 month')), 0)
         + COALESCE((SELECT SUM(a.valor) * CASE WHEN u.em_ho THEN u.pct ELSE 1 END
                       FROM public.analitico_ajustes_manuais a, ref
                      WHERE a.operador_id = u.perfil_id
                        AND a.empresa_id  = u.empresa_id
                        AND a.mes_referencia = ref.ini
                        AND a.cancelado IS NOT TRUE), 0) AS depois,
           COALESCE((SELECT SUM(CASE WHEN u.em_ho THEN (i->>'valor_ho')::NUMERIC ELSE (i->>'valor')::NUMERIC END)
                       FROM jsonb_array_elements(v_itens) i, ref
                      WHERE (i->>'perfil_id')::UUID = u.perfil_id
                        AND (i->>'data_pagamento')::DATE >= ref.ini), 0) AS do_lote,
           (SELECT ARRAY(
              SELECT ROUND(d.v * CASE WHEN u.em_ho THEN u.pct ELSE 1 END, 2)
                FROM (SELECT m.meta_valor AS v, 0 AS ord
                      UNION ALL
                      SELECT (e.x)::NUMERIC, e.ord::INT
                        FROM jsonb_array_elements_text(COALESCE(m.metas_extras, '[]'::JSONB))
                             WITH ORDINALITY AS e(x, ord)) d
               WHERE d.v > 0
               ORDER BY d.ord)
              FROM public.metas m, ref
             WHERE m.tipo = 'operador' AND m.referencia_id = u.perfil_id
               AND m.empresa_id = u.empresa_id
               AND m.mes = EXTRACT(MONTH FROM ref.ini) AND m.ano = EXTRACT(YEAR FROM ref.ini)
             LIMIT 1) AS degraus,
           COALESCE((SELECT SUM(CASE WHEN u.em_ho THEN ar.total_ho ELSE ar.valor_recebido END)
                       FROM public.analitico_recebimentos ar
                      WHERE ar.operador_id = u.perfil_id
                        AND ar.empresa_id  = u.empresa_id
                        AND ar.data_pagamento = (now() AT TIME ZONE 'America/Sao_Paulo')::DATE), 0) AS hoje,
           u.em_ho
      FROM unidade u
  )
  SELECT COALESCE(jsonb_object_agg(a.perfil_id, jsonb_build_object(
           'em_ho',   a.em_ho,
           'depois',  ROUND(a.depois, 2),
           'hoje',    ROUND(a.hoje, 2),
           'antes',   ROUND(a.depois - a.do_lote, 2),
           'degraus', to_jsonb(COALESCE(a.degraus, '{}'::NUMERIC[])))), '{}'::JSONB)
    INTO v_pessoas
    FROM acumulado a;

  RETURN jsonb_build_object('corte', v_corte, 'itens', v_itens, 'pessoas', v_pessoas);
END;
$function$;

-- ── A rodada das saídas ─────────────────────────────────────────────────────
/*
 * Fecha sem enviar o que não deve sair — o pagamento VOLTOU para a mesma pessoa
 * (limpar e reimportar, transferência desfeita), mais de 6 h, pessoa inativa ou
 * sem aparelho — e pega as vencidas. Devolve, por pessoa, o recebido de HOJE e
 * do mês na unidade do Dashboard (H.O. na PaguePlay), já sem o que saiu.
 */
CREATE OR REPLACE FUNCTION public.fn_push_pegar_saidas(p_limite INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_itens   JSONB;
  v_pessoas JSONB;
  v_corte   INTEGER;
BEGIN
  SELECT c.corte INTO v_corte FROM public.push_config c WHERE c.ativo;
  IF v_corte IS NULL THEN
    RETURN jsonb_build_object('corte', 3, 'itens', '[]'::JSONB, 'pessoas', '{}'::JSONB);
  END IF;

  UPDATE public.push_saidas s
     SET enviado_em = now(), situacao = 'voltou'
   WHERE s.enviado_em IS NULL
     AND EXISTS (SELECT 1 FROM public.analitico_recebimentos ar
                  WHERE ar.empresa_id      = s.empresa_id
                    AND ar.codigo          = s.codigo
                    AND ar.data_pagamento  = s.data_pagamento
                    AND ar.forma_pagamento = s.forma_pagamento
                    AND ar.operador_id     = s.perfil_id);

  UPDATE public.push_saidas s
     SET enviado_em = now(), situacao = 'expirado'
   WHERE s.enviado_em IS NULL
     AND s.verificar_apos < now() - INTERVAL '6 hours';

  UPDATE public.push_saidas s
     SET enviado_em = now(), situacao = 'inativo'
    FROM public.perfis p
   WHERE s.enviado_em IS NULL
     AND p.id = s.perfil_id
     AND (p.ativo IS FALSE OR COALESCE(p.situacao, 'ativo') <> 'ativo');

  UPDATE public.push_saidas s
     SET enviado_em = now(), situacao = 'sem_aparelho'
   WHERE s.enviado_em IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = s.perfil_id);

  WITH pegos AS (
    UPDATE public.push_saidas s
       SET pego_em = now(), tentativas = s.tentativas + 1
     WHERE s.id IN (
       SELECT x.id FROM public.push_saidas x
        WHERE x.enviado_em IS NULL
          AND x.verificar_apos <= now()
          AND (x.pego_em IS NULL OR x.pego_em < now() - INTERVAL '2 minutes')
        ORDER BY x.id
        LIMIT p_limite
        FOR UPDATE SKIP LOCKED)
    RETURNING s.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', g.id, 'empresa_id', g.empresa_id, 'perfil_id', g.perfil_id,
           'valor', g.valor, 'valor_ho', g.valor_ho, 'codigo', g.codigo,
           'forma_pagamento', g.forma_pagamento, 'forma_detalhe', g.forma_detalhe,
           'nome_cliente', g.nome_cliente, 'data_pagamento', g.data_pagamento,
           'motivo', g.motivo, 'tentativas', g.tentativas) ORDER BY g.id), '[]'::JSONB)
    INTO v_itens
    FROM pegos g;

  WITH pessoas AS (
    SELECT DISTINCT (i->>'perfil_id')::UUID AS perfil_id, (i->>'empresa_id')::UUID AS empresa_id
      FROM jsonb_array_elements(v_itens) i
  ),
  ref AS (
    SELECT date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE AS ini,
           (now() AT TIME ZONE 'America/Sao_Paulo')::DATE AS hoje
  ),
  unidade AS (
    SELECT p.perfil_id, p.empresa_id,
           (em.slug = 'pagueplay') AS em_ho,
           public.fn_pp_ho_percentual() AS pct
      FROM pessoas p JOIN public.empresas em ON em.id = p.empresa_id
  )
  SELECT COALESCE(jsonb_object_agg(u.perfil_id, jsonb_build_object(
           'em_ho', u.em_ho,
           'hoje', ROUND(COALESCE((
              SELECT SUM(CASE WHEN u.em_ho THEN ar.total_ho ELSE ar.valor_recebido END)
                FROM public.analitico_recebimentos ar, ref
               WHERE ar.operador_id = u.perfil_id AND ar.empresa_id = u.empresa_id
                 AND ar.data_pagamento = ref.hoje), 0), 2),
           'mes', ROUND(COALESCE((
              SELECT SUM(CASE WHEN u.em_ho THEN ar.total_ho ELSE ar.valor_recebido END)
                FROM public.analitico_recebimentos ar, ref
               WHERE ar.operador_id = u.perfil_id AND ar.empresa_id = u.empresa_id
                 AND ar.data_pagamento >= ref.ini
                 AND ar.data_pagamento <  (ref.ini + INTERVAL '1 month')), 0)
            + COALESCE((
              SELECT SUM(a.valor) * CASE WHEN u.em_ho THEN u.pct ELSE 1 END
                FROM public.analitico_ajustes_manuais a, ref
               WHERE a.operador_id = u.perfil_id AND a.empresa_id = u.empresa_id
                 AND a.mes_referencia = ref.ini AND a.cancelado IS NOT TRUE), 0), 2)
         )), '{}'::JSONB)
    INTO v_pessoas
    FROM unidade u;

  RETURN jsonb_build_object('corte', v_corte, 'itens', v_itens, 'pessoas', v_pessoas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_push_concluir_saidas(p_ok BIGINT[], p_falha BIGINT[])
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.push_saidas
     SET enviado_em = now(), situacao = 'enviado'
   WHERE id = ANY (COALESCE(p_ok, '{}')) AND enviado_em IS NULL;
  UPDATE public.push_saidas
     SET enviado_em = CASE WHEN tentativas >= 3 THEN now() END,
         situacao   = CASE WHEN tentativas >= 3 THEN 'falhou' END,
         pego_em    = NULL
   WHERE id = ANY (COALESCE(p_falha, '{}')) AND enviado_em IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_pegar_lote(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_push_pegar_saidas(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_push_concluir_saidas(BIGINT[], BIGINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_pegar_lote(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_push_pegar_saidas(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_push_concluir_saidas(BIGINT[], BIGINT[]) TO service_role;

-- ── Faxina: 7 dias, como a fila de entrada ──────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('push-faxina-saidas')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-faxina-saidas');
  PERFORM cron.schedule('push-faxina-saidas', '45 3 * * *',
    $sql$DELETE FROM public.push_saidas WHERE criada_em < now() - INTERVAL '7 days';$sql$);
END;
$$;

DO $guarda$
BEGIN
  IF to_regclass('public.push_saidas') IS NULL THEN
    RAISE EXCEPTION 'push_saidas nao foi criada';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgname IN ('trg_analitico_push_saida_delete', 'trg_analitico_push_saida_update')) <> 2 THEN
    RAISE EXCEPTION 'gatilhos das saidas nao foram criados';
  END IF;
  IF has_table_privilege('authenticated', 'public.push_saidas', 'SELECT')
     OR has_table_privilege('anon', 'public.push_saidas', 'SELECT') THEN
    RAISE EXCEPTION 'push_saidas ficou legivel pela API';
  END IF;
END
$guarda$;

COMMIT;
