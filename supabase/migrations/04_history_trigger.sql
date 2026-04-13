-- ================================================
-- TRIGGER: Log automático de histórico de acordos
-- ================================================

CREATE OR REPLACE FUNCTION public.fn_log_historico_acordo()
RETURNS TRIGGER AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  -- Tentar obter o ID do usuário da sessão do Supabase
  v_usuario_id := auth.uid();

  -- Se não houver usuário na sessão (ex: via API direta sem auth), 
  -- usamos o operador_id do próprio registro ou null
  IF v_usuario_id IS NULL THEN
    v_usuario_id := NEW.operador_id;
  END IF;

  -- Verificar alterações de campos importantes
  
  -- Status
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.historico_acordos (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES (NEW.id, v_usuario_id, 'status', OLD.status::text, NEW.status::text);
  END IF;

  -- Valor
  IF (TG_OP = 'UPDATE' AND OLD.valor IS DISTINCT FROM NEW.valor) THEN
    INSERT INTO public.historico_acordos (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES (NEW.id, v_usuario_id, 'valor', OLD.valor::text, NEW.valor::text);
  END IF;

  -- Vencimento
  IF (TG_OP = 'UPDATE' AND OLD.vencimento IS DISTINCT FROM NEW.vencimento) THEN
    INSERT INTO public.historico_acordos (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES (NEW.id, v_usuario_id, 'vencimento', OLD.vencimento::text, NEW.vencimento::text);
  END IF;

  -- Se for uma criação, logar o status inicial
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.historico_acordos (acordo_id, usuario_id, campo_alterado, valor_anterior, valor_novo)
    VALUES (NEW.id, v_usuario_id, 'status', NULL, NEW.status::text);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar o trigger na tabela acordos
DROP TRIGGER IF EXISTS trg_log_historico_acordo ON public.acordos;
CREATE TRIGGER trg_log_historico_acordo
  AFTER INSERT OR UPDATE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_historico_acordo();
