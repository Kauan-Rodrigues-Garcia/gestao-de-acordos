-- ═══════════════════════════════════════════════════════════════════════════
-- `fn_mestre_diretoria_alternativos` passa a aplicar a regra do Colchão
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Irmã da 20260913200932. Esta é a única das funções do Painel Diretoria que
-- soma pela GENTE do setor (`operador_id`) e não pela carteira — setor
-- alternativo, como o Digital, não tem carteira própria no ERP.
--
-- O filtro entra nas DUAS fatias, mês corrente e mês anterior. Aplicar só numa
-- delas faria a comparação «este mês × mês passado» acontecer entre bases
-- diferentes, e o card mostraria uma queda que não existiu.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_diretoria_alternativos(
  p_empresa_id uuid, p_mes text, p_dia_corte integer default null::integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
as $function$
declare
  v_mes     date;
  v_mes_ant date;
  v_ult_dia integer;
  v_corte   integer;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res     jsonb;
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
  alt as (
    select s.id, s.nome, s.foto_url
      from setores s
     where s.empresa_id = p_empresa_id
       and s.alternativo
       and s.ativo is not false
  ),
  gente as (
    select a.id as setor_id, p.id as operador_id
      from alt a
      join perfis p on p.setor_id = a.id
    union
    select a.id, c.operador_id
      from alt a
      join equipes q on q.setor_id = a.id
      join equipe_operadores_clones c on c.equipe_id = q.id
     where coalesce(c.conta_recebimento, true)
  ),
  -- Colchao nao conta para setor nem para operador: ele fica no total da
  -- empresa, igual a Retencao. Vale para o mes corrente e para o anterior,
  -- senao a comparacao mes a mes ficaria entre bases diferentes.
  linhas as (
    select r.operador_id, r.recebido
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and r.operador_id is not null
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and (p_dia_corte is null or extract(day from r.dt_pgto) <= v_corte)
  ),
  linhas_ant as (
    select r.operador_id, r.recebido
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = v_mes_ant
       and r.operador_id is not null
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and extract(day from r.dt_pgto) <= v_corte
  ),
  soma as (
    select g.setor_id,
           coalesce(sum(l.recebido), 0)::numeric(14,2) valor,
           count(l.recebido)::bigint                   linhas,
           count(distinct l.operador_id)::bigint       operadores
      from gente g
      left join linhas l on l.operador_id = g.operador_id
     group by g.setor_id
  ),
  soma_ant as (
    select g.setor_id,
           coalesce(sum(l.recebido), 0)::numeric(14,2) valor,
           count(l.recebido)::bigint                   linhas
      from gente g
      left join linhas_ant l on l.operador_id = g.operador_id
     group by g.setor_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'setor_id',          a.id,
           'setor_nome',        a.nome,
           'foto_url',          a.foto_url,
           'valor',             coalesce(s.valor, 0),
           'linhas',            coalesce(s.linhas, 0),
           'operadores',        coalesce(s.operadores, 0),
           'pessoas',           (select count(*) from gente g where g.setor_id = a.id),
           'valor_anterior',    coalesce(sa.valor, 0),
           'tem_anterior',      coalesce(sa.linhas, 0) > 0,
           'carteiras',         0,
           'tem_grupo',         false,
           'integral_recebido', 0,
           'movido_para_ca',    0
         ) order by coalesce(s.valor, 0) desc), '[]'::jsonb)
    into v_res
    from alt a
    left join soma     s  on s.setor_id  = a.id
    left join soma_ant sa on sa.setor_id = a.id;

  return v_res;
end;
$function$;

comment on function public.fn_mestre_diretoria_alternativos(uuid, text, integer) is
  'Setores alternativos, somados pela GENTE deles e nao por carteira. Colchao '
  'NAO entra, nem no mes corrente nem no anterior: ele conta no total da '
  'empresa e fica fora de setor, equipe e operador.';

commit;
