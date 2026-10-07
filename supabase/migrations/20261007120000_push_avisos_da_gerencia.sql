-- ============================================================================
-- Avisos da GERÊNCIA no celular e Cofen só em H.O. — parte 3 (07/10/2026)
-- ============================================================================
--
-- Desenho: docs/superpowers/specs/2026-10-06-app-celular-gerencia-design.md §3.
--
-- ## Os quatro avisos do gerente (interruptores no app, todos começam LIGADOS)
--
--   setor_meta              o setor alcançou a meta do mês (uma vez por mês)
--   setor_metas_equipes     uma equipe do setor alcançou a meta
--   setor_metas_operadores  alguém do setor alcançou a 1ª, 2ª ou 3ª meta —
--                           várias pessoas na mesma rodada viram UM aviso
--   setor_resumo            no minuto 10 de cada hora, logo depois de o 59
--                           atualizar: quanto o setor recebeu desde o último
--                           resumo e o total do dia. Só sai se entrou dinheiro.
--
-- Gerente = cargo que supervisiona setor, pelos ATRIBUTOS do cargo (`cargos`),
-- a mesma régua de `PERFIS_QUE_SUPERVISIONAM_SETOR` no app — nunca pelo nome.
--
-- ## De onde vem o número do setor (o card do Painel Líder)
--
--   Nosso produto  fn_recebido_por_setor (20261006230500), bruto
--   Cofen          relatório de conciliação (`pp_relatorio_conciliacoes`), H.O.
--
-- A meta do setor Cofen é comparada em H.O. (meta × percentual), como a equipe.
--
-- ## Equipe e pessoa: sem mexer na rodada de metas
--
-- `fn_push_metas_da_rodada` continua igual. A Edge Function pega o que ela
-- devolveu e pergunta `fn_push_gerentes_das_equipes` quem cuida do setor de
-- cada equipe. Menos risco: a rodada que já funciona não é reescrita.
--
-- ## Cofen só em H.O. em todo aviso (Cleber, 06/10/2026)
--
-- Três funções que já existem decidiam a unidade pela EMPRESA ou mandavam
-- bruto. Elas NÃO são reescritas a partir dos arquivos (o banco pode ter
-- versão mais nova que o repositório): a migration lê a definição VIVA e
-- troca só o trecho. Se o trecho não estiver lá, para tudo com erro.
--
--   fn_push_pegar_lote      pagamento: H.O. pela REGRA do setor da pessoa
--   fn_push_pegar_saidas    pagamento retirado: idem
--   fn_push_resumo_equipes  resumo da equipe Cofen (diário) em H.O., com
--                           `em_ho` no item; o pico de hoje vira H.O. também
--
-- ## Cuidados
--
--   * Chamado pela API, o Supabase recusa DELETE/UPDATE sem WHERE mesmo dentro
--     de função (20260930200115). Aqui não há nenhum.
--   * Ao ligar, o setor que já passou da meta grava o marco sem avisar.
--
-- Tabelas novas, colunas novas, funções novas; três funções remendadas.
-- Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 0. O que precisa existir ────────────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.cargos') IS NULL THEN
    RAISE EXCEPTION 'falta public.cargos (20261002173500)';
  END IF;
  IF to_regprocedure('public.fn_recebido_por_setor(uuid[], text, date, date)') IS NULL THEN
    RAISE EXCEPTION 'falta fn_recebido_por_setor (20261006230500)';
  END IF;
  IF to_regclass('public.pp_relatorio_conciliacoes') IS NULL THEN
    RAISE EXCEPTION 'falta pp_relatorio_conciliacoes';
  END IF;
  IF to_regprocedure('public.fn_push_pode_receber(uuid, uuid)') IS NULL
     OR to_regprocedure('public.fn_perfil_tem(uuid, text)') IS NULL
     OR to_regprocedure('public.fn_push_resumo_equipes()') IS NULL
     OR to_regprocedure('public.fn_push_pegar_lote(integer)') IS NULL
     OR to_regprocedure('public.fn_push_pegar_saidas(integer)') IS NULL THEN
    RAISE EXCEPTION 'faltam funções dos avisos (migrations de 30/09 e 05/10)';
  END IF;
END
$pre$;

-- ── 1. Chaves ───────────────────────────────────────────────────────────────
ALTER TABLE public.push_config
  ADD COLUMN IF NOT EXISTS avisar_meta_setor BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS resumo_setor      BOOLEAN NOT NULL DEFAULT TRUE;

-- NULL = o padrão: LIGADO (pedido de 06/10/2026). Só a gerência recebe.
ALTER TABLE public.push_preferencias
  ADD COLUMN IF NOT EXISTS setor_meta             BOOLEAN,
  ADD COLUMN IF NOT EXISTS setor_metas_equipes    BOOLEAN,
  ADD COLUMN IF NOT EXISTS setor_metas_operadores BOOLEAN,
  ADD COLUMN IF NOT EXISTS setor_resumo           BOOLEAN;

-- ── 2. Quem cuida de um setor ───────────────────────────────────────────────
-- Espelho de `supervisionamSetor` (src/lib/cargos.ts): pertence a setor, não
-- conta no recebimento, não lidera equipe, sem acesso total, sem tipo de setor
-- exclusivo, nível 4 ou mais. Sem SET: helper puro (ver 20260917160000).
CREATE OR REPLACE FUNCTION public.fn_cargo_supervisiona_setor(p_cargo TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE((
    SELECT c.pertence_a_setor
           AND NOT c.conta_no_recebimento
           AND NOT c.lidera_equipe
           AND NOT c.acesso_total
           AND c.exige_tipo_setor IS NULL
           AND COALESCE(c.nivel, 0) >= 4
      FROM public.cargos c
     WHERE c.slug = p_cargo
  ), FALSE);
$function$;

REVOKE ALL ON FUNCTION public.fn_cargo_supervisiona_setor(TEXT) FROM PUBLIC, anon, authenticated;

-- ── 3. Quem recebe cada aviso do setor ──────────────────────────────────────
-- O gerente do setor do cadastro: ativo, com aparelho, com `ver_painel_lider`
-- (a chave da tela `/m/setor`) e com a chave do aviso ligada (padrão: ligada).
CREATE OR REPLACE FUNCTION public.fn_push_destinatarios_setor(p_chave TEXT)
RETURNS TABLE(setor_id UUID, empresa_id UUID, perfil_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.setor_id, p.empresa_id, p.id
    FROM public.perfis p
    LEFT JOIN public.push_preferencias pr ON pr.perfil_id = p.id
   WHERE p.setor_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = p.id)
     AND public.fn_cargo_supervisiona_setor(p.perfil::TEXT)
     AND CASE p_chave
           WHEN 'setor_meta'             THEN COALESCE(pr.setor_meta, TRUE)
           WHEN 'setor_metas_equipes'    THEN COALESCE(pr.setor_metas_equipes, TRUE)
           WHEN 'setor_metas_operadores' THEN COALESCE(pr.setor_metas_operadores, TRUE)
           WHEN 'setor_resumo'           THEN COALESCE(pr.setor_resumo, TRUE)
           ELSE FALSE
         END
     AND public.fn_push_pode_receber(p.id, p.empresa_id)
     AND public.fn_perfil_tem(p.id, 'ver_painel_lider');
$function$;

REVOKE ALL ON FUNCTION public.fn_push_destinatarios_setor(TEXT) FROM PUBLIC, anon, authenticated;

-- Para a Edge Function: o gerente do setor de cada equipe que alcançou meta
-- (ou de quem alcançou faixa), com o nome do setor.
CREATE OR REPLACE FUNCTION public.fn_push_gerentes_das_equipes(p_equipes UUID[], p_chave TEXT)
RETURNS TABLE(equipe_id UUID, setor_id UUID, setor_nome TEXT, perfil_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.id, s.id, s.nome, d.perfil_id
    FROM public.equipes e
    JOIN public.setores s ON s.id = e.setor_id
    JOIN public.fn_push_destinatarios_setor(p_chave) d ON d.setor_id = e.setor_id
   WHERE e.id = ANY (p_equipes)
     AND p_chave IN ('setor_metas_equipes', 'setor_metas_operadores');
$function$;

REVOKE ALL ON FUNCTION public.fn_push_gerentes_das_equipes(UUID[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_gerentes_das_equipes(UUID[], TEXT) TO service_role;

-- ── 4. O recebido de cada setor (o card do Painel Líder) ────────────────────
-- `p_setores` NULL = todos os setores. Cofen: conciliação da empresa do setor,
-- em H.O. (`pp`, em centavos), pela coluna `data` — como fn_app_resumo_visoes.
CREATE OR REPLACE FUNCTION public.fn_push_recebido_dos_setores(p_setores UUID[], p_ini DATE, p_fim DATE)
RETURNS TABLE(setor_id UUID, empresa_id UUID, em_ho BOOLEAN, total NUMERIC, qtd BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  st AS (
    SELECT s.id, s.empresa_id, (s.regra = 'cofen') IS TRUE AS cofen
      FROM public.setores s
     WHERE p_setores IS NULL OR s.id = ANY (p_setores)
  ),
  np AS (
    SELECT r.setor_id, r.total, r.qtd
      FROM public.fn_recebido_por_setor(
             ARRAY(SELECT DISTINCT st.empresa_id FROM st WHERE NOT st.cofen),
             to_char(p_ini, 'YYYY-MM'), p_ini, p_fim) r
  ),
  conc AS (
    SELECT st.id AS setor_id,
           (COALESCE(SUM(c.pp), 0) / 100.0)::NUMERIC(14,2) AS total,
           COUNT(c.*)::BIGINT AS qtd
      FROM st
      LEFT JOIN public.pp_relatorio_conciliacoes c
        ON c.empresa_id = st.empresa_id
       AND c.data >= p_ini
       AND c.data <= p_fim
     WHERE st.cofen
     GROUP BY st.id
  )
  SELECT st.id, st.empresa_id, st.cofen,
         COALESCE(CASE WHEN st.cofen THEN conc.total ELSE np.total END, 0)::NUMERIC,
         COALESCE(CASE WHEN st.cofen THEN conc.qtd   ELSE np.qtd   END, 0)::BIGINT
    FROM st
    LEFT JOIN np   ON np.setor_id   = st.id
    LEFT JOIN conc ON conc.setor_id = st.id;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_recebido_dos_setores(UUID[], DATE, DATE) FROM PUBLIC, anon, authenticated;

-- Setores em 100% ou mais da meta do mês, na unidade do card.
CREATE OR REPLACE FUNCTION public.fn_push_setores_na_meta(p_mes TEXT)
RETURNS TABLE(setor_id UUID, empresa_id UUID, em_ho BOOLEAN, total NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  ref AS (SELECT to_date(p_mes || '-01', 'YYYY-MM-DD') AS ini),
  meta AS (
    SELECT DISTINCT ON (m.referencia_id) m.referencia_id AS setor_id, m.meta_valor
      FROM public.metas m, ref
     WHERE m.tipo       = 'setor'
       AND m.mes        = EXTRACT(MONTH FROM ref.ini)
       AND m.ano        = EXTRACT(YEAR  FROM ref.ini)
       AND m.meta_valor > 0
     ORDER BY m.referencia_id, m.meta_valor DESC
  ),
  receb AS (
    SELECT r.*
      FROM ref, public.fn_push_recebido_dos_setores(
             ARRAY(SELECT mt.setor_id FROM meta mt), ref.ini,
             (ref.ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE) r
  )
  SELECT r.setor_id, r.empresa_id, r.em_ho, r.total
    FROM receb r
    JOIN meta mt ON mt.setor_id = r.setor_id
   WHERE CASE WHEN r.em_ho
              THEN r.total >= ROUND(mt.meta_valor * public.fn_pp_ho_percentual(), 2)
              ELSE r.total >= mt.meta_valor
         END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_setores_na_meta(TEXT) FROM PUBLIC, anon, authenticated;

-- ── 5. Marcos e picos do setor ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_marcos_setor (
  setor_id    UUID        NOT NULL,
  mes         TEXT        NOT NULL,
  empresa_id  UUID        NOT NULL,
  batida_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'semente' (já estava na meta ao ligar, ou sem aparelho no momento) | 'avisado'
  origem      TEXT        NOT NULL DEFAULT 'avisado',
  PRIMARY KEY (setor_id, mes)
);

CREATE TABLE IF NOT EXISTS public.push_resumo_setor (
  setor_id    UUID          NOT NULL,
  dia         DATE          NOT NULL,
  pico        NUMERIC(14,2) NOT NULL DEFAULT 0,
  qtd_pico    BIGINT        NOT NULL DEFAULT 0,
  avisado_em  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (setor_id, dia)
);

ALTER TABLE public.push_marcos_setor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_resumo_setor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_marcos_setor FROM anon, authenticated;
REVOKE ALL ON public.push_resumo_setor FROM anon, authenticated;

COMMENT ON TABLE public.push_marcos_setor IS
  'Um aviso de meta batida por setor por mes, para a gerencia. Semente ao ligar (20261007120000).';
COMMENT ON TABLE public.push_resumo_setor IS
  'Resumo de hora em hora do setor para a gerencia: o maior total do dia ja avisado, '
  'na unidade do card (H.O. no Cofen). Reimportar nao avisa de novo (20261007120000).';

-- ── 6. A rodada da gerência (minuto 10 de cada hora) ────────────────────────
/*
 * Devolve { metas: [...], resumos: [...] }:
 *   • metas   — setores que alcançaram a meta AGORA. O marco é gravado para
 *               todo setor na meta, com ou sem gerente com aparelho: quem ativa
 *               depois não recebe aviso velho.
 *   • resumos — para cada setor com gerente que quer o resumo: o total de hoje;
 *               se passou do maior já avisado, avisa a diferença.
 */
CREATE OR REPLACE FUNCTION public.fn_push_rodada_setores()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje    DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_mes     TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM');
  v_cfg     public.push_config%ROWTYPE;
  v_dest    JSONB;
  v_setores UUID[];
  v_metas   JSONB := '[]'::JSONB;
  v_resumos JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO v_cfg FROM public.push_config WHERE ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('metas', v_metas, 'resumos', v_resumos);
  END IF;

  IF v_cfg.avisar_meta_setor THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('setor_id', d.setor_id, 'perfil_id', d.perfil_id)), '[]'::JSONB)
      INTO v_dest
      FROM public.fn_push_destinatarios_setor('setor_meta') d;

    WITH
    na_meta AS (
      SELECT * FROM public.fn_push_setores_na_meta(v_mes)
    ),
    novas AS (
      INSERT INTO public.push_marcos_setor (setor_id, mes, empresa_id, origem)
      SELECT n.setor_id, v_mes, n.empresa_id, 'avisado'
        FROM na_meta n
      ON CONFLICT (setor_id, mes) DO NOTHING
      RETURNING setor_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'setor_id',      s.id,
             'setor_nome',    s.nome,
             'mes',           v_mes,
             'em_ho',         n.em_ho,
             'total',         ROUND(n.total, 2),
             'destinatarios', COALESCE((SELECT jsonb_agg(DISTINCT x->'perfil_id')
                                          FROM jsonb_array_elements(v_dest) x
                                         WHERE (x->>'setor_id')::UUID = s.id), '[]'::JSONB)
           )), '[]'::JSONB)
      INTO v_metas
      FROM novas nv
      JOIN na_meta n ON n.setor_id = nv.setor_id
      JOIN public.setores s ON s.id = nv.setor_id;
  END IF;

  IF v_cfg.resumo_setor THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('setor_id', d.setor_id, 'perfil_id', d.perfil_id)), '[]'::JSONB)
      INTO v_dest
      FROM public.fn_push_destinatarios_setor('setor_resumo') d;
    SELECT ARRAY(SELECT DISTINCT (x->>'setor_id')::UUID FROM jsonb_array_elements(v_dest) x)
      INTO v_setores;

    IF COALESCE(array_length(v_setores, 1), 0) > 0 THEN
      WITH
      receb AS (
        SELECT * FROM public.fn_push_recebido_dos_setores(v_setores, v_hoje, v_hoje)
      ),
      subiu AS (
        SELECT r.setor_id, r.em_ho, ROUND(r.total, 2) AS total, r.qtd,
               COALESCE(a.pico, 0) AS pico, COALESCE(a.qtd_pico, 0) AS qtd_pico,
               a.avisado_em AS desde
          FROM receb r
          LEFT JOIN public.push_resumo_setor a ON a.setor_id = r.setor_id AND a.dia = v_hoje
         WHERE ROUND(r.total, 2) > COALESCE(a.pico, 0)
      ),
      grava AS (
        INSERT INTO public.push_resumo_setor (setor_id, dia, pico, qtd_pico, avisado_em)
        SELECT s.setor_id, v_hoje, s.total, GREATEST(s.qtd, s.qtd_pico), now()
          FROM subiu s
        ON CONFLICT (setor_id, dia) DO UPDATE
           SET pico       = EXCLUDED.pico,
               qtd_pico   = EXCLUDED.qtd_pico,
               avisado_em = EXCLUDED.avisado_em
        RETURNING setor_id
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'setor_id',      s.setor_id,
               'setor_nome',    st.nome,
               'dia',           v_hoje,
               'em_ho',         s.em_ho,
               'novo',          s.total - s.pico,
               'qtd_novos',     GREATEST(0, s.qtd - s.qtd_pico),
               'hoje',          s.total,
               'desde',         s.desde,
               'ate',           now(),
               'destinatarios', (SELECT jsonb_agg(DISTINCT x->'perfil_id')
                                   FROM jsonb_array_elements(v_dest) x
                                  WHERE (x->>'setor_id')::UUID = s.setor_id)
             )), '[]'::JSONB)
        INTO v_resumos
        FROM subiu s
        JOIN public.setores st ON st.id = s.setor_id
       WHERE EXISTS (SELECT 1 FROM grava g WHERE g.setor_id = s.setor_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('metas', v_metas, 'resumos', v_resumos);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_rodada_setores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_rodada_setores() TO service_role;
-- O mês de todos os setores com meta numa chamada só: o limite padrão da API é
-- curto. A Edge Function espera até 55 s. Recriar a função com CREATE OR
-- REPLACE apaga este SET: repita a linha.
ALTER FUNCTION public.fn_push_rodada_setores() SET statement_timeout = '45s';

-- O cron chama a Edge Function, que chama a rodada. Sem nenhum aparelho
-- inscrito não chama: só grava o marco de meta (sem aviso), para ninguém
-- receber aviso velho ao ativar depois.
CREATE OR REPLACE FUNCTION public.fn_push_setores_disparar()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg public.push_config%ROWTYPE;
  v_mes TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM');
BEGIN
  SELECT * INTO v_cfg FROM public.push_config WHERE ativo AND (resumo_setor OR avisar_meta_setor);
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_inscricoes) THEN
    INSERT INTO public.push_marcos_setor (setor_id, mes, empresa_id, origem)
    SELECT n.setor_id, v_mes, n.empresa_id, 'semente'
      FROM public.fn_push_setores_na_meta(v_mes) n
    ON CONFLICT (setor_id, mes) DO NOTHING;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_cfg.url_funcao,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-push-segredo', v_cfg.segredo),
    body    := jsonb_build_object('acao', 'resumo_setores'),
    timeout_milliseconds := 55000
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_setores_disparar() FROM PUBLIC, anon, authenticated;

-- ── 7. As preferências da pessoa: mais as quatro da gerência ────────────────
CREATE OR REPLACE FUNCTION public.fn_push_minhas_preferencias()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'fixo',             COALESCE(p.perfil = 'lider', FALSE),
    'resumo_equipe',    COALESCE(p.perfil = 'lider', FALSE) OR COALESCE(pr.resumo_equipe, FALSE),
    'metas_operadores', COALESCE(p.perfil = 'lider', FALSE) OR COALESCE(pr.metas_operadores, FALSE),
    'meta_equipe',      COALESCE(p.perfil = 'lider', FALSE) OR COALESCE(pr.meta_equipe, FALSE),
    'gerencia',               COALESCE(public.fn_cargo_supervisiona_setor(p.perfil::TEXT), FALSE),
    'setor_meta',             COALESCE(pr.setor_meta, TRUE),
    'setor_metas_equipes',    COALESCE(pr.setor_metas_equipes, TRUE),
    'setor_metas_operadores', COALESCE(pr.setor_metas_operadores, TRUE),
    'setor_resumo',           COALESCE(pr.setor_resumo, TRUE)
  )
    FROM (SELECT (SELECT auth.uid()) AS id) eu
    LEFT JOIN public.perfis p ON p.id = eu.id
    LEFT JOIN public.push_preferencias pr ON pr.perfil_id = eu.id;
$function$;

CREATE OR REPLACE FUNCTION public.fn_push_definir_preferencia(p_chave TEXT, p_ligado BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu UUID := (SELECT auth.uid());
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem sessão';
  END IF;
  IF p_chave NOT IN ('resumo_equipe', 'metas_operadores', 'meta_equipe',
                     'setor_meta', 'setor_metas_equipes', 'setor_metas_operadores', 'setor_resumo') THEN
    RAISE EXCEPTION 'preferência desconhecida: %', p_chave;
  END IF;
  INSERT INTO public.push_preferencias (perfil_id, atualizado_em) VALUES (v_eu, now())
  ON CONFLICT (perfil_id) DO NOTHING;
  UPDATE public.push_preferencias
     SET resumo_equipe          = CASE WHEN p_chave = 'resumo_equipe'          THEN p_ligado ELSE resumo_equipe END,
         metas_operadores       = CASE WHEN p_chave = 'metas_operadores'       THEN p_ligado ELSE metas_operadores END,
         meta_equipe            = CASE WHEN p_chave = 'meta_equipe'            THEN p_ligado ELSE meta_equipe END,
         setor_meta             = CASE WHEN p_chave = 'setor_meta'             THEN p_ligado ELSE setor_meta END,
         setor_metas_equipes    = CASE WHEN p_chave = 'setor_metas_equipes'    THEN p_ligado ELSE setor_metas_equipes END,
         setor_metas_operadores = CASE WHEN p_chave = 'setor_metas_operadores' THEN p_ligado ELSE setor_metas_operadores END,
         setor_resumo           = CASE WHEN p_chave = 'setor_resumo'           THEN p_ligado ELSE setor_resumo END,
         atualizado_em          = now()
   WHERE perfil_id = v_eu;
  RETURN p_ligado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_minhas_preferencias() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_push_definir_preferencia(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_push_minhas_preferencias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_definir_preferencia(TEXT, BOOLEAN) TO authenticated;

-- ── 8. Cofen só em H.O.: remendo nas funções VIVAS ──────────────────────────
-- Lê a definição que está no banco, troca só o trecho e recria. Se o trecho
-- novo já está lá, não faz nada (reexecutável); se nem o velho nem o novo
-- estão, para com erro — a função mudou e precisa ser olhada.
DO $remendo$
DECLARE
  v_def   TEXT;
  v_velho TEXT;
  v_novo  TEXT;
  v_pct   NUMERIC := public.fn_pp_ho_percentual();
  v_hoje  DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  f       TEXT;
BEGIN
  -- Pagamento e pagamento retirado: a unidade pela regra do setor da pessoa.
  v_velho := $t$(em.slug = 'pagueplay') AS em_ho,$t$;
  v_novo  := $t$COALESCE((SELECT sx.regra = 'cofen' FROM public.perfis px JOIN public.setores sx ON sx.id = px.setor_id WHERE px.id = p.perfil_id), em.slug = 'pagueplay') AS em_ho,$t$;
  FOREACH f IN ARRAY ARRAY['public.fn_push_pegar_lote(integer)', 'public.fn_push_pegar_saidas(integer)'] LOOP
    v_def := pg_get_functiondef(f::regprocedure);
    IF position(v_novo IN v_def) > 0 THEN
      RAISE NOTICE '% já decide H.O. pela regra do setor', f;
    ELSIF position(v_velho IN v_def) > 0 THEN
      IF length(v_def) - length(replace(v_def, v_velho, '')) <> length(v_velho) THEN
        RAISE EXCEPTION '% tem o trecho da unidade mais de uma vez', f;
      END IF;
      EXECUTE replace(v_def, v_velho, v_novo);
      RAISE NOTICE '% remendada: H.O. pela regra do setor', f;
    ELSE
      RAISE EXCEPTION '% mudou: trecho da unidade não encontrado', f;
    END IF;
  END LOOP;

  -- Resumo da equipe Cofen (diário): H.O. = bruto × percentual, como o app.
  f := 'public.fn_push_resumo_equipes()';
  v_def := pg_get_functiondef(f::regprocedure);
  v_velho := $t$SELECT rg.equipe_id, SUM(d.valor_recebido)::NUMERIC AS total, COUNT(*)::BIGINT AS qtd$t$;
  v_novo  := $t$SELECT rg.equipe_id, (SUM(d.valor_recebido) * public.fn_pp_ho_percentual())::NUMERIC AS total, COUNT(*)::BIGINT AS qtd$t$;
  IF position(v_novo IN v_def) > 0 THEN
    RAISE NOTICE '% já soma o Cofen em H.O.', f;
  ELSIF position(v_velho IN v_def) > 0
        AND position($t$'equipe_nome', e.nome,$t$ IN v_def) > 0 THEN
    v_def := replace(v_def, v_velho, v_novo);
    v_def := replace(v_def, $t$'equipe_nome', e.nome,$t$,
      $t$'equipe_nome', e.nome,
           'em_ho',       EXISTS (SELECT 1 FROM public.setores sx WHERE sx.id = e.setor_id AND sx.regra = 'cofen'),$t$);
    EXECUTE v_def;
    -- O pico de hoje das equipes Cofen estava em bruto: passa a H.O., senão
    -- o resumo ficaria calado até o H.O. passar do bruto já avisado.
    UPDATE public.push_resumo_equipe r
       SET pico = ROUND(r.pico * v_pct, 2)
     WHERE r.dia = v_hoje
       AND r.equipe_id IN (SELECT e.id FROM public.equipes e
                             JOIN public.setores s ON s.id = e.setor_id
                            WHERE s.regra = 'cofen');
    RAISE NOTICE '% remendada: Cofen em H.O.', f;
  ELSE
    RAISE EXCEPTION '% mudou: trecho do diário Cofen não encontrado', f;
  END IF;
END
$remendo$;

-- ── 9. Semente: setor que já está na meta não recebe aviso velho ────────────
INSERT INTO public.push_marcos_setor (setor_id, mes, empresa_id, origem)
SELECT n.setor_id, to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM'), n.empresa_id, 'semente'
  FROM public.fn_push_setores_na_meta(to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM')) n
ON CONFLICT (setor_id, mes) DO NOTHING;

-- ── 10. Agendas ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('push-resumo-setores')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-resumo-setores');
  PERFORM cron.schedule('push-resumo-setores', '10 * * * *', 'SELECT public.fn_push_setores_disparar();');

  PERFORM cron.unschedule('push-faxina-setores')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-faxina-setores');
  PERFORM cron.schedule('push-faxina-setores', '52 3 * * *',
    $sql$DELETE FROM public.push_resumo_setor WHERE dia < (now() AT TIME ZONE 'America/Sao_Paulo')::DATE - 7;$sql$);
END;
$$;

-- ── 11. Conferência ─────────────────────────────────────────────────────────
DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_push_rodada_setores()') IS NULL
     OR to_regprocedure('public.fn_push_gerentes_das_equipes(uuid[], text)') IS NULL
     OR to_regprocedure('public.fn_push_destinatarios_setor(text)') IS NULL THEN
    RAISE EXCEPTION 'funções da gerência não foram criadas';
  END IF;
  IF to_regclass('public.push_marcos_setor') IS NULL OR to_regclass('public.push_resumo_setor') IS NULL THEN
    RAISE EXCEPTION 'tabelas da gerência não foram criadas';
  END IF;
  IF has_table_privilege('authenticated', 'public.push_marcos_setor', 'SELECT')
     OR has_table_privilege('authenticated', 'public.push_resumo_setor', 'SELECT')
     OR has_function_privilege('authenticated', 'public.fn_push_rodada_setores()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_push_recebido_dos_setores(uuid[], date, date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_push_gerentes_das_equipes(uuid[], text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_push_minhas_preferencias()', 'EXECUTE') THEN
    RAISE EXCEPTION 'avisos da gerência alcançáveis pela API';
  END IF;
  IF position('regra' IN pg_get_functiondef('public.fn_push_pegar_lote(integer)'::regprocedure)) = 0
     OR position('regra' IN pg_get_functiondef('public.fn_push_pegar_saidas(integer)'::regprocedure)) = 0
     OR position('''em_ho''' IN pg_get_functiondef('public.fn_push_resumo_equipes()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'remendo do H.O. não ficou';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-resumo-setores' AND schedule = '10 * * * *') THEN
    RAISE EXCEPTION 'agenda do resumo do setor não ficou';
  END IF;
END
$guarda$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261007120000', 'push_avisos_da_gerencia', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
