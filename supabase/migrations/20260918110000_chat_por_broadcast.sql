-- ═══════════════════════════════════════════════════════════════════════════
-- Chat: o aviso de tempo real vai por Broadcast, para quem participa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que acontecia
--
-- `useChat` assina `chat_mensagens` e `chat_participantes` por Postgres Changes
-- SEM filtro — a tabela de participantes não tem coluna que diga «é meu», e o
-- chat atravessa empresas. Medido em 18/09/2026: 166 assinaturas em cada uma.
--
-- Para cada linha que muda, o Realtime avalia a RLS de CADA assinante dentro
-- do banco (`realtime.list_changes` → `apply_rls`). Em 3 dias foram 14 mil
-- UPDATEs em `chat_participantes` (leitura, entrega) e 2 mil em
-- `chat_mensagens`: ~2,7 milhões de avaliações de RLS para entregar eventos a,
-- em média, 2,1 pessoas por conversa. O leitor do WAL somou 13.972 s de banco
-- no período — o segundo maior consumo depois do dashboard.
--
-- ## O que passa a acontecer
--
-- Gatilhos por LINHA mandam um Broadcast privado para o tópico pessoal de cada
-- participante da conversa:
--
--   tópico `chat:<perfil_id>`
--   evento `mensagem`     { operacao, id, conversa_id, autor_id,
--                           curtida_por, curtida_em, curtida_em_antes }
--   evento `participante` { operacao, conversa_id, perfil_id }
--
-- Só ids e carimbos. O TEXTO não viaja: `realtime.send` grava o payload em
-- `realtime.messages`, e o texto de uma mensagem com CPF ficaria lá depois do
-- expurgo. O cliente busca a mensagem pelo id, pela RLS de sempre.
--
-- A policy deixa cada pessoa ouvir só o próprio tópico: a checagem é
-- `topic = 'chat:' || auth.uid()`, feita uma vez na entrada do canal.
--
-- ## O que NÃO muda
--
-- - A publicação `supabase_realtime`. O cliente antigo (aba sem recarregar)
--   continua recebendo por Postgres Changes; o novo não assina mais. As
--   assinaturas somem com as abas antigas, sem janela sem aviso.
-- - O painel de monitoria (`PainelMonitor`) continua em Postgres Changes: só
--   existe com o painel aberto, e quem monitora não é participante.
--
-- Reexecutável.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mensagem nova ou alterada → quem participa
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_chat_sinal_mensagem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload jsonb;
  v_perfil  uuid;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'operacao',         tg_op,
    'id',               new.id,
    'conversa_id',      new.conversa_id,
    'autor_id',         new.autor_id,
    'curtida_por',      new.curtida_por,
    'curtida_em',       new.curtida_em,
    'curtida_em_antes', case when tg_op = 'UPDATE' then old.curtida_em end);

  -- Aviso é conveniência: falhar aqui não pode derrubar o envio da mensagem.
  begin
    for v_perfil in
      select cp.perfil_id
        from public.chat_participantes cp
       where cp.conversa_id = new.conversa_id
         and (cp.saiu_em is null or cp.saiu_em >= new.criado_em)
    loop
      perform realtime.send(v_payload, 'mensagem', 'chat:' || v_perfil::text, true);
    end loop;
  exception when others then
    raise warning 'fn_chat_sinal_mensagem: %', sqlerrm;
  end;

  return null;
end;
$function$;

comment on function public.fn_chat_sinal_mensagem() is
  'Broadcast «mensagem» no topico chat:<perfil_id> de cada participante. So ids — '
  'o texto e lido pela RLS. Ver 20260918110000.';

revoke all on function public.fn_chat_sinal_mensagem() from public, anon, authenticated;

drop trigger if exists trg_chat_sinal_mensagem on public.chat_mensagens;
create trigger trg_chat_sinal_mensagem
  after insert or update on public.chat_mensagens
  for each row execute function public.fn_chat_sinal_mensagem();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Participante mudou (leitura, entrega, entrou, saiu) → quem participa
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_chat_sinal_participante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_conversa uuid;
  v_quem     uuid;
  v_payload  jsonb;
  v_perfil   uuid;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_conversa := old.conversa_id;
    v_quem     := old.perfil_id;
  else
    v_conversa := new.conversa_id;
    v_quem     := new.perfil_id;
  end if;

  v_payload := jsonb_build_object(
    'operacao',    tg_op,
    'conversa_id', v_conversa,
    'perfil_id',   v_quem);

  begin
    for v_perfil in
      select cp.perfil_id
        from public.chat_participantes cp
       where cp.conversa_id = v_conversa
      union
      -- Quem foi tirado já não está na tabela, e é quem mais precisa saber.
      select v_quem
    loop
      perform realtime.send(v_payload, 'participante', 'chat:' || v_perfil::text, true);
    end loop;
  exception when others then
    raise warning 'fn_chat_sinal_participante: %', sqlerrm;
  end;

  return null;
end;
$function$;

comment on function public.fn_chat_sinal_participante() is
  'Broadcast «participante» no topico chat:<perfil_id> de cada participante da conversa. '
  'Ver 20260918110000.';

revoke all on function public.fn_chat_sinal_participante() from public, anon, authenticated;

drop trigger if exists trg_chat_sinal_participante on public.chat_participantes;
create trigger trg_chat_sinal_participante
  after insert or update or delete on public.chat_participantes
  for each row execute function public.fn_chat_sinal_participante();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cada pessoa ouve só o próprio tópico
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists chat_sinal_receber on realtime.messages;
create policy chat_sinal_receber on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) = 'chat:' || (select auth.uid())::text
  );

commit;
