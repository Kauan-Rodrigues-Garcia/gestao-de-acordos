-- ============================================================
-- Migration: configuração mensal de metas + dashboard via analítico (2026-07-10)
-- Escopo: PaguePlay (o frontend gateia por tenant; a estrutura é neutra)
--
-- 1) metas_config_mes — por empresa/mês/ano:
--      • feriados  (jsonb ['yyyy-MM-dd', ...]) — subtraídos dos dias úteis
--      • quartis   (jsonb [{"quartil":1,"min_pct":100}, ...]) — % mínimo de
--        projeção para cada quartil (1 = melhor). Configurável na aba Metas.
--    Dias úteis totais/trabalhados são CALCULADOS no frontend
--    (seg–sex do mês − feriados), não persistidos.
--
-- 2) fn_analitico_dashboard_mes — agregado do analitico_recebimentos por
--    dia/forma/status_tabulacao para o dashboard: recebido no mês, gráfico
--    por dia, Pix vs Cartão e o total NÃO TABULADO (comparativo com a
--    tabulação manual). Operador enxerga só as próprias linhas; líder+ vê
--    a empresa toda (linhas órfãs incluídas).
-- ============================================================

-- ── 1. metas_config_mes ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.metas_config_mes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  mes            INTEGER     NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano            INTEGER     NOT NULL CHECK (ano >= 2024),
  -- Feriados do mês (dias em que a operação não trabalha): ['2026-07-09', ...]
  feriados       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Quartis por % mínimo de projeção (1 = melhor). Percentuais configuráveis.
  quartis        JSONB       NOT NULL DEFAULT
    '[{"quartil":1,"min_pct":100},{"quartil":2,"min_pct":80},{"quartil":3,"min_pct":50},{"quartil":4,"min_pct":0}]'::jsonb,
  atualizado_por UUID        REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, mes, ano)
);

ALTER TABLE public.metas_config_mes ENABLE ROW LEVEL SECURITY;

-- SELECT: todos da empresa (operador precisa ler p/ calcular meta diária/quartil)
DROP POLICY IF EXISTS "metas_config_select" ON public.metas_config_mes;
CREATE POLICY "metas_config_select" ON public.metas_config_mes
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

-- INSERT/UPDATE/DELETE: mesmos papéis que editam metas
DROP POLICY IF EXISTS "metas_config_insert" ON public.metas_config_mes;
CREATE POLICY "metas_config_insert" ON public.metas_config_mes
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','administrador','super_admin'])
  );

DROP POLICY IF EXISTS "metas_config_update" ON public.metas_config_mes;
CREATE POLICY "metas_config_update" ON public.metas_config_mes
  FOR UPDATE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','administrador','super_admin'])
  );

DROP POLICY IF EXISTS "metas_config_delete" ON public.metas_config_mes;
CREATE POLICY "metas_config_delete" ON public.metas_config_mes
  FOR DELETE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['administrador','super_admin'])
  );

-- Realtime: o header do dashboard reage a mudanças de config
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'metas_config_mes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.metas_config_mes;
  END IF;
END $$;

-- ── 2. RPC: agregado do analítico para o dashboard ───────────────────────────
-- Uma chamada devolve tudo que o dashboard precisa (agregado, sem varrer
-- linhas): por dia × operador × forma × status_tabulacao.
--   • Operador: somente as próprias linhas (auth.uid()), qualquer parâmetro.
--   • Líder+:   empresa toda, incluindo órfãs (operador_id NULL).

CREATE OR REPLACE FUNCTION public.fn_analitico_dashboard_mes(
  p_empresa_id UUID,
  p_mes        TEXT   -- 'yyyy-MM'
)
RETURNS TABLE (
  dia              DATE,
  operador_id      UUID,
  forma_pagamento  TEXT,
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
    ar.status_tabulacao,
    SUM(ar.valor_recebido)::NUMERIC AS total,
    SUM(ar.total_ho)::NUMERIC       AS total_ho,
    COUNT(*)::BIGINT                AS qtd
  FROM public.analitico_recebimentos ar
  WHERE ar.empresa_id     = p_empresa_id
    AND ar.data_pagamento BETWEEN v_inicio AND v_fim
    AND (v_is_lider OR ar.operador_id = auth.uid())
  GROUP BY ar.data_pagamento, ar.operador_id, ar.forma_pagamento, ar.status_tabulacao
  ORDER BY ar.data_pagamento;
END;
$$;
