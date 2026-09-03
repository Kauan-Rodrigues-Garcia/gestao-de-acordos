-- ═══════════════════════════════════════════════════════════════════════════
-- Excluir usuário: ninguém avisa quem acabou de ser apagado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sintoma: excluir um usuário parava com
--
--   A exclusão parou numa tabela que ainda aponta para este usuário:
--   notificacoes (chave notificacoes_usuario_id_fkey). Detalhe do banco:
--   Key (usuario_id)=(…) is not present in table "perfis"
--
-- A rede de segurança de `20260903300000` fez o trabalho dela — nomeou a
-- tabela —, mas o diagnóstico que ela sugere está errado, e vale registrar por
-- quê: `notificacoes_usuario_id_fkey` JÁ É `ON DELETE CASCADE`. Não falta
-- soltar referência nenhuma.
--
-- ## O que acontece de verdade
--
-- Repare no detalhe do erro: «is not present in table perfis». Essa é a
-- mensagem de quem INSERE uma linha inválida, não a de quem apaga uma linha
-- ainda referenciada (que seria «is still referenced from table»). Alguém
-- estava CRIANDO uma notificação no meio da exclusão.
--
-- E a ordem do PostgreSQL explica quem: a cascata é executada DEPOIS que a
-- linha pai sai. Então, ao apagar o perfil:
--
--   1. `perfis` perde a linha;
--   2. a cascata começa a apagar os filhos — entre eles
--      `pix_automatico_acordos.operador_id` e
--      `solicitacoes_whatsapp.solicitante_id`;
--   3. o gatilho BEFORE DELETE dessas duas tabelas avisa quem era dono do
--      registro… que é exatamente o perfil apagado no passo 1.
--
-- A notificação é gravada para um usuário que não existe mais, e a chave
-- estrangeira recusa — corretamente.
--
-- ## A correção
--
-- Nos dois gatilhos: só notifica quem AINDA EXISTE. Não é remendo defensivo —
-- é a regra de negócio escrita por extenso. Avisar uma pessoa excluída não
-- falharia «só» por causa da chave estrangeira: a notificação seria apagada
-- pela própria cascata no instante seguinte, sem ninguém para ler.
--
-- O caso normal não muda em nada: apagar um Pix ou uma solicitação continua
-- avisando o operador, o solicitante e o responsável, que estão todos vivos.
--
-- ## E a segunda parede
--
-- `trg_pix_a_impede_pago` recusa apagar registro de Pix já pago. Numa exclusão
-- de usuário isso aparecia lá no fundo da cascata, como
-- «PIX_PAGO_NAO_EXCLUI: o NR X já teve a comissão paga» — uma frase certa que
-- chega na hora errada, sem dizer que o assunto era outro. Vira verificação
-- de entrada em `fn_admin_delete_user`, ao lado da de `rh_lancamentos` e pelo
-- mesmo motivo: comissão paga é dinheiro que saiu, e não some por tabela de
-- exclusão de usuário.

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Pix: o aviso de exclusão pula quem já não existe
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_pix_registrar_exclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quem UUID := auth.uid();
  v_nome TEXT;
  v_foto TEXT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém'), p.foto_url
    INTO v_nome, v_foto
    FROM public.perfis p
   WHERE p.id = v_quem;

  PERFORM public.fn_pix_log(
    OLD.empresa_id, OLD.id, OLD.nr_cliente, 'excluido',
    'Excluiu o NR ' || OLD.nr_cliente
      || ' (R$ ' || public.fn_pix_valor_br(OLD.valor) || ', ' || OLD.status || ')',
    OLD.valor, OLD.operador_id, OLD.operador_nome,
    to_jsonb(OLD), NULL
  );

  -- Ninguém precisa ser avisado do próprio clique.
  --
  -- E ninguém precisa ser avisado da própria exclusão: quando o registro cai
  -- pela cascata de `perfis`, o operador JÁ FOI APAGADO — a linha pai sai
  -- antes de a cascata começar. Sem o EXISTS, a notificação apontaria para um
  -- perfil inexistente, a chave estrangeira recusaria, e a exclusão do usuário
  -- inteira parava aqui.
  IF OLD.operador_id IS NOT NULL
     AND (v_quem IS NULL OR OLD.operador_id <> v_quem)
     AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = OLD.operador_id) THEN
    INSERT INTO public.notificacoes
      (usuario_id, empresa_id, titulo, mensagem, lida, rota,
       autor_id, autor_nome, autor_foto)
    VALUES (
      OLD.operador_id,
      OLD.empresa_id,
      'Pix automático — registro excluído',
      COALESCE(v_nome, 'Alguém') || ' excluiu o seu registro do NR '
        || OLD.nr_cliente || ' (R$ ' || public.fn_pix_valor_br(OLD.valor)
        || ', ' || OLD.status || ').',
      false,
      '/acordos?tab=pix',
      v_quem,
      v_nome,
      v_foto
    );
  END IF;

  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.fn_pix_registrar_exclusao() IS
  'Registra a exclusao de um Pix no log e avisa o operador. Nao avisa quem '
  'clicou nem quem ja nao existe — o segundo caso e a exclusao de usuario, em '
  'que o registro cai por cascata depois de o perfil sair.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Solicitações de WhatsApp: mesma armadilha, mesma correção
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Aqui são dois destinatários possíveis, e o solicitante é justamente quem a
-- cascata (`solicitacoes_whatsapp.solicitante_id`) acabou de levar. O
-- responsável, esse continua existindo e continua sendo avisado.

CREATE OR REPLACE FUNCTION public.fn_wpp_notificar_exclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente TEXT;
  v_autor   TEXT;
  v_foto    TEXT;
  v_quem    UUID := auth.uid();
BEGIN
  v_cliente := COALESCE(NULLIF(TRIM(OLD.nome_cliente), ''), OLD.codigo_cliente, 'o cliente');

  SELECT COALESCE(NULLIF(TRIM(p.nome), ''), 'Alguém'), p.foto_url
    INTO v_autor, v_foto
    FROM public.perfis p
   WHERE p.id = v_quem;

  -- Solicitante e responsável, menos quem clicou. O DISTINCT cobre o caso de os
  -- dois serem a mesma pessoa (abriu e assumiu o próprio pedido).
  INSERT INTO public.notificacoes
    (usuario_id, empresa_id, titulo, mensagem, lida, rota,
     autor_id, autor_nome, autor_foto)
  SELECT DISTINCT
         destinatario,
         OLD.empresa_id,
         'Solicitação excluída — ' || v_cliente,
         COALESCE(SPLIT_PART(v_autor, ' ', 1), 'Alguém')
           || CASE WHEN destinatario = OLD.responsavel_id
                   THEN ' excluiu o pedido de ' || v_cliente
                        || ' (' || OLD.codigo_cliente || '), que estava com você.'
                   ELSE ' excluiu o seu pedido de ' || v_cliente
                        || ' (' || OLD.codigo_cliente || ').'
              END,
         false,
         '/solicitacoes-whatsapp',
         v_quem,
         v_autor,
         v_foto
    FROM (
      SELECT OLD.responsavel_id AS destinatario
      UNION
      SELECT OLD.solicitante_id
    ) AS envolvidos
   WHERE destinatario IS NOT NULL
     AND (v_quem IS NULL OR destinatario <> v_quem)
     -- Ver o comentário em `fn_pix_registrar_exclusao`: na exclusão de usuário
     -- o solicitante já saiu quando a cascata chega aqui.
     AND EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = destinatario);

  RETURN OLD;
END;
$function$;

COMMENT ON FUNCTION public.fn_wpp_notificar_exclusao() IS
  'Avisa solicitante e responsavel que o pedido foi excluido. Nao avisa quem '
  'clicou nem quem ja nao existe — o segundo caso e a exclusao de usuario, em '
  'que o pedido cai por cascata depois de o perfil sair.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Comissão paga barra a exclusão na ENTRADA, com a frase certa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Idêntica em forma à verificação de `rh_lancamentos` logo acima dela, e
-- idêntica em motivo: é dinheiro que já saiu. A diferença é só onde a mensagem
-- aparece — antes de qualquer escrita, em vez de no meio da cascata.

CREATE OR REPLACE FUNCTION public.fn_admin_delete_user(
  p_user_id uuid,
  p_apagar_acordos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_target_empresa UUID;
  v_apagados       INT := 0;
  v_rh             INT := 0;
  v_pix_pago       INT := 0;
  v_constraint     TEXT;
  v_tabela         TEXT;
  v_detalhe        TEXT;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuários' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a si mesmo';
  END IF;

  SELECT empresa_id INTO v_target_empresa
  FROM public.perfis WHERE id = p_user_id;

  IF NOT public.fn_can_access_empresa(v_target_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuário de outra empresa' USING ERRCODE = '42501';
  END IF;

  -- Dinheiro lançado não sai por tabela de exclusão de usuário. Barra ANTES de
  -- apagar qualquer coisa, para não deixar meio serviço feito.
  SELECT count(*) INTO v_rh
  FROM public.rh_lancamentos WHERE operador_id = p_user_id;

  IF v_rh > 0 THEN
    RAISE EXCEPTION
      'Este usuário tem % lançamento(s) de RH no nome dele. Lançamento é registro financeiro e não sai junto com a exclusão: remova ou transfira os lançamentos na aba RH e exclua o usuário depois.',
      v_rh
      USING ERRCODE = '23503';
  END IF;

  -- Comissão de Pix já paga, pelo mesmo motivo. Sem esta verificação o
  -- `trg_pix_a_impede_pago` recusaria lá no fundo da cascata, com uma frase
  -- sobre um NR — correta, mas que não diz que o assunto era excluir alguém.
  SELECT count(*) INTO v_pix_pago
  FROM public.pix_automatico_acordos
  WHERE operador_id = p_user_id AND pago;

  IF v_pix_pago > 0 THEN
    RAISE EXCEPTION
      'Este usuário tem % registro(s) de Pix com a comissão já paga. Comissão paga é dinheiro que saiu e não some junto com a exclusão: desfaça o pagamento na aba Pix Automático e exclua o usuário depois.',
      v_pix_pago
      USING ERRCODE = '23503';
  END IF;

  IF p_apagar_acordos THEN
    v_apagados := public.fn_admin_apagar_acordos_do_usuario(p_user_id, NULL);
  END IF;

  -- Rastro em registro de terceiro: a referência sai, o registro fica.
  UPDATE public.autorizacoes_pedidos
     SET decidido_por_id = NULL
   WHERE decidido_por_id = p_user_id;

  UPDATE public.autorizacoes_pedidos
     SET extra_atual_op_id = NULL
   WHERE extra_atual_op_id = p_user_id;

  UPDATE public.perfis_permissoes
     SET atualizado_por = NULL
   WHERE atualizado_por = p_user_id;

  -- O que era da pessoa vai com ela, como já acontece com as tabulações.
  DELETE FROM public.autorizacoes_pedidos WHERE dono_id = p_user_id;

  -- Cascata de perfis.id -> auth.users(id) remove o perfil junto.
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS
      v_constraint = CONSTRAINT_NAME,
      v_tabela     = TABLE_NAME,
      v_detalhe    = PG_EXCEPTION_DETAIL;
    RAISE EXCEPTION
      'A exclusão parou numa tabela que ainda aponta para este usuário: % (chave %). Detalhe do banco: %. Avise o suporte com esta frase — falta ensinar fn_admin_delete_user a soltar essa referência.',
      coalesce(nullif(v_tabela, ''),     'tabela não identificada'),
      coalesce(nullif(v_constraint, ''), 'não identificada'),
      coalesce(nullif(v_detalhe, ''),    'sem detalhe')
      USING ERRCODE = '23503';
  END;

  RETURN jsonb_build_object('ok', TRUE, 'acordos_apagados', v_apagados);
END;
$function$;

COMMENT ON FUNCTION public.fn_admin_delete_user(uuid, boolean) IS
  'Exclui o usuário. Com p_apagar_acordos, apaga antes as tabulações dele (libera os NRs) — a tela baixa o relatório ANTES de chamar. Solta as referências de rastro (autorizacoes_pedidos, perfis_permissoes) e apaga os pedidos de que ele era dono. Barra, com frase própria, se houver rh_lancamentos ou Pix com comissão paga. Não toca em analitico_recebimentos nem diario_recebimentos.';

COMMIT;
