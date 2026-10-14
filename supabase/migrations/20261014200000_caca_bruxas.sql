-- ============================================================================
-- Caça às Bruxas: o tema da semana, a bruxa da rodada, o tiro e o «2x»
-- ============================================================================
--
-- ## O que muda (14/10/2026)
--
-- A caça (20261005120000, 20261007200000) ganha um TEMA, escolhido pelo
-- super_admin em Configurações → Geral: 'zumbis' (como sempre) ou 'bruxas'.
-- A regra do jogo não muda — liga só para o dia, o cron solta, quem chega
-- primeiro ao banco leva, a trava da linha resolve o empate.
--
--   1. O TEMA vai na rodada (`abobora_rodadas.tema`), não só na configuração:
--      quem não é super_admin não lê `abobora_caca`, e é a rodada que diz a
--      cada tela se desenha um zumbi ou uma bruxa.
--   2. QUAL BRUXA. São 8 (`CacaAbobora/bruxas/arte.ts`, BRUXAS[bruxa]), e o
--      sorteio é o mesmo dos zumbis: uma que ainda não saiu no dia; passou de
--      8, qualquer uma menos a última.
--   3. O TIRO (`tiro`): 'cabeca', 'corpo' ou 'vassoura'. Quem não atirou vê a
--      bruxa cair do jeito que o vencedor derrubou. `headshot` continua.
--   4. FINALIZAR. Os fofos (bruxas 0, 2, 4 e 6: a Bruxinha Fofa, a Gatinha,
--      o Gato e a Fantasminha) não morrem no tiro: caem desacordados. Quem
--      clicar neles no chão finaliza (`fn_abobora_finalizar`) — o primeiro
--      clique leva, pela mesma trava da linha. Se foi a mesma pessoa que
--      derrubou, `dobrado`: a faixa mostra o «2x».
--
-- ## Compatibilidade
--
-- `fn_abobora_pegar(bigint, boolean)` sai e entra `fn_abobora_pegar(bigint,
-- boolean DEFAULT false, text DEFAULT NULL)`. Aba antiga aberta (chama com
-- `p_rodada` e `p_headshot`) cai na nova pelo default e o tiro vale como
-- cabeça ou corpo. O app novo, antes desta migration, tenta com `p_tiro` e,
-- sem a função nova, chama sem ele.
--
-- O Broadcast manda a linha inteira (`to_jsonb(NEW)`): as colunas novas e a
-- finalização já vão junto, sem mexer no aviso.
--
-- Nenhuma linha de dado existente muda de sentido: as colunas novas nascem
-- 'zumbis' / NULL / false, e o tema da caça nasce 'zumbis'. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── As colunas ──────────────────────────────────────────────────────────────
ALTER TABLE public.abobora_caca
  ADD COLUMN IF NOT EXISTS tema TEXT NOT NULL DEFAULT 'zumbis';

ALTER TABLE public.abobora_caca DROP CONSTRAINT IF EXISTS abobora_caca_tema_valido;
ALTER TABLE public.abobora_caca
  ADD CONSTRAINT abobora_caca_tema_valido CHECK (tema IN ('zumbis', 'bruxas'));

COMMENT ON COLUMN public.abobora_caca.tema IS
  'O que o cron solta: zumbis ou bruxas. Trocado só por fn_abobora_tema (super_admin). Ver 20261014200000.';

ALTER TABLE public.abobora_rodadas
  ADD COLUMN IF NOT EXISTS tema                TEXT    NOT NULL DEFAULT 'zumbis',
  ADD COLUMN IF NOT EXISTS bruxa               SMALLINT,
  ADD COLUMN IF NOT EXISTS tiro                TEXT,
  ADD COLUMN IF NOT EXISTS finalizada_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalizada_por      UUID,
  ADD COLUMN IF NOT EXISTS finalizada_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS dobrado             BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.abobora_rodadas DROP CONSTRAINT IF EXISTS abobora_rodadas_tema_valido;
ALTER TABLE public.abobora_rodadas
  ADD CONSTRAINT abobora_rodadas_tema_valido CHECK (tema IN ('zumbis', 'bruxas'));
ALTER TABLE public.abobora_rodadas DROP CONSTRAINT IF EXISTS abobora_rodadas_bruxa_valida;
ALTER TABLE public.abobora_rodadas
  ADD CONSTRAINT abobora_rodadas_bruxa_valida CHECK (bruxa IS NULL OR bruxa BETWEEN 0 AND 7);
ALTER TABLE public.abobora_rodadas DROP CONSTRAINT IF EXISTS abobora_rodadas_tiro_valido;
ALTER TABLE public.abobora_rodadas
  ADD CONSTRAINT abobora_rodadas_tiro_valido CHECK (tiro IS NULL OR tiro IN ('cabeca', 'corpo', 'vassoura'));

COMMENT ON COLUMN public.abobora_rodadas.tema IS
  'zumbis ou bruxas: o que esta rodada desenha. Copiado de abobora_caca.tema na hora de soltar.';
COMMENT ON COLUMN public.abobora_rodadas.bruxa IS
  'Qual das 8 bruxas (CacaAbobora/bruxas/arte.ts, BRUXAS[bruxa]). NULL nas rodadas de zumbi.';
COMMENT ON COLUMN public.abobora_rodadas.tiro IS
  'Onde o tiro do vencedor pegou: cabeca, corpo ou vassoura. NULL = rodada de antes de 20261014200000.';
COMMENT ON COLUMN public.abobora_rodadas.dobrado IS
  'Fofo (bruxa 0, 2, 4 ou 6) finalizado no chão por quem o derrubou: o «2x» da faixa.';

-- ── Soltar: zumbi ou bruxa, conforme o tema ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_abobora_soltar(p_origem text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id    bigint;
  v_hoje  date := public.fn_abobora_hoje();
  v_tema  text;
  v_zumbi smallint;
  v_bruxa smallint;
BEGIN
  SELECT c.tema INTO v_tema FROM public.abobora_caca c WHERE c.id = 1;
  v_tema := coalesce(v_tema, 'zumbis');

  IF v_tema = 'bruxas' THEN
    -- Uma que ainda não saiu hoje.
    SELECT b INTO v_bruxa
      FROM generate_series(0, 7) AS b
     WHERE b NOT IN (SELECT r.bruxa FROM public.abobora_rodadas r
                      WHERE r.dia = v_hoje AND r.bruxa IS NOT NULL)
     ORDER BY random()
     LIMIT 1;
    -- As 8 já saíram: qualquer uma, menos a última.
    IF v_bruxa IS NULL THEN
      SELECT b INTO v_bruxa
        FROM generate_series(0, 7) AS b
       WHERE b IS DISTINCT FROM (SELECT r.bruxa FROM public.abobora_rodadas r
                                  WHERE r.bruxa IS NOT NULL ORDER BY r.id DESC LIMIT 1)
       ORDER BY random()
       LIMIT 1;
    END IF;
  ELSE
    -- Um zumbi que ainda não saiu hoje (como em 20261007200000).
    SELECT z INTO v_zumbi
      FROM generate_series(0, 7) AS z
     WHERE z NOT IN (SELECT r.zumbi FROM public.abobora_rodadas r
                      WHERE r.dia = v_hoje AND r.zumbi IS NOT NULL)
     ORDER BY random()
     LIMIT 1;
    IF v_zumbi IS NULL THEN
      SELECT z INTO v_zumbi
        FROM generate_series(0, 7) AS z
       WHERE z IS DISTINCT FROM (SELECT r.zumbi FROM public.abobora_rodadas r
                                  WHERE r.zumbi IS NOT NULL ORDER BY r.id DESC LIMIT 1)
       ORDER BY random()
       LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.abobora_rodadas (dia, expira_em, semente, origem, zumbi, tema, bruxa)
  VALUES (v_hoje, clock_timestamp() + interval '15 minutes',
          floor(random() * 2147483647)::int, p_origem, v_zumbi, v_tema, v_bruxa)
  RETURNING id INTO v_id;

  UPDATE public.abobora_caca SET proxima_em = NULL WHERE id = 1;
  RETURN v_id;
END;
$function$;

-- ── O tiro: agora diz onde pegou ────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_abobora_pegar(bigint);
DROP FUNCTION IF EXISTS public.fn_abobora_pegar(bigint, boolean);

-- Tiro no zumbi ou na bruxa. Devolve { ganhou, rodada } — `rodada` é a linha
-- como ficou, para quem perdeu saber quem levou.
CREATE OR REPLACE FUNCTION public.fn_abobora_pegar(
  p_rodada   bigint,
  p_headshot boolean DEFAULT false,
  p_tiro     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- A hora em que o pedido CHEGOU — antes de esperar a trava de ninguém.
  v_agora    timestamptz := clock_timestamp();
  v_rodada   public.abobora_rodadas%ROWTYPE;
  -- `coalesce` nos dois lados: `false OR NULL` é NULL, e headshot é NOT NULL.
  v_headshot boolean := coalesce(p_headshot, false) OR coalesce(p_tiro = 'cabeca', false);
  v_tiro     text;
  v_nome     text;
  v_foto     text;
  v_ms       integer;
  v_rapida   boolean;
  v_hs       boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  v_tiro := CASE
    WHEN p_tiro IN ('cabeca', 'corpo', 'vassoura') THEN p_tiro
    WHEN v_headshot THEN 'cabeca'
    ELSE 'corpo'
  END;

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

  -- O mais rápido do dia, de qualquer tiro: precisa ter outro morto hoje para bater.
  v_rapida := EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.id <> v_rodada.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.id <> v_rodada.id AND r.ms <= v_ms);

  -- O headshot mais rápido do dia: o mesmo, só entre os headshots.
  v_hs := v_headshot
    AND EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.headshot AND r.id <> v_rodada.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.abobora_rodadas r
       WHERE r.dia = v_rodada.dia AND r.situacao = 'achada' AND r.headshot AND r.id <> v_rodada.id
         AND r.ms <= v_ms);

  UPDATE public.abobora_rodadas
     SET situacao                    = 'achada',
         achada_em                   = v_agora,
         achada_por                  = auth.uid(),
         achada_por_nome             = coalesce(nullif(btrim(v_nome), ''), 'Alguém'),
         achada_por_foto             = v_foto,
         ms                          = v_ms,
         mais_rapida_do_dia          = v_rapida,
         headshot                    = v_headshot,
         headshot_mais_rapido_do_dia = v_hs,
         tiro                        = v_tiro
   WHERE id = v_rodada.id
  RETURNING * INTO v_rodada;

  -- O próximo conta de agora — se a caça ainda está ligada hoje.
  UPDATE public.abobora_caca
     SET proxima_em = public.fn_abobora_sortear(v_agora, dia)
   WHERE id = 1 AND dia = public.fn_abobora_hoje();

  RETURN jsonb_build_object('ganhou', true, 'rodada', to_jsonb(v_rodada));
END;
$function$;

-- ── Finalizar o fofo desacordado ────────────────────────────────────────────
-- O segundo tiro, no chão. Só nas rodadas de bruxa fofa (0, 2, 4, 6 — as de
-- `fofa: true` em `bruxas/arte.ts`), já achadas, ainda não finalizadas e até
-- 20 s depois do tiro (o corpo apaga da tela em 9). O primeiro clique leva,
-- pela trava da linha. Devolve { finalizou, rodada }.
CREATE OR REPLACE FUNCTION public.fn_abobora_finalizar(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_agora  timestamptz := clock_timestamp();
  v_rodada public.abobora_rodadas%ROWTYPE;
  v_nome   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rodada FROM public.abobora_rodadas WHERE id = p_rodada FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('finalizou', false, 'rodada', NULL);
  END IF;
  IF v_rodada.tema <> 'bruxas'
     OR v_rodada.situacao <> 'achada'
     OR coalesce(v_rodada.bruxa, -1) NOT IN (0, 2, 4, 6)
     OR v_rodada.finalizada_por IS NOT NULL
     OR v_agora > v_rodada.achada_em + interval '20 seconds' THEN
    RETURN jsonb_build_object('finalizou', false, 'rodada', to_jsonb(v_rodada));
  END IF;

  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = auth.uid();

  UPDATE public.abobora_rodadas
     SET finalizada_em       = v_agora,
         finalizada_por      = auth.uid(),
         finalizada_por_nome = coalesce(nullif(btrim(v_nome), ''), 'Alguém'),
         dobrado             = (auth.uid() = v_rodada.achada_por)
   WHERE id = v_rodada.id
  RETURNING * INTO v_rodada;

  RETURN jsonb_build_object('finalizou', true, 'rodada', to_jsonb(v_rodada));
END;
$function$;

-- ── O tema da semana ────────────────────────────────────────────────────────
-- Só super_admin. Vale para a próxima rodada que sair; a que está na tela fica
-- como está.
CREATE OR REPLACE FUNCTION public.fn_abobora_tema(p_tema text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin troca o tema da caça' USING ERRCODE = '42501';
  END IF;
  IF p_tema IS NULL OR p_tema NOT IN ('zumbis', 'bruxas') THEN
    RAISE EXCEPTION 'TEMA_INVALIDO: %', p_tema USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.abobora_caca (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  UPDATE public.abobora_caca SET tema = p_tema WHERE id = 1;
END;
$function$;

-- ── Quem pode chamar ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_abobora_soltar(text)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_abobora_pegar(bigint, boolean, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_abobora_finalizar(bigint)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_abobora_tema(text)                      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_abobora_pegar(bigint, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_abobora_finalizar(bigint)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_abobora_tema(text)                   TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'abobora_caca' AND column_name = 'tema') THEN
    RAISE EXCEPTION 'abobora_caca.tema não criada';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'abobora_rodadas'
         AND column_name IN ('tema', 'bruxa', 'tiro', 'finalizada_em', 'finalizada_por',
                             'finalizada_por_nome', 'dobrado')) <> 7 THEN
    RAISE EXCEPTION 'colunas da Caça às Bruxas em abobora_rodadas não criadas';
  END IF;
  IF to_regprocedure('public.fn_abobora_pegar(bigint, boolean, text)') IS NULL
     OR to_regprocedure('public.fn_abobora_finalizar(bigint)') IS NULL
     OR to_regprocedure('public.fn_abobora_tema(text)') IS NULL THEN
    RAISE EXCEPTION 'funções da Caça às Bruxas não criadas';
  END IF;
  IF to_regprocedure('public.fn_abobora_pegar(bigint, boolean)') IS NOT NULL
     OR to_regprocedure('public.fn_abobora_pegar(bigint)') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_abobora_pegar antiga ficou — o PostgREST não saberia qual chamar';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_abobora_pegar(bigint, boolean, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_abobora_finalizar(bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_abobora_pegar(bigint, boolean, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_abobora_finalizar(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_abobora_soltar(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'permissões da Caça às Bruxas erradas';
  END IF;
END
$prova$;

COMMIT;

-- O PostgREST relê as funções (a assinatura do tiro mudou).
NOTIFY pgrst, 'reload schema';
