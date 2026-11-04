-- ============================================================================
-- Painel Diretoria: o mês fechado lê a carteira, a regra e a cidade do mês
-- ============================================================================
--
-- Auditoria do fechamento de outubro (31/10/2026).
--
-- As nove funções do Painel Diretoria montam o mês com três tabelas de HOJE:
--
--   setores         nome, ativo, alternativo, REGRA (Cofen / Nosso produto) e
--                   CIDADE (que dá a marca) de cada setor;
--   mestre_grupos   a carteira do 59 → setor, com cidade e regra da carteira;
--   mestre_equipes  o subgrupo do 59 → equipe / destino.
--
-- Ligar uma carteira a outro setor, mudar a cidade ou a regra de um setor em
-- novembro recontava outubro no painel. O retrato já guarda as três
-- (`composicao_mes_setor`, e a carteira inteira em `composicao_mes_config`
-- desde 20261031230000).
--
-- ## O que muda
--
-- Três funções devolvem a tabela DO MÊS, linha a linha no tipo da própria
-- tabela:
--
--   fn_setores_do_mes(empresa, mes)        setores com nome/ativo/alternativo/
--                                          regra/cidade/tipo do retrato
--   fn_mestre_grupos_do_mes(empresa, mes)  as carteiras do retrato
--   fn_mestre_equipes_do_mes(empresa, mes) os subgrupos do 59 do retrato
--
-- Mês corrente, ou mês fechado sem o dado guardado (antes de outubro/2026):
-- a tabela de hoje, da empresa — o que as funções já liam. Carteira que surgiu
-- depois (importação atrasada) entra pela tabela de hoje.
--
-- As nove funções trocam só o `FROM`/`JOIN` dessas tabelas, texto por texto, a
-- partir da definição vigente em produção em 31/10/2026. Em `fn_diretoria_cofen`
-- a empresa é a da PaguePlay (`v_pp`), onde mora o setor Cofen — como antes.
--
-- ## Prova
--
-- Com a sessão de um super admin, as nove são chamadas para o mês corrente e
-- para setembro, nas empresas com 59 ou Cofen, antes e depois da troca.
-- Qualquer diferença desfaz a migration inteira.
--
-- Só funções. Nenhuma linha de dado muda. Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '600s';

-- ── As tabelas do mês ───────────────────────────────────────────────────────
-- SQL puro numa SELECT só, sem SECURITY DEFINER nem SET: o planejador expande
-- dentro de quem chama (as funções da Diretoria são SECURITY DEFINER) e a
-- consulta fica igual à de antes no mês corrente.
CREATE OR REPLACE FUNCTION public.fn_mestre_grupos_do_mes(p_empresa_id uuid, p_mes text)
 RETURNS SETOF public.mestre_grupos
 LANGUAGE sql
 STABLE
AS $function$
  -- Mês fechado com a carteira inteira guardada: a do retrato…
  SELECT x.*
    FROM public.composicao_mes_config c
   CROSS JOIN LATERAL jsonb_populate_recordset(NULL::public.mestre_grupos, c.carteiras->'grupos') x
   WHERE c.empresa_id = p_empresa_id AND c.mes = p_mes
     AND p_mes >= '2026-10' AND public.fn_mes_fechado(p_mes)
     AND (c.carteiras->'grupos'->0) ? 'id'
  UNION ALL
  -- …mais a de hoje que não estava nela (carteira nova de importação atrasada).
  -- No mês corrente, só esta parte: a tabela de hoje, da empresa.
  SELECT g.*
    FROM public.mestre_grupos g
   WHERE g.empresa_id = p_empresa_id
     AND NOT (p_mes >= '2026-10' AND public.fn_mes_fechado(p_mes) AND EXISTS (
       SELECT 1 FROM public.composicao_mes_config c
        WHERE c.empresa_id = p_empresa_id AND c.mes = p_mes
          AND c.carteiras->'grupos' @> jsonb_build_array(jsonb_build_object('id', g.id))));
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_equipes_do_mes(p_empresa_id uuid, p_mes text)
 RETURNS SETOF public.mestre_equipes
 LANGUAGE sql
 STABLE
AS $function$
  SELECT x.*
    FROM public.composicao_mes_config c
   CROSS JOIN LATERAL jsonb_populate_recordset(NULL::public.mestre_equipes, c.carteiras->'equipes') x
   WHERE c.empresa_id = p_empresa_id AND c.mes = p_mes
     AND p_mes >= '2026-10' AND public.fn_mes_fechado(p_mes)
     AND (c.carteiras->'equipes'->0) ? 'id'
  UNION ALL
  SELECT m.*
    FROM public.mestre_equipes m
   WHERE m.empresa_id = p_empresa_id
     AND NOT (p_mes >= '2026-10' AND public.fn_mes_fechado(p_mes) AND EXISTS (
       SELECT 1 FROM public.composicao_mes_config c
        WHERE c.empresa_id = p_empresa_id AND c.mes = p_mes
          AND c.carteiras->'equipes' @> jsonb_build_array(jsonb_build_object('id', m.id))));
$function$;

CREATE OR REPLACE FUNCTION public.fn_setores_do_mes(p_empresa_id uuid, p_mes text)
 RETURNS SETOF public.setores
 LANGUAGE sql
 STABLE
AS $function$
  SELECT (CASE WHEN cs.setor_id IS NULL THEN s
               ELSE jsonb_populate_record(s, jsonb_build_object(
                      'nome',        cs.nome,
                      'ativo',       cs.ativo,
                      'alternativo', cs.alternativo,
                      'regra',       cs.regra,
                      'cidade_id',   cs.cidade_id,
                      'tipo',        cs.tipo))
          END).*
    FROM public.setores s
    LEFT JOIN public.composicao_mes_setor cs
      ON cs.empresa_id = s.empresa_id AND cs.mes = p_mes AND cs.setor_id = s.id
     AND p_mes >= '2026-10' AND public.fn_mes_fechado(p_mes)
     AND cs.regra IS NOT NULL
   WHERE s.empresa_id = p_empresa_id;
$function$;

COMMENT ON FUNCTION public.fn_setores_do_mes(uuid, text) IS
  'setores da empresa como estavam no mes (retrato no mes fechado, a partir de 2026-10). 20261031230100.';
COMMENT ON FUNCTION public.fn_mestre_grupos_do_mes(uuid, text) IS
  'mestre_grupos (carteiras do 59) da empresa como estavam no mes. 20261031230100.';
COMMENT ON FUNCTION public.fn_mestre_equipes_do_mes(uuid, text) IS
  'mestre_equipes (subgrupos do 59) da empresa como estavam no mes. 20261031230100.';

-- ── A sessão da prova: um super admin ───────────────────────────────────────
DO $sessao$
DECLARE v_sa UUID;
BEGIN
  SELECT id INTO v_sa FROM public.perfis WHERE perfil = 'super_admin' ORDER BY criado_em LIMIT 1;
  IF v_sa IS NULL THEN RAISE EXCEPTION 'PROVA: sem super admin para a sessão'; END IF;
  PERFORM set_config('request.jwt.claim.sub', v_sa::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_sa, 'role', 'authenticated')::text, true);
END
$sessao$;

CREATE TEMP TABLE _chamadas ON COMMIT DROP AS
SELECT e.id AS empresa, m.mes,
       (SELECT s.id FROM public.setores s WHERE s.empresa_id = e.id ORDER BY s.nome LIMIT 1) AS setor
  FROM public.empresas e
 CROSS JOIN (VALUES (to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')), ('2026-09')) AS m(mes)
 WHERE EXISTS (SELECT 1 FROM public.mestre_grupos g WHERE g.empresa_id = e.id)
    OR EXISTS (SELECT 1 FROM public.setores s WHERE s.empresa_id = e.id AND s.regra = 'cofen');

CREATE TEMP TABLE _prova_antes ON COMMIT DROP AS
SELECT c.empresa, c.mes, f.nome, f.r
  FROM _chamadas c
 CROSS JOIN LATERAL (VALUES
   ('cofen',               public.fn_diretoria_cofen(c.empresa, c.mes)),
   ('alternativos',        public.fn_mestre_diretoria_alternativos(c.empresa, c.mes)),
   ('cidades',             public.fn_mestre_diretoria_cidades(c.empresa, c.mes)),
   ('dia',                 public.fn_mestre_diretoria_dia(c.empresa, c.mes, 15)),
   ('equipes_dos_setores', public.fn_mestre_diretoria_equipes_dos_setores(c.empresa, c.mes)),
   ('setor',               public.fn_mestre_diretoria_setor(c.empresa, c.mes, c.setor)),
   ('setores',             public.fn_mestre_diretoria_setores(c.empresa, c.mes)),
   ('visao_geral',         public.fn_mestre_diretoria_visao_geral(c.empresa, c.mes)),
   ('linhas', (SELECT jsonb_agg(to_jsonb(l) ORDER BY to_jsonb(l)::text)
                 FROM public.fn_mestre_diretoria_linhas(c.empresa, c.mes) l))
 ) AS f(nome, r);

-- ── As nove funções, lendo as tabelas do mês ────────────────────────────────
-- fn_diretoria_cofen: 1 troca(s)
CREATE OR REPLACE FUNCTION public.fn_diretoria_cofen(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
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
  v_meta        NUMERIC;
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
    FROM public.fn_setores_do_mes(v_pp, p_mes) s
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

  -- A meta do setor, como cadastrada na aba Metas da PaguePlay (sempre em
  -- bruto; a tela converte para H.O. pelo percentual configurado).
  SELECT m.meta_valor INTO v_meta
    FROM metas m
   WHERE m.empresa_id = v_pp AND m.tipo = 'setor' AND m.referencia_id = v_setor
     AND m.ano = extract(year FROM v_mes)::INTEGER AND m.mes = extract(month FROM v_mes)::INTEGER
   LIMIT 1;

  RETURN (
    WITH
    conc AS MATERIALIZED (
      SELECT extract(day FROM r.data)::INTEGER AS dia, coalesce(nullif(btrim(r.forma), ''), 'NÃO INFORMADO') AS forma,
             r.total, r.pp, r.coren, r.cofen
        FROM pp_relatorio_conciliacoes r
       WHERE r.empresa_id = v_pp
         AND r.data >= v_mes AND r.data < v_fim
         AND extract(day FROM r.data) <= v_corte
      UNION ALL
      SELECT extract(day FROM x.dia)::INTEGER, 'AJUSTE MANUAL', round(x.valor * 100), round(x.valor_ho * 100), 0, 0
        FROM public.fn_ajustes_recebimento(ARRAY[v_pp], v_mes, (v_mes + v_corte - 1)) x
       WHERE x.setor_id = v_setor
    ),
    conc_ant AS MATERIALIZED (
      SELECT extract(day FROM r.data)::INTEGER AS dia, r.total, r.pp
        FROM pp_relatorio_conciliacoes r
       WHERE r.empresa_id = v_pp
         AND r.data >= v_mes_ant AND r.data < v_mes
      UNION ALL
      SELECT extract(day FROM x.dia)::INTEGER, round(x.valor * 100), round(x.valor_ho * 100)
        FROM public.fn_ajustes_recebimento(ARRAY[v_pp], v_mes_ant::date, (v_mes - 1)) x
       WHERE x.setor_id = v_setor
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
      UNION ALL
      SELECT x.operador_id, extract(day FROM x.dia)::INTEGER, x.valor, x.valor_ho
        FROM public.fn_ajustes_recebimento(ARRAY[v_pp], v_mes, (v_mes + v_corte - 1)) x
       WHERE x.alvo = 'operador' AND x.setor_id = v_setor
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
      'meta', CASE WHEN coalesce(v_meta, 0) > 0 THEN v_meta END,
      'mes', (SELECT jsonb_build_object(
                'bruto', (coalesce(sum(total), 0) / 100.0)::NUMERIC(14,2),
                'ho',    (coalesce(sum(pp), 0) / 100.0)::NUMERIC(14,2),
                'coren', (coalesce(sum(coren), 0) / 100.0)::NUMERIC(14,2),
                'cofen', (coalesce(sum(cofen), 0) / 100.0)::NUMERIC(14,2),
                'quantidade', count(*) FILTER (WHERE forma <> 'AJUSTE MANUAL'))
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

-- fn_mestre_diretoria_alternativos: 5 troca(s)
CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_alternativos(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
  v_mes      date;
  v_mes_ant  date;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_mes_txt  text;
  v_ant_txt  text;
  v_regra    boolean;
  v_regra_ant boolean;
  v_res      jsonb;
BEGIN
  IF NOT (fn_user_is_super_admin() OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria'))) THEN
    RAISE EXCEPTION 'Sem acesso a esta empresa.';
  END IF;
  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := (v_mes - interval '1 month')::date;
  v_ult_dia := extract(day FROM (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    CASE WHEN date_trunc('month', v_hoje) = v_mes
         THEN extract(day FROM v_hoje)::integer ELSE v_ult_dia END);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));
  v_mes_txt := p_mes;
  v_ant_txt := to_char(v_mes_ant, 'YYYY-MM');

  -- A regra do resumo por operador: BookPlay, a partir de set/2026.
  v_regra     := EXISTS (SELECT 1 FROM empresas e WHERE e.id = p_empresa_id AND e.slug = 'bookplay')
                 AND v_mes_txt >= '2026-09';
  v_regra_ant := v_regra AND v_ant_txt >= '2026-09';

  WITH
  alt AS (
    SELECT s.id, s.nome, s.foto_url
      FROM public.fn_setores_do_mes(p_empresa_id, p_mes) s
     WHERE s.empresa_id = p_empresa_id
       AND s.alternativo
       AND s.ativo IS NOT FALSE
  ),
  gente AS (
    SELECT a.id AS setor_id, p.id AS operador_id
      FROM alt a
      JOIN perfis p ON p.setor_id = a.id
    UNION
    SELECT a.id, c.operador_id
      FROM alt a
      JOIN equipes q ON q.setor_id = a.id
      JOIN equipe_operadores_clones c ON c.equipe_id = q.id
     WHERE coalesce(c.conta_recebimento, true)
  ),
  -- Colchão fora nas duas fatias (20260913201057). O carimbo é o da
  -- sincronização: só linha com carimbo chega ao analítico.
  linhas AS MATERIALIZED (
    SELECT r.operador_id, r.recebido,
           fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) AS carimbo
      FROM private.mestre_recebimentos_com_ajuste r
      JOIN mestre_lotes l ON l.id = r.lote_id AND l.estado = 'vigente'
      JOIN public.fn_mestre_grupos_do_mes(p_empresa_id, p_mes) g
        ON g.empresa_id = r.empresa_id
       AND g.cod_grupo_filtro = r.cod_grupo_filtro
       AND g.estado = 'vinculado'
      LEFT JOIN public.fn_mestre_equipes_do_mes(p_empresa_id, p_mes) me
        ON me.empresa_id = r.empresa_id
       AND me.cod_grupo_filtro = r.cod_grupo_filtro
       AND me.nome_subgrupo = r.subgrupo_equipe
     WHERE r.empresa_id = p_empresa_id
       AND r.mes = v_mes
       AND r.operador_id IS NOT NULL
       AND fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       AND fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) IS NOT NULL
       AND (p_dia_corte IS NULL OR extract(day FROM r.dt_pgto) <= v_corte)
  ),
  linhas_ant AS MATERIALIZED (
    SELECT r.operador_id, r.recebido,
           fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) AS carimbo
      FROM private.mestre_recebimentos_com_ajuste r
      JOIN mestre_lotes l ON l.id = r.lote_id AND l.estado = 'vigente'
      JOIN public.fn_mestre_grupos_do_mes(p_empresa_id, p_mes) g
        ON g.empresa_id = r.empresa_id
       AND g.cod_grupo_filtro = r.cod_grupo_filtro
       AND g.estado = 'vinculado'
      LEFT JOIN public.fn_mestre_equipes_do_mes(p_empresa_id, p_mes) me
        ON me.empresa_id = r.empresa_id
       AND me.cod_grupo_filtro = r.cod_grupo_filtro
       AND me.nome_subgrupo = r.subgrupo_equipe
     WHERE r.empresa_id = p_empresa_id
       AND r.mes = v_mes_ant
       AND r.operador_id IS NOT NULL
       AND fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       AND fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) IS NOT NULL
       AND extract(day FROM r.dt_pgto) <= v_corte
  ),
  -- Os setores de cada pessoa no mês; vazio quando a regra não vale, e então
  -- a condição de `soma` deixa tudo passar.
  casa AS MATERIALIZED (
    SELECT sm.operador_id, sm.setor_id
      FROM fn_analitico_setores_no_mes(
             p_empresa_id, v_mes_txt,
             ARRAY(SELECT DISTINCT g.operador_id FROM gente g)) sm
     WHERE v_regra
  ),
  casa_ant AS MATERIALIZED (
    SELECT sm.operador_id, sm.setor_id
      FROM fn_analitico_setores_no_mes(
             p_empresa_id, v_ant_txt,
             ARRAY(SELECT DISTINCT g.operador_id FROM gente g)) sm
     WHERE v_regra_ant
  ),
  soma AS (
    SELECT g.setor_id,
           coalesce(sum(l.recebido), 0)::numeric(14,2) valor,
           count(l.recebido)::bigint                   linhas,
           count(DISTINCT l.operador_id)::bigint       operadores
      FROM gente g
      LEFT JOIN linhas l
        ON l.operador_id = g.operador_id
       AND (NOT EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa h WHERE h.operador_id = l.operador_id AND h.setor_id = l.carimbo))
     GROUP BY g.setor_id
  ),
  soma_ant AS (
    SELECT g.setor_id,
           coalesce(sum(l.recebido), 0)::numeric(14,2) valor,
           count(l.recebido)::bigint                   linhas
      FROM gente g
      LEFT JOIN linhas_ant l
        ON l.operador_id = g.operador_id
       AND (NOT EXISTS (SELECT 1 FROM casa_ant h WHERE h.operador_id = l.operador_id)
            OR EXISTS (SELECT 1 FROM casa_ant h WHERE h.operador_id = l.operador_id AND h.setor_id = l.carimbo))
     GROUP BY g.setor_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'setor_id',          a.id,
           'setor_nome',        a.nome,
           'foto_url',          a.foto_url,
           'valor', coalesce(s.valor, 0) + coalesce(ax.valor, 0),
           'linhas',            coalesce(s.linhas, 0),
           'operadores',        coalesce(s.operadores, 0),
           'pessoas',           (SELECT count(*) FROM gente g WHERE g.setor_id = a.id),
           'valor_anterior',    coalesce(sa.valor, 0),
           'tem_anterior',      coalesce(sa.linhas, 0) > 0,
           'carteiras',         0,
           'tem_grupo',         false,
           'integral_recebido', 0,
           'movido_para_ca',    0
         ) ORDER BY coalesce(s.valor, 0) DESC), '[]'::jsonb)
    INTO v_res
    FROM alt a
    LEFT JOIN soma     s  ON s.setor_id  = a.id
    LEFT JOIN soma_ant sa ON sa.setor_id = a.id
    LEFT JOIN LATERAL (
      SELECT sum(x.valor)::numeric(14,2) AS valor
        FROM public.fn_ajustes_recebimento(ARRAY[p_empresa_id], v_mes,
               (v_mes + CASE WHEN p_dia_corte IS NULL THEN v_ult_dia ELSE v_corte END - 1)) x
       WHERE x.alvo <> 'operador' AND x.setor_id = a.id) ax ON true;

  RETURN v_res;
END;
$function$;

-- fn_mestre_diretoria_cidades: 3 troca(s)
CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_cidades(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  IF NOT (fn_user_is_super_admin() OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria'))) THEN
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
        FROM public.fn_mestre_grupos_do_mes(p_empresa_id, p_mes) g
        LEFT JOIN public.fn_setores_do_mes(p_empresa_id, p_mes) s ON s.id = g.setor_id
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
        FROM private.mestre_recebimentos_com_ajuste r
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
        FROM private.mestre_recebimentos_com_ajuste r
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
         AND (EXISTS (SELECT 1 FROM public.fn_setores_do_mes(p_empresa_id, p_mes) s WHERE s.empresa_id = p_empresa_id AND s.cidade_id = c.id AND s.ativo)
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

-- fn_mestre_diretoria_dia: 3 troca(s)
CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_dia(p_empresa_id uuid, p_mes text, p_dia integer, p_escopo text DEFAULT NULL::text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
  IF NOT (fn_user_is_super_admin() OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria'))) THEN
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
        FROM public.fn_mestre_grupos_do_mes(p_empresa_id, p_mes) g
        LEFT JOIN public.fn_setores_do_mes(p_empresa_id, p_mes) s ON s.id = g.setor_id
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
        FROM private.mestre_recebimentos_com_ajuste r
        JOIN carteira c ON c.cod = r.cod_grupo_filtro AND c.conta
       WHERE r.lote_id = v_lote AND extract(day FROM r.dt_pgto) = p_dia
    ),
    escopo AS (
      SELECT * FROM brutas b
       WHERE v_geral OR (v_sem AND b.cidade_id IS NULL) OR b.cidade_id = v_cidade
    ),
    ant_escopo AS (
      SELECT extract(day FROM r.dt_pgto)::INTEGER AS dia, r.recebido
        FROM private.mestre_recebimentos_com_ajuste r
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
      SELECT s.id, s.nome, s.cidade_id, s.regra FROM public.fn_setores_do_mes(p_empresa_id, p_mes) s WHERE s.empresa_id = p_empresa_id
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
        FROM private.mestre_recebimentos_com_ajuste r
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

-- fn_mestre_diretoria_equipes_dos_setores: 1 troca(s)
CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_equipes_dos_setores(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
 SET work_mem TO '32MB'
AS $function$
declare
  v_mes      date;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res      jsonb;
begin
  if not (fn_user_is_super_admin() OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria'))) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  -- O mesmo corte de `fn_mestre_diretoria_setor`.
  v_mes     := (p_mes || '-01')::date;
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  /* O bloco `equipes` de `fn_mestre_diretoria_setor`, para todos os setores de
     uma vez: a mesma agregação, com `setor_id` na chave. Ver o cabeçalho da
     migration. `equipes_do_59` e nao `equipes`: um CTE sombreia a tabela
     homonima em toda referencia nao qualificada do mesmo comando. */
  with
  atual as (
    select l.* from fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte) l
     where l.setor_id is not null
  ),
  equipes_do_59 as (
    select a.setor_id,
           a.subgrupo_equipe nome,
           a.cod_grupo_filtro cod,
           max(a.nome_grupo_filtro) carteira,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores,
           bool_or(a.origem = 'movido')   veio_de_fora,
           bool_or(a.origem = 'integral') e_integral,
           fn_mestre_e_equipe(a.subgrupo_equipe) e_equipe
      from atual a group by 1, 2, 3
  ),
  equipes_completas as (
    select e.*, me.equipe_id, eq.nome equipe_nome,
           lp.id lider_id, lp.nome lider_nome, lp.foto_url lider_foto
      from equipes_do_59 e
      left join public.fn_mestre_equipes_do_mes(p_empresa_id, p_mes) me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = e.cod
       and me.nome_subgrupo = e.nome
      left join equipes eq on eq.id = me.equipe_id
      left join lateral (
        select p.id, p.nome, p.foto_url
          from equipe_lideres el
          join perfis p on p.id = el.lider_id
         where el.equipe_id = me.equipe_id
           and el.empresa_id = p_empresa_id
         order by el.criado_em
         limit 1
      ) lp on true
  ),
  por_setor as (
    select e.setor_id,
           jsonb_agg(jsonb_build_object(
             'nome', nome, 'cod_grupo', cod, 'carteira', carteira,
             'valor', valor, 'linhas', linhas, 'operadores', operadores,
             'veio_de_fora', veio_de_fora, 'e_integral', e_integral,
             'e_equipe', e_equipe, 'equipe_id', equipe_id,
             'equipe_nome', equipe_nome, 'lider_id', lider_id,
             'lider_nome', lider_nome, 'lider_foto', lider_foto)
             order by valor desc) as equipes
      from equipes_completas e
     group by e.setor_id
  )
  select coalesce(jsonb_object_agg(setor_id::text, equipes), '{}'::jsonb)
    into v_res
    from por_setor;

  return v_res;
end;
$function$;

-- fn_mestre_diretoria_linhas: 3 troca(s)
CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_linhas(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS TABLE(setor_id uuid, cod_grupo_filtro text, nome_grupo_filtro text, subgrupo_equipe text, cobradora text, dt_pgto date, tp_doc text, recebido numeric, origem text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- O lote vigente do mês. No máximo um (`mestre_lotes_um_vigente_por_mes`);
  -- nenhum = nenhuma linha, como a junção de antes.
  with lote as (
    select l.id
      from mestre_lotes l
     where l.empresa_id = p_empresa_id
       and l.mes = (p_mes || '-01')::date
       and l.estado = 'vigente'
  ),
  -- Mapa de nome->codigo do MES INTEIRO, sem corte: o mapa e cadastral, nao
  -- temporal. Corta-lo faria contribuicoes ficarem orfas por causa de data.
  -- Tambem NAO filtra colchao: o mapa e de nomes, nao de dinheiro.
  nomes as (
    select distinct r.cod_grupo_filtro, r.nome_grupo_filtro
      from private.mestre_recebimentos_com_ajuste r
     where r.lote_id = (select id from lote)
       and r.nome_grupo_filtro <> ''
  ),
  -- Só as colunas que as duas pernas usam. `select r.*` aqui guardava a linha
  -- inteira do 59 num CTE lido duas vezes — ver 20260917160000.
  fatia as (
    select r.setor, r.nome_grupo_filtro, r.cod_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, r.tipo
      from private.mestre_recebimentos_com_ajuste r
     where r.lote_id = (select id from lote)
       and (p_dia_corte is null or extract(day from r.dt_pgto) <= p_dia_corte)
       -- Colchao nao conta para SETOR: ele entra no total da empresa
       -- (fn_mestre_diretoria_visao_geral) e fica de fora daqui, igual a
       -- Retencao. Uma linha so, na entrada, para as duas pernas abaixo.
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
  ),
  resolvida as (
    select f.*,
           n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe,
           me.destino_setor_id,
           -- Grupo so empresta o setor dele quando o vinculo esta confirmado.
           case when g.estado = 'vinculado' then g.setor_id end as setor_do_grupo
      from fatia f
      cross join lateral (
        select case
                 when f.nome_grupo_filtro <> ''
                  and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                 then substr(f.setor, length(f.nome_grupo_filtro) + 4)
               end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
      left join public.fn_mestre_equipes_do_mes(p_empresa_id, p_mes) me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = f.cod_grupo_filtro
       and me.nome_subgrupo = f.subgrupo_equipe
      left join public.fn_mestre_grupos_do_mes(p_empresa_id, p_mes) g
        on g.empresa_id = p_empresa_id
       and g.cod_grupo_filtro = f.cod_grupo_filtro
  )
  -- 1a perna: onde a linha conta por direito proprio (ou para onde foi movida).
  select
    case r.destino_equipe
      when 'outro_setor'   then r.destino_setor_id
      when 'somente_geral' then null::uuid
      else r.setor_do_grupo
    end,
    r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
    r.cobradora, r.dt_pgto, r.tp_doc, r.recebido,
    case r.destino_equipe
      when 'outro_setor'   then 'movido'
      when 'somente_geral' then 'somente_geral'
      else 'proprio'
    end
  from resolvida r

  union all

  -- 2a perna: o Integral cobrado por um grupo PARA outro. Soma no destino sem
  -- sair da origem. So Integral: o Extra e a segunda representacao de um
  -- pagamento que o destino ja tem como direto.
  select
    gd.setor_id,
    r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
    r.cobradora, r.dt_pgto, r.tp_doc, r.recebido,
    'integral'
  from resolvida r
  join public.fn_mestre_grupos_do_mes(p_empresa_id, p_mes) gd
    on gd.empresa_id = p_empresa_id
   and gd.cod_grupo_filtro = r.cod_destino
   and gd.estado = 'vinculado'
   and gd.setor_id is not null
  where r.cod_destino is not null
    and r.cod_destino <> r.cod_grupo_filtro
    and lower(r.tipo) <> 'extra';
$function$;

-- fn_mestre_diretoria_setor: 3 troca(s)
CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_setor(p_empresa_id uuid, p_mes text, p_setor_id uuid DEFAULT NULL::uuid, p_cod_grupo text DEFAULT NULL::text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
 SET work_mem TO '32MB'
AS $function$
declare
  v_mes      date;
  v_mes_ant  date;
  v_mes_ant_txt text;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res      jsonb;
begin
  if not (fn_user_is_super_admin() OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria'))) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;
  if (p_setor_id is null) = (p_cod_grupo is null) then
    raise exception 'Informe p_setor_id OU p_cod_grupo, exatamente um dos dois.';
  end if;
  if p_setor_id is not null and not exists (
       select 1 from public.fn_setores_do_mes(p_empresa_id, p_mes) s where s.id = p_setor_id and s.empresa_id = p_empresa_id) then
    raise exception 'Setor nao pertence a esta empresa.';
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := (v_mes - interval '1 month')::date;
  v_mes_ant_txt := to_char(v_mes_ant, 'YYYY-MM');
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  with
  atual as (
    select l.* from fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte) l
     where p_setor_id is not null and l.setor_id = p_setor_id
    union all
    -- Modo carteira crua: direto da tabela, sem passar pela atribuicao. O
    -- colchao fica de fora aqui tambem — carteira e recorte de setor, e a via
    -- do `fn_mestre_diretoria_linhas` acima ja o descarta. Sem esta linha, abrir
    -- a mesma carteira pelos dois caminhos daria dois numeros.
    select null::uuid, r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, 'proprio'
      from private.mestre_recebimentos_com_ajuste r
      join mestre_lotes lo on lo.id = r.lote_id and lo.estado = 'vigente'
     where p_cod_grupo is not null
       and r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and r.cod_grupo_filtro = p_cod_grupo
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and extract(day from r.dt_pgto) <= v_corte
  ),
  anterior as (
    select l.* from fn_mestre_diretoria_linhas(p_empresa_id, v_mes_ant_txt, v_corte) l
     where p_setor_id is not null and l.setor_id = p_setor_id
    union all
    select null::uuid, r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, 'proprio'
      from private.mestre_recebimentos_com_ajuste r
      join mestre_lotes lo on lo.id = r.lote_id and lo.estado = 'vigente'
     where p_cod_grupo is not null
       and r.empresa_id = p_empresa_id
       and r.mes = v_mes_ant
       and r.cod_grupo_filtro = p_cod_grupo
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and extract(day from r.dt_pgto) <= v_corte
  ),
  tot as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n,
           count(distinct cobradora) filter (where cobradora <> '')::bigint ops
      from atual
  ),
  tot_ant as (select coalesce(sum(recebido), 0)::numeric(14,2) v from anterior),
  dias as (select generate_series(1, v_ult_dia) d),
  -- Uma agregação por lado, juntada ao calendário. Antes era uma subconsulta
  -- por dia, nos dois meses (20260917160000).
  serie_atual as (
    select extract(day from dt_pgto)::integer dia, sum(recebido) v from atual group by 1
  ),
  serie_ant as (
    select extract(day from dt_pgto)::integer dia, sum(recebido) v from anterior group by 1
  ),
  serie as (
    select d.d dia,
           coalesce(sa.v, 0)::numeric(14,2) valor,
           coalesce(sb.v, 0)::numeric(14,2) valor_anterior,
           d.d <= v_corte dentro_do_corte
      from dias d
      left join serie_atual sa on sa.dia = d.d
      left join serie_ant   sb on sb.dia = d.d
  ),
  formas as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NAO INFORMADO') forma,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd,
           0::numeric(14,2) valor_anterior
      from atual group by 1
  ),
  -- As equipes NAO comparam com o mes anterior, de proposito: subgrupo do ERP
  -- muda de nome, e casar por nome inventaria equipe nova onde houve renomeacao.
  --
  -- O nome e `equipes_do_59` e NAO `equipes` porque existe uma TABELA com esse
  -- nome, e um CTE sombreia a tabela homonima em toda referencia nao
  -- qualificada do mesmo comando. Com o CTE chamado `equipes`, o
  -- `left join equipes eq` abaixo pegava o CTE e estourava com
  -- «column eq.id does not exist».
  equipes_do_59 as (
    select a.subgrupo_equipe nome,
           a.cod_grupo_filtro cod,
           max(a.nome_grupo_filtro) carteira,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores,
           bool_or(a.origem = 'movido')   veio_de_fora,
           bool_or(a.origem = 'integral') e_integral,
           fn_mestre_e_equipe(a.subgrupo_equipe) e_equipe
      from atual a group by 1, 2
  ),
  equipes_completas as (
    select e.*, me.equipe_id, eq.nome equipe_nome,
           lp.id lider_id, lp.nome lider_nome, lp.foto_url lider_foto
      from equipes_do_59 e
      left join public.fn_mestre_equipes_do_mes(p_empresa_id, p_mes) me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = e.cod
       and me.nome_subgrupo = e.nome
      left join equipes eq on eq.id = me.equipe_id
      left join lateral (
        select p.id, p.nome, p.foto_url
          from equipe_lideres el
          join perfis p on p.id = el.lider_id
         where el.equipe_id = me.equipe_id
           and el.empresa_id = p_empresa_id
         order by el.criado_em
         limit 1
      ) lp on true
  ),
  carteiras as (
    select a.cod_grupo_filtro cod, max(a.nome_grupo_filtro) nome,
           sum(a.recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual a group by 1
  )
  select jsonb_build_object(
    'setor_id',     p_setor_id,
    'cod_grupo',    p_cod_grupo,
    'setor_nome',   coalesce(
                      (select nome from public.fn_setores_do_mes(p_empresa_id, p_mes) where id = p_setor_id),
                      (select max(nome_grupo_filtro) from atual),
                      p_cod_grupo),
    'vinculado',    p_setor_id is not null,
    'mes',          p_mes,
    'mes_anterior', to_char(v_mes_ant, 'YYYY-MM'),
    'dia_corte',    v_corte,
    'dias_no_mes',  v_ult_dia,
    'recebido',     (select v from tot),
    'linhas',       (select n from tot),
    'operadores',   (select ops from tot),
    'recebido_anterior', (select v from tot_ant),
    'tem_anterior', (select v from tot_ant) <> 0,
    'serie',        coalesce((select jsonb_agg(jsonb_build_object(
                       'dia', dia, 'valor', valor, 'valor_anterior', valor_anterior,
                       'dentro_do_corte', dentro_do_corte) order by dia) from serie), '[]'::jsonb),
    'formas',       coalesce((select jsonb_agg(jsonb_build_object(
                       'forma', forma, 'valor', valor, 'qtd', qtd,
                       'valor_anterior', valor_anterior) order by valor desc) from formas), '[]'::jsonb),
    'carteiras',    coalesce((select jsonb_agg(jsonb_build_object(
                       'cod', cod, 'nome', nome, 'valor', valor, 'qtd', qtd)
                       order by valor desc) from carteiras), '[]'::jsonb),
    'equipes',      coalesce((select jsonb_agg(jsonb_build_object(
                       'nome', nome, 'cod_grupo', cod, 'carteira', carteira,
                       'valor', valor, 'linhas', linhas, 'operadores', operadores,
                       'veio_de_fora', veio_de_fora, 'e_integral', e_integral,
                       'e_equipe', e_equipe, 'equipe_id', equipe_id,
                       'equipe_nome', equipe_nome, 'lider_id', lider_id,
                       'lider_nome', lider_nome, 'lider_foto', lider_foto)
                       order by valor desc) from equipes_completas), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

-- fn_mestre_diretoria_setores: 2 troca(s)
CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_setores(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '32MB'
 SET statement_timeout TO '20s'
AS $function$
declare
  v_mes      date;
  v_mes_ant  date;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res      jsonb;
begin
  if not (fn_user_is_super_admin() OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria'))) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := (v_mes - interval '1 month')::date;
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  with
  atual as (
    select * from fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte)
  ),
  anterior as (
    select * from fn_mestre_diretoria_linhas(
      p_empresa_id, to_char(v_mes_ant, 'YYYY-MM'), v_corte)
  ),
  por_setor as (
    select a.setor_id,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores,
           count(distinct a.cod_grupo_filtro)::bigint carteiras,
           sum(a.recebido) filter (where a.origem = 'integral')::numeric(14,2) integral,
           sum(a.recebido) filter (where a.origem = 'movido')::numeric(14,2)   movido
      from atual a where a.setor_id is not null group by a.setor_id
  ),
  por_setor_ant as (
    select b.setor_id, sum(b.recebido)::numeric(14,2) valor
      from anterior b where b.setor_id is not null group by b.setor_id
  ),
  sem_setor_carteiras as (
    select a.cod_grupo_filtro cod, max(a.nome_grupo_filtro) nome,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores
      from atual a
     where a.setor_id is null and a.origem <> 'somente_geral'
     group by 1
  ),
  sem_setor_ant as (
    select b.cod_grupo_filtro cod, sum(b.recebido)::numeric(14,2) valor
      from anterior b
     where b.setor_id is null and b.origem <> 'somente_geral'
     group by 1
  ),
  so_geral as (
    select a.cod_grupo_filtro cod, max(a.nome_grupo_filtro) nome,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.subgrupo_equipe) filter (where a.subgrupo_equipe <> '')::bigint equipes
      from atual a where a.origem = 'somente_geral' group by 1
  ),
  so_geral_ant as (
    select b.cod_grupo_filtro cod, sum(b.recebido)::numeric(14,2) valor
      from anterior b where b.origem = 'somente_geral' group by 1
  ),
  total_empresa as (
    select coalesce(sum(a.recebido), 0)::numeric(14,2) v
      from atual a where a.origem <> 'integral'
  ),
  cards as (
    select s.id, s.nome, s.foto_url,
           p.valor, p.linhas, p.operadores, p.carteiras,
           coalesce(p.integral, 0)::numeric(14,2) as integral,
           coalesce(p.movido, 0)::numeric(14,2)   as movido,
           coalesce(pa.valor, 0)::numeric(14,2)   as valor_anterior,
           (pa.setor_id is not null)              as tinha_anterior,
           exists (select 1 from public.fn_mestre_grupos_do_mes(p_empresa_id, p_mes) g
                    where g.empresa_id = p_empresa_id and g.setor_id = s.id
                      and g.estado = 'vinculado')  as tem_grupo
      from por_setor p
      join public.fn_setores_do_mes(p_empresa_id, p_mes) s on s.id = p.setor_id and s.empresa_id = p_empresa_id
      left join por_setor_ant pa on pa.setor_id = s.id
  )
  select jsonb_build_object(
    'mes',           p_mes,
    'mes_anterior',  to_char(v_mes_ant, 'YYYY-MM'),
    'dia_corte',     v_corte,
    'dias_no_mes',   v_ult_dia,
    'total_empresa', (select v from total_empresa),
    'total_setores', coalesce((select sum(valor) from cards), 0),
    'sem_setor',     (select jsonb_build_object(
                        'valor',  coalesce(sum(valor), 0),
                        'linhas', coalesce(sum(linhas), 0)) from sem_setor_carteiras),
    'carteiras_sem_setor', coalesce((select jsonb_agg(jsonb_build_object(
                        'cod', c.cod, 'nome', c.nome, 'valor', c.valor,
                        'linhas', c.linhas, 'operadores', c.operadores,
                        'valor_anterior', coalesce(ca.valor, 0)) order by c.valor desc)
                       from sem_setor_carteiras c
                       left join sem_setor_ant ca on ca.cod = c.cod), '[]'::jsonb),
    'somente_geral', jsonb_build_object(
                       'valor',  (select coalesce(sum(valor), 0)::numeric(14,2) from so_geral),
                       'linhas', (select coalesce(sum(linhas), 0) from so_geral),
                       'carteiras', coalesce((select jsonb_agg(jsonb_build_object(
                           'cod', g.cod, 'nome', g.nome, 'valor', g.valor,
                           'linhas', g.linhas, 'equipes', g.equipes,
                           'valor_anterior', coalesce(ga.valor, 0)) order by g.valor desc)
                          from so_geral g
                          left join so_geral_ant ga on ga.cod = g.cod), '[]'::jsonb)),
    'setores',       coalesce((select jsonb_agg(jsonb_build_object(
                        'setor_id', id, 'setor_nome', nome, 'foto_url', foto_url,
                        'valor', valor, 'linhas', linhas,
                        'operadores', operadores, 'carteiras', carteiras,
                        'integral_recebido', integral, 'movido_para_ca', movido,
                        'valor_anterior', valor_anterior,
                        'tem_anterior', tinha_anterior,
                        'tem_grupo', tem_grupo) order by valor desc) from cards), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

-- fn_mestre_diretoria_visao_geral: 2 troca(s)
CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_visao_geral(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
 SET work_mem TO '32MB'
AS $function$
declare
  v_mes       date;
  v_mes_ant   date;
  v_lote      uuid;
  v_lote_ant  uuid;
  v_corte     integer;
  v_ult_dia   integer;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res       jsonb;
begin
  -- O portão é o mesmo do resto do mestre: quem enxerga a empresa, enxerga.
  if not (fn_user_is_super_admin() OR (fn_can_access_empresa(p_empresa_id) AND fn_user_tem('ver_painel_diretoria'))) then
    raise exception 'Sem acesso a esta empresa.';
  end if;

  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := v_mes - interval '1 month';
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;

  -- Corte: o pedido, ou hoje no mês corrente, ou o mês fechado inteiro.
  v_corte := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer
         else v_ult_dia end
  );
  v_corte := greatest(1, least(v_corte, v_ult_dia));

  select id into v_lote from mestre_lotes
   where empresa_id = p_empresa_id and mes = v_mes and estado = 'vigente' limit 1;
  select id into v_lote_ant from mestre_lotes
   where empresa_id = p_empresa_id and mes = v_mes_ant and estado = 'vigente' limit 1;

  with
  -- As linhas dos dois meses, já recortadas pelo corte. Tudo o mais sai daqui,
  -- e é isso que garante que os blocos fechem entre si. Só as colunas usadas
  -- (20260917160000): estes CTEs são lidos várias vezes e ficam em memória.
  atual as (
    select extract(day from r.dt_pgto)::integer as dia,
           r.dt_pgto, r.recebido, r.cobradora, r.cod_grupo_filtro,
           r.nome_grupo_filtro, r.tp_doc, r.colchao
      from private.mestre_recebimentos_com_ajuste r
     where r.lote_id = v_lote
       and extract(day from r.dt_pgto) <= v_corte
  ),
  anterior as (
    select extract(day from r.dt_pgto)::integer as dia,
           r.dt_pgto, r.recebido, r.cod_grupo_filtro, r.tp_doc, r.colchao
      from private.mestre_recebimentos_com_ajuste r
     where r.lote_id = v_lote_ant
       and extract(day from r.dt_pgto) <= v_corte
  ),
  tot_atual as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v,
           count(*)::bigint n,
           count(distinct cobradora) filter (where cobradora <> '')::bigint operadores,
           count(distinct cod_grupo_filtro)::bigint carteiras
      from atual
  ),
  tot_ant as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n from anterior
  ),
  /* O colchao que ESTE total inclui e que Setores e equipes descarta.
     `fn_mestre_conta_na_meta` e nao `where colchao`: a janela de 01 a
     14/08/2026 conta para setor, e ignora-la faria este numero explicar uma
     diferenca diferente da que existe naquele mes. */
  colchao_atual as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n
      from atual where not fn_mestre_conta_na_meta(colchao, dt_pgto)
  ),
  colchao_ant as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v
      from anterior where not fn_mestre_conta_na_meta(colchao, dt_pgto)
  ),
  -- Série diária: uma linha por dia do mês, mesmo os dias sem recebimento. O
  -- gráfico precisa do zero para o traço não pular o buraco e mentir a forma.
  -- Uma agregação por lado, juntada ao calendário — antes era uma subconsulta
  -- por dia (20260917160000).
  dias as (select generate_series(1, v_ult_dia) d),
  serie_atual as (select dia, sum(recebido) v from atual group by dia),
  serie_ant   as (select dia, sum(recebido) v from anterior group by dia),
  serie as (
    select d.d as dia,
           coalesce(sa.v, 0)::numeric(14,2) as valor,
           coalesce(sb.v, 0)::numeric(14,2) as valor_anterior,
           d.d <= v_corte as dentro_do_corte
      from dias d
      left join serie_atual sa on sa.dia = d.d
      left join serie_ant   sb on sb.dia = d.d
  ),
  /* Os dois lados agregados SEPARADAMENTE e depois juntos. */
  formas_atual as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') as forma,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual group by 1
  ),
  formas_ant as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') as forma,
           sum(recebido)::numeric(14,2) valor
      from anterior group by 1
  ),
  /* Left join, e nao full: o donut e do mes EM FOCO. */
  formas as (
    select fa.forma, fa.valor, fa.qtd, coalesce(fb.valor, 0)::numeric(14,2) valor_anterior
      from formas_atual fa left join formas_ant fb on fb.forma = fa.forma
  ),
  /* O `setor_id` vem do vinculo em `mestre_grupos`: carteira sem setor
     vinculado chega com nulo, e o painel a mostra assim mesmo. */
  cart_atual as (
    select cod_grupo_filtro cod, max(nome_grupo_filtro) nome,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual group by 1
  ),
  cart_ant as (
    select cod_grupo_filtro cod, sum(recebido)::numeric(14,2) valor
      from anterior group by 1
  ),
  carteiras as (
    select ca.cod, ca.nome, ca.valor, ca.qtd,
           coalesce(cb.valor, 0)::numeric(14,2) valor_anterior,
           g.setor_id, s.nome as setor_nome
      from cart_atual ca
      left join cart_ant cb on cb.cod = ca.cod
      left join public.fn_mestre_grupos_do_mes(p_empresa_id, p_mes) g
             on g.empresa_id = p_empresa_id and g.cod_grupo_filtro = ca.cod
      left join public.fn_setores_do_mes(p_empresa_id, p_mes) s on s.id = g.setor_id
  )
  select jsonb_build_object(
    'mes',              p_mes,
    'mes_anterior',     to_char(v_mes_ant, 'YYYY-MM'),
    'dia_corte',        v_corte,
    'dias_no_mes',      v_ult_dia,
    'tem_lote',         v_lote is not null,
    'tem_lote_anterior', v_lote_ant is not null,
    'total',            (select jsonb_build_object(
                            'recebido', v, 'linhas', n,
                            'operadores', operadores, 'carteiras', carteiras)
                           from tot_atual),
    'total_anterior',   (select jsonb_build_object('recebido', v, 'linhas', n) from tot_ant),
    'colchao',          jsonb_build_object(
                            'valor',          (select v from colchao_atual),
                            'linhas',         (select n from colchao_atual),
                            'valor_anterior', (select v from colchao_ant)),
    'serie',            coalesce((select jsonb_agg(jsonb_build_object(
                            'dia', dia, 'valor', valor,
                            'valor_anterior', valor_anterior,
                            'dentro_do_corte', dentro_do_corte) order by dia) from serie), '[]'::jsonb),
    'formas',           coalesce((select jsonb_agg(jsonb_build_object(
                            'forma', forma, 'valor', valor, 'qtd', qtd,
                            'valor_anterior', valor_anterior) order by valor desc) from formas), '[]'::jsonb),
    'carteiras',        coalesce((select jsonb_agg(jsonb_build_object(
                            'cod', cod, 'nome', nome, 'valor', valor, 'qtd', qtd,
                            'valor_anterior', valor_anterior,
                            'setor_id', setor_id, 'setor_nome', setor_nome) order by valor desc)
                           from carteiras), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

-- ── Prova: idênticas no mês corrente e em setembro ──────────────────────────
DO $prova$
DECLARE
  v_dif   TEXT;
  v_total INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM _prova_antes;
  SELECT string_agg(DISTINCT a.nome || ' ' || a.mes, ', ') INTO v_dif
    FROM _prova_antes a
    JOIN _chamadas c ON c.empresa = a.empresa AND c.mes = a.mes
    CROSS JOIN LATERAL (VALUES
      ('cofen',               public.fn_diretoria_cofen(c.empresa, c.mes)),
      ('alternativos',        public.fn_mestre_diretoria_alternativos(c.empresa, c.mes)),
      ('cidades',             public.fn_mestre_diretoria_cidades(c.empresa, c.mes)),
      ('dia',                 public.fn_mestre_diretoria_dia(c.empresa, c.mes, 15)),
      ('equipes_dos_setores', public.fn_mestre_diretoria_equipes_dos_setores(c.empresa, c.mes)),
      ('setor',               public.fn_mestre_diretoria_setor(c.empresa, c.mes, c.setor)),
      ('setores',             public.fn_mestre_diretoria_setores(c.empresa, c.mes)),
      ('visao_geral',         public.fn_mestre_diretoria_visao_geral(c.empresa, c.mes)),
      ('linhas', (SELECT jsonb_agg(to_jsonb(l) ORDER BY to_jsonb(l)::text)
                    FROM public.fn_mestre_diretoria_linhas(c.empresa, c.mes) l))
    ) AS d(nome, r)
   WHERE d.nome = a.nome AND d.r IS DISTINCT FROM a.r;
  IF v_dif IS NOT NULL THEN
    RAISE EXCEPTION 'PROVA: a Diretoria mudou em: % — nada foi aplicado', v_dif;
  END IF;
  RAISE NOTICE 'PROVA: % respostas da Diretoria idênticas', v_total;
END
$prova$;

COMMIT;
