-- ============================================================================
-- Modo TV: o Bingo da Central de jogos
-- 30/10/2026 · pedido do Cleber · spec docs/superpowers/specs/2026-10-30-modo-tv-bingo-design.md
-- ============================================================================
--
-- O líder abre uma partida num painel de TV e escolhe quem joga. Cada
-- participante ganha uma cartela na própria tela do sistema; a TV sorteia e
-- anima; o líder vê quem está perto e comemora quem completou.
--
-- ## Quem decide: o banco
--
-- Cartela e pedra saem daqui, nunca do navegador — um sorteio decidido no
-- cliente é um sorteio que qualquer pessoa com o console aberto escolhe. A
-- aleatoriedade é a de `gen_random_uuid()` (o gerador forte do Postgres, o
-- mesmo dos ids), sem depender de extensão.
--
-- ## Leve (pedido do Cleber)
--
-- - As marcações do jogador ficam no navegador dele. O banco só as recebe no
--   grito (`fn_bingo_gritar`), para conferir.
-- - Por pedra: 1 INSERT e 2 avisos — `bingo:<partida>` (privado, participantes
--   e controle; a policy confere UMA vez, na entrada do canal) e
--   `tv-painel:<painel>` (o público que a TV já ouve). O número vai dentro do
--   aviso: ninguém relê nada por pedra.
-- - O convite (cartela nova) vai pelo canal pessoal `chat:<pessoa>`, que todo
--   mundo já assina: quem não joga não ganha assinatura nenhuma.
--
-- ## Tabelas sem acesso direto
--
-- RLS ligada e nenhuma policy: tudo passa pelas RPCs abaixo
-- (SECURITY DEFINER), como em `profissionais`.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. Tabelas ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bingo_partidas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  painel_id         UUID NOT NULL REFERENCES public.tv_paineis(id) ON DELETE CASCADE,
  criada_por        UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  tema              TEXT NOT NULL DEFAULT 'chiclete'
                      CHECK (tema IN ('fliperama', 'chiclete', 'rpg', 'galaxia', 'aquario', 'bloco', 'gacha', 'bichinho')),
  -- Sem marcar a pedra nesse tempo, a cartela marca sozinha.
  auto_marcar_s     SMALLINT NOT NULL DEFAULT 120 CHECK (auto_marcar_s IN (60, 120, 180, 300)),
  premio_quina      TEXT CHECK (char_length(premio_quina) <= 60),
  premio_bingo      TEXT CHECK (char_length(premio_bingo) <= 60),
  som_na_tv         BOOLEAN NOT NULL DEFAULT TRUE,
  estado            TEXT NOT NULL DEFAULT 'aberta' CHECK (estado IN ('aberta', 'encerrada')),
  -- Nulo = manual.
  auto_intervalo_s  SMALLINT CHECK (auto_intervalo_s IN (20, 30, 60)),
  auto_pausado      BOOLEAN NOT NULL DEFAULT FALSE,
  proxima_pedra_em  TIMESTAMPTZ,
  criada_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_em      TIMESTAMPTZ
);

-- Uma partida aberta por painel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bingo_partida_aberta_por_painel
  ON public.bingo_partidas (painel_id) WHERE estado = 'aberta';

CREATE TABLE IF NOT EXISTS public.bingo_cartelas (
  partida_id   UUID NOT NULL REFERENCES public.bingo_partidas(id) ON DELETE CASCADE,
  perfil_id    UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  -- 25 números, linha a linha; o índice 13 (o meio) é 0, a estrela.
  numeros      SMALLINT[] NOT NULL CHECK (array_length(numeros, 1) = 25),
  gritou_em    TIMESTAMPTZ,
  gritou_tipo  TEXT CHECK (gritou_tipo IN ('quina', 'cheia')),
  criada_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (partida_id, perfil_id)
);
CREATE INDEX IF NOT EXISTS idx_bingo_cartelas_perfil ON public.bingo_cartelas (perfil_id);

CREATE TABLE IF NOT EXISTS public.bingo_pedras (
  partida_id   UUID NOT NULL REFERENCES public.bingo_partidas(id) ON DELETE CASCADE,
  ordem        SMALLINT NOT NULL CHECK (ordem BETWEEN 1 AND 75),
  numero       SMALLINT NOT NULL CHECK (numero BETWEEN 1 AND 75),
  sorteada_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (partida_id, ordem),
  -- A mesma pedra nunca sai duas vezes, nem com clique duplo.
  UNIQUE (partida_id, numero)
);

CREATE TABLE IF NOT EXISTS public.bingo_vitorias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partida_id     UUID NOT NULL REFERENCES public.bingo_partidas(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL CHECK (tipo IN ('quina', 'cheia')),
  comemorada_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  por            UUID REFERENCES public.perfis(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_bingo_vitorias_partida ON public.bingo_vitorias (partida_id, comemorada_em DESC);

CREATE TABLE IF NOT EXISTS public.bingo_vitoria_ganhadores (
  vitoria_id  UUID NOT NULL REFERENCES public.bingo_vitorias(id) ON DELETE CASCADE,
  perfil_id   UUID NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  -- Os índices (0–24) da linha vencedora; os 25 na cartela cheia. É a prova.
  padrao      SMALLINT[] NOT NULL,
  PRIMARY KEY (vitoria_id, perfil_id)
);

ALTER TABLE public.bingo_partidas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_cartelas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_pedras             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_vitorias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_vitoria_ganhadores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bingo_partidas, public.bingo_cartelas, public.bingo_pedras,
              public.bingo_vitorias, public.bingo_vitoria_ganhadores FROM anon, authenticated;

COMMENT ON TABLE public.bingo_partidas IS
  'Bingo do Modo TV (20261030200000). Sem policy: tudo por fn_bingo_*.';

-- ── 2. Peças internas ────────────────────────────────────────────────────────

/** Um inteiro de 0 a n-1, do gerador forte do Postgres. */
CREATE OR REPLACE FUNCTION public.fn_bingo_sorteio(p_n INTEGER)
RETURNS INTEGER
LANGUAGE sql
VOLATILE
SET search_path TO public, pg_temp
AS $function$
  -- 48 bits de um uuid v4 (todos aleatórios): o viés do módulo some em n ≤ 75.
  SELECT (('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint % GREATEST(p_n, 1))::INTEGER;
$function$;

/** Uma cartela tradicional: B 1–15, I 16–30, N 31–45 (4 + estrela), G 46–60, O 61–75. */
CREATE OR REPLACE FUNCTION public.fn_bingo_cartela_nova()
RETURNS SMALLINT[]
LANGUAGE plpgsql
VOLATILE
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_cartela SMALLINT[] := array_fill(0::SMALLINT, ARRAY[25]);
  v_coluna  SMALLINT[];
  c INTEGER;
  r INTEGER;
BEGIN
  FOR c IN 0..4 LOOP
    -- Embaralha a faixa da coluna pelo gerador forte e pega as cinco primeiras.
    SELECT array_agg(n ORDER BY k) INTO v_coluna
      FROM (SELECT n::SMALLINT AS n, gen_random_uuid() AS k
              FROM generate_series(c * 15 + 1, c * 15 + 15) n) x;
    FOR r IN 0..4 LOOP
      v_cartela[r * 5 + c + 1] := v_coluna[r + 1];
    END LOOP;
  END LOOP;
  v_cartela[13] := 0;
  RETURN v_cartela;
END;
$function$;

/**
 * Os índices (0–24) da linha que fecha, se fecha. `quina`: a primeira linha,
 * coluna ou diagonal completa. `cheia`: as 25. Nulo = não fechou.
 * `p_marcadas` é o que vale como marcado (pedras sorteadas, ou o que o
 * jogador marcou); a estrela do meio sempre vale.
 */
CREATE OR REPLACE FUNCTION public.fn_bingo_padrao(p_numeros SMALLINT[], p_marcadas SMALLINT[], p_tipo TEXT)
RETURNS SMALLINT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_linhas SMALLINT[][] := ARRAY[
    ARRAY[0,1,2,3,4], ARRAY[5,6,7,8,9], ARRAY[10,11,12,13,14], ARRAY[15,16,17,18,19], ARRAY[20,21,22,23,24],
    ARRAY[0,5,10,15,20], ARRAY[1,6,11,16,21], ARRAY[2,7,12,17,22], ARRAY[3,8,13,18,23], ARRAY[4,9,14,19,24],
    ARRAY[0,6,12,18,24], ARRAY[4,8,12,16,20]]::SMALLINT[][];
  v_ok  BOOLEAN;
  i INTEGER;
  j INTEGER;
  v_n SMALLINT;
BEGIN
  IF p_numeros IS NULL OR array_length(p_numeros, 1) <> 25 THEN RETURN NULL; END IF;
  IF p_tipo = 'cheia' THEN
    FOR i IN 1..25 LOOP
      v_n := p_numeros[i];
      IF v_n <> 0 AND NOT (v_n = ANY (COALESCE(p_marcadas, '{}'))) THEN RETURN NULL; END IF;
    END LOOP;
    RETURN ARRAY(SELECT generate_series(0, 24))::SMALLINT[];
  END IF;
  FOR i IN 1..12 LOOP
    v_ok := TRUE;
    FOR j IN 1..5 LOOP
      v_n := p_numeros[v_linhas[i][j] + 1];
      IF v_n <> 0 AND NOT (v_n = ANY (COALESCE(p_marcadas, '{}'))) THEN v_ok := FALSE; EXIT; END IF;
    END LOOP;
    -- A fatia de um array 2D continua 2D: desmonta para devolver a linha simples.
    IF v_ok THEN RETURN ARRAY(SELECT unnest(v_linhas[i:i][1:5]))::SMALLINT[]; END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

/** Quem pode controlar a partida: quem alcança o painel no Modo TV. */
CREATE OR REPLACE FUNCTION public.fn_bingo_controla(p_partida UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT COALESCE((
    SELECT public.fn_tv_alvo_no_meu_alcance(tp.setor_id, tp.equipe_id)
      FROM public.bingo_partidas bp
      JOIN public.tv_paineis tp ON tp.id = bp.painel_id
     WHERE bp.id = p_partida
  ), FALSE);
$function$;

/** As pessoas que podem jogar numa partida deste painel: as do alvo dele, ativas. */
CREATE OR REPLACE FUNCTION public.fn_bingo_pessoas_do_painel(p_painel UUID)
RETURNS TABLE (id UUID, nome TEXT, foto TEXT, equipe_id UUID, equipe_nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT p.id, p.nome, p.foto_url, e.id, e.nome
    FROM public.tv_paineis tp
    JOIN public.perfis p ON p.empresa_id = tp.empresa_id
    LEFT JOIN public.equipes e ON e.id = p.equipe_id
   WHERE tp.id = p_painel
     AND p.ativo
     AND NOT COALESCE(p.robo, FALSE)
     AND (CASE WHEN tp.equipe_id IS NULL
               THEN p.setor_id = tp.setor_id OR e.setor_id = tp.setor_id
               ELSE p.equipe_id = tp.equipe_id
                 OR p.id IN (SELECT el.lider_id FROM public.equipe_lideres el WHERE el.equipe_id = tp.equipe_id) END);
$function$;

/** Avisa a partida e a TV. Sem realtime, quem joga relê na volta; a gravação nunca cai. */
CREATE OR REPLACE FUNCTION public.fn_bingo_avisar(p_partida UUID, p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_painel UUID;
BEGIN
  SELECT bp.painel_id INTO v_painel FROM public.bingo_partidas bp WHERE bp.id = p_partida;
  BEGIN
    PERFORM realtime.send(p_payload || jsonb_build_object('partida', p_partida), 'bingo', 'bingo:' || p_partida::TEXT, TRUE);
    IF v_painel IS NOT NULL THEN
      PERFORM realtime.send(p_payload || jsonb_build_object('partida', p_partida), 'bingo', 'tv-painel:' || v_painel::TEXT, FALSE);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

/** O convite: a cartela chegou. Pelo canal pessoal que todo mundo já ouve. */
CREATE OR REPLACE FUNCTION public.fn_bingo_convidar(p_partida UUID, p_pessoas UUID[])
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_p UUID;
BEGIN
  FOREACH v_p IN ARRAY COALESCE(p_pessoas, '{}') LOOP
    BEGIN
      PERFORM realtime.send(jsonb_build_object('tipo', 'convite', 'partida', p_partida), 'bingo', 'chat:' || v_p::TEXT, TRUE);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$function$;

/** Dá cartela a quem ainda não tem, sem repetir cartela dentro da partida. Devolve quem entrou. */
CREATE OR REPLACE FUNCTION public.fn_bingo_dar_cartelas(p_partida UUID, p_pessoas UUID[])
RETURNS UUID[]
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_painel  UUID;
  v_p       UUID;
  v_cartela SMALLINT[];
  v_tenta   INTEGER;
  v_novos   UUID[] := '{}';
BEGIN
  SELECT bp.painel_id INTO v_painel FROM public.bingo_partidas bp WHERE bp.id = p_partida;
  FOR v_p IN
    SELECT DISTINCT x.id
      FROM unnest(COALESCE(p_pessoas, '{}')) AS pedido(id)
      JOIN public.fn_bingo_pessoas_do_painel(v_painel) x ON x.id = pedido.id
     WHERE NOT EXISTS (SELECT 1 FROM public.bingo_cartelas c WHERE c.partida_id = p_partida AND c.perfil_id = x.id)
  LOOP
    v_tenta := 0;
    LOOP
      v_cartela := public.fn_bingo_cartela_nova();
      v_tenta := v_tenta + 1;
      EXIT WHEN v_tenta >= 5
        OR NOT EXISTS (SELECT 1 FROM public.bingo_cartelas c WHERE c.partida_id = p_partida AND c.numeros = v_cartela);
    END LOOP;
    INSERT INTO public.bingo_cartelas (partida_id, perfil_id, numeros) VALUES (p_partida, v_p, v_cartela);
    v_novos := v_novos || v_p;
  END LOOP;
  RETURN v_novos;
END;
$function$;

/**
 * Sorteia a próxima pedra. `p_automatico`: só se o automático estiver ligado,
 * sem pausa, e a hora já tiver chegado — a central do líder e a TV pedem
 * juntas, e o `FOR UPDATE` garante uma pedra só.
 */
CREATE OR REPLACE FUNCTION public.fn_bingo_sortear_interno(p_partida UUID, p_automatico BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_bp      public.bingo_partidas%ROWTYPE;
  v_qtd     INTEGER;
  v_numero  SMALLINT;
  v_proxima TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_bp FROM public.bingo_partidas WHERE id = p_partida FOR UPDATE;
  IF v_bp.id IS NULL OR v_bp.estado <> 'aberta' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'A partida não está aberta.');
  END IF;
  -- «Ainda não» devolve a hora certa: quem pediu cedo recalibra o relógio
  -- sem reler a partida inteira.
  IF p_automatico AND (v_bp.auto_intervalo_s IS NULL OR v_bp.auto_pausado
                       OR v_bp.proxima_pedra_em IS NULL OR v_bp.proxima_pedra_em > now()) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ainda não', 'proxima_pedra_em', v_bp.proxima_pedra_em);
  END IF;

  SELECT COUNT(*) INTO v_qtd FROM public.bingo_pedras WHERE partida_id = p_partida;
  IF v_qtd >= 75 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Já saíram as 75 pedras.');
  END IF;

  SELECT n INTO v_numero
    FROM (SELECT n::SMALLINT AS n, ROW_NUMBER() OVER (ORDER BY n) - 1 AS i
            FROM generate_series(1, 75) n
           WHERE n NOT IN (SELECT numero FROM public.bingo_pedras WHERE partida_id = p_partida)) livres
   WHERE i = public.fn_bingo_sorteio(75 - v_qtd);

  INSERT INTO public.bingo_pedras (partida_id, ordem, numero) VALUES (p_partida, v_qtd + 1, v_numero);
  UPDATE public.bingo_partidas
     SET proxima_pedra_em = CASE WHEN auto_intervalo_s IS NULL OR auto_pausado OR v_qtd + 1 >= 75 THEN NULL
                                 ELSE now() + make_interval(secs => auto_intervalo_s) END
   WHERE id = p_partida
  RETURNING proxima_pedra_em INTO v_proxima;

  PERFORM public.fn_bingo_avisar(p_partida, jsonb_build_object('tipo', 'pedra', 'ordem', v_qtd + 1, 'numero', v_numero));
  RETURN jsonb_build_object('ok', true, 'ordem', v_qtd + 1, 'numero', v_numero, 'proxima_pedra_em', v_proxima);
END;
$function$;

/** Partida esquecida aberta há mais de 12 h encerra sozinha. */
CREATE OR REPLACE FUNCTION public.fn_bingo_vencer_antigas(p_painel UUID)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  UPDATE public.bingo_partidas
     SET estado = 'encerrada', encerrada_em = now()
   WHERE estado = 'aberta' AND criada_em < now() - INTERVAL '12 hours'
     AND (p_painel IS NULL OR painel_id = p_painel);
$function$;

/** O que todos veem da partida: pedras, gritos e a última vitória com as cartelas-prova. */
CREATE OR REPLACE FUNCTION public.fn_bingo_estado(p_partida UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'partida', jsonb_build_object(
      'id', bp.id, 'painel_id', bp.painel_id, 'tema', bp.tema, 'estado', bp.estado,
      'auto_marcar_s', bp.auto_marcar_s, 'premio_quina', bp.premio_quina, 'premio_bingo', bp.premio_bingo,
      'som_na_tv', bp.som_na_tv, 'auto_intervalo_s', bp.auto_intervalo_s, 'auto_pausado', bp.auto_pausado,
      'proxima_pedra_em', bp.proxima_pedra_em, 'criada_em', bp.criada_em, 'encerrada_em', bp.encerrada_em,
      'participantes', (SELECT COUNT(*) FROM public.bingo_cartelas c WHERE c.partida_id = bp.id)),
    'pedras', COALESCE((SELECT jsonb_agg(pd.numero ORDER BY pd.ordem) FROM public.bingo_pedras pd WHERE pd.partida_id = bp.id), '[]'::JSONB),
    'gritos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('perfil_id', c.perfil_id, 'nome', p.nome, 'foto', p.foto_url,
                                          'tipo', c.gritou_tipo, 'em', c.gritou_em) ORDER BY c.gritou_em)
        FROM public.bingo_cartelas c JOIN public.perfis p ON p.id = c.perfil_id
       WHERE c.partida_id = bp.id AND c.gritou_em IS NOT NULL), '[]'::JSONB),
    'vitoria', (
      SELECT jsonb_build_object('id', v.id, 'tipo', v.tipo, 'em', v.comemorada_em,
        'ganhadores', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('perfil_id', g.perfil_id, 'nome', p.nome, 'foto', p.foto_url,
                                              'numeros', c.numeros, 'padrao', g.padrao) ORDER BY p.nome)
            FROM public.bingo_vitoria_ganhadores g
            JOIN public.perfis p ON p.id = g.perfil_id
            JOIN public.bingo_cartelas c ON c.partida_id = bp.id AND c.perfil_id = g.perfil_id
           WHERE g.vitoria_id = v.id), '[]'::JSONB))
        FROM public.bingo_vitorias v
       WHERE v.partida_id = bp.id
       ORDER BY v.comemorada_em DESC
       LIMIT 1),
    'agora', clock_timestamp())
    FROM public.bingo_partidas bp
   WHERE bp.id = p_partida;
$function$;

REVOKE ALL ON FUNCTION public.fn_bingo_sorteio(INTEGER), public.fn_bingo_cartela_nova(),
  public.fn_bingo_controla(UUID), public.fn_bingo_pessoas_do_painel(UUID), public.fn_bingo_avisar(UUID, JSONB),
  public.fn_bingo_convidar(UUID, UUID[]), public.fn_bingo_dar_cartelas(UUID, UUID[]),
  public.fn_bingo_sortear_interno(UUID, BOOLEAN), public.fn_bingo_vencer_antigas(UUID), public.fn_bingo_estado(UUID)
  FROM PUBLIC, anon, authenticated;
-- A conta do padrão é pura; o front tem a mesma regra (`bingo/regras.ts`).
REVOKE ALL ON FUNCTION public.fn_bingo_padrao(SMALLINT[], SMALLINT[], TEXT) FROM PUBLIC, anon, authenticated;

-- ── 3. O controle (líder) ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_bingo_candidatos(p_painel UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tp public.tv_paineis%ROWTYPE;
BEGIN
  SELECT * INTO v_tp FROM public.tv_paineis WHERE id = p_painel;
  IF v_tp.id IS NULL OR NOT public.fn_tv_alvo_no_meu_alcance(v_tp.setor_id, v_tp.equipe_id) THEN
    RAISE EXCEPTION 'Sem acesso a este painel.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'foto', x.foto,
                                        'equipe_id', x.equipe_id, 'equipe_nome', x.equipe_nome) ORDER BY x.nome)
      FROM public.fn_bingo_pessoas_do_painel(p_painel) x), '[]'::JSONB);
END;
$function$;

/** A partida aberta do painel (ou nula), já com o estado. */
CREATE OR REPLACE FUNCTION public.fn_bingo_do_painel(p_painel UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tp public.tv_paineis%ROWTYPE;
  v_id UUID;
BEGIN
  SELECT * INTO v_tp FROM public.tv_paineis WHERE id = p_painel;
  IF v_tp.id IS NULL OR NOT public.fn_tv_alvo_no_meu_alcance(v_tp.setor_id, v_tp.equipe_id) THEN
    RAISE EXCEPTION 'Sem acesso a este painel.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.fn_bingo_vencer_antigas(p_painel);
  SELECT bp.id INTO v_id FROM public.bingo_partidas bp WHERE bp.painel_id = p_painel AND bp.estado = 'aberta';
  RETURN CASE WHEN v_id IS NULL THEN NULL ELSE public.fn_bingo_controle(v_id) END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_bingo_criar(
  p_painel UUID, p_tema TEXT, p_participantes UUID[], p_auto_marcar_s INTEGER,
  p_premio_quina TEXT, p_premio_bingo TEXT, p_som_na_tv BOOLEAN)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_tp     public.tv_paineis%ROWTYPE;
  v_id     UUID;
  v_novos  UUID[];
BEGIN
  SELECT * INTO v_tp FROM public.tv_paineis WHERE id = p_painel;
  IF v_tp.id IS NULL OR NOT public.fn_tv_alvo_no_meu_alcance(v_tp.setor_id, v_tp.equipe_id) THEN
    RAISE EXCEPTION 'Sem acesso a este painel.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(array_length(p_participantes, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Escolha quem vai jogar.';
  END IF;
  IF array_length(p_participantes, 1) > 200 THEN
    RAISE EXCEPTION 'Até 200 participantes por partida.';
  END IF;
  PERFORM public.fn_bingo_vencer_antigas(p_painel);
  IF EXISTS (SELECT 1 FROM public.bingo_partidas WHERE painel_id = p_painel AND estado = 'aberta') THEN
    RAISE EXCEPTION 'Já tem uma partida aberta nesta TV. Encerre antes de abrir outra.';
  END IF;

  INSERT INTO public.bingo_partidas (empresa_id, painel_id, criada_por, tema, auto_marcar_s,
                                     premio_quina, premio_bingo, som_na_tv)
  VALUES (v_tp.empresa_id, p_painel, auth.uid(), p_tema, COALESCE(p_auto_marcar_s, 120),
          NULLIF(btrim(p_premio_quina), ''), NULLIF(btrim(p_premio_bingo), ''), COALESCE(p_som_na_tv, TRUE))
  RETURNING id INTO v_id;

  v_novos := public.fn_bingo_dar_cartelas(v_id, p_participantes);
  IF COALESCE(array_length(v_novos, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Nenhuma das pessoas escolhidas é deste painel.';
  END IF;

  PERFORM public.fn_bingo_convidar(v_id, v_novos);
  PERFORM public.fn_bingo_avisar(v_id, jsonb_build_object('tipo', 'partida'));
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_bingo_incluir(p_partida UUID, p_participantes UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_novos UUID[];
BEGIN
  IF NOT public.fn_bingo_controla(p_partida) THEN
    RAISE EXCEPTION 'Sem acesso a esta partida.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bingo_partidas WHERE id = p_partida AND estado = 'aberta') THEN
    RAISE EXCEPTION 'A partida não está aberta.';
  END IF;
  IF (SELECT COUNT(*) FROM public.bingo_cartelas WHERE partida_id = p_partida)
     + COALESCE(array_length(p_participantes, 1), 0) > 200 THEN
    RAISE EXCEPTION 'Até 200 participantes por partida.';
  END IF;
  v_novos := public.fn_bingo_dar_cartelas(p_partida, p_participantes);
  PERFORM public.fn_bingo_convidar(p_partida, v_novos);
  PERFORM public.fn_bingo_avisar(p_partida, jsonb_build_object('tipo', 'partida'));
  RETURN COALESCE(array_length(v_novos, 1), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_bingo_sortear(p_partida UUID, p_automatico BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NOT public.fn_bingo_controla(p_partida) THEN
    RAISE EXCEPTION 'Sem acesso a esta partida.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_bingo_sortear_interno(p_partida, COALESCE(p_automatico, FALSE));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_bingo_automatico(p_partida UUID, p_intervalo_s INTEGER, p_pausado BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NOT public.fn_bingo_controla(p_partida) THEN
    RAISE EXCEPTION 'Sem acesso a esta partida.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.bingo_partidas
     SET auto_intervalo_s = p_intervalo_s,
         auto_pausado     = COALESCE(p_pausado, FALSE),
         proxima_pedra_em = CASE WHEN p_intervalo_s IS NULL OR COALESCE(p_pausado, FALSE) THEN NULL
                                 ELSE now() + make_interval(secs => p_intervalo_s) END
   WHERE id = p_partida AND estado = 'aberta';
  PERFORM public.fn_bingo_avisar(p_partida, jsonb_build_object('tipo', 'partida'));
END;
$function$;

/** Tudo o que a central do líder precisa, numa leitura: o resto chega pelo aviso. */
CREATE OR REPLACE FUNCTION public.fn_bingo_controle(p_partida UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NOT public.fn_bingo_controla(p_partida) THEN
    RAISE EXCEPTION 'Sem acesso a esta partida.' USING ERRCODE = '42501';
  END IF;
  RETURN public.fn_bingo_estado(p_partida) || jsonb_build_object(
    'cartelas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('perfil_id', c.perfil_id, 'nome', p.nome, 'foto', p.foto_url,
                                          'equipe_nome', e.nome, 'numeros', c.numeros,
                                          'gritou_em', c.gritou_em, 'gritou_tipo', c.gritou_tipo) ORDER BY p.nome)
        FROM public.bingo_cartelas c
        JOIN public.perfis p ON p.id = c.perfil_id
        LEFT JOIN public.equipes e ON e.id = p.equipe_id
       WHERE c.partida_id = p_partida), '[]'::JSONB),
    'vitorias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', v.id, 'tipo', v.tipo, 'em', v.comemorada_em,
               'ganhadores', (SELECT jsonb_agg(g.perfil_id) FROM public.bingo_vitoria_ganhadores g WHERE g.vitoria_id = v.id))
             ORDER BY v.comemorada_em)
        FROM public.bingo_vitorias v WHERE v.partida_id = p_partida), '[]'::JSONB));
END;
$function$;

/** Comemora quem COMPLETOU pelas pedras sorteadas — a prova nunca mente. */
CREATE OR REPLACE FUNCTION public.fn_bingo_comemorar(p_partida UUID, p_tipo TEXT, p_ganhadores UUID[])
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_pedras  SMALLINT[];
  v_vitoria UUID;
  v_g       RECORD;
  v_padrao  SMALLINT[];
  v_qtd     INTEGER := 0;
BEGIN
  IF NOT public.fn_bingo_controla(p_partida) THEN
    RAISE EXCEPTION 'Sem acesso a esta partida.' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('quina', 'cheia') THEN
    RAISE EXCEPTION 'Tipo de vitória inválido.';
  END IF;
  IF COALESCE(array_length(p_ganhadores, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Escolha quem ganhou.';
  END IF;
  SELECT array_agg(numero) INTO v_pedras FROM public.bingo_pedras WHERE partida_id = p_partida;

  INSERT INTO public.bingo_vitorias (partida_id, tipo, por) VALUES (p_partida, p_tipo, auth.uid())
  RETURNING id INTO v_vitoria;

  FOR v_g IN
    SELECT c.perfil_id, c.numeros FROM public.bingo_cartelas c
     WHERE c.partida_id = p_partida AND c.perfil_id = ANY (p_ganhadores)
  LOOP
    v_padrao := public.fn_bingo_padrao(v_g.numeros, v_pedras, p_tipo);
    IF v_padrao IS NULL THEN
      RAISE EXCEPTION 'Alguém da lista ainda não completou a %.', CASE WHEN p_tipo = 'cheia' THEN 'cartela' ELSE 'quina' END;
    END IF;
    INSERT INTO public.bingo_vitoria_ganhadores (vitoria_id, perfil_id, padrao) VALUES (v_vitoria, v_g.perfil_id, v_padrao);
    v_qtd := v_qtd + 1;
  END LOOP;
  IF v_qtd = 0 THEN
    RAISE EXCEPTION 'Ninguém da lista está nesta partida.';
  END IF;

  PERFORM public.fn_bingo_avisar(p_partida, jsonb_build_object('tipo', 'vitoria'));
  RETURN v_vitoria;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_bingo_encerrar(p_partida UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NOT public.fn_bingo_controla(p_partida) THEN
    RAISE EXCEPTION 'Sem acesso a esta partida.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.bingo_partidas SET estado = 'encerrada', encerrada_em = now(), proxima_pedra_em = NULL
   WHERE id = p_partida AND estado = 'aberta';
  PERFORM public.fn_bingo_avisar(p_partida, jsonb_build_object('tipo', 'partida'));
END;
$function$;

-- ── 4. O jogador ─────────────────────────────────────────────────────────────

/** As partidas abertas em que eu jogo, com a minha cartela. Uma leitura ao abrir o sistema. */
CREATE OR REPLACE FUNCTION public.fn_bingo_minhas()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN '[]'::JSONB; END IF;
  -- Só as do jogador: a varredura das 12 h fica restrita às partidas dele.
  UPDATE public.bingo_partidas bp
     SET estado = 'encerrada', encerrada_em = now()
   WHERE bp.estado = 'aberta' AND bp.criada_em < now() - INTERVAL '12 hours'
     AND EXISTS (SELECT 1 FROM public.bingo_cartelas c WHERE c.partida_id = bp.id AND c.perfil_id = auth.uid());
  RETURN COALESCE((
    SELECT jsonb_agg(public.fn_bingo_estado(c.partida_id)
                     || jsonb_build_object('numeros', c.numeros, 'gritou_tipo', c.gritou_tipo)
                     ORDER BY c.criada_em)
      FROM public.bingo_cartelas c
      JOIN public.bingo_partidas bp ON bp.id = c.partida_id
     WHERE c.perfil_id = auth.uid() AND bp.estado = 'aberta'), '[]'::JSONB);
END;
$function$;

/** Uma partida minha (aberta ou recém-encerrada), para reler depois de um aviso. */
CREATE OR REPLACE FUNCTION public.fn_bingo_minha(p_partida UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT public.fn_bingo_estado(c.partida_id) || jsonb_build_object('numeros', c.numeros, 'gritou_tipo', c.gritou_tipo)
    FROM public.bingo_cartelas c
   WHERE c.partida_id = p_partida AND c.perfil_id = auth.uid();
$function$;

/** O grito: confere as marcações do jogador contra a cartela e as pedras. */
CREATE OR REPLACE FUNCTION public.fn_bingo_gritar(p_partida UUID, p_marcadas SMALLINT[])
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_c      public.bingo_cartelas%ROWTYPE;
  v_pedras SMALLINT[];
  v_validas SMALLINT[];
  v_tipo   TEXT;
BEGIN
  SELECT c.* INTO v_c
    FROM public.bingo_cartelas c
    JOIN public.bingo_partidas bp ON bp.id = c.partida_id AND bp.estado = 'aberta'
   WHERE c.partida_id = p_partida AND c.perfil_id = auth.uid()
     FOR UPDATE OF c;
  IF v_c.perfil_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Você não está nesta partida.');
  END IF;
  SELECT array_agg(numero) INTO v_pedras FROM public.bingo_pedras WHERE partida_id = p_partida;
  -- Só vale o que é da cartela E já saiu.
  SELECT array_agg(m) INTO v_validas
    FROM unnest(COALESCE(p_marcadas, '{}')) m
   WHERE m = ANY (v_c.numeros) AND m = ANY (COALESCE(v_pedras, '{}'));

  v_tipo := CASE
    WHEN public.fn_bingo_padrao(v_c.numeros, v_validas, 'cheia') IS NOT NULL THEN 'cheia'
    WHEN public.fn_bingo_padrao(v_c.numeros, v_validas, 'quina') IS NOT NULL THEN 'quina'
  END;
  IF v_tipo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'Ainda não fechou: confira a cartela.');
  END IF;
  IF v_c.gritou_tipo = v_tipo THEN
    RETURN jsonb_build_object('ok', true, 'tipo', v_tipo, 'repetido', true);
  END IF;

  UPDATE public.bingo_cartelas SET gritou_em = now(), gritou_tipo = v_tipo
   WHERE partida_id = p_partida AND perfil_id = auth.uid();
  PERFORM public.fn_bingo_avisar(p_partida, jsonb_build_object('tipo', 'grito', 'quem', auth.uid(), 'grito', v_tipo));
  RETURN jsonb_build_object('ok', true, 'tipo', v_tipo);
END;
$function$;

-- ── 5. A TV (sem login, pelo token) ──────────────────────────────────────────

/**
 * A partida aberta do painel desta TV (ou nula). `p_tique`: a TV também
 * sorteia no automático — se o líder fechar a aba, o jogo segue.
 */
CREATE OR REPLACE FUNCTION public.fn_tv_bingo(p_token TEXT, p_tique BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_painel UUID;
  v_id     UUID;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT c.painel_id INTO v_painel FROM public.tv_conexoes c
   WHERE c.segredo_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF v_painel IS NULL THEN RETURN NULL; END IF;

  PERFORM public.fn_bingo_vencer_antigas(v_painel);
  SELECT bp.id INTO v_id FROM public.bingo_partidas bp WHERE bp.painel_id = v_painel AND bp.estado = 'aberta';
  IF v_id IS NULL THEN RETURN NULL; END IF;
  IF p_tique THEN
    PERFORM public.fn_bingo_sortear_interno(v_id, TRUE);
  END IF;
  RETURN public.fn_bingo_estado(v_id);
END;
$function$;

-- ── 6. Grants ────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION
  public.fn_bingo_candidatos(UUID), public.fn_bingo_do_painel(UUID),
  public.fn_bingo_criar(UUID, TEXT, UUID[], INTEGER, TEXT, TEXT, BOOLEAN),
  public.fn_bingo_incluir(UUID, UUID[]), public.fn_bingo_sortear(UUID, BOOLEAN),
  public.fn_bingo_automatico(UUID, INTEGER, BOOLEAN), public.fn_bingo_controle(UUID),
  public.fn_bingo_comemorar(UUID, TEXT, UUID[]), public.fn_bingo_encerrar(UUID),
  public.fn_bingo_minhas(), public.fn_bingo_minha(UUID), public.fn_bingo_gritar(UUID, SMALLINT[]),
  public.fn_tv_bingo(TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.fn_bingo_candidatos(UUID), public.fn_bingo_do_painel(UUID),
  public.fn_bingo_criar(UUID, TEXT, UUID[], INTEGER, TEXT, TEXT, BOOLEAN),
  public.fn_bingo_incluir(UUID, UUID[]), public.fn_bingo_sortear(UUID, BOOLEAN),
  public.fn_bingo_automatico(UUID, INTEGER, BOOLEAN), public.fn_bingo_controle(UUID),
  public.fn_bingo_comemorar(UUID, TEXT, UUID[]), public.fn_bingo_encerrar(UUID),
  public.fn_bingo_minhas(), public.fn_bingo_minha(UUID), public.fn_bingo_gritar(UUID, SMALLINT[])
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.fn_tv_bingo(TEXT, BOOLEAN) TO anon, authenticated;

-- ── 7. Quem ouve o canal da partida ──────────────────────────────────────────

/** `bingo:<partida>`: quem tem cartela nela, ou quem controla. Conferido uma vez, na entrada. */
CREATE OR REPLACE FUNCTION public.fn_bingo_posso_ouvir(p_topico TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF p_topico IS NULL OR p_topico !~ '^bingo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;
  v_id := substr(p_topico, 7)::UUID;
  RETURN EXISTS (SELECT 1 FROM public.bingo_cartelas c WHERE c.partida_id = v_id AND c.perfil_id = auth.uid())
      OR public.fn_bingo_controla(v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_bingo_posso_ouvir(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bingo_posso_ouvir(TEXT) TO authenticated;

DROP POLICY IF EXISTS bingo_sinal_receber ON realtime.messages;
CREATE POLICY bingo_sinal_receber ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    extension = 'broadcast'
    AND (SELECT realtime.topic()) LIKE 'bingo:%'
    AND (SELECT public.fn_bingo_posso_ouvir((SELECT realtime.topic())))
  );

COMMIT;
