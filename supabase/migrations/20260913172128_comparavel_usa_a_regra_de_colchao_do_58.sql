-- ═══════════════════════════════════════════════════════════════════════════
-- O comparável passa a usar a regra de colchão DO 58, não a da meta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O defeito, e ele nasceu na 20260913154346
--
-- `mestre_comparavel` filtrava por `fn_mestre_conta_na_meta`. Essa função
-- responde a pergunta de NEGÓCIO — «esta linha conta na meta?» — e desde a
-- 20260910215830 ela diz SIM para colchão a partir de 2026-09.
--
-- Só que o comparável responde outra pergunta: «o 58 pode ter esta linha?». E o
-- parser do 58 (`colchaoContaNaMeta`, em `analiticoComum.ts`) manda colchão para
-- `analitico_colchao_fora_meta` SEMPRE, menos na janela 01–14/08/2026. Ele nunca
-- entra em `analitico_recebimentos`.
--
-- Em agosto as duas regras coincidem, e por isso o defeito não apareceu quando a
-- migration anterior foi medida. De setembro em diante elas divergem, e o
-- comparável passou a carregar dinheiro que o outro lado não tem como ter:
--
--   Receptivo, setembro/2026 ..... R$ 77.450,26 de colchão
--   Play 5 ....................... R$    857,33
--   Play Mix ..................... R$    300,00
--   Play 4 ....................... R$    263,00
--
-- Conferido dos dois lados: o colchão de setembro do Play 4 são R$ 263,00 no 59
-- e os mesmos R$ 263,00 em `analitico_colchao_fora_meta` — está guardado, só não
-- no lugar que o comparável lê.
--
-- ## A correção: duas perguntas, dois predicados
--
--   `fn_mestre_conta_na_meta`  regra de negócio. Colchão conta de 2026-09 em
--                              diante. Quem usa: resumo_grupos, empréstimo,
--                              `mestre_total`. NÃO muda.
--   `fn_mestre_esta_no_58`     o que o analítico pode ter. Colchão só em
--                              01–14/08/2026. Quem usa: o comparável.
--
-- O comparável deixa de derivar de `recebido_proprio` (que passa pelo filtro de
-- meta) e passa a ser somado direto de `mestre_recebimentos` com o filtro do 58,
-- na CTE `no58`. `mestre_retencao` e `mestre_colchao_fora` vêm da mesma CTE, para
-- as três colunas responderem à mesma pergunta.
--
-- `mestre_colchao_fora` muda de sentido, e para melhor: era «colchão fora da
-- janela da meta» (zero em setembro, inútil); passa a ser «colchão que o 58 não
-- guarda», que é a parcela que de fato separa os dois lados.
--
-- ## O efeito medido, setembro/2026
--
--   Receptivo .... comparável 1.244.800,80 → 1.167.350,54, contra
--                  1.167.350,54 no analítico → diferença ZERO, exata.
--
-- Os outros três continuam com diferença positiva, e é esperado: o 58 deles está
-- menos atualizado que o 59 (Play 4 e Play Mix até 11/09, Play 5 até 12/09,
-- enquanto o lote do 59 vai até 14/09).
--
-- ## Escrita: nenhuma
--
-- Uma função nova de seis linhas e um `create or replace` de leitura. Nenhuma
-- linha de dado é tocada.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_esta_no_58(p_colchao boolean, p_dt date)
returns boolean
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select not coalesce(p_colchao, false)
      or (p_dt >= date '2026-08-01' and p_dt <= date '2026-08-14');
$function$;

comment on function public.fn_mestre_esta_no_58(boolean, date) is
  'Esta linha do 59 pode estar em analitico_recebimentos? Espelha o '
  'colchaoContaNaMeta do parser do 58: colchao so entrou no analitico em '
  '01-14/08/2026; fora dessa janela vai para analitico_colchao_fora_meta. NAO '
  'confundir com fn_mestre_conta_na_meta, que responde a regra de NEGOCIO (o '
  'colchao conta de setembro em diante). As duas divergem de 2026-09 em diante, '
  'e e essa divergencia que inflava o comparavel.';

grant execute on function public.fn_mestre_esta_no_58(boolean, date) to authenticated;

create or replace function public.fn_mestre_comparar_setores(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  cod_grupo_filtro          text,
  rotulo                    text,
  setor_id                  uuid,
  setor_nome                text,
  estado                    text,
  mestre_total              numeric,
  mestre_proprio            numeric,
  mestre_contribuido        numeric,
  mestre_colchao_fora       numeric,
  mestre_emprestado_para    numeric,
  mestre_emprestado_de      numeric,
  mestre_retencao           numeric,
  mestre_fora_do_58         numeric,
  mestre_comparavel         numeric,
  sistema_total             numeric,
  sistema_linhas            bigint,
  sistema_analitico         numeric,
  sistema_ajustes           numeric,
  sistema_contrib_receptivo numeric,
  diferenca                 numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  m as (
    select g.cod_grupo_filtro, g.nome_no_relatorio, g.nome_cadastrado,
           g.setor_id, g.setor_nome, g.estado,
           g.recebido_total, g.recebido_proprio, g.contrib_integral,
           g.emprestado_para, g.saiu_outro_setor, g.saiu_somente_geral
      from fn_mestre_resumo_grupos(p_empresa_id, p_mes) g
  ),
  /*
   * ── O recorte do 58, somado direto da fonte ──
   *
   * Não vem de `recebido_proprio`: aquela coluna passa pelo filtro de META, e é
   * exatamente essa diferença que esta migration corrige. `saiu_outro_setor` NÃO
   * é descontado — o 58 da carteira traz aquelas linhas; mover equipe entre
   * setores é decisão daqui, que o arquivo do ERP desconhece.
   */
  no58 as (
    select r.cod_grupo_filtro as cod,
           sum(r.recebido) filter (
             where fn_mestre_esta_no_58(r.colchao, r.dt_pgto)
               and coalesce(me.destino, 'proprio') <> 'somente_geral') as valor,
           sum(r.recebido) filter (
             where fn_mestre_esta_no_58(r.colchao, r.dt_pgto)
               and coalesce(me.destino, 'proprio') =  'somente_geral') as retencao,
           sum(r.recebido) filter (
             where r.colchao
               and not fn_mestre_esta_no_58(r.colchao, r.dt_pgto)
               and coalesce(me.destino, 'proprio') <> 'somente_geral') as colchao_fora
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
     group by 1
  ),
  movido as (
    select me.destino_setor_id as setor_id, sum(r.recebido) as valor
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and me.destino = 'outro_setor'
       and me.destino_setor_id is not null
     group by me.destino_setor_id
  ),
  emp as (
    select e.setor_id, e.valor from fn_mestre_emprestimo_do_setor(p_empresa_id, p_mes) e
  ),
  principal as (
    select distinct on (m.setor_id) m.setor_id, m.cod_grupo_filtro
      from m where m.setor_id is not null and m.estado = 'vinculado'
     order by m.setor_id, m.recebido_total desc, m.cod_grupo_filtro
  ),
  sis as (
    select a.setor_id,
           sum(a.valor_recebido) as total,
           count(*)::bigint      as linhas
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.data_pagamento >= (select d from ref)
       and a.data_pagamento <  ((select d from ref) + interval '1 month')
       and a.setor_id is not null
     group by a.setor_id
  ),
  aju as (
    select j.setor_id, sum(j.valor) as valor
      from analitico_ajustes_manuais j
     where j.empresa_id = p_empresa_id
       and j.mes_referencia = (select d from ref)
       and not j.cancelado
       and j.setor_id is not null
     group by j.setor_id
  ),
  crec as (
    select c.setor_id, sum(c.acumulado) as valor
      from contribuicao_receptivo c
     where c.empresa_id = p_empresa_id and c.mes = p_mes
     group by c.setor_id
  ),
  base as (
    select m.*,
           case when pr.cod_grupo_filtro = m.cod_grupo_filtro
                then coalesce(mv.valor, 0) + coalesce(ep.valor, 0) else 0 end as chegou,
           coalesce(ep.valor, 0) as emprestado_de,
           coalesce(s.total, 0)  as sis_analitico,
           coalesce(s.linhas, 0) as sis_linhas,
           coalesce(a.valor, 0)  as sis_ajustes,
           coalesce(cr.valor, 0) as sis_contrib,
           coalesce(n.valor, 0)        as comparavel,
           coalesce(n.retencao, 0)     as retencao_58,
           coalesce(n.colchao_fora, 0) as colchao_fora_58
      from m
      left join no58 n        on n.cod      = m.cod_grupo_filtro
      left join sis s         on s.setor_id  = m.setor_id
      left join movido mv     on mv.setor_id = m.setor_id
      left join emp ep        on ep.setor_id = m.setor_id
      left join principal pr  on pr.setor_id = m.setor_id
      left join aju a         on a.setor_id  = m.setor_id
      left join crec cr       on cr.setor_id = m.setor_id
  )
  select
    b.cod_grupo_filtro,
    coalesce(nullif(b.nome_no_relatorio, ''), b.nome_cadastrado),
    b.setor_id,
    b.setor_nome,
    b.estado,
    b.recebido_total + b.chegou,
    b.recebido_proprio,
    b.contrib_integral,
    b.colchao_fora_58,
    b.emprestado_para,
    b.emprestado_de,
    b.retencao_58,
    (b.recebido_total + b.chegou) - b.comparavel,
    b.comparavel,
    b.sis_analitico + b.sis_ajustes,
    b.sis_linhas,
    b.sis_analitico,
    b.sis_ajustes,
    b.sis_contrib,
    b.comparavel - (b.sis_analitico + b.sis_ajustes)
  from base b
  where fn_user_is_super_admin()
  order by 6 desc, b.cod_grupo_filtro;
$function$;

comment on function public.fn_mestre_comparar_setores(uuid, text) is
  'O mestre contra analitico_recebimentos, por carteira. mestre_comparavel usa o '
  'MESMO recorte do 58: carteira, regra de colchao do 58 (fn_mestre_esta_no_58) e '
  'sem as equipes somente_geral (Retencao). mestre_total segue sendo o numero real '
  'do setor. So leitura.';

commit;
