-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4: conferência e pendências passam a honrar o destino do subgrupo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- As duas funções escritas hoje (`20260914005101` e `20260914010454`) nasceram
-- com o mesmo defeito das antigas: copiaram o filtro `<> 'somente_geral'` sem a
-- terceira via. Ver `20260914012331` para a armadilha inteira.
--
-- Em `fn_mestre_divergencias` a troca é estrutural — dois filtros viram um:
--
--   antes:  join ... and g.setor_id is not null
--           where ... and coalesce(me.destino,'proprio') <> 'somente_geral'
--   depois: where ... and fn_mestre_setor_resolvido(...) is not null
--
-- O helper devolve nulo nos dois casos que os filtros antigos barravam
-- (carteira sem vínculo e `somente_geral`), então a guarda única cobre os dois.
-- Conferido em setembro/2026: 9.519 grupos e R$ 3.622.488,42 dos dois lados,
-- zero linhas só num deles.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_divergencias(
  p_empresa_id uuid, p_mes text, p_setor_id uuid default null,
  p_cobradora text default null, p_classe text default null,
  p_limite integer default 300
)
returns table(
  setor_id uuid, setor_nome text, cobradora text, operador_id uuid,
  operador_nome text, nr_documento text, dia date, valor_59 numeric,
  valor_58 numeric, delta numeric, situacao text, classe text, ultimo_dia_58 date
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (
    select ((p_mes || '-01')::date) as d,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  ate_onde as (
    select x.setor_id, max(x.data_pagamento) as ultimo_dia
      from analitico_recebimentos x
     where x.empresa_id = p_empresa_id
       and x.mes_referencia = (select d from ref)
       and x.setor_id is not null
     group by 1
  ),
  lado59 as (
    -- O setor vem de `fn_mestre_setor_resolvido`, nao de `g.setor_id` cru: o
    -- subgrupo pode ter sido mandado para outro setor de proposito, e nesse
    -- caso e la que a linha conta. O guarda `is not null` substitui o antigo
    -- `g.setor_id is not null` do join, e cobre os dois casos de uma vez —
    -- carteira sem vinculo e subgrupo sem destino.
    select fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) as setor_id,
           upper(btrim(r.cobradora)) as cobradora,
           r.nr_documento            as nr,
           (array_agg(distinct r.operador_id) filter (where r.operador_id is not null))[1] as operador_id,
           sum(r.recebido) as valor,
           max(r.dt_pgto)  as dia
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g
        on g.empresa_id = r.empresa_id
       and g.cod_grupo_filtro = r.cod_grupo_filtro
       and g.estado = 'vinculado'
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) is not null
       and coalesce(r.nr_documento, '') <> ''
       and btrim(r.cobradora) <> ''
     group by 1, 2, 3
  ),
  lado58 as (
    select x.setor_id,
           upper(btrim(x.operador_usuario)) as cobradora,
           x.codigo as nr,
           (array_agg(distinct x.operador_id) filter (where x.operador_id is not null))[1] as operador_id,
           sum(x.valor_recebido) as valor,
           max(x.data_pagamento) as dia
      from analitico_recebimentos x
     where x.empresa_id = p_empresa_id
       and x.mes_referencia = (select d from ref)
       and x.setor_id is not null
       and coalesce(x.codigo, '') <> ''
     group by 1, 2, 3
  ),
  nr58 as (
    select x.codigo as nr from analitico_recebimentos x
     where x.empresa_id = p_empresa_id and x.mes_referencia = (select d from ref)
       and x.setor_id is not null group by 1
  ),
  nr59 as (
    select r.nr_documento as nr
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g
        on g.empresa_id = r.empresa_id and g.cod_grupo_filtro = r.cod_grupo_filtro
       and g.estado = 'vinculado'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref) group by 1
  ),
  juntos as (
    select coalesce(a.setor_id, b.setor_id)       as setor_id,
           coalesce(a.cobradora, b.cobradora)     as cobradora,
           coalesce(a.nr, b.nr)                   as nr,
           coalesce(a.operador_id, b.operador_id) as operador_id,
           round(coalesce(a.valor, 0), 2) as v59,
           round(coalesce(b.valor, 0), 2) as v58,
           round(coalesce(a.valor, 0) - coalesce(b.valor, 0), 2) as delta,
           greatest(coalesce(a.dia, b.dia), coalesce(b.dia, a.dia)) as dia,
           (a.nr is not null) as tem59,
           (b.nr is not null) as tem58
      from lado59 a
      full outer join lado58 b
        on b.setor_id = a.setor_id and b.cobradora = a.cobradora and b.nr = a.nr
  ),
  classificado as (
    select j.*, ao.ultimo_dia,
           case when not j.tem58 then 'so_no_59'
                when not j.tem59 then 'so_no_58'
                else 'valor_difere' end as situacao,
           case
             when ao.ultimo_dia is null then 'sem_58'
             when j.dia > ao.ultimo_dia  then 'aguardando_58'
             when j.dia >= (select hoje from ref) or j.dia = ao.ultimo_dia then 'dia_aberto'
             when not j.tem58 and n58.nr is not null then 'estrutural'
             when not j.tem59 and n59.nr is not null then 'estrutural'
             else 'divergencia'
           end as classe
      from juntos j
      left join ate_onde ao on ao.setor_id = j.setor_id
      left join nr58 n58 on n58.nr = j.nr
      left join nr59 n59 on n59.nr = j.nr
     where abs(j.delta) >= 0.01
  )
  select c.setor_id,
         coalesce(cms.nome, s.nome),
         c.cobradora,
         c.operador_id,
         coalesce(cm.nome, c.cobradora),
         c.nr, c.dia, c.v59, c.v58, c.delta,
         c.situacao, c.classe, c.ultimo_dia
    from classificado c
    left join setores s on s.id = c.setor_id
    left join composicao_mes_setor cms
      on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = c.setor_id
    left join composicao_mes cm
      on cm.empresa_id = p_empresa_id and cm.mes = p_mes and cm.operador_id = c.operador_id
   where (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
     and (p_setor_id  is null or c.setor_id = p_setor_id)
     and (p_cobradora is null or c.cobradora = upper(btrim(p_cobradora)))
     and (p_classe    is null or c.classe = p_classe)
   order by case c.classe
              when 'divergencia'   then 0
              when 'estrutural'    then 1
              when 'dia_aberto'    then 2
              when 'aguardando_58' then 3
              else 4 end,
            abs(c.delta) desc
   limit greatest(coalesce(p_limite, 300), 1);
$function$;

create or replace function public.fn_analitico_pendencias(
  p_empresa_id uuid, p_mes text, p_setor_id uuid default null, p_limite integer default 300
)
returns table(
  id uuid, setor_id uuid, setor_nome text, operador_usuario text,
  operador_nome text, codigo text, data_pagamento date, forma_pagamento text,
  valor_recebido numeric, importado_em timestamptz, promocoes_desde bigint,
  severidade text, no_59_em_outro_setor boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  pendentes as (
    select a.id, a.empresa_id, a.setor_id, a.operador_usuario, a.operador_id,
           a.codigo, a.data_pagamento, a.forma_pagamento, a.valor_recebido,
           a.importado_em, a.mes_referencia
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = (select d from ref)
       and a.setor_id is not null
       and a.procedencia = 'relatorio_58'
       and coalesce(a.codigo, '') <> ''
       and (p_setor_id is null or a.setor_id = p_setor_id)
       and not exists (
             -- O setor do lado do 59 e o RESOLVIDO, a mesma regra da
             -- conferencia. Se o subgrupo foi mandado para outro setor, a linha
             -- conta la — e o 58 deste setor de fato ficou sem par.
             select 1
               from mestre_recebimentos r
               join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
               join mestre_grupos g
                 on g.empresa_id = r.empresa_id
                and g.cod_grupo_filtro = r.cod_grupo_filtro
                and g.estado = 'vinculado'
               left join mestre_equipes me
                 on me.empresa_id = r.empresa_id
                and me.cod_grupo_filtro = r.cod_grupo_filtro
                and me.nome_subgrupo = r.subgrupo_equipe
              where r.empresa_id = a.empresa_id
                and r.mes = a.mes_referencia
                and fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id)
                    = a.setor_id
                and upper(btrim(r.cobradora)) = upper(btrim(a.operador_usuario))
                and r.nr_documento = a.codigo)
  )
  select p.id, p.setor_id,
         coalesce(cms.nome, s.nome),
         p.operador_usuario,
         coalesce(cm.nome, p.operador_usuario),
         p.codigo, p.data_pagamento, p.forma_pagamento,
         round(p.valor_recebido, 2),
         p.importado_em,
         promo.n,
         case when promo.n = 0 then 'aguardando'
              when promo.n = 1 then 'pendente'
              else 'critico' end,
         exists (
           select 1
             from mestre_recebimentos r2
             join mestre_lotes l2 on l2.id = r2.lote_id and l2.estado = 'vigente'
            where r2.empresa_id = p.empresa_id
              and r2.mes = p.mes_referencia
              and r2.nr_documento = p.codigo)
    from pendentes p
    cross join lateral (
      select count(*) as n
        from mestre_lotes ml
       where ml.empresa_id = p.empresa_id
         and ml.mes = p.mes_referencia
         and ml.estado in ('vigente', 'substituido')
         and ml.promovido_em > p.importado_em
    ) promo
    left join setores s on s.id = p.setor_id
    left join composicao_mes_setor cms
      on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = p.setor_id
    left join composicao_mes cm
      on cm.empresa_id = p_empresa_id and cm.mes = p_mes and cm.operador_id = p.operador_id
   where (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
   order by case when promo.n >= 2 then 0 when promo.n = 1 then 1 else 2 end,
            p.valor_recebido desc
   limit greatest(coalesce(p_limite, 300), 1);
$function$;

commit;
