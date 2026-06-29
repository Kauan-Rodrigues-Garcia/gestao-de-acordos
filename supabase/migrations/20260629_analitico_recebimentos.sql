-- ============================================================
-- Migration: analitico_recebimentos (2026-06-29)
-- Feature: Aba Analítico de recebimentos — PaguePlay exclusivo
-- ============================================================

-- ── Tabela principal ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analitico_recebimentos (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  -- operador resolvido via perfis.usuario → perfis.id; NULL quando não encontrado
  operador_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  operador_usuario  TEXT        NOT NULL,                        -- texto bruto da coluna "Cobradora"
  codigo            TEXT        NOT NULL,                        -- código do cliente (coluna Cliente)
  nome_cliente      TEXT,
  forma_pagamento   TEXT        NOT NULL
                    CHECK (forma_pagamento IN ('boleto_pix', 'cartao')),
  valor_recebido    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ho          NUMERIC(12,2) NOT NULL DEFAULT 0,
  data_pagamento    DATE        NOT NULL,
  mes_referencia    DATE        NOT NULL,                        -- DATE truncado ao 1º do mês
  acordo_id         UUID        REFERENCES public.acordos(id) ON DELETE SET NULL,
  status_tabulacao  TEXT        NOT NULL DEFAULT 'nao_tabulado'
                    CHECK (status_tabulacao IN ('tabulado', 'nao_tabulado', 'divergente')),
  visto             BOOLEAN     NOT NULL DEFAULT false,
  importado_por_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  importado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lote_id           UUID        NOT NULL                         -- UUID gerado no browser por importação
);

-- ── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_analitico_empresa_op_mes
  ON public.analitico_recebimentos(empresa_id, operador_id, mes_referencia);

CREATE INDEX IF NOT EXISTS idx_analitico_empresa_codigo
  ON public.analitico_recebimentos(empresa_id, codigo);

CREATE INDEX IF NOT EXISTS idx_analitico_lote
  ON public.analitico_recebimentos(lote_id);

-- Chave de unicidade para merge incremental (evita duplicatas em re-upload)
CREATE UNIQUE INDEX IF NOT EXISTS idx_analitico_unicidade
  ON public.analitico_recebimentos(empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.analitico_recebimentos ENABLE ROW LEVEL SECURITY;

-- SELECT: operador vê somente as próprias linhas (operador_id = auth.uid())
--         líder/elite/gerência/admin/super_admin veem tudo da empresa
--         linhas com operador_id IS NULL (operador não encontrado) visíveis só para líder+
DROP POLICY IF EXISTS "analitico_select" ON public.analitico_recebimentos;
CREATE POLICY "analitico_select" ON public.analitico_recebimentos
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
DROP POLICY IF EXISTS "analitico_insert" ON public.analitico_recebimentos;
CREATE POLICY "analitico_insert" ON public.analitico_recebimentos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
        )
  );

-- UPDATE: operador pode atualizar as próprias linhas (visto, status_tabulacao);
--         líder+ atualiza qualquer linha da empresa
DROP POLICY IF EXISTS "analitico_update" ON public.analitico_recebimentos;
CREATE POLICY "analitico_update" ON public.analitico_recebimentos
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
DROP POLICY IF EXISTS "analitico_delete" ON public.analitico_recebimentos;
CREATE POLICY "analitico_delete" ON public.analitico_recebimentos
  FOR DELETE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(
          ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']
        )
  );

-- ── Permissão importar_analitico em cargos_permissoes ────────────────────────
-- Operador: false (só recebe dados)
UPDATE public.cargos_permissoes
SET permissoes = permissoes || '{"importar_analitico": false}'::jsonb
WHERE cargo = 'operador'
  AND NOT (permissoes ? 'importar_analitico');

-- Líder e acima: true por padrão
UPDATE public.cargos_permissoes
SET permissoes = permissoes || '{"importar_analitico": true}'::jsonb
WHERE cargo IN ('lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin')
  AND NOT (permissoes ? 'importar_analitico');
