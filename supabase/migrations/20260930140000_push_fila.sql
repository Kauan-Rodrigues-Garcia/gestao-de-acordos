-- ============================================================================
-- Aviso automático de pagamento — Etapa 3 do mobile
-- ============================================================================
--
-- Spec: docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md §4–§5.
--
-- ## O caminho
--
--   importação (robô do 59 ou tela) → INSERT em analitico_recebimentos
--     → gatilho POR COMANDO grava em push_fila (só quem tem aparelho inscrito)
--     → pg_cron, a cada minuto, chama fn_push_disparar()
--     → se há pendente, pg_net chama a Edge Function enviar-push {acao:'rodada'}
--     → a função pega o lote (fn_push_pegar_lote), agrupa por pessoa, envia e
--       fecha (fn_push_concluir).
--
-- ## Anti-repetição (pedido do usuário: limpar e reimportar não avisa de novo)
--
--   1. Janela: só linha com data_pagamento nos últimos N dias (push_config,
--      padrão 3). Reimportar o mês não avisa nada antigo.
--   2. Memória: push_fila tem ÚNICO na chave natural do analítico e NÃO é
--      apagada pelo «Limpar dados». O gatilho faz ON CONFLICT DO NOTHING, então
--      a linha reimportada não entra de novo. Retenção 7 dias > janela 3 dias.
--   3. `upsert` da importação em linha existente é UPDATE: não passa pelo
--      gatilho de INSERT. Sincronização/transferência do 59 também é UPDATE.
--
-- ## Leveza (pedido do usuário)
--
--   * gatilho FOR EACH STATEMENT com tabela de transição: um INSERT…SELECT por
--     bloco da importação, não um por linha;
--   * filtra no gatilho: sem aparelho inscrito, a fila nem cresce;
--   * o cron só chama a função se houver pendente (índice parcial) — parado,
--     é uma consulta de índice vazia por minuto;
--   * erro no gatilho é engolido e registrado: NUNCA derruba a importação.
--
-- ## Quem pode chamar a rodada
--
-- A Edge Function roda com verify_jwt desligado e autentica por conta própria:
-- `teste` exige a sessão do usuário (getUser); `rodada` exige o cabeçalho
-- `x-push-segredo` igual a `push_config.segredo`, que só o banco (DEFINER) e a
-- função (service_role) leem. Ninguém mais alcança push_config: RLS ligada sem
-- política nenhuma e REVOKE de anon/authenticated.
--
-- Pré-requisito: extensão pg_net (criada aqui) e pg_cron (já ativa).
-- Tabelas novas + 1 gatilho. Nenhuma linha existente muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Configuração (uma linha só) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_config (
  id           BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  url_funcao   TEXT    NOT NULL,
  segredo      TEXT    NOT NULL,
  -- Até este número de pagamentos da pessoa no lote, um aviso por pagamento;
  -- acima, um resumo (decisão 4 da spec).
  corte        INTEGER NOT NULL DEFAULT 3 CHECK (corte BETWEEN 1 AND 20),
  janela_dias  INTEGER NOT NULL DEFAULT 3 CHECK (janela_dias BETWEEN 0 AND 30)
);

INSERT INTO public.push_config (id, url_funcao, segredo)
VALUES (TRUE,
        'https://vfrvvoetidtsqbbhdkmj.supabase.co/functions/v1/enviar-push',
        replace(gen_random_uuid()::TEXT || gen_random_uuid()::TEXT, '-', ''))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_config FROM anon, authenticated;

COMMENT ON TABLE public.push_config IS
  'Configuracao do aviso automatico de pagamento: liga/desliga, URL da Edge '
  'Function, segredo da rodada, corte do resumo e janela de dias. Fechada: so '
  'funcoes DEFINER e service_role leem (20260930140000).';

-- ── A fila ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_fila (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id        UUID    NOT NULL,
  codigo            TEXT    NOT NULL,
  data_pagamento    DATE    NOT NULL,
  forma_pagamento   TEXT    NOT NULL,
  operador_usuario  TEXT    NOT NULL,
  perfil_id         UUID    NOT NULL,
  valor             NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_ho          NUMERIC(12,2) NOT NULL DEFAULT 0,
  forma_detalhe     TEXT,
  nome_cliente      TEXT,
  criada_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  pego_em           TIMESTAMPTZ,
  enviado_em        TIMESTAMPTZ,
  -- 'enviado' | 'sem_aparelho' | 'inativo' | 'expirado' | 'falhou'
  situacao          TEXT,
  tentativas        SMALLINT NOT NULL DEFAULT 0,
  -- A chave natural do analítico: é ela que lembra o que já foi avisado
  -- mesmo depois de «Limpar dados» + reimportação.
  CONSTRAINT push_fila_chave_natural
    UNIQUE (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
);

CREATE INDEX IF NOT EXISTS push_fila_pendentes_idx
  ON public.push_fila (id) WHERE enviado_em IS NULL;
CREATE INDEX IF NOT EXISTS push_fila_criada_idx ON public.push_fila (criada_em);

ALTER TABLE public.push_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_fila FROM anon, authenticated;

COMMENT ON TABLE public.push_fila IS
  'Fila do aviso automatico de pagamento. Gravada so pelo gatilho de '
  'analitico_recebimentos; lida so pela Edge Function enviar-push. A chave '
  'natural unica impede avisar de novo apos limpar e reimportar (20260930140000).';

-- ── O gatilho: um por comando ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_push_enfileirar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_janela INTEGER;
BEGIN
  SELECT c.janela_dias INTO v_janela
    FROM public.push_config c
   WHERE c.ativo;
  IF v_janela IS NULL THEN
    RETURN NULL;   -- desligado (ou sem configuração)
  END IF;

  INSERT INTO public.push_fila (
    empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario,
    perfil_id, valor, valor_ho, forma_detalhe, nome_cliente
  )
  SELECT n.empresa_id, n.codigo, n.data_pagamento, n.forma_pagamento, n.operador_usuario,
         n.operador_id, COALESCE(n.valor_recebido, 0), COALESCE(n.total_ho, 0),
         n.forma_detalhe, n.nome_cliente
    FROM novas n
   WHERE n.operador_id IS NOT NULL
     AND n.data_pagamento >= (now() AT TIME ZONE 'America/Sao_Paulo')::DATE - v_janela
     AND EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = n.operador_id)
  ON CONFLICT ON CONSTRAINT push_fila_chave_natural DO NOTHING;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- O aviso nunca derruba a importação.
  RAISE WARNING '[push] fila nao gravada: %', SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_enfileirar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_analitico_push_fila ON public.analitico_recebimentos;
CREATE TRIGGER trg_analitico_push_fila
AFTER INSERT ON public.analitico_recebimentos
REFERENCING NEW TABLE AS novas
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_push_enfileirar();

-- ── O cron chama a função só se houver pendente ─────────────────────────────
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
  IF NOT EXISTS (SELECT 1 FROM public.push_fila WHERE enviado_em IS NULL) THEN
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

-- ── A rodada: conferir o segredo, pegar o lote, fechar ──────────────────────
-- Só service_role (a Edge Function) chama estas três.

CREATE OR REPLACE FUNCTION public.fn_push_segredo_confere(p_segredo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.push_config c
     WHERE c.ativo AND p_segredo IS NOT NULL AND c.segredo = p_segredo
  );
$function$;

/*
 * Pega até p_limite pendentes. Antes, fecha sem enviar o que não deve sair:
 * mais de 6 h (aviso velho confunde), pessoa desligada/de férias/inativa, e
 * pessoa sem aparelho. O que é pego fica marcado por 2 min (`pego_em`): duas
 * rodadas simultâneas não mandam o mesmo aviso.
 *
 * Devolve também, por pessoa do lote, o recebido do mês (antes e depois do
 * lote) e os degraus da meta — é daí que sai o «no mês» do resumo e o aviso de
 * meta batida. Na PaguePlay tudo em H.O. (relatório + ajuste × percentual; meta
 * × percentual), como o card «Progresso da meta».
 */
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
           'valor', g.valor, 'valor_ho', g.valor_ho,
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
           u.em_ho
      FROM unidade u
  )
  SELECT COALESCE(jsonb_object_agg(a.perfil_id, jsonb_build_object(
           'em_ho',   a.em_ho,
           'depois',  ROUND(a.depois, 2),
           'antes',   ROUND(a.depois - a.do_lote, 2),
           'degraus', to_jsonb(COALESCE(a.degraus, '{}'::NUMERIC[])))), '{}'::JSONB)
    INTO v_pessoas
    FROM acumulado a;

  RETURN jsonb_build_object('corte', v_corte, 'itens', v_itens, 'pessoas', v_pessoas);
END;
$function$;

/*
 * Fecha o lote. `p_ok`: saiu (ou a pessoa não tinha para onde mandar). `p_falha`:
 * erro de envio — volta para a fila até a 3ª tentativa; depois fecha como falhou.
 */
CREATE OR REPLACE FUNCTION public.fn_push_concluir(p_ok BIGINT[], p_falha BIGINT[])
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.push_fila
     SET enviado_em = now(), situacao = 'enviado'
   WHERE id = ANY (COALESCE(p_ok, '{}')) AND enviado_em IS NULL;
  UPDATE public.push_fila
     SET enviado_em = CASE WHEN tentativas >= 3 THEN now() END,
         situacao   = CASE WHEN tentativas >= 3 THEN 'falhou' END,
         pego_em    = NULL
   WHERE id = ANY (COALESCE(p_falha, '{}')) AND enviado_em IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_segredo_confere(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_push_pegar_lote(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_push_concluir(BIGINT[], BIGINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_segredo_confere(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_push_pegar_lote(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_push_concluir(BIGINT[], BIGINT[]) TO service_role;

-- ── Agendas ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('push-disparar')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-disparar');
  PERFORM cron.schedule('push-disparar', '* * * * *', 'SELECT public.fn_push_disparar();');

  -- 7 dias > janela de 3: a memória da chave natural nunca some antes da hora.
  PERFORM cron.unschedule('push-faxina')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-faxina');
  PERFORM cron.schedule('push-faxina', '40 3 * * *',
    $sql$DELETE FROM public.push_fila WHERE criada_em < now() - INTERVAL '7 days';$sql$);
END;
$$;

DO $guarda$
BEGIN
  IF to_regclass('public.push_fila') IS NULL OR to_regclass('public.push_config') IS NULL THEN
    RAISE EXCEPTION 'tabelas do push nao foram criadas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_analitico_push_fila') THEN
    RAISE EXCEPTION 'gatilho do push nao foi criado';
  END IF;
  IF has_table_privilege('authenticated', 'public.push_config', 'SELECT')
     OR has_table_privilege('anon', 'public.push_config', 'SELECT') THEN
    RAISE EXCEPTION 'push_config ficou legivel pela API';
  END IF;
END
$guarda$;

COMMIT;
