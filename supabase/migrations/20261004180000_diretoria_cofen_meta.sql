-- ============================================================================
-- Painel Diretoria 3.0: a meta do setor Cofen
-- ============================================================================
--
-- O placar da diretoria compara cada setor com a META DO SETOR (Cleber,
-- 04/10/2026: «a do setor sempre»). Os setores da BookPlay a tela lê direto de
-- `metas`; o Conecta Play é da PaguePlay, e quem olha o painel da BookPlay nem
-- sempre enxerga as metas da outra empresa. A meta dele passa a vir junto com
-- o resto da carteira Cofen, em `fn_diretoria_cofen` — com a mesma porta.
--
-- Só acrescenta a chave `meta` (bruto; nula sem meta cadastrada). Nada mais
-- muda na função.
--
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

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
      'meta', CASE WHEN coalesce(v_meta, 0) > 0 THEN v_meta END,
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
  '(bruto, H.O., Coren e Cofen das colunas do ERP, pela data), os operadores do Analitico e a meta do setor (20261004180000). Porta: acesso a '
  'empresa do painel e ver_painel_diretoria (ou super_admin). 20261004120000.';

REVOKE ALL ON FUNCTION public.fn_diretoria_cofen(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_diretoria_cofen(UUID, TEXT, INTEGER) TO authenticated;
ALTER FUNCTION public.fn_diretoria_cofen(UUID, TEXT, INTEGER) SET statement_timeout = '20s';

COMMIT;
