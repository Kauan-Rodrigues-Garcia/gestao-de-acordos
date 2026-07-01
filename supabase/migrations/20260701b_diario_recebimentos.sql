-- ============================================================
-- Migration: diario_recebimentos (2026-07-01)
-- Feature: Aba "Recebimento diário" dentro do Analítico — PaguePlay
--
-- Diferente do analítico, o recebimento diário é apenas informativo:
-- não há vínculo com acordos tabulados. O líder importa o relatório
-- diário do ERP e cada operador recebe a lista dos próprios pagamentos.
-- ============================================================

-- ── Tabela principal ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.diario_recebimentos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- operador resolvido via perfis.usuario → perfis.id; NULL quando não encontrado
  -- FK para public.perfis (mesmos UUIDs de auth.users) para o PostgREST
  -- resolver o join perfis(...) no select — ver 20260629b_fix_analitico_fk.sql
  operador_id       UUID        REFERENCES public.perfis(id) ON DELETE SET NULL,
  operador_usuario  TEXT        NOT NULL,                  -- texto bruto da coluna "Operador"
  cpf               TEXT,                                  -- somente dígitos
  nome_cliente      TEXT,                                  -- coluna "Profissional"
  acordo_codigo     TEXT,                                  -- coluna "Cód.Acordo" (consolida parcelas de cartão)
  forma_pagamento   TEXT        NOT NULL DEFAULT '—',      -- texto bruto (Pix, Boleto, Cartão Padrão…)
  valor_recebido    NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_pagamento    DATE,
  dia_referencia    DATE        NOT NULL,                  -- dia do relatório (moda das datas de pagamento)
  prox_contato      DATE,                                  -- Próx.Contato ≤ hoje → acordo ignorado
  tabulacao         TEXT,                                  -- coluna "Tabulação" do ERP
  id_baixa          TEXT,                                  -- Id.Baixa (identificador do pagamento no ERP)
  chave_unica       TEXT        NOT NULL,                  -- id_baixa ou composta (dedupe entre importações do dia)
  import_index      INTEGER     NOT NULL DEFAULT 1,        -- nº da importação do dia que adicionou a linha
  visto             BOOLEAN     NOT NULL DEFAULT false,    -- operador abriu a aba após a importação
  importado_por_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  importado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lote_id           UUID        NOT NULL
);

-- ── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_diario_empresa_dia_op
  ON public.diario_recebimentos(empresa_id, dia_referencia, operador_id);

CREATE INDEX IF NOT EXISTS idx_diario_lote
  ON public.diario_recebimentos(lote_id);

-- Dedupe entre importações sucessivas do mesmo dia
CREATE UNIQUE INDEX IF NOT EXISTS idx_diario_unicidade
  ON public.diario_recebimentos(empresa_id, dia_referencia, chave_unica);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.diario_recebimentos ENABLE ROW LEVEL SECURITY;

-- SELECT: operador vê somente as próprias linhas;
--         líder/elite/gerência/admin/super_admin veem tudo da empresa
--         (linhas órfãs, operador_id IS NULL, visíveis só para líder+)
DROP POLICY IF EXISTS "diario_select" ON public.diario_recebimentos;
CREATE POLICY "diario_select" ON public.diario_recebimentos
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      (operador_id = auth.uid() AND operador_id IS NOT NULL)
      OR public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
         )
    )
  );

-- INSERT: somente líder+ pode importar
DROP POLICY IF EXISTS "diario_insert" ON public.diario_recebimentos;
CREATE POLICY "diario_insert" ON public.diario_recebimentos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
        )
  );

-- UPDATE: operador pode atualizar as próprias linhas (marcar visto);
--         líder+ atualiza qualquer linha da empresa
DROP POLICY IF EXISTS "diario_update" ON public.diario_recebimentos;
CREATE POLICY "diario_update" ON public.diario_recebimentos
  FOR UPDATE USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
         )
    )
  );

-- DELETE: somente líder+
DROP POLICY IF EXISTS "diario_delete" ON public.diario_recebimentos;
CREATE POLICY "diario_delete" ON public.diario_recebimentos
  FOR DELETE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
        )
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'diario_recebimentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.diario_recebimentos;
  END IF;
END $$;

-- ── RPC: total do mês (para o card "Total do mês" da visão líder) ────────────
-- Exclui acordos ignorados (prox_contato ≤ dia atual), como nas listas.

CREATE OR REPLACE FUNCTION public.fn_diario_resumo_mes(
  p_empresa_id UUID,
  p_mes        TEXT   -- 'yyyy-MM'
)
RETURNS TABLE (
  total_recebido NUMERIC,
  total_dias     INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primeiro DATE := (p_mes || '-01')::DATE;
  v_fim      DATE := (DATE_TRUNC('month', (p_mes || '-01')::DATE)
                      + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN RETURN; END IF;
  IF NOT public.fn_user_has_any_role(
       ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
     ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(d.valor_recebido), 0)::NUMERIC,
    COUNT(DISTINCT d.dia_referencia)::INTEGER
  FROM public.diario_recebimentos d
  WHERE d.empresa_id     = p_empresa_id
    AND d.dia_referencia BETWEEN v_primeiro AND v_fim
    AND (d.prox_contato IS NULL OR d.prox_contato > CURRENT_DATE);
END;
$$;

-- ── Permissão importar_diario em cargos_permissoes ───────────────────────────
-- Operador: false (só recebe dados)
UPDATE public.cargos_permissoes
SET permissoes = permissoes || '{"importar_diario": false}'::jsonb
WHERE cargo = 'operador'
  AND NOT (permissoes ? 'importar_diario');

-- Líder e acima: true por padrão
UPDATE public.cargos_permissoes
SET permissoes = permissoes || '{"importar_diario": true}'::jsonb
WHERE cargo IN ('lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin')
  AND NOT (permissoes ? 'importar_diario');
