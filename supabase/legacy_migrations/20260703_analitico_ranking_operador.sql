-- ============================================================
-- Migration: liberar o ranking do Analítico para operadores
--
-- O ranking usa fn_analitico_resumo_por_operador (SECURITY DEFINER),
-- que até então retornava vazio para quem não fosse líder+. Agora o
-- cargo 'operador' também pode consultar o resumo agregado por operador,
-- para que a aba Ranking apareça na visão do operador.
--
-- O isolamento multi-tenant continua garantido por fn_can_access_empresa:
-- o operador só vê o ranking da própria empresa.
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
  -- Qualquer usuário da empresa (incluindo operador) pode ver o ranking geral
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['operador','lider','elite','gerencia','diretoria','administrador','super_admin']
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
