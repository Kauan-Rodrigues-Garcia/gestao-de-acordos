-- Atualiza fn_analitico_destaques_dia para aceitar também p_setor_id.
-- DROP necessário porque adicionar parâmetro cria sobrecarga e gera ambiguidade.
DROP FUNCTION IF EXISTS public.fn_analitico_destaques_dia(UUID, TEXT, UUID);

CREATE FUNCTION public.fn_analitico_destaques_dia(
  p_empresa_id UUID,
  p_mes        TEXT,
  p_equipe_id  UUID DEFAULT NULL,
  p_setor_id   UUID DEFAULT NULL
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
      ar.data_pagamento               AS dia,
      ar.operador_id,
      ar.operador_usuario,
      SUM(ar.valor_recebido)::NUMERIC AS total_recebido,
      COUNT(*)::BIGINT                AS total_pagamentos
    FROM public.analitico_recebimentos ar
    JOIN public.perfis pf ON pf.id = ar.operador_id
    LEFT JOIN public.equipes eq ON eq.id = pf.equipe_id
    WHERE ar.empresa_id    = p_empresa_id
      AND ar.operador_id   IS NOT NULL
      AND ar.data_pagamento >= (p_mes || '-01')::DATE
      AND ar.data_pagamento <= (
            DATE_TRUNC('month', (p_mes || '-01')::DATE)
            + INTERVAL '1 month' - INTERVAL '1 day'
          )::DATE
      AND (p_equipe_id IS NULL OR pf.equipe_id = p_equipe_id)
      AND (p_setor_id  IS NULL OR eq.setor_id  = p_setor_id)
    GROUP BY ar.data_pagamento, ar.operador_id, ar.operador_usuario
  ) daily
  LEFT JOIN public.perfis p ON p.id = daily.operador_id
  ORDER BY daily.dia ASC, daily.total_recebido DESC;
END;
$$;
