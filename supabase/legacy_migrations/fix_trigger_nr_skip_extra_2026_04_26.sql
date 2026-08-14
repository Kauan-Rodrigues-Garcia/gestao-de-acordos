
-- ────────────────────────────────────────────────────────────────────────────
-- Fix: fn_sync_nr_registros — acordos com tipo_vinculo='extra' não devem
--      sobrescrever o dono registrado em nr_registros.
--
-- Problema (v2 anterior):
--   No INSERT, o trigger sempre fazia ON CONFLICT DO UPDATE, sobrescrevendo
--   operador_id/acordo_id com os dados do acordo EXTRA recém-inserido.
--   Isso corrompía a fonte de verdade: o próximo verificarNrRegistro() via
--   useNrRegistros apontava para o EXTRA como "dono", quebrando a detecção
--   de conflito para novos acordos com o mesmo NR.
--
-- Correção:
--   Acordos EXTRA são vinculados a um DIRETO já existente; o vínculo de NR
--   já está registrado pelo acordo DIRETO. O trigger deve simplesmente ignorar
--   INSERTs de tipo_vinculo='extra', deixando nr_registros intacto.
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
  v_nome_op     TEXT;
BEGIN

  -- ── DELETE: liberar NR ────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.nr_registros
    WHERE acordo_id = OLD.id;
    RETURN OLD;
  END IF;

  -- ── INSERT: registrar NR do novo acordo ──────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Acordos EXTRA não devem registrar/sobrescrever nr_registros:
    -- o vínculo de NR pertence ao acordo DIRETO correspondente.
    IF NEW.tipo_vinculo = 'extra' THEN
      RETURN NEW;
    END IF;

    v_empresa_id  := NEW.empresa_id;
    v_nr_cliente  := TRIM(COALESCE(NEW.nr_cliente, ''));
    v_instituicao := TRIM(COALESCE(NEW.instituicao, ''));
    v_operador_id := NEW.operador_id;
    v_acordo_id   := NEW.id;

    -- Só registra se não for nao_pago
    IF NEW.status = 'nao_pago' THEN
      RETURN NEW;
    END IF;

    IF v_empresa_id IS NULL OR v_operador_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(nome, email, 'Operador') INTO v_nome_op
    FROM public.perfis WHERE id = v_operador_id LIMIT 1;

    IF v_nr_cliente <> '' THEN
      INSERT INTO public.nr_registros (
        empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em
      )
      VALUES (v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id, v_nome_op, v_acordo_id, NOW())
      ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
        operador_id   = EXCLUDED.operador_id,
        operador_nome = EXCLUDED.operador_nome,
        acordo_id     = EXCLUDED.acordo_id,
        atualizado_em = NOW();
    END IF;

    IF v_instituicao <> '' THEN
      INSERT INTO public.nr_registros (
        empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em
      )
      VALUES (v_empresa_id, v_instituicao, 'instituicao', v_operador_id, v_nome_op, v_acordo_id, NOW())
      ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
        operador_id   = EXCLUDED.operador_id,
        operador_nome = EXCLUDED.operador_nome,
        acordo_id     = EXCLUDED.acordo_id,
        atualizado_em = NOW();
    END IF;

    RETURN NEW;
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
      DELETE FROM public.nr_registros WHERE acordo_id = v_acordo_id;
      RETURN NEW;
    END IF;

    -- Buscar nome do operador (apenas 1 vez)
    SELECT COALESCE(nome, email, 'Operador') INTO v_nome_op
    FROM public.perfis WHERE id = v_operador_id LIMIT 1;

    -- Status mudou DE nao_pago para outro → re-registrar NR
    IF OLD.status = 'nao_pago' AND NEW.status <> 'nao_pago' THEN
      -- UPDATE de nao_pago→ativo: só registra se for DIRETO
      IF NEW.tipo_vinculo <> 'extra' THEN
        IF v_nr_cliente <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL THEN
          INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
          VALUES (v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id, v_nome_op, v_acordo_id, NOW())
          ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
            operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
            acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();
        END IF;
        IF v_instituicao <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL THEN
          INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
          VALUES (v_empresa_id, v_instituicao, 'instituicao', v_operador_id, v_nome_op, v_acordo_id, NOW())
          ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
            operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
            acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    -- NR mudou de valor
    IF (OLD.nr_cliente IS DISTINCT FROM NEW.nr_cliente) THEN
      IF TRIM(COALESCE(OLD.nr_cliente, '')) <> '' THEN
        DELETE FROM public.nr_registros
        WHERE empresa_id = v_empresa_id AND nr_value = TRIM(OLD.nr_cliente)
          AND campo = 'nr_cliente' AND acordo_id = v_acordo_id;
      END IF;
      IF v_nr_cliente <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL
         AND NEW.status <> 'nao_pago' AND NEW.tipo_vinculo <> 'extra' THEN
        INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
        VALUES (v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id, v_nome_op, v_acordo_id, NOW())
        ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
          operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
          acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();
      END IF;
    END IF;

    -- Inscrição mudou de valor
    IF (OLD.instituicao IS DISTINCT FROM NEW.instituicao) THEN
      IF TRIM(COALESCE(OLD.instituicao, '')) <> '' THEN
        DELETE FROM public.nr_registros
        WHERE empresa_id = v_empresa_id AND nr_value = TRIM(OLD.instituicao)
          AND campo = 'instituicao' AND acordo_id = v_acordo_id;
      END IF;
      IF v_instituicao <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL
         AND NEW.status <> 'nao_pago' AND NEW.tipo_vinculo <> 'extra' THEN
        INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
        VALUES (v_empresa_id, v_instituicao, 'instituicao', v_operador_id, v_nome_op, v_acordo_id, NOW())
        ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
          operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
          acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Recriar trigger (idempotente)
DROP TRIGGER IF EXISTS trg_sync_nr_registros ON public.acordos;

CREATE TRIGGER trg_sync_nr_registros
  AFTER INSERT OR UPDATE OR DELETE
  ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_nr_registros();

COMMENT ON FUNCTION public.fn_sync_nr_registros() IS
  'v3 — Fix: acordos EXTRA ignorados no INSERT e UPDATE→ativo para não sobrescrever '
  'o dono registrado em nr_registros. INSERT de DIRETO registra NR normalmente. '
  'DELETE libera independente do tipo_vinculo. '
  'Isolamento por empresa_id garante que Bookplay e PaguePay não conflitem.';
