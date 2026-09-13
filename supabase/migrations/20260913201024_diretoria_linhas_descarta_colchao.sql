-- ═══════════════════════════════════════════════════════════════════════════
-- `fn_mestre_diretoria_linhas` passa a aplicar a regra do Colchão
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Irmã da 20260913200932. Esta função é a base de Setores e Equipes, e era uma
-- das que liam `mestre_recebimentos` sem consultar `fn_mestre_conta_na_meta` —
-- a lacuna que a 20260910215830 diagnosticou em 10/09 e não fechou.
--
-- Uma linha só, na CTE `fatia`, porque as duas pernas de baixo (própria e
-- Integral) derivam dela. Filtrar na entrada é o que garante que as duas
-- respondam à mesma regra.
--
-- `mes_todo`/`nomes` NÃO é filtrado de propósito: é mapa cadastral de
-- nome→código, não dinheiro. Filtrá-lo faria contribuição ficar órfã porque a
-- linha que dá nome ao grupo era de colchão.
--
-- `fn_mestre_diretoria_setores` não precisa de migration própria: ela não lê a
-- tabela, chama esta função. Corrigir aqui corrige as duas.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

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
    case when r.destino_equipe = 'outro_setor' then 'movido' else 'proprio' end
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
  'Colchao NAO entra: ele conta no total da empresa e fica fora de setor, '
  'equipe e operador, igual a Retencao. Base de fn_mestre_diretoria_setores e '
  'de fn_mestre_diretoria_setor.';

commit;
