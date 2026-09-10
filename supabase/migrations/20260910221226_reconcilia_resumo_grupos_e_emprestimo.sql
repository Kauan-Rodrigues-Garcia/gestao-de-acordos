-- ═══════════════════════════════════════════════════════════════════════════
-- Reconciliação: o que roda no banco passa a existir como arquivo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O problema que esta migration resolve, e ele não é de comportamento
--
-- `fn_mestre_resumo_grupos` e `fn_mestre_emprestimo_do_setor` foram aplicadas
-- pelo SQL editor do dashboard, e nenhum arquivo deste repositório as definia na
-- forma em que rodam. O último arquivo a tocar a primeira é
-- `20260904500000_mestre_59_destino_da_equipe.sql`, e ele está DEFASADO:
--
--   arquivo (24 colunas)          banco (28 colunas)
--   ─────────────────────         ──────────────────
--   —                             emprestado_para
--   —                             emprestado_pessoas
--   —                             colchao_fora
--   colchao_valor                 colchao_valor
--   (não chama conta_na_meta)     filtra tudo por fn_mestre_conta_na_meta
--
-- A segunda função nunca teve arquivo nenhum.
--
-- Um `supabase db reset` reconstruiria a versão de 24 colunas, e
-- `fn_mestre_comparar_setores` — que lê `g.colchao_fora` e `g.emprestado_para` —
-- quebraria. Pior: se quebrasse com `undefined` em vez de erro, `formatBRL`
-- transformaria em «R$ 0,00» e a tela mentiria calada. É o mesmo risco que
-- levou `fn_mestre_comparar_setores` a ser trazida para cá em 20260910200500.
--
-- ## O conteúdo é IDÊNTICO ao que já está no ar
--
-- Lido com `pg_get_functiondef` em 2026-09-10 e transcrito sem uma vírgula de
-- diferença. Aplicar esta migration num banco que já as tem é um no-op: o
-- `create or replace` grava o mesmo corpo.
--
-- Não é lugar de corrigir nada. Trazer o retrato e mudá-lo no mesmo passo
-- tornaria impossível revisar qual das duas coisas quebrou, se quebrar.
--
-- ## O que estas funções fazem, para quem chegar aqui primeiro
--
-- `fn_mestre_resumo_grupos` é a base de tudo no 59: uma linha por carteira, com
-- o que ela cobrou, o que contribuiu, o que emprestou e o que recebeu
-- emprestado. `fn_mestre_comparar_setores` a consome inteira.
--
-- `fn_mestre_emprestimo_do_setor` responde o outro lado do empréstimo: quanto a
-- gente DESTE setor cobrou em carteira alheia. As duas juntas são a razão de
-- `recebido_total` não ser só a soma da carteira.
--
-- ## `emprestada` é por PESSOA, apesar do nome
--
-- A marcação compara `operador_setor_id` com o setor da carteira, e conta
-- `distinct cobradora`. Não há equipe nenhuma na conta — o rótulo «equipe
-- emprestada» na tela é herança de quando se achava que era. Ver
-- `20260910230000`, que passou a listar as pessoas por nome.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ── Quanto a gente DESTE setor cobrou em carteira alheia ───────────────────

create or replace function public.fn_mestre_emprestimo_do_setor(
  p_empresa_id uuid,
  p_mes        text
)
returns table(setor_id uuid, valor numeric, pessoas bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d)
  select r.operador_setor_id, sum(r.recebido), count(distinct r.cobradora)::bigint
    from mestre_recebimentos r
    join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
    join mestre_grupos g
      on g.empresa_id = r.empresa_id and g.cod_grupo_filtro = r.cod_grupo_filtro
     and g.estado = 'vinculado' and g.setor_id is not null
    left join mestre_equipes me
      on me.empresa_id = r.empresa_id
     and me.cod_grupo_filtro = r.cod_grupo_filtro
     and me.nome_subgrupo = r.subgrupo_equipe
   where r.empresa_id = p_empresa_id
     and r.mes = (select d from ref)
     and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
     and r.operador_setor_id is not null
     and r.operador_setor_id <> g.setor_id
     and coalesce(me.destino, 'proprio') = 'proprio'
   group by r.operador_setor_id;
$function$;

comment on function public.fn_mestre_emprestimo_do_setor(uuid, text) is
  'Quanto a gente deste setor cobrou em carteira de outro. A marcacao e por '
  'PESSOA (operador_setor_id <> setor da carteira), nao por equipe.';

-- ── Uma linha por carteira: o que cobrou, contribuiu e emprestou ───────────

create or replace function public.fn_mestre_resumo_grupos(
  p_empresa_id uuid,
  p_mes        text
)
returns table(
  cod_grupo_filtro text, nome_no_relatorio text, nome_cadastrado text,
  setor_id uuid, setor_nome text, estado text, linhas bigint,
  recebido_proprio numeric, integral_proprio numeric, extra_proprio numeric,
  contrib_integral numeric, contrib_extra numeric,
  saiu_outro_setor numeric, saiu_somente_geral numeric,
  emprestado_para numeric, emprestado_pessoas bigint,
  recebido_total numeric,
  para_outros_integral numeric, para_outros_extra numeric, sem_destino numeric,
  colchao_valor numeric, colchao_fora numeric, atestado_valor numeric,
  equipes bigint, cobradoras bigint, dias bigint,
  primeira_aparicao date, ultima_aparicao date
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*, fn_mestre_conta_na_meta(r.colchao, r.dt_pgto) as conta
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
  ),
  nomes as (
    select distinct f.cod_grupo_filtro, f.nome_grupo_filtro
      from fatia f where f.nome_grupo_filtro <> ''
  ),
  resolvida as (
    select f.*, dn.destino_nome, n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe,
           gr.setor_id as setor_carteira
      from fatia f
      cross join lateral (
        select case
                 when f.nome_grupo_filtro <> ''
                  and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                 then substr(f.setor, length(f.nome_grupo_filtro) + 4)
               end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
      left join mestre_equipes me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = f.cod_grupo_filtro
       and me.nome_subgrupo = f.subgrupo_equipe
      left join mestre_grupos gr
        on gr.empresa_id = p_empresa_id
       and gr.cod_grupo_filtro = f.cod_grupo_filtro
       and gr.estado = 'vinculado'
  ),
  marcada as (
    select r.*,
           (r.conta
            and r.operador_setor_id is not null
            and r.setor_carteira is not null
            and r.operador_setor_id <> r.setor_carteira
            and r.destino_equipe = 'proprio') as emprestada
      from resolvida r
  ),
  propria as (
    select r.cod_grupo_filtro as cod,
           count(*) filter (where r.conta)                                     as linhas,
           sum(r.recebido) filter (where r.conta)                              as valor,
           sum(r.recebido) filter (where r.conta and lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where r.conta and lower(r.tipo) =  'extra') as extra,
           sum(r.recebido) filter (where r.colchao)                            as colchao,
           sum(r.recebido) filter (where not r.conta)                          as colchao_fora,
           sum(r.recebido) filter (where r.emprestada)                         as emprestado_para,
           count(distinct r.cobradora) filter (where r.emprestada)             as emprestado_pessoas,
           sum(r.recebido) filter (where r.conta and upper(r.subgrupo_equipe) = 'ATESTADOS|FERIAS') as atestado,
           sum(r.recebido) filter (where r.conta and r.destino_nome is not null and r.cod_destino is null) as sem_destino,
           sum(r.recebido) filter (where r.conta and r.destino_equipe = 'outro_setor')   as saiu_outro,
           sum(r.recebido) filter (where r.conta and r.destino_equipe = 'somente_geral') as saiu_geral,
           sum(r.recebido) filter (where r.conta and r.cod_destino is not null
                                     and r.cod_destino <> r.cod_grupo_filtro
                                     and lower(r.tipo) <> 'extra')             as p_outros_integral,
           sum(r.recebido) filter (where r.conta and r.cod_destino is not null
                                     and r.cod_destino <> r.cod_grupo_filtro
                                     and lower(r.tipo) =  'extra')             as p_outros_extra,
           count(distinct r.subgrupo_equipe) filter (where r.conta and fn_mestre_e_equipe(r.subgrupo_equipe)) as equipes,
           count(distinct r.cobradora) filter (where r.conta)                  as cobradoras,
           count(distinct r.dt_pgto)   filter (where r.conta)                  as dias
      from marcada r
     group by r.cod_grupo_filtro
  ),
  contribuida as (
    select r.cod_destino as cod,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra') as extra
      from marcada r
     where r.conta and r.cod_destino is not null and r.cod_destino <> r.cod_grupo_filtro
     group by r.cod_destino
  ),
  chaves as (
    select cod from propria
    union select cod from contribuida
    union select g.cod_grupo_filtro from mestre_grupos g where g.empresa_id = p_empresa_id
  ),
  rotulo as (
    select f.cod_grupo_filtro as cod,
           (array_agg(f.nome_grupo_filtro order by f.id))[1] as nome
      from fatia f group by f.cod_grupo_filtro
  )
  select
    k.cod,
    coalesce(ro.nome, ''),
    coalesce(g.nome_grupo_filtro, ''),
    g.setor_id,
    s.nome,
    coalesce(g.estado, 'novo'),
    coalesce(p.linhas, 0),
    coalesce(p.valor, 0),
    coalesce(p.integral, 0),
    coalesce(p.extra, 0),
    coalesce(c.integral, 0),
    coalesce(c.extra, 0),
    coalesce(p.saiu_outro, 0),
    coalesce(p.saiu_geral, 0),
    coalesce(p.emprestado_para, 0),
    coalesce(p.emprestado_pessoas, 0),
    coalesce(p.valor, 0) + coalesce(c.integral, 0)
      - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0)
      - coalesce(p.emprestado_para, 0),
    coalesce(p.p_outros_integral, 0),
    coalesce(p.p_outros_extra, 0),
    coalesce(p.sem_destino, 0),
    coalesce(p.colchao, 0),
    coalesce(p.colchao_fora, 0),
    coalesce(p.atestado, 0),
    coalesce(p.equipes, 0),
    coalesce(p.cobradoras, 0),
    coalesce(p.dias, 0),
    g.primeira_aparicao,
    g.ultima_aparicao
  from chaves k
  left join propria     p  on p.cod  = k.cod
  left join contribuida c  on c.cod  = k.cod
  left join rotulo      ro on ro.cod = k.cod
  left join mestre_grupos g on g.empresa_id = p_empresa_id and g.cod_grupo_filtro = k.cod
  left join setores     s  on s.id = g.setor_id
  where fn_user_is_super_admin()
  order by (coalesce(p.valor, 0) + coalesce(c.integral, 0)
            - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0)
            - coalesce(p.emprestado_para, 0)) desc, k.cod;
$function$;

comment on function public.fn_mestre_resumo_grupos(uuid, text) is
  'Uma linha por carteira do 59: cobrado, contribuido, emprestado e o total do '
  'setor. Base de fn_mestre_comparar_setores. Retrato do que rodava no banco em '
  '2026-09-10, trazido para o repositorio sem alteracao.';

-- ── Prova ──────────────────────────────────────────────────────────────────
--
-- As colunas que `fn_mestre_comparar_setores` consome. Se a assinatura voltar a
-- encolher, a comparação quebra — e é ela que a tela desenha.

do $prova$
declare
  v_faltando text;
begin
  select string_agg(c, ', ') into v_faltando
    from unnest(array['emprestado_para','emprestado_pessoas','colchao_fora',
                      'recebido_proprio','contrib_integral','recebido_total']) as c
   where c not in (
     select unnest(p.proargnames)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_mestre_resumo_grupos');

  if v_faltando is not null then
    raise exception 'fn_mestre_resumo_grupos ficou sem as colunas: %', v_faltando;
  end if;

  if to_regprocedure('public.fn_mestre_emprestimo_do_setor(uuid, text)') is null then
    raise exception 'fn_mestre_emprestimo_do_setor nao existe.';
  end if;
end
$prova$;

commit;
