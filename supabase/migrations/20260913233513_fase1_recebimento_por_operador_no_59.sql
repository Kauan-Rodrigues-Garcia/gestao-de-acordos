-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 1: o recebimento de cada PESSOA no 59, e para onde ele foi
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fase 1 do `docs/PLANO-SINCRONIZACAO-59.md`.
--
-- ## Por que somar pela COBRADORA
--
-- O recebimento de uma pessoa se espalha: ela cobra em mais de uma carteira
-- (`cod_grupo_filtro`) e aparece em mais de um subgrupo no mesmo mês. Qualquer
-- recorte por carteira devolve pedaço, nunca a pessoa.
--
-- ## Os dois números, e os dois estão certos
--
--   `total` .......... tudo o que a pessoa cobrou, em qualquer carteira
--   `no_setor_dele` .. a parte que caiu no setor DELA
--
-- Medido em 01–10/09/2026, e é o que fecha a história:
--
--   KAROLAINE_SILVA .. total 37.081,78 · no setor dela 7.445,58
--   HELTON_ROLDON .... total 30.281,46 · no setor dele  1.743,78
--   NANCI_MOREIRA .... total 34.814,42 · no setor dela 33.067,14
--
-- Os três valores da coluna da direita batem **ao centavo** com o 58 daqueles
-- setores. O que parecia «18 operadores divergentes» era isto: a diferença não
-- era erro, era a parte cobrada fora do setor da pessoa — que o 58 do setor dela
-- nunca teve como ter.
--
-- `no_setor_dele` é o número que o operador vê. `fora_do_setor_dele` não some:
-- abre no detalhe, dizendo para qual setor, carteira e equipe cada parte foi.
--
-- ## Carteira sem vínculo NÃO é erro
--
-- Setor que ainda não foi cadastrado na planilha aparece com o nome que o ERP
-- manda e `oficial = false`. O valor conta do mesmo jeito — vincular é o que o
-- torna oficial, não o que o faz existir. Em setembro isso são R$ 1.106.040,43
-- em cinco carteiras, e transformá-las em «divergência» faria a tela acusar um
-- problema que não existe.
--
-- ## O nome vem congelado
--
-- `composicao_mes` e `composicao_mes_setor` guardam nome de pessoa e de setor
-- NAQUELE mês. Quem foi renomeado, mudou de setor ou saiu depois continua
-- aparecendo como estava. `perfis`/`setores` são o plano B, para mês sem
-- composição.
--
-- ## Escrita: nenhuma
--
-- Duas funções de leitura.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ── A lista: quem recebeu o quê, no mês ────────────────────────────────────

create or replace function public.fn_mestre_operadores_do_mes(
  p_empresa_id uuid,
  p_mes        text,
  p_dia_corte  integer default null
)
returns table(
  cobradora            text,
  operador_id          uuid,
  nome                 text,
  tem_perfil           boolean,
  setor_do_operador_id uuid,
  setor_do_operador    text,
  total                numeric,
  no_setor_dele        numeric,
  fora_do_setor_dele   numeric,
  linhas               bigint,
  carteiras            bigint,
  subgrupos            bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.cobradora, r.operador_id, r.operador_setor_id, r.recebido,
           r.cod_grupo_filtro, r.subgrupo_equipe,
           g.setor_id as setor_da_carteira
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      left join mestre_grupos g
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
       and coalesce(me.destino, 'proprio') <> 'somente_geral'
       and (p_dia_corte is null or extract(day from r.dt_pgto) <= p_dia_corte)
       and btrim(r.cobradora) <> ''
  ),
  -- `uuid` nao tem `max()`. `array_agg` filtrando o nulo devolve o id quando
  -- existe, e nada quando a pessoa nao tem perfil — que e um caso normal aqui.
  agrupada as (
    select f.cobradora,
           (array_agg(distinct f.operador_id)
              filter (where f.operador_id is not null))[1]        as operador_id,
           (array_agg(distinct f.operador_setor_id)
              filter (where f.operador_setor_id is not null))[1]  as setor_id,
           bool_or(f.operador_id is not null)                     as tem_perfil,
           round(sum(f.recebido), 2)                              as total,
           round(coalesce(sum(f.recebido) filter (
             where f.setor_da_carteira is not null
               and f.setor_da_carteira = f.operador_setor_id), 0), 2) as no_setor,
           round(coalesce(sum(f.recebido) filter (
             where f.setor_da_carteira is null
                or f.setor_da_carteira is distinct from f.operador_setor_id), 0), 2) as fora_do_setor,
           count(*)::bigint                                       as linhas,
           count(distinct f.cod_grupo_filtro)::bigint             as carteiras,
           count(distinct f.subgrupo_equipe)::bigint              as subgrupos
      from fatia f
     group by f.cobradora
  )
  select
    a.cobradora,
    a.operador_id,
    -- O nome NAQUELE mes. Quem foi renomeado ou saiu depois continua aparecendo
    -- com o nome que tinha. `perfis` e o plano B, para mes sem composicao.
    coalesce(cm.nome, p.nome),
    a.tem_perfil,
    a.setor_id,
    coalesce(cms.nome, s.nome),
    a.total,
    -- A parte que caiu no setor da PESSOA. E este o numero que o operador ve.
    a.no_setor,
    -- O resto: carteira de outro setor, ou carteira sem vinculo. Nao some —
    -- fica visivel no detalhe, que e o que a diretoria precisa enxergar.
    a.fora_do_setor,
    a.linhas, a.carteiras, a.subgrupos
  from agrupada a
  left join composicao_mes cm
    on cm.empresa_id = p_empresa_id and cm.mes = p_mes and cm.operador_id = a.operador_id
  left join perfis p on p.id = a.operador_id
  left join composicao_mes_setor cms
    on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = a.setor_id
  left join setores s on s.id = a.setor_id
  where fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)
  order by a.total desc, a.cobradora;
$function$;

comment on function public.fn_mestre_operadores_do_mes(uuid, text, integer) is
  'O recebimento de cada pessoa no 59, somado pela COBRADORA — atravessa '
  'carteira e subgrupo, que e o ponto. `no_setor_dele` e o que caiu no setor da '
  'pessoa; `fora_do_setor_dele` e o resto, que nao some e abre no detalhe. Nome '
  'e setor vem de composicao_mes (congelados naquele mes). So leitura.';

grant execute on function public.fn_mestre_operadores_do_mes(uuid, text, integer) to authenticated;

-- ── O detalhe de uma pessoa: para onde cada parte foi ──────────────────────
--
-- ⚠️ A versão aplicada aqui trazia uma variável morta (`v_mes uuid`), removida
--    logo em seguida pela `20260913234141`. Esta é a que rodou; a seguinte é a
--    que vale.

create or replace function public.fn_mestre_operador_detalhe(
  p_empresa_id uuid,
  p_mes        text,
  p_cobradora  text,
  p_dia_corte  integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
as $function$
declare
  v_mes uuid;
  v_res jsonb;
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  with fatia as (
    select r.cobradora, r.operador_id, r.operador_setor_id, r.recebido, r.dt_pgto,
           r.cod_grupo_filtro, r.nome_grupo_filtro, r.subgrupo_equipe,
           g.setor_id as setor_da_carteira,
           me.equipe_id
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      left join mestre_grupos g
        on g.empresa_id = r.empresa_id
       and g.cod_grupo_filtro = r.cod_grupo_filtro
       and g.estado = 'vinculado'
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = ((p_mes || '-01')::date)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and coalesce(me.destino, 'proprio') <> 'somente_geral'
       and (p_dia_corte is null or extract(day from r.dt_pgto) <= p_dia_corte)
       and upper(btrim(r.cobradora)) = upper(btrim(p_cobradora))
  ),
  quem as (
    select (array_agg(distinct f.operador_id)
              filter (where f.operador_id is not null))[1]       as operador_id,
           (array_agg(distinct f.operador_setor_id)
              filter (where f.operador_setor_id is not null))[1] as setor_id,
           bool_or(f.operador_id is not null)                    as tem_perfil,
           round(sum(f.recebido), 2)                             as total
      from fatia f
  ),
  /*
   * Por setor. Carteira sem vinculo NAO e erro — e setor que ainda nao foi
   * cadastrado na planilha, ou que esta com outro nome. Ela aparece com o nome
   * que o ERP manda e `oficial = false`, e o valor conta do mesmo jeito.
   */
  por_setor as (
    select f.setor_da_carteira as setor_id,
           coalesce(max(cms.nome), max(s.nome),
                    'Sem vinculo · ' || string_agg(distinct f.nome_grupo_filtro, ' / ')) as rotulo,
           (f.setor_da_carteira is not null) as oficial,
           (f.setor_da_carteira is not distinct from (select q.setor_id from quem q)) as e_o_setor_dele,
           round(sum(f.recebido), 2) as valor,
           count(*)::bigint as linhas
      from fatia f
      left join composicao_mes_setor cms
        on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = f.setor_da_carteira
      left join setores s on s.id = f.setor_da_carteira
     group by f.setor_da_carteira
  ),
  por_carteira as (
    select f.cod_grupo_filtro as cod,
           max(f.nome_grupo_filtro) as nome,
           (f.setor_da_carteira is not null) as oficial,
           coalesce(max(cms.nome), max(s.nome)) as setor_nome,
           round(sum(f.recebido), 2) as valor,
           count(*)::bigint as linhas
      from fatia f
      left join composicao_mes_setor cms
        on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = f.setor_da_carteira
      left join setores s on s.id = f.setor_da_carteira
     group by f.cod_grupo_filtro, f.setor_da_carteira
  ),
  por_equipe as (
    select f.subgrupo_equipe as subgrupo,
           f.cod_grupo_filtro as cod,
           max(f.nome_grupo_filtro) as carteira,
           f.equipe_id,
           coalesce(max(cme.nome), max(eq.nome)) as equipe_nome,
           (f.equipe_id is not null) as vinculada,
           round(sum(f.recebido), 2) as valor,
           count(*)::bigint as linhas
      from fatia f
      left join composicao_mes_equipe cme
        on cme.empresa_id = p_empresa_id and cme.mes = p_mes and cme.equipe_id = f.equipe_id
      left join equipes eq on eq.id = f.equipe_id
     group by f.subgrupo_equipe, f.cod_grupo_filtro, f.equipe_id
  ),
  por_dia as (
    select f.dt_pgto as dia, round(sum(f.recebido), 2) as valor, count(*)::bigint as linhas
      from fatia f group by f.dt_pgto
  )
  select jsonb_build_object(
    'cobradora',   upper(btrim(p_cobradora)),
    'mes',         p_mes,
    'operador_id', (select q.operador_id from quem q),
    'tem_perfil',  coalesce((select q.tem_perfil from quem q), false),
    'nome',        coalesce(
                     (select cm.nome from composicao_mes cm
                       where cm.empresa_id = p_empresa_id and cm.mes = p_mes
                         and cm.operador_id = (select q.operador_id from quem q)),
                     (select pf.nome from perfis pf
                       where pf.id = (select q.operador_id from quem q))),
    'setor_do_operador_id', (select q.setor_id from quem q),
    'setor_do_operador', coalesce(
                     (select cms.nome from composicao_mes_setor cms
                       where cms.empresa_id = p_empresa_id and cms.mes = p_mes
                         and cms.setor_id = (select q.setor_id from quem q)),
                     (select se.nome from setores se
                       where se.id = (select q.setor_id from quem q))),
    'total',       coalesce((select q.total from quem q), 0),
    'no_setor_dele', coalesce((select sum(ps.valor) from por_setor ps where ps.e_o_setor_dele), 0),
    'fora_do_setor_dele', coalesce((select sum(ps.valor) from por_setor ps where not ps.e_o_setor_dele), 0),
    'por_setor',   coalesce((select jsonb_agg(jsonb_build_object(
                     'setor_id', ps.setor_id, 'rotulo', ps.rotulo, 'oficial', ps.oficial,
                     'e_o_setor_dele', ps.e_o_setor_dele, 'valor', ps.valor, 'linhas', ps.linhas)
                     order by ps.valor desc) from por_setor ps), '[]'::jsonb),
    'por_carteira', coalesce((select jsonb_agg(jsonb_build_object(
                     'cod', pc.cod, 'nome', pc.nome, 'oficial', pc.oficial,
                     'setor_nome', pc.setor_nome, 'valor', pc.valor, 'linhas', pc.linhas)
                     order by pc.valor desc) from por_carteira pc), '[]'::jsonb),
    'por_equipe',  coalesce((select jsonb_agg(jsonb_build_object(
                     'subgrupo', pe.subgrupo, 'cod_grupo', pe.cod, 'carteira', pe.carteira,
                     'equipe_id', pe.equipe_id, 'equipe_nome', pe.equipe_nome,
                     'vinculada', pe.vinculada, 'valor', pe.valor, 'linhas', pe.linhas)
                     order by pe.valor desc) from por_equipe pe), '[]'::jsonb),
    'por_dia',     coalesce((select jsonb_agg(jsonb_build_object(
                     'dia', pd.dia, 'valor', pd.valor, 'linhas', pd.linhas)
                     order by pd.dia) from por_dia pd), '[]'::jsonb)
  ) into v_res;

  return v_res;
end;
$function$;

comment on function public.fn_mestre_operador_detalhe(uuid, text, text, integer) is
  'Para onde foi cada parte do recebimento de uma pessoa: por setor, por '
  'carteira, por equipe e por dia. Carteira sem vinculo aparece com o nome do '
  'ERP e oficial=false — nao e erro, e cadastro pendente. So leitura.';

grant execute on function public.fn_mestre_operador_detalhe(uuid, text, text, integer) to authenticated;

commit;
