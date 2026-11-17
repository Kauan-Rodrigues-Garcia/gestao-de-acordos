-- ============================================================================
-- Pix automático — «Corrigir valor» no NR passa a somar/retirar de verdade
-- 17/11/2026
-- ============================================================================
--
-- ## O defeito
--
-- Pedido do usuário: «o NR corrigir valor divergente realmente não retira nem
-- soma».
--
-- `fn_pix_saldo_aplicar` grava `ajuste_valor` no acordo e reserva o saldo. Mas
-- o gatilho BEFORE UPDATE `fn_pix_congela_campos_do_operador` ainda decide
-- «quem é liderança» por uma LISTA DE CARGOS (lider, elite, gerencia,
-- administrador, super_admin), enquanto o resto do Pix já pergunta ao PAINEL
-- (`fn_user_escopo('pix') >= 2`, migration 20260823040000). Quem corrige com a
-- permissão do painel e um cargo fora da lista tem o `ajuste_*` devolvido ao
-- valor antigo EM SILÊNCIO:
--
--   • a tela diz «Correção aplicada», mas o NR continua sem correção — não
--     soma nem retira nada do que vai ser pago;
--   • o saldo fica RESERVADO naquele NR (a tabela de saldos não tem o
--     gatilho), e nem «retirar» funciona («este acordo não carrega correção»);
--     a divergência fica presa para sempre.
--
-- ## O conserto
--
--   1. O gatilho pergunta ao painel, como as policies: liderança = a lista
--      antiga OU `fn_user_escopo('pix') >= 2`.
--   2. `ajuste_*` só muda pelas RPCs do saldo (marca local da transação
--      `app.pix_saldo_rpc`). Ninguém mais grava correção por UPDATE solto.
--   3. `fn_pix_saldo_aplicar` confere, depois de gravar, que a correção ficou
--      no NR; se não ficou, desfaz tudo com erro — nunca mais «aplicada» sem
--      ter aplicado.
--   4. `fn_pix_saldo_retirar` solta um saldo preso num NR sem correção, em vez
--      de recusar.
--   5. Reparo: os saldos que já estão presos assim voltam a ficar LIVRES (o
--      botão «Corrigir valor» volta a aparecer). Nenhum valor muda; só a
--      reserva órfã é solta, com registro no histórico da aba.
--
-- ## O que de fato acontecia (conferido no banco em 17/11/2026)
--
-- Nos últimos 60 dias os saldos foram ANOTADOS dezenas de vezes e NENHUMA vez
-- aplicados num NR (zero `saldo_aplicado` no log); depois eram zerados à mão.
-- Anotar não tira nem soma nada: o dinheiro só mexia com o segundo passo,
-- «Corrigir valor» na linha de um NR aprovado — escondido, e nunca feito.
--
--   6. O saldo ENTRA SOZINHO no pagamento (`fn_pix_saldo_auto`): ao anotar,
--      vai para o NR aprovado e não pago da pessoa (o mais antigo dos últimos
--      45 dias; senão o mais antigo de todos). Sem NR assim, espera e entra
--      sozinho quando o próximo NR dela for aprovado. Pagar esse NR quita o
--      saldo (como já era). Se o NR sair de «aprovado» antes de pago, a
--      correção sai dele e vai para outro.
--   7. Anotar mais (somar/substituir) com o saldo já aplicado não trava mais:
--      a correção sai do NR, o saldo muda e entra de novo, já com o valor novo.
--   8. Os saldos livres que existem hoje entram agora no NR da pessoa.
--   9. DESCONTO EM PARTES: um NR desconta no máximo a comissão dele — nunca
--      fica negativo. O resto continua no saldo e entra sozinho no próximo NR
--      aprovado. Ex. (conferido em 17/11): Eduardo −R$ 23,43 num NR de
--      comissão R$ 18,00 → o NR desconta R$ 18,00 (paga R$ 0,00) e os
--      R$ 5,43 vão para o próximo. Pagar o NR quita só a parte dele; desfazer
--      o pagamento devolve a parte ao saldo. O que a empresa DEVE (positivo)
--      entra inteiro, sem limite. A comissão é a conta do app (`comissaoDe`,
--      NR aprovado): o fixo travado, ou valor × (% travado + bônus) ÷ 100.
--
-- Reexecutável. Nenhuma tabela nova.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ── 1 e 2. O gatilho ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_congela_campos_do_operador()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- A correção de divergência só muda pelas RPCs do saldo, para todo mundo.
  IF COALESCE(current_setting('app.pix_saldo_rpc', true), '') <> '1' THEN
    NEW.ajuste_valor    := OLD.ajuste_valor;
    NEW.ajuste_motivo   := OLD.ajuste_motivo;
    NEW.ajuste_em       := OLD.ajuste_em;
    NEW.ajuste_por      := OLD.ajuste_por;
    NEW.ajuste_por_nome := OLD.ajuste_por_nome;
  END IF;

  -- Liderança: a lista antiga OU o painel (a mesma régua das policies do Pix).
  IF public.fn_user_has_any_role(
       ARRAY['lider','elite','gerencia','administrador','super_admin'])
     OR public.fn_user_escopo('pix') >= 2 THEN
    RETURN NEW;
  END IF;

  NEW.empresa_id        := OLD.empresa_id;
  NEW.operador_id       := OLD.operador_id;
  NEW.operador_nome     := OLD.operador_nome;
  NEW.setor_id          := OLD.setor_id;
  NEW.status            := OLD.status;
  NEW.pct_comissao      := OLD.pct_comissao;
  NEW.avaliado_por      := OLD.avaliado_por;
  NEW.avaliado_por_nome := OLD.avaliado_por_nome;
  NEW.avaliado_em       := OLD.avaliado_em;
  NEW.pago              := OLD.pago;
  NEW.pago_em           := OLD.pago_em;
  NEW.pago_por          := OLD.pago_por;
  NEW.pago_por_nome     := OLD.pago_por_nome;
  NEW.criado_em         := OLD.criado_em;
  RETURN NEW;
END;
$function$;

-- ── 9. A comissão do NR e a parte do saldo que cabe nele ───────────────────

-- A comissão de um NR APROVADO, igual a `comissaoDe` do app.
CREATE OR REPLACE FUNCTION public.fn_pix_comissao_da_linha(a public.pix_automatico_acordos)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN a.comissao_fixa IS NOT NULL THEN ROUND(a.comissao_fixa, 2)
    ELSE ROUND(ROUND(a.valor * (
           COALESCE(a.pct_comissao,
                    (SELECT c.pct FROM public.pix_automatico_config c
                      WHERE c.empresa_id = a.empresa_id AND c.setor_id = a.setor_id LIMIT 1),
                    0.25)
           + COALESCE(a.bonus_pct, 0))) / 100, 2)
  END;
$function$;

-- Quanto do saldo vai para um NR: o que a empresa deve, inteiro; o desconto,
-- até a comissão do NR (o NR nunca fica negativo).
CREATE OR REPLACE FUNCTION public.fn_pix_saldo_parcela(p_saldo NUMERIC, p_comissao NUMERIC)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT ROUND(CASE WHEN p_saldo >= 0 THEN p_saldo
                    ELSE GREATEST(p_saldo, -GREATEST(COALESCE(p_comissao, 0), 0)) END, 2);
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_comissao_da_linha(public.pix_automatico_acordos) FROM PUBLIC, anon, authenticated;

-- ── 3. Aplicar: grava, confere, e só então reserva ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_aplicar(p_acordo_id UUID)
RETURNS public.pix_automatico_acordos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_acordo public.pix_automatico_acordos;
  v_saldo  public.pix_automatico_saldos;
  v_autor  UUID := auth.uid();
  v_nome   TEXT;
  v_parcela NUMERIC(12,2);
BEGIN
  SELECT * INTO v_acordo FROM public.pix_automatico_acordos WHERE id = p_acordo_id FOR UPDATE;

  IF v_acordo.id IS NULL THEN
    RAISE EXCEPTION 'PIX_SALDO_ACORDO: registro nao encontrado — recarregue a lista.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.fn_can_access_empresa(v_acordo.empresa_id) THEN
    RAISE EXCEPTION 'PIX_SALDO_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_pix_pode_ajustar_saldo() THEN
    RAISE EXCEPTION 'PIX_SALDO_SEM_PERMISSAO: voce nao pode aplicar correcao de valor.'
      USING ERRCODE = '42501';
  END IF;
  IF v_acordo.status <> 'aprovado' THEN
    RAISE EXCEPTION
      'PIX_SALDO_SO_APROVADO: o NR % esta como "%" — a correcao so entra em acordo aprovado.',
      v_acordo.nr_cliente, v_acordo.status USING ERRCODE = 'check_violation';
  END IF;
  IF v_acordo.pago THEN
    RAISE EXCEPTION
      'PIX_SALDO_JA_PAGO: a comissao do NR % ja foi paga. Desfaca o pagamento antes de aplicar a correcao.',
      v_acordo.nr_cliente USING ERRCODE = 'check_violation';
  END IF;
  IF v_acordo.ajuste_valor IS NOT NULL THEN
    RAISE EXCEPTION
      'PIX_SALDO_JA_APLICADO: o NR % ja carrega uma correcao.', v_acordo.nr_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_saldo
    FROM public.pix_automatico_saldos
   WHERE empresa_id = v_acordo.empresa_id AND operador_id = v_acordo.operador_id
     FOR UPDATE;

  IF v_saldo.id IS NULL THEN
    RAISE EXCEPTION
      'PIX_SALDO_INEXISTENTE: nao ha saldo de divergencia para este operador.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reserva órfã (num NR que não carrega a correção): solta antes de aplicar.
  IF v_saldo.acordo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.pix_automatico_acordos a
        WHERE a.id = v_saldo.acordo_id AND a.ajuste_valor IS NOT NULL) THEN
    UPDATE public.pix_automatico_saldos
       SET acordo_id = NULL, reservado_em = NULL, atualizado_em = NOW()
     WHERE id = v_saldo.id
    RETURNING * INTO v_saldo;
  END IF;

  IF v_saldo.acordo_id IS NOT NULL THEN
    RAISE EXCEPTION
      'PIX_SALDO_RESERVADO: este saldo ja esta aplicado em outro acordo aguardando pagamento.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_nome
    FROM public.perfis p WHERE p.id = v_autor;

  -- Desconto em partes: este NR leva até a comissão dele.
  v_parcela := public.fn_pix_saldo_parcela(v_saldo.valor, public.fn_pix_comissao_da_linha(v_acordo));
  IF v_parcela = 0 THEN
    RAISE EXCEPTION
      'PIX_SALDO_SEM_COMISSAO: o NR % nao tem comissao para descontar.', v_acordo.nr_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.pix_saldo_rpc', '1', true);
  UPDATE public.pix_automatico_acordos
     SET ajuste_valor    = v_parcela,
         ajuste_motivo   = v_saldo.motivo,
         ajuste_em       = NOW(),
         ajuste_por      = v_autor,
         ajuste_por_nome = v_nome
   WHERE id = v_acordo.id
  RETURNING * INTO v_acordo;
  PERFORM set_config('app.pix_saldo_rpc', '', true);

  -- A prova: a correção está no NR. Se algum gatilho a desfez, nada fica pela metade.
  IF v_acordo.ajuste_valor IS DISTINCT FROM v_parcela THEN
    RAISE EXCEPTION
      'PIX_SALDO_NAO_GRAVOU: a correcao nao ficou gravada no NR %. Nada foi alterado.', v_acordo.nr_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.pix_automatico_saldos
     SET acordo_id = v_acordo.id, reservado_em = NOW(), atualizado_em = NOW()
   WHERE id = v_saldo.id;

  PERFORM public.fn_pix_log(
    v_acordo.empresa_id, v_acordo.id, v_acordo.nr_cliente, 'saldo_aplicado',
    'Aplicou correcao de R$ ' || public.fn_pix_valor_br(v_parcela)
      || ' no NR ' || v_acordo.nr_cliente
      || CASE WHEN v_parcela <> v_saldo.valor
              THEN ' (de um saldo de R$ ' || public.fn_pix_valor_br(v_saldo.valor) || '; o resto vai para o proximo NR)'
              ELSE '' END
      || COALESCE(' — ' || v_saldo.motivo, ''),
    v_parcela, v_acordo.operador_id, v_acordo.operador_nome,
    NULL, jsonb_build_object('ajuste_valor', v_parcela, 'saldo', v_saldo.valor));

  RETURN v_acordo;
END;
$function$;

-- ── 4. Retirar: também solta a reserva órfã ────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_retirar(p_acordo_id UUID)
RETURNS public.pix_automatico_acordos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_acordo public.pix_automatico_acordos;
  v_valor  NUMERIC(12,2);
  v_soltos INT;
BEGIN
  SELECT * INTO v_acordo FROM public.pix_automatico_acordos WHERE id = p_acordo_id FOR UPDATE;

  IF v_acordo.id IS NULL THEN
    RAISE EXCEPTION 'PIX_SALDO_ACORDO: registro nao encontrado — recarregue a lista.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.fn_can_access_empresa(v_acordo.empresa_id) THEN
    RAISE EXCEPTION 'PIX_SALDO_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_pix_pode_ajustar_saldo() THEN
    RAISE EXCEPTION 'PIX_SALDO_SEM_PERMISSAO: voce nao pode retirar a correcao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_acordo.ajuste_valor IS NULL THEN
    -- Saldo preso aqui sem correção no NR (o defeito de antes): solta e pronto.
    UPDATE public.pix_automatico_saldos
       SET acordo_id = NULL, reservado_em = NULL, atualizado_em = NOW()
     WHERE acordo_id = p_acordo_id;
    GET DIAGNOSTICS v_soltos = ROW_COUNT;
    IF v_soltos = 0 THEN
      RAISE EXCEPTION 'PIX_SALDO_SEM_CORRECAO: este acordo nao carrega correcao.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN v_acordo;
  END IF;

  IF v_acordo.pago THEN
    RAISE EXCEPTION
      'PIX_SALDO_JA_PAGO: a comissao do NR % ja foi paga. Desfaca o pagamento para reabrir a correcao.',
      v_acordo.nr_cliente USING ERRCODE = 'check_violation';
  END IF;

  v_valor := v_acordo.ajuste_valor;

  PERFORM set_config('app.pix_saldo_rpc', '1', true);
  UPDATE public.pix_automatico_acordos
     SET ajuste_valor = NULL, ajuste_motivo = NULL,
         ajuste_em = NULL, ajuste_por = NULL, ajuste_por_nome = NULL
   WHERE id = v_acordo.id
  RETURNING * INTO v_acordo;
  PERFORM set_config('app.pix_saldo_rpc', '', true);

  IF v_acordo.ajuste_valor IS NOT NULL THEN
    RAISE EXCEPTION
      'PIX_SALDO_NAO_GRAVOU: a correcao nao saiu do NR %. Nada foi alterado.', v_acordo.nr_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.pix_automatico_saldos
     SET acordo_id = NULL, reservado_em = NULL, atualizado_em = NOW()
   WHERE acordo_id = p_acordo_id;

  PERFORM public.fn_pix_log(
    v_acordo.empresa_id, v_acordo.id, v_acordo.nr_cliente, 'saldo_retirado',
    'Retirou a correcao de R$ ' || public.fn_pix_valor_br(v_valor)
      || ' do NR ' || v_acordo.nr_cliente || ' — o saldo voltou a ficar livre',
    v_valor, v_acordo.operador_id, v_acordo.operador_nome,
    jsonb_build_object('ajuste_valor', v_valor), NULL);

  RETURN v_acordo;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_saldo_aplicar(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_pix_saldo_retirar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pix_saldo_aplicar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pix_saldo_retirar(UUID) TO authenticated;

-- ── 5. Reparo: soltar as reservas órfãs ────────────────────────────────────
-- Saldo reservado num NR que não carrega correção (ou que não existe mais).
-- O valor do saldo não muda; ele só volta a ficar livre para «Corrigir valor».

DO $reparo$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.empresa_id, s.operador_id, s.operador_nome, s.valor, s.acordo_id, a.nr_cliente
      FROM public.pix_automatico_saldos s
      LEFT JOIN public.pix_automatico_acordos a ON a.id = s.acordo_id
     WHERE s.acordo_id IS NOT NULL
       AND (a.id IS NULL OR a.ajuste_valor IS NULL)
     FOR UPDATE OF s
  LOOP
    UPDATE public.pix_automatico_saldos
       SET acordo_id = NULL, reservado_em = NULL, atualizado_em = NOW()
     WHERE id = r.id;
    PERFORM public.fn_pix_log(
      r.empresa_id, CASE WHEN r.nr_cliente IS NULL THEN NULL ELSE r.acordo_id END, COALESCE(r.nr_cliente, '—'), 'saldo_retirado',
      'Reparo 17/11: o saldo de R$ ' || public.fn_pix_valor_br(r.valor) || ' de ' || COALESCE(r.operador_nome, '—')
        || ' estava preso no NR ' || COALESCE(r.nr_cliente, '—') || ' sem a correcao gravada — voltou a ficar livre',
      r.valor, r.operador_id, r.operador_nome, NULL, NULL);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Reservas órfãs soltas: %', n;
END
$reparo$;

-- ── 6. O saldo entra sozinho no pagamento ──────────────────────────────────
-- Interna: sem checar permissão (quem chama já checou, ou é gatilho).

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_auto(p_empresa UUID, p_operador UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo   public.pix_automatico_saldos;
  v_acordo  public.pix_automatico_acordos;
  v_parcela NUMERIC(12,2);
BEGIN
  SELECT * INTO v_saldo
    FROM public.pix_automatico_saldos
   WHERE empresa_id = p_empresa AND operador_id = p_operador
     FOR UPDATE;
  IF v_saldo.id IS NULL OR v_saldo.acordo_id IS NOT NULL THEN
    RETURN NULL;   -- nada a aplicar, ou já está num NR
  END IF;

  -- O NR que vai ser pago: aprovado, não pago, sem correção. Os dos últimos
  -- 45 dias primeiro (um aprovado esquecido de meses atrás não é «o próximo
  -- pagamento»), e dentro deles o mais antigo. Desconto pula NR sem comissão.
  FOR v_acordo IN
    SELECT *
      FROM public.pix_automatico_acordos
     WHERE empresa_id = p_empresa AND operador_id = p_operador
       AND status = 'aprovado' AND NOT COALESCE(pago, FALSE) AND ajuste_valor IS NULL
     ORDER BY (criado_em >= NOW() - INTERVAL '45 days') DESC, criado_em, id
       FOR UPDATE SKIP LOCKED
  LOOP
    v_parcela := public.fn_pix_saldo_parcela(v_saldo.valor, public.fn_pix_comissao_da_linha(v_acordo));
    EXIT WHEN v_parcela <> 0;
  END LOOP;
  IF v_acordo.id IS NULL OR COALESCE(v_parcela, 0) = 0 THEN
    RETURN NULL;   -- espera o próximo NR aprovado
  END IF;

  PERFORM set_config('app.pix_saldo_rpc', '1', true);
  UPDATE public.pix_automatico_acordos
     SET ajuste_valor    = v_parcela,
         ajuste_motivo   = v_saldo.motivo,
         ajuste_em       = NOW(),
         ajuste_por      = v_saldo.criado_por,
         ajuste_por_nome = COALESCE(v_saldo.criado_por_nome, 'Automático')
   WHERE id = v_acordo.id
  RETURNING * INTO v_acordo;
  PERFORM set_config('app.pix_saldo_rpc', '', true);

  IF v_acordo.ajuste_valor IS DISTINCT FROM v_parcela THEN
    RAISE EXCEPTION
      'PIX_SALDO_NAO_GRAVOU: a correcao nao ficou gravada no NR %. Nada foi alterado.', v_acordo.nr_cliente
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.pix_automatico_saldos
     SET acordo_id = v_acordo.id, reservado_em = NOW(), atualizado_em = NOW()
   WHERE id = v_saldo.id;

  PERFORM public.fn_pix_log(
    v_acordo.empresa_id, v_acordo.id, v_acordo.nr_cliente, 'saldo_aplicado',
    'Correcao de R$ ' || public.fn_pix_valor_br(v_parcela)
      || ' entrou sozinha no NR ' || v_acordo.nr_cliente || ' (proximo pagamento de '
      || COALESCE(v_acordo.operador_nome, '—') || ')'
      || CASE WHEN v_parcela <> v_saldo.valor
              THEN ' — parte de um saldo de R$ ' || public.fn_pix_valor_br(v_saldo.valor) || '; o resto vai para o proximo NR'
              ELSE '' END
      || COALESCE(' — ' || v_saldo.motivo, ''),
    v_parcela, v_acordo.operador_id, v_acordo.operador_nome,
    NULL, jsonb_build_object('ajuste_valor', v_parcela, 'saldo', v_saldo.valor, 'automatico', true));

  RETURN v_acordo.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_saldo_auto(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── 7. Anotar: com o saldo já num NR, tira de lá, muda e aplica de novo ────

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_definir(
  p_empresa_id  UUID,
  p_operador_id UUID,
  p_valor       NUMERIC,
  p_motivo      TEXT DEFAULT NULL,
  p_somar       BOOLEAN DEFAULT FALSE
)
RETURNS public.pix_automatico_saldos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_atual   public.pix_automatico_saldos;
  v_antes   NUMERIC(12,2);
  v_novo    NUMERIC(12,2);
  v_nome    TEXT;
  v_setor   UUID;
  v_autor   UUID := auth.uid();
  v_autor_n TEXT;
  v_nr      TEXT;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'PIX_SALDO_EMPRESA: esta empresa nao e sua.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_pix_pode_ajustar_saldo() THEN
    RAISE EXCEPTION 'PIX_SALDO_SEM_PERMISSAO: voce nao pode anotar saldo de divergencia.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.nome, p.setor_id INTO v_nome, v_setor
    FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'PIX_SALDO_OPERADOR: operador nao encontrado nesta empresa.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguem') INTO v_autor_n
    FROM public.perfis p WHERE p.id = v_autor;

  SELECT * INTO v_atual
    FROM public.pix_automatico_saldos
   WHERE empresa_id = p_empresa_id AND operador_id = p_operador_id
     FOR UPDATE;

  -- Já está num NR esperando pagamento: a correção sai de lá (o NR ainda não
  -- foi pago — pago quita e apaga o saldo) e o saldo volta a ficar livre.
  IF v_atual.id IS NOT NULL AND v_atual.acordo_id IS NOT NULL THEN
    SELECT nr_cliente INTO v_nr FROM public.pix_automatico_acordos WHERE id = v_atual.acordo_id;
    PERFORM set_config('app.pix_saldo_rpc', '1', true);
    UPDATE public.pix_automatico_acordos
       SET ajuste_valor = NULL, ajuste_motivo = NULL, ajuste_em = NULL, ajuste_por = NULL, ajuste_por_nome = NULL
     WHERE id = v_atual.acordo_id AND NOT COALESCE(pago, FALSE);
    PERFORM set_config('app.pix_saldo_rpc', '', true);
    UPDATE public.pix_automatico_saldos
       SET acordo_id = NULL, reservado_em = NULL
     WHERE id = v_atual.id
    RETURNING * INTO v_atual;
    PERFORM public.fn_pix_log(
      p_empresa_id, NULL, COALESCE(v_nr, '—'), 'saldo_retirado',
      'A correcao saiu do NR ' || COALESCE(v_nr, '—') || ' para o saldo de ' || v_nome || ' ser alterado',
      v_atual.valor, p_operador_id, v_nome, NULL, NULL);
  END IF;

  v_antes := v_atual.valor;
  v_novo  := ROUND(
    CASE WHEN p_somar THEN COALESCE(v_antes, 0) + p_valor ELSE p_valor END, 2);

  IF v_novo = 0 THEN
    IF v_atual.id IS NOT NULL THEN
      DELETE FROM public.pix_automatico_saldos WHERE id = v_atual.id;
      PERFORM public.fn_pix_log(
        p_empresa_id, NULL, '—', 'saldo_removido',
        'Zerou o saldo de divergencia de ' || v_nome,
        v_antes, p_operador_id, v_nome,
        jsonb_build_object('valor', v_antes), NULL);
    END IF;
    RETURN NULL;
  END IF;

  IF v_atual.id IS NULL THEN
    INSERT INTO public.pix_automatico_saldos (
      empresa_id, operador_id, operador_nome, setor_id, valor, motivo,
      criado_por, criado_por_nome
    ) VALUES (
      p_empresa_id, p_operador_id, v_nome, v_setor, v_novo, NULLIF(TRIM(p_motivo), ''),
      v_autor, v_autor_n
    )
    RETURNING * INTO v_atual;
    PERFORM public.fn_pix_log(
      p_empresa_id, NULL, '—', 'saldo_anotado',
      'Anotou saldo de R$ ' || public.fn_pix_valor_br(v_novo) || ' para ' || v_nome
        || COALESCE(' — ' || NULLIF(TRIM(p_motivo), ''), ''),
      v_novo, p_operador_id, v_nome,
      NULL, jsonb_build_object('valor', v_novo, 'motivo', p_motivo));
  ELSE
    UPDATE public.pix_automatico_saldos
       SET valor         = v_novo,
           motivo        = COALESCE(NULLIF(TRIM(p_motivo), ''), motivo),
           operador_nome = v_nome,
           setor_id      = COALESCE(v_setor, setor_id),
           atualizado_em = NOW()
     WHERE id = v_atual.id
    RETURNING * INTO v_atual;
    PERFORM public.fn_pix_log(
      p_empresa_id, NULL, '—', 'saldo_alterado',
      'Alterou o saldo de ' || v_nome
        || ': R$ ' || public.fn_pix_valor_br(v_antes)
        || ' → R$ ' || public.fn_pix_valor_br(v_novo),
      v_novo, p_operador_id, v_nome,
      jsonb_build_object('valor', v_antes), jsonb_build_object('valor', v_novo));
  END IF;

  -- E entra sozinho no próximo pagamento da pessoa.
  PERFORM public.fn_pix_saldo_auto(p_empresa_id, p_operador_id);
  SELECT * INTO v_atual FROM public.pix_automatico_saldos WHERE id = v_atual.id;
  RETURN v_atual;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pix_saldo_definir(UUID, UUID, NUMERIC, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pix_saldo_definir(UUID, UUID, NUMERIC, TEXT, BOOLEAN) TO authenticated;

-- ── 6b. Os gatilhos: NR aprovado recebe o saldo; NR que sai de aprovado solta ─

-- BEFORE: o NR com correção que sai de «aprovado» sem ter sido pago (voltou a
-- pendente, foi desaprovado) larga a correção, e o saldo volta a ficar livre.
-- Roda depois de `trg_pix_auto_congela_operador` (ordem alfabética), então só
-- age quando a mudança de status valeu.
CREATE OR REPLACE FUNCTION public.fn_pix_saldo_sai_do_aprovado()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'aprovado' AND NEW.status IS DISTINCT FROM 'aprovado'
     AND NEW.ajuste_valor IS NOT NULL AND NOT COALESCE(NEW.pago, FALSE) THEN
    UPDATE public.pix_automatico_saldos
       SET acordo_id = NULL, reservado_em = NULL, atualizado_em = NOW()
     WHERE acordo_id = NEW.id;
    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente, 'saldo_retirado',
      'O NR ' || NEW.nr_cliente || ' saiu de aprovado: a correcao de R$ '
        || public.fn_pix_valor_br(NEW.ajuste_valor) || ' voltou para o saldo',
      NEW.ajuste_valor, NEW.operador_id, NEW.operador_nome, NULL, NULL);
    NEW.ajuste_valor := NULL; NEW.ajuste_motivo := NULL; NEW.ajuste_em := NULL;
    NEW.ajuste_por := NULL; NEW.ajuste_por_nome := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_saldo_sai_do_aprovado ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_saldo_sai_do_aprovado
BEFORE UPDATE OF status ON public.pix_automatico_acordos
FOR EACH ROW EXECUTE FUNCTION public.fn_pix_saldo_sai_do_aprovado();

-- AFTER: virou aprovado (ou um aprovado com correção saiu) → o saldo livre da
-- pessoa procura o NR do próximo pagamento.
CREATE OR REPLACE FUNCTION public.fn_pix_saldo_procura_nr()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.ajuste_valor IS NOT NULL AND NOT COALESCE(OLD.pago, FALSE) THEN
      PERFORM public.fn_pix_saldo_auto(OLD.empresa_id, OLD.operador_id);
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status = 'aprovado' OR OLD.status = 'aprovado') THEN
    PERFORM public.fn_pix_saldo_auto(NEW.empresa_id, NEW.operador_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_saldo_procura_nr ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_saldo_procura_nr
AFTER UPDATE OF status ON public.pix_automatico_acordos
FOR EACH ROW EXECUTE FUNCTION public.fn_pix_saldo_procura_nr();

DROP TRIGGER IF EXISTS trg_pix_saldo_procura_nr_delete ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_saldo_procura_nr_delete
AFTER DELETE ON public.pix_automatico_acordos
FOR EACH ROW EXECUTE FUNCTION public.fn_pix_saldo_procura_nr();

REVOKE ALL ON FUNCTION public.fn_pix_saldo_sai_do_aprovado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_pix_saldo_procura_nr() FROM PUBLIC, anon, authenticated;

-- ── 9b. Pagar quita a PARTE; o resto procura o próximo NR ─────────────────
-- Substitui a de 20260823080000, que apagava o saldo inteiro ao pagar (o NR
-- levava o saldo inteiro). Agora o NR leva uma parte, e o pagamento quita só ela.

CREATE OR REPLACE FUNCTION public.fn_pix_saldo_no_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_saldo  public.pix_automatico_saldos;
  v_resto  NUMERIC(12,2);
  v_total  NUMERIC(12,2);
BEGIN
  IF NEW.ajuste_valor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pagou: a parte deste NR aconteceu.
  IF NEW.pago AND NOT COALESCE(OLD.pago, FALSE) THEN
    SELECT * INTO v_saldo FROM public.pix_automatico_saldos WHERE acordo_id = NEW.id FOR UPDATE;
    IF v_saldo.id IS NOT NULL THEN
      v_resto := ROUND(v_saldo.valor - NEW.ajuste_valor, 2);
      IF v_resto = 0 THEN
        DELETE FROM public.pix_automatico_saldos WHERE id = v_saldo.id;
      ELSE
        UPDATE public.pix_automatico_saldos
           SET valor = v_resto, acordo_id = NULL, reservado_em = NULL, atualizado_em = NOW()
         WHERE id = v_saldo.id;
      END IF;
    END IF;

    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente, 'saldo_quitado',
      'Quitou R$ ' || public.fn_pix_valor_br(NEW.ajuste_valor)
        || ' do saldo no pagamento do NR ' || NEW.nr_cliente
        || CASE WHEN COALESCE(v_resto, 0) <> 0
                THEN ' — faltam R$ ' || public.fn_pix_valor_br(v_resto) || ', que vao para o proximo NR'
                ELSE '' END,
      NEW.ajuste_valor, NEW.operador_id, NEW.operador_nome,
      jsonb_build_object('ajuste_valor', NEW.ajuste_valor), jsonb_build_object('resto', v_resto));

    -- O resto procura o próximo NR aprovado da pessoa.
    IF COALESCE(v_resto, 0) <> 0 THEN
      PERFORM public.fn_pix_saldo_auto(NEW.empresa_id, NEW.operador_id);
    END IF;

  -- Desfez o pagamento: a parte deste NR volta para o saldo, reservada AQUI.
  ELSIF NOT NEW.pago AND COALESCE(OLD.pago, FALSE) THEN
    SELECT * INTO v_saldo
      FROM public.pix_automatico_saldos
     WHERE empresa_id = NEW.empresa_id AND operador_id = NEW.operador_id
       FOR UPDATE;

    IF v_saldo.id IS NULL THEN
      INSERT INTO public.pix_automatico_saldos (
        empresa_id, operador_id, operador_nome, setor_id, valor, motivo,
        acordo_id, reservado_em, criado_por, criado_por_nome
      ) VALUES (
        NEW.empresa_id, NEW.operador_id, NEW.operador_nome, NEW.setor_id,
        NEW.ajuste_valor, NEW.ajuste_motivo, NEW.id, NOW(),
        NEW.ajuste_por, NEW.ajuste_por_nome
      );
    ELSE
      -- O resto estava noutro NR ainda não pago: sai de lá, porque a reserva
      -- volta para este (um saldo, um NR por vez).
      IF v_saldo.acordo_id IS NOT NULL AND v_saldo.acordo_id <> NEW.id THEN
        PERFORM set_config('app.pix_saldo_rpc', '1', true);
        UPDATE public.pix_automatico_acordos
           SET ajuste_valor = NULL, ajuste_motivo = NULL, ajuste_em = NULL, ajuste_por = NULL, ajuste_por_nome = NULL
         WHERE id = v_saldo.acordo_id AND NOT COALESCE(pago, FALSE);
        PERFORM set_config('app.pix_saldo_rpc', '', true);
      END IF;
      v_total := ROUND(v_saldo.valor + NEW.ajuste_valor, 2);
      IF v_total = 0 THEN
        DELETE FROM public.pix_automatico_saldos WHERE id = v_saldo.id;
      ELSE
        UPDATE public.pix_automatico_saldos
           SET valor = v_total, acordo_id = NEW.id, reservado_em = NOW(), atualizado_em = NOW()
         WHERE id = v_saldo.id;
      END IF;
    END IF;

    PERFORM public.fn_pix_log(
      NEW.empresa_id, NEW.id, NEW.nr_cliente, 'saldo_devolvido',
      'Desfez o pagamento do NR ' || NEW.nr_cliente
        || ' — a correcao de R$ ' || public.fn_pix_valor_br(NEW.ajuste_valor)
        || ' voltou a ficar pendente',
      NEW.ajuste_valor, NEW.operador_id, NEW.operador_nome,
      NULL, jsonb_build_object('ajuste_valor', NEW.ajuste_valor));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pix_saldo_no_pagamento ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_saldo_no_pagamento
AFTER UPDATE OF pago ON public.pix_automatico_acordos
FOR EACH ROW EXECUTE FUNCTION public.fn_pix_saldo_no_pagamento();

-- ── 8. Os saldos livres de hoje entram no NR da pessoa ─────────────────────

DO $agora$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN SELECT empresa_id, operador_id FROM public.pix_automatico_saldos WHERE acordo_id IS NULL LOOP
    IF public.fn_pix_saldo_auto(r.empresa_id, r.operador_id) IS NOT NULL THEN n := n + 1; END IF;
  END LOOP;
  RAISE NOTICE 'Saldos que entraram num NR agora: %', n;
END
$agora$;

COMMIT;
