-- ════════════════════════════════════════════════════════════════════════════
-- Corrida de Cavalos: a Guerra na Corrida (23/10/2026)
--
-- Opcional, por corrida: o super_admin liga (`fn_corrida_guerra_ligar`) antes
-- da largada. Desligada, nada muda. Ligada:
--
--   1. O ataque. Com o líder passando de 58% da prova, quem foi chamado aperta
--      «ATACAR A CORRIDA!». Cada tela junta os cliques e chama
--      `fn_corrida_guerra_atacar` no máximo 1 vez a cada ~2,5 s (aqui: 1,5 s por
--      pessoa). A PRESSÃO é a soma dos cliques de todos; a guerra também anda
--      sozinha (acaba em 75 s sem clique nenhum) e não acaba antes de 30 s. Cada
--      tela derruba os cavalos pela pressão, numa ordem que sai da semente da
--      corrida. O vencedor da gravação é sempre o último: o resultado não muda.
--   2. O filme (21 s, a partir de `sobrou_em`): luto, raiva, transformação.
--   3. O chefe, o Cavalo da Guerra: uma vida para todo mundo, tiros em lote
--      (`fn_corrida_guerra_golpear`, 0,6 s por pessoa), o diretor de ritmo da
--      Bruxa (a luta dura ~90 s com 1 ou 100 pessoas) e o anjo: bem à frente da
--      linha, o banco cura e cada tela mostra ele devorando um anjo.
--
-- Por que cada pessoa tem a SUA linha (`corrida_guerra_golpes`): com 250 pessoas
-- clicando, uma linha só com o contador viraria fila de trava. Cada chamada só
-- escreve a própria linha; no máximo 1 vez por segundo, quem achar a linha da
-- guerra livre (SKIP LOCKED, sem esperar) soma tudo, decide (último cavalo, anjo,
-- queda) e avisa a sala — no máximo 1 aviso a cada 2 s, fora os momentos que
-- importam (sobrou, anjo, caiu), que vão na hora.
--
-- Os números são os de `src/components/Corrida/guerra/regras.ts`; o teste
-- (`guerra.sql.test.ts`, PGlite) roda esta migration e confere.
--
-- O aviso vai no tópico `corrida-sala:<id>`, sinal `guerra`; a policy
-- `corrida_sala_receber` (20261020130000) filtra pelo tópico: nada a mudar nela.
-- Ninguém lê estas tabelas direto (RLS sem policy): só pelas funções.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS public.corrida_guerra (
  corrida_id   bigint      PRIMARY KEY REFERENCES public.corridas(id) ON DELETE CASCADE,
  ligada_em    timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- o ataque
  cavalos      smallint,
  alvo         integer,
  comecou_em   timestamptz,
  pressao      integer     NOT NULL DEFAULT 0,
  sobrou_em    timestamptz,
  -- o chefe
  solta_em     timestamptz,
  expira_em    timestamptz,
  pessoas      integer     NOT NULL DEFAULT 0,
  vida_max     numeric,
  vida         numeric,
  cura_total   numeric     NOT NULL DEFAULT 0,
  curas        integer     NOT NULL DEFAULT 0,
  cura_em      timestamptz,
  cura_vida    numeric,
  ritmo        numeric     NOT NULL DEFAULT 1,
  caiu_em      timestamptz,
  -- a conta e o aviso
  versao       integer     NOT NULL DEFAULT 0,
  calculado_em timestamptz NOT NULL DEFAULT '-infinity',
  avisado_em   timestamptz NOT NULL DEFAULT '-infinity'
);
ALTER TABLE public.corrida_guerra ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.corrida_guerra_golpes (
  corrida_id  bigint      NOT NULL REFERENCES public.corridas(id) ON DELETE CASCADE,
  usuario     uuid        NOT NULL,
  cliques     integer     NOT NULL DEFAULT 0,
  atacou_em   timestamptz,
  -- o dano bruto (o ranking) e o que de fato tirou da vida (depois do ritmo)
  dano        numeric     NOT NULL DEFAULT 0,
  efetivo     numeric     NOT NULL DEFAULT 0,
  golpeou_em  timestamptz,
  PRIMARY KEY (corrida_id, usuario)
);
ALTER TABLE public.corrida_guerra_golpes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.corrida_guerra, public.corrida_guerra_golpes TO service_role;

COMMENT ON TABLE public.corrida_guerra IS
  'Corrida de Cavalos: a Guerra na Corrida de uma corrida (pressão do ataque, o filme e a vida do Cavalo da Guerra). Só via fn_corrida_guerra_*. Ver 20261023150000.';
COMMENT ON TABLE public.corrida_guerra_golpes IS
  'Corrida de Cavalos: os cliques e os tiros de cada pessoa na guerra (uma linha por pessoa: sem fila de trava). Só via fn_corrida_guerra_*. Ver 20261023150000.';

-- ── As contas (as mesmas de regras.ts) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_ritmo(p_t numeric, p_fracao numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_t IS NULL OR p_t < 0 THEN 1::numeric ELSE
    LEAST(5 + GREATEST(0, p_t - 90) * 1,
          GREATEST(0.25, exp(LEAST(50, 7 * (p_fracao - LEAST(1, GREATEST(0, 1 - p_t / 90)))))))
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_cura(p_t numeric, p_fracao numeric, p_desde numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_t < 0 OR p_t >= 110 OR p_desde < 10 THEN 0::numeric
    WHEN LEAST(1, GREATEST(0, 1 - p_t / 90)) - p_fracao < 0.15 THEN 0::numeric
    ELSE LEAST(0.25, LEAST(1, GREATEST(0, 1 - p_t / 90)) - p_fracao - 0.05)
  END;
$function$;

-- O estado que vai para as telas (com o ranking dos 8 que mais acertaram).
CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_json(p_corrida bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'corrida_id', g.corrida_id, 'ligada', true, 'versao', g.versao, 'agora', clock_timestamp(),
    'cavalos', g.cavalos, 'alvo', g.alvo, 'comecou_em', g.comecou_em, 'pressao', g.pressao, 'sobrou_em', g.sobrou_em,
    'solta_em', g.solta_em, 'expira_em', g.expira_em, 'pessoas', g.pessoas,
    'vida_max', g.vida_max, 'vida', g.vida, 'curas', g.curas, 'cura_em', g.cura_em, 'cura_vida', g.cura_vida,
    'ritmo', g.ritmo, 'caiu_em', g.caiu_em,
    'atacando', (SELECT count(*) FROM public.corrida_guerra_golpes x
                  WHERE x.corrida_id = g.corrida_id AND x.atacou_em > clock_timestamp() - interval '5 seconds'),
    'ranking', COALESCE((SELECT jsonb_agg(jsonb_build_object('usuario', r.usuario, 'nome', r.nome, 'foto', r.foto, 'dano', r.dano) ORDER BY r.dano DESC)
                           FROM (SELECT x.usuario, COALESCE(p.nome, 'Alguém') AS nome, p.foto, round(x.dano)::int AS dano
                                   FROM public.corrida_guerra_golpes x
                                   LEFT JOIN public.corrida_pessoas p ON p.corrida_id = x.corrida_id AND p.usuario = x.usuario
                                  WHERE x.corrida_id = g.corrida_id AND x.dano > 0
                                  ORDER BY x.dano DESC LIMIT 8) r), '[]'::jsonb))
    FROM public.corrida_guerra g WHERE g.corrida_id = p_corrida;
$function$;

-- A conta de todos: no máximo 1 vez por segundo, por quem achar a linha livre.
-- Devolve se mudou algo. `p_forcar`: faz a conta mesmo antes de 1 s (o ligar e o teste).
CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_recalcular(p_corrida bigint, p_forcar boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_agora   timestamptz := clock_timestamp();
  v_g       public.corrida_guerra%ROWTYPE;
  v_s       numeric;
  v_ef      numeric;
  v_soma    numeric;
  v_vida    numeric;
  v_t       numeric;
  v_fracao  numeric;
  v_cura    numeric;
  v_mudou   boolean := false;
  v_importa boolean := false;
BEGIN
  SELECT * INTO v_g FROM public.corrida_guerra WHERE corrida_id = p_corrida FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT p_forcar AND v_g.calculado_em > v_agora - interval '1 second' THEN RETURN false; END IF;

  -- O ataque: a pressão de todos; o último cavalo, e a vida do chefe pela gente que atacou.
  IF v_g.comecou_em IS NOT NULL AND v_g.sobrou_em IS NULL AND v_g.alvo > 0 THEN
    SELECT COALESCE(sum(cliques), 0) INTO v_g.pressao FROM public.corrida_guerra_golpes WHERE corrida_id = p_corrida;
    v_s  := extract(epoch FROM v_agora - v_g.comecou_em);
    v_ef := LEAST(v_g.alvo, v_g.pressao + v_g.alvo * v_s / 75, v_g.alvo * v_s / 30);
    IF v_ef >= v_g.alvo THEN
      SELECT LEAST(60, GREATEST(1, count(*))) INTO v_g.pessoas FROM public.corrida_guerra_golpes WHERE corrida_id = p_corrida AND cliques > 0;
      v_g.sobrou_em := v_agora;
      v_g.solta_em  := v_agora + interval '21 seconds';
      v_g.expira_em := v_g.solta_em + interval '150 seconds';
      v_g.vida_max  := 400 + 120 * v_g.pessoas;
      v_g.vida      := v_g.vida_max;
      v_importa := true;
    END IF;
    v_mudou := true;
  END IF;

  -- O chefe: a vida é a máxima, mais as curas, menos o que todos tiraram.
  IF v_g.solta_em IS NOT NULL AND v_g.caiu_em IS NULL AND v_agora >= v_g.solta_em THEN
    SELECT COALESCE(sum(efetivo), 0) INTO v_soma FROM public.corrida_guerra_golpes WHERE corrida_id = p_corrida;
    v_t := extract(epoch FROM v_agora - v_g.solta_em);
    v_vida := v_g.vida_max + v_g.cura_total - v_soma;
    -- antes de 50 s ela não desce do piso (5%): a diferença entra calada nas curas
    IF v_t < 50 AND v_vida < 0.05 * v_g.vida_max THEN
      v_g.cura_total := v_g.cura_total + (0.05 * v_g.vida_max - v_vida);
      v_vida := 0.05 * v_g.vida_max;
    END IF;
    v_fracao := GREATEST(0, v_vida) / v_g.vida_max;
    -- o anjo
    v_cura := public.fn_corrida_guerra_cura(v_t, v_fracao, extract(epoch FROM v_agora - COALESCE(v_g.cura_em, v_g.solta_em)));
    IF v_cura > 0 AND v_vida > 0 THEN
      v_g.cura_total := v_g.cura_total + v_cura * v_g.vida_max;
      v_g.curas      := v_g.curas + 1;
      v_g.cura_em    := v_agora;
      v_g.cura_vida  := round(v_cura * v_g.vida_max);
      v_vida   := v_vida + v_cura * v_g.vida_max;
      v_fracao := v_vida / v_g.vida_max;
      v_importa := true;
    END IF;
    IF v_vida <= 0 THEN
      v_vida := 0; v_g.caiu_em := v_agora; v_importa := true;
    END IF;
    IF v_g.vida IS DISTINCT FROM round(v_vida, 1) THEN v_mudou := true; END IF;
    v_g.vida  := round(v_vida, 1);
    v_g.ritmo := round(public.fn_corrida_guerra_ritmo(v_t, v_fracao), 3);
  END IF;

  IF v_mudou OR v_importa THEN v_g.versao := v_g.versao + 1; END IF;
  UPDATE public.corrida_guerra
     SET pressao = v_g.pressao, sobrou_em = v_g.sobrou_em, solta_em = v_g.solta_em, expira_em = v_g.expira_em,
         pessoas = v_g.pessoas, vida_max = v_g.vida_max, vida = v_g.vida, cura_total = v_g.cura_total,
         curas = v_g.curas, cura_em = v_g.cura_em, cura_vida = v_g.cura_vida, ritmo = v_g.ritmo,
         caiu_em = v_g.caiu_em, versao = v_g.versao, calculado_em = v_agora,
         avisado_em = CASE WHEN v_importa OR ((v_mudou OR p_forcar) AND v_g.avisado_em <= v_agora - interval '2 seconds') THEN v_agora ELSE v_g.avisado_em END
   WHERE corrida_id = p_corrida;
  IF v_importa OR ((v_mudou OR p_forcar) AND v_g.avisado_em <= v_agora - interval '2 seconds') THEN
    PERFORM realtime.send(jsonb_build_object('guerra', public.fn_corrida_guerra_json(p_corrida)), 'guerra', 'corrida-sala:' || p_corrida::text, true);
  END IF;
  RETURN v_mudou OR v_importa;
END;
$function$;

-- ── O super_admin liga e desliga (antes da largada) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_ligar(p_corrida bigint, p_ligar boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_c public.corridas%ROWTYPE;
BEGIN
  PERFORM public.fn_corrida_exigir_admin();
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CORRIDA_NAO_ENCONTRADA' USING ERRCODE = 'P0002'; END IF;
  IF v_c.categoria <> 'cavalos' THEN RAISE EXCEPTION 'SO_CAVALOS: a guerra é da corrida de cavalos' USING ERRCODE = '22023'; END IF;
  IF v_c.estado NOT IN ('preparando', 'aberta') OR v_c.inicia_em IS NOT NULL THEN
    RAISE EXCEPTION 'JA_LARGOU: a guerra liga e desliga antes da largada' USING ERRCODE = '22023';
  END IF;
  IF p_ligar THEN
    INSERT INTO public.corrida_guerra (corrida_id) VALUES (p_corrida) ON CONFLICT (corrida_id) DO NOTHING;
  ELSE
    DELETE FROM public.corrida_guerra WHERE corrida_id = p_corrida;
    DELETE FROM public.corrida_guerra_golpes WHERE corrida_id = p_corrida;
  END IF;
  PERFORM realtime.send(jsonb_build_object('guerra', COALESCE(public.fn_corrida_guerra_json(p_corrida), jsonb_build_object('corrida_id', p_corrida, 'ligada', false))),
                        'guerra', 'corrida-sala:' || p_corrida::text, true);
  RETURN COALESCE(public.fn_corrida_guerra_json(p_corrida), jsonb_build_object('corrida_id', p_corrida, 'ligada', false));
END;
$function$;

-- ── Quem foi chamado lê o estado ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_estado(p_corrida bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_corrida_posso_ver(p_corrida) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não foi chamado para esta corrida' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(public.fn_corrida_guerra_json(p_corrida), jsonb_build_object('corrida_id', p_corrida, 'ligada', false));
END;
$function$;

-- ── O ataque: os cliques juntados da tela ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_atacar(p_corrida bigint, p_cliques integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu    uuid := auth.uid();
  v_agora timestamptz := clock_timestamp();
  v_c     public.corridas%ROWTYPE;
  v_g     public.corrida_guerra%ROWTYPE;
  v_ult   timestamptz;
  v_n     integer := LEAST(GREATEST(COALESCE(p_cliques, 0), 0), 40);
  v_cav   integer;
  v_pres  integer;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_c FROM public.corridas WHERE id = p_corrida;
  IF NOT FOUND OR v_c.estado <> 'correndo' OR v_c.inicia_em IS NULL OR v_agora < v_c.inicia_em THEN
    RETURN jsonb_build_object('agora', v_agora, 'fora', true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND usuario = v_eu) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não foi chamado para esta corrida' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_g FROM public.corrida_guerra WHERE corrida_id = p_corrida;
  IF NOT FOUND THEN RETURN jsonb_build_object('corrida_id', p_corrida, 'ligada', false); END IF;

  -- A primeira chamada começa a guerra: o alvo fica fixo (gente chegando não «ressuscita» cavalo).
  IF v_g.comecou_em IS NULL THEN
    v_cav  := GREATEST(2, COALESCE(jsonb_array_length(v_c.gravacao -> 'faixa'), 2));
    SELECT LEAST(40, GREATEST(1, count(*))) INTO v_pres FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND entrou_em IS NOT NULL;
    UPDATE public.corrida_guerra
       SET comecou_em = v_agora, cavalos = v_cav, alvo = (v_cav - 1) * (14 + 7 * v_pres), versao = versao + 1
     WHERE corrida_id = p_corrida AND comecou_em IS NULL;
    PERFORM public.fn_corrida_guerra_recalcular(p_corrida, true);
  END IF;
  IF v_g.sobrou_em IS NOT NULL THEN RETURN public.fn_corrida_guerra_json(p_corrida); END IF;

  -- No máximo 1 por 1,5 s por pessoa: o que vier antes é jogado fora (a tela já junta).
  SELECT atacou_em INTO v_ult FROM public.corrida_guerra_golpes WHERE corrida_id = p_corrida AND usuario = v_eu;
  IF v_ult IS NULL OR v_ult <= v_agora - interval '1.5 seconds' THEN
    INSERT INTO public.corrida_guerra_golpes AS x (corrida_id, usuario, cliques, atacou_em)
    VALUES (p_corrida, v_eu, v_n, v_agora)
    ON CONFLICT (corrida_id, usuario) DO UPDATE SET cliques = x.cliques + EXCLUDED.cliques, atacou_em = EXCLUDED.atacou_em;
  END IF;
  PERFORM public.fn_corrida_guerra_recalcular(p_corrida, false);
  RETURN public.fn_corrida_guerra_json(p_corrida);
END;
$function$;

-- ── O chefe: os tiros juntados da tela (o dano bruto; o ritmo é aplicado aqui) ──
CREATE OR REPLACE FUNCTION public.fn_corrida_guerra_golpear(p_corrida bigint, p_dano numeric, p_acertos integer, p_bolas integer DEFAULT 0, p_banidos integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu      uuid := auth.uid();
  v_agora   timestamptz := clock_timestamp();
  v_g       public.corrida_guerra%ROWTYPE;
  v_ult     timestamptz;
  v_acertos integer := LEAST(GREATEST(COALESCE(p_acertos, 0), 0), 14);
  v_bruto   numeric;
  v_mult    numeric;
BEGIN
  IF v_eu IS NULL THEN RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.corrida_pessoas WHERE corrida_id = p_corrida AND usuario = v_eu) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: você não foi chamado para esta corrida' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_g FROM public.corrida_guerra WHERE corrida_id = p_corrida;
  IF NOT FOUND THEN RETURN jsonb_build_object('corrida_id', p_corrida, 'ligada', false); END IF;
  IF v_g.solta_em IS NULL OR v_agora < v_g.solta_em OR v_agora > v_g.expira_em + interval '3 seconds' OR v_g.caiu_em IS NOT NULL THEN
    RETURN public.fn_corrida_guerra_json(p_corrida) || jsonb_build_object('fora', true);
  END IF;

  SELECT golpeou_em INTO v_ult FROM public.corrida_guerra_golpes WHERE corrida_id = p_corrida AND usuario = v_eu;
  IF v_ult IS NOT NULL AND v_ult > v_agora - interval '0.6 seconds' THEN
    -- cedo demais: a tela devolve estes tiros ao próximo lote
    RETURN public.fn_corrida_guerra_json(p_corrida) || jsonb_build_object('freio', true);
  END IF;

  v_bruto := LEAST(GREATEST(COALESCE(p_dano, 0), 0), v_acertos * 20)
           + LEAST(GREATEST(COALESCE(p_bolas, 0), 0), 3) * 0.035 * v_g.vida_max
           + LEAST(GREATEST(COALESCE(p_banidos, 0), 0), 1) * 0.06 * v_g.vida_max;
  v_mult := public.fn_corrida_guerra_ritmo(extract(epoch FROM v_agora - v_g.solta_em), GREATEST(0, COALESCE(v_g.vida, v_g.vida_max)) / v_g.vida_max);
  INSERT INTO public.corrida_guerra_golpes AS x (corrida_id, usuario, dano, efetivo, golpeou_em)
  VALUES (p_corrida, v_eu, v_bruto, v_bruto * v_mult, v_agora)
  ON CONFLICT (corrida_id, usuario) DO UPDATE
     SET dano = x.dano + EXCLUDED.dano, efetivo = x.efetivo + EXCLUDED.efetivo, golpeou_em = EXCLUDED.golpeou_em;
  PERFORM public.fn_corrida_guerra_recalcular(p_corrida, false);
  RETURN public.fn_corrida_guerra_json(p_corrida);
END;
$function$;

COMMENT ON FUNCTION public.fn_corrida_guerra_ligar(bigint, boolean) IS
  'Guerra na Corrida: o super_admin liga ou desliga a guerra de uma corrida de cavalos antes da largada. Ver 20261023150000.';
COMMENT ON FUNCTION public.fn_corrida_guerra_estado(bigint) IS
  'Guerra na Corrida: o estado (ataque, filme, chefe e ranking) para quem foi chamado. Ver 20261023150000.';
COMMENT ON FUNCTION public.fn_corrida_guerra_atacar(bigint, integer) IS
  'Guerra na Corrida: os cliques juntados de quem foi chamado (até 40, 1 vez a cada 1,5 s por pessoa). Ver 20261023150000.';
COMMENT ON FUNCTION public.fn_corrida_guerra_golpear(bigint, numeric, integer, integer, integer) IS
  'Guerra na Corrida: os tiros juntados no Cavalo da Guerra (1 vez a cada 0,6 s por pessoa); o diretor de ritmo e o anjo são aplicados aqui. Ver 20261023150000.';

REVOKE ALL ON FUNCTION public.fn_corrida_guerra_ritmo(numeric, numeric)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_guerra_cura(numeric, numeric, numeric)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_guerra_json(bigint)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_guerra_recalcular(bigint, boolean)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_corrida_guerra_ligar(bigint, boolean)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_guerra_estado(bigint)                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_guerra_atacar(bigint, integer)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_corrida_guerra_golpear(bigint, numeric, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_corrida_guerra_ritmo(numeric, numeric)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_guerra_cura(numeric, numeric, numeric)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_guerra_ligar(bigint, boolean)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_guerra_estado(bigint)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_guerra_atacar(bigint, integer)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_corrida_guerra_golpear(bigint, numeric, integer, integer, integer) TO authenticated;

COMMIT;

-- ── Para desfazer ──────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_golpear(bigint, numeric, integer, integer, integer);
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_atacar(bigint, integer);
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_estado(bigint);
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_ligar(bigint, boolean);
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_recalcular(bigint, boolean);
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_json(bigint);
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_cura(numeric, numeric, numeric);
-- DROP FUNCTION IF EXISTS public.fn_corrida_guerra_ritmo(numeric, numeric);
-- DROP TABLE IF EXISTS public.corrida_guerra_golpes;
-- DROP TABLE IF EXISTS public.corrida_guerra;
