-- ============================================================================
-- Diagnóstico de RAM — 2026-09-18
-- ============================================================================
-- Só leitura. Cinco consultas independentes, só em catálogo/estatística: não
-- lê linha de tabela de negócio (nem nome, nem CPF, nem acordo).
--
-- No SQL Editor, rode UMA de cada vez (o editor mostra só o último resultado).
-- ============================================================================


-- 1. Quem ocupa as conexões (o card mostra 51/90) ----------------------------
--    ~10-20 linhas.
select coalesce(nullif(application_name, ''), backend_type) as origem,
       usename,
       state,
       count(*)                                              as conexoes,
       max(now() - backend_start)                            as mais_antiga
  from pg_stat_activity
 group by 1, 2, 3
 order by conexoes desc;


-- 2. Parâmetros de memória em vigor -----------------------------------------
--    9 linhas.
select name, setting, unit
  from pg_settings
 where name in ('shared_buffers', 'work_mem', 'hash_mem_multiplier',
                'maintenance_work_mem', 'autovacuum_work_mem',
                'logical_decoding_work_mem', 'effective_cache_size',
                'max_connections', 'max_worker_processes');


-- 3. Cache e arquivos temporários desde o último reset ----------------------
--    1 linha. temp_files alto = ordenação/hash que não coube na memória.
select round(blks_hit * 100.0 / nullif(blks_hit + blks_read, 0), 2) as cache_hit_pct,
       temp_files,
       pg_size_pretty(temp_bytes)                                    as temp_total,
       stats_reset
  from pg_stat_database
 where datname = current_database();


-- 4. As 20 consultas que mais consomem (texto normalizado, sem valores) -----
--    20 linhas.
select left(regexp_replace(query, '\s+', ' ', 'g'), 140)   as consulta,
       calls,
       round(total_exec_time)                              as ms_total,
       round(mean_exec_time::numeric, 1)                   as ms_media,
       rows / nullif(calls, 0)                             as linhas_por_chamada,
       temp_blks_written
  from extensions.pg_stat_statements
 order by total_exec_time desc
 limit 20;


-- 5. Assinaturas de Postgres Changes por tabela ------------------------------
--    Cada linha aqui é avaliada (filtro + RLS) a cada mudança na tabela.
--    ~10 linhas. Não lê `claims` (JWT).
select entity::regclass                  as tabela,
       count(*)                          as assinaturas,
       count(distinct subscription_id)   as canais
  from realtime.subscription
 group by 1
 order by 2 desc;
