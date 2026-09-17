-- ============================================================================
-- Realtime: tabelas de escrita em lote avisam por SINAL, não por linha
-- ============================================================================
--
-- ## O erro que não parava (logs de 16 e 17/09/2026)
--
--   PoolingReplicationError: query_canceled — canceling statement due to user request
--     PL/pgSQL function realtime.apply_rls(jsonb,integer) ... list_changes
--   PoolingReplicationError: ssl recv (idle): closed
--
-- 10 a 30 por hora no horário comercial. É o leitor do Postgres Changes
-- (`realtime.list_changes`) estourando o tempo e caindo.
--
-- ## Por que ele estoura
--
-- Para CADA linha que muda numa tabela publicada, o `apply_rls` reavalia a RLS
-- no papel de CADA assinante. `analitico_recebimentos` tinha 150 assinaturas
-- (117 pessoas) e recebe a importação do 58 e a sincronização do 59 — milhares
-- de DELETE + INSERT por vez (236 mil inserts e 234 mil deletes no contador da
-- tabela). 10 mil linhas × 117 pessoas × a policy `analitico_select` (quatro
-- funções) passa de um milhão de avaliações num lote só.
--
-- Medido em `pg_stat_statements` (48 h): `list_changes` somou 9.736 s de banco,
-- pico de 14.989 ms — o teto que cancela a consulta.
--
-- ## Por que isso derrubava TODO o tempo real, e não só o analítico
--
-- Quando o leitor cai, o Realtime derruba os canais de todo mundo e todo mundo
-- reassina: 450.539 inserts em `realtime.subscription` em 48 h, canais já na
-- 116ª recriação (`perfil-foto-...::r116`), e o `presence-global` estourando
-- `PresenceRateLimitReached` na volta. A reassinatura em massa carrega o banco
-- de novo, e o ciclo se realimenta.
--
-- ## O conserto
--
-- Nenhum consumidor usa a LINHA de `analitico_recebimentos`: todos só releem
-- (com espera). Então a tabela não precisa estar no Postgres Changes. Um gatilho
-- por COMANDO (não por linha) manda UM aviso por empresa pelo Broadcast:
--
--   tópico  'analitico:<empresa_id>'   evento 'mudou'
--   payload { tabela, operacao, importado_por: [uuid...] }
--
-- Uma importação de 10 mil linhas vira 1 a 3 mensagens, e a RLS deixa de ser
-- avaliada por linha: a autorização do canal privado é checada UMA vez, na
-- entrada (policy `sinal_mudou_receber` abaixo).
--
-- O mesmo gatilho entra onde o tempo real NUNCA funcionou — as telas assinavam
-- tabelas que não estão na publicação `supabase_realtime`:
--
--   cargos_permissoes, perfis_permissoes  → 'permissoes:<empresa>'  (useCargoPermissoes)
--   vendas                                → 'vendas:<empresa>'      (useVendas)
--   rh_lancamentos, rh_fechamentos        → 'rh:<empresa>'          (useRhGestao)
--
-- ## Limpeza da publicação
--
-- Saem de `supabase_realtime`, além de `analitico_recebimentos`, as tabelas
-- publicadas que nenhuma tela assina (conferido no código e em
-- `realtime.subscription` em 17/09/2026): chat_conversas, chat_disparos,
-- lixeira_acordos, metas_config_mes, pet_estado, analitico_ajustes_eventos.
-- Cada mudança numa tabela publicada passa pelo `list_changes` mesmo sem
-- ninguém ouvindo.
--
-- ## Ordem de aplicação
--
-- Depois do deploy do front que ouve os sinais. Aba aberta com o bundle antigo
-- deixa de receber o aviso do analítico até recarregar (a releitura ao voltar
-- para a aba continua valendo).
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ============================================================================
-- 1. O gatilho que avisa
-- ============================================================================
--
-- SECURITY DEFINER porque quem escreve é `authenticated` (a importação vai pelo
-- PostgREST) e `realtime.messages` só aceita INSERT de `authenticated` com
-- policy de escrita — que não existe, e não deve existir, para estes tópicos:
-- sem ela, nenhum cliente consegue forjar um «mudou».
--
-- `realtime.send` já engole qualquer erro próprio (RAISE WARNING): um aviso que
-- falha nunca derruba a importação.
--
-- As transições se chamam `novas`/`antigas` em todas as tabelas. Cada ramo só
-- cita a que existe na operação — o PL/pgSQL planeja o comando na execução, e o
-- ramo que não roda nunca é planejado.

create or replace function public.fn_realtime_sinal_mudou()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_prefixo constant text := tg_argv[0];
  v_alvos   jsonb;
  v_alvo    record;
begin
  -- `importado_por_id` só existe no analítico: nas outras tabelas o `->>` dá
  -- nulo e a lista sai vazia.
  if tg_op = 'INSERT' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_alvos
      from (select u.empresa_id,
                   coalesce(jsonb_agg(distinct u.por) filter (where u.por is not null),
                            '[]'::jsonb) as importado_por
              from (select n.empresa_id, to_jsonb(n) ->> 'importado_por_id' as por
                      from novas n) u
             where u.empresa_id is not null
             group by u.empresa_id) x;
  elsif tg_op = 'UPDATE' then
    -- Uma linha que troca de empresa avisa as duas.
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_alvos
      from (select u.empresa_id,
                   coalesce(jsonb_agg(distinct u.por) filter (where u.por is not null),
                            '[]'::jsonb) as importado_por
              from (select n.empresa_id, to_jsonb(n) ->> 'importado_por_id' as por from novas n
                    union all
                    select a.empresa_id, null::text from antigas a) u
             where u.empresa_id is not null
             group by u.empresa_id) x;
  else
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_alvos
      from (select a.empresa_id, '[]'::jsonb as importado_por
              from antigas a
             where a.empresa_id is not null
             group by a.empresa_id) x;
  end if;

  for v_alvo in
    select * from jsonb_to_recordset(v_alvos) as t(empresa_id uuid, importado_por jsonb)
  loop
    perform realtime.send(
      jsonb_build_object(
        'tabela',        tg_table_name,
        'operacao',      tg_op,
        'importado_por', v_alvo.importado_por),
      'mudou',
      v_prefixo || ':' || v_alvo.empresa_id::text,
      true);
  end loop;

  return null;
end;
$function$;

comment on function public.fn_realtime_sinal_mudou() is
  'Gatilho por comando: um Broadcast «mudou» por empresa no topico <tg_argv[0]>:<empresa_id>. '
  'Substitui o Postgres Changes nas tabelas de escrita em lote. Ver 20260917110000.';

revoke all on function public.fn_realtime_sinal_mudou() from public, anon, authenticated;

-- ============================================================================
-- 2. Os gatilhos
-- ============================================================================
--
-- Três por tabela: o Postgres não aceita tabela de transição num gatilho com
-- mais de um evento.

do $gatilhos$
declare
  v record;
begin
  for v in
    select * from (values
      ('analitico_recebimentos', 'analitico'),
      ('cargos_permissoes',      'permissoes'),
      ('perfis_permissoes',      'permissoes'),
      ('vendas',                 'vendas'),
      ('rh_lancamentos',         'rh'),
      ('rh_fechamentos',         'rh')
    ) as t(tabela, prefixo)
  loop
    if to_regclass(format('public.%I', v.tabela)) is null then
      raise notice 'sinal: tabela % nao existe, pulada', v.tabela;
      continue;
    end if;

    execute format('drop trigger if exists trg_realtime_sinal_ins on public.%I', v.tabela);
    execute format('drop trigger if exists trg_realtime_sinal_upd on public.%I', v.tabela);
    execute format('drop trigger if exists trg_realtime_sinal_del on public.%I', v.tabela);

    execute format(
      'create trigger trg_realtime_sinal_ins after insert on public.%I '
      'referencing new table as novas for each statement '
      'execute function public.fn_realtime_sinal_mudou(%L)', v.tabela, v.prefixo);
    execute format(
      'create trigger trg_realtime_sinal_upd after update on public.%I '
      'referencing old table as antigas new table as novas for each statement '
      'execute function public.fn_realtime_sinal_mudou(%L)', v.tabela, v.prefixo);
    execute format(
      'create trigger trg_realtime_sinal_del after delete on public.%I '
      'referencing old table as antigas for each statement '
      'execute function public.fn_realtime_sinal_mudou(%L)', v.tabela, v.prefixo);
  end loop;
end
$gatilhos$;

-- ============================================================================
-- 3. Quem pode ouvir
-- ============================================================================
--
-- O tópico traz a empresa; ouve quem tem acesso a ela (a mesma regra das
-- telas). Um tópico malformado nega em vez de estourar o cast.

create or replace function public.fn_realtime_posso_ouvir_empresa(p_topico text)
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_empresa uuid;
begin
  begin
    v_empresa := split_part(p_topico, ':', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return public.fn_can_access_empresa(v_empresa);
end;
$function$;

revoke all on function public.fn_realtime_posso_ouvir_empresa(text) from public, anon;
grant execute on function public.fn_realtime_posso_ouvir_empresa(text) to authenticated;

drop policy if exists sinal_mudou_receber on realtime.messages;
create policy sinal_mudou_receber on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) in ('analitico', 'permissoes', 'vendas', 'rh')
    and (select public.fn_realtime_posso_ouvir_empresa((select realtime.topic())))
  );

-- Sem policy de INSERT para estes tópicos, de propósito: só o banco avisa.

-- ============================================================================
-- 4. A publicação fica só com quem é ouvido linha a linha
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
    'analitico_recebimentos',
    'chat_conversas', 'chat_disparos', 'lixeira_acordos',
    'metas_config_mes', 'pet_estado', 'analitico_ajustes_eventos'
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
--   -- analitico_recebimentos e as seis sem assinante NAO aparecem
--
--   select tgrelid::regclass, tgname from pg_trigger
--    where tgname like 'trg_realtime_sinal_%' order by 1, 2;
--   -- 18 linhas (6 tabelas × 3)
--
-- Ver o aviso sair (em transação revertida, sem mexer em dado):
--
--   begin;
--   update public.cargos_permissoes set permissoes = permissoes
--    where empresa_id = '<uuid>' and cargo = '<cargo>';
--   select topic, event, payload from realtime.messages
--    where topic like 'permissoes:%' order by inserted_at desc limit 1;
--   rollback;
