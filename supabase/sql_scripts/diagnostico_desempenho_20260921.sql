-- ============================================================================
-- Diagnóstico de desempenho — 2026-09-21
-- ============================================================================
-- SÓ LEITURA. Nada altera dado: zero INSERT, UPDATE, DELETE, ALTER ou DROP.
--
-- Onze consultas independentes. No SQL Editor rode UMA de cada vez (o editor
-- mostra só o último resultado).
--
-- Dez leem apenas catálogo e estatística — não tocam em linha de negócio (nem
-- nome, nem CPF, nem acordo). A exceção está marcada: a nº 5 conta linhas e lê
-- carimbos de tempo de `analitico_removidos`, sem abrir o `conteudo`.
--
-- Cada consulta responde a um achado da auditoria de código de 21/09/2026.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. As migrations do lote novo entraram mesmo?
-- ─────────────────────────────────────────────────────────────────────────────
-- CLAUDE.md: `schema_migrations` está defasado. Quem manda é o objeto no
-- schema. Esperado: 4 linhas, todas com `existe = true`.
select f.nome,
       to_regprocedure('public.' || f.nome || f.args) is not null as existe
  from (values
    ('fn_mestre_sincronizar_analitico_aplicar', '(uuid,date,uuid)'),
    ('fn_analitico_removidos_faxina',           '()'),
    ('fn_user_escopos_por_aba',                 '()'),
    ('fn_chat_avisar_participantes',            '()')
  ) as f(nome, args);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ACHADO 2 — `acordos` no Postgres Changes, com REPLICA IDENTITY FULL
-- ─────────────────────────────────────────────────────────────────────────────
-- `relreplident`: d = default (só a PK no WAL), f = FULL (a linha antiga
-- INTEIRA no WAL, em todo UPDATE e DELETE).
-- `acordos` com f + na publicação é o custo que a auditoria apontou.
select c.relname                                    as tabela,
       case c.relreplident when 'd' then 'default (PK)'
                           when 'f' then 'FULL (linha inteira no WAL)'
                           when 'i' then 'index' else c.relreplident::text end as replica_identity,
       exists (select 1 from pg_publication_tables pt
                where pt.pubname = 'supabase_realtime'
                  and pt.schemaname = 'public'
                  and pt.tablename = c.relname)     as na_publicacao
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('acordos', 'chat_mensagens', 'chat_participantes',
                     'notificacoes', 'desafios', 'analitico_recebimentos')
 order by na_publicacao desc, c.relname;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ACHADOS 2 e 6 — assinaturas vivas por tabela
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada linha aqui é RLS reavaliada a cada mudança na tabela, por assinante.
-- Retrato do instante: só aparece quem está com a tela aberta agora.
-- Se `acordos` tiver dezenas de assinaturas, o achado 2 está confirmado.
select entity::regclass                as tabela,
       count(*)                        as assinaturas,
       count(distinct subscription_id) as canais
  from realtime.subscription
 group by 1
 order by 2 desc;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ACHADO 1 — o N+1 da TabulacaoCell ainda pesa?
-- ─────────────────────────────────────────────────────────────────────────────
-- As duas consultas que a tela dispara por LINHA não tabulada:
--   a) o SELECT em `acordos` casando o código (nr_cliente / instituicao);
--   b) o UPDATE de `status_tabulacao` em `analitico_recebimentos`.
-- `calls` alto com `ms_media` baixo = N+1: cada ida é barata, o volume é o
-- problema. Compare `calls` com o total de linhas do analítico do mês.
select left(regexp_replace(query, '\s+', ' ', 'g'), 150) as consulta,
       calls,
       round(total_exec_time)                            as ms_total,
       round(mean_exec_time::numeric, 2)                 as ms_media,
       rows / nullif(calls, 0)                           as linhas_por_chamada
  from extensions.pg_stat_statements
 where (query ilike '%acordos%' and query ilike '%nr_cliente%')
    or (query ilike '%analitico_recebimentos%' and query ilike '%status_tabulacao%')
    or  query ilike '%fn_analitico_dashboard_mes_json%'
 order by calls desc
 limit 20;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A correção do 59 segurou? (ÚNICA que lê tabela de negócio)
-- ─────────────────────────────────────────────────────────────────────────────
-- Conta linhas e lê carimbos de tempo. NÃO abre o `conteudo` (que tem o dado
-- da pessoa). Nenhum nome, código ou valor sai daqui.
--
-- Esperado depois da 20260918100000: poucas centenas de linhas e `ultimas_24h`
-- na casa das dezenas. Se `ultimas_24h` estiver na casa dos milhares, a
-- sincronização voltou a guardar o setor inteiro.
select count(*)                                                          as linhas,
       pg_size_pretty(pg_total_relation_size('public.analitico_removidos')) as tamanho,
       count(*) filter (where removido_em > now() - interval '24 hours')  as ultimas_24h,
       count(*) filter (where removido_em > now() - interval '7 days')    as ultimos_7d,
       min(removido_em)                                                   as mais_antiga,
       max(removido_em)                                                   as mais_recente
  from public.analitico_removidos;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O vigia da faxina está agendado e rodando?
-- ─────────────────────────────────────────────────────────────────────────────
-- `analitico-removidos-faxina` deve existir, ativo, em '35 5 * * *'.
-- `return_message` de cada execução diz quantas cópias apagou; em regime
-- normal é zero.
select j.jobname, j.schedule, j.active,
       d.status, d.start_time, d.end_time, d.return_message
  from cron.job j
  left join lateral (
    select * from cron.job_run_details r
     where r.jobid = j.jobid order by r.start_time desc limit 3
  ) d on true
 where j.jobname = 'analitico-removidos-faxina'
 order by d.start_time desc nulls last;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ACHADO 3 — policies que chamam a função por LINHA
-- ─────────────────────────────────────────────────────────────────────────────
-- `fn_user_tem(...)` e `fn_user_is_super_admin()` não recebem coluna: são
-- constantes por consulta e deveriam estar em `(SELECT ...)` (InitPlan).
-- O Postgres normaliza o InitPlan como «( SELECT fn_... )» no texto abaixo.
-- Sem o SELECT em volta, a função roda uma vez POR LINHA lida.
--
-- `fn_can_access_empresa(empresa_id)` recebe coluna — ali por linha é correto
-- e não conta como achado.
select tablename,
       policyname,
       cmd,
       case
         when coalesce(qual, '') ~ 'SELECT fn_user_tem|SELECT public\.fn_user_tem'
           or coalesce(qual, '') !~ 'fn_user_tem' then 'ok/nao-aplica'
         else 'SEM InitPlan'
       end                                         as fn_user_tem,
       case
         when coalesce(qual, '') ~ 'SELECT fn_user_is_super_admin|SELECT public\.fn_user_is_super_admin'
           or coalesce(qual, '') !~ 'fn_user_is_super_admin' then 'ok/nao-aplica'
         else 'SEM InitPlan'
       end                                         as fn_super_admin,
       left(coalesce(qual, ''), 200)               as expressao_using
  from pg_policies
 where schemaname = 'public'
   and coalesce(qual, '') ~ 'fn_user_tem|fn_user_is_super_admin'
 order by 4 desc, 5 desc, tablename, policyname;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ACHADO 4 — o work_mem de 32 MB, e em quais funções
-- ─────────────────────────────────────────────────────────────────────────────
-- Esperado: as 7 funções da 20260917140000. `work_mem` vale por NÓ de sort/
-- hash, e `hash_mem_multiplier` dobra nos nós de hash — por isso a nº 9
-- também pede esse parâmetro.
select p.oid::regprocedure as funcao, p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proconfig is not null
   and array_to_string(p.proconfig, ',') like '%work_mem%'
 order by 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Memória em vigor e o que foi parar em disco
-- ─────────────────────────────────────────────────────────────────────────────
-- Duas leituras. `temp_files` alto = ordenação/hash que não coube na RAM e
-- foi para o disco — disco é o recurso com cota de rajada no Small.
-- `cache_hit_pct` abaixo de ~98% é sinal de working set maior que a RAM.
select name, setting, unit
  from pg_settings
 where name in ('shared_buffers', 'work_mem', 'hash_mem_multiplier',
                'maintenance_work_mem', 'effective_cache_size',
                'logical_decoding_work_mem', 'max_connections');

select round(blks_hit * 100.0 / nullif(blks_hit + blks_read, 0), 2) as cache_hit_pct,
       temp_files,
       pg_size_pretty(temp_bytes)                                   as temp_total,
       stats_reset
  from pg_stat_database
 where datname = current_database();


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ACHADO 5 — índices de `analitico_removidos`
-- ─────────────────────────────────────────────────────────────────────────────
-- A faxina filtra `restaurado_em is null and removido_em < now() - 1 day`.
-- Se não houver índice cobrindo isso, é varredura sequencial todo dia às 02:35
-- — tolerável com a tabela pequena, caro quando ela crescer.
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'analitico_removidos'
 order by indexname;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Onde está o tempo do banco, sem recorte
-- ─────────────────────────────────────────────────────────────────────────────
-- O quadro geral, para não olhar só onde a auditoria já apontou.
-- `temp_blks_written > 0` marca quem foi para o disco.
select left(regexp_replace(query, '\s+', ' ', 'g'), 140) as consulta,
       calls,
       round(total_exec_time)                            as ms_total,
       round(100 * total_exec_time
             / sum(total_exec_time) over (), 1)          as pct_do_tempo,
       round(mean_exec_time::numeric, 1)                 as ms_media,
       temp_blks_written
  from extensions.pg_stat_statements
 order by total_exec_time desc
 limit 25;


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. As maiores tabelas
-- ─────────────────────────────────────────────────────────────────────────────
-- O banco tinha 1,29 GB em 18/09 e caiu para 697 MB depois da limpeza. O
-- compute Small tem 2 GB de RAM: o que não cabe é lido do disco.
select c.relname                                          as tabela,
       pg_size_pretty(pg_total_relation_size(c.oid))      as total,
       pg_size_pretty(pg_indexes_size(c.oid))             as indices,
       s.n_live_tup                                       as linhas_vivas,
       s.n_dead_tup                                       as linhas_mortas,
       s.last_autovacuum
  from pg_stat_user_tables s
  join pg_class c on c.oid = s.relid
 order by pg_total_relation_size(c.oid) desc
 limit 20;

select pg_size_pretty(pg_database_size(current_database())) as banco_total;
