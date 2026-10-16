-- ============================================================================
-- Caça às Bruxas: o DIRETOR DE RITMO da chefona — a luta dura ~90 s
-- ============================================================================
--
-- ## O pedido (16/10/2026, Cleber)
--
-- «Um sistema que impede a luta de acabar se estiver muito fácil, e não
-- deixa ficar muito tempo… que funcione com 1 ou 100 pessoas.»
--
-- ## Como (a conta é a mesma de `src/.../chefona/ritmo.ts`)
--
-- A luta tem uma LINHA IDEAL: a vida cai reta de cheia, quando ela chega
-- (`solta_em`), a zero aos 90 s. A cada lote, com a linha da bruxa já presa
-- (`FOR UPDATE`, como sempre), o banco olha onde a vida está em relação à
-- linha e multiplica o dano do lote por
--
--     exp(7 × (fração da vida − fração da linha)),   entre 0,25 e 5
--
-- (depois dos 90 s o teto sobe 1 por segundo: o golpe de misericórdia). Além:
--
--   - antes dos 60 s ela não cai: a vida para em 5% da máxima;
--   - a partir dos 115 s qualquer tiro a derruba (o prazo é 120 s);
--   - até os 80 s, se a vida estiver 15% abaixo da linha (time forte demais),
--     ela bebe uma Poção de Cura sozinha (no máximo a cada 8 s) — os campos da
--     cura do super_admin, então a tela mostra ela bebendo igual.
--
-- Não conta pessoas: só a vida e o relógio. Por isso vale com 1 ou com 100.
--
-- O multiplicador é o mesmo para todos no instante; o RANKING passa a somar o
-- dano de cada um ANTES do multiplicador (o que a pessoa fez), e não o que saiu
-- da vida — quem atirou no fim, com o dano valendo mais, não passa à frente de
-- quem atirou no começo só por isso.
--
-- O estado leva `ritmo` (o multiplicador de agora), para a tela mostrar o
-- dano local já do tamanho certo e o sinal de «resistente» / «enfraquecendo».
--
-- Custo: só contas dentro do lote que já existe — nenhuma leitura, nenhuma
-- escrita e nenhum aviso a mais (a cura sozinha avisa, como a do super_admin).
--
-- Redefine `fn_chefona_estado` (a da 20261016170000 + `ritmo`) e
-- `fn_chefona_acertar` (a da 20261016120000 + o ritmo). Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── A conta (pura; sem SET para o planner poder embutir) ────────────────────
CREATE OR REPLACE FUNCTION public.fn_chefona_ritmo(p_t numeric, p_fracao numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_t IS NULL OR p_fracao IS NULL OR p_t < 0 THEN 1::numeric
    ELSE least(
      5 + greatest(0, p_t - 90) * 1,
      greatest(0.25, exp(7 * (p_fracao - least(1, greatest(0, 1 - p_t / 90)))))
    )
  END;
$function$;

-- ── O estado: agora com o ritmo ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chefona_estado(p_rodada bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (to_jsonb(r) - 'avisado_em' - 'solta_por' - 'lobby_avisado_em')
      || jsonb_build_object(
           'agora', clock_timestamp(),
           'ritmo', CASE
             WHEN r.situacao = 'ativo' AND clock_timestamp() >= r.solta_em
             THEN round(public.fn_chefona_ritmo(
                    extract(epoch FROM clock_timestamp() - r.solta_em),
                    r.vida::numeric / greatest(1, r.vida_max)), 3)
             ELSE 1 END,
           'participantes', (SELECT count(*) FROM public.chefona_golpes g WHERE g.rodada_id = r.id),
           'ranking', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'usuario', t.usuario, 'nome', t.nome, 'foto', t.foto,
                      'dano', t.dano, 'acertos', t.acertos, 'criticos', t.criticos)
                    ORDER BY t.dano DESC, t.criticos DESC, t.primeiro_em)
               FROM (SELECT g.* FROM public.chefona_golpes g
                      WHERE g.rodada_id = r.id AND g.dano > 0
                      ORDER BY g.dano DESC, g.criticos DESC, g.primeiro_em
                      LIMIT 10) t
           ), '[]'::jsonb),
           'lobby_total', (SELECT count(*) FROM public.chefona_lobby l WHERE l.rodada_id = r.id),
           'lobby', coalesce((
             SELECT jsonb_agg(jsonb_build_object('usuario', t.usuario, 'nome', t.nome, 'setor', t.setor)
                    ORDER BY t.entrou_em)
               FROM (SELECT l.* FROM public.chefona_lobby l
                      WHERE l.rodada_id = r.id
                      ORDER BY l.entrou_em DESC
                      LIMIT 24) t
           ), '[]'::jsonb))
    FROM public.chefona_rodadas r
   WHERE r.id = p_rodada;
$function$;

-- ── O tiro: o lote da 20261016120000 com o ritmo ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chefona_acertar(
  p_rodada bigint, p_acertos integer, p_criticos integer DEFAULT 0, p_dano integer DEFAULT NULL,
  p_cliques integer DEFAULT 0, p_suspeita integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_agora     timestamptz := clock_timestamp();
  v_eu        uuid := auth.uid();
  v_r         public.chefona_rodadas%ROWTYPE;
  v_a         integer := least(greatest(coalesce(p_acertos, 0), 0), 12);
  v_c         integer;
  v_d         integer;
  v_ultimo    timestamptz;
  v_pistas    integer := 0;
  v_nome      text;
  v_foto      text;
  v_novo      boolean;
  v_extra     integer := 0;
  v_max       integer;
  v_vida      integer;
  v_abs       integer;
  v_gasta     integer;
  v_resto     integer;
  v_efetivo   integer := 0;
  v_morreu    boolean := false;
  v_totem     boolean := false;
  v_regen     integer := 0;
  v_avisar    boolean;
  v_estado    jsonb;
  v_cliques   integer := least(greatest(coalesce(p_cliques, 0), 0), 100);
  v_suspeita  integer := least(greatest(coalesce(p_suspeita, 0), 0), 255);
  v_forte     boolean;
  v_teto      integer;
  v_conta_a   integer;
  v_conta_c   integer;
  v_conta_d   integer;
  -- O ritmo.
  v_t         numeric;
  v_mult      numeric;
  v_tira      integer;
  v_piso      integer;
  v_alvo      numeric;
  v_frente    numeric;
  v_cura      integer := 0;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  v_c := least(greatest(coalesce(p_criticos, 0), 0), v_a);
  v_d := least(greatest(coalesce(p_dano, v_a * 3), 0), v_a * 12);
  v_forte := (v_suspeita & 7) <> 0;

  -- ── 1. Sem trava ──────────────────────────────────────────────────────────
  SELECT * INTO v_r FROM public.chefona_rodadas WHERE id = p_rodada;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_r.situacao = 'ativo' AND v_r.expira_em <= v_agora THEN
    UPDATE public.chefona_rodadas SET situacao = 'fugiu', versao = versao + 1
     WHERE id = v_r.id AND situacao = 'ativo';
    IF FOUND THEN PERFORM public.fn_chefona_avisar(v_r.id); END IF;
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu));
  END IF;

  IF v_r.situacao <> 'ativo' OR v_a = 0 OR v_d = 0 OR v_agora < v_r.solta_em THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu));
  END IF;

  SELECT g.ultimo_em INTO v_ultimo
    FROM public.chefona_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  IF v_ultimo IS NOT NULL AND v_ultimo > v_agora - interval '600 milliseconds' THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu), 'freio', true);
  END IF;

  IF v_ultimo IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chefona_lobby l WHERE l.rodada_id = v_r.id AND l.usuario = v_eu)
       AND NOT public.fn_user_is_super_admin() THEN
      RETURN public.fn_chefona_estado(v_r.id)
          || jsonb_build_object('eu', NULL, 'fora_do_lobby', true);
    END IF;
    SELECT coalesce(nullif(btrim(p.nome), ''), 'Alguém'), nullif(btrim(p.foto_url), '')
      INTO v_nome, v_foto
      FROM public.perfis p WHERE p.id = v_eu;
  END IF;
  v_nome := coalesce(v_nome, 'Alguém');

  -- ── 2. Na fila da linha ───────────────────────────────────────────────────
  SELECT * INTO v_r FROM public.chefona_rodadas WHERE id = p_rodada FOR UPDATE;
  IF v_r.situacao <> 'ativo' OR v_r.expira_em <= v_agora THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu));
  END IF;

  SELECT g.ultimo_em, g.suspeitas INTO v_ultimo, v_pistas
    FROM public.chefona_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  v_novo := NOT FOUND;
  v_pistas := coalesce(v_pistas, 0);
  IF v_ultimo IS NOT NULL AND v_ultimo > v_agora - interval '600 milliseconds' THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu), 'freio', true);
  END IF;

  -- ── O que conta (autoclick, 20261016120000) ──────────────────────────────
  v_teto := CASE WHEN v_ultimo IS NULL THEN 9
                 ELSE least(12, greatest(1, floor(extract(epoch FROM v_agora - v_ultimo) * 9)::integer)) END;
  IF v_forte OR v_pistas + (CASE WHEN v_forte THEN 1 ELSE 0 END) >= 3 THEN
    v_conta_a := 0;
  ELSE
    v_conta_a := least(v_a, v_teto);
  END IF;
  v_conta_c := least(v_c, v_conta_a);
  v_conta_d := CASE WHEN v_conta_a = v_a THEN v_d ELSE round(v_d::numeric * v_conta_a / v_a)::integer END;

  IF v_conta_d > 0 THEN
    -- Caçadora nova: a vida cresce antes do tiro dela (até o teto da coluna).
    IF v_novo THEN v_extra := least(v_r.vida_por_pessoa, 500000 - v_r.vida_max); END IF;
    v_max  := v_r.vida_max + v_extra;
    v_vida := v_r.vida + v_extra;
    v_abs  := v_r.absorcao;

    -- ── O ritmo: quanto este lote tira da vida ─────────────────────────────
    v_t    := extract(epoch FROM v_agora - v_r.solta_em);
    v_mult := public.fn_chefona_ritmo(v_t, v_vida::numeric / greatest(1, v_max));
    v_tira := greatest(1, round(v_conta_d * v_mult))::integer;
    -- Dos 115 s em diante, qualquer tiro a derruba (a Absorção vai junto).
    IF v_t >= 115 THEN v_tira := v_vida + v_abs; END IF;

    -- A Absorção do totem paga primeiro; o resto sai da vida.
    v_gasta := least(v_abs, v_tira);
    v_abs   := v_abs - v_gasta;
    v_resto := v_tira - v_gasta;

    -- Antes dos 60 s ela não cai: a vida para no piso (5% da máxima).
    IF v_t < 60 THEN
      v_piso  := greatest(1, ceil(v_max * 0.05)::integer);
      v_resto := greatest(0, least(v_resto, v_vida - v_piso));
    END IF;

    IF v_vida - v_resto > 0 THEN
      v_vida := v_vida - v_resto;
    ELSIF v_r.protegida THEN
      v_totem   := true;
      v_regen   := least(v_max - 1, greatest(1, round(v_max * 0.15)::integer));
      v_vida    := 1 + v_regen;
      v_abs     := round(v_max * 0.10)::integer;
    ELSE
      v_morreu  := true;
      v_vida    := 0;
    END IF;
    -- O ranking soma o que a pessoa fez (antes do ritmo): justo com quem atirou cedo.
    v_efetivo := v_conta_d;

    -- Time forte demais: ela bebe uma Poção de Cura sozinha (até os 80 s, a cada 8 s).
    IF NOT v_morreu AND NOT v_totem AND v_t < 80
       AND (v_r.cura_em IS NULL OR v_r.cura_em <= v_agora - interval '8 seconds') THEN
      v_alvo   := least(1, greatest(0, 1 - v_t / 90));
      v_frente := v_alvo - v_vida::numeric / greatest(1, v_max);
      IF v_frente >= 0.15 THEN
        v_cura := least(v_max - v_vida, greatest(1, round(v_max * least(0.3, v_frente - 0.05))::integer));
        v_vida := v_vida + v_cura;
      END IF;
    END IF;
  END IF;

  IF v_morreu AND NOT v_novo THEN
    SELECT g.nome, g.foto INTO v_nome, v_foto
      FROM public.chefona_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  END IF;

  INSERT INTO public.chefona_golpes AS g (
    rodada_id, usuario, nome, foto, dano, acertos, criticos, primeiro_em, ultimo_em,
    cliques, lotes, lotes_no_teto, suspeitas, motivos, acertos_descartados, dano_descartado)
  VALUES (
    v_r.id, v_eu, v_nome, v_foto, v_efetivo, v_conta_a, v_conta_c, v_agora, v_agora,
    v_cliques, 1, (v_a >= 12)::integer, v_forte::integer, v_suspeita, v_a - v_conta_a, v_d - v_conta_d)
  ON CONFLICT (rodada_id, usuario) DO UPDATE
     SET dano                = g.dano + EXCLUDED.dano,
         acertos             = g.acertos + EXCLUDED.acertos,
         criticos            = g.criticos + EXCLUDED.criticos,
         ultimo_em           = EXCLUDED.ultimo_em,
         cliques             = g.cliques + EXCLUDED.cliques,
         lotes               = g.lotes + 1,
         lotes_no_teto       = g.lotes_no_teto + EXCLUDED.lotes_no_teto,
         suspeitas           = g.suspeitas + EXCLUDED.suspeitas,
         motivos             = g.motivos | EXCLUDED.motivos,
         acertos_descartados = g.acertos_descartados + EXCLUDED.acertos_descartados,
         dano_descartado     = g.dano_descartado + EXCLUDED.dano_descartado;

  IF v_conta_d = 0 THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu), 'descartados', v_a);
  END IF;

  -- Avisa todo mundo: sempre quando ela cai, o totem estoura ou ela bebe;
  -- apanhando, no máximo a cada 2 s.
  v_avisar := v_morreu OR v_totem OR v_cura > 0 OR v_r.avisado_em IS NULL
           OR v_r.avisado_em <= clock_timestamp() - interval '2 seconds';

  UPDATE public.chefona_rodadas
     SET vida             = v_vida,
         vida_max         = v_max,
         absorcao         = v_abs,
         versao           = versao + 1,
         avisado_em       = CASE WHEN v_avisar THEN clock_timestamp() ELSE avisado_em END,
         protegida        = CASE WHEN v_totem THEN false ELSE protegida END,
         totem_em         = CASE WHEN v_totem THEN v_agora ELSE totem_em END,
         totem_vida       = CASE WHEN v_totem THEN v_regen ELSE totem_vida END,
         totens           = CASE WHEN v_totem THEN totens + 1 ELSE totens END,
         cura_em          = CASE WHEN v_cura > 0 THEN v_agora ELSE cura_em END,
         cura_vida        = CASE WHEN v_cura > 0 THEN v_cura ELSE cura_vida END,
         curas            = CASE WHEN v_cura > 0 THEN curas + 1 ELSE curas END,
         situacao         = CASE WHEN v_morreu THEN 'derrotado' ELSE situacao END,
         derrotado_em     = CASE WHEN v_morreu THEN v_agora ELSE derrotado_em END,
         golpe_final_por  = CASE WHEN v_morreu THEN v_eu ELSE golpe_final_por END,
         golpe_final_nome = CASE WHEN v_morreu THEN v_nome ELSE golpe_final_nome END,
         golpe_final_foto = CASE WHEN v_morreu THEN v_foto ELSE golpe_final_foto END
   WHERE id = v_r.id;

  v_estado := public.fn_chefona_estado(v_r.id);
  IF v_avisar THEN PERFORM public.fn_chefona_enviar(v_estado); END IF;

  RETURN v_estado || jsonb_build_object(
    'eu', public.fn_chefona_placar(v_r.id, v_eu), 'descartados', v_a - v_conta_a);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_chefona_ritmo(numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_estado(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF public.fn_chefona_ritmo(45, 0.5) <> 1 THEN
    RAISE EXCEPTION 'ritmo errado: na linha tem de valer 1 (deu %)', public.fn_chefona_ritmo(45, 0.5);
  END IF;
  IF public.fn_chefona_ritmo(45, 0) <> 0.25 OR public.fn_chefona_ritmo(-1, 1) <> 1 THEN
    RAISE EXCEPTION 'ritmo errado nas pontas';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefona_ritmo(numeric, numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'permissões do ritmo erradas';
  END IF;
END
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Para desfazer: reaplicar `fn_chefona_estado` da 20261016170000 e
-- `fn_chefona_acertar` da 20261016120000, e
--   DROP FUNCTION IF EXISTS public.fn_chefona_ritmo(numeric, numeric);
