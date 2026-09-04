-- ============================================================================
-- Relatório 59: a equipe pode sair do setor, e ir para outro ou para nenhum
-- ============================================================================
--
-- O ERP põe a equipe no grupo de quem exportou o relatório, e nem sempre é ali
-- que ela deve contar. `DIGITAL BRUNNO` chega no Play 5 com R$ 148.097,32 sem
-- ser Play 5. Até aqui não havia como dizer isso; agora há.
--
--   proprio        fica no setor do grupo. É o padrão, e ninguém muda nada.
--   outro_setor    SAI do grupo e conta no setor escolhido.
--   somente_geral  SAI do grupo e não conta em setor nenhum — só no total da
--                  empresa. É o caso do que existe, é dinheiro de verdade, e
--                  não é de ninguém em particular.
--
-- ## Por que o destino é um SETOR e não um grupo
--
-- Quem move pensa em setor: "isso é do Digital". E o Digital pode não ter grupo
-- nenhum no relatório — é justamente por isso que a equipe está no lugar
-- errado. Amarrar o destino a um grupo tornaria impossível o caso mais comum.
--
-- A consequência é que o total de um SETOR deixa de ser a soma dos grupos
-- ligados a ele: entra o que veio de fora e sai o que foi embora. Por isso
-- existe `fn_mestre_resumo_setores`, e é ela que responde «quanto o setor
-- recebeu».
-- ============================================================================

alter table public.mestre_equipes
  add column if not exists destino text not null default 'proprio',
  add column if not exists destino_setor_id uuid references public.setores(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mestre_equipes_destino_check') then
    alter table public.mestre_equipes add constraint mestre_equipes_destino_check
      check (destino in ('proprio', 'outro_setor', 'somente_geral'));
  end if;
  -- Estado e destino não podem discordar: `outro_setor` sem setor seria dinheiro
  -- que a tela promete ter movido e que não foi para lugar nenhum.
  if not exists (select 1 from pg_constraint where conname = 'mestre_equipes_destino_coerente') then
    alter table public.mestre_equipes add constraint mestre_equipes_destino_coerente
      check (
        (destino = 'outro_setor' and destino_setor_id is not null)
        or (destino <> 'outro_setor' and destino_setor_id is null)
      );
  end if;
end $$;

comment on column public.mestre_equipes.destino is
  'Onde o recebimento desta equipe conta: `proprio` (setor do grupo), `outro_setor` ou `somente_geral` (nenhum setor).';

create or replace function public.fn_mestre_destino_equipe(
  p_empresa_id uuid,
  p_cod        text,
  p_subgrupo   text,
  p_destino    text,
  p_setor_id   uuid default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_antes record;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Apenas super_admin pode mover o recebimento de uma equipe.';
  end if;
  if p_destino not in ('proprio', 'outro_setor', 'somente_geral') then
    raise exception 'Destino inválido: %.', p_destino;
  end if;
  if p_destino = 'outro_setor' and p_setor_id is null then
    raise exception 'Mover para outro setor exige escolher o setor.';
  end if;
  if p_setor_id is not null and not exists (
       select 1 from setores s where s.id = p_setor_id and s.empresa_id = p_empresa_id) then
    raise exception 'O setor não pertence a esta empresa.';
  end if;

  select * into v_antes from mestre_equipes
   where empresa_id = p_empresa_id and cod_grupo_filtro = p_cod and nome_subgrupo = p_subgrupo;
  if v_antes is null then
    raise exception 'A equipe "%" ainda não apareceu em nenhuma carga deste grupo.', p_subgrupo;
  end if;

  update mestre_equipes
     set destino          = p_destino,
         destino_setor_id = case when p_destino = 'outro_setor' then p_setor_id else null end,
         atualizado_em    = now()
   where empresa_id = p_empresa_id and cod_grupo_filtro = p_cod and nome_subgrupo = p_subgrupo;

  insert into mestre_eventos (empresa_id, tipo, cod_grupo_filtro, rotulo, detalhes, usuario_id)
  values (p_empresa_id,
          case when p_destino = 'proprio' then 'vinculo_removido' else 'vinculo_alterado' end,
          p_cod, p_subgrupo,
          jsonb_build_object(
            'alvo', 'destino_equipe',
            'antes',  jsonb_build_object('destino', v_antes.destino, 'setor_id', v_antes.destino_setor_id),
            'depois', jsonb_build_object('destino', p_destino, 'setor_id', p_setor_id)),
          auth.uid());
end;
$$;

comment on function public.fn_mestre_destino_equipe(uuid, text, text, text, uuid) is
  'Move o recebimento de uma equipe para fora do setor do grupo: para outro setor, ou para nenhum.';

-- ── Resumo por grupo: agora com o que saiu ──────────────────────────────────

drop function if exists public.fn_mestre_resumo_grupos(uuid, text);

create or replace function public.fn_mestre_resumo_grupos(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  cod_grupo_filtro  text,
  nome_no_relatorio text,
  nome_cadastrado   text,
  setor_id          uuid,
  setor_nome        text,
  estado            text,
  linhas            bigint,
  recebido_proprio  numeric,
  integral_proprio  numeric,
  extra_proprio     numeric,
  contrib_integral  numeric,
  contrib_extra     numeric,
  -- Equipes deste grupo movidas para fora. Saem do total dele.
  saiu_outro_setor  numeric,
  saiu_somente_geral numeric,
  recebido_total    numeric,
  para_outros_integral numeric,
  para_outros_extra    numeric,
  sem_destino       numeric,
  colchao_valor     numeric,
  atestado_valor    numeric,
  equipes           bigint,
  cobradoras        bigint,
  dias              bigint,
  primeira_aparicao date,
  ultima_aparicao   date
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*
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
           coalesce(me.destino, 'proprio') as destino_equipe
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
  ),
  propria as (
    select r.cod_grupo_filtro as cod,
           count(*)                                                as linhas,
           sum(r.recebido)                                          as valor,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra')  as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra')  as extra,
           sum(r.recebido) filter (where r.colchao)                 as colchao,
           sum(r.recebido) filter (where upper(r.subgrupo_equipe) = 'ATESTADOS|FERIAS') as atestado,
           sum(r.recebido) filter (where r.destino_nome is not null and r.cod_destino is null) as sem_destino,
           sum(r.recebido) filter (where r.destino_equipe = 'outro_setor')   as saiu_outro,
           sum(r.recebido) filter (where r.destino_equipe = 'somente_geral') as saiu_geral,
           sum(r.recebido) filter (where r.cod_destino is not null and r.cod_destino <> r.cod_grupo_filtro
                                     and lower(r.tipo) <> 'extra')  as p_outros_integral,
           sum(r.recebido) filter (where r.cod_destino is not null and r.cod_destino <> r.cod_grupo_filtro
                                     and lower(r.tipo) =  'extra')  as p_outros_extra,
           count(distinct r.subgrupo_equipe) filter (where fn_mestre_e_equipe(r.subgrupo_equipe)) as equipes,
           count(distinct r.cobradora)                              as cobradoras,
           count(distinct r.dt_pgto)                                as dias
      from resolvida r
     group by r.cod_grupo_filtro
  ),
  contribuida as (
    select r.cod_destino as cod,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra') as extra
      from resolvida r
     where r.cod_destino is not null and r.cod_destino <> r.cod_grupo_filtro
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
    coalesce(p.valor, 0) + coalesce(c.integral, 0)
      - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0),
    coalesce(p.p_outros_integral, 0),
    coalesce(p.p_outros_extra, 0),
    coalesce(p.sem_destino, 0),
    coalesce(p.colchao, 0),
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
            - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0)) desc, k.cod;
$$;

comment on function public.fn_mestre_resumo_grupos(uuid, text) is
  'Um card por grupo do 59. Total = próprio + Integral recebido − o que as equipes movidas levaram embora.';

-- ── Resumo por SETOR: o número final ────────────────────────────────────────
--
-- O total de um setor deixou de ser a soma dos grupos ligados a ele: uma equipe
-- movida sai de um e entra em outro, e o destino pode ser um setor sem grupo
-- nenhum. É esta função que responde «quanto o setor recebeu».

create or replace function public.fn_mestre_resumo_setores(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  setor_id      uuid,
  setor_nome    text,
  -- Soma dos grupos ligados a este setor, já sem as equipes que saíram.
  dos_grupos    numeric,
  -- Equipes de outros grupos movidas PARA este setor.
  recebido_movido numeric,
  total         numeric,
  grupos        bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  g as (
    select x.setor_id, sum(x.recebido_total) as valor, count(*)::bigint as grupos
      from fn_mestre_resumo_grupos(p_empresa_id, p_mes) x
     where x.setor_id is not null and x.estado = 'vinculado'
     group by x.setor_id
  ),
  movido as (
    select me.destino_setor_id as setor_id, sum(r.recebido) as valor
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and me.destino = 'outro_setor'
       and me.destino_setor_id is not null
     group by me.destino_setor_id
  )
  select s.id, s.nome,
         coalesce(g.valor, 0),
         coalesce(m.valor, 0),
         coalesce(g.valor, 0) + coalesce(m.valor, 0),
         coalesce(g.grupos, 0)
    from setores s
    left join g on g.setor_id = s.id
    left join movido m on m.setor_id = s.id
   where s.empresa_id = p_empresa_id
     and fn_user_is_super_admin()
     and (g.valor is not null or m.valor is not null)
   order by 5 desc, s.nome;
$$;

comment on function public.fn_mestre_resumo_setores(uuid, text) is
  'Quanto cada setor recebeu de verdade: os grupos ligados a ele, menos as equipes que saíram, mais as que vieram.';

-- ── A comparação passa a usar o número do SETOR ─────────────────────────────

drop function if exists public.fn_mestre_comparar_setores(uuid, text);

create or replace function public.fn_mestre_comparar_setores(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  cod_grupo_filtro  text,
  rotulo            text,
  setor_id          uuid,
  setor_nome        text,
  estado            text,
  mestre_total      numeric,
  mestre_proprio    numeric,
  mestre_contribuido numeric,
  sistema_total     numeric,
  sistema_linhas    bigint,
  diferenca         numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  m as (
    select g.cod_grupo_filtro, g.nome_no_relatorio, g.nome_cadastrado,
           g.setor_id, g.setor_nome, g.estado,
           g.recebido_total, g.recebido_proprio, g.contrib_integral
      from fn_mestre_resumo_grupos(p_empresa_id, p_mes) g
  ),
  movido as (
    select me.destino_setor_id as setor_id, sum(r.recebido) as valor
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and me.destino = 'outro_setor'
       and me.destino_setor_id is not null
     group by me.destino_setor_id
  ),
  -- Equipes movidas PARA um setor entram na linha de UM grupo desse setor — o
  -- de maior recebimento. Com dois grupos no mesmo setor, dividir seria
  -- inventar critério; o número honesto do setor vive em
  -- `fn_mestre_resumo_setores`, e aqui a comparação é sempre por grupo.
  principal as (
    select distinct on (m.setor_id) m.setor_id, m.cod_grupo_filtro
      from m where m.setor_id is not null and m.estado = 'vinculado'
     order by m.setor_id, m.recebido_total desc, m.cod_grupo_filtro
  ),
  sis as (
    select a.setor_id,
           sum(a.valor_recebido) as total,
           count(*)::bigint      as linhas
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.data_pagamento >= (select d from ref)
       and a.data_pagamento <  ((select d from ref) + interval '1 month')
       and a.setor_id is not null
     group by a.setor_id
  )
  select
    m.cod_grupo_filtro,
    coalesce(nullif(m.nome_no_relatorio, ''), m.nome_cadastrado),
    m.setor_id,
    m.setor_nome,
    m.estado,
    m.recebido_total + coalesce(case when pr.cod_grupo_filtro = m.cod_grupo_filtro
                                     then mv.valor end, 0),
    m.recebido_proprio,
    m.contrib_integral,
    coalesce(s.total, 0),
    coalesce(s.linhas, 0),
    m.recebido_total + coalesce(case when pr.cod_grupo_filtro = m.cod_grupo_filtro
                                     then mv.valor end, 0) - coalesce(s.total, 0)
  from m
  left join sis s   on s.setor_id  = m.setor_id
  left join movido mv on mv.setor_id = m.setor_id
  left join principal pr on pr.setor_id = m.setor_id
  where fn_user_is_super_admin()
  order by 6 desc, m.cod_grupo_filtro;
$$;

comment on function public.fn_mestre_comparar_setores(uuid, text) is
  'Fase 2: o total do mestre contra o de `analitico_recebimentos`, por setor vinculado. Só leitura.';

-- ── As equipes agora devolvem o destino ─────────────────────────────────────

drop function if exists public.fn_mestre_resumo_equipes(uuid, text, text);

create or replace function public.fn_mestre_resumo_equipes(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  nome_subgrupo     text,
  e_equipe          boolean,
  linhas            bigint,
  recebido          numeric,
  integral_valor    numeric,
  extra_valor       numeric,
  cobradoras        bigint,
  equipe_id         uuid,
  equipe_nome       text,
  estado            text,
  destino           text,
  destino_setor_id  uuid,
  destino_setor_nome text,
  primeira_aparicao date,
  ultima_aparicao   date
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ref as (select ((p_mes || '-01')::date) as d),
  agg as (
    select r.subgrupo_equipe as nome,
           count(*)::bigint as linhas,
           sum(r.recebido) as recebido,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra') as extra,
           count(distinct r.cobradora)::bigint as cobradoras
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and r.cod_grupo_filtro = p_cod
     group by r.subgrupo_equipe
  )
  select
    a.nome,
    fn_mestre_e_equipe(a.nome),
    a.linhas,
    a.recebido,
    coalesce(a.integral, 0),
    coalesce(a.extra, 0),
    a.cobradoras,
    e.equipe_id,
    eq.nome,
    coalesce(e.estado, 'novo'),
    coalesce(e.destino, 'proprio'),
    e.destino_setor_id,
    ds.nome,
    e.primeira_aparicao,
    e.ultima_aparicao
  from agg a
  left join mestre_equipes e
    on e.empresa_id = p_empresa_id and e.cod_grupo_filtro = p_cod and e.nome_subgrupo = a.nome
  left join equipes eq on eq.id = e.equipe_id
  left join setores ds on ds.id = e.destino_setor_id
  where fn_user_is_super_admin() and a.recebido <> 0
  order by a.recebido desc, a.nome;
$$;

comment on function public.fn_mestre_resumo_equipes(uuid, text, text) is
  'Equipes de um grupo no mês, só as que têm valor, com o vínculo e o destino do recebimento.';

grant execute on function public.fn_mestre_destino_equipe(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.fn_mestre_resumo_grupos(uuid, text)                    to authenticated;
grant execute on function public.fn_mestre_resumo_setores(uuid, text)                   to authenticated;
grant execute on function public.fn_mestre_comparar_setores(uuid, text)                 to authenticated;
grant execute on function public.fn_mestre_resumo_equipes(uuid, text, text)             to authenticated;
