-- ═══════════════════════════════════════════════════════════════════════════
-- «Conta só no geral» deixa de se disfarçar de «ainda sem setor vinculado»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O card duplicado que motivou isto
--
-- Em setembro/2026 o Painel Diretoria mostrava, na aba Setores e equipes, DOIS
-- cards para a mesma carteira: «Receptivo» (setor, R$ 1.219.333,82) e «COB
-- RECEPTIVO - BEATRIZ» (R$ 41.907,71), este último debaixo do título «Ainda
-- sem setor vinculado».
--
-- A carteira 63 está vinculada, e sempre esteve. O que caía ali eram as linhas
-- das equipes `RETENÇÃO` e `EQUIPE RETENÇÃO`, marcadas com
-- `mestre_equipes.destino = 'somente_geral'` — dinheiro que conta no total da
-- empresa e, de propósito, não pertence a setor nenhum.
--
-- `fn_mestre_diretoria_setores` agrupava tudo o que chegava com `setor_id`
-- nulo, e `setor_id` nulo tem DUAS causas diferentes:
--
--   a carteira não foi vinculada a setor nenhum .......... falta fazer
--   a equipe é `somente_geral` (Retenção) ................ é assim de propósito
--
-- Misturar as duas produz um card que pede uma ação que não existe («vincule a
-- um setor») em cima de dinheiro que está certo — e um nome de carteira
-- repetido na tela, que foi o que chamou atenção.
--
-- ## O que esta migration faz
--
-- 1. `fn_mestre_diretoria_linhas` passa a devolver `origem = 'somente_geral'`
--    para essas linhas, em vez de 'proprio'. A regra já existia ali (o
--    `case` que zera o setor); o que faltava era ela DIZER o que fez.
--
-- 2. `fn_mestre_diretoria_setores` separa os dois baldes: `carteiras_sem_setor`
--    volta a ser só o que de fato falta vincular, e nasce o bloco
--    `somente_geral`, com o total e a quebra por carteira.
--
-- Nenhum total muda. `total_empresa` continua somando tudo que não é a 2ª perna
-- do Integral — `somente_geral` incluído, que é onde esse dinheiro sempre
-- contou. O que muda é onde a tela põe cada parte.
--
-- ## Efeito medido, setembro/2026 (corte no dia 14)
--
--   antes:  carteiras_sem_setor inclui COB RECEPTIVO - BEATRIZ  R$  41.907,71
--   depois: somente_geral                                       R$  41.907,71
--           carteiras_sem_setor sem ela
--
-- ## Por que não mexer na 2ª perna (Integral)
--
-- Uma linha `somente_geral` que seja Integral destinado a outro grupo continua
-- gerando a perna de destino, como antes. Mexer nisso mudaria valor de setor, e
-- esta migration é sobre ROTULAR, não sobre recalcular.
--
-- ## Escrita: nenhuma. Duas funções de leitura.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ── A base: a linha passa a dizer por que ficou sem setor ──────────────────

create or replace function public.fn_mestre_diretoria_linhas(
  p_empresa_id uuid, p_mes text, p_dia_corte integer default null::integer
)
returns table(setor_id uuid, cod_grupo_filtro text, nome_grupo_filtro text,
              subgrupo_equipe text, cobradora text, dt_pgto date, tp_doc text,
              recebido numeric, origem text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  -- Mapa de nome->codigo do MES INTEIRO, sem corte: o mapa e cadastral, nao
  -- temporal. Corta-lo faria contribuicoes ficarem orfas por causa de data.
  -- Tambem NAO filtra colchao: o mapa e de nomes, nao de dinheiro.
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
       -- Colchao nao conta para SETOR: ele entra no total da empresa
       -- (fn_mestre_diretoria_visao_geral) e fica de fora daqui, igual a
       -- Retencao. Uma linha so, na entrada, para as duas pernas abaixo.
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
  ),
  resolvida as (
    select f.*,
           n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe,
           me.destino_setor_id,
           -- Grupo so empresta o setor dele quando o vinculo esta confirmado.
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
  -- 1a perna: onde a linha conta por direito proprio (ou para onde foi movida).
  select
    case r.destino_equipe
      when 'outro_setor'   then r.destino_setor_id
      when 'somente_geral' then null::uuid
      else r.setor_do_grupo
    end,
    r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
    r.cobradora, r.dt_pgto, r.tp_doc, r.recebido,
    /* `somente_geral` deixa de sair como 'proprio'.
       O `case` acima ja zerava o setor dessa linha; o que faltava era ela DIZER
       o porque. Sem isso, quem soma por `setor_id is null` nao consegue separar
       «a carteira ainda nao foi vinculada» de «esta equipe conta so no geral», e
       a tela acabava pedindo um vinculo que ja existe. */
    case r.destino_equipe
      when 'outro_setor'   then 'movido'
      when 'somente_geral' then 'somente_geral'
      else 'proprio'
    end
  from resolvida r

  union all

  -- 2a perna: o Integral cobrado por um grupo PARA outro. Soma no destino sem
  -- sair da origem. So Integral: o Extra e a segunda representacao de um
  -- pagamento que o destino ja tem como direto.
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

comment on function public.fn_mestre_diretoria_linhas(uuid, text, integer) is
  'Uma linha por recebimento do 59, ja resolvida para o setor que a recebe. '
  'Origem: proprio, movido, integral ou somente_geral (Retencao e afins — conta '
  'no total da empresa e em setor nenhum). Colchao NAO entra. Base de '
  'fn_mestre_diretoria_setores e de fn_mestre_diretoria_setor.';

revoke all on function public.fn_mestre_diretoria_linhas(uuid, text, integer) from public, anon, authenticated;

-- ── A grade: dois baldes, dois nomes ───────────────────────────────────────

create or replace function public.fn_mestre_diretoria_setores(
  p_empresa_id uuid,
  p_mes        text,
  p_dia_corte  integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_mes      date;
  v_mes_ant  date;
  v_ult_dia  integer;
  v_corte    integer;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res      jsonb;
begin
  -- Mesmo portão da Visão Geral: quem enxerga a empresa, enxerga.
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
  -- Com setor: vira card. Sem setor: vira um dos dois blocos de baixo.
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
  /* Carteira sem setor vinculado vira card tambem, e nao uma sobra no rodape:
     e dinheiro real do 59 e precisa ser exploravel do mesmo jeito. O que ela
     nao tem e meta, quartil e projecao — esses vem do sistema, e o sistema
     ainda nao sabe de quem essa carteira e.

     `origem <> 'somente_geral'` e o conserto desta migration: sem ele, a
     Retencao de uma carteira JA VINCULADA aparecia aqui, com o nome da
     carteira repetido e um aviso de «vincule a um setor» que nao se aplica. */
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
  /* O dinheiro que conta SO NO GERAL: equipe com `destino = somente_geral`
     (Retencao, hoje). Nao e pendencia — e uma decisao registrada em
     `mestre_equipes`, e a tela precisa dizer isso com outras palavras que nao
     «ainda sem setor vinculado». */
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
  -- O total da EMPRESA e o do arquivo: sem a 2a perna do integral, que e a
  -- mesma cobranca contada de novo. O `somente_geral` ENTRA aqui, como sempre
  -- entrou — ele conta no geral, so nao conta para setor.
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

comment on function public.fn_mestre_diretoria_setores(uuid, text, integer) is
  'Grade de setores do Painel Diretoria a partir do 59, no corte de dia. '
  '`total_setores` > `total_empresa` e a diferenca e a 2a perna do Integral — nao e erro. '
  '`carteiras_sem_setor` e so o que falta vincular; `somente_geral` e o que conta no total '
  'da empresa e em setor nenhum (Retencao), que antes se misturava com o primeiro.';

revoke all on function public.fn_mestre_diretoria_setores(uuid, text, integer) from public, anon;
grant execute on function public.fn_mestre_diretoria_setores(uuid, text, integer) to authenticated;

commit;
