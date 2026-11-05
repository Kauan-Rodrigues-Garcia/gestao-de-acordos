-- ============================================================================
-- Desafios: o operador só enxerga a campanha em que DISPUTA
-- ============================================================================
--
-- Relato do Cleber, 05/11/2026: entrando como operador, em Analítico >
-- Desafios, apareciam campanhas encerradas de que ele não participou — com o
-- placar e o recebimento de todo mundo. Vazamento.
--
-- ## A causa
--
-- Quem DISPUTA a campanha é decidido no cliente, por `participaDaCampanha`
-- (src/services/desafios/calcularDesafio.ts). A régua de LEITURA do banco
-- (`fn_desafio_no_meu_alcance`, degrau `desafios_escopo_individual` — o de
-- todo operador) era uma aproximação dela que olhava só setor, equipe e lista
-- nominal. Ficavam de fora:
--
--   • `excluidos` — a pessoa tirada da campanha continuava vendo;
--   • `cargos` — a «disputa dos líderes do Play 1» aparecia para todo
--     operador do Play 1;
--   • `metasPorOperador` — a planilha de metas é a convocação; os outros 200
--     do setor viam a campanha dos 27;
--   • `fonteResultado = equipe_liderada` — campanha de líderes, de novo;
--   • `convidados` — campanha em modo teste aparecia para o setor inteiro.
--
-- E o contrário: campanha da operação inteira (sem recorte nenhum) NÃO
-- aparecia para o operador que a disputa.
--
-- ## O conserto
--
-- `fn_desafio_eu_disputo(regra)` é `participaDaCampanha` escrito em SQL, para
-- a pessoa logada, com o mesmo elenco de `fn_desafio_pessoas_multi` (equipe
-- do cadastro ou da liderança única, setor da equipe, clones que contam
-- recebimento). O degrau individual passa a ser ela.
--
-- Os outros degraus NÃO mudam: mural (`visibilidade = 'todos'`), cúpula, quem
-- configura, e os escopos de setor e equipe — que são da liderança e existem
-- justamente para ver a campanha «mesmo sem disputar». Como a policy
-- `desafios_select`, `fn_desafio_dados`, o placar do dia e o contexto de
-- equipe chamam todos `fn_desafio_no_meu_alcance`, a correção vale para a
-- lista E para os números, sem recriar policy nenhuma.
-- ============================================================================

BEGIN;

-- ── 1. Ajudantes puros ──────────────────────────────────────────────────────

-- Lista de textos do JSON, como `listaDeTextos` do cliente: o que não é array
-- vira vazio, o que não é texto cai fora. Nunca lança — JSON torto não pode
-- derrubar a aba.
CREATE OR REPLACE FUNCTION public.fn_desafio_lista(p JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $fn$
  SELECT CASE WHEN jsonb_typeof(p) = 'array'
    THEN ARRAY(SELECT e #>> '{}' FROM jsonb_array_elements(p) e WHERE jsonb_typeof(e) = 'string')
    ELSE ARRAY[]::TEXT[] END;
$fn$;

-- Valor de meta válido, como `normalizarMetas`: `Number(valor)` finito e > 0.
CREATE OR REPLACE FUNCTION public.fn_desafio_meta_valida(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $fn$
  SELECT CASE jsonb_typeof(p)
    WHEN 'number'  THEN (p #>> '{}')::NUMERIC > 0
    WHEN 'boolean' THEN (p #>> '{}')::BOOLEAN          -- Number(true) = 1
    WHEN 'string'  THEN CASE
      WHEN (p #>> '{}') ~ '^\s*[+]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$'
        THEN btrim(p #>> '{}')::NUMERIC > 0
      ELSE FALSE END
    ELSE FALSE
  END;
$fn$;

-- Login normalizado, como `chaveDeLogin`.
CREATE OR REPLACE FUNCTION public.fn_desafio_chave_login(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $fn$
  SELECT regexp_replace(lower(btrim(COALESCE(p, ''))), '[^a-z0-9_]', '', 'g');
$fn$;

REVOKE ALL ON FUNCTION public.fn_desafio_lista(JSONB)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_desafio_meta_valida(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_desafio_chave_login(TEXT)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_lista(JSONB)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desafio_meta_valida(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_desafio_chave_login(TEXT)  TO authenticated;

-- ── 2. A pessoa logada disputa esta campanha? ───────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_eu_disputo(p_regra JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid          UUID := auth.uid();
  v_eu           public.perfis%ROWTYPE;
  v_part         JSONB;
  v_setores      TEXT[];
  v_equipes      TEXT[];
  v_operadores   TEXT[];
  v_cargos       TEXT[];
  v_excluidos    TEXT[];
  v_convidados   TEXT[];
  v_metas        JSONB;
  v_tem_metas    BOOLEAN := FALSE;
  v_lider_unico  UUID;
  v_minha_equipe UUID;
  v_setor_base   UUID;
  v_meus_setores TEXT[];
  v_minhas_eq    TEXT[];
  v_lidera       BOOLEAN;
  v_cargo        TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;
  SELECT * INTO v_eu FROM public.perfis WHERE id = v_uid;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  v_part := CASE WHEN jsonb_typeof(p_regra->'participantes') = 'object'
                 THEN p_regra->'participantes' ELSE '{}'::JSONB END;
  v_setores    := public.fn_desafio_lista(v_part->'setores');
  v_equipes    := public.fn_desafio_lista(v_part->'equipes');
  v_operadores := public.fn_desafio_lista(v_part->'operadores');
  v_cargos     := public.fn_desafio_lista(v_part->'cargos');
  v_excluidos  := public.fn_desafio_lista(v_part->'excluidos');
  v_convidados := public.fn_desafio_lista(v_part->'convidados');

  -- A exclusão vem primeiro, antes do convidado e do mapa de metas.
  IF v_uid::TEXT = ANY (v_excluidos) THEN RETURN FALSE; END IF;

  -- Modo teste: com convidado, disputam os convidados e mais ninguém.
  IF cardinality(v_convidados) > 0 THEN
    RETURN v_uid::TEXT = ANY (v_convidados);
  END IF;

  -- O elenco (`fn_desafio_pessoas_multi`): sem super admin, sem arquivado,
  -- sem inativo que não seja desligado.
  v_cargo := COALESCE(v_eu.perfil::TEXT, 'operador');
  IF v_cargo = 'super_admin'
     OR v_eu.arquivado IS TRUE
     OR (v_eu.ativo IS FALSE AND COALESCE(v_eu.situacao::TEXT, 'ativo') <> 'desligado') THEN
    RETURN FALSE;
  END IF;

  -- Mapa de metas é a convocação — só quando a meta vem do mapa.
  -- COALESCE: campo ausente é NULL, e `NOT NULL` pularia a convocação.
  IF NOT COALESCE(p_regra->>'fonteResultado' = 'equipe_liderada'
                  AND p_regra->>'fonteMeta' IN ('meta_equipe', 'projecao_equipe'), FALSE) THEN
    v_metas := p_regra->'metasPorOperador';
    IF jsonb_typeof(v_metas) = 'object' THEN
      SELECT EXISTS (SELECT 1 FROM jsonb_each(v_metas) m WHERE public.fn_desafio_meta_valida(m.value))
        INTO v_tem_metas;
      IF v_tem_metas
         AND NOT public.fn_desafio_meta_valida(v_metas->(v_uid::TEXT))
         AND NOT public.fn_desafio_meta_valida(v_metas->(public.fn_desafio_chave_login(v_eu.usuario))) THEN
        RETURN FALSE;
      END IF;
    END IF;
  END IF;

  IF cardinality(v_operadores) > 0 AND NOT (v_uid::TEXT = ANY (v_operadores)) THEN
    RETURN FALSE;
  END IF;

  -- Equipe e setor como o elenco monta: líder usa a equipe que lidera (se for
  -- uma só), membro usa a do cadastro; o setor é o da equipe; clones que
  -- contam recebimento somam equipe e setor.
  SELECT CASE WHEN COUNT(DISTINCT el.equipe_id) = 1 THEN MIN(el.equipe_id::TEXT)::UUID END,
         COUNT(*) > 0
    INTO v_lider_unico, v_lidera
    FROM public.equipe_lideres el
   WHERE el.lider_id = v_uid;

  v_minha_equipe := CASE WHEN v_cargo = 'lider' THEN v_lider_unico
                         ELSE COALESCE(v_eu.equipe_id, v_lider_unico) END;
  SELECT COALESCE(e.setor_id, v_eu.setor_id) INTO v_setor_base
    FROM (SELECT 1) x LEFT JOIN public.equipes e ON e.id = v_minha_equipe;

  SELECT ARRAY(
           SELECT s::TEXT FROM (
             SELECT v_setor_base AS s
             UNION
             SELECT e.setor_id FROM public.equipe_operadores_clones c
               JOIN public.equipes e ON e.id = c.equipe_id
              WHERE c.operador_id = v_uid AND c.conta_recebimento IS TRUE
           ) t WHERE s IS NOT NULL),
         ARRAY(
           SELECT q::TEXT FROM (
             SELECT v_minha_equipe AS q
             UNION
             SELECT c.equipe_id FROM public.equipe_operadores_clones c
              WHERE c.operador_id = v_uid AND c.conta_recebimento IS TRUE
           ) t WHERE q IS NOT NULL)
    INTO v_meus_setores, v_minhas_eq;

  IF cardinality(v_setores) > 0 AND NOT (v_meus_setores && v_setores) THEN RETURN FALSE; END IF;
  IF cardinality(v_equipes) > 0 AND NOT (v_minhas_eq && v_equipes)    THEN RETURN FALSE; END IF;
  IF cardinality(v_cargos)  > 0 AND NOT (v_cargo = ANY (v_cargos))    THEN RETURN FALSE; END IF;

  -- Campanha de líderes: quem não lidera equipe nenhuma não disputa.
  IF p_regra->>'fonteResultado' = 'equipe_liderada'
     AND v_minha_equipe IS NULL AND NOT COALESCE(v_lidera, FALSE) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_desafio_eu_disputo(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_eu_disputo(JSONB) TO authenticated;

COMMENT ON FUNCTION public.fn_desafio_eu_disputo(JSONB) IS
  'participaDaCampanha (calcularDesafio.ts) em SQL, para a pessoa logada. Degrau individual de fn_desafio_no_meu_alcance. 20261105120000.';

-- ── 3. A régua de leitura, com o degrau individual trocado ──────────────────

CREATE OR REPLACE FUNCTION public.fn_desafio_no_meu_alcance(
  p_setor_id     UUID,
  p_regra        JSONB,
  p_visibilidade TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_setores    UUID[];
  v_equipes    UUID[];
  v_meu_setor  UUID;
BEGIN
  IF COALESCE(p_visibilidade, 'alcance') = 'todos' THEN RETURN TRUE; END IF;
  IF public.fn_user_is_super_admin()                 THEN RETURN TRUE; END IF;
  IF public.fn_user_tem('desafios_escopo_todos_setores') THEN RETURN TRUE; END IF;
  IF public.fn_user_tem('desafios_configurar')       THEN RETURN TRUE; END IF;

  BEGIN
    SELECT
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_regra->'participantes'->'setores')::UUID), ARRAY[]::UUID[]),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_regra->'participantes'->'equipes')::UUID), ARRAY[]::UUID[])
      INTO v_setores, v_equipes;
  EXCEPTION WHEN OTHERS THEN
    v_setores := ARRAY[]::UUID[]; v_equipes := ARRAY[]::UUID[];
  END;

  -- Escopo de setor e de equipe: liderança, «mesmo sem disputar». Sem mudança.
  IF public.fn_user_tem('desafios_escopo_setor') THEN
    v_meu_setor := public.fn_user_setor_id();
    IF p_setor_id IS NOT NULL AND p_setor_id = v_meu_setor THEN RETURN TRUE; END IF;
    IF cardinality(v_setores) = 0 THEN RETURN TRUE; END IF;
    IF v_meu_setor = ANY (v_setores) THEN RETURN TRUE; END IF;
  END IF;

  IF public.fn_user_tem('desafios_escopo_equipe') THEN
    IF cardinality(v_equipes) = 0 AND cardinality(v_setores) = 0 THEN RETURN TRUE; END IF;
    IF public.fn_user_equipes() && v_equipes THEN RETURN TRUE; END IF;
  END IF;

  -- Escopo individual (05/11/2026): só a campanha que a pessoa DISPUTA, pela
  -- mesma regra do ranking. Antes: setor/equipe/lista nominal, sem cargo,
  -- exclusão, convocação por metas nem campanha de líderes.
  IF public.fn_user_tem('desafios_escopo_individual')
     AND public.fn_desafio_eu_disputo(p_regra) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$fn$;

COMMENT ON FUNCTION public.fn_desafio_no_meu_alcance(UUID, JSONB, TEXT) IS
  'A campanha esta no alcance de leitura de quem esta logado? Le as quatro '
  'chaves desafios_escopo_*; o degrau individual e fn_desafio_eu_disputo (20261105120000).';

COMMIT;
