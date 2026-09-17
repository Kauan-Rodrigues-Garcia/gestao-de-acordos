-- Definições de PRODUÇÃO em 17/09/2026, lidas com pg_get_functiondef antes da
-- migration 20260917160000. Não é migration: é a régua do teste
-- mestreDiretoriaDesempenho.sql.test.ts, que roda estas e as novas sobre os
-- mesmos dados e exige a mesma resposta. Não edite — a comparação perde o valor.

CREATE OR REPLACE FUNCTION public.fn_mestre_conta_na_meta(p_colchao boolean, p_dt date)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  -- Nao e colchao: conta, e sempre contou.
  select not coalesce(p_colchao, false)
      -- A excecao de agosto/2026, preservada como foi aplicada na epoca.
      or (p_dt >= date '2026-08-01' and p_dt <= date '2026-08-14');
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_e_equipe(p_nome text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(p_nome, '') <> ''
     and upper(p_nome) not in ('ATESTADOS|FERIAS', 'LIDERANÇA', 'LIDERANCA', 'SUPERVISORES');
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_linhas(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS TABLE(setor_id uuid, cod_grupo_filtro text, nome_grupo_filtro text, subgrupo_equipe text, cobradora text, dt_pgto date, tp_doc text, recebido numeric, origem text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  mes_todo as (
    select r.cod_grupo_filtro, r.nome_grupo_filtro
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
       and r.nome_grupo_filtro <> ''
  ),
  nomes as (select distinct cod_grupo_filtro, nome_grupo_filtro from mes_todo),
  fatia as (
    select r.*
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and (p_dia_corte is null or extract(day from r.dt_pgto) <= p_dia_corte)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
  ),
  resolvida as (
    select f.*,
           n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe,
           me.destino_setor_id,
           case when g.estado = 'vinculado' then g.setor_id end as setor_do_grupo
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
      left join mestre_grupos g
        on g.empresa_id = p_empresa_id
       and g.cod_grupo_filtro = f.cod_grupo_filtro
  )
  select
    case r.destino_equipe
      when 'outro_setor'   then r.destino_setor_id
      when 'somente_geral' then null::uuid
      else r.setor_do_grupo
    end,
    r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
    r.cobradora, r.dt_pgto, r.tp_doc, r.recebido,
    case r.destino_equipe
      when 'outro_setor'   then 'movido'
      when 'somente_geral' then 'somente_geral'
      else 'proprio'
    end
  from resolvida r

  union all

  select
    gd.setor_id,
    r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
    r.cobradora, r.dt_pgto, r.tp_doc, r.recebido,
    'integral'
  from resolvida r
  join mestre_grupos gd
    on gd.empresa_id = p_empresa_id
   and gd.cod_grupo_filtro = r.cod_destino
   and gd.estado = 'vinculado'
   and gd.setor_id is not null
  where r.cod_destino is not null
    and r.cod_destino <> r.cod_grupo_filtro
    and lower(r.tipo) <> 'extra';
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_visao_geral(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '32MB'
AS $function$
declare
  v_mes       date;
  v_mes_ant   date;
  v_lote      uuid;
  v_lote_ant  uuid;
  v_corte     integer;
  v_ult_dia   integer;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res       jsonb;
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;

  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := v_mes - interval '1 month';
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;

  v_corte := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer
         else v_ult_dia end
  );
  v_corte := greatest(1, least(v_corte, v_ult_dia));

  select id into v_lote from mestre_lotes
   where empresa_id = p_empresa_id and mes = v_mes and estado = 'vigente' limit 1;
  select id into v_lote_ant from mestre_lotes
   where empresa_id = p_empresa_id and mes = v_mes_ant and estado = 'vigente' limit 1;

  with
  atual as (
    select r.* from mestre_recebimentos r
     where r.lote_id = v_lote
       and extract(day from r.dt_pgto) <= v_corte
  ),
  anterior as (
    select r.* from mestre_recebimentos r
     where r.lote_id = v_lote_ant
       and extract(day from r.dt_pgto) <= v_corte
  ),
  tot_atual as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v,
           count(*)::bigint n,
           count(distinct cobradora) filter (where cobradora <> '')::bigint operadores,
           count(distinct cod_grupo_filtro)::bigint carteiras
      from atual
  ),
  tot_ant as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n from anterior
  ),
  colchao_atual as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n
      from atual where not fn_mestre_conta_na_meta(colchao, dt_pgto)
  ),
  colchao_ant as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v
      from anterior where not fn_mestre_conta_na_meta(colchao, dt_pgto)
  ),
  dias as (select generate_series(1, v_ult_dia) d),
  serie as (
    select d.d as dia,
           coalesce((select sum(a.recebido) from atual a
                      where extract(day from a.dt_pgto) = d.d), 0)::numeric(14,2) as valor,
           coalesce((select sum(b.recebido) from anterior b
                      where extract(day from b.dt_pgto) = d.d), 0)::numeric(14,2) as valor_anterior,
           d.d <= v_corte as dentro_do_corte
      from dias d
  ),
  formas_atual as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') as forma,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual group by 1
  ),
  formas_ant as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') as forma,
           sum(recebido)::numeric(14,2) valor
      from anterior group by 1
  ),
  formas as (
    select fa.forma, fa.valor, fa.qtd, coalesce(fb.valor, 0)::numeric(14,2) valor_anterior
      from formas_atual fa left join formas_ant fb on fb.forma = fa.forma
  ),
  cart_atual as (
    select cod_grupo_filtro cod, max(nome_grupo_filtro) nome,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual group by 1
  ),
  cart_ant as (
    select cod_grupo_filtro cod, sum(recebido)::numeric(14,2) valor
      from anterior group by 1
  ),
  carteiras as (
    select ca.cod, ca.nome, ca.valor, ca.qtd,
           coalesce(cb.valor, 0)::numeric(14,2) valor_anterior,
           g.setor_id, s.nome as setor_nome
      from cart_atual ca
      left join cart_ant cb on cb.cod = ca.cod
      left join mestre_grupos g
             on g.empresa_id = p_empresa_id and g.cod_grupo_filtro = ca.cod
      left join setores s on s.id = g.setor_id
  )
  select jsonb_build_object(
    'mes',              p_mes,
    'mes_anterior',     to_char(v_mes_ant, 'YYYY-MM'),
    'dia_corte',        v_corte,
    'dias_no_mes',      v_ult_dia,
    'tem_lote',         v_lote is not null,
    'tem_lote_anterior', v_lote_ant is not null,
    'total',            (select jsonb_build_object(
                            'recebido', v, 'linhas', n,
                            'operadores', operadores, 'carteiras', carteiras)
                           from tot_atual),
    'total_anterior',   (select jsonb_build_object('recebido', v, 'linhas', n) from tot_ant),
    'colchao',          jsonb_build_object(
                            'valor',          (select v from colchao_atual),
                            'linhas',         (select n from colchao_atual),
                            'valor_anterior', (select v from colchao_ant)),
    'serie',            coalesce((select jsonb_agg(jsonb_build_object(
                            'dia', dia, 'valor', valor,
                            'valor_anterior', valor_anterior,
                            'dentro_do_corte', dentro_do_corte) order by dia) from serie), '[]'::jsonb),
    'formas',           coalesce((select jsonb_agg(jsonb_build_object(
                            'forma', forma, 'valor', valor, 'qtd', qtd,
                            'valor_anterior', valor_anterior) order by valor desc) from formas), '[]'::jsonb),
    'carteiras',        coalesce((select jsonb_agg(jsonb_build_object(
                            'cod', cod, 'nome', nome, 'valor', valor, 'qtd', qtd,
                            'valor_anterior', valor_anterior,
                            'setor_id', setor_id, 'setor_nome', setor_nome) order by valor desc)
                           from carteiras), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_setores(p_empresa_id uuid, p_mes text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '32MB'
AS $function$
declare
  v_mes      date;
  v_mes_ant  date;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res      jsonb;
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := (v_mes - interval '1 month')::date;
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  with
  atual as (
    select * from fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte)
  ),
  anterior as (
    select * from fn_mestre_diretoria_linhas(
      p_empresa_id, to_char(v_mes_ant, 'YYYY-MM'), v_corte)
  ),
  por_setor as (
    select a.setor_id,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores,
           count(distinct a.cod_grupo_filtro)::bigint carteiras,
           sum(a.recebido) filter (where a.origem = 'integral')::numeric(14,2) integral,
           sum(a.recebido) filter (where a.origem = 'movido')::numeric(14,2)   movido
      from atual a where a.setor_id is not null group by a.setor_id
  ),
  por_setor_ant as (
    select b.setor_id, sum(b.recebido)::numeric(14,2) valor
      from anterior b where b.setor_id is not null group by b.setor_id
  ),
  sem_setor_carteiras as (
    select a.cod_grupo_filtro cod, max(a.nome_grupo_filtro) nome,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores
      from atual a
     where a.setor_id is null and a.origem <> 'somente_geral'
     group by 1
  ),
  sem_setor_ant as (
    select b.cod_grupo_filtro cod, sum(b.recebido)::numeric(14,2) valor
      from anterior b
     where b.setor_id is null and b.origem <> 'somente_geral'
     group by 1
  ),
  so_geral as (
    select a.cod_grupo_filtro cod, max(a.nome_grupo_filtro) nome,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.subgrupo_equipe) filter (where a.subgrupo_equipe <> '')::bigint equipes
      from atual a where a.origem = 'somente_geral' group by 1
  ),
  so_geral_ant as (
    select b.cod_grupo_filtro cod, sum(b.recebido)::numeric(14,2) valor
      from anterior b where b.origem = 'somente_geral' group by 1
  ),
  total_empresa as (
    select coalesce(sum(a.recebido), 0)::numeric(14,2) v
      from atual a where a.origem <> 'integral'
  ),
  cards as (
    select s.id, s.nome, s.foto_url,
           p.valor, p.linhas, p.operadores, p.carteiras,
           coalesce(p.integral, 0)::numeric(14,2) as integral,
           coalesce(p.movido, 0)::numeric(14,2)   as movido,
           coalesce(pa.valor, 0)::numeric(14,2)   as valor_anterior,
           (pa.setor_id is not null)              as tinha_anterior,
           exists (select 1 from mestre_grupos g
                    where g.empresa_id = p_empresa_id and g.setor_id = s.id
                      and g.estado = 'vinculado')  as tem_grupo
      from por_setor p
      join setores s on s.id = p.setor_id and s.empresa_id = p_empresa_id
      left join por_setor_ant pa on pa.setor_id = s.id
  )
  select jsonb_build_object(
    'mes',           p_mes,
    'mes_anterior',  to_char(v_mes_ant, 'YYYY-MM'),
    'dia_corte',     v_corte,
    'dias_no_mes',   v_ult_dia,
    'total_empresa', (select v from total_empresa),
    'total_setores', coalesce((select sum(valor) from cards), 0),
    'sem_setor',     (select jsonb_build_object(
                        'valor',  coalesce(sum(valor), 0),
                        'linhas', coalesce(sum(linhas), 0)) from sem_setor_carteiras),
    'carteiras_sem_setor', coalesce((select jsonb_agg(jsonb_build_object(
                        'cod', c.cod, 'nome', c.nome, 'valor', c.valor,
                        'linhas', c.linhas, 'operadores', c.operadores,
                        'valor_anterior', coalesce(ca.valor, 0)) order by c.valor desc)
                       from sem_setor_carteiras c
                       left join sem_setor_ant ca on ca.cod = c.cod), '[]'::jsonb),
    'somente_geral', jsonb_build_object(
                       'valor',  (select coalesce(sum(valor), 0)::numeric(14,2) from so_geral),
                       'linhas', (select coalesce(sum(linhas), 0) from so_geral),
                       'carteiras', coalesce((select jsonb_agg(jsonb_build_object(
                           'cod', g.cod, 'nome', g.nome, 'valor', g.valor,
                           'linhas', g.linhas, 'equipes', g.equipes,
                           'valor_anterior', coalesce(ga.valor, 0)) order by g.valor desc)
                          from so_geral g
                          left join so_geral_ant ga on ga.cod = g.cod), '[]'::jsonb)),
    'setores',       coalesce((select jsonb_agg(jsonb_build_object(
                        'setor_id', id, 'setor_nome', nome, 'foto_url', foto_url,
                        'valor', valor, 'linhas', linhas,
                        'operadores', operadores, 'carteiras', carteiras,
                        'integral_recebido', integral, 'movido_para_ca', movido,
                        'valor_anterior', valor_anterior,
                        'tem_anterior', tinha_anterior,
                        'tem_grupo', tem_grupo) order by valor desc) from cards), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_setor(p_empresa_id uuid, p_mes text, p_setor_id uuid DEFAULT NULL::uuid, p_cod_grupo text DEFAULT NULL::text, p_dia_corte integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
 SET work_mem TO '32MB'
AS $function$
declare
  v_mes      date;
  v_mes_ant  date;
  v_mes_ant_txt text;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res      jsonb;
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;
  if (p_setor_id is null) = (p_cod_grupo is null) then
    raise exception 'Informe p_setor_id OU p_cod_grupo, exatamente um dos dois.';
  end if;
  if p_setor_id is not null and not exists (
       select 1 from setores s where s.id = p_setor_id and s.empresa_id = p_empresa_id) then
    raise exception 'Setor nao pertence a esta empresa.';
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := (v_mes - interval '1 month')::date;
  v_mes_ant_txt := to_char(v_mes_ant, 'YYYY-MM');
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  with
  atual as (
    select l.* from fn_mestre_diretoria_linhas(p_empresa_id, p_mes, v_corte) l
     where p_setor_id is not null and l.setor_id = p_setor_id
    union all
    -- Modo carteira crua: direto da tabela, sem passar pela atribuicao. O
    -- colchao fica de fora aqui tambem — carteira e recorte de setor, e a via
    -- do `fn_mestre_diretoria_linhas` acima ja o descarta. Sem esta linha, abrir
    -- a mesma carteira pelos dois caminhos daria dois numeros.
    select null::uuid, r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, 'proprio'
      from mestre_recebimentos r
      join mestre_lotes lo on lo.id = r.lote_id and lo.estado = 'vigente'
     where p_cod_grupo is not null
       and r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and r.cod_grupo_filtro = p_cod_grupo
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and extract(day from r.dt_pgto) <= v_corte
  ),
  anterior as (
    select l.* from fn_mestre_diretoria_linhas(p_empresa_id, v_mes_ant_txt, v_corte) l
     where p_setor_id is not null and l.setor_id = p_setor_id
    union all
    select null::uuid, r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, 'proprio'
      from mestre_recebimentos r
      join mestre_lotes lo on lo.id = r.lote_id and lo.estado = 'vigente'
     where p_cod_grupo is not null
       and r.empresa_id = p_empresa_id
       and r.mes = v_mes_ant
       and r.cod_grupo_filtro = p_cod_grupo
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and extract(day from r.dt_pgto) <= v_corte
  ),
  tot as (
    select coalesce(sum(recebido), 0)::numeric(14,2) v, count(*)::bigint n,
           count(distinct cobradora) filter (where cobradora <> '')::bigint ops
      from atual
  ),
  tot_ant as (select coalesce(sum(recebido), 0)::numeric(14,2) v from anterior),
  dias as (select generate_series(1, v_ult_dia) d),
  serie as (
    select d.d dia,
           coalesce((select sum(a.recebido) from atual a
                      where extract(day from a.dt_pgto) = d.d), 0)::numeric(14,2) valor,
           coalesce((select sum(b.recebido) from anterior b
                      where extract(day from b.dt_pgto) = d.d), 0)::numeric(14,2) valor_anterior,
           d.d <= v_corte dentro_do_corte
      from dias d
  ),
  formas as (
    select coalesce(nullif(btrim(tp_doc), ''), 'NAO INFORMADO') forma,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd,
           0::numeric(14,2) valor_anterior
      from atual group by 1
  ),
  -- As equipes NAO comparam com o mes anterior, de proposito: subgrupo do ERP
  -- muda de nome, e casar por nome inventaria equipe nova onde houve renomeacao.
  --
  -- O nome e `equipes_do_59` e NAO `equipes` porque existe uma TABELA com esse
  -- nome, e um CTE sombreia a tabela homonima em toda referencia nao
  -- qualificada do mesmo comando. Com o CTE chamado `equipes`, o
  -- `left join equipes eq` abaixo pegava o CTE e estourava com
  -- «column eq.id does not exist».
  equipes_do_59 as (
    select a.subgrupo_equipe nome,
           a.cod_grupo_filtro cod,
           max(a.nome_grupo_filtro) carteira,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores,
           bool_or(a.origem = 'movido')   veio_de_fora,
           bool_or(a.origem = 'integral') e_integral,
           fn_mestre_e_equipe(a.subgrupo_equipe) e_equipe
      from atual a group by 1, 2
  ),
  equipes_completas as (
    select e.*, me.equipe_id, eq.nome equipe_nome,
           lp.id lider_id, lp.nome lider_nome, lp.foto_url lider_foto
      from equipes_do_59 e
      left join mestre_equipes me
        on me.empresa_id = p_empresa_id
       and me.cod_grupo_filtro = e.cod
       and me.nome_subgrupo = e.nome
      left join equipes eq on eq.id = me.equipe_id
      left join lateral (
        select p.id, p.nome, p.foto_url
          from equipe_lideres el
          join perfis p on p.id = el.lider_id
         where el.equipe_id = me.equipe_id
           and el.empresa_id = p_empresa_id
         order by el.criado_em
         limit 1
      ) lp on true
  ),
  carteiras as (
    select a.cod_grupo_filtro cod, max(a.nome_grupo_filtro) nome,
           sum(a.recebido)::numeric(14,2) valor, count(*)::bigint qtd
      from atual a group by 1
  )
  select jsonb_build_object(
    'setor_id',     p_setor_id,
    'cod_grupo',    p_cod_grupo,
    'setor_nome',   coalesce(
                      (select nome from setores where id = p_setor_id),
                      (select max(nome_grupo_filtro) from atual),
                      p_cod_grupo),
    'vinculado',    p_setor_id is not null,
    'mes',          p_mes,
    'mes_anterior', to_char(v_mes_ant, 'YYYY-MM'),
    'dia_corte',    v_corte,
    'dias_no_mes',  v_ult_dia,
    'recebido',     (select v from tot),
    'linhas',       (select n from tot),
    'operadores',   (select ops from tot),
    'recebido_anterior', (select v from tot_ant),
    'tem_anterior', (select v from tot_ant) <> 0,
    'serie',        coalesce((select jsonb_agg(jsonb_build_object(
                       'dia', dia, 'valor', valor, 'valor_anterior', valor_anterior,
                       'dentro_do_corte', dentro_do_corte) order by dia) from serie), '[]'::jsonb),
    'formas',       coalesce((select jsonb_agg(jsonb_build_object(
                       'forma', forma, 'valor', valor, 'qtd', qtd,
                       'valor_anterior', valor_anterior) order by valor desc) from formas), '[]'::jsonb),
    'carteiras',    coalesce((select jsonb_agg(jsonb_build_object(
                       'cod', cod, 'nome', nome, 'valor', valor, 'qtd', qtd)
                       order by valor desc) from carteiras), '[]'::jsonb),
    'equipes',      coalesce((select jsonb_agg(jsonb_build_object(
                       'nome', nome, 'cod_grupo', cod, 'carteira', carteira,
                       'valor', valor, 'linhas', linhas, 'operadores', operadores,
                       'veio_de_fora', veio_de_fora, 'e_integral', e_integral,
                       'e_equipe', e_equipe, 'equipe_id', equipe_id,
                       'equipe_nome', equipe_nome, 'lider_id', lider_id,
                       'lider_nome', lider_nome, 'lider_foto', lider_foto)
                       order by valor desc) from equipes_completas), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_divergencias(p_empresa_id uuid, p_mes text, p_setor_id uuid DEFAULT NULL::uuid, p_cobradora text DEFAULT NULL::text, p_classe text DEFAULT NULL::text, p_limite integer DEFAULT 300)
 RETURNS TABLE(setor_id uuid, setor_nome text, cobradora text, operador_id uuid, operador_nome text, nr_documento text, dia date, valor_59 numeric, valor_58 numeric, delta numeric, situacao text, classe text, ultimo_dia_58 date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ref as (
    select ((p_mes || '-01')::date) as d,
           (now() at time zone 'America/Sao_Paulo')::date as hoje
  ),
  ate_onde as (
    select x.setor_id, max(x.data_pagamento) as ultimo_dia
      from (select * from public.analitico_recebimentos where procedencia <> 'contribuicao_59') x
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
      from (select * from public.analitico_recebimentos where procedencia <> 'contribuicao_59') x
     where x.empresa_id = p_empresa_id
       and x.mes_referencia = (select d from ref)
       and x.setor_id is not null
       and coalesce(x.codigo, '') <> ''
     group by 1, 2, 3
  ),
  nr58 as (
    select x.codigo as nr from (select * from public.analitico_recebimentos where procedencia <> 'contribuicao_59') x
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

CREATE OR REPLACE FUNCTION public.fn_mestre_divergencias_resumo(p_empresa_id uuid, p_mes text)
 RETURNS TABLE(setor_id uuid, setor_nome text, ultimo_dia_58 date, classe text, nrs bigint, valor numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with linhas as (
    select * from fn_mestre_divergencias(p_empresa_id, p_mes, null, null, null, 1000000)
  )
  select l.setor_id,
         max(l.setor_nome),
         max(l.ultimo_dia_58),
         l.classe,
         count(*)::bigint,
         round(sum(abs(l.delta)), 2)
    from linhas l
   group by l.setor_id, l.classe
   order by max(l.setor_nome),
            case l.classe
              when 'divergencia'   then 0
              when 'estrutural'    then 1
              when 'dia_aberto'    then 2
              when 'aguardando_58' then 3
              else 4 end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_resumo_grupos(p_empresa_id uuid, p_mes text)
 RETURNS TABLE(cod_grupo_filtro text, nome_no_relatorio text, nome_cadastrado text, setor_id uuid, setor_nome text, estado text, linhas bigint, recebido_proprio numeric, integral_proprio numeric, extra_proprio numeric, contrib_integral numeric, contrib_extra numeric, saiu_outro_setor numeric, saiu_somente_geral numeric, emprestado_para numeric, emprestado_pessoas bigint, recebido_total numeric, para_outros_integral numeric, para_outros_extra numeric, sem_destino numeric, colchao_valor numeric, colchao_fora numeric, atestado_valor numeric, equipes bigint, cobradoras bigint, dias bigint, primeira_aparicao date, ultima_aparicao date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '32MB'
AS $function$
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

CREATE OR REPLACE FUNCTION public.fn_analitico_remocoes_guardadas(p_empresa_id uuid, p_mes text DEFAULT NULL::text)
 RETURNS TABLE(lote_id uuid, setor_id uuid, mes text, linhas bigint, valor numeric, removido_em timestamp with time zone, restaurado_em timestamp with time zone, pode_desfazer boolean)
 LANGUAGE sql
 STABLE STRICT SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '32MB'
AS $function$
  select r.lote_id,
         (array_agg(distinct r.setor_id) filter (where r.setor_id is not null))[1],
         to_char(min(r.mes_referencia), 'YYYY-MM'),
         count(*)::bigint,
         round(sum(r.valor_recebido), 2),
         min(r.removido_em),
         max(r.restaurado_em),
         bool_or(r.restaurado_em is null)
    from analitico_removidos r
   where r.empresa_id = p_empresa_id
     and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
     and (p_mes is null or to_char(r.mes_referencia, 'YYYY-MM') = p_mes)
   group by r.lote_id
   order by min(r.removido_em) desc;
$function$;
