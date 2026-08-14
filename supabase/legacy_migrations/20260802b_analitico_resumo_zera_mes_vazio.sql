-- ═══════════════════════════════════════════════════════════════════════════
-- 20260802b — "Limpar mês" agora limpa também os cards
-- ═══════════════════════════════════════════════════════════════════════════
-- Defeito: `fn_analitico_atualizar_resumo` começava com
--
--     IF v_total_pgt = 0 THEN RETURN; END IF;
--
-- Era uma proteção contra gravar snapshot vazio numa importação que não trouxe
-- nada. Só que o mesmo `RETURN` acontece depois de "Limpar mês": as linhas são
-- apagadas, a tela chama a função para recalcular, ela vê zero pagamentos e sai
-- SEM TOCAR no snapshot. O resultado é a aba dizendo "Nenhum dado para este
-- mês" logo abaixo de cards mostrando R$ 2,4 milhões — o número velho, agora
-- sem nenhum dado por trás.
--
-- Correção: mês sem nenhuma linha APAGA o snapshot. A ausência da linha é o
-- estado certo para "não há dado" — é o que `buscarResumoMensal` devolve como
-- null e o que faz a tela exibir "Nenhum dado importado para este mês", em vez
-- de cards zerados que parecem um mês importado que rendeu zero.
--
-- A proteção original continua valendo por outro caminho: a importação só chama
-- esta função depois de inserir, então um mês que já tinha dados nunca é
-- apagado por engano. E o líder que limpa apenas o PRÓPRIO setor deixa linhas
-- de outros setores no mês — aí `v_total_pgt > 0` e o snapshot é recalculado
-- normalmente com o que sobrou.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- Mês sem nenhuma linha: o snapshot deixa de existir. Antes esta função
  -- retornava aqui e o snapshot velho continuava alimentando os cards.
  IF v_total_pgt = 0 THEN
    DELETE FROM public.analitico_resumo_mensal
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
    RETURN;
  END IF;

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

COMMENT ON FUNCTION public.fn_analitico_atualizar_resumo(UUID, TEXT) IS
  'Recalcula o snapshot mensal do analítico a partir das linhas do mês. Mês '
  'sem linhas APAGA o snapshot — sem isso, "Limpar mês" esvaziava a tabela e '
  'deixava os cards de resumo exibindo os valores do mês já apagado.';
