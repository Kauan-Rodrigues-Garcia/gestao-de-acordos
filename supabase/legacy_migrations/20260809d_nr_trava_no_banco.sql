-- ═══════════════════════════════════════════════════════════════════════════
-- DIRETO/EXTRA — a trava do NR sai do navegador e vai para o banco
-- ═══════════════════════════════════════════════════════════════════════════
-- Dois operadores com a lógica Direto/Extra DESATIVADA conseguiram tabular o
-- mesmo acordo. Auditoria: a regra inteira vivia no cliente, e o banco não só
-- deixava passar como AJUDAVA —
--
--   ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET operador_id = ...
--
-- ou seja, o segundo DIRETO a chegar simplesmente roubava o registro do
-- primeiro, em silêncio. Bastava a janela entre `verificarNrRegistro` e o
-- INSERT (dois operadores tabulando o mesmo NR nos mesmos segundos) para os
-- dois passarem: os dois consultam antes de qualquer um gravar, os dois veem
-- "sem conflito".
--
-- Aqui o trigger passa a RECUSAR quando o NR já é de OUTRO operador. A checagem
-- do cliente continua existindo (é ela que dá a mensagem boa e abre o fluxo de
-- autorização), mas deixa de ser a única — e a corrida deixa de existir, porque
-- quem chega em segundo bate na unicidade do banco dentro da mesma transação.
--
-- Também corrige `fn_sync_par_vinculo`, que achava o "par" por
-- `instituicao` — na BookPlay isso é o NOME da instituição (BOOKPLAY, MUNDIAL
-- EDITORA…), não uma chave, e a RPC sobrescrevia valor/vencimento/status de um
-- acordo alheio que só compartilhava a instituição.
--
-- Idempotente.

-- ─── 1. Quem é o dono conflitante deste NR? ─────────────────────────────────
--
-- Devolve o nome do operador que já detém o NR, ou NULL quando está livre para
-- este operador. Só acusa conflito quando:
--   • existe registro para (empresa, nr, campo);
--   • o dono é OUTRO operador (o mesmo operador pode re-apontar o próprio NR —
--     é o que faz o parcelamento no mesmo grupo funcionar);
--   • o acordo daquele registro AINDA EXISTE (registro órfão não trava
--     ninguém: sem isto, uma linha velha bloquearia o NR para sempre).
CREATE OR REPLACE FUNCTION public.fn_nr_dono_conflitante(
  p_empresa_id  UUID,
  p_nr          TEXT,
  p_campo       TEXT,
  p_operador_id UUID
) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.operador_nome
    FROM public.nr_registros r
   WHERE r.empresa_id  = p_empresa_id
     AND r.nr_value    = p_nr
     AND r.campo       = p_campo
     AND r.operador_id IS DISTINCT FROM p_operador_id
     AND EXISTS (SELECT 1 FROM public.acordos a WHERE a.id = r.acordo_id)
   LIMIT 1;
$$;

-- Recusa a gravação quando o NR é de outro operador.
--
-- A mensagem carrega o marcador NR_JA_REGISTRADO: o frontend casa por ele para
-- mostrar um aviso decente em vez de despejar erro de banco na tela.
CREATE OR REPLACE FUNCTION public.fn_nr_exigir_livre(
  p_empresa_id  UUID,
  p_nr          TEXT,
  p_campo       TEXT,
  p_operador_id UUID
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dono TEXT;
BEGIN
  v_dono := public.fn_nr_dono_conflitante(p_empresa_id, p_nr, p_campo, p_operador_id);
  IF v_dono IS NOT NULL THEN
    RAISE EXCEPTION
      'NR_JA_REGISTRADO: % "%" já está tabulado por %. Recarregue a lista e use o fluxo de autorização.',
      CASE WHEN p_campo = 'instituicao' THEN 'o Código' ELSE 'o NR' END,
      p_nr, v_dono;
  END IF;
END;
$$;

-- ─── 2. Trigger: registra, mas nunca rouba ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_nr_registros()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    DELETE FROM public.nr_registros WHERE acordo_id = OLD.id;
    RETURN OLD;
  END IF;

  v_empresa_id  := NEW.empresa_id;
  v_nr_cliente  := TRIM(COALESCE(NEW.nr_cliente, ''));
  v_instituicao := TRIM(COALESCE(NEW.instituicao, ''));
  v_operador_id := NEW.operador_id;
  v_acordo_id   := NEW.id;

  -- ── INSERT ────────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- EXTRA não registra: o NR pertence ao DIRETO correspondente.
    IF NEW.tipo_vinculo = 'extra' THEN RETURN NEW; END IF;
    IF NEW.status = 'nao_pago' THEN RETURN NEW; END IF;
    IF v_empresa_id IS NULL OR v_operador_id IS NULL THEN RETURN NEW; END IF;

    SELECT COALESCE(nome, email, 'Operador') INTO v_nome_op
      FROM public.perfis WHERE id = v_operador_id LIMIT 1;

    IF v_nr_cliente <> '' THEN
      PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id);
      INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
      VALUES (v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id, v_nome_op, v_acordo_id, NOW())
      ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
        operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
        acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();
    END IF;

    IF v_instituicao <> '' THEN
      PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_instituicao, 'instituicao', v_operador_id);
      INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
      VALUES (v_empresa_id, v_instituicao, 'instituicao', v_operador_id, v_nome_op, v_acordo_id, NOW())
      ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
        operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
        acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();
    END IF;

    RETURN NEW;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN

    -- Passou a nao_pago → liberar NR
    IF NEW.status = 'nao_pago' AND (OLD.status IS DISTINCT FROM 'nao_pago') THEN
      DELETE FROM public.nr_registros WHERE acordo_id = v_acordo_id;
      RETURN NEW;
    END IF;

    SELECT COALESCE(nome, email, 'Operador') INTO v_nome_op
      FROM public.perfis WHERE id = v_operador_id LIMIT 1;

    -- Voltou de nao_pago para ativo → re-registrar (só DIRETO)
    IF OLD.status = 'nao_pago' AND NEW.status <> 'nao_pago' THEN
      IF NEW.tipo_vinculo <> 'extra' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL THEN
        IF v_nr_cliente <> '' THEN
          PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id);
          INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
          VALUES (v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id, v_nome_op, v_acordo_id, NOW())
          ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
            operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
            acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();
        END IF;
        IF v_instituicao <> '' THEN
          PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_instituicao, 'instituicao', v_operador_id);
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
        PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id);
        INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
        VALUES (v_empresa_id, v_nr_cliente, 'nr_cliente', v_operador_id, v_nome_op, v_acordo_id, NOW())
        ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
          operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
          acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();
      END IF;
    END IF;

    -- Inscrição/Código mudou de valor
    IF (OLD.instituicao IS DISTINCT FROM NEW.instituicao) THEN
      IF TRIM(COALESCE(OLD.instituicao, '')) <> '' THEN
        DELETE FROM public.nr_registros
         WHERE empresa_id = v_empresa_id AND nr_value = TRIM(OLD.instituicao)
           AND campo = 'instituicao' AND acordo_id = v_acordo_id;
      END IF;
      IF v_instituicao <> '' AND v_empresa_id IS NOT NULL AND v_operador_id IS NOT NULL
         AND NEW.status <> 'nao_pago' AND NEW.tipo_vinculo <> 'extra' THEN
        PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_instituicao, 'instituicao', v_operador_id);
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

DROP TRIGGER IF EXISTS trg_sync_nr_registros ON public.acordos;
CREATE TRIGGER trg_sync_nr_registros
  AFTER INSERT OR UPDATE OR DELETE ON public.acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_nr_registros();

COMMENT ON FUNCTION public.fn_sync_nr_registros() IS
  'v4 — RECUSA (NR_JA_REGISTRADO) quando o NR já pertence a outro operador, em vez de reatribuir em silêncio. '
  'Mesmo operador continua re-apontando (parcelamento no mesmo grupo). EXTRA não registra. '
  'DELETE e status nao_pago liberam. Ver 20260809d.';

-- ─── 3. fn_sync_par_vinculo: achar o par pelo VÍNCULO, não por instituição ──
--
-- A versão anterior localizava o par com
--     (nr_cliente = X) OR (instituicao = Y)   -- LIMIT 1, sem ORDER BY
-- e sobrescrevia valor/vencimento/cliente/status do que achasse. Na BookPlay
-- `instituicao` é o nome da instituição, então QUALQUER acordo EXTRA da empresa
-- com a mesma instituição podia ser escolhido — e reescrito com os dados de
-- outro cliente.
--
-- Agora o par precisa apontar de volta para mim (`vinculo_operador_id`), que é
-- como o par é materializado nos dois lados. E `instituicao` só serve de chave
-- quando não há `nr_cliente` — o caso da PaguePlay, onde ela É o código.
CREATE OR REPLACE FUNCTION public.fn_sync_par_vinculo(
  p_acordo_id    UUID,
  p_valor        NUMERIC,
  p_vencimento   DATE,
  p_nome_cliente TEXT,
  p_tipo         TEXT,
  p_whatsapp     TEXT DEFAULT NULL,
  p_parcelas     INT  DEFAULT 1,
  p_status       TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_id   UUID;
  v_nr_cliente   TEXT;
  v_instituicao  TEXT;
  v_tipo_vinculo TEXT;
  v_operador_id  UUID;
  v_vinculo_op   UUID;
  v_num_parcela  INT;
  v_par_id       UUID;
BEGIN
  SELECT empresa_id, TRIM(COALESCE(nr_cliente, '')), TRIM(COALESCE(instituicao, '')),
         tipo_vinculo, operador_id, vinculo_operador_id, numero_parcela
    INTO v_empresa_id, v_nr_cliente, v_instituicao,
         v_tipo_vinculo, v_operador_id, v_vinculo_op, v_num_parcela
    FROM acordos WHERE id = p_acordo_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- Sem vínculo declarado não há par. Adivinhar pela chave do cliente é o que
  -- fazia a versão anterior atropelar acordo alheio.
  IF v_vinculo_op IS NULL THEN RETURN; END IF;

  SELECT a.id INTO v_par_id
    FROM acordos a
   WHERE a.empresa_id = v_empresa_id
     AND a.id <> p_acordo_id
     -- o outro lado do par: é dele, e aponta de volta para mim
     AND a.operador_id         = v_vinculo_op
     AND a.vinculo_operador_id = v_operador_id
     AND a.tipo_vinculo = CASE WHEN v_tipo_vinculo = 'extra' THEN 'direto' ELSE 'extra' END
     AND (
       (v_nr_cliente <> '' AND TRIM(COALESCE(a.nr_cliente, '')) = v_nr_cliente)
       -- PaguePlay: sem nr_cliente, a chave do cliente é a instituição/código
       OR (v_nr_cliente = '' AND v_instituicao <> '' AND TRIM(COALESCE(a.instituicao, '')) = v_instituicao)
     )
   -- Acordo parcelado tem várias linhas no par: casa a mesma parcela primeiro,
   -- e desempata por ordem estável (sem ORDER BY o Postgres pode devolver
   -- qualquer uma, e a sincronização viraria loteria entre execuções).
   ORDER BY (a.numero_parcela IS DISTINCT FROM v_num_parcela), a.numero_parcela NULLS LAST, a.criado_em
   LIMIT 1;

  IF v_par_id IS NULL THEN RETURN; END IF;

  UPDATE acordos SET
    valor        = p_valor,
    vencimento   = p_vencimento,
    nome_cliente = p_nome_cliente,
    tipo         = p_tipo,
    whatsapp     = p_whatsapp,
    parcelas     = p_parcelas,
    status       = COALESCE(p_status, status)
  WHERE id = v_par_id;
END;
$$;

COMMENT ON FUNCTION public.fn_sync_par_vinculo IS
  'Sincroniza o par DIRETO/EXTRA. Acha o par pelo vínculo declarado nos dois lados, nunca por instituição solta — na BookPlay isso casava acordo alheio. Ver 20260809d.';

GRANT EXECUTE ON FUNCTION public.fn_nr_dono_conflitante(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nr_exigir_livre(UUID, TEXT, TEXT, UUID)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_par_vinculo                             TO authenticated;
