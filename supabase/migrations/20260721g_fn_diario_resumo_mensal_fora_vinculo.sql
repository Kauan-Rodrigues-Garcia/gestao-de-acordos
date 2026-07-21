-- ============================================================
-- Migration: fn_diario_resumo_mensal v2 — fora do vínculo
--
-- Acordos "fora do vínculo" (prox_contato ≤ hoje — mesma regra
-- do card "Acordos ignorados" da aba do dia) NÃO contam para o
-- operador nem para a equipe: contam apenas no total GERAL do
-- setor (e no gráfico). A v1 somava tudo no operador, inflando
-- Desempenho Equipes e Quartis.
--
-- Mudanças de shape (DROP obrigatório antes do CREATE):
--  - nova coluna fora_vinculo (BOOLEAN)
--  - setor_importador → setor_geral: setor onde o valor conta no
--    card geral. Linha de operador: setor da equipe dele (ou do
--    perfil); órfã/sem vínculo: setor de quem importou.
--
-- Esta migration substitui a 20260721f (pode ser aplicada por
-- cima ou direto, sem a f).
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_diario_resumo_mensal(UUID, TEXT);

CREATE FUNCTION public.fn_diario_resumo_mensal(
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
      AND dr.prox_contato <= CURRENT_DATE)            AS fora_vinculo,
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
    (dr.prox_contato IS NOT NULL AND dr.prox_contato <= CURRENT_DATE);
END;
$$;
