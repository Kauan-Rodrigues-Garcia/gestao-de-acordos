-- ============================================================================
-- Relatório 59: descer do setor até o NR
-- ============================================================================
--
-- Setor → equipe → operador → linhas do acordo. Quatro níveis de leitura, e
-- nenhum deles escreve nada.
--
-- ## O vínculo do operador é AUTOMÁTICO, e não grava
--
-- `Cobradora` do relatório casa com `perfis.usuario` em minúsculo — a mesma
-- regra de `resolverOperadores`, que é quem faz esse casamento na importação do
-- 58. Aqui ele é só CALCULADO: o card mostra quem casou e quem não, e nada é
-- gravado.
--
-- Gravar seria fácil e é justamente o que não se deve fazer agora: enquanto o
-- mestre está em conferência, um vínculo automático que altera cadastro mudaria
-- dado de gente com base num número que ainda pode mudar. Quando o 59 virar
-- fonte, a decisão de gravar é de quem manda — e aí ela é explícita.
--
-- Medido em agosto/2026, Play 5: `EQUIPE LAYANE` casou 8 de 8, `EQUIPE TAUANA`
-- 9 de 9, e `COFEN MARILIA STEPHANIE LAYSA` 0 de 3 — esta última é da PaguePlay,
-- que não tem cadastro nesta empresa.
-- ============================================================================

create or replace function public.fn_mestre_operadores_da_equipe(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text,
  p_subgrupo   text
) returns table (
  cobradora      text,
  linhas         bigint,
  recebido       numeric,
  integral_valor numeric,
  extra_valor    numeric,
  colchao_valor  numeric,
  nrs            bigint,
  dias           bigint,
  -- Casamento automático com o cadastro. Nulo = não achou.
  perfil_id      uuid,
  perfil_nome    text,
  perfil_ativo   boolean,
  equipe_atual   text,
  setor_atual    text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  agg as (
    select r.cobradora,
           count(*)::bigint                                         as linhas,
           sum(r.recebido)                                          as recebido,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra')  as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra')  as extra,
           sum(r.recebido) filter (where r.colchao)                 as colchao,
           count(distinct r.nr_documento)::bigint                   as nrs,
           count(distinct r.dt_pgto)::bigint                        as dias
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and r.cod_grupo_filtro = p_cod
       and r.subgrupo_equipe = p_subgrupo
     group by r.cobradora
  )
  select
    a.cobradora, a.linhas, a.recebido,
    coalesce(a.integral, 0), coalesce(a.extra, 0), coalesce(a.colchao, 0),
    a.nrs, a.dias,
    p.id, p.nome, p.ativo, eq.nome, s.nome
  from agg a
  left join perfis p
    on p.empresa_id = p_empresa_id and lower(p.usuario) = lower(a.cobradora)
  left join equipes eq on eq.id = p.equipe_id
  left join setores s  on s.id = p.setor_id
  where fn_user_is_super_admin() and a.recebido <> 0
  order by a.recebido desc, a.cobradora;
$$;

comment on function public.fn_mestre_operadores_da_equipe(uuid, text, text, text) is
  'Operadores de uma equipe do relatório, com o casamento automático com `perfis` pelo login. Só leitura — nada é gravado.';

create or replace function public.fn_mestre_linhas_do_operador(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text,
  p_cobradora  text,
  p_subgrupo   text default null,
  p_limite     integer default 300
) returns table (
  nr_documento text,
  parcela      text,
  titulo       text,
  cliente      text,
  cod_cli      text,
  empresa_erp  text,
  tp_doc       text,
  tipo_venda   text,
  dt_lig       date,
  dt_pgto      date,
  dias_atraso  integer,
  recebido     numeric,
  tipo         text,
  colchao      boolean,
  setor_carimbado text,
  linha_num    integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d)
  select r.nr_documento, r.parcela, r.titulo, r.cliente, r.cod_cli, r.empresa_erp,
         r.tp_doc, r.tipo_venda, r.dt_lig, r.dt_pgto, r.dias_atraso,
         r.recebido, r.tipo, r.colchao, r.setor, r.linha_num
    from mestre_recebimentos r
    join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
   where r.empresa_id = p_empresa_id
     and r.mes = (select d from ref)
     and r.cod_grupo_filtro = p_cod
     and lower(r.cobradora) = lower(p_cobradora)
     and (p_subgrupo is null or r.subgrupo_equipe = p_subgrupo)
     and fn_user_is_super_admin()
   order by r.dt_pgto desc, r.recebido desc, r.nr_documento
   -- Teto para a tela não travar num operador com milhares de linhas. O total
   -- verdadeiro está no card do operador, que agrega sem teto — e a tela avisa
   -- quando a lista foi cortada, para ninguém somar a tela e achar que falta.
   limit greatest(1, least(coalesce(p_limite, 300), 2000));
$$;

comment on function public.fn_mestre_linhas_do_operador(uuid, text, text, text, text, integer) is
  'As linhas do relatório de um operador: NR, parcela, cliente, forma, data e valor. Leitura pura, com teto de linhas.';

-- ── Quantos operadores da equipe casaram com o cadastro ─────────────────────
--
-- O card da equipe precisa do número sem baixar a lista inteira de cada uma.

create or replace function public.fn_mestre_vinculo_operadores(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  nome_subgrupo text,
  operadores    bigint,
  vinculados    bigint,
  sem_cadastro  bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  pessoas as (
    select distinct r.subgrupo_equipe, r.cobradora
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and r.cod_grupo_filtro = p_cod
  )
  select p.subgrupo_equipe,
         count(*)::bigint,
         count(pf.id)::bigint,
         count(*) filter (where pf.id is null)::bigint
    from pessoas p
    left join perfis pf
      on pf.empresa_id = p_empresa_id and lower(pf.usuario) = lower(p.cobradora)
   where fn_user_is_super_admin()
   group by p.subgrupo_equipe;
$$;

grant execute on function public.fn_mestre_operadores_da_equipe(uuid, text, text, text)              to authenticated;
grant execute on function public.fn_mestre_linhas_do_operador(uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.fn_mestre_vinculo_operadores(uuid, text, text)                      to authenticated;
