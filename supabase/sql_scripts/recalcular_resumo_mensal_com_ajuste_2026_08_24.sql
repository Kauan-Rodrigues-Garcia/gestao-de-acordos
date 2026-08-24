-- ============================================================================
-- Recalcular o snapshot mensal dos meses que ja tinham ajuste manual
-- ============================================================================
--
-- Rodar UMA VEZ, depois da migration 20260824140000. Nao e migration: e o
-- recalculo de um passivo, e um banco novo nao tem passivo nenhum.
--
-- ## Por que so este numero precisa de recalculo
--
-- O ajuste manual e somado na LEITURA. Toda tela que le recebimento passou a
-- enxergar os ajustes ANTIGOS no mesmo instante em que o codigo subiu — nao ha
-- dado a corrigir, porque nunca houve dado gravado com o total errado.
--
-- `analitico_resumo_mensal` e a excecao: ela e um SNAPSHOT, gravado por
-- `fn_analitico_atualizar_resumo`. A funcao passou a somar o ajuste, mas a
-- linha ja gravada continua com o numero de antes ate a funcao rodar de novo
-- para aquele mes — o que so acontece numa importacao do Analitico ou ao
-- limpar o mes.
--
-- ## Por que nao chamar a funcao
--
-- A primeira coisa que ela faz e `fn_can_access_empresa()`, e no SQL Editor nao
-- ha sessao de usuario — ela retornaria sem fazer nada. Entao o snapshot e
-- refeito aqui com a MESMA conta que ela faria, do mesmo jeito que a migration
-- 20260818280000 ja precisou fazer.
--
-- ## O recorte
--
-- So os meses que TEM ajuste nao cancelado. Recalcular o banco inteiro seria
-- reescrever centenas de linhas corretas para consertar as poucas erradas.
-- ============================================================================

-- ── 1. ANTES: o que esta desatualizado ─────────────────────────────────────
--
-- Cada linha e um mes cujo snapshot ainda nao conhece o ajuste. `diferenca` e
-- exatamente o que vai entrar.
SELECT
  e.slug                        AS empresa,
  s.mes,
  s.total_recebido              AS snapshot_hoje,
  aj.soma                       AS ajuste_do_mes,
  s.total_recebido + aj.soma    AS ficara
FROM public.analitico_resumo_mensal s
JOIN public.empresas e ON e.id = s.empresa_id
JOIN (
  SELECT a.empresa_id,
         to_char(a.mes_referencia, 'YYYY-MM') AS mes,
         SUM(a.valor)                          AS soma
    FROM public.analitico_ajustes_manuais a
   WHERE NOT a.cancelado
   GROUP BY 1, 2
  HAVING SUM(a.valor) <> 0
) aj ON aj.empresa_id = s.empresa_id AND aj.mes = s.mes
ORDER BY e.slug, s.mes;


-- ── 2. O RECALCULO ─────────────────────────────────────────────────────────
--
-- Reescreve do zero as tres colunas que o ajuste afeta, a partir das duas
-- fontes. Nao soma em cima do que esta gravado: somar seria errado se este
-- script rodasse duas vezes, e ele precisa poder rodar duas vezes.
--
-- `total_pagamentos` fica intacto de proposito — ajuste e dinheiro, nao e
-- pagamento, e conta-lo estragaria o ticket medio.

WITH meses AS (
  -- Os meses que tem ajuste. E daqui que sai o recorte.
  SELECT a.empresa_id,
         date_trunc('month', a.mes_referencia)::DATE AS primeiro,
         to_char(a.mes_referencia, 'YYYY-MM')        AS mes
    FROM public.analitico_ajustes_manuais a
   WHERE NOT a.cancelado
   GROUP BY 1, 2, 3
  HAVING SUM(a.valor) <> 0
),
do_relatorio AS (
  SELECT m.empresa_id, m.mes,
         COALESCE(SUM(r.valor_recebido), 0) AS recebido,
         COALESCE(SUM(r.total_ho), 0)       AS ho
    FROM meses m
    LEFT JOIN public.analitico_recebimentos r
      ON r.empresa_id = m.empresa_id
     AND r.data_pagamento >= m.primeiro
     AND r.data_pagamento <  (m.primeiro + INTERVAL '1 month')
   GROUP BY 1, 2
),
do_ajuste AS (
  SELECT m.empresa_id, m.mes,
         COALESCE(SUM(a.valor), 0) AS valor
    FROM meses m
    JOIN public.analitico_ajustes_manuais a
      ON a.empresa_id     = m.empresa_id
     AND a.mes_referencia = m.primeiro
     AND NOT a.cancelado
   GROUP BY 1, 2
),
operadores AS (
  -- Quem so tem ajuste no mes conta como operador com recebimento: ele tem.
  SELECT m.empresa_id, m.mes, COUNT(DISTINCT x.op) AS total
    FROM meses m
    JOIN LATERAL (
      SELECT r.operador_id AS op
        FROM public.analitico_recebimentos r
       WHERE r.empresa_id = m.empresa_id
         AND r.data_pagamento >= m.primeiro
         AND r.data_pagamento <  (m.primeiro + INTERVAL '1 month')
         AND r.operador_id IS NOT NULL
      UNION
      SELECT a.operador_id
        FROM public.analitico_ajustes_manuais a
       WHERE a.empresa_id     = m.empresa_id
         AND a.mes_referencia = m.primeiro
         AND NOT a.cancelado
    ) x ON TRUE
   GROUP BY 1, 2
)
UPDATE public.analitico_resumo_mensal s
   SET total_recebido   = rel.recebido + aju.valor,
       -- Mesma constante do trigger de `analitico_recebimentos` e de
       -- `PP_HO_PERCENTUAL` no frontend. So a PaguePlay tem H.O.
       total_ho         = rel.ho + CASE
                            WHEN e.slug = 'pagueplay'
                              THEN ROUND(aju.valor * public.fn_pp_ho_percentual(), 2)
                            ELSE 0
                          END,
       total_operadores = ope.total,
       atualizado_em    = NOW()
  FROM do_relatorio rel
  JOIN do_ajuste   aju ON aju.empresa_id = rel.empresa_id AND aju.mes = rel.mes
  JOIN operadores  ope ON ope.empresa_id = rel.empresa_id AND ope.mes = rel.mes
  JOIN public.empresas e ON e.id = rel.empresa_id
 WHERE s.empresa_id = rel.empresa_id
   AND s.mes        = rel.mes;


-- ── 3. DEPOIS: a conferencia ───────────────────────────────────────────────
--
-- Esperado: `diferenca` igual a ZERO em toda linha. Qualquer outro numero
-- significa que o snapshot ainda nao bate com relatorio + ajuste.
SELECT
  e.slug  AS empresa,
  s.mes,
  s.total_recebido,
  rel.recebido + aj.soma        AS deveria_ser,
  s.total_recebido - (rel.recebido + aj.soma) AS diferenca
FROM public.analitico_resumo_mensal s
JOIN public.empresas e ON e.id = s.empresa_id
JOIN (
  SELECT a.empresa_id,
         to_char(a.mes_referencia, 'YYYY-MM') AS mes,
         SUM(a.valor)                          AS soma
    FROM public.analitico_ajustes_manuais a
   WHERE NOT a.cancelado
   GROUP BY 1, 2
  HAVING SUM(a.valor) <> 0
) aj ON aj.empresa_id = s.empresa_id AND aj.mes = s.mes
JOIN LATERAL (
  SELECT COALESCE(SUM(r.valor_recebido), 0) AS recebido
    FROM public.analitico_recebimentos r
   WHERE r.empresa_id = s.empresa_id
     AND to_char(r.data_pagamento, 'YYYY-MM') = s.mes
) rel ON TRUE
ORDER BY e.slug, s.mes;
