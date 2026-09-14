-- ═══════════════════════════════════════════════════════════════════════════
-- Correção: a projeção saiu SECURITY DEFINER sem trava de acesso
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `fn_mestre_projecao_analitico` foi publicada minutos antes sem a cláusula
-- `fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)`. Sendo
-- SECURITY DEFINER, ela ignora o RLS: qualquer usuário autenticado poderia
-- passar o uuid de OUTRA empresa e receber os recebimentos dela.
--
-- Todas as outras funções desta sequência têm essa cláusula. Esta escapou, e
-- fica registrada em migration própria em vez de ser corrigida em silêncio no
-- arquivo anterior — o histórico tem de mostrar que a falha existiu e por
-- quanto tempo.
--
-- A janela foi de minutos, entre `20260914024100` e esta, e ninguém além de
-- quem a escreveu sabia que a função existia.
--
-- O corpo aplicado aqui é idêntico ao de `20260914024100` com a cláusula de
-- acesso acrescentada no `where` da CTE `base` — e aquele arquivo já traz o
-- corpo corrigido, para que quem reconstruir o banco pelos arquivos não passe
-- pelo estado vulnerável.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_projecao_analitico(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid default null
)
returns table(
  setor_id         uuid,
  operador_id      uuid,
  operador_usuario text,
  codigo           text,
  data_pagamento   date,
  forma_pagamento  text,
  forma_detalhe    text,
  nome_cliente     text,
  instituicao      text,
  tipo_comissao    text,
  valor_recebido   numeric,
  linhas_no_59     bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  canon as (
    select upper(a.operador_usuario) as k,
           (array_agg(a.operador_usuario order by a.importado_em desc))[1] as v
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
     group by 1
  ),
  base as (
    select fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) as setor_id,
           r.operador_id,
           coalesce(c.v, btrim(r.cobradora)) as operador_usuario,
           r.nr_documento                    as codigo,
           r.dt_pgto                         as data_pagamento,
           fn_analitico_forma_do_tpdoc(r.tp_doc) as forma_pagamento,
           btrim(r.tp_doc)                   as forma_detalhe,
           nullif(btrim(r.cliente), '')      as nome_cliente,
           nullif(btrim(r.empresa_erp), '')  as instituicao,
           case lower(btrim(coalesce(r.tipo, '')))
             when 'extra'    then 'Extra'
             when 'integral' then 'Integral'
           end                               as tipo_comissao,
           r.recebido
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
      left join canon c on c.k = upper(btrim(r.cobradora))
     where r.empresa_id = p_empresa_id
       -- A trava que faltava.
       and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
       and r.mes = (select d from ref)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) is not null
       and coalesce(r.nr_documento, '') <> ''
       and btrim(r.cobradora) <> ''
       and r.dt_pgto is not null
  )
  select b.setor_id,
         (array_agg(distinct b.operador_id) filter (where b.operador_id is not null))[1],
         b.operador_usuario, b.codigo, b.data_pagamento, b.forma_pagamento,
         max(b.forma_detalhe), max(b.nome_cliente), max(b.instituicao),
         case when count(distinct b.tipo_comissao) = 1
              then max(b.tipo_comissao) end,
         round(sum(b.recebido), 2),
         count(*)::bigint
    from base b
   where (p_setor_id is null or b.setor_id = p_setor_id)
   group by b.setor_id, b.operador_usuario, b.codigo, b.data_pagamento, b.forma_pagamento;
$function$;

commit;
