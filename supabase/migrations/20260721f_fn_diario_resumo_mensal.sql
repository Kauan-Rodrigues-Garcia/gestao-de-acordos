-- ============================================================
-- Migration: fn_diario_resumo_mensal
-- Agrega o recebimento diário do mês direto no banco para as
-- abas do Painel Líder (Desempenho Equipes / Quartis / Gráfico
-- recebimento — PaguePlay). Antes o cliente baixava TODAS as
-- linhas do mês paginadas de 1000 em 1000 + a tabela de perfis;
-- agora vem um agregado pequeno (operador × dia) em 1 requisição.
--
-- Uma linha por (operador|órfão, dia): total e quantidade.
-- Órfãos (operador_id NULL) vêm com o setor de quem importou
-- (setor_importador) — mesma regra dos órfãos do analítico.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_diario_resumo_mensal(
  p_empresa_id UUID,
  p_mes        TEXT   -- formato 'yyyy-MM'
)
RETURNS TABLE (
  operador_id      UUID,
  operador_usuario TEXT,
  operador_nome    TEXT,
  setor_importador UUID,
  dia_referencia   DATE,
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
    COALESCE(p.usuario, dr.operador_usuario)  AS operador_usuario,
    p.nome                                    AS operador_nome,
    pi.setor_id                               AS setor_importador,
    dr.dia_referencia,
    SUM(dr.valor_recebido)::NUMERIC           AS total_recebido,
    COUNT(*)::BIGINT                          AS total_pagamentos
  FROM public.diario_recebimentos dr
  LEFT JOIN public.perfis p  ON p.id  = dr.operador_id
  LEFT JOIN public.perfis pi ON pi.id = dr.importado_por_id
  WHERE dr.empresa_id = p_empresa_id
    AND dr.dia_referencia >= (p_mes || '-01')::DATE
    AND dr.dia_referencia <  ((p_mes || '-01')::DATE + INTERVAL '1 month')::DATE
  GROUP BY
    dr.operador_id,
    COALESCE(p.usuario, dr.operador_usuario),
    p.nome,
    pi.setor_id,
    dr.dia_referencia;
END;
$$;
