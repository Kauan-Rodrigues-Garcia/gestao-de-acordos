-- Tabela de snapshot dos totais mensais do analítico.
-- Salva totais no momento da importação para que deleções posteriores
-- (como remover acordos sem operador) não distorçam os valores exibidos nos cards.
CREATE TABLE IF NOT EXISTS public.analitico_resumo_mensal (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes              TEXT NOT NULL,  -- 'yyyy-MM'
  total_recebido   NUMERIC  NOT NULL DEFAULT 0,
  total_ho         NUMERIC  NOT NULL DEFAULT 0,
  total_operadores INTEGER  NOT NULL DEFAULT 0,
  total_pagamentos INTEGER  NOT NULL DEFAULT 0,
  periodo_inicio   DATE,
  periodo_fim      DATE,
  atualizado_em    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, mes)
);

ALTER TABLE public.analitico_resumo_mensal ENABLE ROW LEVEL SECURITY;

-- Líderes e superiores podem ler
CREATE POLICY "arm_select"
ON public.analitico_resumo_mensal FOR SELECT
USING (public.fn_can_access_empresa(empresa_id));

-- Somente quem tem acesso à empresa pode inserir/atualizar (import requer cargo lider+)
CREATE POLICY "arm_upsert"
ON public.analitico_resumo_mensal FOR ALL
USING (public.fn_can_access_empresa(empresa_id))
WITH CHECK (public.fn_can_access_empresa(empresa_id));

-- RPC que agrega os totais do mês direto no banco e salva o snapshot (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.fn_analitico_atualizar_resumo(
  p_empresa_id UUID,
  p_mes        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primeiro       DATE := (p_mes || '-01')::DATE;
  v_fim            DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                            + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_total_recebido NUMERIC;
  v_total_ho       NUMERIC;
  v_total_op       INTEGER;
  v_total_pgt      INTEGER;
  v_inicio         DATE;
  v_fim_data       DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(valor_recebido), 0),
    COALESCE(SUM(total_ho), 0),
    COUNT(DISTINCT operador_id) FILTER (WHERE operador_id IS NOT NULL),
    COUNT(*),
    MIN(data_pagamento),
    MAX(data_pagamento)
  INTO v_total_recebido, v_total_ho, v_total_op, v_total_pgt, v_inicio, v_fim_data
  FROM public.analitico_recebimentos
  WHERE empresa_id    = p_empresa_id
    AND data_pagamento BETWEEN v_primeiro AND v_fim;

  IF v_total_pgt = 0 THEN RETURN; END IF;

  INSERT INTO public.analitico_resumo_mensal (
    empresa_id, mes,
    total_recebido, total_ho, total_operadores, total_pagamentos,
    periodo_inicio, periodo_fim, atualizado_em
  ) VALUES (
    p_empresa_id, p_mes,
    v_total_recebido, v_total_ho, v_total_op, v_total_pgt,
    v_inicio, v_fim_data, NOW()
  )
  ON CONFLICT (empresa_id, mes) DO UPDATE SET
    total_recebido   = EXCLUDED.total_recebido,
    total_ho         = EXCLUDED.total_ho,
    total_operadores = EXCLUDED.total_operadores,
    total_pagamentos = EXCLUDED.total_pagamentos,
    periodo_inicio   = EXCLUDED.periodo_inicio,
    periodo_fim      = EXCLUDED.periodo_fim,
    atualizado_em    = EXCLUDED.atualizado_em;
END;
$$;
