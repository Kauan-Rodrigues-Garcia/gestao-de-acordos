-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4: a aba «Por pessoa» passa a honrar o destino do subgrupo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ver `20260914012331` para a armadilha inteira. Em resumo: `destino` é regra
-- de três vias, esta função só implementava duas, e `outro_setor` caía no setor
-- da CARTEIRA — justamente o setor de onde o dinheiro deveria ter saído.
--
-- ## O que NÃO muda, e por que importa
--
-- O filtro `<> 'somente_geral'` continua igual. Trocá-lo por «setor resolvido
-- não é nulo» pareceria mais limpo e estaria errado: carteira SEM VÍNCULO
-- também resolve para nulo, e essas linhas precisam continuar entrando no
-- `total` da pessoa e caindo em `fora_do_setor_dele`. Sumir com elas esconderia
-- exatamente o dinheiro que a aba existe para mostrar.
--
-- Só a DECISÃO do setor muda. Como o filtro já garante que `destino` não é
-- `somente_geral`, o helper aqui devolve `destino_setor_id` quando for
-- `outro_setor` e `g.setor_id` no resto — inclusive nulo quando não há vínculo,
-- que é o comportamento de hoje.
--
-- ## Inerte agora
--
-- Nenhuma linha de `mestre_equipes` tem `destino = 'outro_setor'`, então o
-- resultado é idêntico ao de antes. Verificado em agosto + setembro/2026:
-- 69.737 linhas, zero divergem, R$ 13.149.666,99 iguais dos dois lados.
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_operadores_do_mes(
  p_empresa_id uuid, p_mes text, p_dia_corte integer default null
)
returns table(cobradora text, operador_id uuid, nome text, tem_perfil boolean,
              setor_do_operador_id uuid, setor_do_operador text, total numeric,
              no_setor_dele numeric, fora_do_setor_dele numeric,
              linhas bigint, carteiras bigint, subgrupos bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.cobradora, r.operador_id, r.operador_setor_id, r.recebido,
           r.cod_grupo_filtro, r.subgrupo_equipe,
           -- Para que setor esta linha conta. `fn_mestre_setor_resolvido`
           -- decide num lugar so; o filtro abaixo ja tirou o `somente_geral`,
           -- entao aqui sobra `outro_setor` → destino, ou o setor da carteira.
           fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id)
             as setor_de_destino
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
             where f.setor_de_destino is not null
               and f.setor_de_destino = f.operador_setor_id), 0), 2) as no_setor,
           round(coalesce(sum(f.recebido) filter (
             where f.setor_de_destino is null
                or f.setor_de_destino is distinct from f.operador_setor_id), 0), 2) as fora_do_setor,
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
    -- O resto: carteira de outro setor, carteira sem vinculo, ou subgrupo
    -- mandado para outro setor de proposito. Nao some — fica visivel no
    -- detalhe, que e o que a diretoria precisa enxergar.
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

commit;
