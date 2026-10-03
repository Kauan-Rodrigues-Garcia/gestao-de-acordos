-- ============================================================================
-- Painel Diretoria: a Visão geral por cidade, o resumo do dia e a carteira
-- sem setor com cidade e regra
-- ============================================================================
--
-- ## Por que
--
-- A Visão geral nova separa o recebido do 59 por cidade (Birigui, Marília) e
-- abre o resumo de qualquer dia do mês, setor por setor. Pedido do Cleber em
-- 03/10/2026, com uma regra: «mesmo que o setor não esteja vinculado com algum
-- setor da planilha, deve contar o recebimento nesse card».
--
-- Medido em outubro/2026: três carteiras do 59 não têm setor — MARILIA - COFEN
-- (cód. 72, R$ 213 mil), COBRANÇA - GERAL (cód. 37) e COB PLAY - EM DIA
-- (cód. 61). A MARILIA - COFEN é o dinheiro do Conecta Play, que é setor da
-- PaguePlay — e o 59 é da BookPlay, então ela não tem setor para onde ir.
--
-- ## A cidade (e a regra) de cada real
--
-- A cidade é da CARTEIRA, e cada linha do 59 tem uma carteira só. Por isso
-- Birigui + Marília + «sem cidade» fecham o total da empresa, centavo por
-- centavo. Somar setores não fecharia: o Integral conta em dois setores e o
-- colchão em nenhum.
--
--   carteira vinculada a setor   cidade e regra do SETOR (um lugar só decide)
--   carteira sem setor           cidade e regra escolhidas no painel, aqui
--   nem uma coisa nem outra      «sem cidade», até alguém escolher
--
-- A regra (`nosso_produto` ou `cofen`) muda a leitura: na Cofen o que fica com
-- a operação é o H.O., e o resto é repasse. O painel mostra a carteira Cofen
-- com essa estrutura; o banco só diz qual é a regra.
--
-- ## O que esta migration cria
--
--   1. `mestre_grupos.cidade_id`, `regra`, quem classificou e quando.
--   2. `fn_mestre_diretoria_cidades` — o mês por cidade (e o geral), numa
--      chamada: total, mesmo corte do mês anterior, pagamentos, operadores,
--      colchão, série diária, formas e as carteiras com a cidade de cada uma.
--   3. `fn_mestre_diretoria_dia` — um dia: total do escopo, formas, cada setor
--      (com a atribuição de `fn_mestre_diretoria_linhas`, a mesma da aba
--      Setores e equipes), carteiras sem setor e o que conta só no geral.
--   4. `fn_mestre_carteira_classificar` — grava cidade e regra de uma carteira
--      sem setor. Porta: a chave `painel_diretoria_definir_carteira` (nova no
--      catálogo, ligada de fábrica para a diretoria) ou o super_admin.
--
-- As duas leituras seguem a otimização de 20260917160000: o lote vigente pelo
-- `lote_id`, só as colunas usadas, agregação por `group by`.
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. Cidade e regra da carteira ───────────────────────────────────────────

ALTER TABLE public.mestre_grupos ADD COLUMN IF NOT EXISTS cidade_id UUID;
ALTER TABLE public.mestre_grupos ADD COLUMN IF NOT EXISTS regra TEXT;
ALTER TABLE public.mestre_grupos ADD COLUMN IF NOT EXISTS classificada_por_id UUID
  REFERENCES public.perfis (id) ON DELETE SET NULL;
ALTER TABLE public.mestre_grupos ADD COLUMN IF NOT EXISTS classificada_em TIMESTAMPTZ;

DO $restricoes$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.mestre_grupos'::REGCLASS AND conname = 'mestre_grupos_regra_check'
  ) THEN
    ALTER TABLE public.mestre_grupos
      ADD CONSTRAINT mestre_grupos_regra_check CHECK (regra IS NULL OR regra IN ('nosso_produto', 'cofen'));
  END IF;
  -- Composta com a empresa, como `setores_cidade_fkey`: o banco recusa
  -- cidade de outra empresa.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.mestre_grupos'::REGCLASS AND conname = 'mestre_grupos_cidade_fkey'
  ) THEN
    ALTER TABLE public.mestre_grupos
      ADD CONSTRAINT mestre_grupos_cidade_fkey FOREIGN KEY (cidade_id, empresa_id)
      REFERENCES public.rh_celulas (id, empresa_id) ON DELETE RESTRICT;
  END IF;
END
$restricoes$;

COMMENT ON COLUMN public.mestre_grupos.cidade_id IS
  'Cidade da carteira SEM setor (escolhida no Painel Diretoria). Carteira vinculada segue a cidade do setor e ignora esta.';
COMMENT ON COLUMN public.mestre_grupos.regra IS
  'Regra de negocio da carteira SEM setor: nosso_produto ou cofen. Carteira vinculada segue a regra do setor.';

-- ── 2. O mês por cidade ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_cidades(
  p_empresa_id UUID,
  p_mes        TEXT,                 -- 'yyyy-MM'
  p_dia_corte  INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes      DATE;
  v_mes_ant  DATE;
  v_lote     UUID;
  v_lote_ant UUID;
  v_corte    INTEGER;
  v_ult_dia  INTEGER;
  v_hoje     DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
BEGIN
  IF NOT (fn_user_is_super_admin() OR fn_can_access_empresa(p_empresa_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.';
  END IF;
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  v_mes     := (p_mes || '-01')::DATE;
  v_mes_ant := v_mes - INTERVAL '1 month';
  v_ult_dia := extract(day FROM (v_mes + INTERVAL '1 month - 1 day'))::INTEGER;
  -- O mesmo corte da Visão geral de sempre (fn_mestre_diretoria_visao_geral).
  v_corte := coalesce(
    p_dia_corte,
    CASE WHEN date_trunc('month', v_hoje) = v_mes THEN extract(day FROM v_hoje)::INTEGER ELSE v_ult_dia END
  );
  v_corte := greatest(1, least(v_corte, v_ult_dia));

  SELECT id INTO v_lote FROM mestre_lotes
   WHERE empresa_id = p_empresa_id AND mes = v_mes AND estado = 'vigente' LIMIT 1;
  SELECT id INTO v_lote_ant FROM mestre_lotes
   WHERE empresa_id = p_empresa_id AND mes = v_mes_ant AND estado = 'vigente' LIMIT 1;

  RETURN (
    WITH
    -- A cidade e a regra de cada carteira: do setor, se vinculada; senão as
    -- escolhidas no painel. Uma linha por carteira, para nenhuma junção
    -- abaixo contar o mesmo dinheiro duas vezes.
    carteira AS (
      SELECT g.cod_grupo_filtro AS cod,
             max(g.estado) AS estado,
             max(CASE WHEN g.estado = 'vinculado' THEN g.setor_id::TEXT END)::UUID AS setor_id,
             max(CASE WHEN g.estado = 'vinculado' AND g.setor_id IS NOT NULL THEN s.cidade_id::TEXT
                      ELSE g.cidade_id::TEXT END)::UUID AS cidade_id,
             max(CASE WHEN g.estado = 'vinculado' AND g.setor_id IS NOT NULL THEN s.regra ELSE g.regra END) AS regra,
             max(CASE WHEN g.estado = 'vinculado' THEN s.nome END) AS setor_nome
        FROM mestre_grupos g
        LEFT JOIN setores s ON s.id = g.setor_id
       WHERE g.empresa_id = p_empresa_id
       GROUP BY g.cod_grupo_filtro
    ),
    atual AS MATERIALIZED (
      SELECT r.cod_grupo_filtro AS cod, r.nome_grupo_filtro AS nome, r.cobradora, r.tp_doc,
             r.recebido, r.colchao, r.dt_pgto, extract(day FROM r.dt_pgto)::INTEGER AS dia, c.cidade_id
        FROM mestre_recebimentos r
        LEFT JOIN carteira c ON c.cod = r.cod_grupo_filtro
       WHERE r.lote_id = v_lote
         AND extract(day FROM r.dt_pgto) <= v_corte
    ),
    -- O mês anterior INTEIRO: o mesmo corte sai daqui por filtro, e a média
    -- diária do mês fechado também.
    anterior AS MATERIALIZED (
      SELECT r.cod_grupo_filtro AS cod, r.recebido, extract(day FROM r.dt_pgto)::INTEGER AS dia, c.cidade_id
        FROM mestre_recebimentos r
        LEFT JOIN carteira c ON c.cod = r.cod_grupo_filtro
       WHERE r.lote_id = v_lote_ant
    ),
    -- As cidades da empresa que têm setor ou carteira: um cartão para cada,
    -- mesmo zerado no mês. «Sem cidade» só aparece quando tem dinheiro.
    cidades AS (
      SELECT c.id AS cidade_id, c.nome
        FROM rh_celulas c
       WHERE c.empresa_id = p_empresa_id
         AND (EXISTS (SELECT 1 FROM setores s WHERE s.empresa_id = p_empresa_id AND s.cidade_id = c.id AND s.ativo)
              OR EXISTS (SELECT 1 FROM carteira k WHERE k.cidade_id = c.id))
      UNION ALL
      SELECT NULL::UUID, NULL::TEXT
       WHERE EXISTS (SELECT 1 FROM atual WHERE cidade_id IS NULL)
          OR EXISTS (SELECT 1 FROM anterior WHERE cidade_id IS NULL AND dia <= v_corte)
    ),
    tot AS (
      SELECT cidade_id,
             sum(recebido)::NUMERIC(14,2) AS v,
             count(*)::BIGINT AS n,
             count(DISTINCT cobradora) FILTER (WHERE btrim(cobradora) <> '')::BIGINT AS ops,
             coalesce(sum(recebido) FILTER (WHERE NOT fn_mestre_conta_na_meta(colchao, dt_pgto)), 0)::NUMERIC(14,2) AS colchao
        FROM atual GROUP BY cidade_id
    ),
    ant AS (
      SELECT cidade_id,
             coalesce(sum(recebido) FILTER (WHERE dia <= v_corte), 0)::NUMERIC(14,2) AS ate_corte,
             sum(recebido)::NUMERIC(14,2) AS v_mes,
             count(DISTINCT dia)::INTEGER AS dias
        FROM anterior GROUP BY cidade_id
    ),
    serie_a AS (SELECT cidade_id, dia, sum(recebido)::NUMERIC(14,2) AS v FROM atual GROUP BY 1, 2),
    serie_b AS (SELECT cidade_id, dia, sum(recebido)::NUMERIC(14,2) AS v FROM anterior GROUP BY 1, 2),
    formas AS (
      SELECT cidade_id, coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') AS forma,
             sum(recebido)::NUMERIC(14,2) AS v, count(*)::BIGINT AS q
        FROM atual GROUP BY 1, 2
    ),
    -- O geral, pelas mesmas linhas.
    tot_g AS (
      SELECT coalesce(sum(recebido), 0)::NUMERIC(14,2) AS v, count(*)::BIGINT AS n,
             count(DISTINCT cobradora) FILTER (WHERE btrim(cobradora) <> '')::BIGINT AS ops,
             coalesce(sum(recebido) FILTER (WHERE NOT fn_mestre_conta_na_meta(colchao, dt_pgto)), 0)::NUMERIC(14,2) AS colchao
        FROM atual
    ),
    ant_g AS (
      SELECT coalesce(sum(recebido) FILTER (WHERE dia <= v_corte), 0)::NUMERIC(14,2) AS ate_corte,
             coalesce(sum(recebido), 0)::NUMERIC(14,2) AS v_mes,
             count(DISTINCT dia)::INTEGER AS dias
        FROM anterior
    ),
    serie_ga AS (SELECT dia, sum(recebido)::NUMERIC(14,2) AS v FROM atual GROUP BY 1),
    serie_gb AS (SELECT dia, sum(recebido)::NUMERIC(14,2) AS v FROM anterior GROUP BY 1),
    formas_g AS (
      SELECT coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') AS forma,
             sum(recebido)::NUMERIC(14,2) AS v, count(*)::BIGINT AS q
        FROM atual GROUP BY 1
    ),
    dias AS (SELECT generate_series(1, v_ult_dia) AS d),
    cart AS (
      SELECT a.cod, max(a.nome) AS nome, sum(a.recebido)::NUMERIC(14,2) AS v, count(*)::BIGINT AS n,
             count(DISTINCT a.cobradora) FILTER (WHERE btrim(a.cobradora) <> '')::BIGINT AS ops
        FROM atual a GROUP BY a.cod
    ),
    cart_ant AS (
      SELECT cod, sum(recebido)::NUMERIC(14,2) AS v FROM anterior WHERE dia <= v_corte GROUP BY cod
    )
    SELECT jsonb_build_object(
      'mes',               p_mes,
      'mes_anterior',      to_char(v_mes_ant, 'YYYY-MM'),
      'dia_corte',         v_corte,
      'dias_no_mes',       v_ult_dia,
      'tem_lote',          v_lote IS NOT NULL,
      'tem_lote_anterior', v_lote_ant IS NOT NULL,
      'geral', (
        SELECT jsonb_build_object(
          'valor', t.v, 'linhas', t.n, 'operadores', t.ops, 'colchao', t.colchao,
          'valor_anterior', a.ate_corte, 'mes_anterior_total', a.v_mes, 'mes_anterior_dias', a.dias,
          'serie', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'dia', d.d,
                      'valor', CASE WHEN d.d <= v_corte THEN coalesce(sa.v, 0) ELSE 0 END,
                      'valor_anterior', CASE WHEN d.d <= v_corte THEN coalesce(sb.v, 0) ELSE 0 END,
                      'dentro_do_corte', d.d <= v_corte) ORDER BY d.d), '[]'::JSONB)
                      FROM dias d
                      LEFT JOIN serie_ga sa ON sa.dia = d.d
                      LEFT JOIN serie_gb sb ON sb.dia = d.d),
          'formas', (SELECT coalesce(jsonb_agg(jsonb_build_object('forma', f.forma, 'valor', f.v, 'qtd', f.q)
                       ORDER BY f.v DESC), '[]'::JSONB) FROM formas_g f))
          FROM tot_g t CROSS JOIN ant_g a
      ),
      'cidades', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'cidade_id', c.cidade_id, 'nome', c.nome,
          'valor', coalesce(t.v, 0), 'linhas', coalesce(t.n, 0), 'operadores', coalesce(t.ops, 0),
          'colchao', coalesce(t.colchao, 0),
          'valor_anterior', coalesce(a.ate_corte, 0), 'mes_anterior_total', coalesce(a.v_mes, 0),
          'mes_anterior_dias', coalesce(a.dias, 0),
          'serie', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'dia', d.d,
                      'valor', CASE WHEN d.d <= v_corte THEN coalesce(sa.v, 0) ELSE 0 END,
                      'valor_anterior', CASE WHEN d.d <= v_corte THEN coalesce(sb.v, 0) ELSE 0 END,
                      'dentro_do_corte', d.d <= v_corte) ORDER BY d.d), '[]'::JSONB)
                      FROM dias d
                      LEFT JOIN serie_a sa ON sa.dia = d.d AND sa.cidade_id IS NOT DISTINCT FROM c.cidade_id
                      LEFT JOIN serie_b sb ON sb.dia = d.d AND sb.cidade_id IS NOT DISTINCT FROM c.cidade_id),
          'formas', (SELECT coalesce(jsonb_agg(jsonb_build_object('forma', f.forma, 'valor', f.v, 'qtd', f.q)
                       ORDER BY f.v DESC), '[]'::JSONB)
                       FROM formas f WHERE f.cidade_id IS NOT DISTINCT FROM c.cidade_id)
        ) ORDER BY c.nome NULLS LAST), '[]'::JSONB)
          FROM cidades c
          LEFT JOIN tot t ON t.cidade_id IS NOT DISTINCT FROM c.cidade_id
          LEFT JOIN ant a ON a.cidade_id IS NOT DISTINCT FROM c.cidade_id
      ),
      'carteiras', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'cod', ca.cod, 'nome', ca.nome, 'valor', ca.v, 'linhas', ca.n, 'operadores', ca.ops,
          'valor_anterior', coalesce(cb.v, 0),
          'estado', coalesce(k.estado, 'novo'), 'setor_id', k.setor_id, 'setor_nome', k.setor_nome,
          'cidade_id', k.cidade_id, 'regra', k.regra
        ) ORDER BY ca.v DESC), '[]'::JSONB)
          FROM cart ca
          LEFT JOIN cart_ant cb ON cb.cod = ca.cod
          LEFT JOIN carteira k ON k.cod = ca.cod
      )
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_mestre_diretoria_cidades(UUID, TEXT, INTEGER) IS
  'O mes do 59 por cidade e o geral, no corte da Visao geral. A cidade e da CARTEIRA (do setor vinculado, '
  'ou a escolhida em mestre_grupos), entao as cidades fecham o total. Colchao entra, como no total da empresa. '
  '20261003170000.';

-- ── 3. Um dia ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_dia(
  p_empresa_id UUID,
  p_mes        TEXT,                 -- 'yyyy-MM'
  p_dia        INTEGER,
  p_escopo     TEXT DEFAULT NULL,    -- null/'geral', 'sem_cidade' ou o id da cidade
  p_dia_corte  INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes      DATE;
  v_mes_ant  DATE;
  v_lote     UUID;
  v_lote_ant UUID;
  v_corte    INTEGER;
  v_ult_dia  INTEGER;
  v_hoje     DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_geral    BOOLEAN := p_escopo IS NULL OR p_escopo = 'geral';
  v_sem      BOOLEAN := p_escopo = 'sem_cidade';
  v_cidade   UUID;
BEGIN
  IF NOT (fn_user_is_super_admin() OR fn_can_access_empresa(p_empresa_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.';
  END IF;
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;
  IF NOT v_geral AND NOT v_sem THEN
    IF p_escopo !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'escopo invalido: %', p_escopo;
    END IF;
    v_cidade := p_escopo::UUID;
  END IF;

  v_mes     := (p_mes || '-01')::DATE;
  v_mes_ant := v_mes - INTERVAL '1 month';
  v_ult_dia := extract(day FROM (v_mes + INTERVAL '1 month - 1 day'))::INTEGER;
  IF p_dia IS NULL OR p_dia < 1 OR p_dia > v_ult_dia THEN
    RAISE EXCEPTION 'dia invalido: %', p_dia;
  END IF;
  v_corte := coalesce(
    p_dia_corte,
    CASE WHEN date_trunc('month', v_hoje) = v_mes THEN extract(day FROM v_hoje)::INTEGER ELSE v_ult_dia END
  );
  v_corte := greatest(1, least(v_corte, v_ult_dia));

  SELECT id INTO v_lote FROM mestre_lotes
   WHERE empresa_id = p_empresa_id AND mes = v_mes AND estado = 'vigente' LIMIT 1;
  SELECT id INTO v_lote_ant FROM mestre_lotes
   WHERE empresa_id = p_empresa_id AND mes = v_mes_ant AND estado = 'vigente' LIMIT 1;

  RETURN (
    WITH
    carteira AS (
      SELECT g.cod_grupo_filtro AS cod, max(g.nome_grupo_filtro) AS nome,
             max(CASE WHEN g.estado = 'vinculado' AND g.setor_id IS NOT NULL THEN s.cidade_id::TEXT
                      ELSE g.cidade_id::TEXT END)::UUID AS cidade_id,
             max(CASE WHEN g.estado = 'vinculado' AND g.setor_id IS NOT NULL THEN s.regra ELSE g.regra END) AS regra
        FROM mestre_grupos g
        LEFT JOIN setores s ON s.id = g.setor_id
       WHERE g.empresa_id = p_empresa_id
       GROUP BY g.cod_grupo_filtro
    ),
    -- As linhas cruas do dia: o total, as formas e o colchão saem daqui, com a
    -- cidade da carteira — a mesma régua do cartão da cidade.
    brutas AS MATERIALIZED (
      SELECT r.cobradora, r.tp_doc, r.recebido, r.colchao, r.dt_pgto, c.cidade_id
        FROM mestre_recebimentos r
        LEFT JOIN carteira c ON c.cod = r.cod_grupo_filtro
       WHERE r.lote_id = v_lote AND extract(day FROM r.dt_pgto) = p_dia
    ),
    escopo AS (
      SELECT * FROM brutas b
       WHERE v_geral OR (v_sem AND b.cidade_id IS NULL) OR b.cidade_id = v_cidade
    ),
    ant_escopo AS (
      SELECT extract(day FROM r.dt_pgto)::INTEGER AS dia, r.recebido
        FROM mestre_recebimentos r
        LEFT JOIN carteira c ON c.cod = r.cod_grupo_filtro
       WHERE r.lote_id = v_lote_ant
         AND (v_geral OR (v_sem AND c.cidade_id IS NULL) OR c.cidade_id = v_cidade)
    ),
    -- A atribuição a setor da aba Setores e equipes, no mês até o corte (para
    -- a média do setor) — colchão fora, Integral contando no destino.
    linhas AS MATERIALIZED (
      SELECT l.setor_id, l.cod_grupo_filtro AS cod, l.cobradora, l.recebido, l.origem,
             extract(day FROM l.dt_pgto)::INTEGER AS dia
        FROM fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte) l
    ),
    setor_info AS (
      SELECT s.id, s.nome, s.cidade_id, s.regra FROM setores s WHERE s.empresa_id = p_empresa_id
    ),
    -- Uma «unidade» é um setor ou, sem setor, uma carteira.
    unidades AS (
      SELECT CASE WHEN l.setor_id IS NOT NULL THEN 'setor'
                  WHEN l.origem = 'somente_geral' THEN 'somente_geral'
                  ELSE 'sem_setor' END AS tipo,
             coalesce(l.setor_id::TEXT, l.cod) AS chave,
             l.setor_id, l.cod, l.cobradora, l.recebido, l.dia
        FROM linhas l
    ),
    unidades_escopo AS (
      SELECT u.*,
             coalesce(si.nome, k.nome)          AS nome,
             CASE WHEN u.setor_id IS NOT NULL THEN si.cidade_id ELSE k.cidade_id END AS cidade_id,
             CASE WHEN u.setor_id IS NOT NULL THEN si.regra ELSE k.regra END         AS regra
        FROM unidades u
        LEFT JOIN setor_info si ON si.id = u.setor_id
        LEFT JOIN carteira k ON k.cod = u.cod AND u.setor_id IS NULL
    ),
    filtradas AS (
      SELECT * FROM unidades_escopo ue
       WHERE v_geral OR (v_sem AND ue.cidade_id IS NULL) OR ue.cidade_id = v_cidade
    ),
    no_dia AS (
      SELECT tipo, chave, max(setor_id::TEXT)::UUID AS setor_id, max(cod) AS cod, max(nome) AS nome,
             max(cidade_id::TEXT)::UUID AS cidade_id, max(regra) AS regra,
             sum(recebido)::NUMERIC(14,2) AS v, count(*)::BIGINT AS n,
             count(DISTINCT cobradora) FILTER (WHERE btrim(cobradora) <> '')::BIGINT AS ops
        FROM filtradas WHERE dia = p_dia
       GROUP BY tipo, chave
    ),
    -- Média do setor por dia COM recebimento, no mês até o corte.
    media AS (
      SELECT tipo, chave, (sum(recebido) / nullif(count(DISTINCT dia), 0))::NUMERIC(14,2) AS m
        FROM filtradas GROUP BY tipo, chave
    ),
    por_pessoa AS (
      SELECT tipo, chave, cobradora, sum(recebido)::NUMERIC(14,2) AS v
        FROM filtradas WHERE dia = p_dia AND btrim(cobradora) <> ''
       GROUP BY tipo, chave, cobradora
    ),
    destaque AS (
      SELECT DISTINCT ON (tipo, chave) tipo, chave, cobradora, v
        FROM por_pessoa ORDER BY tipo, chave, v DESC, cobradora
    ),
    -- O nome da pessoa no mês (retrato), o de hoje como reserva, e o login do
    -- 59 quando não há cadastro.
    -- O cadastro de cada login do 59, numa passada só pelo lote.
    pessoa_do_login AS (
      SELECT r.cobradora,
             (array_agg(r.operador_id) FILTER (WHERE r.operador_id IS NOT NULL))[1] AS operador_id
        FROM mestre_recebimentos r
       WHERE r.lote_id = v_lote AND r.cobradora IN (SELECT cobradora FROM destaque)
       GROUP BY r.cobradora
    ),
    nomes AS (
      SELECT d.tipo, d.chave,
             coalesce(cm.nome, p.nome, d.cobradora) AS nome
        FROM destaque d
        LEFT JOIN pessoa_do_login o ON o.cobradora = d.cobradora
        LEFT JOIN composicao_mes cm
          ON cm.empresa_id = p_empresa_id AND cm.mes = p_mes AND cm.operador_id = o.operador_id
        LEFT JOIN perfis p ON p.id = o.operador_id
    ),
    tot AS (
      SELECT coalesce(sum(recebido), 0)::NUMERIC(14,2) AS v, count(*)::BIGINT AS n,
             count(DISTINCT cobradora) FILTER (WHERE btrim(cobradora) <> '')::BIGINT AS ops,
             coalesce(sum(recebido) FILTER (WHERE NOT fn_mestre_conta_na_meta(colchao, dt_pgto)), 0)::NUMERIC(14,2) AS colchao
        FROM escopo
    ),
    formas AS (
      SELECT coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') AS forma,
             sum(recebido)::NUMERIC(14,2) AS v, count(*)::BIGINT AS q
        FROM escopo GROUP BY 1
    )
    SELECT jsonb_build_object(
      'mes', p_mes, 'dia', p_dia, 'dia_corte', v_corte,
      'escopo', CASE WHEN v_geral THEN 'geral' WHEN v_sem THEN 'sem_cidade' ELSE v_cidade::TEXT END,
      'total', (SELECT jsonb_build_object('valor', v, 'linhas', n, 'operadores', ops, 'colchao', colchao) FROM tot),
      'mesmo_dia_anterior', (SELECT coalesce(sum(recebido), 0)::NUMERIC(14,2) FROM ant_escopo WHERE dia = p_dia),
      'media_dia_anterior', (SELECT coalesce((sum(recebido) / nullif(count(DISTINCT dia), 0))::NUMERIC(14,2), 0) FROM ant_escopo),
      'formas', (SELECT coalesce(jsonb_agg(jsonb_build_object('forma', forma, 'valor', v, 'qtd', q) ORDER BY v DESC), '[]'::JSONB) FROM formas),
      'unidades', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'tipo', d.tipo, 'setor_id', d.setor_id, 'cod', CASE WHEN d.setor_id IS NULL THEN d.cod END,
          'nome', d.nome, 'cidade_id', d.cidade_id, 'regra', d.regra,
          'valor', d.v, 'linhas', d.n, 'operadores', d.ops, 'media', coalesce(m.m, 0),
          'destaque', CASE WHEN de.cobradora IS NULL THEN NULL
                           ELSE jsonb_build_object('nome', nm.nome, 'valor', de.v) END
        ) ORDER BY d.v DESC), '[]'::JSONB)
          FROM no_dia d
          LEFT JOIN media m ON m.tipo = d.tipo AND m.chave = d.chave
          LEFT JOIN destaque de ON de.tipo = d.tipo AND de.chave = d.chave
          LEFT JOIN nomes nm ON nm.tipo = d.tipo AND nm.chave = d.chave
      )
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_mestre_diretoria_dia(UUID, TEXT, INTEGER, TEXT, INTEGER) IS
  'Um dia do 59: total, formas e colchao do escopo (geral, sem_cidade ou uma cidade, pela cidade da carteira); '
  'e cada setor ou carteira sem setor do dia, com a atribuicao de fn_mestre_diretoria_linhas (a mesma da aba '
  'Setores e equipes), a media por dia com recebimento no mes ate o corte e o destaque do dia. 20261003170000.';

-- ── 4. Classificar carteira sem setor ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mestre_carteira_classificar(
  p_empresa_id UUID,
  p_cod        TEXT,
  p_cidade_id  UUID,
  p_regra      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_estado TEXT;
BEGIN
  IF NOT (fn_user_is_super_admin() OR fn_can_access_empresa(p_empresa_id)) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.';
  END IF;
  -- A porta é o painel de permissões (com a chave-mestra do super_admin).
  IF NOT (fn_user_is_super_admin() OR fn_user_tem('painel_diretoria_definir_carteira')) THEN
    RAISE EXCEPTION 'Sem permissão para definir a cidade e a regra de carteiras.';
  END IF;
  IF p_regra IS NOT NULL AND p_regra NOT IN ('nosso_produto', 'cofen') THEN
    RAISE EXCEPTION 'Regra invalida: %', p_regra;
  END IF;

  SELECT estado INTO v_estado FROM mestre_grupos
   WHERE empresa_id = p_empresa_id AND cod_grupo_filtro = p_cod
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Carteira % não encontrada.', p_cod;
  END IF;
  -- Duas verdades sobre a mesma carteira não fecham: vinculada, quem diz é o setor.
  IF v_estado = 'vinculado' THEN
    RAISE EXCEPTION 'Carteira com setor segue a cidade e a regra do setor.';
  END IF;

  UPDATE mestre_grupos
     SET cidade_id = p_cidade_id,
         regra = p_regra,
         classificada_por_id = auth.uid(),
         classificada_em = now()
   WHERE empresa_id = p_empresa_id AND cod_grupo_filtro = p_cod;
END;
$function$;

COMMENT ON FUNCTION public.fn_mestre_carteira_classificar(UUID, TEXT, UUID, TEXT) IS
  'Grava cidade e regra de uma carteira do 59 SEM setor. Porta: painel_diretoria_definir_carteira ou super_admin. '
  'Recusa carteira vinculada (ela segue o setor). 20261003170000.';

REVOKE ALL ON FUNCTION public.fn_mestre_diretoria_cidades(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_mestre_diretoria_dia(UUID, TEXT, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_mestre_carteira_classificar(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mestre_diretoria_cidades(UUID, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mestre_diretoria_dia(UUID, TEXT, INTEGER, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mestre_carteira_classificar(UUID, TEXT, UUID, TEXT) TO authenticated;

-- O mesmo teto das outras leituras do 59 (20260917160000).
ALTER FUNCTION public.fn_mestre_diretoria_cidades(UUID, TEXT, INTEGER) SET statement_timeout = '20s';
ALTER FUNCTION public.fn_mestre_diretoria_dia(UUID, TEXT, INTEGER, TEXT, INTEGER) SET statement_timeout = '20s';

-- ── 5. A chave no catálogo ──────────────────────────────────────────────────
--
-- Renomeia o catálogo que estiver em vigor (seja qual for o último elo da
-- cadeia) e põe um novo em cima. A função renomeada NÃO é objeto morto: o
-- catálogo novo lê dela.

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_carteira_20261003()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_carteira_20261003;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_carteira_20261003() IS
  'Retrato do catalogo antes de painel_diretoria_definir_carteira (03/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_carteira_20261003()
  UNION ALL
  SELECT * FROM (VALUES
    ('painel_diretoria_definir_carteira', ARRAY['bookplay']::TEXT[], ARRAY['diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20261003170000 adiciona painel_diretoria_definir_carteira.';

UPDATE public.cargos_permissoes cp
   SET permissoes = cp.permissoes || jsonb_build_object('painel_diretoria_definir_carteira', cp.cargo = 'diretoria')
 WHERE cp.empresa_id IN (SELECT e.id FROM public.empresas e WHERE e.slug = 'bookplay')
   AND cp.cargo NOT IN (SELECT c.slug FROM public.cargos c WHERE c.acesso_total)
   AND NOT (cp.permissoes ? 'painel_diretoria_definir_carteira');

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
DECLARE n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'mestre_grupos' AND column_name = 'cidade_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'mestre_grupos' AND column_name = 'regra') THEN
    RAISE EXCEPTION 'As colunas novas de mestre_grupos não entraram.';
  END IF;
  IF to_regprocedure('public.fn_mestre_diretoria_cidades(uuid, text, integer)') IS NULL
     OR to_regprocedure('public.fn_mestre_diretoria_dia(uuid, text, integer, text, integer)') IS NULL
     OR to_regprocedure('public.fn_mestre_carteira_classificar(uuid, text, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'Alguma função nova não foi criada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'painel_diretoria_definir_carteira') THEN
    RAISE EXCEPTION 'A chave nova não entrou no catálogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_painel_diretoria') THEN
    RAISE EXCEPTION 'A cadeia do catálogo se partiu: chaves antigas sumiram.';
  END IF;
  -- Nenhuma carteira foi classificada por esta migration: começa tudo vazio.
  SELECT count(*) INTO n FROM public.mestre_grupos WHERE cidade_id IS NOT NULL OR regra IS NOT NULL;
  IF n > 0 THEN
    RAISE NOTICE '% carteira(s) já tinham cidade ou regra (reaplicação).', n;
  END IF;
END;
$prova$;

COMMIT;
