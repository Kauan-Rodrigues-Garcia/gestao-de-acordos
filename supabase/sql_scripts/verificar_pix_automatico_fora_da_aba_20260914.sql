-- ═══════════════════════════════════════════════════════════════════════════
-- CONSULTA 1 — SOMENTE LEITURA (14/09/2026)
--
-- PIX Automático da lista de acordos × aba Pix Automático.
-- Não altera nada. Devolve só contagens e somas por empresa, mês de cadastro e
-- situação — sem nomes nem NRs.
--
-- Situações:
--   1.  já no Pix (valor cobre o total)                 → nada
--   2a. fora do Pix                                     → inserir (próxima etapa)
--   2b. fora do Pix e só a parcela                      → notificar, não inserir
--   3.  no Pix com valor de parcela                     → notificar para reajustar
--   4.  fora do Pix, NR no Pix de outra pessoa          → só listar
--   5.  fora do Pix, todas as linhas "Não Pago"         → ignorar
--
-- "Só a parcela" = lançado com mais de 1 parcela, OU mais de uma linha de PIX
-- Automático do mesmo NR, OU valor_total maior que o valor, OU grupo com
-- parcelas de outra forma de pagamento.
-- ═══════════════════════════════════════════════════════════════════════════

WITH acordo_pix AS (
  SELECT
    a.empresa_id,
    a.operador_id,
    lower(trim(a.nr_cliente))                    AS nr_norm,
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
)
SELECT
  e.nome AS empresa,
  c.mes_cadastro,
  CASE
    WHEN c.valor_no_pix IS NOT NULL AND c.so_parcela
         AND c.valor_no_pix < c.total_estimado THEN '3. no Pix com valor de parcela -> notificar'
    WHEN c.valor_no_pix IS NOT NULL            THEN '1. ja no Pix'
    WHEN c.todos_nao_pago                      THEN '5. fora, nao pago -> ignorar'
    WHEN c.nr_com_outro                        THEN '4. fora, NR com outra pessoa -> listar'
    WHEN c.so_parcela                          THEN '2b. fora, so a parcela -> notificar'
    ELSE                                            '2a. fora -> inserir'
  END AS situacao,
  count(*)                                                       AS acordos,
  count(*) FILTER (WHERE NOT pf.ativo OR pf.situacao <> 'ativo') AS de_quem_nao_esta_ativo,
  sum(c.maior_valor)                                             AS soma_valor
FROM classificado c
JOIN public.empresas e ON e.id = c.empresa_id
JOIN public.perfis  pf ON pf.id = c.operador_id
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
