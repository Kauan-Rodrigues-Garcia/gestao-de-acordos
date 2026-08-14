-- ============================================================
-- Migration: ranking do Analítico restrito à equipe do operador
--
-- Substitui 20260703_analitico_ranking_operador.sql.
--
-- Regra:
--   • Líder+ (lider/elite/gerencia/diretoria/administrador/super_admin):
--     vê o ranking de TODOS os operadores da empresa (o filtro por
--     setor/equipe da visão do líder continua sendo feito no frontend).
--   • Operador: vê SOMENTE o ranking da própria equipe (perfis.equipe_id).
--     A equipe é derivada de auth.uid() no servidor — o operador não
--     consegue consultar outra equipe passando parâmetros diferentes.
--     Operador sem equipe (equipe_id NULL) vê apenas a própria linha.
--
-- Isolamento multi-tenant continua garantido por fn_can_access_empresa.
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
DECLARE
  v_is_lider     BOOLEAN;
  v_equipe_id    UUID;
BEGIN
  -- Qualquer usuário da empresa (incluindo operador) pode consultar
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['operador','lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  -- Líder+ vê tudo; operador é restringido à própria equipe (server-side)
  v_is_lider := public.fn_user_has_any_role(
                  ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
                );

  IF NOT v_is_lider THEN
    SELECT equipe_id INTO v_equipe_id
    FROM public.perfis
    WHERE id = auth.uid();
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
    AND (
      -- Líder+ vê todos os operadores da empresa
      v_is_lider
      -- Operador com equipe: só a própria equipe
      OR (v_equipe_id IS NOT NULL AND p.equipe_id = v_equipe_id)
      -- Operador sem equipe: apenas a própria linha
      OR (v_equipe_id IS NULL AND ar.operador_id = auth.uid())
    )
  GROUP BY ar.operador_id, ar.operador_usuario, p.nome
  ORDER BY total_recebido DESC;
END;
$$;
