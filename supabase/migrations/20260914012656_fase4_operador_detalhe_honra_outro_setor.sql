-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4: o detalhe da pessoa passa a honrar o destino do subgrupo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ver `20260914012331` para a armadilha inteira.
--
-- ## Duas colunas, não uma — e a distinção importa
--
-- Esta função devolve três quebras, e elas respondem coisas diferentes:
--
--   por_setor ..... para onde o dinheiro FOI. Usa o setor RESOLVIDO: se o
--                   subgrupo foi mandado para outro setor, foi lá que contou.
--   por_carteira .. de quem é a carteira. Continua usando o setor da CARTEIRA,
--                   porque o redirecionamento é por subgrupo e não muda a quem
--                   a carteira pertence. Rotular a carteira com o destino de um
--                   de seus subgrupos seria mentir sobre o cadastro.
--   por_equipe .... não mexe com setor.
--
-- Colapsar as duas numa só seria mais curto e erraria uma das duas perguntas.
--
-- ## Inerte agora
--
-- Nenhuma linha tem `destino = 'outro_setor'`, então resolvido = carteira em
-- todas elas. Ver a prova em `20260914012331`.
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_operador_detalhe(
  p_empresa_id uuid, p_mes text, p_cobradora text, p_dia_corte integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set statement_timeout to '20s'
as $function$
declare
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
           -- De quem e a CARTEIRA. Nao muda com o destino do subgrupo.
           g.setor_id as setor_da_carteira,
           -- Para onde o DINHEIRO foi.
           fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id)
             as setor_de_destino,
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
   * Por setor: para onde o dinheiro FOI. Carteira sem vinculo NAO e erro — e
   * setor que ainda nao foi cadastrado na planilha, ou que esta com outro nome.
   * Ela aparece com o nome que o ERP manda e `oficial = false`, e o valor conta
   * do mesmo jeito.
   */
  por_setor as (
    select f.setor_de_destino as setor_id,
           coalesce(max(cms.nome), max(s.nome),
                    'Sem vinculo · ' || string_agg(distinct f.nome_grupo_filtro, ' / ')) as rotulo,
           (f.setor_de_destino is not null) as oficial,
           (f.setor_de_destino is not distinct from (select q.setor_id from quem q)) as e_o_setor_dele,
           round(sum(f.recebido), 2) as valor,
           count(*)::bigint as linhas
      from fatia f
      left join composicao_mes_setor cms
        on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = f.setor_de_destino
      left join setores s on s.id = f.setor_de_destino
     group by f.setor_de_destino
  ),
  -- Por carteira: de quem e a carteira. Setor da CARTEIRA, de proposito.
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

commit;
