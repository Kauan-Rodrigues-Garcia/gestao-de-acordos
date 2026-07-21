-- ============================================================
-- Migration: fn_diario_resumo_mensal v3 — fora do vínculo pela
-- data do PAGAMENTO, não por "hoje"
--
-- A v2 (20260721g) marcava fora_vinculo com
--   prox_contato <= CURRENT_DATE
-- o que reclassificava pagamentos antigos ao importar o relatório
-- MENSAL: um pagamento de 01/07 com próx. contato 15/07 estava
-- dentro do vínculo quando aconteceu, mas visto no dia 21/07 caía
-- para fora — derrubando o acumulado do operador nos Quartis /
-- Desempenho Equipes (ex.: Matheus 134 mil → 61 mil).
--
-- Regra correta: o pagamento só é fora do vínculo se o próximo
-- contato era ≤ a data em que o pagamento foi feito
-- (dia_referencia = data do pagamento; fallback = dia da moda do
-- relatório na importação).
--
-- Shape do retorno inalterado → CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_diario_resumo_mensal(
  p_empresa_id UUID,
  p_mes        TEXT   -- formato 'yyyy-MM'
)
RETURNS TABLE (
  operador_id      UUID,
  operador_usuario TEXT,
  operador_nome    TEXT,
  setor_geral      UUID,
  dia_referencia   DATE,
  fora_vinculo     BOOLEAN,
  total_recebido   NUMERIC,
  total_pagamentos BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas líder+ pode ver o resumo geral (mesma regra do analítico)
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
            )
  THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dr.operador_id,
    COALESCE(p.usuario, dr.operador_usuario)          AS operador_usuario,
    p.nome                                            AS operador_nome,
    COALESCE(eq.setor_id, p.setor_id, pi.setor_id)    AS setor_geral,
    dr.dia_referencia,
    (dr.prox_contato IS NOT NULL
      AND dr.prox_contato <= dr.dia_referencia)       AS fora_vinculo,
    SUM(dr.valor_recebido)::NUMERIC                   AS total_recebido,
    COUNT(*)::BIGINT                                  AS total_pagamentos
  FROM public.diario_recebimentos dr
  LEFT JOIN public.perfis  p  ON p.id  = dr.operador_id
  LEFT JOIN public.equipes eq ON eq.id = p.equipe_id
  LEFT JOIN public.perfis  pi ON pi.id = dr.importado_por_id
  WHERE dr.empresa_id = p_empresa_id
    AND dr.dia_referencia >= (p_mes || '-01')::DATE
    AND dr.dia_referencia <  ((p_mes || '-01')::DATE + INTERVAL '1 month')::DATE
  GROUP BY
    dr.operador_id,
    COALESCE(p.usuario, dr.operador_usuario),
    p.nome,
    COALESCE(eq.setor_id, p.setor_id, pi.setor_id),
    dr.dia_referencia,
    (dr.prox_contato IS NOT NULL AND dr.prox_contato <= dr.dia_referencia);
END;
$$;
