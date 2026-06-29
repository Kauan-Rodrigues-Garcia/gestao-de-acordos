-- Após importação analítico, marca automaticamente como 'pago' os acordos de cartão
-- onde o mesmo operador, mesmo código e a linha aparece no analítico como recebido.
-- Sincroniza também valor (analítico tem prioridade) e data de pagamento (vencimento).
CREATE OR REPLACE FUNCTION public.fn_sincronizar_cartoes_pagos(
  p_empresa_id UUID,
  p_mes        TEXT
)
RETURNS INTEGER  -- quantidade de acordos atualizados
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primeiro DATE := (p_mes || '-01')::DATE;
  v_fim      DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_count    INTEGER := 0;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN 0; END IF;

  -- 1. Atualiza acordos onde a linha analítica de cartão bate com o mesmo operador
  WITH matches AS (
    SELECT DISTINCT ON (a.id)
      a.id          AS acordo_id,
      ar.valor_recebido,
      ar.data_pagamento,
      ar.id         AS linha_id
    FROM public.analitico_recebimentos ar
    JOIN public.acordos a
      ON  a.empresa_id   = p_empresa_id
      AND a.instituicao  = ar.codigo
      AND a.operador_id  = ar.operador_id
      AND a.tipo_vinculo = 'direto'
      AND a.status      <> 'pago'
    WHERE ar.empresa_id      = p_empresa_id
      AND ar.forma_pagamento = 'cartao'
      AND ar.operador_id     IS NOT NULL
      AND ar.data_pagamento  BETWEEN v_primeiro AND v_fim
    ORDER BY a.id, ar.data_pagamento DESC
  )
  UPDATE public.acordos SET
    status     = 'pago',
    valor      = m.valor_recebido,
    vencimento = m.data_pagamento
  FROM matches m
  WHERE public.acordos.id = m.acordo_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 2. Marca as linhas analíticas correspondentes como tabuladas
  UPDATE public.analitico_recebimentos ar
  SET   status_tabulacao = 'tabulado',
        acordo_id        = a.id
  FROM  public.acordos a
  WHERE ar.empresa_id       = p_empresa_id
    AND ar.forma_pagamento  = 'cartao'
    AND ar.operador_id      IS NOT NULL
    AND ar.data_pagamento   BETWEEN v_primeiro AND v_fim
    AND a.empresa_id        = p_empresa_id
    AND a.instituicao       = ar.codigo
    AND a.operador_id       = ar.operador_id
    AND a.tipo_vinculo      = 'direto'
    AND a.status            = 'pago'
    AND ar.status_tabulacao <> 'tabulado';

  RETURN v_count;
END;
$$;
