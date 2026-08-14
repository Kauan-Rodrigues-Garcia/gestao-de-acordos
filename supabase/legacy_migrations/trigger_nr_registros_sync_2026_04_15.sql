
-- ────────────────────────────────────────────────────────────────────────────
-- Trigger: manter nr_registros sincronizado com a tabela acordos
-- Data: 2026-04-15
--
-- Casos cobertos:
--  1. DELETE  → liberar o NR dos registros (ambos os campos)
--  2. UPDATE de status para 'nao_pago'
--       → liberar o NR dos registros
--  3. UPDATE de status DE 'nao_pago' para outro status
--       → re-registrar o NR (re-ativar)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_sync_nr_registros()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_empresa_id  UUID;
  v_nr_cliente  TEXT;
  v_instituicao TEXT;
  v_operador_id UUID;
  v_acordo_id   UUID;
BEGIN

  -- ── DELETE: liberar NR ────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    v_empresa_id  := OLD.empresa_id;
    v_nr_cliente  := TRIM(COALESCE(OLD.nr_cliente, ''));
    v_instituicao := TRIM(COALESCE(OLD.instituicao, ''));
    v_acordo_id   := OLD.id;

    -- Liberar pelo acordo_id (remove qualquer campo vinculado a esse acordo)
    DELETE FROM public.nr_registros
    WHERE acordo_id = v_acordo_id;

    RETURN OLD;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN
    v_empresa_id  := NEW.empresa_id;
    v_nr_cliente  := TRIM(COALESCE(NEW.nr_cliente, ''));
    v_instituicao := TRIM(COALESCE(NEW.instituicao, ''));
    v_operador_id := NEW.operador_id;
    v_acordo_id   := NEW.id;

    -- Status mudou PARA nao_pago → liberar NR
    IF NEW.status = 'nao_pago' AND (OLD.status IS DISTINCT FROM 'nao_pago') THEN
      DELETE FROM public.nr_registros
      WHERE acordo_id = v_acordo_id;
      RETURN NEW;
    END IF;

    -- Status mudou DE nao_pago para outro → re-registrar NR
    IF OLD.status = 'nao_pago' AND NEW.status <> 'nao_pago' THEN
      -- nr_cliente
      IF v_nr_cliente <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL THEN
        INSERT INTO public.nr_registros (
          empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em
        )
        VALUES (
          v_empresa_id, v_nr_cliente, 'nr_cliente',
          v_operador_id,
          (SELECT COALESCE(nome, email, 'Operador') FROM public.perfis WHERE id = v_operador_id LIMIT 1),
          v_acordo_id, NOW()
        )
        ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
          operador_id   = EXCLUDED.operador_id,
          operador_nome = EXCLUDED.operador_nome,
          acordo_id     = EXCLUDED.acordo_id,
          atualizado_em = NOW();
      END IF;

      -- instituicao
      IF v_instituicao <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL THEN
        INSERT INTO public.nr_registros (
          empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em
        )
        VALUES (
          v_empresa_id, v_instituicao, 'instituicao',
          v_operador_id,
          (SELECT COALESCE(nome, email, 'Operador') FROM public.perfis WHERE id = v_operador_id LIMIT 1),
          v_acordo_id, NOW()
        )
        ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
          operador_id   = EXCLUDED.operador_id,
          operador_nome = EXCLUDED.operador_nome,
          acordo_id     = EXCLUDED.acordo_id,
          atualizado_em = NOW();
      END IF;

      RETURN NEW;
    END IF;

    -- NR ou Inscrição mudou de valor → atualizar o registro existente
    IF (OLD.nr_cliente IS DISTINCT FROM NEW.nr_cliente) THEN
      -- Remover vínculo antigo do nr_cliente
      IF TRIM(COALESCE(OLD.nr_cliente, '')) <> '' THEN
        DELETE FROM public.nr_registros
        WHERE empresa_id = v_empresa_id
          AND nr_value   = TRIM(OLD.nr_cliente)
          AND campo      = 'nr_cliente'
          AND acordo_id  = v_acordo_id;
      END IF;
      -- Registrar novo nr_cliente
      IF v_nr_cliente <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL
         AND NEW.status <> 'nao_pago' THEN
        INSERT INTO public.nr_registros (
          empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em
        )
        VALUES (
          v_empresa_id, v_nr_cliente, 'nr_cliente',
          v_operador_id,
          (SELECT COALESCE(nome, email, 'Operador') FROM public.perfis WHERE id = v_operador_id LIMIT 1),
          v_acordo_id, NOW()
        )
        ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
          operador_id   = EXCLUDED.operador_id,
          operador_nome = EXCLUDED.operador_nome,
          acordo_id     = EXCLUDED.acordo_id,
          atualizado_em = NOW();
      END IF;
    END IF;

    IF (OLD.instituicao IS DISTINCT FROM NEW.instituicao) THEN
      -- Remover vínculo antigo da instituicao
      IF TRIM(COALESCE(OLD.instituicao, '')) <> '' THEN
        DELETE FROM public.nr_registros
        WHERE empresa_id = v_empresa_id
          AND nr_value   = TRIM(OLD.instituicao)
          AND campo      = 'instituicao'
          AND acordo_id  = v_acordo_id;
      END IF;
      -- Registrar nova instituicao
      IF v_instituicao <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL
         AND NEW.status <> 'nao_pago' THEN
        INSERT INTO public.nr_registros (
          empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em
        )
        VALUES (
          v_empresa_id, v_instituicao, 'instituicao',
          v_operador_id,
          (SELECT COALESCE(nome, email, 'Operador') FROM public.perfis WHERE id = v_operador_id LIMIT 1),
          v_acordo_id, NOW()
        )
        ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
          operador_id   = EXCLUDED.operador_id,
          operador_nome = EXCLUDED.operador_nome,
          acordo_id     = EXCLUDED.acordo_id,
          atualizado_em = NOW();
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Remover trigger se já existir (idempotente)
DROP TRIGGER IF EXISTS trg_sync_nr_registros ON public.acordos;

-- Criar trigger AFTER INSERT/UPDATE/DELETE
CREATE TRIGGER trg_sync_nr_registros
  AFTER INSERT OR UPDATE OR DELETE
  ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_nr_registros();

-- Comentário no trigger
COMMENT ON FUNCTION public.fn_sync_nr_registros() IS
  'Mantém a tabela nr_registros sincronizada com mudanças em acordos. '
  'Libera NR quando status → nao_pago ou quando o acordo é excluído. '
  'Re-ativa NR quando status volta de nao_pago para outro.';
