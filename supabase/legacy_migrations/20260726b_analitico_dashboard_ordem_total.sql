-- ═══════════════════════════════════════════════════════════════════════════
-- 20260726b — fn_analitico_dashboard_mes: ordenação total p/ paginação segura
-- ═══════════════════════════════════════════════════════════════════════════
-- Bug: o dashboard da PaguePlay lê essa RPC SEM paginar. Quando os grupos
-- (dia × operador × forma × forma_detalhe × status) passam de 1000 linhas —
-- acontece já com ~49 operadores num mês cheio — o PostgREST corta em
-- max_rows=1000 e o "Total recebido" do dashboard fica MENOR que o relatório.
--
-- Correção em duas frentes:
--   1) Aqui: ORDER BY passa a ser a chave COMPLETA do GROUP BY (ordem total),
--      condição necessária para paginar por range sem duplicar/perder linha.
--   2) No cliente (buscarAnaliticoDashboardMes): passa a paginar em blocos de
--      1000 e concatenar.
--
-- Apenas o ORDER BY muda; tipo de retorno idêntico → CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes(
  p_empresa_id UUID,
  p_mes        TEXT   -- 'yyyy-MM'
)
RETURNS TABLE (
  dia              DATE,
  operador_id      UUID,
  forma_pagamento  TEXT,
  forma_detalhe    TEXT,
  status_tabulacao TEXT,
  total            NUMERIC,
  total_ho         NUMERIC,
  qtd              BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_lider BOOLEAN;
  v_inicio   DATE := (p_mes || '-01')::DATE;
  v_fim      DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  v_is_lider := public.fn_user_has_any_role(
                  ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
                );

  RETURN QUERY
  SELECT
    ar.data_pagamento               AS dia,
    ar.operador_id,
    ar.forma_pagamento,
    ar.forma_detalhe,
    ar.status_tabulacao,
    SUM(ar.valor_recebido)::NUMERIC AS total,
    SUM(ar.total_ho)::NUMERIC       AS total_ho,
    COUNT(*)::BIGINT                AS qtd
  FROM public.analitico_recebimentos ar
  WHERE ar.empresa_id     = p_empresa_id
    AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    AND (v_is_lider OR ar.operador_id = auth.uid())
  GROUP BY ar.data_pagamento, ar.operador_id, ar.forma_pagamento,
           ar.forma_detalhe, ar.status_tabulacao
  -- Ordem TOTAL (todas as chaves do GROUP BY) — sem isso, paginar por range
  -- entre páginas fica indeterminado e o total pode duplicar/perder linhas.
  ORDER BY ar.data_pagamento,
           ar.operador_id      NULLS LAST,
           ar.forma_pagamento  NULLS LAST,
           ar.forma_detalhe    NULLS LAST,
           ar.status_tabulacao NULLS LAST;
END;
$$;
