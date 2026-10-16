-- ============================================================================
-- Caça às Bruxas: o LOBBY da chefona e os cliques automáticos que não contam
-- ============================================================================
--
-- ## O pedido (16/10/2026, Cleber)
--
-- 1. A contagem passa para 3 minutos (o app manda `p_espera_s` = 180; a
--    função de soltar já aceita até 600). No lugar do aviso da chefona chega
--    um CONVITE: «Entrar no lobby» ou «Ficar de fora». Só quem entrou vê a
--    bruxa e luta; quem não entrou vê só a faixa do alto, e pode entrar no
--    meio da luta pelo botão dela.
-- 2. Quem entra vê quantos já entraram e quem (os últimos 24).
-- 3. Autoclick e macro não contam: nem para matar a bruxa mais rápido, nem
--    para o ranking. Só os cliques de gente.
--
-- ## O lobby
--
--   chefona_lobby          uma linha por pessoa por chefona (quem entrou).
--   fn_chefona_lobby_entrar(rodada) / fn_chefona_lobby_sair(rodada)
--
-- O estado (`fn_chefona_estado`) passa a levar `lobby_total` e `lobby` (os 24
-- últimos que entraram, com nome e setor). A leitura de entrada
-- (`fn_chefona_atual`) leva também `eu_no_lobby`, que é de cada um e por isso
-- nunca vai no aviso geral.
--
-- O aviso de quem entra segue o freio da chefona: no máximo um a cada 1,5 s
-- (cada aviso vai a TODA aba logada; 200 pessoas entrando no mesmo minuto não
-- viram 200 avisos). Quem entra recebe o estado na resposta, na hora. `versao`
-- sobe a cada entrada, para o app não descartar o estado novo como repetido.
--
-- ## Só quem está no lobby acerta
--
-- `fn_chefona_acertar` confere no PRIMEIRO lote da pessoa (depois a linha dela
-- no ranking já prova que entrou) se ela está no lobby. Fora dele, o lote não
-- tira vida e volta com `fora_do_lobby`. O super_admin, que comanda a luta,
-- acerta sem lobby.
--
-- ## Autoclick: três travas, do banco para o app
--
-- 1. TETO POR TEMPO (no banco, não depende do app): no máximo 9 acertos por
--    segundo desde o lote anterior da pessoa (o primeiro lote: 9). Mirando num
--    alvo que voa, gente faz 4 a 8 por segundo; quem treina, 10 a 12 cliques
--    com metade de acerto. O que passa do teto é descartado.
-- 2. LOTE COM PISTA FORTE (o app mede: ritmo de máquina, rápido demais,
--    clique por script — `autoclick.ts`, máscara `& 7`): o lote inteiro é
--    descartado. O app de quem usa autoclick é o nosso: o programa de
--    autoclick clica no sistema operacional, não mexe no JavaScript.
-- 3. TRÊS LOTES COM PISTA FORTE na mesma chefona: daí em diante nada da
--    pessoa conta nesta chefona.
--
-- O descartado fica anotado (`acertos_descartados`, `dano_descartado`) para o
-- super_admin ver, e a resposta do lote diz quanto foi (`descartados`), para
-- o app avisar a pessoa uma vez. O ranking é só o dano que contou.
--
-- Tudo aqui é novo ou redefine as funções da 20261015230000 com o MESMO
-- contrato (mesmos parâmetros e retorno). Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── As colunas novas ───────────────────────────────────────────────────────
ALTER TABLE public.chefona_rodadas
  ADD COLUMN IF NOT EXISTS lobby_avisado_em TIMESTAMPTZ;

ALTER TABLE public.chefona_golpes
  ADD COLUMN IF NOT EXISTS acertos_descartados INTEGER NOT NULL DEFAULT 0 CHECK (acertos_descartados >= 0),
  ADD COLUMN IF NOT EXISTS dano_descartado     INTEGER NOT NULL DEFAULT 0 CHECK (dano_descartado >= 0);

-- ── O lobby ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chefona_lobby (
  rodada_id BIGINT      NOT NULL REFERENCES public.chefona_rodadas (id) ON DELETE CASCADE,
  usuario   UUID        NOT NULL,
  nome      TEXT        NOT NULL,
  setor     TEXT,
  entrou_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (rodada_id, usuario)
);

COMMENT ON TABLE public.chefona_lobby IS
  'Caça às Bruxas: quem entrou no lobby de cada chefona (só quem entrou vê a bruxa e acerta). Escrita só por fn_chefona_lobby_*. Ver 20261016120000.';

CREATE INDEX IF NOT EXISTS chefona_lobby_chegada
  ON public.chefona_lobby (rodada_id, entrou_em DESC);

-- Sem policy: ninguém lê nem escreve direto (só pelas funções).
ALTER TABLE public.chefona_lobby ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.chefona_lobby TO service_role;

-- ── O estado que o app recebe (agora com o lobby) ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chefona_estado(p_rodada bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (to_jsonb(r) - 'avisado_em' - 'solta_por' - 'lobby_avisado_em')
      || jsonb_build_object(
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

-- ── A leitura de entrada: o estado e se EU estou no lobby ──────────────────
CREATE OR REPLACE FUNCTION public.fn_chefona_atual()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_chefona_estado(r.id)
      || jsonb_build_object('eu_no_lobby', EXISTS (
           SELECT 1 FROM public.chefona_lobby l WHERE l.rodada_id = r.id AND l.usuario = auth.uid()))
    FROM public.chefona_rodadas r
   WHERE auth.uid() IS NOT NULL
   ORDER BY r.id DESC
   LIMIT 1;
$function$;

-- ── Entrar e sair do lobby ─────────────────────────────────────────────────
-- Avisa todo mundo no máximo a cada 1,5 s; quem entrou recebe o estado na resposta.
CREATE OR REPLACE FUNCTION public.fn_chefona_lobby_avisar(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_agora  timestamptz := clock_timestamp();
  v_avisar boolean;
  v_estado jsonb;
BEGIN
  UPDATE public.chefona_rodadas
     SET versao = versao + 1,
         lobby_avisado_em = CASE
           WHEN lobby_avisado_em IS NULL OR lobby_avisado_em <= v_agora - interval '1500 milliseconds'
           THEN v_agora ELSE lobby_avisado_em END
   WHERE id = p_rodada
  RETURNING lobby_avisado_em = v_agora INTO v_avisar;
  v_estado := public.fn_chefona_estado(p_rodada);
  IF coalesce(v_avisar, false) THEN PERFORM public.fn_chefona_enviar(v_estado); END IF;
  RETURN v_estado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_chefona_lobby_entrar(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu    uuid := auth.uid();
  v_r     public.chefona_rodadas%ROWTYPE;
  v_nome  text;
  v_setor text;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_r FROM public.chefona_rodadas WHERE id = p_rodada;
  IF NOT FOUND OR v_r.situacao <> 'ativo' OR v_r.expira_em <= clock_timestamp() THEN
    RAISE EXCEPTION 'SEM_CHEFONA: ela não está na tela' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(nullif(btrim(p.nome), ''), 'Alguém'), nullif(btrim(s.nome), '')
    INTO v_nome, v_setor
    FROM public.perfis p
    LEFT JOIN public.setores s ON s.id = p.setor_id
   WHERE p.id = v_eu;

  INSERT INTO public.chefona_lobby (rodada_id, usuario, nome, setor)
  VALUES (v_r.id, v_eu, coalesce(v_nome, 'Alguém'), v_setor)
  ON CONFLICT (rodada_id, usuario) DO NOTHING;

  -- Já estava (duas abas, ou clique duplo): não avisa ninguém de novo.
  IF NOT FOUND THEN
    RETURN public.fn_chefona_estado(v_r.id) || jsonb_build_object('eu_no_lobby', true);
  END IF;
  RETURN public.fn_chefona_lobby_avisar(v_r.id) || jsonb_build_object('eu_no_lobby', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_chefona_lobby_sair(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu uuid := auth.uid();
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.chefona_lobby WHERE rodada_id = p_rodada AND usuario = v_eu;
  IF NOT FOUND THEN
    RETURN public.fn_chefona_estado(p_rodada) || jsonb_build_object('eu_no_lobby', false);
  END IF;
  RETURN public.fn_chefona_lobby_avisar(p_rodada) || jsonb_build_object('eu_no_lobby', false);
END;
$function$;

-- ── O tiro (um lote): lobby e autoclick ────────────────────────────────────
-- O corpo é o da 20261015230000 (ver «Sob carga» lá), com:
--   - o lobby conferido no primeiro lote da pessoa;
--   - o teto por tempo, o lote com pista forte e o bloqueio por 3 pistas
--     (ver «Autoclick» no topo). Só o que CONTOU tira vida e entra no ranking.
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
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  v_c := least(greatest(coalesce(p_criticos, 0), 0), v_a);
  -- Sem o dano no lote, 3 por acerto (o corpo); com, no máximo 12 por acerto.
  v_d := least(greatest(coalesce(p_dano, v_a * 3), 0), v_a * 12);
  v_forte := (v_suspeita & 7) <> 0;

  -- ── 1. Sem trava ──────────────────────────────────────────────────────────
  SELECT * INTO v_r FROM public.chefona_rodadas WHERE id = p_rodada;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- O prazo passou: ela fugiu. Só o primeiro que marca avisa.
  IF v_r.situacao = 'ativo' AND v_r.expira_em <= v_agora THEN
    UPDATE public.chefona_rodadas SET situacao = 'fugiu', versao = versao + 1
     WHERE id = v_r.id AND situacao = 'ativo';
    IF FOUND THEN PERFORM public.fn_chefona_avisar(v_r.id); END IF;
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu));
  END IF;

  -- Acabou, lote vazio, ou ainda na contagem: ninguém acerta o que não chegou.
  IF v_r.situacao <> 'ativo' OR v_a = 0 OR v_d = 0 OR v_agora < v_r.solta_em THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu));
  END IF;

  -- O freio: um lote a cada 600 ms por pessoa.
  SELECT g.ultimo_em INTO v_ultimo
    FROM public.chefona_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  IF v_ultimo IS NOT NULL AND v_ultimo > v_agora - interval '600 milliseconds' THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu), 'freio', true);
  END IF;

  -- O primeiro lote: só quem entrou no lobby (ou o super_admin, que comanda a luta).
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

  -- O freio de novo, agora em fila.
  SELECT g.ultimo_em, g.suspeitas INTO v_ultimo, v_pistas
    FROM public.chefona_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  v_novo := NOT FOUND;
  v_pistas := coalesce(v_pistas, 0);
  IF v_ultimo IS NOT NULL AND v_ultimo > v_agora - interval '600 milliseconds' THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu), 'freio', true);
  END IF;

  -- ── O que conta (autoclick) ───────────────────────────────────────────────
  -- Teto por tempo: 9 acertos por segundo desde o lote anterior (o primeiro: 9).
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

    -- A Absorção do totem paga primeiro; o resto sai da vida.
    v_gasta := least(v_abs, v_conta_d);
    v_abs   := v_abs - v_gasta;
    v_resto := v_conta_d - v_gasta;

    IF v_vida - v_resto > 0 THEN
      v_vida := v_vida - v_resto;
      v_efetivo := v_conta_d;
    ELSIF v_r.protegida THEN
      v_totem   := true;
      v_efetivo := v_gasta + (v_vida - 1);
      v_regen   := least(v_max - 1, greatest(1, round(v_max * 0.15)::integer));
      v_vida    := 1 + v_regen;
      v_abs     := round(v_max * 0.10)::integer;
    ELSE
      v_morreu  := true;
      v_efetivo := v_gasta + v_vida;
      v_vida    := 0;
    END IF;
  END IF;

  -- O golpe final leva o nome: quem já tinha atirado tem ele na linha do ranking.
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

  -- Nada contou: a linha dela não muda (sem escrita na linha disputada).
  IF v_conta_d = 0 THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu), 'descartados', v_a);
  END IF;

  -- Avisa todo mundo: sempre quando ela cai ou o totem estoura; apanhando, no
  -- máximo a cada 2 s.
  v_avisar := v_morreu OR v_totem OR v_r.avisado_em IS NULL
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

-- ── Quem parece autoclick (super_admin): agora com o que foi descartado ────
CREATE OR REPLACE FUNCTION public.fn_chefona_suspeitos(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin vê os suspeitos' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'usuario', g.usuario, 'nome', g.nome, 'dano', g.dano,
             'acertos', g.acertos, 'headshots', g.criticos,
             'cliques', g.cliques, 'lotes', g.lotes, 'lotes_no_teto', g.lotes_no_teto,
             'suspeitas', g.suspeitas, 'motivos', g.motivos,
             'acertos_descartados', g.acertos_descartados, 'dano_descartado', g.dano_descartado,
             'segundos', greatest(1, ceil(extract(epoch FROM g.ultimo_em - g.primeiro_em)))::integer)
           ORDER BY g.suspeitas DESC, g.dano_descartado DESC, g.lotes_no_teto DESC, g.dano DESC)
      FROM public.chefona_golpes g
     WHERE g.rodada_id = p_rodada
  ), '[]'::jsonb);
END;
$function$;

-- ── Quem pode chamar ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_chefona_lobby_avisar(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_lobby_entrar(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_lobby_sair(bigint)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_estado(bigint)       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_atual()              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_suspeitos(bigint)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_chefona_lobby_entrar(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_lobby_sair(bigint)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_atual()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_suspeitos(bigint)    TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.chefona_lobby') IS NULL THEN
    RAISE EXCEPTION 'tabela do lobby não criada';
  END IF;
  IF to_regprocedure('public.fn_chefona_lobby_entrar(bigint)') IS NULL
     OR to_regprocedure('public.fn_chefona_lobby_sair(bigint)') IS NULL THEN
    RAISE EXCEPTION 'funções do lobby não criadas';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_chefona_lobby_entrar(bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_chefona_lobby_entrar(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefona_lobby_avisar(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefona_estado(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'permissões do lobby erradas';
  END IF;
END
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Para desfazer (volta ao comportamento da 20261015230000: sem lobby, todo
-- mundo acerta, autoclick só anotado): reaplicar as funções fn_chefona_estado,
-- fn_chefona_atual, fn_chefona_acertar e fn_chefona_suspeitos daquele arquivo, e
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_chefona_lobby_sair(bigint);
-- DROP FUNCTION IF EXISTS public.fn_chefona_lobby_entrar(bigint);
-- DROP FUNCTION IF EXISTS public.fn_chefona_lobby_avisar(bigint);
-- DROP TABLE IF EXISTS public.chefona_lobby;
-- ALTER TABLE public.chefona_golpes DROP COLUMN IF EXISTS acertos_descartados, DROP COLUMN IF EXISTS dano_descartado;
-- ALTER TABLE public.chefona_rodadas DROP COLUMN IF EXISTS lobby_avisado_em;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
-- ============================================================================
