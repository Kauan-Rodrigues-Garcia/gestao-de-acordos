-- ═══════════════════════════════════════════════════════════════════════════
-- OPERAÇÃO B — ESCRITA (14/09/2026)
--
-- ⚠ JÁ APLICADA em 14/09/2026 pelo SQL Editor. NÃO RODE DE NOVO: cada execução
--   cria outra leva de notificações. Conferência em
--   `verificar_pix_automatico_pos_backfill_20260914.sql`.
--
-- Avisa o operador dos acordos PIX Automático de SETEMBRO/2026 lançados só com
-- o valor da parcela.
--
-- O que altera: INSERT em public.notificacoes (uma por acordo). Não mexe em
-- acordo nem em registro do Pix.
-- Linhas esperadas: 35 (Consulta 1, BOOKPLAY, 2026-09):
--   • 31 da situação "2b" — fora do Pix, só a parcela: não foi registrado;
--   • 4  da situação "3"  — já no Pix, com valor menor que o total do acordo.
-- Só operador ativo (em setembro todos estão ativos).
--
-- É UM comando só. Devolve quantas notificações foram criadas, por caso.
-- ═══════════════════════════════════════════════════════════════════════════

WITH acordo_pix AS (
  SELECT
    a.empresa_id,
    a.operador_id,
    lower(trim(a.nr_cliente))                    AS nr_norm,
    trim(min(a.nr_cliente))                      AS nr_cliente,
    to_char(min(a.data_cadastro), 'YYYY-MM')     AS mes_cadastro,
    count(*)                                     AS linhas,
    max(COALESCE(a.parcelas, 1))                 AS parcelas,
    max(a.valor)                                 AS maior_valor,
    sum(a.valor)                                 AS soma_linhas,
    max(a.valor_total)                           AS valor_total,
    bool_and(a.status = 'nao_pago')              AS todos_nao_pago,
    array_agg(DISTINCT a.acordo_grupo_id)
      FILTER (WHERE a.acordo_grupo_id IS NOT NULL) AS grupos
  FROM public.acordos a
  WHERE a.tipo = 'pix_automatico'
    AND trim(COALESCE(a.nr_cliente, '')) <> ''
  GROUP BY a.empresa_id, a.operador_id, lower(trim(a.nr_cliente))
),
classificado AS (
  SELECT
    ap.*,
    (SELECT max(p.valor) FROM public.pix_automatico_acordos p
      WHERE p.empresa_id = ap.empresa_id AND p.operador_id = ap.operador_id
        AND public.fn_pix_nr_normalizar(p.nr_cliente) = ap.nr_norm)      AS valor_no_pix,
    EXISTS (SELECT 1 FROM public.pix_automatico_acordos p
      WHERE p.empresa_id = ap.empresa_id AND p.operador_id <> ap.operador_id
        AND public.fn_pix_nr_normalizar(p.nr_cliente) = ap.nr_norm)      AS nr_com_outro,
    GREATEST(COALESCE(ap.valor_total, 0), ap.soma_linhas,
      COALESCE((SELECT sum(g.valor) FROM public.acordos g
                 WHERE g.acordo_grupo_id = ANY (ap.grupos)), 0))         AS total_estimado,
    (ap.parcelas > 1 OR ap.linhas > 1
      OR (ap.valor_total IS NOT NULL AND ap.valor_total > ap.maior_valor)
      OR EXISTS (SELECT 1 FROM public.acordos g
                  WHERE g.acordo_grupo_id = ANY (ap.grupos)
                    AND g.tipo <> 'pix_automatico'))                     AS so_parcela
  FROM acordo_pix ap
),
alvo AS (
  SELECT
    c.*,
    CASE WHEN c.valor_no_pix IS NULL THEN '2b' ELSE '3' END AS caso
  FROM classificado c
  JOIN public.perfis pf ON pf.id = c.operador_id
  WHERE c.mes_cadastro = '2026-09'
    AND c.so_parcela
    AND pf.ativo
    AND pf.situacao = 'ativo'
    AND (
      -- 3: já no Pix, com valor menor que o total do acordo
      (c.valor_no_pix IS NOT NULL AND c.valor_no_pix < c.total_estimado)
      -- 2b: fora do Pix, só a parcela
      OR (c.valor_no_pix IS NULL AND NOT c.todos_nao_pago AND NOT c.nr_com_outro)
    )
),
enviadas AS (
  INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
  SELECT
    a.operador_id,
    a.empresa_id,
    CASE a.caso
      WHEN '2b' THEN 'PIX Automático lançado só com a parcela — NR ' || a.nr_cliente
      ELSE           'Pix Automático com valor de parcela — NR ' || a.nr_cliente
    END,
    CASE a.caso
      WHEN '2b' THEN
        'O acordo do NR ' || a.nr_cliente || ' foi lançado como PIX Automático com o valor de '
        || 'uma parcela (R$ ' || public.fn_pix_valor_br(a.maior_valor) || '). No Pix Automático o '
        || 'valor precisa ser o TOTAL do acordo, e por isso ele não foi registrado lá. Confira o '
        || 'acordo, informe o valor total e registre no Pix Automático.'
      ELSE
        'O NR ' || a.nr_cliente || ' está no Pix Automático com R$ '
        || public.fn_pix_valor_br(a.valor_no_pix) || ', mas o acordo soma R$ '
        || public.fn_pix_valor_br(a.total_estimado) || '. O Pix Automático usa o VALOR TOTAL do '
        || 'acordo: reajuste o valor do registro na aba Pix Automático (se já estiver aprovado, '
        || 'fale com o líder).'
    END,
    false,
    CASE a.caso WHEN '2b' THEN '/acordos' ELSE '/acordos?tab=pix' END
  FROM alvo a
  RETURNING titulo
)
SELECT
  count(*) FILTER (WHERE titulo LIKE 'PIX Automático lançado só com a parcela%') AS caso_2b,
  count(*) FILTER (WHERE titulo LIKE 'Pix Automático com valor de parcela%')     AS caso_3,
  count(*)                                                                        AS total
FROM enviadas;
