-- ═══════════════════════════════════════════════════════════════════════════
-- Painel Diretoria, fase 2: setores e equipes, direto do 59
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A Visão Geral respondeu «a empresa está melhor ou pior». Esta fase responde
-- «onde», e para isso precisa da regra que diz de QUEM é cada real do 59.
--
-- ## A regra de atribuição mora em UM lugar
--
-- Ela não é óbvia e não cabe em duas cabeças. Uma linha do 59 conta para um
-- setor por três caminhos diferentes:
--
--   próprio   a linha é do grupo, o grupo está vinculado ao setor. O caso comum.
--   movido    a equipe daquela linha foi mandada para outro setor
--             (`mestre_equipes.destino`). Ela SAI do setor do grupo e entra no
--             de destino. `somente_geral` sai e não entra em lugar nenhum.
--   integral  a linha é `Integral`, foi cobrada por um grupo PARA outro (a
--             coluna `setor` vem como «Receptivo - Play 5»), e some no
--             relatório do destino. Ela conta NOS DOIS: é rateio de comissão,
--             não transferência. Ver `20260904300000` para a medição que
--             estabeleceu isso.
--
-- Por isso existe `fn_mestre_diretoria_linhas`: ela devolve a linha JÁ
-- atribuída, e todo o resto desta fase soma em cima dela. Escrever essa regra
-- de novo em cada função seria assinar a divergência — é exatamente assim que
-- duas telas passam a mostrar dois totais para o mesmo setor.
--
-- ## A soma dos setores é MAIOR que o total da empresa, de propósito
--
-- Consequência direta do `integral`: a mesma cobrança aparece nas duas pernas.
-- Quem for exibir porcentagem tem que usar a soma dos setores como denominador,
-- nunca o total da empresa — senão as fatias passam de 100% e a tela parece
-- quebrada quando na verdade está certa. A função devolve os dois totais
-- separados para a tela poder dizer isso em voz alta.
--
-- ## O corte de dia atravessa tudo
--
-- Mesma régua da Visão Geral: mês em foco do dia 1 ao corte, mês anterior até o
-- MESMO dia. Sem isso, o card do setor e o gráfico da aba ao lado responderiam
-- perguntas diferentes com a mesma cara.
--
-- ## O que esta migration NÃO faz
--
-- Não escreve em `analitico_recebimentos`, não mexe em meta, quartil ou acordo,
-- e não altera nenhuma função que já está no ar. Vincular um grupo a um setor
-- muda o que ESTAS funções devolvem, e nada mais. A sincronização do 58 com o
-- 59 é outra etapa, e manter as duas separadas é o que permite mexer aqui sem
-- risco para o resto do sistema.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A regra, uma vez só ────────────────────────────────────────────────────
--
-- Interna: `security definer` SEM portão dentro, e execute revogado de todo
-- mundo. Só outra função `security definer` (que já checou o portão dela)
-- consegue chamar. Deixá-la aberta seria uma porta lateral para o 59 inteiro.

create or replace function public.fn_mestre_diretoria_linhas(
  p_empresa_id uuid,
  p_mes        text,                 -- 'yyyy-MM'
  p_dia_corte  integer default null  -- null = mês inteiro
)
returns table (
  setor_id          uuid,
  cod_grupo_filtro  text,
  nome_grupo_filtro text,
  subgrupo_equipe   text,
  cobradora         text,
  dt_pgto           date,
  tp_doc            text,
  recebido          numeric,
  origem            text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  -- Todas as linhas do mês, SEM o corte. Serve só para resolver nome de grupo
  -- em código: esse mapa é cadastral, não temporal. Cortá-lo faria um grupo que
  -- só recebeu depois do dia 20 sumir do mapa, e as contribuições destinadas a
  -- ele ficariam órfãs por um motivo que não tem nada a ver com data.
  mes_todo as (
    select r.cod_grupo_filtro, r.nome_grupo_filtro
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
       and r.nome_grupo_filtro <> ''
  ),
  nomes as (select distinct cod_grupo_filtro, nome_grupo_filtro from mes_todo),
  -- As linhas que de fato somam, já dentro do corte.
  fatia as (
    select r.*
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and (p_dia_corte is null or extract(day from r.dt_pgto) <= p_dia_corte)
  ),
  resolvida as (
    select f.*,
           n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe,
           me.destino_setor_id,
           -- Grupo só empresta o setor dele quando o vínculo está confirmado.
           -- `novo` é grupo que ninguém conferiu ainda: contar seria inventar
           -- um dono para dinheiro que ainda não tem.
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
  -- 1ª perna: onde a linha conta por direito próprio (ou para onde foi movida).
  select
    case r.destino_equipe
      when 'outro_setor'   then r.destino_setor_id
      when 'somente_geral' then null::uuid
      else r.setor_do_grupo
    end,
    r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
    r.cobradora, r.dt_pgto, r.tp_doc, r.recebido,
    case when r.destino_equipe = 'outro_setor' then 'movido' else 'proprio' end
  from resolvida r

  union all

  -- 2ª perna: o `Integral` cobrado por um grupo PARA outro. Some no destino sem
  -- sair da origem — as duas pernas são reais. Só `Integral`: o `Extra` é a
  -- segunda representação de um pagamento que o destino já tem como direto, e
  -- somá-lo contaria o mesmo dinheiro duas vezes de verdade.
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
  'INTERNA (sem portão): as linhas do 59 já atribuídas a setor, com o corte de dia. Origem: proprio, movido ou integral. Base única das funções do Painel Diretoria.';

revoke all on function public.fn_mestre_diretoria_linhas(uuid, text, integer) from public, anon, authenticated;

-- ── A grade de cards ───────────────────────────────────────────────────────

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
  -- Com setor: vira card. Sem setor: vira o número que explica a diferença
  -- entre a soma dos cards e o total da empresa.
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
  /* Carteira sem setor vinculado vira card também, e não uma sobra no rodapé:
     é dinheiro real do 59 e precisa ser explorável do mesmo jeito. O que ela
     não tem é meta, quartil e projeção — esses vêm do sistema, e o sistema
     ainda não sabe de quem essa carteira é. */
  sem_setor_carteiras as (
    select a.cod_grupo_filtro cod, max(a.nome_grupo_filtro) nome,
           sum(a.recebido)::numeric(14,2) valor,
           count(*)::bigint linhas,
           count(distinct a.cobradora) filter (where a.cobradora <> '')::bigint operadores
      from atual a where a.setor_id is null group by 1
  ),
  sem_setor_ant as (
    select b.cod_grupo_filtro cod, sum(b.recebido)::numeric(14,2) valor
      from anterior b where b.setor_id is null group by 1
  ),
  -- O total da EMPRESA é o do arquivo: sem a 2ª perna do integral, que é a
  -- mesma cobrança contada de novo. É este que fecha com a Visão Geral.
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
  'Grade de setores do Painel Diretoria a partir do 59, no corte de dia. `total_setores` > `total_empresa` e a diferenca e a 2a perna do Integral — nao e erro.';

revoke all on function public.fn_mestre_diretoria_setores(uuid, text, integer) from public, anon;
grant execute on function public.fn_mestre_diretoria_setores(uuid, text, integer) to authenticated;

-- ── O detalhe de UM setor ──────────────────────────────────────────────────

-- Dois modos, e a diferença entre eles é o pedido, não um detalhe:
--
--   setor vinculado   as linhas passam pela ATRIBUIÇÃO — entra o que veio de
--                     fora, sai o que foi movido, soma o Integral cobrado para
--                     ele. É o número que o card mostra.
--   carteira crua     sem atribuição nenhuma: o que está no 59 para aquele
--                     código, e mais nada. Carteira sem setor não tem regra a
--                     aplicar, e inventar uma daria a ela um número que não
--                     existe em lugar nenhum.

create or replace function public.fn_mestre_diretoria_setor(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid    default null,
  p_cod_grupo  text    default null,
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
  -- Um ou outro, nunca os dois: com os dois a função teria que escolher em
  -- silêncio, e a tela mostraria o número do outro sem ninguém notar.
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
    -- Modo carteira crua: direto da tabela, sem passar pela atribuição.
    select null::uuid, r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
           r.cobradora, r.dt_pgto, r.tp_doc, r.recebido, 'proprio'
      from mestre_recebimentos r
      join mestre_lotes lo on lo.id = r.lote_id and lo.estado = 'vigente'
     where p_cod_grupo is not null
       and r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and r.cod_grupo_filtro = p_cod_grupo
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
    select coalesce(nullif(btrim(tp_doc), ''), 'NÃO INFORMADO') forma,
           sum(recebido)::numeric(14,2) valor, count(*)::bigint qtd,
           0::numeric(14,2) valor_anterior
      from atual group by 1
  ),
  /* As equipes NÃO comparam com o mês anterior, de propósito: subgrupo do ERP
     muda de nome entre um mês e outro, e casar por nome produziria «equipe
     nova» e «equipe que sumiu» onde houve só renomeação. Comparação de equipe
     só depois que o vínculo com `equipes` estiver fechado.

     O nome é `equipes_do_59` e NÃO `equipes` porque existe uma TABELA com esse
     nome. Um CTE sombreia a tabela homônima em toda referência não qualificada
     do mesmo comando: com o CTE chamado `equipes`, o `left join equipes eq`
     logo abaixo pegava o CTE em vez da tabela e estourava com «column eq.id
     does not exist» — e só em execução, porque o corpo de uma função plpgsql
     não é planejado na criação. */
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
  /* O vínculo é o que decide como a equipe aparece na tela: sem ele, o subgrupo
     cru do 59; com ele, a equipe do sistema, com líder e foto. Por isso o join
     traz `equipes` e o líder junto — a tela não deve ir buscar isso depois, ou
     desenharia meia equipe enquanto a segunda consulta não voltasse. */
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
         -- Equipe pode ter mais de um líder. A tela mostra UM rosto, e o mais
         -- antigo é o critério estável: o mais recente mudaria a foto do card
         -- toda vez que alguém entrasse na liderança.
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
    -- No modo carteira o «nome» é o da carteira: a tela mostra um título só, e
    -- deixá-lo nulo ali daria um cabeçalho vazio em cima de números cheios.
    'setor_nome',   coalesce(
                      (select nome from setores where id = p_setor_id),
                      (select max(nome_grupo_filtro) from atual),
                      p_cod_grupo),
    -- Vinculado decide como a tela desenha as equipes: cruas do 59, ou as do
    -- sistema com líder e foto.
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
  'Detalhe de UM setor vinculado (p_setor_id, com atribuicao) ou de UMA carteira crua (p_cod_grupo, sem atribuicao): equipes com vinculo e lider, carteiras, formas de pagamento, serie diaria e o mes anterior. Equipe nao compara com o mes anterior de proposito — subgrupo do ERP muda de nome.';

revoke all on function public.fn_mestre_diretoria_setor(uuid, text, uuid, text, integer) from public, anon;
grant execute on function public.fn_mestre_diretoria_setor(uuid, text, uuid, text, integer) to authenticated;

-- ── Teto de tempo ──────────────────────────────────────────────────────────
--
-- `authenticated` corre com `statement_timeout` de 8s. Estas duas varrem o mês
-- DUAS vezes (o mês em foco e o anterior) e cruzam cada linha com
-- `mestre_equipes` e `mestre_grupos` — trabalho legítimo que pode passar de 8s
-- num mês cheio, e que abortaria com um 500 sem explicação, exatamente como o
-- `fn_mestre_promover_lote` fazia antes de `20260908210000`.
--
-- 20s é TETO, não meta: se uma destas chegar perto disso, o problema é índice
-- ou consulta, e o número aqui não deve subir para esconder isso.

alter function public.fn_mestre_diretoria_setores(uuid, text, integer)
  set statement_timeout = '20s';
alter function public.fn_mestre_diretoria_setor(uuid, text, uuid, text, integer)
  set statement_timeout = '20s';

-- ── Verificação ────────────────────────────────────────────────────────────
--
-- O teste que importa não é «a função existe», é «a função NOVA concorda com a
-- que já está no ar». `fn_mestre_resumo_setores` é a dona da regra hoje; se a
-- atribuição desta migration divergir dela no mês inteiro, a divergência entra
-- em produção como um número plausível — e ninguém confere número que já veio
-- pronto. Por isso a migration falha aqui, e não na tela.
--
-- A regra antiga é REESCRITA abaixo em vez de chamada, e não por preguiça:
-- `fn_mestre_resumo_setores` termina em `where fn_user_is_super_admin()`, que lê
-- `auth.uid()`. Dentro de uma migration não há sessão, `auth.uid()` é nulo, e a
-- função devolveria ZERO LINHAS — a comparação passaria sempre, comparando
-- nada com nada. Um teste que nunca falha é pior que nenhum: ele dá confiança
-- sem dar garantia.

do $$
declare
  v_emp   uuid;
  v_mes   text;
  v_novo  numeric;
  v_velho numeric;
  v_dif   numeric;
begin
  select id into v_emp from public.empresas where slug = 'bookplay';
  if v_emp is null then
    raise notice 'empresa bookplay nao encontrada; verificacao pulada';
    return;
  end if;

  -- Mês sem lote: tem que devolver estrutura, e não estourar. É o contrato que
  -- a tela usa para desenhar «sem dados».
  if (public.fn_mestre_diretoria_setores(v_emp, '1999-01', 15)) is null then
    raise exception 'mes sem lote deveria devolver estrutura, veio null';
  end if;
  if jsonb_typeof(public.fn_mestre_diretoria_setores(v_emp, '1999-01', 15)->'setores') <> 'array' then
    raise exception 'setores deveria ser array mesmo sem lote';
  end if;

  -- O mês vigente mais recente, para comparar com a função que já existe.
  select to_char(mes, 'YYYY-MM') into v_mes
    from public.mestre_lotes
   where empresa_id = v_emp and estado = 'vigente'
   order by mes desc limit 1;
  if v_mes is null then
    raise notice 'nenhum lote vigente; comparacao pulada';
    return;
  end if;

  select coalesce(sum((x->>'valor')::numeric), 0) into v_novo
    from jsonb_array_elements(
           public.fn_mestre_diretoria_setores(v_emp, v_mes, 31)->'setores') x;

  -- A regra antiga, reescrita sem o portão. Espelha `fn_mestre_resumo_grupos`
  -- + `fn_mestre_resumo_setores` de `20260904500000`.
  with ref as (select ((v_mes || '-01')::date) as d),
  fatia as (
    select r.* from public.mestre_recebimentos r
      join public.mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = v_emp and r.mes = (select d from ref)
  ),
  nomes as (
    select distinct cod_grupo_filtro, nome_grupo_filtro
      from fatia where nome_grupo_filtro <> ''
  ),
  resolvida as (
    select f.*, n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe
      from fatia f
      cross join lateral (
        select case when f.nome_grupo_filtro <> ''
                     and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                    then substr(f.setor, length(f.nome_grupo_filtro) + 4) end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
      left join public.mestre_equipes me
        on me.empresa_id = v_emp and me.cod_grupo_filtro = f.cod_grupo_filtro
       and me.nome_subgrupo = f.subgrupo_equipe
  ),
  propria as (
    select cod_grupo_filtro cod, sum(recebido) valor,
           sum(recebido) filter (where destino_equipe = 'outro_setor')   saiu_outro,
           sum(recebido) filter (where destino_equipe = 'somente_geral') saiu_geral
      from resolvida group by 1
  ),
  contribuida as (
    select cod_destino cod, sum(recebido) filter (where lower(tipo) <> 'extra') integral
      from resolvida
     where cod_destino is not null and cod_destino <> cod_grupo_filtro
     group by 1
  ),
  por_grupo as (
    select coalesce(p.valor, 0) + coalesce(c.integral, 0)
           - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0) as total
      from public.mestre_grupos g
      left join propria     p on p.cod = g.cod_grupo_filtro
      left join contribuida c on c.cod = g.cod_grupo_filtro
     where g.empresa_id = v_emp and g.setor_id is not null and g.estado = 'vinculado'
  ),
  movido as (
    select sum(r.recebido) valor
      from public.mestre_recebimentos r
      join public.mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join public.mestre_equipes me
        on me.empresa_id = r.empresa_id and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     join public.setores ds on ds.id = me.destino_setor_id and ds.empresa_id = v_emp
     where r.empresa_id = v_emp and r.mes = (select d from ref)
       and me.destino = 'outro_setor'
  )
  select coalesce((select sum(total) from por_grupo), 0)
       + coalesce((select valor from movido), 0)
    into v_velho;

  v_dif := abs(coalesce(v_novo, 0) - coalesce(v_velho, 0));

  -- Um centavo de folga para arredondamento de `numeric(14,2)` somado em ordens
  -- diferentes. Qualquer coisa acima disso é regra divergente, não arredondamento.
  if v_velho > 0 and v_dif > 0.01 then
    raise exception
      'atribuicao divergente em %: nova = %, fn_mestre_resumo_setores = % (dif %)',
      v_mes, v_novo, v_velho, v_dif;
  end if;

  raise notice 'setores do 59 em %: nova = %, existente = % (dif %)',
    v_mes, v_novo, v_velho, v_dif;
end;
$$;
