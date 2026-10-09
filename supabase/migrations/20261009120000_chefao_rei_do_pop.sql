-- ============================================================================
-- Caça aos Zumbis: o CHEFÃO (o Rei do Pop zumbi) — vida dividida e ranking
-- ============================================================================
--
-- ## O pedido (09/10/2026)
--
-- No modo de soltar zumbi, um chefão: o Rei do Pop zumbi, do clipe de terror
-- clássico. Todo mundo atira nele junto; ele dança, anda pela tela e desvia
-- dos tiros (isso é da tela de cada um, `CacaAbobora/cenaChefao.tsx`). No fim,
-- um ranking de quem ajudou.
--
-- ## O que mora aqui
--
--   chefao_rodadas   uma linha por chefão solto: a vida de todos, o prazo, e
--                    quem deu o golpe final. Só um ativo por vez.
--   chefao_golpes    uma linha por pessoa por chefão: dano, acertos, headshots.
--                    É o ranking.
--
--   fn_chefao_soltar(vida, minutos, espera_s, vida_por_pessoa)
--                                     só o super_admin; vale mesmo com a caça
--                                     desligada. Ele chega depois de uma
--                                     CONTAGEM (`espera_s`, 1 min por padrão):
--                                     `solta_em` é a hora em que ele aparece, e
--                                     o prazo (`expira_em`) conta dali.
--   fn_chefao_acertar(rodada, a, h)   um LOTE de acertos (o app junta os tiros
--                                     de 1 s). Corpo = 1, cabeça = 3. A trava da
--                                     linha decide quem tira a última gota.
--   fn_chefao_atual()                 a leitura de entrada: o último chefão.
--   fn_chefao_curar(rodada, fração)   só o super_admin: o BANQUETE (abaixo).
--   fn_chefao_suspeitos(rodada)       só o super_admin: quem parece autoclick.
--
-- ## O banquete (09/10/2026)
--
-- O super_admin aperta «Recuperar vida»: uma pessoa entra andando, ele a vê,
-- corre, dá o bote e a devora — e recupera uma fração da vida máxima (25% por
-- padrão, no máximo o que falta). Por `CURA_S` (12 s) ele fica IMUNE: o tiro
-- desse intervalo não tira vida. O prazo da luta ganha os mesmos 12 s.
-- `cura_em`/`cura_ate` são do banco, então o banquete acontece junto em
-- todas as telas; `cura_semente` escolhe a vítima e onde ela aparece.
--
-- ## Autoclick (09/10/2026)
--
-- O app mede o ritmo dos cliques de cada um e manda, com o lote, quantos
-- cliques deram e um código de motivos (`autoclick.ts`): 1 ritmo de máquina,
-- 2 rápido demais, 4 clique sintético (script), 8 botão solto sempre igual,
-- 16 mouse parado. 1, 2 e 4 contam como suspeita (`suspeitas`); 8 e 16 só
-- aparecem como pista. O banco soma também, por conta própria, os lotes que
-- chegam no teto de 12 acertos (`lotes_no_teto`): ninguém acerta 12 vezes
-- por segundo um alvo que desvia. Nada disso tira dano de ninguém: é para o
-- super_admin ver (`fn_chefao_suspeitos`) e decidir.
--
-- ## O aviso
--
-- O mesmo tópico da caça (`abobora:<empresa>`, já com policy em
-- 20261005120000), com o sinal `chefao`. No máximo um aviso a cada 2 s
-- enquanto ele apanha — com cem pessoas atirando seriam cem por segundo —, e
-- sempre um quando ele cai ou foge. O aviso leva a linha, o total de
-- participantes e o topo do ranking. `versao` sobe a cada mudança, e o app
-- ignora aviso velho.
--
-- Por que 2 s (revisão de lançamento, 09/10/2026): cada aviso é entregue a
-- TODA aba logada — quem atira, quem não atira e quem escondeu o chefão. Com
-- ~150 abas, um aviso a cada 700 ms eram ~210 mensagens por segundo no
-- Realtime, que é a mesma cota do chat, da presença e dos sinais do app. A
-- 2 s são ~75. Quem atira não perde nada: a resposta do próprio lote (a cada
-- 1 s) já traz a vida de todos.
--
-- ## Sob carga (revisão de lançamento, 09/10/2026)
--
-- Todo tiro passa pela MESMA linha (`FOR UPDATE`), então o que importa é quanto
-- tempo cada chamada segura a trava. `fn_chefao_acertar` faz antes, sem trava,
-- tudo o que dá (o prazo, a contagem, o freio, o nome da pessoa) e devolve
-- dali quem não vai tirar vida; só quem vai tirar entra na fila. A trava tem
-- `lock_timeout` de 2 s: com o banco afogado, o lote falha (o app avisa) em
-- vez de prender conexão que o resto do app usa.
--
-- ## A vida cresce com quem entra (09/10/2026)
--
-- Logado não é jogando (o operador em atendimento está online e não atira).
-- Então a vida começa em `vida_max` e, a cada pessoa que acerta o PRIMEIRO
-- tiro, ganha `vida_por_pessoa` (no máximo e no que sobra). Com 10 pessoas é
-- um chefão; com 100, outro — e a luta dura parecido.
--
-- ## Proteção
--
-- O banco não confia no lote: no máximo 12 acertos por chamada, e uma chamada
-- a cada 600 ms por pessoa (o app manda a cada 1 s). Mais rápido que isso é
-- ignorado em silêncio.
--
-- Nenhuma tabela existente muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── As tabelas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chefao_rodadas (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  solta_em          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expira_em         TIMESTAMPTZ NOT NULL,
  solta_por         UUID,
  vida_max          INTEGER     NOT NULL CHECK (vida_max BETWEEN 10 AND 200000),
  -- Quanto cada caçador novo soma à vida (o primeiro tiro dele).
  vida_por_pessoa   INTEGER     NOT NULL DEFAULT 0 CHECK (vida_por_pessoa BETWEEN 0 AND 5000),
  vida              INTEGER     NOT NULL CHECK (vida >= 0),
  situacao          TEXT        NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo', 'derrotado', 'fugiu')),
  derrotado_em      TIMESTAMPTZ,
  golpe_final_por   UUID,
  golpe_final_nome  TEXT,
  golpe_final_foto  TEXT,
  versao            BIGINT      NOT NULL DEFAULT 1,
  -- Quando o último aviso saiu: o freio dos avisos.
  avisado_em        TIMESTAMPTZ,
  -- O banquete (`fn_chefao_curar`): de quando a quando ele come e fica imune,
  -- quanto recuperou, a semente da vítima, e quantas vezes comeu.
  cura_em           TIMESTAMPTZ,
  cura_ate          TIMESTAMPTZ,
  cura_vida         INTEGER     NOT NULL DEFAULT 0 CHECK (cura_vida >= 0),
  cura_semente      INTEGER     NOT NULL DEFAULT 0,
  curas             INTEGER     NOT NULL DEFAULT 0 CHECK (curas >= 0),
  CONSTRAINT chefao_rodadas_vida_cabe CHECK (vida <= vida_max),
  CONSTRAINT chefao_rodadas_derrotado_completo CHECK (
    (situacao = 'derrotado') = (derrotado_em IS NOT NULL AND golpe_final_por IS NOT NULL)
  )
);

COMMENT ON TABLE public.chefao_rodadas IS
  'Caça aos Zumbis: o chefão (Rei do Pop zumbi). Uma linha por chefão solto. Escrita só pelas funções fn_chefao_*. Ver 20261009120000.';

CREATE UNIQUE INDEX IF NOT EXISTS chefao_rodadas_um_ativo
  ON public.chefao_rodadas ((TRUE)) WHERE situacao = 'ativo';

CREATE TABLE IF NOT EXISTS public.chefao_golpes (
  rodada_id    BIGINT      NOT NULL REFERENCES public.chefao_rodadas (id) ON DELETE CASCADE,
  usuario      UUID        NOT NULL,
  nome         TEXT        NOT NULL,
  foto         TEXT,
  dano         INTEGER     NOT NULL DEFAULT 0 CHECK (dano >= 0),
  acertos      INTEGER     NOT NULL DEFAULT 0 CHECK (acertos >= 0),
  headshots    INTEGER     NOT NULL DEFAULT 0 CHECK (headshots >= 0),
  primeiro_em  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ultimo_em    TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  -- Autoclick (ver o topo): o que o app mediu, e o teto que o banco conta.
  cliques       INTEGER    NOT NULL DEFAULT 0 CHECK (cliques >= 0),
  lotes         INTEGER    NOT NULL DEFAULT 0 CHECK (lotes >= 0),
  lotes_no_teto INTEGER    NOT NULL DEFAULT 0 CHECK (lotes_no_teto >= 0),
  suspeitas     INTEGER    NOT NULL DEFAULT 0 CHECK (suspeitas >= 0),
  motivos       INTEGER    NOT NULL DEFAULT 0 CHECK (motivos >= 0),
  PRIMARY KEY (rodada_id, usuario)
);

COMMENT ON TABLE public.chefao_golpes IS
  'Caça aos Zumbis: quanto cada pessoa tirou do chefão (o ranking). Escrita só por fn_chefao_acertar.';

CREATE INDEX IF NOT EXISTS chefao_golpes_ranking
  ON public.chefao_golpes (rodada_id, dano DESC, headshots DESC);

ALTER TABLE public.chefao_rodadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chefao_golpes  ENABLE ROW LEVEL SECURITY;

-- Como as rodadas da caça: quem está logado lê; ninguém escreve direto.
DROP POLICY IF EXISTS chefao_rodadas_leitura ON public.chefao_rodadas;
CREATE POLICY chefao_rodadas_leitura ON public.chefao_rodadas
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS chefao_golpes_leitura ON public.chefao_golpes;
CREATE POLICY chefao_golpes_leitura ON public.chefao_golpes
  FOR SELECT TO authenticated USING (TRUE);

GRANT SELECT ON public.chefao_rodadas TO authenticated;
GRANT SELECT ON public.chefao_golpes  TO authenticated;
GRANT ALL    ON public.chefao_rodadas TO service_role;
GRANT ALL    ON public.chefao_golpes  TO service_role;

-- ── O estado que o app recebe ───────────────────────────────────────────────
-- A linha (sem os campos internos), quantos ajudaram e os 10 que mais tiraram.
CREATE OR REPLACE FUNCTION public.fn_chefao_estado(p_rodada bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (to_jsonb(r) - 'avisado_em' - 'solta_por')
      || jsonb_build_object(
           'participantes', (SELECT count(*) FROM public.chefao_golpes g WHERE g.rodada_id = r.id),
           'ranking', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'usuario', t.usuario, 'nome', t.nome, 'foto', t.foto,
                      'dano', t.dano, 'acertos', t.acertos, 'headshots', t.headshots)
                    ORDER BY t.dano DESC, t.headshots DESC, t.primeiro_em)
               FROM (SELECT g.* FROM public.chefao_golpes g
                      WHERE g.rodada_id = r.id
                      ORDER BY g.dano DESC, g.headshots DESC, g.primeiro_em
                      LIMIT 10) t
           ), '[]'::jsonb))
    FROM public.chefao_rodadas r
   WHERE r.id = p_rodada;
$function$;

-- O placar de uma pessoa, mesmo fora do topo.
CREATE OR REPLACE FUNCTION public.fn_chefao_placar(p_rodada bigint, p_usuario uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
           'dano', g.dano, 'acertos', g.acertos, 'headshots', g.headshots,
           'posicao', 1 + (SELECT count(*) FROM public.chefao_golpes o
                            WHERE o.rodada_id = g.rodada_id AND o.dano > g.dano))
    FROM public.chefao_golpes g
   WHERE g.rodada_id = p_rodada AND g.usuario = p_usuario;
$function$;

-- O envio a quem está logado, em todas as empresas (como `fn_abobora_avisar`).
-- Só manda: o tiro já tem o estado na mão e marca `avisado_em` no próprio UPDATE.
CREATE OR REPLACE FUNCTION public.fn_chefao_enviar(p_estado jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_empresa uuid;
BEGIN
  IF p_estado IS NULL THEN RETURN; END IF;
  FOR v_empresa IN SELECT e.id FROM public.empresas e LOOP
    PERFORM realtime.send(p_estado, 'chefao', 'abobora:' || v_empresa::text, true);
  END LOOP;
END;
$function$;

-- O aviso das horas raras (soltou, fugiu): lê o estado, manda e marca.
CREATE OR REPLACE FUNCTION public.fn_chefao_avisar(p_rodada bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_estado jsonb := public.fn_chefao_estado(p_rodada);
BEGIN
  IF v_estado IS NULL THEN RETURN; END IF;
  PERFORM public.fn_chefao_enviar(v_estado);
  UPDATE public.chefao_rodadas SET avisado_em = clock_timestamp() WHERE id = p_rodada;
END;
$function$;

-- ── Soltar (super_admin) ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_chefao_soltar(integer, integer);
DROP FUNCTION IF EXISTS public.fn_chefao_soltar(integer, integer, integer);

CREATE OR REPLACE FUNCTION public.fn_chefao_soltar(
  p_vida integer DEFAULT 500, p_minutos integer DEFAULT 5, p_espera_s integer DEFAULT 60,
  p_vida_por_pessoa integer DEFAULT 250
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id      bigint;
  v_vencido bigint;
  v_vida    integer := least(greatest(coalesce(p_vida, 500), 10), 200000);
  v_pessoa  integer := least(greatest(coalesce(p_vida_por_pessoa, 250), 0), 5000);
  v_minutos integer := least(greatest(coalesce(p_minutos, 5), 1), 15);
  v_espera  integer := least(greatest(coalesce(p_espera_s, 60), 0), 600);
  v_chega   timestamptz := clock_timestamp() + make_interval(secs => v_espera);
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin solta o chefão' USING ERRCODE = '42501';
  END IF;

  -- Vencido que ninguém marcou: fugiu.
  UPDATE public.chefao_rodadas SET situacao = 'fugiu', versao = versao + 1
   WHERE situacao = 'ativo' AND expira_em <= clock_timestamp()
  RETURNING id INTO v_vencido;
  IF v_vencido IS NOT NULL THEN PERFORM public.fn_chefao_avisar(v_vencido); END IF;

  IF EXISTS (SELECT 1 FROM public.chefao_rodadas WHERE situacao = 'ativo') THEN
    RAISE EXCEPTION 'JA_TEM_UM: o chefão já está na tela' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.chefao_rodadas (solta_em, expira_em, solta_por, vida_max, vida, vida_por_pessoa)
  VALUES (v_chega, v_chega + make_interval(mins => v_minutos), auth.uid(), v_vida, v_vida, v_pessoa)
  RETURNING id INTO v_id;

  PERFORM public.fn_chefao_avisar(v_id);
  RETURN v_id;
END;
$function$;

-- ── O tiro (um lote) ────────────────────────────────────────────────────────
-- Em duas partes (ver «Sob carga» no topo): primeiro, sem trava, tudo o que não
-- tira vida volta dali; depois, na fila da linha, só o que precisa ser em fila.
DROP FUNCTION IF EXISTS public.fn_chefao_acertar(bigint, integer, integer);

CREATE OR REPLACE FUNCTION public.fn_chefao_acertar(
  p_rodada bigint, p_acertos integer, p_headshots integer DEFAULT 0,
  p_cliques integer DEFAULT 0, p_suspeita integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_agora  timestamptz := clock_timestamp();
  v_eu     uuid := auth.uid();
  v_r      public.chefao_rodadas%ROWTYPE;
  v_a      integer := least(greatest(coalesce(p_acertos, 0), 0), 12);
  v_h      integer;
  v_ultimo timestamptz;
  v_dano   integer;
  v_nome   text;
  v_foto   text;
  v_morreu boolean;
  v_novo   boolean;
  v_extra  integer := 0;
  v_vida   integer;
  v_avisar boolean;
  v_estado jsonb;
  v_cliques  integer := least(greatest(coalesce(p_cliques, 0), 0), 100);
  v_suspeita integer := least(greatest(coalesce(p_suspeita, 0), 0), 255);
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  v_h := least(greatest(coalesce(p_headshots, 0), 0), 12 - v_a);

  -- ── 1. Sem trava ──────────────────────────────────────────────────────────
  SELECT * INTO v_r FROM public.chefao_rodadas WHERE id = p_rodada;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- O prazo passou: ele fugiu. Só o primeiro que marca avisa.
  IF v_r.situacao = 'ativo' AND v_r.expira_em <= v_agora THEN
    UPDATE public.chefao_rodadas SET situacao = 'fugiu', versao = versao + 1
     WHERE id = v_r.id AND situacao = 'ativo';
    IF FOUND THEN PERFORM public.fn_chefao_avisar(v_r.id); END IF;
    RETURN public.fn_chefao_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefao_placar(v_r.id, v_eu));
  END IF;

  -- Acabou, lote vazio, ou ainda na contagem: ninguém acerta o que não chegou.
  IF v_r.situacao <> 'ativo' OR v_a + v_h = 0 OR v_agora < v_r.solta_em THEN
    RETURN public.fn_chefao_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefao_placar(v_r.id, v_eu));
  END IF;

  -- Comendo (o banquete): imune. Estes tiros não entram.
  IF v_r.cura_ate IS NOT NULL AND v_agora < v_r.cura_ate THEN
    RETURN public.fn_chefao_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefao_placar(v_r.id, v_eu), 'curando', true);
  END IF;

  -- O freio: um lote a cada 600 ms por pessoa. `freio` diz ao app que estes
  -- tiros não entraram, e ele os manda de novo no próximo lote.
  SELECT g.ultimo_em INTO v_ultimo
    FROM public.chefao_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  IF v_ultimo IS NOT NULL AND v_ultimo > v_agora - interval '600 milliseconds' THEN
    RETURN public.fn_chefao_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefao_placar(v_r.id, v_eu), 'freio', true);
  END IF;

  -- O nome e a foto só no primeiro tiro: depois a linha do ranking já tem.
  IF v_ultimo IS NULL THEN
    SELECT coalesce(nullif(btrim(p.nome), ''), 'Alguém'), nullif(btrim(p.foto_url), '')
      INTO v_nome, v_foto
      FROM public.perfis p WHERE p.id = v_eu;
  END IF;
  v_nome := coalesce(v_nome, 'Alguém');

  -- ── 2. Na fila da linha ───────────────────────────────────────────────────
  -- A trava que decide: quem chega depois espera aqui e lê a vida já tirada.
  SELECT * INTO v_r FROM public.chefao_rodadas WHERE id = p_rodada FOR UPDATE;
  -- Enquanto esperava, ele caiu, o prazo passou, ou começou a comer.
  IF v_r.situacao <> 'ativo' OR v_r.expira_em <= v_agora THEN
    RETURN public.fn_chefao_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefao_placar(v_r.id, v_eu));
  END IF;
  IF v_r.cura_ate IS NOT NULL AND v_agora < v_r.cura_ate THEN
    RETURN public.fn_chefao_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefao_placar(v_r.id, v_eu), 'curando', true);
  END IF;

  -- O freio de novo, agora em fila: dois lotes da mesma pessoa ao mesmo tempo
  -- passaram juntos pela leitura sem trava; aqui só um passa.
  SELECT g.ultimo_em INTO v_ultimo
    FROM public.chefao_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  v_novo := NOT FOUND;
  IF v_ultimo IS NOT NULL AND v_ultimo > v_agora - interval '600 milliseconds' THEN
    RETURN public.fn_chefao_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefao_placar(v_r.id, v_eu), 'freio', true);
  END IF;

  -- Caçador novo: a vida cresce antes do tiro dele (até o teto da coluna).
  IF v_novo THEN v_extra := least(v_r.vida_por_pessoa, 200000 - v_r.vida_max); END IF;
  v_vida := v_r.vida + v_extra;
  v_dano := least(v_vida, v_a + v_h * 3);
  v_morreu := v_vida - v_dano <= 0;
  -- O golpe final leva o nome: quem já tinha atirado tem ele na linha do ranking.
  IF v_morreu AND NOT v_novo THEN
    SELECT g.nome, g.foto INTO v_nome, v_foto
      FROM public.chefao_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  END IF;
  -- Avisa todo mundo: sempre quando ele cai; apanhando, no máximo a cada 2 s.
  v_avisar := v_morreu OR v_r.avisado_em IS NULL OR v_r.avisado_em <= clock_timestamp() - interval '2 seconds';

  INSERT INTO public.chefao_golpes AS g (
    rodada_id, usuario, nome, foto, dano, acertos, headshots, primeiro_em, ultimo_em,
    cliques, lotes, lotes_no_teto, suspeitas, motivos)
  VALUES (
    v_r.id, v_eu, v_nome, v_foto, v_dano, v_a, v_h, v_agora, v_agora,
    v_cliques, 1, (v_a + v_h >= 12)::integer, ((v_suspeita & 7) <> 0)::integer, v_suspeita)
  ON CONFLICT (rodada_id, usuario) DO UPDATE
     SET dano          = g.dano + EXCLUDED.dano,
         acertos       = g.acertos + EXCLUDED.acertos,
         headshots     = g.headshots + EXCLUDED.headshots,
         ultimo_em     = EXCLUDED.ultimo_em,
         cliques       = g.cliques + EXCLUDED.cliques,
         lotes         = g.lotes + 1,
         lotes_no_teto = g.lotes_no_teto + EXCLUDED.lotes_no_teto,
         suspeitas     = g.suspeitas + EXCLUDED.suspeitas,
         motivos       = g.motivos | EXCLUDED.motivos;

  -- Uma escrita só na linha disputada (o `avisado_em` vai junto).
  UPDATE public.chefao_rodadas
     SET vida             = v_vida - v_dano,
         vida_max         = vida_max + v_extra,
         versao           = versao + 1,
         avisado_em       = CASE WHEN v_avisar THEN clock_timestamp() ELSE avisado_em END,
         situacao         = CASE WHEN v_morreu THEN 'derrotado' ELSE situacao END,
         derrotado_em     = CASE WHEN v_morreu THEN v_agora ELSE derrotado_em END,
         golpe_final_por  = CASE WHEN v_morreu THEN v_eu ELSE golpe_final_por END,
         golpe_final_nome = CASE WHEN v_morreu THEN v_nome ELSE golpe_final_nome END,
         golpe_final_foto = CASE WHEN v_morreu THEN v_foto ELSE golpe_final_foto END
   WHERE id = v_r.id;

  -- O estado sai uma vez: o mesmo vai no aviso e na resposta.
  v_estado := public.fn_chefao_estado(v_r.id);
  IF v_avisar THEN PERFORM public.fn_chefao_enviar(v_estado); END IF;

  RETURN v_estado || jsonb_build_object('eu', public.fn_chefao_placar(v_r.id, v_eu));
END;
$function$;

-- ── O banquete (super_admin) ────────────────────────────────────────────────
-- Ver «O banquete» no topo. 12 s de cura (`CURA_S`, o `CURA_MS` do app).
CREATE OR REPLACE FUNCTION public.fn_chefao_curar(p_rodada bigint, p_fracao numeric DEFAULT 0.25)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '5s'
AS $function$
DECLARE
  v_agora  timestamptz := clock_timestamp();
  v_r      public.chefao_rodadas%ROWTYPE;
  v_fracao numeric := least(greatest(coalesce(p_fracao, 0.25), 0.05), 0.5);
  v_cura   integer;
  v_dura   interval := make_interval(secs => 12);
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin cura o chefão' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_r FROM public.chefao_rodadas WHERE id = p_rodada FOR UPDATE;
  IF NOT FOUND OR v_r.situacao <> 'ativo' OR v_r.expira_em <= v_agora THEN
    RAISE EXCEPTION 'SEM_CHEFAO: ele não está na tela' USING ERRCODE = 'P0001';
  END IF;
  IF v_agora < v_r.solta_em THEN
    RAISE EXCEPTION 'AINDA_CHEGANDO: ele ainda não chegou' USING ERRCODE = 'P0001';
  END IF;
  IF v_r.cura_ate IS NOT NULL AND v_agora < v_r.cura_ate THEN
    RAISE EXCEPTION 'JA_COMENDO: ele já está comendo' USING ERRCODE = 'P0001';
  END IF;

  v_cura := least(v_r.vida_max - v_r.vida, greatest(1, round(v_r.vida_max * v_fracao)::integer));
  IF v_cura <= 0 THEN
    RAISE EXCEPTION 'VIDA_CHEIA: ele já está com a vida toda' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.chefao_rodadas
     SET vida         = vida + v_cura,
         cura_em      = v_agora,
         cura_ate     = v_agora + v_dura,
         cura_vida    = v_cura,
         cura_semente = floor(random() * 2147483647)::integer,
         curas        = curas + 1,
         -- O banquete não come o tempo da luta.
         expira_em    = expira_em + v_dura,
         versao       = versao + 1
   WHERE id = v_r.id;

  PERFORM public.fn_chefao_avisar(v_r.id);
  RETURN public.fn_chefao_estado(v_r.id);
END;
$function$;

-- ── Quem parece autoclick (super_admin) ────────────────────────────────────
-- Todo mundo da rodada, com o que foi medido; o app decide o selo
-- (`avaliarFicha` em `autoclick.ts`). Fora do aviso e do ranking: a
-- suspeita não vai para a tela de ninguém além do super_admin.
CREATE OR REPLACE FUNCTION public.fn_chefao_suspeitos(p_rodada bigint)
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
             'acertos', g.acertos, 'headshots', g.headshots,
             'cliques', g.cliques, 'lotes', g.lotes, 'lotes_no_teto', g.lotes_no_teto,
             'suspeitas', g.suspeitas, 'motivos', g.motivos,
             'segundos', greatest(1, ceil(extract(epoch FROM g.ultimo_em - g.primeiro_em)))::integer)
           ORDER BY g.suspeitas DESC, g.lotes_no_teto DESC, g.dano DESC)
      FROM public.chefao_golpes g
     WHERE g.rodada_id = p_rodada
  ), '[]'::jsonb);
END;
$function$;

-- ── A leitura de entrada ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chefao_atual()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_chefao_estado(r.id)
    FROM public.chefao_rodadas r
   WHERE auth.uid() IS NOT NULL
   ORDER BY r.id DESC
   LIMIT 1;
$function$;

-- ── Quem pode chamar ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_chefao_estado(bigint)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefao_placar(bigint, uuid)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefao_avisar(bigint)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefao_enviar(jsonb)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefao_soltar(integer, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefao_acertar(bigint, integer, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefao_atual()                           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_chefao_soltar(integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefao_acertar(bigint, integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefao_atual()                           TO authenticated;
REVOKE ALL ON FUNCTION public.fn_chefao_curar(bigint, numeric)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefao_suspeitos(bigint)                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_chefao_curar(bigint, numeric)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefao_suspeitos(bigint)                TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.chefao_rodadas') IS NULL OR to_regclass('public.chefao_golpes') IS NULL THEN
    RAISE EXCEPTION 'tabelas do chefão não criadas';
  END IF;
  IF to_regprocedure('public.fn_chefao_acertar(bigint, integer, integer, integer, integer)') IS NULL
     OR to_regprocedure('public.fn_chefao_soltar(integer, integer, integer, integer)') IS NULL
     OR to_regprocedure('public.fn_chefao_atual()') IS NULL
     OR to_regprocedure('public.fn_chefao_curar(bigint, numeric)') IS NULL
     OR to_regprocedure('public.fn_chefao_suspeitos(bigint)') IS NULL THEN
    RAISE EXCEPTION 'funções do chefão não criadas';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_chefao_acertar(bigint, integer, integer, integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_chefao_acertar(bigint, integer, integer, integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefao_avisar(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefao_enviar(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefao_estado(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'permissões do chefão erradas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages'
                  AND policyname = 'abobora_receber') THEN
    RAISE EXCEPTION 'a policy abobora_receber (20261005120000) sumiu — ninguém ouviria o chefão';
  END IF;
END
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';
