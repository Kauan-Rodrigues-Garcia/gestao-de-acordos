-- ============================================================
-- Migration: realtime do analítico + forma_detalhe no agregado (2026-07-10)
--
-- 1) analitico_recebimentos entra na publicação supabase_realtime.
--    O dashboard (barras de meta/quartil, ranking e gráfico) já assinava
--    postgres_changes desta tabela, mas ela nunca foi publicada — os dados
--    só atualizavam ao recarregar a página. Com isto, tudo atualiza em
--    tempo real assim que o relatório analítico é importado.
--
-- 2) fn_analitico_dashboard_mes passa a devolver também `forma_detalhe`
--    (rótulo real da BookPlay: Boleto, Pix, Pix Automático, Cartão
--    Recorrente, Cartão de Crédito — NULL na PaguePlay), permitindo os
--    cards por forma de pagamento no dashboard da BookPlay.
--    DROP + CREATE porque o tipo de retorno muda.
-- ============================================================

-- ── 1. Realtime ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'analitico_recebimentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.analitico_recebimentos;
  END IF;
END $$;

-- ── 2. RPC com forma_detalhe ─────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.fn_analitico_dashboard_mes(UUID, TEXT);

CREATE FUNCTION public.fn_analitico_dashboard_mes(
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
  ORDER BY ar.data_pagamento;
END;
$$;
