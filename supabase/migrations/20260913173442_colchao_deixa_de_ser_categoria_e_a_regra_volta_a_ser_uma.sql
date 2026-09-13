-- ═══════════════════════════════════════════════════════════════════════════
-- O Colchão deixa de ser categoria, e a regra volta a ser UMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## A decisão, de 13/09/2026
--
-- O Colchão era uma exceção de agosto/2026. O relatório passou a trazer esses
-- valores corretos, e a diretoria decidiu: de 01/09/2026 em diante uma linha
-- marcada `Colchão? = Sim` é linha comum. Sem desvio, sem contador próprio,
-- sem tabela à parte.
--
-- Agosto/2026 fica exatamente como está — inclusive a janela 01–14 —, e os
-- meses anteriores também. Mudar o passado reescreveria fechamento conferido.
--
-- ## Por que `fn_mestre_esta_no_58` sai, poucas horas depois de entrar
--
-- Ela nasceu na 20260913172128 para separar duas perguntas que tinham
-- divergido: «conta na meta?» (negócio) e «está no 58?» (o que o analítico
-- pode ter). A divergência era o colchão de setembro, e ela acabou de ser
-- abolida — as duas perguntas voltaram a ter a mesma resposta.
--
-- Manter dois predicados idênticos é convite para eles derivarem. Fica
-- `fn_mestre_conta_na_meta`, que é a regra de negócio e o espelho do
-- `colchaoContaNaMeta`/`colchaoEhSeparado` do parser. Uma regra, um lugar.
--
-- ## ⚠️ Setembro já importado precisa de reimportação
--
-- A classificação é gravada na linha no momento da importação, não
-- recalculada na leitura. Setembro/2026 que entrou ANTES desta mudança tem o
-- colchão em `analitico_colchao_fora_meta`, fora do Analítico. Até cada setor
-- reimportar, a comparação vai acusar esse valor como NR «só no 59» — o que é
-- verdade: o dinheiro ainda não está no analítico.
--
-- ## Escrita: nenhuma
--
-- `create or replace` de função de leitura. Nenhuma linha de dado é tocada.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

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
   * Continua somando da fonte, e não de `recebido_proprio`: a coluna do resumo
   * já embute a Retenção, que aqui precisa ficar de fora. `saiu_outro_setor` NÃO
   * é descontado — o 58 da carteira traz aquelas linhas; mover equipe entre
   * setores é decisão daqui, que o arquivo do ERP desconhece.
   */
  no58 as (
    select r.cod_grupo_filtro as cod,
           sum(r.recebido) filter (
             where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
               and coalesce(me.destino, 'proprio') <> 'somente_geral') as valor,
           sum(r.recebido) filter (
             where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
               and coalesce(me.destino, 'proprio') =  'somente_geral') as retencao,
           sum(r.recebido) filter (
             where r.colchao
               and not fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
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
  'MESMO recorte do 58: carteira, fn_mestre_conta_na_meta e sem as equipes '
  'somente_geral (Retencao). O colchao deixou de ser categoria em 2026-09, e as '
  'duas pontas voltaram a seguir a mesma regra. So leitura.';

commit;

commit;
