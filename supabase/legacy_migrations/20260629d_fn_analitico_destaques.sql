-- ============================================================
-- Migration: fn_analitico_destaques_dia
-- Retorna o operador com maior total recebido por dia do mês.
-- Usado na aba "Destaques do dia" da visão líder.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_analitico_destaques_dia(
  p_empresa_id UUID,
  p_mes        TEXT   -- formato 'yyyy-MM'
)
RETURNS TABLE (
  dia              DATE,
  operador_id      UUID,
  operador_usuario TEXT,
  operador_nome    TEXT,
  total_recebido   NUMERIC,
  total_pagamentos BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  -- Por dia: soma recebido por operador, depois pega o #1 de cada dia
  RETURN QUERY
  SELECT DISTINCT ON (daily.dia)
    daily.dia,
    daily.operador_id,
    daily.operador_usuario,
    p.nome          AS operador_nome,
    daily.total_recebido,
    daily.total_pagamentos
  FROM (
    SELECT
      ar.data_pagamento                AS dia,
      ar.operador_id,
      ar.operador_usuario,
      SUM(ar.valor_recebido)::NUMERIC  AS total_recebido,
      COUNT(*)::BIGINT                 AS total_pagamentos
    FROM public.analitico_recebimentos ar
    WHERE ar.empresa_id  = p_empresa_id
      AND ar.operador_id IS NOT NULL
      AND ar.data_pagamento >= (p_mes || '-01')::DATE
      AND ar.data_pagamento <= (
            DATE_TRUNC('month', (p_mes || '-01')::DATE)
            + INTERVAL '1 month'
            - INTERVAL '1 day'
          )::DATE
    GROUP BY ar.data_pagamento, ar.operador_id, ar.operador_usuario
  ) daily
  LEFT JOIN public.perfis p ON p.id = daily.operador_id
  ORDER BY daily.dia ASC, daily.total_recebido DESC;
END;
$$;
