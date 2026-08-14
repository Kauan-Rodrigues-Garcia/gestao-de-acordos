
-- ══════════════════════════════════════════════════════════════════════════
--  TABELA: nr_registros
--  Propósito: registrar todos os NRs / Inscrições únicos por empresa.
--  Permite verificar em tempo real se um NR está livre ou vinculado a
--  algum operador — sem depender de query full-scan em `acordos`.
--
--  - Bookplay  → nr_value = nr_cliente   (campo nr_cliente)
--  - PaguePay  → nr_value = instituicao  (campo instituicao)
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.nr_registros (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        NOT NULL,
  nr_value      TEXT        NOT NULL,        -- valor do NR / Inscrição
  campo         TEXT        NOT NULL DEFAULT 'nr_cliente',  -- 'nr_cliente' | 'instituicao'
  operador_id   UUID        NOT NULL,        -- operador que possui o vínculo ativo
  operador_nome TEXT,                        -- desnormalizado para exibição rápida
  acordo_id     UUID        NOT NULL,        -- acordo ativo que detém este NR
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único: mesmo NR só pode ter 1 registro ativo por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uniq_nr_empresa
  ON public.nr_registros (empresa_id, nr_value, campo);

-- Índices de busca
CREATE INDEX IF NOT EXISTS idx_nr_empresa
  ON public.nr_registros (empresa_id);

CREATE INDEX IF NOT EXISTS idx_nr_operador
  ON public.nr_registros (operador_id);

CREATE INDEX IF NOT EXISTS idx_nr_acordo
  ON public.nr_registros (acordo_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.nr_registros ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado (precisamos para verificação em tempo real)
CREATE POLICY "nr_registros_select"
  ON public.nr_registros FOR SELECT
  TO authenticated
  USING (true);

-- Inserção: qualquer autenticado (controlado pela lógica de negócio)
CREATE POLICY "nr_registros_insert"
  ON public.nr_registros FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Atualização: qualquer autenticado
CREATE POLICY "nr_registros_update"
  ON public.nr_registros FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Deleção: qualquer autenticado (usada ao marcar acordo como nao_pago ou excluir)
CREATE POLICY "nr_registros_delete"
  ON public.nr_registros FOR DELETE
  TO authenticated
  USING (true);

-- ── Trigger para atualizar atualizado_em automaticamente ─────────────────
CREATE OR REPLACE FUNCTION public.set_nr_registros_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nr_registros_updated_at ON public.nr_registros;
CREATE TRIGGER trg_nr_registros_updated_at
  BEFORE UPDATE ON public.nr_registros
  FOR EACH ROW EXECUTE FUNCTION public.set_nr_registros_updated_at();

-- ── Replica Realtime ─────────────────────────────────────────────────────
-- Habilita a tabela para receber eventos de replicação Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.nr_registros;

-- ── Comentários descritivos ───────────────────────────────────────────────
COMMENT ON TABLE public.nr_registros IS
  'Registro único de NR/Inscrição por empresa — controla qual operador possui vínculo ativo. Atualizado em tempo real.';
COMMENT ON COLUMN public.nr_registros.nr_value IS
  'Valor do NR (Bookplay: nr_cliente) ou Inscrição (PaguePay: instituicao)';
COMMENT ON COLUMN public.nr_registros.campo IS
  'Coluna de origem: ''nr_cliente'' (Bookplay) | ''instituicao'' (PaguePay)';
COMMENT ON COLUMN public.nr_registros.operador_id IS
  'Operador que atualmente possui este NR em um acordo ativo';
