-- ============================================================
-- MIGRATION: pago_em + historico_acordos expandido
-- ============================================================
-- 1. Adiciona coluna pago_em em acordos (preenchida automaticamente
--    pelo trigger quando status muda para 'pago').
-- 2. Expande o trigger historico_acordos para cobrir mais campos:
--    nome_cliente, operador_id, tipo_vinculo, tipo.
-- 3. Adiciona índices úteis em historico_acordos para queries rápidas.
-- ============================================================

-- ── 1. Coluna pago_em ────────────────────────────────────────
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ DEFAULT NULL;

-- Retroativamente preenche pago_em para acordos já pagos usando o historico
-- (usa o timestamp do log mais antigo onde status virou 'pago')
UPDATE public.acordos a
SET pago_em = (
  SELECT MIN(h.criado_em)
  FROM public.historico_acordos h
  WHERE h.acordo_id = a.id
    AND h.campo_alterado = 'status'
    AND h.valor_novo     = 'pago'
)
WHERE a.status = 'pago'
  AND a.pago_em IS NULL;

-- ── 2. Trigger expandido ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_historico_acordo()
RETURNS TRIGGER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  v_usuario_id := auth.uid();
  IF v_usuario_id IS NULL THEN
    v_usuario_id := NEW.operador_id;
  END IF;

  -- Criação: loga status inicial
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'status', NULL, NEW.status::text);
    RETURN NEW;
  END IF;

  -- Atualização: cada campo relevante
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'status', OLD.status::text, NEW.status::text);

    -- Preenche pago_em quando status → pago
    IF NEW.status = 'pago' AND (OLD.status IS NULL OR OLD.status <> 'pago') THEN
      NEW.pago_em := NOW();
    END IF;
    -- Limpa pago_em se status voltou de 'pago' para outro estado
    IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
      NEW.pago_em := NULL;
    END IF;
  END IF;

  IF OLD.valor IS DISTINCT FROM NEW.valor THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'valor', OLD.valor::text, NEW.valor::text);
  END IF;

  IF OLD.vencimento IS DISTINCT FROM NEW.vencimento THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'vencimento', OLD.vencimento::text, NEW.vencimento::text);
  END IF;

  IF OLD.nome_cliente IS DISTINCT FROM NEW.nome_cliente THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'nome_cliente', OLD.nome_cliente, NEW.nome_cliente);
  END IF;

  IF OLD.operador_id IS DISTINCT FROM NEW.operador_id THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'operador_id', OLD.operador_id::text, NEW.operador_id::text);
  END IF;

  IF OLD.tipo_vinculo IS DISTINCT FROM NEW.tipo_vinculo THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'tipo_vinculo',
       COALESCE(OLD.tipo_vinculo, 'direto'),
       COALESCE(NEW.tipo_vinculo, 'direto'));
  END IF;

  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'tipo', OLD.tipo::text, NEW.tipo::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- O trigger precisa ser BEFORE UPDATE para poder modificar NEW.pago_em
DROP TRIGGER IF EXISTS trg_log_historico_acordo ON public.acordos;
CREATE TRIGGER trg_log_historico_acordo
  BEFORE INSERT OR UPDATE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_acordo();

-- ── 3. Índices úteis em historico_acordos ────────────────────
CREATE INDEX IF NOT EXISTS idx_historico_campo_valor
  ON public.historico_acordos(campo_alterado, valor_novo);

CREATE INDEX IF NOT EXISTS idx_historico_criado_em
  ON public.historico_acordos(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_historico_usuario
  ON public.historico_acordos(usuario_id);

-- ── 4. Índice em acordos.criado_em e pago_em ─────────────────
CREATE INDEX IF NOT EXISTS idx_acordos_criado_em
  ON public.acordos(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_acordos_pago_em
  ON public.acordos(pago_em DESC)
  WHERE pago_em IS NOT NULL;

-- ── Confirma ─────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name='acordos' AND column_name='pago_em' AND table_schema='public')
     AS coluna_pago_em_criada,
  (SELECT COUNT(*) FROM pg_indexes
   WHERE tablename='historico_acordos' AND schemaname='public')
     AS indices_historico,
  (SELECT COUNT(*) FROM pg_trigger
   WHERE tgname='trg_log_historico_acordo')
     AS trigger_ativo;
