-- ============================================================================
-- Caça às Bruxas: a CHEFONA (a Bruxa do Pântano) — vida dividida e ranking
-- ============================================================================
--
-- ## O pedido (15/10/2026)
--
-- A chefona das bruxas, solta como o Rei do Pop: o super_admin solta, todo
-- mundo atira junto na mesma vida, e no fim aparece o ranking. Ela é a bruxa
-- do Minecraft: voa, joga poção na tela e desvia — isso é da tela de cada um
-- (`CacaAbobora/bruxas/chefona/palcoChefona.ts`). Aqui mora só o que precisa
-- ser IGUAL para todos: a vida, a Poção de Cura, o Totem e o ranking.
--
-- ## Nada do que existe muda
--
-- Tudo aqui é novo: duas tabelas `chefona_*` e funções `fn_chefona_*`. As do
-- Rei do Pop (20261009120000) não são tocadas — ele continua igual, e uma aba
-- aberta antes do deploy não vê a chefona (ela não ouve o sinal `chefona`).
-- Para desfazer, basta o bloco «Para desfazer» no fim deste arquivo.
--
-- ## O que mora aqui
--
--   chefona_rodadas   uma linha por chefona solta: a vida de todos, o prazo, a
--                     cura, o totem, e quem deu o golpe final. Uma ativa por vez.
--   chefona_golpes    uma linha por pessoa por chefona: dano, acertos,
--                     críticos. É o ranking.
--
--   fn_chefona_soltar(vida, minutos, espera_s, vida_por_pessoa)
--                         só o super_admin. Recusa com o Rei do Pop na tela:
--                         dois chefes ao mesmo tempo, não.
--   fn_chefona_acertar(rodada, acertos, criticos, dano, cliques, suspeita)
--                         um LOTE de tiros (o app junta 1 s).
--   fn_chefona_curar(rodada, fração)  só o super_admin: a Poção de Cura.
--   fn_chefona_proteger(rodada)       só o super_admin: o Totem da Imortalidade.
--   fn_chefona_suspeitos(rodada)      só o super_admin: quem parece autoclick.
--   fn_chefona_atual()                a leitura de entrada: a última chefona.
--
-- ## O dano
--
-- Na chefona o dano depende de ONDE pegou (cabeça 6, corpo 3, chapéu 2...) e
-- do que ela está fazendo (preparando poção, tonta) — é a tela de quem atirou
-- que sabe. O lote leva os acertos e o dano somado; o banco não confia: no
-- máximo 12 acertos por lote e 12 de dano por acerto (cabeça com ela tonta).
--
-- ## A Poção de Cura e o Totem (botões do super_admin)
--
-- Cura: devolve uma fração da vida máxima (22% por padrão, no máximo o que
-- falta). A vida sobe aqui na hora; a tela mostra ela bebendo e só põe a vida
-- na barra no último gole (`cura_em` + 1,8 s no app).
--
-- Totem: ela fica PROTEGIDA. O golpe que a mataria não mata: o totem estoura,
-- ela fica com 1 de vida, ganha Absorção (10% da vida máxima, gasta antes da
-- vida) e Regeneração (15%, somada aqui na hora; a tela mostra subindo em 8 s,
-- de `totem_em`). Um totem por feitiço.
--
-- ## O aviso (o mesmo cuidado do Rei do Pop)
--
-- O tópico da caça (`abobora:<empresa>`, policy de 20261005120000), com o
-- sinal `chefona`. No máximo um aviso a cada 2 s enquanto ela apanha — cada
-- aviso vai a TODA aba logada —, e sempre um quando ela cai, quando o totem
-- estoura, quando bebe, e quando foge. `versao` sobe a cada mudança e o app
-- ignora aviso velho.
--
-- ## Sob carga
--
-- Todo tiro passa pela MESMA linha (`FOR UPDATE`). O tiro faz antes, sem
-- trava, tudo o que dá (prazo, contagem, freio, nome) e devolve dali quem não
-- vai tirar vida. A trava tem `lock_timeout` de 2 s: com o banco afogado, o
-- lote falha (o app avisa) em vez de prender conexão que o resto do app usa.
-- Freio por pessoa: um lote a cada 600 ms (o app manda a cada 1 s).
--
-- ## A vida cresce com quem entra
--
-- Começa em `vida_max` e, a cada pessoa que acerta o PRIMEIRO tiro, ganha
-- `vida_por_pessoa`. Logado não é jogando: com 10 ou com 100 caçadores a luta
-- dura parecido.
--
-- Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── As tabelas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chefona_rodadas (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  solta_em          TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expira_em         TIMESTAMPTZ NOT NULL,
  solta_por         UUID,
  vida_max          INTEGER     NOT NULL CHECK (vida_max BETWEEN 10 AND 500000),
  vida_por_pessoa   INTEGER     NOT NULL DEFAULT 0 CHECK (vida_por_pessoa BETWEEN 0 AND 10000),
  vida              INTEGER     NOT NULL CHECK (vida >= 0),
  -- A Absorção do totem: gasta antes da vida.
  absorcao          INTEGER     NOT NULL DEFAULT 0 CHECK (absorcao >= 0),
  situacao          TEXT        NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo', 'derrotado', 'fugiu')),
  derrotado_em      TIMESTAMPTZ,
  golpe_final_por   UUID,
  golpe_final_nome  TEXT,
  golpe_final_foto  TEXT,
  versao            BIGINT      NOT NULL DEFAULT 1,
  -- Quando o último aviso saiu: o freio dos avisos.
  avisado_em        TIMESTAMPTZ,
  -- A Poção de Cura (`fn_chefona_curar`): quando, quanto, quantas vezes.
  cura_em           TIMESTAMPTZ,
  cura_vida         INTEGER     NOT NULL DEFAULT 0 CHECK (cura_vida >= 0),
  curas             INTEGER     NOT NULL DEFAULT 0 CHECK (curas >= 0),
  -- O Totem (`fn_chefona_proteger`): segurando agora, desde quando; quando
  -- estourou, quanto a Regeneração devolveu, e quantos já estouraram.
  protegida         BOOLEAN     NOT NULL DEFAULT FALSE,
  protegida_em      TIMESTAMPTZ,
  totem_em          TIMESTAMPTZ,
  totem_vida        INTEGER     NOT NULL DEFAULT 0 CHECK (totem_vida >= 0),
  totens            INTEGER     NOT NULL DEFAULT 0 CHECK (totens >= 0),
  CONSTRAINT chefona_rodadas_vida_cabe CHECK (vida <= vida_max),
  CONSTRAINT chefona_rodadas_derrotada_completa CHECK (
    (situacao = 'derrotado') = (derrotado_em IS NOT NULL AND golpe_final_por IS NOT NULL)
  )
);

COMMENT ON TABLE public.chefona_rodadas IS
  'Caça às Bruxas: a chefona (Bruxa do Pântano). Uma linha por chefona solta. Escrita só pelas funções fn_chefona_*. Ver 20261015230000.';

CREATE UNIQUE INDEX IF NOT EXISTS chefona_rodadas_uma_ativa
  ON public.chefona_rodadas ((TRUE)) WHERE situacao = 'ativo';

CREATE TABLE IF NOT EXISTS public.chefona_golpes (
  rodada_id     BIGINT      NOT NULL REFERENCES public.chefona_rodadas (id) ON DELETE CASCADE,
  usuario       UUID        NOT NULL,
  nome          TEXT        NOT NULL,
  foto          TEXT,
  dano          INTEGER     NOT NULL DEFAULT 0 CHECK (dano >= 0),
  acertos       INTEGER     NOT NULL DEFAULT 0 CHECK (acertos >= 0),
  criticos      INTEGER     NOT NULL DEFAULT 0 CHECK (criticos >= 0),
  primeiro_em   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ultimo_em     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  -- Autoclick (como no Rei do Pop): o que o app mediu, e o teto que o banco conta.
  cliques       INTEGER     NOT NULL DEFAULT 0 CHECK (cliques >= 0),
  lotes         INTEGER     NOT NULL DEFAULT 0 CHECK (lotes >= 0),
  lotes_no_teto INTEGER     NOT NULL DEFAULT 0 CHECK (lotes_no_teto >= 0),
  suspeitas     INTEGER     NOT NULL DEFAULT 0 CHECK (suspeitas >= 0),
  motivos       INTEGER     NOT NULL DEFAULT 0 CHECK (motivos >= 0),
  PRIMARY KEY (rodada_id, usuario)
);

COMMENT ON TABLE public.chefona_golpes IS
  'Caça às Bruxas: quanto cada pessoa tirou da chefona (o ranking). Escrita só por fn_chefona_acertar.';

CREATE INDEX IF NOT EXISTS chefona_golpes_ranking
  ON public.chefona_golpes (rodada_id, dano DESC, criticos DESC);

ALTER TABLE public.chefona_rodadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chefona_golpes  ENABLE ROW LEVEL SECURITY;

-- Como as do Rei do Pop: quem está logado lê; ninguém escreve direto.
DROP POLICY IF EXISTS chefona_rodadas_leitura ON public.chefona_rodadas;
CREATE POLICY chefona_rodadas_leitura ON public.chefona_rodadas
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS chefona_golpes_leitura ON public.chefona_golpes;
CREATE POLICY chefona_golpes_leitura ON public.chefona_golpes
  FOR SELECT TO authenticated USING (TRUE);

GRANT SELECT ON public.chefona_rodadas TO authenticated;
GRANT SELECT ON public.chefona_golpes  TO authenticated;
GRANT ALL    ON public.chefona_rodadas TO service_role;
GRANT ALL    ON public.chefona_golpes  TO service_role;

-- ── O estado que o app recebe ───────────────────────────────────────────────
-- A linha (sem os campos internos), quantos ajudaram e os 10 que mais tiraram.
CREATE OR REPLACE FUNCTION public.fn_chefona_estado(p_rodada bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (to_jsonb(r) - 'avisado_em' - 'solta_por')
      || jsonb_build_object(
           'participantes', (SELECT count(*) FROM public.chefona_golpes g WHERE g.rodada_id = r.id),
           'ranking', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'usuario', t.usuario, 'nome', t.nome, 'foto', t.foto,
                      'dano', t.dano, 'acertos', t.acertos, 'criticos', t.criticos)
                    ORDER BY t.dano DESC, t.criticos DESC, t.primeiro_em)
               FROM (SELECT g.* FROM public.chefona_golpes g
                      WHERE g.rodada_id = r.id
                      ORDER BY g.dano DESC, g.criticos DESC, g.primeiro_em
                      LIMIT 10) t
           ), '[]'::jsonb))
    FROM public.chefona_rodadas r
   WHERE r.id = p_rodada;
$function$;

-- O placar de uma pessoa, mesmo fora do topo.
CREATE OR REPLACE FUNCTION public.fn_chefona_placar(p_rodada bigint, p_usuario uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
           'dano', g.dano, 'acertos', g.acertos, 'criticos', g.criticos,
           'posicao', 1 + (SELECT count(*) FROM public.chefona_golpes o
                            WHERE o.rodada_id = g.rodada_id AND o.dano > g.dano))
    FROM public.chefona_golpes g
   WHERE g.rodada_id = p_rodada AND g.usuario = p_usuario;
$function$;

-- O envio a quem está logado, em todas as empresas (como o do Rei do Pop).
CREATE OR REPLACE FUNCTION public.fn_chefona_enviar(p_estado jsonb)
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
    PERFORM realtime.send(p_estado, 'chefona', 'abobora:' || v_empresa::text, true);
  END LOOP;
END;
$function$;

-- O aviso das horas raras (soltou, fugiu, bebeu, protegeu): lê, manda e marca.
CREATE OR REPLACE FUNCTION public.fn_chefona_avisar(p_rodada bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_estado jsonb := public.fn_chefona_estado(p_rodada);
BEGIN
  IF v_estado IS NULL THEN RETURN; END IF;
  PERFORM public.fn_chefona_enviar(v_estado);
  UPDATE public.chefona_rodadas SET avisado_em = clock_timestamp() WHERE id = p_rodada;
END;
$function$;

-- ── Soltar (super_admin) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chefona_soltar(
  p_vida integer DEFAULT 700, p_minutos integer DEFAULT 2, p_espera_s integer DEFAULT 60,
  p_vida_por_pessoa integer DEFAULT 400
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id      bigint;
  v_vencida bigint;
  v_rei     boolean := false;
  v_vida    integer := least(greatest(coalesce(p_vida, 700), 10), 500000);
  v_pessoa  integer := least(greatest(coalesce(p_vida_por_pessoa, 400), 0), 10000);
  v_minutos integer := least(greatest(coalesce(p_minutos, 2), 1), 15);
  v_espera  integer := least(greatest(coalesce(p_espera_s, 60), 0), 600);
  v_chega   timestamptz := clock_timestamp() + make_interval(secs => v_espera);
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin solta a chefona' USING ERRCODE = '42501';
  END IF;

  -- Vencida que ninguém marcou: fugiu.
  UPDATE public.chefona_rodadas SET situacao = 'fugiu', versao = versao + 1
   WHERE situacao = 'ativo' AND expira_em <= clock_timestamp()
  RETURNING id INTO v_vencida;
  IF v_vencida IS NOT NULL THEN PERFORM public.fn_chefona_avisar(v_vencida); END IF;

  IF EXISTS (SELECT 1 FROM public.chefona_rodadas WHERE situacao = 'ativo') THEN
    RAISE EXCEPTION 'JA_TEM_UMA: a chefona já está na tela' USING ERRCODE = 'P0001';
  END IF;

  -- O Rei do Pop na tela: dois chefes ao mesmo tempo, não. Lido por EXECUTE
  -- para a função não depender da tabela dele existir.
  IF to_regclass('public.chefao_rodadas') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.chefao_rodadas
                             WHERE situacao = ''ativo'' AND expira_em > clock_timestamp())'
      INTO v_rei;
  END IF;
  IF v_rei THEN
    RAISE EXCEPTION 'CHEFAO_NA_TELA: o Rei do Pop zumbi está na tela' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.chefona_rodadas (solta_em, expira_em, solta_por, vida_max, vida, vida_por_pessoa)
  VALUES (v_chega, v_chega + make_interval(mins => v_minutos), auth.uid(), v_vida, v_vida, v_pessoa)
  RETURNING id INTO v_id;

  PERFORM public.fn_chefona_avisar(v_id);
  RETURN v_id;
END;
$function$;

-- ── O tiro (um lote) ────────────────────────────────────────────────────────
-- Em duas partes (ver «Sob carga» no topo): primeiro, sem trava, tudo o que não
-- tira vida volta dali; depois, na fila da linha, só o que precisa ser em fila.
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
  v_agora    timestamptz := clock_timestamp();
  v_eu       uuid := auth.uid();
  v_r        public.chefona_rodadas%ROWTYPE;
  v_a        integer := least(greatest(coalesce(p_acertos, 0), 0), 12);
  v_c        integer;
  v_d        integer;
  v_ultimo   timestamptz;
  v_nome     text;
  v_foto     text;
  v_novo     boolean;
  v_extra    integer := 0;
  v_max      integer;
  v_vida     integer;
  v_abs      integer;
  v_gasta    integer;
  v_resto    integer;
  v_efetivo  integer;
  v_morreu   boolean := false;
  v_totem    boolean := false;
  v_regen    integer := 0;
  v_avisar   boolean;
  v_estado   jsonb;
  v_cliques  integer := least(greatest(coalesce(p_cliques, 0), 0), 100);
  v_suspeita integer := least(greatest(coalesce(p_suspeita, 0), 0), 255);
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTENTICADO' USING ERRCODE = '42501';
  END IF;
  v_c := least(greatest(coalesce(p_criticos, 0), 0), v_a);
  -- Sem o dano no lote, 3 por acerto (o corpo); com, no máximo 12 por acerto.
  v_d := least(greatest(coalesce(p_dano, v_a * 3), 0), v_a * 12);

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

  -- O freio: um lote a cada 600 ms por pessoa. `freio` diz ao app que estes
  -- tiros não entraram, e ele os manda de novo no próximo lote.
  SELECT g.ultimo_em INTO v_ultimo
    FROM public.chefona_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  IF v_ultimo IS NOT NULL AND v_ultimo > v_agora - interval '600 milliseconds' THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu), 'freio', true);
  END IF;

  -- O nome e a foto só no primeiro tiro: depois a linha do ranking já tem.
  IF v_ultimo IS NULL THEN
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

  -- O freio de novo, agora em fila: dois lotes da mesma pessoa ao mesmo tempo
  -- passaram juntos pela leitura sem trava; aqui só um passa.
  SELECT g.ultimo_em INTO v_ultimo
    FROM public.chefona_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  v_novo := NOT FOUND;
  IF v_ultimo IS NOT NULL AND v_ultimo > v_agora - interval '600 milliseconds' THEN
    RETURN public.fn_chefona_estado(v_r.id)
        || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu), 'freio', true);
  END IF;

  -- Caçadora nova: a vida cresce antes do tiro dela (até o teto da coluna).
  IF v_novo THEN v_extra := least(v_r.vida_por_pessoa, 500000 - v_r.vida_max); END IF;
  v_max  := v_r.vida_max + v_extra;
  v_vida := v_r.vida + v_extra;
  v_abs  := v_r.absorcao;

  -- A Absorção do totem paga primeiro; o resto sai da vida.
  v_gasta := least(v_abs, v_d);
  v_abs   := v_abs - v_gasta;
  v_resto := v_d - v_gasta;

  IF v_vida - v_resto > 0 THEN
    v_vida := v_vida - v_resto;
    v_efetivo := v_d;
  ELSIF v_r.protegida THEN
    -- O golpe que a mataria: o totem estoura. 1 de vida, mais a Regeneração
    -- (somada aqui; a tela mostra subindo), e a Absorção nova.
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

  -- O golpe final leva o nome: quem já tinha atirado tem ele na linha do ranking.
  IF v_morreu AND NOT v_novo THEN
    SELECT g.nome, g.foto INTO v_nome, v_foto
      FROM public.chefona_golpes g WHERE g.rodada_id = v_r.id AND g.usuario = v_eu;
  END IF;
  -- Avisa todo mundo: sempre quando ela cai ou o totem estoura; apanhando, no
  -- máximo a cada 2 s.
  v_avisar := v_morreu OR v_totem OR v_r.avisado_em IS NULL
           OR v_r.avisado_em <= clock_timestamp() - interval '2 seconds';

  INSERT INTO public.chefona_golpes AS g (
    rodada_id, usuario, nome, foto, dano, acertos, criticos, primeiro_em, ultimo_em,
    cliques, lotes, lotes_no_teto, suspeitas, motivos)
  VALUES (
    v_r.id, v_eu, v_nome, v_foto, v_efetivo, v_a, v_c, v_agora, v_agora,
    v_cliques, 1, (v_a >= 12)::integer, ((v_suspeita & 7) <> 0)::integer, v_suspeita)
  ON CONFLICT (rodada_id, usuario) DO UPDATE
     SET dano          = g.dano + EXCLUDED.dano,
         acertos       = g.acertos + EXCLUDED.acertos,
         criticos      = g.criticos + EXCLUDED.criticos,
         ultimo_em     = EXCLUDED.ultimo_em,
         cliques       = g.cliques + EXCLUDED.cliques,
         lotes         = g.lotes + 1,
         lotes_no_teto = g.lotes_no_teto + EXCLUDED.lotes_no_teto,
         suspeitas     = g.suspeitas + EXCLUDED.suspeitas,
         motivos       = g.motivos | EXCLUDED.motivos;

  -- Uma escrita só na linha disputada (o `avisado_em` vai junto).
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

  -- O estado sai uma vez: o mesmo vai no aviso e na resposta.
  v_estado := public.fn_chefona_estado(v_r.id);
  IF v_avisar THEN PERFORM public.fn_chefona_enviar(v_estado); END IF;

  RETURN v_estado || jsonb_build_object('eu', public.fn_chefona_placar(v_r.id, v_eu));
END;
$function$;

-- ── A Poção de Cura (super_admin) ───────────────────────────────────────────
-- 22% da vida máxima por padrão (o `CURA_FRACAO` do app), no máximo o que
-- falta. Ela bebe por 1,8 s na tela: um gole novo não começa no meio do outro.
CREATE OR REPLACE FUNCTION public.fn_chefona_curar(p_rodada bigint, p_fracao numeric DEFAULT 0.22)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '5s'
AS $function$
DECLARE
  v_agora  timestamptz := clock_timestamp();
  v_r      public.chefona_rodadas%ROWTYPE;
  v_fracao numeric := least(greatest(coalesce(p_fracao, 0.22), 0.05), 0.5);
  v_cura   integer;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin cura a chefona' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_r FROM public.chefona_rodadas WHERE id = p_rodada FOR UPDATE;
  IF NOT FOUND OR v_r.situacao <> 'ativo' OR v_r.expira_em <= v_agora THEN
    RAISE EXCEPTION 'SEM_CHEFONA: ela não está na tela' USING ERRCODE = 'P0001';
  END IF;
  IF v_agora < v_r.solta_em THEN
    RAISE EXCEPTION 'AINDA_CHEGANDO: ela ainda não chegou' USING ERRCODE = 'P0001';
  END IF;
  IF v_r.cura_em IS NOT NULL AND v_agora < v_r.cura_em + interval '3 seconds' THEN
    RAISE EXCEPTION 'JA_BEBENDO: ela já está bebendo' USING ERRCODE = 'P0001';
  END IF;

  v_cura := least(v_r.vida_max - v_r.vida, greatest(1, round(v_r.vida_max * v_fracao)::integer));
  IF v_cura <= 0 THEN
    RAISE EXCEPTION 'VIDA_CHEIA: ela já está com a vida toda' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.chefona_rodadas
     SET vida      = vida + v_cura,
         cura_em   = v_agora,
         cura_vida = v_cura,
         curas     = curas + 1,
         versao    = versao + 1
   WHERE id = v_r.id;

  PERFORM public.fn_chefona_avisar(v_r.id);
  RETURN public.fn_chefona_estado(v_r.id);
END;
$function$;

-- ── O Totem da Imortalidade (super_admin) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chefona_proteger(p_rodada bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET lock_timeout TO '5s'
AS $function$
DECLARE
  v_agora timestamptz := clock_timestamp();
  v_r     public.chefona_rodadas%ROWTYPE;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin protege a chefona' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_r FROM public.chefona_rodadas WHERE id = p_rodada FOR UPDATE;
  IF NOT FOUND OR v_r.situacao <> 'ativo' OR v_r.expira_em <= v_agora THEN
    RAISE EXCEPTION 'SEM_CHEFONA: ela não está na tela' USING ERRCODE = 'P0001';
  END IF;
  IF v_agora < v_r.solta_em THEN
    RAISE EXCEPTION 'AINDA_CHEGANDO: ela ainda não chegou' USING ERRCODE = 'P0001';
  END IF;
  IF v_r.protegida THEN
    RAISE EXCEPTION 'JA_PROTEGIDA: ela já está segurando o totem' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.chefona_rodadas
     SET protegida    = true,
         protegida_em = v_agora,
         versao       = versao + 1
   WHERE id = v_r.id;

  PERFORM public.fn_chefona_avisar(v_r.id);
  RETURN public.fn_chefona_estado(v_r.id);
END;
$function$;

-- ── Quem parece autoclick (super_admin) ────────────────────────────────────
-- Fora do aviso e do ranking: a suspeita só aparece para o super_admin.
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
             'segundos', greatest(1, ceil(extract(epoch FROM g.ultimo_em - g.primeiro_em)))::integer)
           ORDER BY g.suspeitas DESC, g.lotes_no_teto DESC, g.dano DESC)
      FROM public.chefona_golpes g
     WHERE g.rodada_id = p_rodada
  ), '[]'::jsonb);
END;
$function$;

-- ── A leitura de entrada ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chefona_atual()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_chefona_estado(r.id)
    FROM public.chefona_rodadas r
   WHERE auth.uid() IS NOT NULL
   ORDER BY r.id DESC
   LIMIT 1;
$function$;

-- ── Quem pode chamar ────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_chefona_estado(bigint)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_placar(bigint, uuid)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_avisar(bigint)                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_enviar(jsonb)                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_chefona_soltar(integer, integer, integer, integer)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_curar(bigint, numeric)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_proteger(bigint)                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_suspeitos(bigint)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_chefona_atual()                            FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_chefona_soltar(integer, integer, integer, integer)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_curar(bigint, numeric)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_proteger(bigint)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_suspeitos(bigint)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chefona_atual()                            TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
BEGIN
  IF to_regclass('public.chefona_rodadas') IS NULL OR to_regclass('public.chefona_golpes') IS NULL THEN
    RAISE EXCEPTION 'tabelas da chefona não criadas';
  END IF;
  IF to_regprocedure('public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer)') IS NULL
     OR to_regprocedure('public.fn_chefona_soltar(integer, integer, integer, integer)') IS NULL
     OR to_regprocedure('public.fn_chefona_atual()') IS NULL
     OR to_regprocedure('public.fn_chefona_curar(bigint, numeric)') IS NULL
     OR to_regprocedure('public.fn_chefona_proteger(bigint)') IS NULL
     OR to_regprocedure('public.fn_chefona_suspeitos(bigint)') IS NULL THEN
    RAISE EXCEPTION 'funções da chefona não criadas';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefona_avisar(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefona_enviar(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_chefona_estado(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'permissões da chefona erradas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages'
                  AND policyname = 'abobora_receber') THEN
    RAISE EXCEPTION 'a policy abobora_receber (20261005120000) sumiu — ninguém ouviria a chefona';
  END IF;
END
$prova$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Para desfazer (só se for preciso — apaga as chefonas e o ranking delas; não
-- toca em nada do Rei do Pop nem da caça):
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_chefona_atual();
-- DROP FUNCTION IF EXISTS public.fn_chefona_suspeitos(bigint);
-- DROP FUNCTION IF EXISTS public.fn_chefona_proteger(bigint);
-- DROP FUNCTION IF EXISTS public.fn_chefona_curar(bigint, numeric);
-- DROP FUNCTION IF EXISTS public.fn_chefona_acertar(bigint, integer, integer, integer, integer, integer);
-- DROP FUNCTION IF EXISTS public.fn_chefona_soltar(integer, integer, integer, integer);
-- DROP FUNCTION IF EXISTS public.fn_chefona_avisar(bigint);
-- DROP FUNCTION IF EXISTS public.fn_chefona_enviar(jsonb);
-- DROP FUNCTION IF EXISTS public.fn_chefona_placar(bigint, uuid);
-- DROP FUNCTION IF EXISTS public.fn_chefona_estado(bigint);
-- DROP TABLE IF EXISTS public.chefona_golpes;
-- DROP TABLE IF EXISTS public.chefona_rodadas;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
-- ============================================================================
