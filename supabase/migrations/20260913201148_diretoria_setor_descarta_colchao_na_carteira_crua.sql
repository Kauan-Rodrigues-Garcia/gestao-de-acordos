-- ═══════════════════════════════════════════════════════════════════════════
-- `fn_mestre_diretoria_setor`: o Colchão sai também pelo caminho da carteira crua
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Irmã da 20260913200932, e a última das três.
--
-- Esta função abre um setor de duas maneiras: por `p_setor_id`, passando por
-- `fn_mestre_diretoria_linhas` — que a `…201024` já corrigiu —, ou por
-- `p_cod_grupo`, lendo a tabela direto («carteira crua»).
--
-- Sem o filtro no segundo caminho, a MESMA carteira daria dois números conforme
-- por onde se clicasse nela. É o tipo de divergência que ninguém consegue
-- explicar depois, porque as duas telas parecem a mesma tela.
--
-- O filtro entra nas duas fatias, corrente e anterior, pelo mesmo motivo da
-- `…201057`: comparar mês a mês entre bases diferentes inventa variação.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_diretoria_setor(
  p_empresa_id uuid, p_mes text, p_setor_id uuid default null::uuid,
  p_cod_grupo text default null::text, p_dia_corte integer default null::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
as $function$
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

comment on function public.fn_mestre_diretoria_setor(uuid, text, uuid, text, integer) is
  'O detalhe de um setor (ou de uma carteira crua) no 59: serie diaria, formas, '
  'carteiras e equipes. Colchao NAO entra por nenhum dos dois caminhos — ele '
  'conta no total da empresa e fica fora de setor, equipe e operador.';

commit;
