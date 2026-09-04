-- ============================================================================
-- Relatório 59: o receptivo soma pelo INTEGRAL, e o Extra só se especifica
-- ============================================================================
--
-- ## O modelo que a migration anterior errou
--
-- `20260904200000` tratava toda linha do receptivo carimbada para outro setor
-- como dinheiro a TRANSFERIR: somava no destino e tirava do receptivo, deixando
-- o receptivo com R$ 100.459,73 de R$ 2.834.048,37. Está errado, e a regra do
-- negócio é outra.
--
-- Um pagamento pode ter DOIS operadores: um direto e um extra. Quando um deles
-- é do receptivo, o ERP emite a mesma cobrança duas vezes — como `Integral` na
-- perna de quem cobrou direto, e como `Extra` na perna do receptivo. O dinheiro
-- já está contado nos dois relatórios de propósito: é rateio de comissão, não
-- transferência. Nada a somar, nada a tirar; só a especificar.
--
-- ## A regra correta
--
--   O receptivo conta o PRÓPRIO TOTAL, inteiro. Nada sai dele.
--
--   O que entra num setor vindo do receptivo é SÓ o `Integral` que o receptivo
--   cobrou para aquele setor — esse é o único que não está no relatório do
--   setor.
--
--   O `Extra` do receptivo carimbado para um setor NÃO soma nesse setor: ele é
--   a segunda perna de um pagamento que o setor já tem como direto.
--
-- ## A prova, medida em 04/09/2026 sobre agosto (Play 5)
--
--   Integral do receptivo para o Play 5   221 linhas · R$ 38.656,52
--     dessas, já no relatório do Play 5:  0 de 221        ← por isso SOMA
--   Extra do receptivo para o Play 5      425 linhas · R$ 80.107,40
--     dessas, já no relatório do Play 5:  248, casando por
--                                         NR+parcela+data+valor  ← por isso NÃO soma
--
--   Play 5 = 361.768,85 (próprio) + 38.656,52 (integral do receptivo)
--          = R$ 400.425,37
--
-- ## O que muda no invariante, e por que isso está certo
--
-- A migration anterior garantia que somar o total de todos os grupos devolvia o
-- total do arquivo. Isso deixa de valer, DE PROPÓSITO: o `Extra` é a mesma
-- cobrança representada em duas pernas, e as duas contam. A soma dos setores
-- passa a ser MAIOR que o arquivo, e a diferença é exatamente o `Extra`
-- carimbado — que a tela mostra em número próprio, para ninguém confundir com
-- erro.
-- ============================================================================

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
  -- Tudo o que o grupo cobrou. Nada é subtraído daqui.
  recebido_proprio  numeric,
  integral_proprio  numeric,
  extra_proprio     numeric,
  -- Integral que OUTRO grupo cobrou para este. Único que soma.
  contrib_integral  numeric,
  -- Extra que outro grupo cobrou para este. NÃO soma — já está no próprio.
  contrib_extra     numeric,
  -- recebido_proprio + contrib_integral. É o número do setor.
  recebido_total    numeric,
  -- Deste grupo, carimbado para outros. Informativo: continua no total dele.
  para_outros_integral numeric,
  para_outros_extra    numeric,
  -- Composto cujo destino não casou com grupo nenhum.
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
  -- Nome → código, tirado do PRÓPRIO lote: é lá que a correspondência 1-para-1
  -- vale. `mestre_grupos` traria o último nome visto, que pode ser de outra carga.
  nomes as (
    select distinct f.cod_grupo_filtro, f.nome_grupo_filtro
      from fatia f where f.nome_grupo_filtro <> ''
  ),
  resolvida as (
    select f.*, dn.destino_nome, n.cod_grupo_filtro as cod_destino
      from fatia f
      cross join lateral (
        select case
                 when f.nome_grupo_filtro <> ''
                  and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                 then substr(f.setor, length(f.nome_grupo_filtro) + 4)
               end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
  ),
  -- O grupo conta TUDO o que cobrou. O carimbo de destino não tira nada daqui.
  propria as (
    select r.cod_grupo_filtro as cod,
           count(*)                                                as linhas,
           sum(r.recebido)                                          as valor,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra')  as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra')  as extra,
           sum(r.recebido) filter (where r.colchao)                 as colchao,
           sum(r.recebido) filter (where upper(r.subgrupo_equipe) = 'ATESTADOS|FERIAS') as atestado,
           sum(r.recebido) filter (where r.destino_nome is not null and r.cod_destino is null) as sem_destino,
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
    coalesce(p.valor, 0) + coalesce(c.integral, 0),
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
  order by (coalesce(p.valor, 0) + coalesce(c.integral, 0)) desc, k.cod;
$$;

comment on function public.fn_mestre_resumo_grupos(uuid, text) is
  'Um card por grupo do 59. O grupo conta TUDO o que cobrou; do receptivo entra só o Integral carimbado para ele. O Extra carimbado é informativo — é a segunda perna de um pagamento que o setor já tem.';

-- ── De onde vem o dinheiro deste setor ──────────────────────────────────────

drop function if exists public.fn_mestre_origens_do_grupo(uuid, text, text);

create or replace function public.fn_mestre_origens_do_grupo(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  origem     text,     -- 'proprio' | 'contribuicao' | 'para_outro' | 'sem_destino'
  cod_outro  text,
  rotulo     text,
  tipo       text,     -- 'Integral' | 'Extra'
  -- Esta linha entra no total do setor? O Extra vindo de fora não entra.
  soma       boolean,
  linhas     bigint,
  valor      numeric
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
    select f.*, dn.destino_nome, n.cod_grupo_filtro as cod_destino
      from fatia f
      cross join lateral (
        select case
                 when f.nome_grupo_filtro <> ''
                  and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                 then substr(f.setor, length(f.nome_grupo_filtro) + 4)
               end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
  )
  select origem, cod_outro, rotulo, tipo, soma, linhas, valor from (
    -- Tudo o que o grupo cobrou, separado em direto e extra. Soma inteiro.
    select 'proprio'::text as origem, null::text as cod_outro,
           max(r.nome_grupo_filtro) as rotulo,
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end as tipo,
           true as soma,
           count(*)::bigint as linhas, sum(r.recebido) as valor
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and not (r.destino_nome is not null and r.cod_destino is null)
     group by 4

    union all
    -- Composto que não achou destino. Fica à vista para alguém decidir.
    select 'sem_destino', null, max(r.destino_nome),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           true, count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and r.destino_nome is not null and r.cod_destino is null
     group by r.destino_nome, 4

    union all
    -- Vindo de outro grupo. Integral SOMA (o setor não tem essa linha);
    -- Extra NÃO soma (é a segunda perna de um pagamento que o setor já tem).
    select 'contribuicao', r.cod_grupo_filtro, max(r.nome_grupo_filtro),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           lower(r.tipo) <> 'extra',
           count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_destino = p_cod and r.cod_grupo_filtro <> p_cod
     -- 5 é a coluna `soma`, que deriva de `tipo` e precisa entrar no group by.
     group by r.cod_grupo_filtro, 4, 5

    union all
    -- Deste grupo, carimbado para outro. Informativo: continua no total daqui.
    select 'para_outro', r.cod_destino, max(r.destino_nome),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           false, count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and r.cod_destino is not null and r.cod_destino <> p_cod
     group by r.cod_destino, 4
  ) x
  where fn_user_is_super_admin() and x.valor <> 0
  order by
    case x.origem when 'proprio' then 1 when 'contribuicao' then 2
                  when 'sem_destino' then 3 else 4 end,
    x.soma desc, x.valor desc;
$$;

comment on function public.fn_mestre_origens_do_grupo(uuid, text, text) is
  'A composição do recebimento de um grupo. `soma` diz se a linha entra no total — o Extra vindo de fora não entra, porque o setor já o tem como direto.';

-- ── A comparação usa o total novo ───────────────────────────────────────────

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
    m.recebido_total,
    m.recebido_proprio,
    m.contrib_integral,
    coalesce(s.total, 0),
    coalesce(s.linhas, 0),
    m.recebido_total - coalesce(s.total, 0)
  from m
  left join sis s on s.setor_id = m.setor_id
  where fn_user_is_super_admin()
  order by m.recebido_total desc, m.cod_grupo_filtro;
$$;

comment on function public.fn_mestre_comparar_setores(uuid, text) is
  'Fase 2: o total do mestre contra o de `analitico_recebimentos`, por setor vinculado. Só leitura.';

grant execute on function public.fn_mestre_resumo_grupos(uuid, text)          to authenticated;
grant execute on function public.fn_mestre_origens_do_grupo(uuid, text, text) to authenticated;
grant execute on function public.fn_mestre_comparar_setores(uuid, text)       to authenticated;
