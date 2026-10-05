-- ============================================================================
-- Caça à Abóbora: a abóbora que aparece sozinha e quem acha primeiro leva
-- ============================================================================
--
-- ## A regra (Cleber, 05/10/2026)
--
-- O super_admin liga a caça em Configurações → Geral. Ligada, ela vale SÓ
-- PARA AQUELE DIA (fuso de São Paulo): na virada da meia-noite desliga sozinha,
-- e no dia seguinte precisa ligar de novo.
--
-- Com a caça ligada, uma abóbora é solta na tela de todo mundo, nas duas
-- empresas, num intervalo sorteado entre 30 min e 1h10. O intervalo conta do
-- fim da anterior (achada ou sumida): nunca há duas abóboras ao mesmo tempo, e
-- entre uma e outra são pelo menos 30 min sem abóbora. Ninguém achou em 15
-- min, ela some e o sorteio recomeça.
--
-- ## Quem acha primeiro leva — decidido aqui, não no navegador
--
-- `fn_abobora_pegar` trava a linha da rodada (`FOR UPDATE`). Dois cliques no
-- mesmo instante entram em fila no banco: o primeiro grava e o segundo, ao
-- receber a linha, já a encontra achada e volta com «já foi». O tempo também é
-- do banco: da hora em que a abóbora foi solta até a hora em que o pedido de
-- quem achou chegou. Relógio do computador de ninguém entra na conta.
--
-- ## As peças
--
--   abobora_caca        uma linha só: o dia em que está ligada, quem ligou e a
--                       hora da próxima abóbora. Só o super_admin lê — a hora
--                       da próxima não fica à vista de quem vai procurar.
--   abobora_rodadas     uma linha por abóbora: quando saiu, a semente do
--                       esconderijo, quem achou, a foto, o tempo e se foi a
--                       mais rápida do dia. Todo logado lê (é o que a faixa
--                       mostra).
--   fn_abobora_tick     o pg_cron, a cada minuto: some com a abóbora vencida
--                       e solta a próxima na hora marcada.
--
-- «Na hora» é um Broadcast no tópico `abobora:<empresa>` de TODAS as empresas,
-- com a linha inteira da rodada: ninguém precisa reler o banco quando ela sai
-- ou quando alguém acha. Tópico próprio, e não `permissoes`, de propósito: um
-- sinal em `permissoes` faz todo mundo reler as permissões, e o portão daquele
-- tópico sorteia até 3 s de espera por aba — injusto num jogo de quem é mais
-- rápido.
--
-- Nenhuma linha de dado existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── O dia da caça ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.abobora_caca (
  id                  SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- O dia (São Paulo) em que a caça está ligada. Outro dia, ou NULL = desligada.
  dia                 DATE,
  ligada_em           TIMESTAMPTZ,
  ligada_por          UUID,
  ligada_por_nome     TEXT,
  desligada_em        TIMESTAMPTZ,
  desligada_por_nome  TEXT,
  -- Quando a próxima abóbora sai. NULL = nenhuma marcada (há uma na tela, a
  -- caça está desligada ou o sorteio passaria da meia-noite).
  proxima_em          TIMESTAMPTZ
);

COMMENT ON TABLE public.abobora_caca IS
  'Caça à Abóbora: uma linha. Ligada só no dia em `dia` (São Paulo). Escrita só pelas '
  'funções fn_abobora_*; lida só pelo super_admin. Ver 20261005120000.';

ALTER TABLE public.abobora_caca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abobora_caca_leitura ON public.abobora_caca;
CREATE POLICY abobora_caca_leitura ON public.abobora_caca
  FOR SELECT TO authenticated USING ((SELECT public.fn_user_is_super_admin()));

GRANT SELECT ON public.abobora_caca TO authenticated;
GRANT ALL    ON public.abobora_caca TO service_role;

-- ── As abóboras ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.abobora_rodadas (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia                 DATE        NOT NULL,
  solta_em            TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expira_em           TIMESTAMPTZ NOT NULL,
  -- Sorteia o esconderijo na tela de cada um (`CacaAbobora/esconderijo.ts`).
  semente             INTEGER     NOT NULL,
  -- 'sorteio' = o cron soltou; 'teste' = o super_admin soltou na mão.
  origem              TEXT        NOT NULL DEFAULT 'sorteio' CHECK (origem IN ('sorteio', 'teste')),
  situacao            TEXT        NOT NULL DEFAULT 'solta'   CHECK (situacao IN ('solta', 'achada', 'sumiu')),
  achada_em           TIMESTAMPTZ,
  achada_por          UUID,
  achada_por_nome     TEXT,
  -- A foto de quem achou, como estava na hora. NULL = sem foto: a faixa mostra
  -- só o nome.
  achada_por_foto     TEXT,
  ms                  INTEGER,
  mais_rapida_do_dia  BOOLEAN     NOT NULL DEFAULT FALSE,
  CONSTRAINT abobora_rodadas_achada_completa CHECK (
    (situacao = 'achada') = (achada_em IS NOT NULL AND achada_por IS NOT NULL AND ms IS NOT NULL)
  )
);

COMMENT ON TABLE public.abobora_rodadas IS
  'Caça à Abóbora: uma linha por abóbora solta. Escrita só pelas funções fn_abobora_*. '
  'Ver 20261005120000.';

-- Nunca duas na tela ao mesmo tempo — nem por corrida entre o cron e o botão.
CREATE UNIQUE INDEX IF NOT EXISTS abobora_rodadas_uma_solta
  ON public.abobora_rodadas ((TRUE)) WHERE situacao = 'solta';
CREATE INDEX IF NOT EXISTS abobora_rodadas_dia ON public.abobora_rodadas (dia, id DESC);

ALTER TABLE public.abobora_rodadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abobora_rodadas_leitura ON public.abobora_rodadas;
CREATE POLICY abobora_rodadas_leitura ON public.abobora_rodadas
  FOR SELECT TO authenticated USING (TRUE);

GRANT SELECT ON public.abobora_rodadas TO authenticated;
GRANT ALL    ON public.abobora_rodadas TO service_role;

-- ── Peças internas ──────────────────────────────────────────────────────────

-- Hoje, em São Paulo.
CREATE OR REPLACE FUNCTION public.fn_abobora_hoje()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$function$;

-- A próxima: 30 min a 1h10 depois de `p_desde`, ao segundo. Se cair fora do
-- dia da caça, não há próxima.
CREATE OR REPLACE FUNCTION public.fn_abobora_sortear(p_desde timestamptz, p_dia date)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SET search_path TO ''
AS $function$
DECLARE
  v_em timestamptz := p_desde + make_interval(secs => 1800 + floor(random() * 2401));
BEGIN
  IF (v_em AT TIME ZONE 'America/Sao_Paulo')::date <> p_dia THEN
    RETURN NULL;
  END IF;
  RETURN v_em;
END;
$function$;

-- Solta uma abóbora agora. Quem chama já conferiu que não há outra na tela; o
-- índice único segura a corrida que sobrar.
CREATE OR REPLACE FUNCTION public.fn_abobora_soltar(p_origem text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.abobora_rodadas (dia, expira_em, semente, origem)
  VALUES (public.fn_abobora_hoje(), clock_timestamp() + interval '15 minutes',
          floor(random() * 2147483647)::int, p_origem)
  RETURNING id INTO v_id;

  UPDATE public.abobora_caca SET proxima_em = NULL WHERE id = 1;
  RETURN v_id;
END;
$function$;

-- O aviso a quem está logado: a linha inteira, em todas as empresas.
CREATE OR REPLACE FUNCTION public.fn_abobora_avisar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
  v_linha   jsonb := to_jsonb(NEW);
BEGIN
  FOR v_empresa IN SELECT e.id FROM public.empresas e LOOP
    PERFORM realtime.send(v_linha, 'abobora', 'abobora:' || v_empresa::text, true);
  END LOOP;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_abobora_avisar ON public.abobora_rodadas;
CREATE TRIGGER trg_abobora_avisar
  AFTER INSERT OR UPDATE ON public.abobora_rodadas
  FOR EACH ROW EXECUTE FUNCTION public.fn_abobora_avisar();

-- ── O relógio (pg_cron, a cada minuto) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_abobora_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_hoje date := public.fn_abobora_hoje();
  v_caca public.abobora_caca%ROWTYPE;
BEGIN
  -- A que ninguém achou em 15 min some da tela de todos.
  UPDATE public.abobora_rodadas
     SET situacao = 'sumiu'
   WHERE situacao = 'solta' AND expira_em <= clock_timestamp();

  SELECT * INTO v_caca FROM public.abobora_caca WHERE id = 1 FOR UPDATE;
  IF NOT FOUND OR v_caca.dia IS DISTINCT FROM v_hoje THEN
    RETURN;  -- desligada, ou ligada noutro dia: virou a noite
  END IF;

  IF EXISTS (SELECT 1 FROM public.abobora_rodadas WHERE situacao = 'solta') THEN
    RETURN;  -- tem uma na tela
  END IF;

  -- Acabou de sumir: o intervalo conta de agora. Também cobre o sorteio que
  -- tinha passado da meia-noite — sortear de novo dá sempre 30 min ou mais
  -- depois da anterior, e depois das 23h30 continua sem próxima.
  IF v_caca.proxima_em IS NULL THEN
    UPDATE public.abobora_caca SET proxima_em = public.fn_abobora_sortear(clock_timestamp(), v_hoje)
     WHERE id = 1;
    RETURN;
  END IF;

  IF v_caca.proxima_em <= clock_timestamp() THEN
    PERFORM public.fn_abobora_soltar('sorteio');
  END IF;
END;
$function$;

-- ── O que o app chama ───────────────────────────────────────────────────────

-- Clique na abóbora. Devolve { ganhou, rodada } — `rodada` é a linha como
-- ficou, para quem perdeu saber quem levou.
CREATE OR REPLACE FUNCTION public.fn_abobora_pegar(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- A hora em que o pedido CHEGOU — antes de esperar a trava de ninguém.
  v_agora  timestamptz := clock_timestamp();
  v_rodada public.abobora_rodadas%ROWTYPE;
  v_nome   text;
  v_foto   text;
  v_ms     integer;
  v_rapida boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  -- A trava que decide: quem chega depois espera aqui e lê a linha já achada.
  SELECT * INTO v_rodada FROM public.abobora_rodadas WHERE id = p_rodada FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ganhou', false, 'rodada', NULL);
  END IF;
  IF v_rodada.situacao <> 'solta' OR v_rodada.expira_em <= v_agora THEN
    RETURN jsonb_build_object('ganhou', false, 'rodada', to_jsonb(v_rodada));
  END IF;

  SELECT p.nome, nullif(btrim(p.foto_url), '') INTO v_nome, v_foto
    FROM public.perfis p WHERE p.id = auth.uid();

  v_ms := greatest(0, round(extract(epoch FROM (v_agora - v_rodada.solta_em)) * 1000))::int;

  -- A mais rápida do dia: precisa ter outra achada hoje para bater.
  v_rapida := EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.id <> v_rodada.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.id <> v_rodada.id AND r.ms <= v_ms);

  UPDATE public.abobora_rodadas
     SET situacao           = 'achada',
         achada_em          = v_agora,
         achada_por         = auth.uid(),
         achada_por_nome    = coalesce(nullif(btrim(v_nome), ''), 'Alguém'),
         achada_por_foto    = v_foto,
         ms                 = v_ms,
         mais_rapida_do_dia = v_rapida
   WHERE id = v_rodada.id
  RETURNING * INTO v_rodada;

  -- A próxima conta de agora — se a caça ainda está ligada hoje.
  UPDATE public.abobora_caca
     SET proxima_em = public.fn_abobora_sortear(v_agora, dia)
   WHERE id = 1 AND dia = public.fn_abobora_hoje();

  RETURN jsonb_build_object('ganhou', true, 'rodada', to_jsonb(v_rodada));
END;
$function$;

-- Liga (só para hoje) ou desliga. Só super_admin.
CREATE OR REPLACE FUNCTION public.fn_abobora_ligar(p_ligar boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_hoje date := public.fn_abobora_hoje();
  v_nome text;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin liga a Caça à Abóbora' USING ERRCODE = '42501';
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();
  INSERT INTO public.abobora_caca (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  PERFORM 1 FROM public.abobora_caca WHERE id = 1 FOR UPDATE;

  IF p_ligar THEN
    UPDATE public.abobora_caca c
       SET dia             = v_hoje,
           ligada_em       = CASE WHEN c.dia = v_hoje THEN c.ligada_em       ELSE now()      END,
           ligada_por      = CASE WHEN c.dia = v_hoje THEN c.ligada_por      ELSE auth.uid() END,
           ligada_por_nome = CASE WHEN c.dia = v_hoje THEN c.ligada_por_nome ELSE v_nome     END,
           -- Já ligada hoje mantém a marca; com uma na tela, a próxima é
           -- sorteada quando ela acabar.
           proxima_em      = CASE
             WHEN EXISTS (SELECT 1 FROM public.abobora_rodadas WHERE situacao = 'solta') THEN NULL
             WHEN c.dia = v_hoje AND c.proxima_em IS NOT NULL THEN c.proxima_em
             ELSE public.fn_abobora_sortear(clock_timestamp(), v_hoje)
           END
     WHERE c.id = 1;
  ELSE
    UPDATE public.abobora_caca
       SET dia = NULL, proxima_em = NULL, desligada_em = now(), desligada_por_nome = v_nome
     WHERE id = 1;
    -- Desligou: a que está na tela some agora.
    UPDATE public.abobora_rodadas SET situacao = 'sumiu' WHERE situacao = 'solta';
  END IF;
END;
$function$;

-- «Soltar uma agora», do painel. Só super_admin; vale mesmo com a caça
-- desligada (é como ele testa). Recusa se já houver uma na tela.
CREATE OR REPLACE FUNCTION public.fn_abobora_soltar_agora()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin solta a abóbora' USING ERRCODE = '42501';
  END IF;

  -- Vencida que o cron ainda não varreu não conta como «na tela».
  UPDATE public.abobora_rodadas SET situacao = 'sumiu'
   WHERE situacao = 'solta' AND expira_em <= clock_timestamp();

  IF EXISTS (SELECT 1 FROM public.abobora_rodadas WHERE situacao = 'solta') THEN
    RAISE EXCEPTION 'JA_TEM_UMA: já há uma abóbora na tela' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.fn_abobora_soltar('teste');
END;
$function$;

-- ── Quem pode chamar ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_abobora_hoje()                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_abobora_sortear(timestamptz, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_abobora_soltar(text)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_abobora_avisar()                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_abobora_tick()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_abobora_pegar(bigint)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_abobora_ligar(boolean)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_abobora_soltar_agora()             FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_abobora_hoje()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_abobora_pegar(bigint)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_abobora_ligar(boolean)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_abobora_soltar_agora()  TO authenticated;

-- ── O tópico `abobora:<empresa>` ────────────────────────────────────────────
-- Policy própria, ao lado de `sinal_mudou_receber` (as duas somam): quem tem
-- acesso à empresa ouve. Sem policy de INSERT: só o banco avisa.
DROP POLICY IF EXISTS abobora_receber ON realtime.messages;
CREATE POLICY abobora_receber ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND split_part((SELECT realtime.topic()), ':', 1) = 'abobora'
    AND (SELECT public.fn_realtime_posso_ouvir_empresa((SELECT realtime.topic())))
  );

-- ── A agenda ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('abobora-tick')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'abobora-tick');
  PERFORM cron.schedule('abobora-tick', '* * * * *', 'SELECT public.fn_abobora_tick();');
END;
$$;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.abobora_caca') IS NULL OR to_regclass('public.abobora_rodadas') IS NULL THEN
    RAISE EXCEPTION 'tabelas da Caça à Abóbora não criadas';
  END IF;
  IF to_regprocedure('public.fn_abobora_pegar(bigint)') IS NULL
     OR to_regprocedure('public.fn_abobora_ligar(boolean)') IS NULL
     OR to_regprocedure('public.fn_abobora_tick()') IS NULL THEN
    RAISE EXCEPTION 'funções da Caça à Abóbora não criadas';
  END IF;
  IF to_regprocedure('public.fn_realtime_posso_ouvir_empresa(text)') IS NULL THEN
    RAISE EXCEPTION 'fn_realtime_posso_ouvir_empresa sumiu — a policy do tópico não funcionaria';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'abobora-tick' AND active) THEN
    RAISE EXCEPTION 'agenda abobora-tick não ficou ativa';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_abobora_tick()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_abobora_soltar(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'peças internas da Caça à Abóbora ficaram abertas ao app';
  END IF;
END
$prova$;

COMMIT;
