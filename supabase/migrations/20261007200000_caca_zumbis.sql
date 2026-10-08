-- ============================================================================
-- Caça aos Zumbis: a abóbora vira zumbi, com skin do dia e HEADSHOT
-- ============================================================================
--
-- ## O que muda (Cleber, 07/10/2026)
--
-- A Caça à Abóbora (20261005120000) vira a Caça aos Zumbis. A regra do jogo é
-- a mesma — o super_admin liga só para o dia, o cron solta, quem chega primeiro
-- ao banco leva, a trava da linha resolve o empate — e três coisas entram:
--
--   1. QUAL ZUMBI. São 8 desenhos (`CacaAbobora/zumbis.ts`). O banco sorteia
--      um que ainda não saiu NO DIA: quatro zumbis no dia são quatro
--      diferentes. Todo mundo vê o mesmo, porque vem na linha da rodada. Se o
--      dia passar de 8, volta a sortear entre todos, menos o último.
--   2. HEADSHOT. Quem mata conta ao banco se foi tiro na cabeça
--      (`p_headshot`). Vai na linha, e a faixa mostra a etiqueta para todos.
--   3. DOIS RECORDES. `mais_rapida_do_dia` continua sendo o mais rápido de
--      qualquer tiro; `headshot_mais_rapido_do_dia` é o mais rápido só entre
--      os headshots. Como antes, precisa haver outro no dia para bater.
--
-- ## Compatibilidade
--
-- `fn_abobora_pegar(bigint)` sai e entra `fn_abobora_pegar(bigint, boolean
-- DEFAULT false)`. Duas versões ao mesmo tempo deixariam o PostgREST sem saber
-- qual chamar. Aba antiga aberta (chama só com `p_rodada`) cai na nova pelo
-- default, e o tiro vale como tiro no corpo. O app novo, antes desta
-- migration, tenta com `p_headshot` e, sem a função nova, chama sem ele.
--
-- O Broadcast manda a linha inteira (`to_jsonb(NEW)`): as colunas novas já
-- vão junto, sem mexer no aviso.
--
-- Nenhuma linha de dado existente muda (as colunas novas nascem NULL/false).
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── As colunas ──────────────────────────────────────────────────────────────
ALTER TABLE public.abobora_rodadas
  ADD COLUMN IF NOT EXISTS zumbi                       SMALLINT,
  ADD COLUMN IF NOT EXISTS headshot                    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS headshot_mais_rapido_do_dia BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.abobora_rodadas DROP CONSTRAINT IF EXISTS abobora_rodadas_zumbi_valido;
ALTER TABLE public.abobora_rodadas
  ADD CONSTRAINT abobora_rodadas_zumbi_valido CHECK (zumbi IS NULL OR zumbi BETWEEN 0 AND 7);

COMMENT ON COLUMN public.abobora_rodadas.zumbi IS
  'Qual dos 8 zumbis (CacaAbobora/zumbis.ts, ZUMBIS[zumbi]). Sorteado entre os que não saíram no dia. NULL = rodada de antes de 20261007200000.';
COMMENT ON COLUMN public.abobora_rodadas.headshot IS
  'Quem matou acertou a cabeça.';
COMMENT ON COLUMN public.abobora_rodadas.headshot_mais_rapido_do_dia IS
  'O headshot mais rápido do dia — só entre os headshots, com outro no dia para bater.';

-- ── Soltar: agora escolhe o zumbi ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_abobora_soltar(p_origem text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id    bigint;
  v_hoje  date := public.fn_abobora_hoje();
  v_zumbi smallint;
BEGIN
  -- Um que ainda não saiu hoje.
  SELECT z INTO v_zumbi
    FROM generate_series(0, 7) AS z
   WHERE z NOT IN (SELECT r.zumbi FROM public.abobora_rodadas r
                    WHERE r.dia = v_hoje AND r.zumbi IS NOT NULL)
   ORDER BY random()
   LIMIT 1;

  -- Os 8 já saíram: qualquer um, menos o último (nunca o mesmo duas vezes seguidas).
  IF v_zumbi IS NULL THEN
    SELECT z INTO v_zumbi
      FROM generate_series(0, 7) AS z
     WHERE z IS DISTINCT FROM (SELECT r.zumbi FROM public.abobora_rodadas r ORDER BY r.id DESC LIMIT 1)
     ORDER BY random()
     LIMIT 1;
  END IF;

  INSERT INTO public.abobora_rodadas (dia, expira_em, semente, origem, zumbi)
  VALUES (v_hoje, clock_timestamp() + interval '15 minutes',
          floor(random() * 2147483647)::int, p_origem, v_zumbi)
  RETURNING id INTO v_id;

  UPDATE public.abobora_caca SET proxima_em = NULL WHERE id = 1;
  RETURN v_id;
END;
$function$;

-- ── O tiro ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_abobora_pegar(bigint);

-- Tiro no zumbi. Devolve { ganhou, rodada } — `rodada` é a linha como ficou,
-- para quem perdeu saber quem levou.
CREATE OR REPLACE FUNCTION public.fn_abobora_pegar(p_rodada bigint, p_headshot boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- A hora em que o pedido CHEGOU — antes de esperar a trava de ninguém.
  v_agora    timestamptz := clock_timestamp();
  v_rodada   public.abobora_rodadas%ROWTYPE;
  v_headshot boolean := coalesce(p_headshot, false);
  v_nome     text;
  v_foto     text;
  v_ms       integer;
  v_rapida   boolean;
  v_hs       boolean;
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
         headshot_mais_rapido_do_dia = v_hs
   WHERE id = v_rodada.id
  RETURNING * INTO v_rodada;

  -- O próximo conta de agora — se a caça ainda está ligada hoje.
  UPDATE public.abobora_caca
     SET proxima_em = public.fn_abobora_sortear(v_agora, dia)
   WHERE id = 1 AND dia = public.fn_abobora_hoje();

  RETURN jsonb_build_object('ganhou', true, 'rodada', to_jsonb(v_rodada));
END;
$function$;

-- ── Quem pode chamar ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_abobora_soltar(text)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_abobora_pegar(bigint, boolean)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_abobora_pegar(bigint, boolean) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'abobora_rodadas' AND column_name = 'zumbi')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'abobora_rodadas' AND column_name = 'headshot')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'abobora_rodadas'
                    AND column_name = 'headshot_mais_rapido_do_dia') THEN
    RAISE EXCEPTION 'colunas da Caça aos Zumbis não criadas';
  END IF;
  IF to_regprocedure('public.fn_abobora_pegar(bigint, boolean)') IS NULL THEN
    RAISE EXCEPTION 'fn_abobora_pegar(bigint, boolean) não criada';
  END IF;
  IF to_regprocedure('public.fn_abobora_pegar(bigint)') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_abobora_pegar(bigint) antiga ficou — o PostgREST não saberia qual chamar';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_abobora_pegar(bigint, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_abobora_pegar(bigint, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_abobora_soltar(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'permissões da Caça aos Zumbis erradas';
  END IF;
END
$prova$;

COMMIT;

-- O PostgREST relê as funções (a assinatura do tiro mudou).
NOTIFY pgrst, 'reload schema';
