-- ============================================================================
-- Desempenho: escopo de permissão, acordos_deduplicados e memória de trabalho
-- ============================================================================
--
-- Medido em produção em 17/09/2026 (pg_stat_statements de 48 h, EXPLAIN como
-- usuário real, sempre em transação revertida).
--
-- ## 1. `fn_user_escopo_perfis()` levava 621 ms para o administrador
--
-- A policy `perfis_select` chama `(select fn_user_escopo_perfis())` em TODA
-- leitura de `perfis` — e `perfis` é a tabela mais lida do app (105 mil
-- consultas em 48 h). Para quem tem cargo `administrador`/`super_admin` ela
-- custava 621 ms; para líder, 22 ms.
--
-- O motivo: `fn_user_escopo_perfis` chama `fn_user_escopo` para cada uma das 14
-- abas; cada `fn_user_escopo` chama `fn_user_tem` até 5 vezes; e cada
-- `fn_user_tem` do administrador lê `fn_permissoes_catalogo()` para saber se a
-- chave exige concessão nominal. O catálogo é uma cadeia de 25 funções SQL
-- aninhadas (o padrão `..._antes_<migration>`), e função com `SET search_path`
-- não é embutida pelo planejador: 9 ms por leitura, ~70 leituras por consulta.
--
-- A regra NÃO muda. `fn_user_escopos_por_aba()` aplica exatamente os quatro
-- passos de `fn_user_tem` (acesso total menos o nominal → exceção da pessoa →
-- mapa do cargo → negado) a todas as chaves de uma vez, lendo o catálogo UMA
-- vez, e só quando o cargo é de acesso total. `fn_user_escopo` e
-- `fn_user_escopo_perfis` passam a ler dela.
--
-- Conferido contra as funções atuais, para os 432 perfis do banco:
--   fn_user_escopo_perfis() ........ 432 usuários, 0 divergências
--   fn_user_escopo(aba) ............ 6.048 pares usuário×aba, 0 divergências
--                                    (valores -1, 0, 1, 2 e 3 presentes)
--
-- `fn_user_tem` fica como está: é a fonte da regra e responde uma chave só.
-- O catálogo também: `permissoes-catalogo.sql.test.ts` lê a cadeia das
-- migrations, e achatá-la aqui quebraria essa conferência.
--
-- ## 2. `acordos_deduplicados`: 21% do tempo de banco, média de 589 ms
--
-- A view era `DISTINCT ON (coalesce(grupo::text, id::text))` sobre a tabela
-- inteira. Nenhum filtro desce abaixo do `DISTINCT ON`, então toda consulta —
-- «60 primeiros por vencimento da empresa», «vencendo hoje» — deduplicava os
-- 11 mil acordos de todas as empresas, avaliando a RLS de cada um. Pior: a
-- saída vinha ordenada pelo grupo, não pelo vencimento, então o `LIMIT 60` só
-- era aplicado DEPOIS dos embeds `perfis` e `setores` rodarem para as 3.853
-- linhas da empresa. Medido como administrador: 601 ms.
--
-- Agora a linha fica se for a última parcela do seu grupo:
--
--   a.id = (select b.id ... where <grupo de b> = <grupo de a>
--           order by numero_parcela desc nulls last, criado_em desc, id desc limit 1)
--
-- Os filtros e a ordenação da consulta descem até `acordos` (índices de
-- empresa+vencimento), o `LIMIT` para cedo, e a pergunta «é a última parcela?»
-- é uma busca no índice novo.
--
-- Três detalhes que decidem se o índice é usado. Sob RLS o Postgres só aplica
-- ANTES da policy uma condição que não possa vazar dado — e só assim ela vira
-- condição de índice:
--   - a chave é `uuid`, não `text`: `uuid_eq` é leakproof, a conversão
--     uuid→text não é. Com a chave em texto a subconsulta virava varredura
--     sequencial por linha (medido em produção: 929 ms);
--   - o grupo é `case when acordo_grupo_id is null then id else acordo_grupo_id
--     end`, e não `coalesce(...)`: o Postgres não reconhece `COALESCE` como
--     seguro e cai na varredura sequencial; `CASE` + `IS NULL` ele reconhece
--     (pego pelo `desempenhoEscopo.sql.test.ts`, que confere o plano);
--   - `id desc` no fim desempata. O `DISTINCT ON` antigo escolhia qualquer uma
--     entre parcelas empatadas; não há nenhum empate hoje.
--
-- Conferido como `postgres` (sem RLS): o conjunto antigo e o novo têm as mesmas
-- 9.235 linhas, 0 só de um lado. A RLS continua valendo nas duas pontas (a view
-- é `security_invoker`), então «a última parcela que EU enxergo» segue igual.
--
-- ## 3. Memória de trabalho nas funções da diretoria e dos relatórios
--
-- `work_mem` do Small é 5 MB. `fn_mestre_diretoria_setor` gravou 3,3 GB em
-- arquivo temporário em 200 chamadas; com as outras seis, ~5 GB — ordenação e
-- hash que não cabiam na memória foram para o disco, e disco é o recurso com
-- cota de rajada no Small. 32 MB só DENTRO dessas funções (o `SET` vale durante
-- a execução delas), que rodam poucas vezes por dia.
--
-- Atenção: `create or replace function` sem o `SET work_mem` numa migration
-- futura dessas funções tira o ajuste.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

-- ============================================================================
-- 1. Escopo de permissão lendo o catálogo uma vez
-- ============================================================================

create or replace function public.fn_user_escopos_por_aba()
returns table(aba text, escopo integer)
language sql
stable
security definer
set search_path to ''
as $function$
  with ctx as (
    select p.perfil as cargo, p.empresa_id, p.id as usuario_id
      from public.perfis p
     where p.id = (select auth.uid())
  ),
  -- Só é lido se algum `when` do cargo de acesso total chegar a perguntar.
  explicitas as materialized (
    select c.chave from public.fn_permissoes_catalogo() c where c.explicita
  ),
  excecao as materialized (
    select pp.permissoes
      from public.perfis_permissoes pp
      join ctx on pp.usuario_id = ctx.usuario_id
  ),
  do_cargo as materialized (
    select cp.permissoes
      from public.cargos_permissoes cp
      join ctx on cp.empresa_id = ctx.empresa_id and cp.cargo = ctx.cargo
  ),
  niveis(nome, peso) as (
    values ('individual', 0), ('equipe', 1), ('setor', 2), ('todos_setores', 3)
  ),
  abas as (
    select a.aba, a.chave_aba from public.fn_abas_escopo() a
  ),
  -- A chave da aba (peso nulo) e as quatro chaves de nível de cada aba.
  chaves as (
    select a.aba, a.chave_aba as chave, null::integer as peso
      from abas a where a.chave_aba is not null
    union all
    select a.aba, a.aba || '_escopo_' || n.nome, n.peso
      from abas a cross join niveis n
  ),
  -- Os mesmos quatro passos de `fn_user_tem`, na mesma ordem.
  avaliadas as (
    select k.aba, k.peso,
           case
             when (select c.cargo from ctx c) in ('administrador', 'super_admin')
                  and not exists (select 1 from explicitas e where e.chave = k.chave)
               then true
             when exists (select 1 from excecao x where x.permissoes ? k.chave)
               then coalesce((select x.permissoes ->> k.chave from excecao x
                               where x.permissoes ? k.chave)::boolean, false)
             when exists (select 1 from do_cargo d where d.permissoes ? k.chave)
               then coalesce((select d.permissoes ->> k.chave from do_cargo d
                               where d.permissoes ? k.chave)::boolean, false)
             else false
           end as sim
      from chaves k
  )
  select a.aba,
         case
           -- Aba desligada para este cargo.
           when a.chave_aba is not null
                and not coalesce(bool_or(v.sim) filter (where v.peso is null), false)
             then -1
           else coalesce(max(v.peso) filter (where v.peso is not null and v.sim), -1)
         end
    from abas a
    join avaliadas v on v.aba = a.aba
   group by a.aba, a.chave_aba;
$function$;

comment on function public.fn_user_escopos_por_aba() is
  'Escopo (-1..3) de cada aba para o usuario logado, lendo o catalogo uma vez. Mesma regra de '
  'fn_user_tem aplicada em lote. Base de fn_user_escopo e fn_user_escopo_perfis. Ver 20260917140000.';

revoke all on function public.fn_user_escopos_por_aba() from public, anon, authenticated;

create or replace function public.fn_user_escopo(p_aba text)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  -- Aba desconhecida: -1. Melhor um numero impossivel do que um 0 que se
  -- confunde com "ve so os proprios".
  select coalesce(
    (select e.escopo from public.fn_user_escopos_por_aba() e where e.aba = p_aba),
    -1);
$function$;

create or replace function public.fn_user_escopo_perfis()
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(max(e.escopo), -1) from public.fn_user_escopos_por_aba() e;
$function$;

-- ============================================================================
-- 2. acordos_deduplicados sem varrer a tabela inteira
-- ============================================================================

create index if not exists idx_acordos_dedup_uuid
  on public.acordos ((case when acordo_grupo_id is null then id else acordo_grupo_id end),
                     numero_parcela desc nulls last, criado_em desc, id desc);

create or replace view public.acordos_deduplicados
with (security_invoker = true) as
select a.id,
       a.nome_cliente,
       a.nr_cliente,
       a.data_cadastro,
       a.vencimento,
       a.valor,
       a.tipo,
       a.parcelas,
       a.whatsapp,
       a.status,
       a.operador_id,
       a.observacoes,
       a.criado_em,
       a.atualizado_em,
       a.setor_id,
       a.instituicao,
       a.empresa_id,
       a.acordo_grupo_id,
       a.numero_parcela,
       a.tipo_receptivo,
       a.operador_vinculado_id,
       a.tipo_vinculo,
       a.vinculo_operador_id,
       a.vinculo_operador_nome,
       a.estado_uf,
       a.tag_ids
  from public.acordos a
 where a.id = (
   select b.id
     from public.acordos b
    where (case when b.acordo_grupo_id is null then b.id else b.acordo_grupo_id end)
        = (case when a.acordo_grupo_id is null then a.id else a.acordo_grupo_id end)
    order by b.numero_parcela desc nulls last, b.criado_em desc, b.id desc
    limit 1
 );

comment on view public.acordos_deduplicados is
  'Um acordo por grupo: a ultima parcela (numero_parcela, depois criado_em, depois id). '
  'Filtro e ordenacao descem ate acordos; a subconsulta usa idx_acordos_dedup_uuid. Ver 20260917140000.';

-- ============================================================================
-- 3. Memória de trabalho nas funções que iam para o disco
-- ============================================================================

do $work_mem$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_mestre_diretoria_setor', 'fn_mestre_diretoria_setores',
                         'fn_mestre_diretoria_visao_geral', 'fn_pp_relatorio',
                         'fn_mestre_resumo_grupos', 'fn_logs_resumo',
                         'fn_analitico_remocoes_guardadas')
  loop
    execute format('alter function %s set work_mem = %L', v_fn, '32MB');
    raise notice 'work_mem 32MB: %', v_fn;
  end loop;
end
$work_mem$;

commit;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
-- Tempo do escopo como administrador (antes: 621 ms):
--
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<id de administrador>"}', true);
--   explain analyze select public.fn_user_escopo_perfis();
--   rollback;
--
-- Plano da lista de acordos (antes: 601 ms como administrador) — espera-se
-- `idx_acordos_empresa_vencimento` com Limit e `idx_acordos_dedup_uuid` na
-- subconsulta:
--
--   explain analyze
--   select * from public.acordos_deduplicados
--    where empresa_id = '<uuid>' order by vencimento limit 60;
--
--   select p.oid::regprocedure, p.proconfig from pg_proc p
--    where p.proname like 'fn_mestre_diretoria%';
