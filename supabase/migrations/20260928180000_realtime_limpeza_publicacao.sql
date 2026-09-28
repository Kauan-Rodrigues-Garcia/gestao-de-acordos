-- ============================================================================
-- Realtime: a publicação fica só com quem é ouvido linha a linha (28/09/2026)
-- ============================================================================
--
-- ## O que foi medido
--
-- `pg_stat_statements` desde o último restart (18/09 → 28/09/2026): o leitor
-- do Postgres Changes (`realtime.list_changes`) é a consulta que MAIS consome
-- o banco — 16.187 s, 22,5% de todo o tempo de execução, 1,04 milhão de
-- chamadas.
--
-- Toda mudança numa tabela da publicação `supabase_realtime` passa por ele e
-- pelo `apply_rls`, COM OU SEM alguém ouvindo. As mudanças no mesmo período:
--
--   chat_participantes    25.283   0 assinaturas agora
--   diario_recebimentos   23.524   0
--   logs_sistema          11.211   0
--   acordos                5.560   328
--   nr_registros           4.128   3
--   chat_mensagens         2.272   0
--   (as outras 24 tabelas somam menos de 1.000)
--
-- As três primeiras e `chat_mensagens` são 85% de tudo o que o leitor processa,
-- e nenhuma aba precisa da LINHA delas:
--
--   chat_mensagens, chat_participantes — o chat vai por Broadcast desde a
--     20260918110000; ficaram na publicação só para as abas antigas, que já
--     recarregaram. O último ouvinte era o painel de monitoria, que passa a
--     ouvir o tópico da pessoa acompanhada (item 3 abaixo).
--   diario_recebimentos — a tela só relê. Passa a ouvir um SINAL por comando,
--     no mesmo molde do analítico (20260917110000): `diario:<empresa>`.
--   logs_sistema — só a tela de Logs ouvia. Ela passa a perguntar ao banco a
--     cada 15 s, só com a tela aberta e visível.
--
-- ## Ordem de aplicação
--
-- Depois do deploy do front de 28/09/2026. Antes dele, as abas continuam
-- relendo ao voltar para a tela; só o aviso ao vivo do diário, dos logs e do
-- monitor espera o recarregamento. Nada se perde.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ============================================================================
-- 1. Recebimento diário: sinal por comando
-- ============================================================================
--
-- `fn_realtime_sinal_mudou` é a da 20260917110000: um Broadcast «mudou» por
-- empresa, com `importado_por` tirado de `importado_por_id` — que o diário tem.
-- Três gatilhos porque o Postgres não aceita tabela de transição em gatilho de
-- mais de um evento.

do $gatilhos$
begin
  if to_regclass('public.diario_recebimentos') is null then
    raise notice 'sinal: diario_recebimentos nao existe, pulada';
    return;
  end if;

  drop trigger if exists trg_realtime_sinal_ins on public.diario_recebimentos;
  drop trigger if exists trg_realtime_sinal_upd on public.diario_recebimentos;
  drop trigger if exists trg_realtime_sinal_del on public.diario_recebimentos;

  create trigger trg_realtime_sinal_ins after insert on public.diario_recebimentos
    referencing new table as novas for each statement
    execute function public.fn_realtime_sinal_mudou('diario');
  create trigger trg_realtime_sinal_upd after update on public.diario_recebimentos
    referencing old table as antigas new table as novas for each statement
    execute function public.fn_realtime_sinal_mudou('diario');
  create trigger trg_realtime_sinal_del after delete on public.diario_recebimentos
    referencing old table as antigas for each statement
    execute function public.fn_realtime_sinal_mudou('diario');
end
$gatilhos$;

-- Quem tem acesso à empresa ouve o sinal — a mesma regra dos outros. O sinal
-- não carrega dado: só «mudou», a operação e quem importou.
drop policy if exists sinal_mudou_receber on realtime.messages;
create policy sinal_mudou_receber on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) in ('analitico', 'permissoes', 'vendas', 'rh', 'diario')
    and (select public.fn_realtime_posso_ouvir_empresa((select realtime.topic())))
  );

-- ============================================================================
-- 2. Chat: o monitor ouve o tópico da pessoa acompanhada
-- ============================================================================
--
-- `chat:<perfil_id>` recebe um aviso por mensagem (só ids, nunca o texto) das
-- conversas daquela pessoa. Até aqui só o dono entrava. Passa a entrar também
-- quem `fn_chat_posso_monitorar` autoriza — a MESMA regra que já libera o
-- monitor a ler essas mensagens pela RLS de `chat_mensagens`. O texto continua
-- sendo buscado pela RLS de sempre.
--
-- Tópico malformado nega em vez de estourar o cast.

create or replace function public.fn_realtime_posso_ouvir_chat(p_topico text)
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_alvo uuid;
begin
  if split_part(p_topico, ':', 1) <> 'chat' then
    return false;
  end if;
  begin
    v_alvo := split_part(p_topico, ':', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return v_alvo = (select auth.uid())
      or coalesce(public.fn_chat_posso_monitorar(v_alvo), false);
end;
$function$;

comment on function public.fn_realtime_posso_ouvir_chat(text) is
  'Pode ouvir o topico chat:<perfil_id>? O dono, ou quem pode monitorar o chat dele. Ver 20260928180000.';

revoke all on function public.fn_realtime_posso_ouvir_chat(text) from public, anon;
grant execute on function public.fn_realtime_posso_ouvir_chat(text) to authenticated;

drop policy if exists chat_sinal_receber on realtime.messages;
create policy chat_sinal_receber on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and (
      -- O caso de todo mundo, sem chamar função nenhuma.
      (select realtime.topic()) = 'chat:' || (select auth.uid())::text
      or (select public.fn_realtime_posso_ouvir_chat((select realtime.topic())))
    )
  );

-- ============================================================================
-- 3. A publicação
-- ============================================================================

do $publicacao$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Sem publicacao supabase_realtime — nada a tirar.';
    return;
  end if;

  foreach t in array array[
    'chat_mensagens', 'chat_participantes', 'diario_recebimentos', 'logs_sistema'
  ] loop
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
      raise notice 'supabase_realtime: % saiu da publicacao', t;
    end if;
  end loop;
end
$publicacao$;

commit;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' order by 1;
--   -- chat_mensagens, chat_participantes, diario_recebimentos e logs_sistema
--   -- NAO aparecem (26 tabelas)
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.diario_recebimentos'::regclass and tgname like 'trg_realtime_sinal_%';
--   -- 3 linhas
--
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy
--    where polrelid = 'realtime.messages'::regclass
--      and polname in ('sinal_mudou_receber', 'chat_sinal_receber');
--
-- Efeito esperado, a medir alguns dias depois: `calls` e `total_exec_time` de
-- `realtime.list_changes` em `extensions.pg_stat_statements` caindo na mesma
-- proporção das mudanças que saíram (~85%).
