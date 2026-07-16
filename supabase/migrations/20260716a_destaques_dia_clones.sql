-- ═══════════════════════════════════════════════════════════════════════════
-- 20260716a — Destaques do dia: incluir operadores CLONADOS (BookPlay)
--
-- fn_analitico_destaques_dia filtrava só pelo setor/equipe DE ORIGEM do
-- operador (pf.equipe_id / eq.setor_id). Um operador clonado para a equipe
-- Digital do Play 4 (equipe_operadores_clones) tem equipe/setor de origem
-- diferentes, então sumia dos destaques ao filtrar por essa equipe OU pelo
-- setor Play 4 — mesmo sendo o destaque do dia.
--
-- Mesma regra de setoresDoOperador (TS): o recebimento conta no setor/equipe
-- próprio E em todos onde ele é clone. Aqui o filtro passa a aceitar também os
-- vínculos de clone via equipe_operadores_clones.
--
-- DROP + CREATE mantém a mesma assinatura de 20260629h.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.fn_analitico_destaques_dia(UUID, TEXT, UUID, UUID);

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
      -- Equipe: a de origem OU uma em que o operador é clone
      AND (
            p_equipe_id IS NULL
            OR pf.equipe_id = p_equipe_id
            OR EXISTS (
                 SELECT 1
                 FROM public.equipe_operadores_clones c
                 WHERE c.operador_id = ar.operador_id
                   AND c.equipe_id   = p_equipe_id
               )
          )
      -- Setor: o de origem OU o dono de uma equipe em que ele é clone
      AND (
            p_setor_id IS NULL
            OR eq.setor_id = p_setor_id
            OR EXISTS (
                 SELECT 1
                 FROM public.equipe_operadores_clones c
                 JOIN public.equipes ec ON ec.id = c.equipe_id
                 WHERE c.operador_id = ar.operador_id
                   AND ec.setor_id   = p_setor_id
               )
          )
    GROUP BY ar.data_pagamento, ar.operador_id, ar.operador_usuario
  ) daily
  LEFT JOIN public.perfis p ON p.id = daily.operador_id
  ORDER BY daily.dia ASC, daily.total_recebido DESC;
END;
$$;
