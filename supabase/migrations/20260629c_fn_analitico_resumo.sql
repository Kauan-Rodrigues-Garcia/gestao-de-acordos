-- ============================================================
-- Migration: fn_analitico_resumo_por_operador
-- Retorna totais agregados por operador diretamente no banco,
-- evitando a busca de todas as linhas individuais para a
-- visão do líder (que antes quebrava no limite de 1000 rows).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_analitico_resumo_por_operador(
  p_empresa_id UUID,
  p_mes        TEXT   -- formato 'yyyy-MM'
)
RETURNS TABLE (
  operador_id      UUID,
  operador_usuario TEXT,
  operador_nome    TEXT,
  total_recebido   NUMERIC,
  total_ho         NUMERIC,
  total_pagamentos BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas lider+ pode ver o resumo geral
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ar.operador_id,
    ar.operador_usuario,
    p.nome                          AS operador_nome,
    SUM(ar.valor_recebido)::NUMERIC AS total_recebido,
    SUM(ar.total_ho)::NUMERIC       AS total_ho,
    COUNT(*)::BIGINT                AS total_pagamentos
  FROM public.analitico_recebimentos ar
  LEFT JOIN public.perfis p ON p.id = ar.operador_id
  WHERE ar.empresa_id  = p_empresa_id
    AND ar.operador_id IS NOT NULL
    AND ar.data_pagamento >= (p_mes || '-01')::DATE
    AND ar.data_pagamento <= (
          DATE_TRUNC('month', (p_mes || '-01')::DATE)
          + INTERVAL '1 month'
          - INTERVAL '1 day'
        )::DATE
  GROUP BY ar.operador_id, ar.operador_usuario, p.nome
  ORDER BY total_recebido DESC;
END;
$$;
