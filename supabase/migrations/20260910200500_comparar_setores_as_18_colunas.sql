-- ═══════════════════════════════════════════════════════════════════════════
-- `fn_mestre_comparar_setores`: o que o banco já tem, agora no repositório
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## Por que este arquivo existe
--
-- A função em produção devolve 18 colunas. O último arquivo do repositório que
-- a define (20260904500000) devolve 11 — a diferença foi aplicada pelo editor
-- SQL do dashboard, que não grava versão. Resultado: `db reset` reconstruiria a
-- versão de 11 colunas e quebraria a tela, sem erro de compilação, porque
-- `undefined` num `formatBRL` vira «R$ 0,00» em silêncio.
--
-- Este arquivo não muda nada no banco: é `create or replace` com o corpo
-- IDÊNTICO ao que já está lá (lido de `pg_get_functiondef` em 10/09/2026). Ele
-- existe para que o repositório consiga reconstruir a função.
--
-- ## As colunas novas, e o que cada uma responde
--
--   mestre_colchao_fora     pago fora da janela do colchão — está no arquivo,
--                           não conta na meta
--   mestre_emprestado_para  equipe deste setor que passou a contar em outro
--   mestre_emprestado_de    equipe de outro setor que passou a contar aqui
--   mestre_comparavel       `mestre_total` − Integral recebido. É contra ISTO
--                           que `diferenca` é medida
--   sistema_analitico       a parte de `sistema_total` vinda do analítico
--   sistema_ajustes         a parte lançada à mão. Não existe no 59
--   sistema_contrib_receptivo  o acumulado digitado em `contribuicao_receptivo`
--
-- ## A regra que a tela precisava dizer em voz alta
--
--     mestre_comparavel = mestre_total − mestre_contribuido
--     diferenca         = mestre_comparavel − sistema_total
--
-- O Integral sai da comparação porque conta no 59 dos DOIS lados (rateio) e o
-- analítico só tem a perna de quem cobrou. Comparar contra `mestre_total`
-- acusaria divergência falsa do tamanho exato da contribuição, todo mês.

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
           g.colchao_fora, g.emprestado_para
      from fn_mestre_resumo_grupos(p_empresa_id, p_mes) g
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
  -- Equipes movidas PARA um setor entram na linha de UM grupo desse setor — o
  -- de maior recebimento. Com dois grupos no mesmo setor, dividir seria
  -- inventar critério; o número honesto do setor vive em
  -- `fn_mestre_resumo_setores`, e aqui a comparação é sempre por grupo.
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
           coalesce(cr.valor, 0) as sis_contrib
      from m
      left join sis s        on s.setor_id  = m.setor_id
      left join movido mv    on mv.setor_id = m.setor_id
      left join emp ep       on ep.setor_id = m.setor_id
      left join principal pr on pr.setor_id = m.setor_id
      left join aju a        on a.setor_id  = m.setor_id
      left join crec cr      on cr.setor_id = m.setor_id
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
    b.colchao_fora,
    b.emprestado_para,
    b.emprestado_de,
    (b.recebido_total + b.chegou) - b.contrib_integral,
    b.sis_analitico + b.sis_ajustes,
    b.sis_linhas,
    b.sis_analitico,
    b.sis_ajustes,
    b.sis_contrib,
    ((b.recebido_total + b.chegou) - b.contrib_integral) - (b.sis_analitico + b.sis_ajustes)
  from base b
  where fn_user_is_super_admin()
  order by 6 desc, b.cod_grupo_filtro;
$function$;

comment on function public.fn_mestre_comparar_setores(uuid, text) is
  'O mestre contra analitico_recebimentos, por carteira. A diferenca e medida sobre mestre_comparavel (sem o Integral). So leitura.';

grant execute on function public.fn_mestre_comparar_setores(uuid, text) to authenticated;
