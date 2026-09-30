-- ============================================================================
-- Chat: o aviso de participante vai só para quem precisa — 30/09/2026
-- ============================================================================
--
-- ## O que estava acontecendo
--
-- Log do Realtime, 24 h: 7.619 `UnableToBroadcastChanges: too_many_requests`,
-- em rajadas (8.524 mensagens em `realtime.messages` num único minuto), quase
-- todas `chat:<perfil>` / `participante`. Nos mesmos minutos, os
-- `IncreaseConnectionPool` do Realtime.
--
-- `trg_chat_sinal_participante` rodava POR LINHA em qualquer UPDATE de
-- `chat_participantes` e mandava um `realtime.send` para TODOS os participantes
-- da conversa (inclusive quem já saiu). E essa tabela é atualizada o tempo todo:
--
--   * `fn_chat_apos_mensagem`: cada mensagem atualiza `ultima_atividade_em` de
--     TODOS os participantes (N linhas);
--   * cada cliente que recebe a mensagem grava `ultima_entrega_em` (N linhas);
--   * cada leitura grava `ultima_leitura_em`.
--
-- Cada uma dessas N linhas avisava os N: N² mensagens por mensagem de grupo, duas
-- ou três vezes. Grupo de 24 → mais de 1.100 mensagens de Realtime por mensagem.
--
-- ## A regra nova — cada mudança avisa quem ela interessa
--
--   entrada/saída/admin (INSERT, DELETE, saiu_em, entrou_em, admin)
--       → os participantes ATIVOS + a própria pessoa (quem saiu precisa saber);
--   apagada_em / oculta_em / fixada_em
--       → só a própria pessoa (é a lista DELA);
--   ultima_entrega_em / ultima_leitura_em
--       → só o autor da ÚLTIMA mensagem da conversa, se não for a própria pessoa.
--         É o único que vê os checks mudarem: na conversa direta, «o outro»; no
--         grupo, o check é «entregue/lido por todos» (min dos outros em
--         `fn_chat_minhas_conversas`) e aparece nas mensagens de quem escreveu;
--   ultima_atividade_em sozinha
--       → ninguém. A mensagem nova já avisa todos por `trg_chat_sinal_mensagem`.
--
-- Custo por mensagem de grupo: de ~2·N² para ~2·N.
--
-- O cliente (`useChat`) trata todo `participante` do mesmo jeito — refaz a lista
-- com espera — então nada muda do lado dele.
--
-- Só a função. Nenhuma linha de dados muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_chat_sinal_participante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_conversa  uuid;
  v_quem      uuid;
  v_payload   jsonb;
  v_perfil    uuid;
  v_grupo     boolean := false;  -- entrada/saída/admin: avisa os ativos
  v_proprio   boolean := false;  -- mudança da lista da própria pessoa
  v_recibo    boolean := false;  -- entrega/leitura: avisa o autor da última
  v_autor     uuid;
begin
  if tg_op = 'DELETE' then
    v_conversa := old.conversa_id;
    v_quem     := old.perfil_id;
    v_grupo    := true;
  elsif tg_op = 'INSERT' then
    v_conversa := new.conversa_id;
    v_quem     := new.perfil_id;
    v_grupo    := true;
  else
    v_conversa := new.conversa_id;
    v_quem     := new.perfil_id;
    v_grupo   := new.saiu_em  is distinct from old.saiu_em
              or new.entrou_em is distinct from old.entrou_em
              or new.admin     is distinct from old.admin;
    v_proprio := new.apagada_em is distinct from old.apagada_em
              or new.oculta_em  is distinct from old.oculta_em
              or new.fixada_em  is distinct from old.fixada_em;
    v_recibo  := new.ultima_entrega_em is distinct from old.ultima_entrega_em
              or new.ultima_leitura_em is distinct from old.ultima_leitura_em;
    -- Só `ultima_atividade_em` (ou nada) mudou: ninguém precisa saber.
    if not (v_grupo or v_proprio or v_recibo) then
      return null;
    end if;
  end if;

  v_payload := jsonb_build_object(
    'operacao',    tg_op,
    'conversa_id', v_conversa,
    'perfil_id',   v_quem);

  -- Aviso é conveniência: falhar aqui não pode derrubar a escrita.
  begin
    if v_grupo then
      for v_perfil in
        select cp.perfil_id
          from public.chat_participantes cp
         where cp.conversa_id = v_conversa
           and cp.saiu_em is null
        union
        -- Quem foi tirado (ou saiu) já não está entre os ativos, e é quem mais
        -- precisa saber.
        select v_quem
      loop
        perform realtime.send(v_payload, 'participante', 'chat:' || v_perfil::text, true);
      end loop;
      return null;
    end if;

    if v_proprio then
      perform realtime.send(v_payload, 'participante', 'chat:' || v_quem::text, true);
    end if;

    if v_recibo then
      select m.autor_id into v_autor
        from public.chat_mensagens m
       where m.conversa_id = v_conversa
       order by m.criado_em desc
       limit 1;
      if v_autor is not null and v_autor is distinct from v_quem then
        perform realtime.send(v_payload, 'participante', 'chat:' || v_autor::text, true);
      end if;
    end if;
  exception when others then
    raise warning 'fn_chat_sinal_participante: %', sqlerrm;
  end;

  return null;
end;
$function$;

COMMENT ON FUNCTION public.fn_chat_sinal_participante() IS
  'Aviso Realtime de chat_participantes, so para quem precisa: entrada/saida/'
  'admin avisa os ativos + a pessoa; apagada/oculta/fixada so a pessoa; entrega/'
  'leitura so o autor da ultima mensagem; ultima_atividade_em sozinha nao avisa. '
  'Antes avisava todos em qualquer UPDATE: N^2 por mensagem de grupo e as rajadas '
  'de UnableToBroadcastChanges (20260930145539).';

COMMIT;
