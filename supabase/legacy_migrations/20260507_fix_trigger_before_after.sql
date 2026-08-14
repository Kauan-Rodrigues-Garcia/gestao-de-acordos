-- ============================================================
-- FIX: separa trigger em BEFORE UPDATE (pago_em) + AFTER INSERT OR UPDATE (historico)
-- Problema: trigger BEFORE INSERT tentava inserir em historico_acordos antes da
-- linha existir em acordos, violando a FK historico_acordos_acordo_id_fkey.
-- Solução: BEFORE UPDATE apenas seta pago_em (modifica NEW);
--          AFTER INSERT OR UPDATE loga historico (linha já existe, FK OK).
-- ============================================================

-- ── Remove triggers e funções anteriores ─────────────────────
DROP TRIGGER IF EXISTS trg_log_historico_acordo ON public.acordos;
DROP TRIGGER IF EXISTS trg_set_pago_em ON public.acordos;
DROP FUNCTION IF EXISTS public.fn_log_historico_acordo();
DROP FUNCTION IF EXISTS public.fn_set_pago_em();

-- ── 1. BEFORE UPDATE: apenas preenche/limpa pago_em ─────────
CREATE OR REPLACE FUNCTION public.fn_set_pago_em()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'pago' AND OLD.status <> 'pago' THEN
      NEW.pago_em := NOW();
    END IF;
    IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
      NEW.pago_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_pago_em
  BEFORE UPDATE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_pago_em();

-- ── 2. AFTER INSERT OR UPDATE: registra histórico ─────────────
-- AFTER garante que o registro em acordos já existe quando
-- inserimos em historico_acordos (FK válida).
CREATE OR REPLACE FUNCTION public.fn_log_historico_acordo()
RETURNS TRIGGER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  v_usuario_id := auth.uid();
  IF v_usuario_id IS NULL THEN
    v_usuario_id := NEW.operador_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'status', NULL, NEW.status::text);
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.historico_acordos
      (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES
      (NEW.id, v_usuario_id, 'status', OLD.status::text, NEW.status::text);
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

CREATE TRIGGER trg_log_historico_acordo
  AFTER INSERT OR UPDATE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_acordo();

-- ── Confirma ─────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'trg_set_pago_em')   AS trigger_set_pago_em,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'trg_log_historico_acordo') AS trigger_historico;
