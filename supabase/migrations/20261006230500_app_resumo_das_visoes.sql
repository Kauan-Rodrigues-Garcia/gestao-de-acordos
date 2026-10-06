-- ============================================================================
-- App do celular: o Resumo da equipe e do setor para quem só vê a si mesmo
-- ============================================================================
--
-- Desenho: docs/superpowers/specs/2026-10-06-app-celular-gerencia-design.md
-- §2.0. O operador ganha, no app, a primeira aba de Equipe e de Setor — o
-- Resumo: recebido do mês, recebido hoje e a meta, só do CONJUNTO. Ele tem
-- escopo individual (não lê linha de ninguém), então os totais vêm daqui,
-- calculados no banco, e só os dele:
--
--   fn_recebido_por_setor   o total de cada setor num período — o mesmo do
--                           desafio (20261006180000), que bate com o Painel:
--                           setor normal pelo carimbo da linha; alternativo
--                           pela gente dele (cadastro + clones), cada linha só
--                           se o carimbo é um setor da pessoa (BookPlay,
--                           set/2026+). Interna: só funções SECURITY DEFINER.
--
--   fn_app_resumo_visoes    a equipe (principal) e o setor de QUEM CHAMA: mês e
--                           hoje, bruto e H.O., e as metas. Nunca outra equipe
--                           ou setor, nunca nome ou linha de pessoa.
--                             equipe   fn_recebido_por_equipe (a régua do card
--                                      do Painel Líder, com ajuste manual)
--                             setor    Cofen → o relatório de conciliação, o
--                                      número do card do Painel Líder (Cleber,
--                                      06/10/2026), pela coluna `data`;
--                                      Nosso produto → fn_recebido_por_setor
--
--   fn_app_conciliacao_diaria  o dia a dia da conciliação, para o gráfico e o
--                           Hoje do setor Cofen (porta do card do Painel Líder)
--
-- Só funções. Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

-- ── 1. O total de cada setor num período ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_recebido_por_setor(
  p_empresas UUID[],
  p_mes      TEXT,
  p_ini      DATE,
  p_fim      DATE
)
RETURNS TABLE(setor_id UUID, total NUMERIC, total_ho NUMERIC, qtd BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  linhas AS (
    SELECT ar.empresa_id, ar.operador_id, ar.setor_id, ar.valor_recebido,
           COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
      LEFT JOIN public.perfis p ON p.id = ar.operador_id
     WHERE ar.empresa_id      = ANY (p_empresas)
       AND COALESCE(p.perfil, '') <> 'super_admin'
       AND ar.data_pagamento >= p_ini
       AND ar.data_pagamento <= p_fim
  ),
  setores_emp AS (
    SELECT st.id, COALESCE(st.alternativo, FALSE) AS alternativo
      FROM public.setores st
     WHERE st.empresa_id = ANY (p_empresas)
  ),
  conta_no_setor AS (
    SELECT p.setor_id, p.id AS operador_id
      FROM public.perfis p
     WHERE p.empresa_id  = ANY (p_empresas)
       AND p.setor_id   IS NOT NULL
    UNION
    SELECT e.setor_id, cl.operador_id
      FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.empresa_id        = ANY (p_empresas)
       AND cl.conta_recebimento IS TRUE
       AND e.setor_id          IS NOT NULL
  ),
  -- Os setores de cada pessoa no mês (régua de fn_analitico_resumo_por_operador):
  -- só BookPlay, de set/2026 em diante. Fora disso, vazio, e tudo conta.
  casa AS (
    SELECT sm.operador_id, sm.setor_id
      FROM public.empresas em
     CROSS JOIN LATERAL public.fn_analitico_setores_no_mes(
             em.id, p_mes,
             ARRAY(SELECT DISTINCT l.operador_id FROM linhas l
                    WHERE l.empresa_id = em.id AND l.operador_id IS NOT NULL)) sm
     WHERE em.id = ANY (p_empresas)
       AND em.slug = 'bookplay'
       AND p_mes >= '2026-09'
  ),
  receb_setor AS (
    SELECT se.id AS setor_id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND NOT se.alternativo
    UNION ALL
    SELECT c.setor_id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN conta_no_setor c  ON c.operador_id = l.operador_id
      JOIN setores_emp    se ON se.id = c.setor_id AND se.alternativo
     WHERE l.operador_id IS NOT NULL
       AND (l.setor_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa h
                        WHERE h.operador_id = l.operador_id AND h.setor_id = l.setor_id))
    UNION ALL
    SELECT se.id, l.valor_recebido, l.ho
      FROM linhas l
      JOIN setores_emp se ON se.id = l.setor_id AND se.alternativo
     WHERE l.operador_id IS NULL
  )
  SELECT r.setor_id,
         SUM(r.valor_recebido)::NUMERIC AS total,
         SUM(r.ho)::NUMERIC             AS total_ho,
         COUNT(*)::BIGINT               AS qtd
    FROM receb_setor r
   GROUP BY r.setor_id;
$function$;

COMMENT ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE) IS
  'Recebido de cada setor no periodo: normal pelo carimbo da linha; alternativo pela gente dele, '
  'so no setor da pessoa (BookPlay, set/2026+). A regra do total de setor do desafio '
  '(20261006180000). Interna: so para funcoes SECURITY DEFINER. 20261006230500.';

REVOKE ALL ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recebido_por_setor(UUID[], TEXT, DATE, DATE) TO service_role;

-- ── 2. O Resumo da equipe e do setor de quem chama ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_app_resumo_visoes(p_mes TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     UUID := auth.uid();
  v_emp     UUID;
  v_setor   UUID;
  v_equipe  UUID;
  v_ini     DATE;
  v_fim     DATE;
  v_hoje    DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_no_mes  BOOLEAN;
  v_mes_n   INTEGER;
  v_ano_n   INTEGER;
  v_regra   TEXT;
  v_eq      JSONB;
  v_st      JSONB;
  v_cfg     JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = '42501';
  END IF;
  IF p_mes IS NULL OR p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  SELECT p.empresa_id, p.setor_id INTO v_emp, v_setor
    FROM public.perfis p WHERE p.id = v_uid;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Perfil sem empresa.' USING ERRCODE = '42501';
  END IF;

  v_equipe := public.fn_equipe_principal(v_uid);
  v_ini    := (p_mes || '-01')::DATE;
  v_fim    := (v_ini + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_no_mes := v_hoje BETWEEN v_ini AND v_fim;
  v_mes_n  := EXTRACT(MONTH FROM v_ini)::INTEGER;
  v_ano_n  := EXTRACT(YEAR  FROM v_ini)::INTEGER;

  -- Equipe: a régua do card do Painel Líder (com ajuste manual).
  IF v_equipe IS NOT NULL THEN
    SELECT jsonb_build_object(
             'id',         e.id,
             'nome',       e.nome,
             'recebido',   COALESCE(m.total, 0),
             'recebido_ho', COALESCE(m.total_ho, 0),
             'hoje',       COALESCE(h.total, 0),
             'hoje_ho',    COALESCE(h.total_ho, 0),
             'qtd_hoje',   COALESCE(h.qtd, 0),
             'meta',       (SELECT mt.meta_valor FROM public.metas mt
                             WHERE mt.empresa_id = v_emp AND mt.tipo = 'equipe'
                               AND mt.referencia_id = e.id AND mt.mes = v_mes_n AND mt.ano = v_ano_n
                               AND mt.meta_valor > 0 LIMIT 1))
      INTO v_eq
      FROM public.equipes e
      LEFT JOIN LATERAL (
        SELECT r.total, r.total_ho FROM public.fn_recebido_por_equipe(ARRAY[v_emp], p_mes, v_ini, v_fim, TRUE) r
         WHERE r.equipe_id = e.id) m ON TRUE
      LEFT JOIN LATERAL (
        SELECT r.total, r.total_ho, r.qtd FROM public.fn_recebido_por_equipe(ARRAY[v_emp], p_mes, v_hoje, v_hoje, FALSE) r
         WHERE v_no_mes AND r.equipe_id = e.id) h ON TRUE
     WHERE e.id = v_equipe;
  END IF;

  -- Setor: Cofen pela conciliação; Nosso produto por fn_recebido_por_setor.
  IF v_setor IS NOT NULL THEN
    SELECT s.regra INTO v_regra FROM public.setores s WHERE s.id = v_setor;
    IF v_regra = 'cofen' THEN
      SELECT jsonb_build_object(
               'recebido',    (COALESCE(SUM(c.total), 0) / 100.0)::NUMERIC(14,2),
               'recebido_ho', (COALESCE(SUM(c.pp), 0) / 100.0)::NUMERIC(14,2),
               'hoje',        (COALESCE(SUM(c.total) FILTER (WHERE c.data = v_hoje), 0) / 100.0)::NUMERIC(14,2),
               'hoje_ho',     (COALESCE(SUM(c.pp)    FILTER (WHERE c.data = v_hoje), 0) / 100.0)::NUMERIC(14,2),
               'qtd_hoje',    COUNT(*) FILTER (WHERE c.data = v_hoje))
        INTO v_st
        FROM public.pp_relatorio_conciliacoes c
       WHERE c.empresa_id = v_emp
         AND c.data >= v_ini AND c.data <= v_fim;
    ELSE
      SELECT jsonb_build_object(
               'recebido',    COALESCE(m.total, 0),
               'recebido_ho', COALESCE(m.total_ho, 0),
               'hoje',        COALESCE(h.total, 0),
               'hoje_ho',     COALESCE(h.total_ho, 0),
               'qtd_hoje',    COALESCE(h.qtd, 0))
        INTO v_st
        FROM (SELECT 1) um
        LEFT JOIN LATERAL (
          SELECT r.total, r.total_ho FROM public.fn_recebido_por_setor(ARRAY[v_emp], p_mes, v_ini, v_fim) r
           WHERE r.setor_id = v_setor) m ON TRUE
        LEFT JOIN LATERAL (
          SELECT r.total, r.total_ho, r.qtd FROM public.fn_recebido_por_setor(ARRAY[v_emp], p_mes, v_hoje, v_hoje) r
           WHERE v_no_mes AND r.setor_id = v_setor) h ON TRUE;
    END IF;

    SELECT v_st || jsonb_build_object(
             'id',    s.id,
             'nome',  s.nome,
             'regra', COALESCE(s.regra, 'nosso_produto'),
             'meta',  (SELECT mt.meta_valor FROM public.metas mt
                        WHERE mt.empresa_id = v_emp AND mt.tipo = 'setor'
                          AND mt.referencia_id = s.id AND mt.mes = v_mes_n AND mt.ano = v_ano_n
                          AND mt.meta_valor > 0 LIMIT 1))
      INTO v_st
      FROM public.setores s WHERE s.id = v_setor;
  END IF;

  SELECT jsonb_build_object(
           'feriados',         COALESCE(c.feriados, '[]'::JSONB),
           'contar_dia_atual', COALESCE(c.contar_dia_atual, FALSE))
    INTO v_cfg
    FROM public.metas_config_mes c
   WHERE c.empresa_id = v_emp AND c.mes = v_mes_n AND c.ano = v_ano_n
   LIMIT 1;

  RETURN jsonb_build_object(
    'mes',    p_mes,
    'hoje',   CASE WHEN v_no_mes THEN v_hoje END,
    'equipe', v_eq,
    'setor',  v_st,
    'config', COALESCE(v_cfg, jsonb_build_object('feriados', '[]'::JSONB, 'contar_dia_atual', FALSE))
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_app_resumo_visoes(TEXT) IS
  'Resumo da equipe principal e do setor de QUEM CHAMA (app do celular, operador): mes e hoje, bruto e H.O., '
  'metas. Setor Cofen pelo relatorio de conciliacao (o card do Painel Lider). Sem nome nem linha de pessoa. '
  '20261006230500.';

REVOKE ALL ON FUNCTION public.fn_app_resumo_visoes(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_app_resumo_visoes(TEXT) TO authenticated, service_role;
ALTER FUNCTION public.fn_app_resumo_visoes(TEXT) SET statement_timeout = '15s';

-- ── 3. O dia a dia da conciliação (gráfico e Hoje do setor Cofen) ─────────
--
-- O total do setor Cofen é o da conciliação; o dia a dia tem de ser também, ou
-- o gráfico não fecha com o card. Mesma porta de `private.pp_conciliacao_setor`
-- (20260911231007): ver_painel_lider + desempenho de equipes + escopo de setor,
-- e o setor tem de ser o de quem chama.

CREATE OR REPLACE FUNCTION public.fn_app_conciliacao_diaria(p_empresa_id UUID, p_mes TEXT)
RETURNS TABLE(dia INTEGER, bruto NUMERIC, ho NUMERIC, qtd BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ini     DATE;
  v_setores UUID[];
  v_escopo  INTEGER;
BEGIN
  IF auth.uid() IS NULL
     OR NOT COALESCE(public.fn_can_access_empresa(p_empresa_id), FALSE)
     OR NOT COALESCE(public.fn_user_tem('ver_painel_lider'), FALSE)
     OR NOT COALESCE(public.fn_user_tem('painel_lider_sub_desempenho_equipes'), FALSE) THEN
    RAISE EXCEPTION 'Sem acesso à conciliação do setor' USING ERRCODE = '42501';
  END IF;
  v_escopo := public.fn_user_escopo('painel_lider');
  IF COALESCE(v_escopo, -1) < 2 THEN
    RAISE EXCEPTION 'Sem acesso ao acumulado do setor' USING ERRCODE = '42501';
  END IF;
  IF p_mes IS NULL OR p_mes !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'mes invalido: %', p_mes;
  END IF;
  SELECT array_agg(s.id) INTO v_setores FROM public.setores s
   WHERE s.empresa_id = p_empresa_id AND s.regra = 'cofen' AND NOT COALESCE(s.alternativo, FALSE);
  IF COALESCE(cardinality(v_setores), 0) <> 1 THEN
    RAISE EXCEPTION 'A conciliação precisa de um único setor Cofen configurado';
  END IF;
  IF v_escopo = 2 AND NOT EXISTS (
    SELECT 1 FROM public.perfis p WHERE p.id = auth.uid() AND p.setor_id = v_setores[1]) THEN
    RAISE EXCEPTION 'Sem acesso ao setor da conciliação' USING ERRCODE = '42501';
  END IF;
  v_ini := (p_mes || '-01')::DATE;
  RETURN QUERY
    SELECT EXTRACT(DAY FROM c.data)::INTEGER,
           (SUM(c.total) / 100.0)::NUMERIC(14,2),
           (SUM(c.pp)    / 100.0)::NUMERIC(14,2),
           COUNT(*)::BIGINT
      FROM public.pp_relatorio_conciliacoes c
     WHERE c.empresa_id = p_empresa_id
       AND c.data >= v_ini AND c.data < (v_ini + INTERVAL '1 month')::DATE
     GROUP BY 1
     ORDER BY 1;
END;
$function$;

COMMENT ON FUNCTION public.fn_app_conciliacao_diaria(UUID, TEXT) IS
  'O relatorio de conciliacao do setor Cofen dia a dia (bruto, H.O., quantidade), pela coluna data. '
  'Porta de pp_conciliacao_setor. Grafico e Hoje do setor Cofen no app. 20261006230500.';

REVOKE ALL ON FUNCTION public.fn_app_conciliacao_diaria(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_app_conciliacao_diaria(UUID, TEXT) TO authenticated, service_role;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF has_function_privilege('authenticated', 'public.fn_recebido_por_setor(uuid[],text,date,date)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_recebido_por_setor ficou aberta para quem tem login.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_app_resumo_visoes(text)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_app_resumo_visoes(text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Permissões de fn_app_resumo_visoes erradas.';
  END IF;
END
$prova$;

COMMIT;
