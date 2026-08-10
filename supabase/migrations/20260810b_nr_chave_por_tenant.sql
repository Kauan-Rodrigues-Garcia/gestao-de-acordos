-- ═══════════════════════════════════════════════════════════════════════════
-- DIRETO/EXTRA — `instituicao` deixa de ser chave de NR na BookPlay
-- ═══════════════════════════════════════════════════════════════════════════
-- A 20260809d moveu a trava do NR para o banco e passou a RECUSAR
-- (NR_JA_REGISTRADO) quando o valor já pertence a outro operador. Corrigiu a
-- corrida, mas registrou o campo errado.
--
-- Na BookPlay `instituicao` não é código nenhum: é um <Select> de lista fixa
-- (BOOKPLAY, MUNDIAL EDITORA, …) — uma CATEGORIA, repetida em todo acordo. Com
-- a trava ativa, o primeiro operador que salvou passou a ser dono da string
-- "BOOKPLAY" para a empresa inteira, e todo mundo depois levou
--
--   NR_JA_REGISTRADO: o Código "BOOKPLAY" já está tabulado por <fulano>.
--
-- em qualquer INSERT ou UPDATE que tocasse o campo — cadastrar, editar, ou
-- adicionar parcela (a parcela nova copia `instituicao` do acordo pai).
--
-- A própria 20260809d já tinha diagnosticado isso ao consertar
-- `fn_sync_par_vinculo`, onde escreveu a regra certa: `instituicao` só serve de
-- chave quando NÃO existe `nr_cliente` — o caso da PaguePlay, onde ela É o
-- código. `fn_sync_nr_registros` ficou de fora e continuou registrando as duas.
-- Aqui as duas funções passam a usar a mesma regra.
--
-- Também fecha três buracos do branch UPDATE, que só reagia a status e a
-- mudança de valor do NR:
--   • DIRETO → EXTRA não liberava o registro (a titularidade ficava num acordo
--     que já não é DIRETO, travando o NR para sempre);
--   • EXTRA → DIRETO não reivindicava o registro (o novo DIRETO ficava sem
--     titularidade, e o NR seguia livre para um terceiro tomar);
--   • troca de operador (transferência) não movia o registro.
--
-- E parcela do mesmo grupo deixa de poder conflitar: o acordo pai já é dono do
-- NR, a linha nova não muda titularidade nenhuma, logo não há o que autorizar.
--
-- Idempotente.

-- ─── 1. Índice do FK usado pelo trigger ─────────────────────────────────────
-- `DELETE FROM nr_registros WHERE acordo_id = X` roda em todo DELETE de acordo
-- e em toda conversão para EXTRA. Sem índice é seq scan a cada gravação.
CREATE INDEX IF NOT EXISTS nr_registros_acordo_id_idx
  ON public.nr_registros (acordo_id);

-- ─── 2. Regra única de "qual campo é chave" ─────────────────────────────────
--
-- Devolve o campo que vale como chave de NR para um acordo, ou NULL quando o
-- acordo não tem chave nenhuma. Existe como função para que trigger e
-- diagnóstico não escrevam a regra duas vezes — foi assim que ela divergiu.
--
--   nr_cliente preenchido → 'nr_cliente'  (BookPlay)
--   só instituicao        → 'instituicao' (PaguePlay: a instituição É o código)
CREATE OR REPLACE FUNCTION public.fn_nr_campo_chave(
  p_nr_cliente  TEXT,
  p_instituicao TEXT
) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN TRIM(COALESCE(p_nr_cliente, ''))  <> '' THEN 'nr_cliente'
    WHEN TRIM(COALESCE(p_instituicao, '')) <> '' THEN 'instituicao'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.fn_nr_campo_chave IS
  'Qual campo vale como chave de NR: nr_cliente quando existe (BookPlay), senão instituicao (PaguePlay). Na BookPlay instituicao é categoria, não chave. Ver 20260810b.';

-- ─── 3. Dono conflitante — agora ignora o próprio grupo ─────────────────────
--
-- A assinatura ganhou `p_grupo_id`, então CREATE OR REPLACE criaria uma
-- sobrecarga e as chamadas de 4 argumentos ficariam ambíguas ("function is not
-- unique"). Derruba a versão antiga primeiro. A ordem importa:
-- `fn_nr_exigir_livre` depende desta, então cai junto e é recriada abaixo.
DROP FUNCTION IF EXISTS public.fn_nr_exigir_livre(UUID, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fn_nr_dono_conflitante(UUID, TEXT, TEXT, UUID);

-- Devolve o nome do operador que já detém o NR, ou NULL quando está livre.
-- Só acusa conflito quando:
--   • existe registro para (empresa, nr, campo);
--   • o dono é OUTRO operador (o mesmo operador re-aponta o próprio NR — é o
--     que faz o parcelamento no mesmo grupo funcionar);
--   • o acordo daquele registro AINDA EXISTE (registro órfão não trava
--     ninguém: sem isto, uma linha velha bloquearia o NR para sempre);
--   • o acordo daquele registro NÃO é do mesmo grupo de parcelas que o meu.
CREATE FUNCTION public.fn_nr_dono_conflitante(
  p_empresa_id  UUID,
  p_nr          TEXT,
  p_campo       TEXT,
  p_operador_id UUID,
  p_grupo_id    UUID DEFAULT NULL
) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.operador_nome
    FROM public.nr_registros r
    JOIN public.acordos a ON a.id = r.acordo_id
   WHERE r.empresa_id  = p_empresa_id
     AND r.nr_value    = p_nr
     AND r.campo       = p_campo
     AND r.operador_id IS DISTINCT FROM p_operador_id
     -- parcela do mesmo grupo não conflita: o pai já é dono do NR
     AND (p_grupo_id IS NULL OR a.acordo_grupo_id IS DISTINCT FROM p_grupo_id)
   LIMIT 1;
$$;

-- Recusa a gravação quando o NR é de outro operador.
--
-- A mensagem carrega o marcador NR_JA_REGISTRADO: o frontend casa por ele para
-- mostrar um aviso decente em vez de despejar erro de banco na tela.
CREATE FUNCTION public.fn_nr_exigir_livre(
  p_empresa_id  UUID,
  p_nr          TEXT,
  p_campo       TEXT,
  p_operador_id UUID,
  p_grupo_id    UUID DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dono TEXT;
BEGIN
  v_dono := public.fn_nr_dono_conflitante(p_empresa_id, p_nr, p_campo, p_operador_id, p_grupo_id);
  IF v_dono IS NOT NULL THEN
    RAISE EXCEPTION
      'NR_JA_REGISTRADO: % "%" já está tabulado por %. Recarregue a lista e use o fluxo de autorização.',
      CASE WHEN p_campo = 'instituicao' THEN 'o Código' ELSE 'o NR' END,
      p_nr, v_dono;
  END IF;
END;
$$;

-- ─── 4. Trigger v5 ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_nr_registros()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id  UUID;
  v_operador_id UUID;
  v_acordo_id   UUID;
  v_grupo_id    UUID;
  v_nome_op     TEXT;
  -- campo/valor que valem como chave AGORA e ANTES
  v_campo       TEXT;
  v_valor       TEXT;
  v_campo_old   TEXT;
  v_valor_old   TEXT;
  v_era_titular BOOLEAN;
  v_e_titular   BOOLEAN;
BEGIN

  -- ── DELETE: liberar NR ────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.nr_registros WHERE acordo_id = OLD.id;
    RETURN OLD;
  END IF;

  v_empresa_id  := NEW.empresa_id;
  v_operador_id := NEW.operador_id;
  v_acordo_id   := NEW.id;
  v_grupo_id    := NEW.acordo_grupo_id;

  -- A chave é UMA só por acordo. Na BookPlay `instituicao` é categoria
  -- (BOOKPLAY, MUNDIAL EDITORA…) e registrá-la travava a categoria inteira
  -- para o primeiro operador que salvasse.
  v_campo := public.fn_nr_campo_chave(NEW.nr_cliente, NEW.instituicao);
  v_valor := CASE v_campo
               WHEN 'nr_cliente'  THEN TRIM(NEW.nr_cliente)
               WHEN 'instituicao' THEN TRIM(NEW.instituicao)
             END;

  -- Titular do NR é só o DIRETO ativo: EXTRA não registra (o NR pertence ao
  -- DIRETO do par) e nao_pago libera.
  v_e_titular := COALESCE(NEW.tipo_vinculo, 'direto') <> 'extra'
             AND NEW.status <> 'nao_pago'
             AND v_empresa_id  IS NOT NULL
             AND v_operador_id IS NOT NULL
             AND v_campo       IS NOT NULL;

  -- ── INSERT ────────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NOT v_e_titular THEN RETURN NEW; END IF;

    SELECT COALESCE(nome, email, 'Operador') INTO v_nome_op
      FROM public.perfis WHERE id = v_operador_id LIMIT 1;

    PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_valor, v_campo, v_operador_id, v_grupo_id);
    INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
    VALUES (v_empresa_id, v_valor, v_campo, v_operador_id, v_nome_op, v_acordo_id, NOW())
    ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
      operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
      acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();

    RETURN NEW;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN

    v_campo_old := public.fn_nr_campo_chave(OLD.nr_cliente, OLD.instituicao);
    v_valor_old := CASE v_campo_old
                     WHEN 'nr_cliente'  THEN TRIM(OLD.nr_cliente)
                     WHEN 'instituicao' THEN TRIM(OLD.instituicao)
                   END;

    v_era_titular := COALESCE(OLD.tipo_vinculo, 'direto') <> 'extra'
                 AND OLD.status <> 'nao_pago'
                 AND v_campo_old IS NOT NULL;

    -- Deixou de ser titular (virou EXTRA, virou nao_pago, ou perdeu a chave)
    -- ou a chave/dono mudou → solta o registro antigo antes de qualquer coisa.
    --
    -- O filtro por acordo_id é o que impede este acordo de apagar o registro
    -- de OUTRO acordo que legitimamente detenha o mesmo valor.
    IF v_era_titular AND (
         NOT v_e_titular
         OR v_campo IS DISTINCT FROM v_campo_old
         OR v_valor IS DISTINCT FROM v_valor_old
         OR v_operador_id IS DISTINCT FROM OLD.operador_id
       ) THEN
      DELETE FROM public.nr_registros
       WHERE acordo_id  = v_acordo_id
         AND empresa_id = COALESCE(OLD.empresa_id, v_empresa_id)
         AND nr_value   = v_valor_old
         AND campo      = v_campo_old;
    END IF;

    IF NOT v_e_titular THEN RETURN NEW; END IF;

    -- Já era titular do mesmo valor, mesmo campo e mesmo dono: nada mudou do
    -- ponto de vista do NR. Sair aqui evita cobrar `fn_nr_exigir_livre` de
    -- quem só editou valor, vencimento ou observação.
    IF v_era_titular
       AND v_campo = v_campo_old
       AND v_valor = v_valor_old
       AND v_operador_id IS NOT DISTINCT FROM OLD.operador_id THEN
      RETURN NEW;
    END IF;

    SELECT COALESCE(nome, email, 'Operador') INTO v_nome_op
      FROM public.perfis WHERE id = v_operador_id LIMIT 1;

    -- Passou a ser titular agora: EXTRA→DIRETO, nao_pago→ativo, chave nova,
    -- ou acordo transferido para outro operador.
    PERFORM public.fn_nr_exigir_livre(v_empresa_id, v_valor, v_campo, v_operador_id, v_grupo_id);
    INSERT INTO public.nr_registros (empresa_id, nr_value, campo, operador_id, operador_nome, acordo_id, atualizado_em)
    VALUES (v_empresa_id, v_valor, v_campo, v_operador_id, v_nome_op, v_acordo_id, NOW())
    ON CONFLICT (empresa_id, nr_value, campo) DO UPDATE SET
      operador_id = EXCLUDED.operador_id, operador_nome = EXCLUDED.operador_nome,
      acordo_id = EXCLUDED.acordo_id, atualizado_em = NOW();

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
  'v5 — UMA chave por acordo (fn_nr_campo_chave): nr_cliente na BookPlay, instituicao só na PaguePlay. '
  'RECUSA (NR_JA_REGISTRADO) quando o NR já é de outro operador, exceto parcela do mesmo grupo. '
  'UPDATE trata tipo_vinculo nos dois sentidos, troca de dono e mudança de chave. Ver 20260810b.';

-- ─── 5. Limpeza dos registros que a v4 criou errado ─────────────────────────
--
-- Sem isto o código novo fica correto e a produção segue travada: as linhas
-- "BOOKPLAY", "MUNDIAL EDITORA"… continuam lá, com dono, recusando todo mundo.

-- 5a. `instituicao` registrada em acordo que TEM nr_cliente — a categoria
--     BookPlay travada em nome de um operador. É a causa dos dois prints.
DELETE FROM public.nr_registros r
 USING public.acordos a
 WHERE r.acordo_id = a.id
   AND r.campo     = 'instituicao'
   AND TRIM(COALESCE(a.nr_cliente, '')) <> '';

-- 5b. Titularidade em acordo EXTRA — quem manda no NR é o DIRETO do par.
DELETE FROM public.nr_registros r
 USING public.acordos a
 WHERE r.acordo_id = a.id
   AND a.tipo_vinculo = 'extra';

-- 5c. Titularidade em acordo nao_pago — nao_pago libera o NR.
DELETE FROM public.nr_registros r
 USING public.acordos a
 WHERE r.acordo_id = a.id
   AND a.status = 'nao_pago';

-- 5d. Órfãos: o acordo já não existe. `fn_nr_dono_conflitante` sempre os
--     ignorou, então some com eles em vez de arrastar lixo que confunde
--     qualquer consulta manual à tabela.
DELETE FROM public.nr_registros r
 WHERE NOT EXISTS (SELECT 1 FROM public.acordos a WHERE a.id = r.acordo_id);

-- ─── 6. Grants ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.fn_nr_campo_chave(TEXT, TEXT)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nr_dono_conflitante(UUID, TEXT, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nr_exigir_livre(UUID, TEXT, TEXT, UUID, UUID)     TO authenticated;
