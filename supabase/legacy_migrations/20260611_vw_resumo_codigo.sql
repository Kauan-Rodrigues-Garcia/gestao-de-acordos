-- ============================================================
-- vw_resumo_codigo + fn_historico_codigo
-- Rastreamento histórico por NR/Código por empresa.
-- Permite saber: tem acordo ativo, total de acordos realizados,
-- quantas vezes foi para não-pago, se já quitou algum acordo.
-- Dados apenas no banco — sem exibição visual, para análises futuras.
--
-- Depende de:
--   • tabela public.acordos (com colunas acordo_grupo_id, numero_parcela,
--     instituicao, nr_cliente, data_pagamento)
--   • tabela public.historico_acordos (trigger 04_history_trigger.sql)
-- ============================================================

-- ── View: resumo agregado por empresa + código ───────────────────────────────

CREATE OR REPLACE VIEW public.vw_resumo_codigo AS
WITH eventos_nao_pago AS (
  -- Quantas vezes cada código chegou ao status nao_pago (quebra de acordo)
  SELECT
    a.empresa_id,
    COALESCE(a.instituicao, a.nr_cliente)  AS codigo,
    COUNT(*)                                AS vezes_nao_pago
  FROM public.historico_acordos h
  JOIN public.acordos a ON h.acordo_id = a.id
  WHERE h.campo_alterado = 'status'
    AND h.valor_novo = 'nao_pago'
    AND COALESCE(a.instituicao, a.nr_cliente) IS NOT NULL
  GROUP BY a.empresa_id, COALESCE(a.instituicao, a.nr_cliente)
),
grupos AS (
  -- Por grupo de parcelas: verifica se todas estão pagas (acordo parcelado quitado)
  SELECT
    empresa_id,
    acordo_grupo_id,
    BOOL_AND(status = 'pago')                          AS todas_pagas,
    COUNT(*)                                            AS total_parcelas_grupo,
    COUNT(*) FILTER (WHERE status = 'pago')            AS parcelas_pagas_grupo
  FROM public.acordos
  WHERE acordo_grupo_id IS NOT NULL
  GROUP BY empresa_id, acordo_grupo_id
)
SELECT
  a.empresa_id,
  COALESCE(a.instituicao, a.nr_cliente)                              AS codigo,
  CASE WHEN a.instituicao IS NOT NULL
       THEN 'instituicao' ELSE 'nr_cliente' END                      AS campo,

  -- Acordos distintos: grupo parcelado = 1 acordo, simples = 1 acordo
  COUNT(DISTINCT COALESCE(a.acordo_grupo_id::TEXT, a.id::TEXT))      AS total_acordos,

  -- Detalhamento das parcelas registradas
  COUNT(*)                                                            AS total_registros,
  COUNT(*) FILTER (WHERE a.status = 'pago')                         AS parcelas_pagas,
  COUNT(*) FILTER (WHERE a.status = 'nao_pago')                     AS parcelas_nao_pagas,
  COUNT(*) FILTER (WHERE a.status = 'verificar_pendente')           AS parcelas_pendentes,

  -- Tem acordo ativo agora (pendente ou não-pago)?
  BOOL_OR(a.status IN ('verificar_pendente', 'nao_pago'))            AS tem_acordo_ativo,

  -- Quantidade de vezes que foi para não-pago (total histórico de quebras)
  COALESCE(MAX(enp.vezes_nao_pago), 0)                              AS vezes_nao_pago,

  -- Já completou ao menos 1 acordo parcelado (todas as parcelas do grupo pagas)?
  BOOL_OR(g.todas_pagas = TRUE)                                      AS ja_quitou_parcelado,

  -- Já pagou ao menos 1 acordo simples (pagamento único)?
  BOOL_OR(a.status = 'pago' AND COALESCE(a.parcelas, 1) = 1)       AS ja_quitou_simples,

  MIN(a.criado_em)  AS primeiro_acordo_em,
  MAX(a.criado_em)  AS ultimo_acordo_em

FROM public.acordos a
LEFT JOIN eventos_nao_pago enp
  ON enp.empresa_id = a.empresa_id
  AND enp.codigo = COALESCE(a.instituicao, a.nr_cliente)
LEFT JOIN grupos g
  ON g.empresa_id = a.empresa_id
  AND g.acordo_grupo_id = a.acordo_grupo_id
WHERE COALESCE(a.instituicao, a.nr_cliente) IS NOT NULL
GROUP BY
  a.empresa_id,
  COALESCE(a.instituicao, a.nr_cliente),
  CASE WHEN a.instituicao IS NOT NULL THEN 'instituicao' ELSE 'nr_cliente' END;

COMMENT ON VIEW public.vw_resumo_codigo IS
  'Resumo histórico por NR/Código: acordos ativos, total realizado, quebras (nao_pago), quitações. Fonte de dados para análises — sem uso visual direto.';


-- ── Função: histórico detalhado de um código específico ─────────────────────

CREATE OR REPLACE FUNCTION public.fn_historico_codigo(
  p_empresa_id  UUID,
  p_nr_value    TEXT,
  p_campo       TEXT DEFAULT 'instituicao'  -- 'instituicao' (PaguePLAY) ou 'nr_cliente' (Bookplay)
)
RETURNS TABLE (
  acordo_id      UUID,
  numero_parcela INTEGER,
  tipo           TEXT,
  valor          NUMERIC,
  vencimento     DATE,
  status         TEXT,
  data_pagamento DATE,
  criado_em      TIMESTAMPTZ,
  evento         TEXT,
  evento_em      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT * FROM (
    -- Linhas: acordos do código
    SELECT
      a.id                   AS acordo_id,
      a.numero_parcela       AS numero_parcela,
      a.tipo::TEXT           AS tipo,
      a.valor                AS valor,
      a.vencimento           AS vencimento,
      a.status::TEXT         AS status,
      a.data_pagamento       AS data_pagamento,
      a.criado_em            AS criado_em,
      NULL::TEXT             AS evento,
      NULL::TIMESTAMPTZ      AS evento_em
    FROM public.acordos a
    WHERE a.empresa_id = p_empresa_id
      AND (
        (p_campo = 'instituicao' AND a.instituicao = p_nr_value)
        OR
        (p_campo = 'nr_cliente'  AND a.nr_cliente  = p_nr_value)
      )

    UNION ALL

    -- Linhas: eventos de mudança de status (historico_acordos)
    SELECT
      h.acordo_id            AS acordo_id,
      NULL::INTEGER          AS numero_parcela,
      NULL::TEXT             AS tipo,
      NULL::NUMERIC          AS valor,
      NULL::DATE             AS vencimento,
      NULL::TEXT             AS status,
      NULL::DATE             AS data_pagamento,
      NULL::TIMESTAMPTZ      AS criado_em,
      ('status: ' || COALESCE(h.valor_anterior, '?') || ' → ' || COALESCE(h.valor_novo, '?'))
                             AS evento,
      h.criado_em            AS evento_em
    FROM public.historico_acordos h
    JOIN public.acordos a ON h.acordo_id = a.id
    WHERE a.empresa_id = p_empresa_id
      AND h.campo_alterado = 'status'
      AND (
        (p_campo = 'instituicao' AND a.instituicao = p_nr_value)
        OR
        (p_campo = 'nr_cliente'  AND a.nr_cliente  = p_nr_value)
      )
  ) sub
  ORDER BY COALESCE(sub.evento_em, sub.criado_em) DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.fn_historico_codigo IS
  'Retorna histórico completo de um NR/Código: acordos registrados + eventos de mudança de status. Parâmetros: p_empresa_id, p_nr_value, p_campo (''instituicao'' para PaguePLAY, ''nr_cliente'' para Bookplay).';


-- ── Índices de suporte (evita full-scan na view) ─────────────────────────────

CREATE INDEX IF NOT EXISTS idx_acordos_instituicao_empresa
  ON public.acordos (empresa_id, instituicao)
  WHERE instituicao IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acordos_nr_cliente_empresa
  ON public.acordos (empresa_id, nr_cliente)
  WHERE nr_cliente IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_historico_campo_valor
  ON public.historico_acordos (campo_alterado, valor_novo)
  WHERE campo_alterado = 'status';
