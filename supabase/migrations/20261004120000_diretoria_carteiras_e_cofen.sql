-- ============================================================================
-- Painel Diretoria: só conta o que tem cidade, e a Cofen vem da rota dela
-- ============================================================================
--
-- ## O pedido (Cleber, 04/10/2026)
--
-- «Regra de negócio diferente é carteira diferente.» A Visão geral passa a
-- dizer de qual carteira vem o dinheiro: Nosso produto ou Cofen.
--
--   1. Só conta o que tem cidade. Carteira do 59 sem cidade (sem setor e sem
--      escolha no painel, ou com setor que não tem cidade) não conta em lugar
--      nenhum, nem no geral, até alguém definir.
--   2. O dinheiro Cofen NÃO vem do 59. Vem da lógica que já existe: o total do
--      setor, do relatório de conciliação da PaguePlay (o mesmo número do card
--      do Conecta Play no Painel Líder); os operadores, do Analítico. A
--      carteira «MARILIA - COFEN» do 59 fica fora: contá-la seria dobrar.
--   3. Definir cidade e regra de carteira sem setor: só o super admin. A
--      chave `painel_diretoria_definir_carteira` (20261003170000) sai do
--      catálogo, porque deixaria um interruptor no painel sem efeito.
--
-- ## O que muda
--
--   • `fn_mestre_diretoria_cidades` e `fn_mestre_diretoria_dia`: só somam
--     linhas de carteira com cidade e regra Nosso produto. A carteira continua
--     na lista, com `conta` e o motivo de não contar; o mês traz `nao_conta`.
--   • `fn_diretoria_cofen` (nova): o mês do setor Cofen — conciliação (bruto,
--     H.O., Coren e Cofen das colunas do relatório, por `data`, como o
--     acumulado e o diário da diretoria PaguePlay) e os operadores do
--     Analítico (`valor_recebido` e `total_ho`, por `data_pagamento`).
--     Quem converte H.O. ⇄ bruto é a tela: o banco devolve os dois.
--   • `fn_mestre_carteira_classificar`: só o super admin.
--
-- REMOVE_PERMISSOES: painel_diretoria_definir_carteira
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. O mês por cidade: só o que conta ─────────────────────────────────────

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
    -- escolhidas no painel. Uma linha por carteira.
    carteira_base AS (
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
    -- Conta: tem cidade e é Nosso produto. O Cofen vem da conciliação
    -- (`fn_diretoria_cofen`), nunca do 59.
    carteira AS (
      SELECT b.*,
             (b.cidade_id IS NOT NULL AND coalesce(b.regra, 'nosso_produto') = 'nosso_produto') AS conta
        FROM carteira_base b
    ),
    atual_todas AS MATERIALIZED (
      SELECT r.cod_grupo_filtro AS cod, r.nome_grupo_filtro AS nome, r.cobradora, r.tp_doc,
             r.recebido, r.colchao, r.dt_pgto, extract(day FROM r.dt_pgto)::INTEGER AS dia, c.cidade_id,
             coalesce(c.conta, false) AS conta
        FROM mestre_recebimentos r
        LEFT JOIN carteira c ON c.cod = r.cod_grupo_filtro
       WHERE r.lote_id = v_lote
         AND extract(day FROM r.dt_pgto) <= v_corte
    ),
    atual AS (SELECT * FROM atual_todas WHERE conta),
    -- O mês anterior INTEIRO, com a regra de HOJE: a comparação é do mesmo
    -- conjunto de carteiras.
    anterior_todas AS MATERIALIZED (
      SELECT r.cod_grupo_filtro AS cod, r.recebido, extract(day FROM r.dt_pgto)::INTEGER AS dia, c.cidade_id,
             coalesce(c.conta, false) AS conta
        FROM mestre_recebimentos r
        LEFT JOIN carteira c ON c.cod = r.cod_grupo_filtro
       WHERE r.lote_id = v_lote_ant
    ),
    anterior AS (SELECT * FROM anterior_todas WHERE conta),
    -- As cidades da empresa que têm setor ou carteira: um cartão para cada,
    -- mesmo zerado no mês. Não existe mais «sem cidade»: sem cidade não conta.
    cidades AS (
      SELECT c.id AS cidade_id, c.nome
        FROM rh_celulas c
       WHERE c.empresa_id = p_empresa_id
         AND (EXISTS (SELECT 1 FROM setores s WHERE s.empresa_id = p_empresa_id AND s.cidade_id = c.id AND s.ativo)
              OR EXISTS (SELECT 1 FROM carteira k WHERE k.cidade_id = c.id))
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
    -- Todas as carteiras do mês, contando ou não: a tela mostra o que ficou de fora.
    cart AS (
      SELECT a.cod, max(a.nome) AS nome, sum(a.recebido)::NUMERIC(14,2) AS v, count(*)::BIGINT AS n,
             count(DISTINCT a.cobradora) FILTER (WHERE btrim(a.cobradora) <> '')::BIGINT AS ops
        FROM atual_todas a GROUP BY a.cod
    ),
    cart_ant AS (
      SELECT cod, sum(recebido)::NUMERIC(14,2) AS v FROM anterior_todas WHERE dia <= v_corte GROUP BY cod
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
      'nao_conta', (
        SELECT jsonb_build_object('valor', coalesce(sum(recebido), 0)::NUMERIC(14,2), 'linhas', count(*))
          FROM atual_todas WHERE NOT conta
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
                      LEFT JOIN serie_a sa ON sa.dia = d.d AND sa.cidade_id = c.cidade_id
                      LEFT JOIN serie_b sb ON sb.dia = d.d AND sb.cidade_id = c.cidade_id),
          'formas', (SELECT coalesce(jsonb_agg(jsonb_build_object('forma', f.forma, 'valor', f.v, 'qtd', f.q)
                       ORDER BY f.v DESC), '[]'::JSONB)
                       FROM formas f WHERE f.cidade_id = c.cidade_id)
        ) ORDER BY c.nome), '[]'::JSONB)
          FROM cidades c
          LEFT JOIN tot t ON t.cidade_id = c.cidade_id
          LEFT JOIN ant a ON a.cidade_id = c.cidade_id
      ),
      'carteiras', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'cod', ca.cod, 'nome', ca.nome, 'valor', ca.v, 'linhas', ca.n, 'operadores', ca.ops,
          'valor_anterior', coalesce(cb.v, 0),
          'estado', coalesce(k.estado, 'novo'), 'setor_id', k.setor_id, 'setor_nome', k.setor_nome,
          'cidade_id', k.cidade_id, 'regra', k.regra,
          'conta', coalesce(k.conta, false),
          'motivo', CASE
                      WHEN coalesce(k.conta, false) THEN NULL
                      WHEN k.cidade_id IS NULL AND k.setor_id IS NOT NULL THEN 'setor_sem_cidade'
                      WHEN k.cidade_id IS NULL THEN 'sem_cidade'
                      ELSE 'cofen'
                    END
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
  'O mes do 59 por cidade e o geral, no corte da Visao geral. So conta carteira com cidade e regra Nosso produto '
  '(a Cofen vem de fn_diretoria_cofen). A cidade e da CARTEIRA (do setor vinculado, ou a escolhida em '
  'mestre_grupos), entao as cidades fecham o geral. 20261003170000, regra de contagem em 20261004120000.';

-- ── 2. Um dia: só o que conta ───────────────────────────────────────────────

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
    carteira_base AS (
      SELECT g.cod_grupo_filtro AS cod, max(g.nome_grupo_filtro) AS nome,
             max(CASE WHEN g.estado = 'vinculado' AND g.setor_id IS NOT NULL THEN s.cidade_id::TEXT
                      ELSE g.cidade_id::TEXT END)::UUID AS cidade_id,
             max(CASE WHEN g.estado = 'vinculado' AND g.setor_id IS NOT NULL THEN s.regra ELSE g.regra END) AS regra
        FROM mestre_grupos g
        LEFT JOIN setores s ON s.id = g.setor_id
       WHERE g.empresa_id = p_empresa_id
       GROUP BY g.cod_grupo_filtro
    ),
    carteira AS (
      SELECT b.*,
             (b.cidade_id IS NOT NULL AND coalesce(b.regra, 'nosso_produto') = 'nosso_produto') AS conta
        FROM carteira_base b
    ),
    -- As linhas do dia que contam: o total, as formas e o colchão saem daqui,
    -- com a cidade da carteira — a mesma régua do cartão da cidade.
    brutas AS MATERIALIZED (
      SELECT r.cobradora, r.tp_doc, r.recebido, r.colchao, r.dt_pgto, c.cidade_id
        FROM mestre_recebimentos r
        JOIN carteira c ON c.cod = r.cod_grupo_filtro AND c.conta
       WHERE r.lote_id = v_lote AND extract(day FROM r.dt_pgto) = p_dia
    ),
    escopo AS (
      SELECT * FROM brutas b
       WHERE v_geral OR (v_sem AND b.cidade_id IS NULL) OR b.cidade_id = v_cidade
    ),
    ant_escopo AS (
      SELECT extract(day FROM r.dt_pgto)::INTEGER AS dia, r.recebido
        FROM mestre_recebimentos r
        JOIN carteira c ON c.cod = r.cod_grupo_filtro AND c.conta
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
             CASE WHEN u.setor_id IS NOT NULL THEN si.regra ELSE k.regra END         AS regra,
             -- Setor: conta se ELE tem cidade e é Nosso produto. Sem setor: a carteira.
             CASE WHEN u.setor_id IS NOT NULL
                  THEN si.cidade_id IS NOT NULL AND coalesce(si.regra, 'nosso_produto') = 'nosso_produto'
                  ELSE coalesce(k.conta, false) END AS conta
        FROM unidades u
        LEFT JOIN setor_info si ON si.id = u.setor_id
        LEFT JOIN carteira k ON k.cod = u.cod AND u.setor_id IS NULL
    ),
    filtradas AS (
      SELECT * FROM unidades_escopo ue
       WHERE ue.conta
         AND (v_geral OR (v_sem AND ue.cidade_id IS NULL) OR ue.cidade_id = v_cidade)
    ),
    no_dia AS (
      SELECT tipo, chave, max(setor_id::TEXT)::UUID AS setor_id, max(cod) AS cod, max(nome) AS nome,
             max(cidade_id::TEXT)::UUID AS cidade_id, max(regra) AS regra,
             sum(recebido)::NUMERIC(14,2) AS v, count(*)::BIGINT AS n,
             count(DISTINCT cobradora) FILTER (WHERE btrim(cobradora) <> '')::BIGINT AS ops
        FROM filtradas WHERE dia = p_dia
       GROUP BY tipo, chave
    ),
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
  'Um dia do 59, so com o que conta (carteira com cidade e Nosso produto): total, formas e colchao do escopo '
  '(geral ou uma cidade); e cada setor ou carteira sem setor do dia, com a atribuicao de fn_mestre_diretoria_linhas, '
  'a media por dia com recebimento no mes ate o corte e o destaque do dia. 20261003170000 / 20261004120000.';

-- ── 3. A carteira Cofen: conciliação e Analítico ────────────────────────────
--
-- A PaguePlay tem UM setor de origem com regra Cofen (o Conecta Play). O
-- relatório de conciliação não identifica setor — a mesma premissa de
-- `private.pp_conciliacao_setor` (20260911231007): com mais de um setor Cofen,
-- a função avisa em vez de repetir o total em cada um.
--
-- Valores do relatório em centavos (bigint) → reais. `pp` é o H.O., `coren` e
-- `cofen` o repasse, `total` o bruto — as colunas do ERP, sem percentual.
-- O dia é a coluna `data`, como no acumulado e no diário da diretoria PaguePlay
-- (ver o comentário de 29/09/2026 em RelatorioPaguePlay/ponte.ts).
--
-- Os operadores vêm do Analítico da PaguePlay, como no ranking: linha com
-- operador, por `data_pagamento`, super_admin fora. `total_ho` é o do relatório
-- analítico (20260929030000). Não é decomposição do total da conciliação — são
-- relatórios diferentes, e a tela diz isso.

CREATE OR REPLACE FUNCTION public.fn_diretoria_cofen(
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
  v_mes         DATE;
  v_mes_ant     DATE;
  v_fim         DATE;
  v_corte       INTEGER;
  v_ult_dia     INTEGER;
  v_hoje        DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_pp          UUID;
  v_n           INTEGER;
  v_setor       UUID;
  v_nome        TEXT;
  v_cidade      UUID;
  v_cidade_nome TEXT;
BEGIN
  -- A porta do painel: a mesma empresa e a chave de ver o Painel Diretoria.
  IF NOT (fn_user_is_super_admin()
          OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria'))) THEN
    RAISE EXCEPTION 'Sem acesso aos dados Cofen do Painel Diretoria.' USING ERRCODE = '42501';
  END IF;
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  v_mes     := (p_mes || '-01')::DATE;
  v_mes_ant := v_mes - INTERVAL '1 month';
  v_fim     := (v_mes + INTERVAL '1 month')::DATE;
  v_ult_dia := extract(day FROM (v_mes + INTERVAL '1 month - 1 day'))::INTEGER;
  -- O mesmo corte da Visão geral (fn_mestre_diretoria_cidades).
  v_corte := coalesce(
    p_dia_corte,
    CASE WHEN date_trunc('month', v_hoje) = v_mes THEN extract(day FROM v_hoje)::INTEGER ELSE v_ult_dia END
  );
  v_corte := greatest(1, least(v_corte, v_ult_dia));

  SELECT id INTO v_pp FROM empresas WHERE slug = 'pagueplay' LIMIT 1;

  SELECT count(*)::INTEGER, max(s.id::TEXT)::UUID, max(s.nome), max(s.cidade_id::TEXT)::UUID
    INTO v_n, v_setor, v_nome, v_cidade
    FROM setores s
   WHERE s.empresa_id = v_pp
     AND s.regra = 'cofen'
     AND NOT coalesce(s.alternativo, false)
     AND coalesce(s.ativo, true);

  IF v_pp IS NULL OR coalesce(v_n, 0) = 0 THEN
    RETURN jsonb_build_object('disponivel', false, 'aviso', 'Nenhum setor com regra Cofen.',
                              'dia_corte', v_corte, 'dias_no_mes', v_ult_dia);
  END IF;
  IF v_n > 1 THEN
    RETURN jsonb_build_object('disponivel', false,
      'aviso', 'Há mais de um setor com regra Cofen, e o relatório de conciliação não diz de qual setor é cada pagamento.',
      'dia_corte', v_corte, 'dias_no_mes', v_ult_dia);
  END IF;

  SELECT c.nome INTO v_cidade_nome FROM rh_celulas c WHERE c.id = v_cidade;

  RETURN (
    WITH
    conc AS MATERIALIZED (
      SELECT extract(day FROM r.data)::INTEGER AS dia, coalesce(nullif(btrim(r.forma), ''), 'NÃO INFORMADO') AS forma,
             r.total, r.pp, r.coren, r.cofen
        FROM pp_relatorio_conciliacoes r
       WHERE r.empresa_id = v_pp
         AND r.data >= v_mes AND r.data < v_fim
         AND extract(day FROM r.data) <= v_corte
    ),
    conc_ant AS MATERIALIZED (
      SELECT extract(day FROM r.data)::INTEGER AS dia, r.total, r.pp
        FROM pp_relatorio_conciliacoes r
       WHERE r.empresa_id = v_pp
         AND r.data >= v_mes_ant AND r.data < v_mes
    ),
    ana AS MATERIALIZED (
      SELECT ar.operador_id AS op, extract(day FROM ar.data_pagamento)::INTEGER AS dia,
             ar.valor_recebido AS bruto, coalesce(ar.total_ho, 0) AS ho
        FROM analitico_recebimentos ar
        LEFT JOIN perfis p ON p.id = ar.operador_id
       WHERE ar.empresa_id = v_pp
         AND ar.operador_id IS NOT NULL
         AND ar.data_pagamento >= v_mes AND ar.data_pagamento < v_fim
         AND extract(day FROM ar.data_pagamento) <= v_corte
         AND (ar.setor_id IS NULL OR ar.setor_id = v_setor)
         AND coalesce(p.perfil, '') <> 'super_admin'
    ),
    -- O nome do mês (retrato), o de hoje como reserva.
    nomes AS (
      SELECT DISTINCT ON (o.op) o.op, coalesce(cm.nome, p.nome, 'Operador') AS nome
        FROM (SELECT DISTINCT op FROM ana) o
        LEFT JOIN composicao_mes cm ON cm.empresa_id = v_pp AND cm.mes = p_mes AND cm.operador_id = o.op
        LEFT JOIN perfis p ON p.id = o.op
       ORDER BY o.op
    ),
    por_op AS (
      SELECT op, sum(bruto)::NUMERIC(14,2) AS b, sum(ho)::NUMERIC(14,2) AS h, count(*)::BIGINT AS n
        FROM ana GROUP BY op
    ),
    por_dia_op AS (
      SELECT dia, op, sum(bruto)::NUMERIC(14,2) AS b, sum(ho)::NUMERIC(14,2) AS h
        FROM ana GROUP BY dia, op
    ),
    destaque_dia AS (
      SELECT DISTINCT ON (dia) dia, op, b, h FROM por_dia_op ORDER BY dia, b DESC, op
    ),
    ops_dia AS (SELECT dia, count(DISTINCT op)::BIGINT AS n FROM ana GROUP BY dia),
    serie_a AS (
      SELECT dia, sum(total) AS t, sum(pp) AS h, sum(coren) AS co, sum(cofen) AS cf, count(*)::BIGINT AS q
        FROM conc GROUP BY dia
    ),
    serie_b AS (SELECT dia, sum(total) AS t, sum(pp) AS h FROM conc_ant GROUP BY dia),
    dias AS (SELECT generate_series(1, v_ult_dia) AS d)
    SELECT jsonb_build_object(
      'disponivel', true,
      'aviso', CASE WHEN v_cidade IS NULL
                    THEN 'O setor ' || v_nome || ' está sem cidade: não conta em lugar nenhum até ter uma.' END,
      'setor_id', v_setor, 'nome', v_nome,
      'cidade_id', v_cidade, 'cidade_nome', v_cidade_nome, 'conta', v_cidade IS NOT NULL,
      'dia_corte', v_corte, 'dias_no_mes', v_ult_dia,
      'mes', (SELECT jsonb_build_object(
                'bruto', (coalesce(sum(total), 0) / 100.0)::NUMERIC(14,2),
                'ho',    (coalesce(sum(pp), 0) / 100.0)::NUMERIC(14,2),
                'coren', (coalesce(sum(coren), 0) / 100.0)::NUMERIC(14,2),
                'cofen', (coalesce(sum(cofen), 0) / 100.0)::NUMERIC(14,2),
                'quantidade', count(*))
                FROM conc),
      'anterior', (SELECT jsonb_build_object(
                'bruto_ate_corte', (coalesce(sum(total) FILTER (WHERE dia <= v_corte), 0) / 100.0)::NUMERIC(14,2),
                'ho_ate_corte',    (coalesce(sum(pp)    FILTER (WHERE dia <= v_corte), 0) / 100.0)::NUMERIC(14,2),
                'bruto_mes',       (coalesce(sum(total), 0) / 100.0)::NUMERIC(14,2),
                'ho_mes',          (coalesce(sum(pp), 0) / 100.0)::NUMERIC(14,2),
                'dias',            count(DISTINCT dia))
                FROM conc_ant),
      'serie', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'dia', d.d,
                  'dentro_do_corte', d.d <= v_corte,
                  'bruto', (coalesce(sa.t, 0) / 100.0)::NUMERIC(14,2),
                  'ho',    (coalesce(sa.h, 0) / 100.0)::NUMERIC(14,2),
                  'coren', (coalesce(sa.co, 0) / 100.0)::NUMERIC(14,2),
                  'cofen', (coalesce(sa.cf, 0) / 100.0)::NUMERIC(14,2),
                  'quantidade', coalesce(sa.q, 0),
                  'bruto_anterior', CASE WHEN d.d <= v_corte THEN (coalesce(sb.t, 0) / 100.0)::NUMERIC(14,2) ELSE 0 END,
                  'ho_anterior',    CASE WHEN d.d <= v_corte THEN (coalesce(sb.h, 0) / 100.0)::NUMERIC(14,2) ELSE 0 END,
                  'operadores', coalesce(od.n, 0),
                  'destaque', CASE WHEN dd.op IS NULL THEN NULL
                                   ELSE jsonb_build_object('nome', nm.nome, 'bruto', dd.b, 'ho', dd.h) END
                ) ORDER BY d.d), '[]'::JSONB)
                  FROM dias d
                  LEFT JOIN serie_a sa ON sa.dia = d.d
                  LEFT JOIN serie_b sb ON sb.dia = d.d
                  LEFT JOIN ops_dia od ON od.dia = d.d
                  LEFT JOIN destaque_dia dd ON dd.dia = d.d
                  LEFT JOIN nomes nm ON nm.op = dd.op),
      'formas', (SELECT coalesce(jsonb_agg(jsonb_build_object('forma', f.forma, 'bruto', f.b, 'ho', f.h, 'qtd', f.q)
                   ORDER BY f.b DESC), '[]'::JSONB)
                   FROM (SELECT forma, (sum(total) / 100.0)::NUMERIC(14,2) AS b, (sum(pp) / 100.0)::NUMERIC(14,2) AS h,
                                count(*)::BIGINT AS q
                           FROM conc GROUP BY forma) f),
      'formas_dia', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia', f.dia, 'forma', f.forma, 'bruto', f.b, 'ho', f.h, 'qtd', f.q)
                   ORDER BY f.dia, f.b DESC), '[]'::JSONB)
                   FROM (SELECT dia, forma, (sum(total) / 100.0)::NUMERIC(14,2) AS b, (sum(pp) / 100.0)::NUMERIC(14,2) AS h,
                                count(*)::BIGINT AS q
                           FROM conc GROUP BY dia, forma) f),
      'operadores', jsonb_build_object(
        'quantidade', (SELECT count(*) FROM por_op),
        'lista', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'operador_id', o.op, 'nome', nm.nome, 'bruto', o.b, 'ho', o.h, 'pagamentos', o.n
                  ) ORDER BY o.b DESC, nm.nome), '[]'::JSONB)
                    FROM por_op o LEFT JOIN nomes nm ON nm.op = o.op))
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_diretoria_cofen(UUID, TEXT, INTEGER) IS
  'A carteira Cofen do Painel Diretoria: o setor Cofen da PaguePlay, com o mes do relatorio de conciliacao '
  '(bruto, H.O., Coren e Cofen das colunas do ERP, pela data) e os operadores do Analitico. Porta: acesso a '
  'empresa do painel e ver_painel_diretoria (ou super_admin). 20261004120000.';

REVOKE ALL ON FUNCTION public.fn_diretoria_cofen(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_cofen(UUID, TEXT, INTEGER) TO authenticated;
ALTER FUNCTION public.fn_diretoria_cofen(UUID, TEXT, INTEGER) SET statement_timeout = '20s';

-- ── 4. Classificar carteira: só o super admin ───────────────────────────────

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
  -- Decisão do Cleber (04/10/2026): só o super admin define.
  IF NOT fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Só o super admin define a cidade e a regra de uma carteira.' USING ERRCODE = '42501';
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
  'Grava cidade e regra de uma carteira do 59 SEM setor. So o super admin (20261004120000). '
  'Recusa carteira vinculada (ela segue o setor).';

-- ── 5. A chave sai do catálogo ──────────────────────────────────────────────
--
-- Renomeia o catálogo em vigor e põe um novo que o lê sem a chave. A função
-- renomeada NÃO é objeto morto: o catálogo novo depende dela.

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_remocao_20261004()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_remocao_20261004;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_remocao_20261004() IS
  'Retrato do catalogo antes de tirar painel_diretoria_definir_carteira (04/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT c.chave, c.tenants, c.padrao, c.explicita
    FROM public.fn_permissoes_catalogo_antes_remocao_20261004() c
   WHERE c.chave NOT IN ('painel_diretoria_definir_carteira');
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261004120000 tira painel_diretoria_definir_carteira (a definicao virou do super admin).';

-- A chave entrou ontem (20261003170000) e não teve uso: sai também dos cargos,
-- para não sobrar valor sem catálogo.
UPDATE public.cargos_permissoes
   SET permissoes = permissoes - 'painel_diretoria_definir_carteira'
 WHERE permissoes ? 'painel_diretoria_definir_carteira';

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
BEGIN
  IF to_regprocedure('public.fn_diretoria_cofen(uuid, text, integer)') IS NULL THEN
    RAISE EXCEPTION 'fn_diretoria_cofen não foi criada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'painel_diretoria_definir_carteira') THEN
    RAISE EXCEPTION 'A chave painel_diretoria_definir_carteira continua no catálogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_painel_diretoria') THEN
    RAISE EXCEPTION 'A cadeia do catálogo se partiu: chaves antigas sumiram.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cargos_permissoes WHERE permissoes ? 'painel_diretoria_definir_carteira') THEN
    RAISE EXCEPTION 'Sobrou a chave em cargos_permissoes.';
  END IF;
END;
$prova$;

COMMIT;
