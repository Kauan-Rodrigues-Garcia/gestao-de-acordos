-- ============================================================================
-- O resumo mensal passa a enxergar o ajuste manual
-- ============================================================================
--
-- ## O problema
--
-- O ajuste manual de recebimento (migration 20260823150000) e somado na
-- LEITURA: ele vive em `analitico_ajustes_manuais` e nunca toca
-- `analitico_recebimentos`. Isso e proposital — desligar a correcao no dia em
-- que o ERP for consertado e parar de somar, sem desfazer nada.
--
-- So que `fn_analitico_atualizar_resumo` agrega DENTRO do banco, direto de
-- `analitico_recebimentos`, e por isso era o unico total do sistema que
-- ignorava o ajuste. O snapshot em `analitico_resumo_mensal` alimenta o card de
-- total do mes na aba Analitico: o lider lancava R$ 10.000, via o numero subir
-- em todo lugar, e aquele card ficava para tras.
--
-- ## O que muda
--
--   * `total_recebido` soma os ajustes nao cancelados da competencia;
--   * `total_ho` acompanha, com a MESMA constante do resto do sistema (24,96%)
--     e so na PaguePlay — na BookPlay `total_ho` e zero em toda linha, e um
--     valor aqui faria o ajuste ser o unico registro com H.O. da operacao;
--   * `total_operadores` conta tambem quem so tem ajuste no mes;
--   * `total_pagamentos` NAO muda. Ajuste e dinheiro, nao e pagamento, e conta-lo
--     estragaria o ticket medio (`recebido / pagamentos`);
--   * o mes com ajuste e sem relatorio deixa de apagar o snapshot.
--
-- ## O que NAO muda
--
-- `fn_analitico_destaques_dia` continua sem o ajuste, por decisao: ela premia
-- quem recebeu mais NAQUELE dia, e o ajuste nao tem dia — ele e de competencia
-- e cairia no dia 1o, fabricando um destaque que ninguem reconheceria.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.fn_analitico_atualizar_resumo(
  p_empresa_id UUID, p_mes TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  -- Do ajuste manual.
  v_aj_valor       NUMERIC;
  v_aj_operadores  UUID[];
  v_eh_pp          BOOLEAN;
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

  -- ── O ajuste manual da competencia ────────────────────────────────────────
  --
  -- Bloco proprio, e nao um UNION na consulta acima: `total_pagamentos` sai de
  -- um `COUNT(*)` que o ajuste NAO pode inflar, e misturar as duas fontes numa
  -- consulta so tornaria isso facil de esquecer na proxima edicao.
  SELECT
    COALESCE(SUM(a.valor), 0),
    COALESCE(ARRAY_AGG(DISTINCT a.operador_id), ARRAY[]::UUID[])
  INTO v_aj_valor, v_aj_operadores
  FROM public.analitico_ajustes_manuais a
  WHERE a.empresa_id     = p_empresa_id
    AND a.mes_referencia = v_primeiro
    AND NOT a.cancelado;

  SELECT (e.slug = 'pagueplay') INTO v_eh_pp
    FROM public.empresas e WHERE e.id = p_empresa_id;

  -- Mes sem NADA — nem relatorio, nem ajuste: o snapshot deixa de existir.
  -- Antes esta funcao retornava aqui e o snapshot velho continuava alimentando
  -- os cards. A condicao ganhou o ajuste: um mes que so tem lancamento manual
  -- tem sim um total a mostrar.
  IF v_total_pgt = 0 AND v_aj_valor = 0 THEN
    DELETE FROM public.analitico_resumo_mensal
     WHERE empresa_id = p_empresa_id AND mes = p_mes;
    RETURN;
  END IF;

  v_total_recebido := v_total_recebido + v_aj_valor;
  -- `fn_pp_ho_percentual()` e a MESMA constante que o trigger de
  -- `analitico_recebimentos` aplica (migration 20260818280000) e que
  -- `PP_HO_PERCENTUAL` guarda no frontend. Escrever 0.2496 aqui criaria o
  -- quarto lugar com o mesmo numero.
  IF COALESCE(v_eh_pp, FALSE) THEN
    v_total_ho := v_total_ho + ROUND(v_aj_valor * public.fn_pp_ho_percentual(), 2);
  END IF;

  -- Quem so tem ajuste no mes conta como operador com recebimento: ele tem.
  SELECT COUNT(DISTINCT x.op) INTO v_total_op
    FROM (
      SELECT r.operador_id AS op
        FROM public.analitico_recebimentos r
       WHERE r.empresa_id = p_empresa_id
         AND r.data_pagamento BETWEEN v_primeiro AND v_fim
         AND r.operador_id IS NOT NULL
      UNION
      SELECT UNNEST(v_aj_operadores)
    ) x
   WHERE x.op IS NOT NULL;

  -- Sem linha de relatorio o periodo nao existe; o ajuste e de competencia, e
  -- o mes inteiro e a resposta honesta para "de quando ate quando".
  v_inicio   := COALESCE(v_inicio, v_primeiro);
  v_fim_data := COALESCE(v_fim_data, v_fim);

  INSERT INTO public.analitico_resumo_mensal (
    empresa_id, mes,
    total_recebido, total_ho, total_operadores, total_pagamentos,
    periodo_inicio, periodo_fim, atualizado_em
  ) VALUES (
    p_empresa_id, p_mes,
    v_total_recebido, v_total_ho, v_total_op, v_total_pgt,
    v_inicio, v_fim_data, NOW()
  )
  ON CONFLICT (empresa_id, mes) DO UPDATE
    SET total_recebido   = EXCLUDED.total_recebido,
        total_ho         = EXCLUDED.total_ho,
        total_operadores = EXCLUDED.total_operadores,
        total_pagamentos = EXCLUDED.total_pagamentos,
        periodo_inicio   = EXCLUDED.periodo_inicio,
        periodo_fim      = EXCLUDED.periodo_fim,
        atualizado_em    = NOW();
END;
$function$;

COMMENT ON FUNCTION public.fn_analitico_atualizar_resumo(UUID, TEXT) IS
  'Snapshot mensal do analitico. Soma o ajuste manual nao cancelado da '
  'competencia em total_recebido, total_ho (so PaguePlay) e total_operadores; '
  'total_pagamentos fica intacto — ajuste nao e pagamento. Ver 20260824140000.';

COMMIT;
