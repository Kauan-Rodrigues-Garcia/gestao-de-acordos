-- ============================================================
-- Fix: "column reference valor_validado is ambiguous" (2026-07-21)
--
-- fn_relatorio_status_validacao declara `valor_validado` como coluna de
-- retorno (RETURNS TABLE) — isso cria uma variável de mesmo nome visível
-- dentro de toda a função. As CTEs valid_analitico/valid_diario liam a
-- coluna `relatorio_validacoes_dia.valor_validado` sem qualificar o alias
-- da tabela, então o Postgres não sabia se era a coluna ou a variável de
-- saída — e a função inteira falhava silenciosamente (o client engolia o
-- erro e mostrava "sem dado" no lugar).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_relatorio_status_validacao(
  p_empresa_id UUID, p_setor_id UUID, p_mes INTEGER, p_ano INTEGER
) RETURNS TABLE(
  origem TEXT, dias_com_dado INTEGER, dias_validados INTEGER,
  valor_atual NUMERIC, valor_validado NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio DATE := make_date(p_ano, p_mes, 1);
  v_fim    DATE := (v_inicio + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  RETURN QUERY
  WITH atual_analitico AS (
    SELECT ar.data_pagamento AS dia, SUM(ar.valor_recebido) AS total
    FROM public.analitico_recebimentos ar
    LEFT JOIN public.perfis p_op  ON p_op.id  = ar.operador_id
    LEFT JOIN public.perfis p_imp ON p_imp.id = ar.importado_por_id
    WHERE ar.empresa_id = p_empresa_id
      AND COALESCE(ar.setor_id, p_op.setor_id, p_imp.setor_id) = p_setor_id
      AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    GROUP BY ar.data_pagamento
  ),
  valid_analitico AS (
    SELECT rvd.dia_referencia AS dia, rvd.valor_validado AS total
    FROM public.relatorio_validacoes_dia rvd
    WHERE rvd.empresa_id = p_empresa_id AND rvd.setor_id = p_setor_id AND rvd.origem = 'analitico'
      AND rvd.dia_referencia BETWEEN v_inicio AND v_fim
  ),
  atual_diario AS (
    SELECT dia_referencia AS dia, SUM(valor_recebido) AS total
    FROM public.diario_recebimentos
    WHERE empresa_id = p_empresa_id AND setor_id = p_setor_id
      AND dia_referencia BETWEEN v_inicio AND v_fim
    GROUP BY dia_referencia
  ),
  valid_diario AS (
    SELECT rvd.dia_referencia AS dia, rvd.valor_validado AS total
    FROM public.relatorio_validacoes_dia rvd
    WHERE rvd.empresa_id = p_empresa_id AND rvd.setor_id = p_setor_id AND rvd.origem = 'diario'
      AND rvd.dia_referencia BETWEEN v_inicio AND v_fim
  )
  SELECT 'analitico'::TEXT,
         (SELECT COUNT(*) FROM atual_analitico)::INTEGER,
         (SELECT COUNT(*) FROM atual_analitico a JOIN valid_analitico v ON v.dia = a.dia AND v.total = a.total)::INTEGER,
         (SELECT COALESCE(SUM(total), 0) FROM atual_analitico),
         (SELECT COALESCE(SUM(total), 0) FROM valid_analitico)
  UNION ALL
  SELECT 'diario'::TEXT,
         (SELECT COUNT(*) FROM atual_diario)::INTEGER,
         (SELECT COUNT(*) FROM atual_diario a JOIN valid_diario v ON v.dia = a.dia AND v.total = a.total)::INTEGER,
         (SELECT COALESCE(SUM(total), 0) FROM atual_diario),
         (SELECT COALESCE(SUM(total), 0) FROM valid_diario);
END;
$$;
