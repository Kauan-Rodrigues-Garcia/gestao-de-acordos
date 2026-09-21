-- ============================================================================
-- Notificações por Broadcast, uma por dono — e limpeza de REPLICA IDENTITY
-- ============================================================================
--
-- ## O que foi medido (21/09/2026, janela de 71,7 h de uptime)
--
-- `realtime.apply_rls` é a 2ª consulta mais cara do banco: 326.862 chamadas,
-- 4.350.357 ms — 23,1% de todo o tempo, ~24 min de CPU por dia.
--
-- Repartindo por tabela publicada (mudanças × assinaturas):
--
--   notificacoes   14.355 mudanças × 147 assinaturas = 2.110.185   ← 91%
--   acordos            699         × 296             =   206.904
--   nr_registros       527         ×   5             =     2.635
--   perfis              10         × 147             =     1.470
--
-- `notificacoes` é o motor, e não por ter muitos assinantes: é que cada linha
-- que muda é avaliada contra TODAS as assinaturas.
--
-- ## Por que o filtro não ajudava
--
-- A assinatura já era a mais estreita possível — uma por usuário, com
-- `filter: usuario_id=eq.<id>` (NotificacoesProvider). Mas o filtro do Postgres
-- Changes não dispensa a avaliação: para cada linha, o `apply_rls` roda a RLS no
-- papel de cada assinante e só então descarta. Com 147 abas abertas, 146
-- avaliações por linha respondem «não é sua».
--
-- 99,3% do trabalho é recusa.
--
-- ## O conserto
--
-- Tópico de broadcast por DONO. A autorização é checada uma vez, na entrada do
-- canal (policy `notificacoes_sinal_receber`), e não mais por linha:
--
--   tópico  'notificacoes:<usuario_id>'   evento 'nova'
--   payload { operacao, notificacao }          -- INSERT/UPDATE
--           { operacao: 'DELETE', id }         -- DELETE
--           { operacao: 'RECARREGAR' }         -- lote grande para o mesmo dono
--
-- O payload carrega a linha de propósito: o tópico é privado e só o dono entra,
-- então a tela continua fazendo o que fazia (empilhar, tocar, vibrar) sem uma
-- ida extra ao banco. Não há releitura no caminho feliz.
--
-- ## Ordem de aplicação — CORRIGIDO em 21/09/2026, depois do estrago
--
-- O front desta mesma entrega escuta OS DOIS caminhos: o broadcast novo e o
-- `postgres_changes` antigo. Os três tratadores são idempotentes (INSERT dedupa
-- por id, UPDATE é map, DELETE é filter), então evento em duplicata não estraga
-- nada.
--
-- A primeira versão deste cabeçalho dizia que «a ordem é livre» e que, no
-- deploy-antes-da-migration, «o front ouve um tópico que ainda ninguém escreve».
-- ERRADO, e caro: não é que ninguém escreve — é que ninguém tem PERMISSÃO DE
-- LER, porque a policy `notificacoes_sinal_receber` vem junto nesta migration.
-- Sem ela, todo cliente que tenta entrar no tópico leva:
--
--   Unauthorized: You do not have permissions to read from this Channel topic:
--   notificacoes:<usuario_id>
--
-- e o `assinarTabela` trata como falha transitória e retenta com backoff. Medido
-- na aplicação real: **2.200 erros em 8 minutos** (13:23 a 13:31), ~70 a 86
-- tentativas por usuário, até a migration entrar e a policy passar a existir.
--
-- ## A ordem certa, e o porquê de cada uma
--
--   deploy → migration  (foi o que se fez)
--     Sem buraco funcional: `notificacoes` ainda está na publicação, então o
--     `postgres_changes` continua entregando. O preço é a tempestade de
--     `Unauthorized` acima, durante a janela. Ninguém perde notificação.
--
--   migration → deploy
--     Sem erro nenhum no log. O preço é o inverso: a tabela sai da publicação
--     antes de o front saber ouvir o broadcast, e QUEM NÃO RECARREGAR fica sem
--     notificação até recarregar. Assinar tabela fora da publicação não dá
--     erro — fica inerte, em silêncio, que é pior de perceber.
--
--   o jeito sem nenhum dos dois custos, se houver uma próxima:
--     separar a POLICY numa migration própria, aplicar ela primeiro (ela sozinha
--     não muda comportamento nenhum), depois o deploy, depois o resto. A
--     autorização passa a existir antes de alguém pedir para entrar.
--
-- Quando `notificacoes` sai da publicação (passo 5), o caminho antigo emudece
-- sozinho e o listener vira no-op. O código do postgres_changes pode ser
-- removido numa entrega seguinte, depois que todo mundo tiver recarregado.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ============================================================================
-- 1. Quem pode ouvir o tópico de um dono
-- ============================================================================
--
-- Mesmo molde de `fn_realtime_posso_ouvir_empresa` (20260917110000): tópico
-- malformado NEGA em vez de estourar o cast.

create or replace function public.fn_realtime_posso_ouvir_usuario(p_topico text)
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_dono uuid;
begin
  begin
    v_dono := split_part(p_topico, ':', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return v_dono = auth.uid();
end;
$function$;

comment on function public.fn_realtime_posso_ouvir_usuario(text) is
  'Autoriza a entrada no topico <nome>:<usuario_id> so para o proprio dono. Ver 20260921120000.';

revoke all on function public.fn_realtime_posso_ouvir_usuario(text) from public, anon;
grant execute on function public.fn_realtime_posso_ouvir_usuario(text) to authenticated;

-- ============================================================================
-- 2. O gatilho que avisa o dono
-- ============================================================================
--
-- SECURITY DEFINER: quem escreve notificação é `authenticated` (pelo PostgREST)
-- ou uma função interna, e `realtime.messages` não tem — nem deve ter — policy
-- de INSERT para estes tópicos. Sem ela, nenhum cliente forja uma notificação.
--
-- `realtime.send` engole o próprio erro (RAISE WARNING): um aviso que falha
-- nunca derruba a escrita que o originou.
--
-- Válvula: um comando que mexe em mais de LOTE_MAX linhas do MESMO dono manda um
-- «RECARREGUE» em vez de uma mensagem por linha. Protege contra um UPDATE em
-- massa (marcar tudo como lido, por exemplo) virar centenas de mensagens.

create or replace function public.fn_notificacoes_sinal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  lote_max constant integer := 10;
  v_dono   record;
  v_linha  record;
begin
  if tg_op = 'DELETE' then
    for v_dono in
      select a.usuario_id, count(*) as quantas
        from antigas a
       where a.usuario_id is not null
       group by a.usuario_id
    loop
      if v_dono.quantas > lote_max then
        perform realtime.send(
          jsonb_build_object('operacao', 'RECARREGAR'),
          'nova',
          'notificacoes:' || v_dono.usuario_id::text,
          true);
        continue;
      end if;

      for v_linha in
        select a.id from antigas a where a.usuario_id = v_dono.usuario_id
      loop
        perform realtime.send(
          jsonb_build_object('operacao', 'DELETE', 'id', v_linha.id),
          'nova',
          'notificacoes:' || v_dono.usuario_id::text,
          true);
      end loop;
    end loop;

    return null;
  end if;

  -- INSERT e UPDATE: a linha nova é o que a tela precisa.
  for v_dono in
    select n.usuario_id, count(*) as quantas
      from novas n
     where n.usuario_id is not null
     group by n.usuario_id
  loop
    if v_dono.quantas > lote_max then
      perform realtime.send(
        jsonb_build_object('operacao', 'RECARREGAR'),
        'nova',
        'notificacoes:' || v_dono.usuario_id::text,
        true);
      continue;
    end if;

    for v_linha in
      select n.* from novas n where n.usuario_id = v_dono.usuario_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'operacao',    tg_op,
          'notificacao', to_jsonb(v_linha)),
        'nova',
        'notificacoes:' || v_dono.usuario_id::text,
        true);
    end loop;
  end loop;

  return null;
end;
$function$;

comment on function public.fn_notificacoes_sinal() is
  'Gatilho por comando: um Broadcast «nova» por DONO no topico notificacoes:<usuario_id>. '
  'Substitui o Postgres Changes em notificacoes — era 91% das avaliacoes de RLS do Realtime. '
  'Ver 20260921120000.';

revoke all on function public.fn_notificacoes_sinal() from public, anon, authenticated;

-- ============================================================================
-- 3. Os gatilhos
-- ============================================================================
--
-- Três, e não um: o Postgres não aceita tabela de transição em gatilho com mais
-- de um evento.

drop trigger if exists trg_notificacoes_sinal_ins on public.notificacoes;
drop trigger if exists trg_notificacoes_sinal_upd on public.notificacoes;
drop trigger if exists trg_notificacoes_sinal_del on public.notificacoes;

create trigger trg_notificacoes_sinal_ins
  after insert on public.notificacoes
  referencing new table as novas
  for each statement
  execute function public.fn_notificacoes_sinal();

create trigger trg_notificacoes_sinal_upd
  after update on public.notificacoes
  referencing old table as antigas new table as novas
  for each statement
  execute function public.fn_notificacoes_sinal();

create trigger trg_notificacoes_sinal_del
  after delete on public.notificacoes
  referencing old table as antigas
  for each statement
  execute function public.fn_notificacoes_sinal();

-- ============================================================================
-- 4. Quem recebe
-- ============================================================================
--
-- Policy própria, somada às que já existem em `realtime.messages`
-- (`sinal_mudou_receber`, `chat_sinal_receber`). Policies permissivas se somam
-- com OR — esta não tira nada de ninguém.
--
-- A função vai em `(SELECT ...)`: é constante por consulta, e assim roda uma vez
-- (InitPlan) em vez de uma vez por linha.

drop policy if exists notificacoes_sinal_receber on realtime.messages;
create policy notificacoes_sinal_receber on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'notificacoes'
    and (select public.fn_realtime_posso_ouvir_usuario((select realtime.topic())))
  );

-- Sem policy de INSERT para este tópico, de propósito: só o banco avisa.

-- ============================================================================
-- 5. `notificacoes` sai do Postgres Changes
-- ============================================================================

do $publicacao$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Sem publicacao supabase_realtime — nada a tirar.';
    return;
  end if;

  if exists (select 1 from pg_publication_tables
              where pubname = 'supabase_realtime'
                and schemaname = 'public'
                and tablename = 'notificacoes') then
    alter publication supabase_realtime drop table public.notificacoes;
    raise notice 'supabase_realtime: notificacoes saiu da publicacao';
  end if;
end
$publicacao$;

-- ============================================================================
-- 6. REPLICA IDENTITY FULL onde ela não serve para nada
-- ============================================================================
--
-- FULL manda a linha antiga INTEIRA para o WAL em todo UPDATE e DELETE. Isso só
-- tem uso em replicação lógica — ou seja, para tabela que está na publicação.
-- Fora dela o custo continua sendo pago (com `wal_level = logical`, que o
-- Realtime exige, o Postgres grava conforme a replica identity sem checar se a
-- tabela é publicada) e o benefício é zero.
--
-- As oito abaixo foram conferidas em 21/09/2026: FULL e fora da publicação.
-- `notificacoes` entra na lista porque acabou de sair, no passo 5.
--
-- Os gatilhos de broadcast NÃO dependem disto: tabela de transição
-- (`referencing old table`) entrega a linha antiga inteira de qualquer jeito.
--
-- Reversível: `alter table ... replica identity full`.

do $identidade$
declare
  t text;
begin
  foreach t in array array[
    'notificacoes',
    'analitico_ajustes_eventos',
    'cargos_permissoes',
    'chat_conversas',
    'chat_curtidas',
    'chat_disparos',
    'lixeira_acordos',
    'pix_automatico_nr_pedidos',
    'pix_automatico_nr_pedido_aprovacoes'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'replica identity: tabela % nao existe, pulada', t;
      continue;
    end if;

    -- Segurança: nunca rebaixar tabela que esteja na publicação. Uma tabela
    -- publicada com identidade padrão perde o DELETE filtrado (só a PK vai no
    -- WAL), que é exatamente o bug que a 20260823140000 consertou em `acordos`.
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime'
                  and schemaname = 'public'
                  and tablename = t) then
      raise notice 'replica identity: % esta na publicacao, mantida em FULL', t;
      continue;
    end if;

    if exists (select 1 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = t
                  and c.relreplident = 'f') then
      execute format('alter table public.%I replica identity default', t);
      raise notice 'replica identity: % voltou para default', t;
    end if;
  end loop;
end
$identidade$;

commit;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
-- 1. `notificacoes` fora da publicação e com identidade padrão:
--
--   select c.relname, c.relreplident,
--          exists (select 1 from pg_publication_tables pt
--                   where pt.pubname = 'supabase_realtime'
--                     and pt.tablename = c.relname) as na_publicacao
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'notificacoes';
--   -- esperado: relreplident = 'd', na_publicacao = false
--
-- 2. Os três gatilhos:
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.notificacoes'::regclass and not tgisinternal
--    order by 1;
--   -- esperado: trg_notificacoes_sinal_del/ins/upd
--
-- 3. Nenhuma tabela com FULL fora da publicação:
--
--   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and c.relreplident = 'f'
--      and not exists (select 1 from pg_publication_tables pt
--                       where pt.pubname = 'supabase_realtime'
--                         and pt.tablename = c.relname)
--    order by 1;
--   -- esperado: 0 linhas
--
-- 4. Ver o aviso sair, sem deixar rastro:
--
--   begin;
--   update public.notificacoes set lida = lida where id = '<uuid de uma sua>';
--   select topic, event, payload from realtime.messages
--    where topic like 'notificacoes:%' order by inserted_at desc limit 1;
--   rollback;
--
-- 5. Depois de algumas horas, o efeito no custo:
--
--   select calls, round(total_exec_time) as ms_total
--     from extensions.pg_stat_statements
--    where query like '%wal->>%' and query like '%apply_rls%';
--   -- comparar com 326.862 chamadas / 4.350.357 ms medidos em 21/09/2026
-- ============================================================================
