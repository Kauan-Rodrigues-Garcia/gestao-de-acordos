-- ═══════════════════════════════════════════════════════════════════════════
-- OPERAÇÃO A — ESCRITA (14/09/2026)
--
-- ⚠ JÁ APLICADA em 14/09/2026 pelo SQL Editor: 50 inseridos, R$ 110.368,27.
--   Guardada como registro. Rodar de novo não duplica (quem já está no Pix
--   fica de fora), mas não há motivo para rodar.
--
-- Registra no Pix Automático os acordos PIX Automático de SETEMBRO/2026 que
-- estão só na lista de acordos (situação "2a" da Consulta 1).
--
-- O que altera: INSERT em public.pix_automatico_acordos, status 'pendente'
-- (o líder ainda confere, como qualquer registro).
-- Linhas esperadas: no máximo 52 (Consulta 1, BOOKPLAY, 2026-09, "2a").
-- Fica de fora, e por isso pode vir menos de 52: NR repetido entre dois
-- operadores dentro deste mesmo lote (o trigger recusaria o segundo).
--
-- Mesmas regras da aba:
--   • só quem ainda NÃO tem o NR no Pix (nem outra pessoa);
--   • só acordo que não é "só a parcela" e não está todo "Não Pago";
--   • só operador ativo;
--   • criado_em = dia de cadastro do acordo, 12:00 de São Paulo (o Pix conta
--     pelo mês do registro).
--
-- É UM comando só: se qualquer linha for recusada pelo trigger, nada entra.
-- Devolve quantas linhas foram inseridas.
-- ═══════════════════════════════════════════════════════════════════════════

WITH acordo_pix AS (
  SELECT
    a.empresa_id,
    a.operador_id,
    lower(trim(a.nr_cliente))                    AS nr_norm,
    trim(min(a.nr_cliente))                      AS nr_cliente,
    min(a.data_cadastro)                         AS data_cadastro,
    to_char(min(a.data_cadastro), 'YYYY-MM')     AS mes_cadastro,
    count(*)                                     AS linhas,
    max(COALESCE(a.parcelas, 1))                 AS parcelas,
    max(a.valor)                                 AS maior_valor,
    sum(a.valor)                                 AS soma_linhas,
    max(a.valor_total)                           AS valor_total,
    bool_and(a.status = 'nao_pago')              AS todos_nao_pago,
    bool_or(a.tipo_vinculo = 'extra')            AS extra,
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
    (ap.parcelas > 1 OR ap.linhas > 1
      OR (ap.valor_total IS NOT NULL AND ap.valor_total > ap.maior_valor)
      OR EXISTS (SELECT 1 FROM public.acordos g
                  WHERE g.acordo_grupo_id = ANY (ap.grupos)
                    AND g.tipo <> 'pix_automatico'))                     AS so_parcela
  FROM acordo_pix ap
),
candidatos AS (
  SELECT
    c.*,
    pf.nome     AS operador_nome,
    pf.setor_id AS setor_id,
    count(*) OVER (PARTITION BY c.empresa_id, c.nr_norm) AS donos_no_lote
  FROM classificado c
  JOIN public.perfis pf ON pf.id = c.operador_id
  WHERE c.mes_cadastro = '2026-09'
    AND c.valor_no_pix IS NULL
    AND NOT c.todos_nao_pago
    AND NOT c.nr_com_outro
    AND NOT c.so_parcela
    AND pf.ativo
    AND pf.situacao = 'ativo'
),
inseridos AS (
  INSERT INTO public.pix_automatico_acordos
    (empresa_id, operador_id, operador_nome, setor_id, nr_cliente, valor, status, criado_em, extra)
  SELECT
    c.empresa_id, c.operador_id, c.operador_nome, c.setor_id, c.nr_cliente, c.maior_valor,
    'pendente',
    (c.data_cadastro + time '12:00') AT TIME ZONE 'America/Sao_Paulo',
    c.extra
  FROM candidatos c
  WHERE c.donos_no_lote = 1
  RETURNING id, valor
)
SELECT count(*) AS inseridos, sum(valor) AS soma_valor FROM inseridos;
