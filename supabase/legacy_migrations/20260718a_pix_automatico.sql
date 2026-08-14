-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO (BookPlay) — acompanhamento de comissão
-- ═══════════════════════════════════════════════════════════════════════════
-- Aba independente dentro de Acordos: operador registra acordos fechados no
-- Pix automático (NR + valor total) SEM vínculo com a tabela acordos. Cada
-- linha rende uma comissão percentual ao operador (padrão 0,25% do valor).
--
-- Fluxo:
--   • operador registra → nasce 'pendente'
--   • líder+ aprova ('aprovado', % do setor travado na linha) ou
--     desaprova ('desaprovado' — não conta em nada; dono pode excluir)
--   • percentual configurável POR SETOR pelo líder (pix_automatico_config)

-- ─── 1. Acordos Pix ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pix_automatico_acordos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id      UUID NOT NULL REFERENCES public.perfis(id)  ON DELETE CASCADE,
  operador_nome    TEXT,
  -- setor do operador no momento do registro: define qual % vale para a linha
  setor_id         UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  nr_cliente       TEXT NOT NULL,
  valor            NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  status           TEXT NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente', 'aprovado', 'desaprovado')),
  -- % travado no momento da APROVAÇÃO (0.25 = 0,25%). Pendente usa o % atual
  -- do setor; mudar a configuração depois não altera o que já foi aprovado.
  pct_comissao     NUMERIC(6,4),
  avaliado_por     UUID,
  avaliado_por_nome TEXT,
  avaliado_em      TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pix_auto_empresa  ON public.pix_automatico_acordos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pix_auto_operador ON public.pix_automatico_acordos(empresa_id, operador_id);
CREATE INDEX IF NOT EXISTS idx_pix_auto_status   ON public.pix_automatico_acordos(empresa_id, status);

DROP TRIGGER IF EXISTS trg_pix_auto_updated ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_auto_updated
  BEFORE UPDATE ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cargos();

-- ─── 2. Configuração de % por setor ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pix_automatico_config (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id           UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  pct                NUMERIC(6,4) NOT NULL DEFAULT 0.25 CHECK (pct >= 0 AND pct <= 100),
  atualizado_por     UUID,
  atualizado_por_nome TEXT,
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, setor_id)
);

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.pix_automatico_acordos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_automatico_config  ENABLE ROW LEVEL SECURITY;

-- Acordos: operador vê os próprios; líder+ vê tudo da empresa
DROP POLICY IF EXISTS "pix_auto_select" ON public.pix_automatico_acordos;
CREATE POLICY "pix_auto_select" ON public.pix_automatico_acordos
  FOR SELECT USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      operador_id = auth.uid()
      OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin'])
    )
  );

-- Registro: sempre em nome próprio e sempre pendente
DROP POLICY IF EXISTS "pix_auto_insert" ON public.pix_automatico_acordos;
CREATE POLICY "pix_auto_insert" ON public.pix_automatico_acordos
  FOR INSERT WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND operador_id = auth.uid()
    AND status = 'pendente'
  );

-- Aprovar/desaprovar: só líder+
DROP POLICY IF EXISTS "pix_auto_update" ON public.pix_automatico_acordos;
CREATE POLICY "pix_auto_update" ON public.pix_automatico_acordos
  FOR UPDATE USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
  );

-- Excluir: dono limpa os próprios DESAPROVADOS; líder+ pode excluir qualquer linha
DROP POLICY IF EXISTS "pix_auto_delete" ON public.pix_automatico_acordos;
CREATE POLICY "pix_auto_delete" ON public.pix_automatico_acordos
  FOR DELETE USING (
    public.fn_can_access_empresa(empresa_id)
    AND (
      (operador_id = auth.uid() AND status = 'desaprovado')
      OR public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
    )
  );

-- Config: leitura por todos da empresa (operador precisa calcular a própria
-- comissão pendente); escrita por líder+
DROP POLICY IF EXISTS "pix_auto_cfg_select" ON public.pix_automatico_config;
CREATE POLICY "pix_auto_cfg_select" ON public.pix_automatico_config
  FOR SELECT USING (public.fn_can_access_empresa(empresa_id));

DROP POLICY IF EXISTS "pix_auto_cfg_write" ON public.pix_automatico_config;
CREATE POLICY "pix_auto_cfg_write" ON public.pix_automatico_config
  FOR ALL USING (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
  )
  WITH CHECK (
    public.fn_can_access_empresa(empresa_id)
    AND public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin'])
  );
