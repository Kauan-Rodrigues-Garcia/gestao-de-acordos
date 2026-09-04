-- ============================================================================
-- O 59 passa a medir com a MESMA régua do 58
--
-- A conferência de agosto/2026 (mês fechado, quatro setores vinculados) fechou
-- ao centavo e mostrou que a divergência inteira -- R$ 190.791,11 -- vinha de
-- três recortes diferentes, e de nenhum erro de importação:
--
--   Receptivo      R$  75.182,98   colchão fora da meta
--   Play Mix       R$  40.003,70   operador cobrando para outro grupo
--   Play 5         R$  39.551,82   integral do receptivo + colchão
--   Play 4         R$  36.052,61   integral do receptivo + colchão
--
-- Esta migration alinha os três. Nenhuma linha de `mestre_recebimentos` é
-- alterada: o 59 continua guardando o relatório inteiro, como veio do ERP. O
-- que muda é a LEITURA -- quais linhas entram no total, e contra o que esse
-- total é comparado.
--
-- ---- 1. Colchão fora da meta sai do total ----------------------------------
--
-- O parser do 58 (`colchaoContaNaMeta`, src/services/analitico/analiticoComum.ts)
-- manda para `analitico_colchao_fora_meta` toda linha `Colchão? = Sim` que não
-- caia na exceção de 01 a 14/08/2026. Essa tabela não alimenta
-- `analitico_recebimentos`, logo não alimenta meta, projeção nem ranking.
--
-- O 59 somava tudo. Daí os R$ 75.182,98 do receptivo: 28 pessoas, e a diferença
-- de cada uma era exatamente o colchão dela pago depois do dia 14.
--
-- `fn_mestre_conta_na_meta` é a mesma regra, agora em SQL. O valor excluído não
-- desaparece -- vira a coluna `colchao_fora`, visível em cada nível (grupo,
-- equipe, operador) e com linha própria na composição do grupo. Some do total,
-- nunca da vista.
--
-- ---- 2. Integral do receptivo sai da comparação ----------------------------
--
-- O 59 calcula sozinho quanto o receptivo cobrou por cada setor. O sistema tem
-- esse mesmo número em `contribuicao_receptivo`, digitado à mão no card
-- Contribuição Receptivo. São duas fontes para o mesmo dinheiro, e uma delas é
-- humana: comparar o total COM ele transforma erro de digitação em divergência
-- de importação.
--
-- Então a comparação passa a usar `mestre_comparavel` (o total menos o integral
-- recebido de fora), e o integral ganha a própria dupla de colunas --
-- `mestre_contribuido` contra `sistema_contrib_receptivo`. Continua à vista, e
-- agora dá para ver se o lançamento manual bate; só não contamina o resto.
--
-- ---- 3. O ajuste manual entra do lado do sistema ---------------------------
--
-- `analitico_ajustes_manuais` é somado na LEITURA e nunca gravado em
-- `analitico_recebimentos` (ver 20260823150000). Toda tela do sistema já lê o
-- ajuste; só a comparação do 59 não lia, e por isso acusava como falta o que já
-- estava corrigido.
--
-- É o caso do Play Mix: sete operadoras cadastradas no Play 5 que cobraram para
-- o Play Mix. O 59 acerta por natureza -- carimba a linha pelo grupo que a
-- cobrou, não pela equipe de hoje. O sistema acerta pelo ajuste manual. Somando
-- o ajuste, os dois passam a dizer a mesma coisa.
--
-- Compatibilidade: só leitura. Nenhuma tabela alterada, nenhuma linha escrita.
-- Seis funções ganham colunas (por isso o `drop` antes do `create`); nenhuma
-- perde coluna. Rollback = reaplicar 20260904300000, 400000 e 500000 nessa
-- ordem.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ---- A régua do colchão, em SQL --------------------------------------------
--
-- Espelho exato de `colchaoContaNaMeta`. Uma linha conta quando NÃO é colchão,
-- ou quando é colchão dentro da exceção de agosto/2026 (dias 1 a 14).
--
-- A janela é literal de propósito. Ela não é regra de negócio permanente -- é
-- uma decisão tomada para um mês específico, e escondê-la atrás de "dia <= 14
-- de qualquer mês" faria setembro herdar em silêncio uma exceção de agosto.

create or replace function public.fn_mestre_conta_na_meta(
  p_colchao boolean,
  p_dt      date
) returns boolean
language sql
immutable
parallel safe
as $fn$
  select not coalesce(p_colchao, false)
      or (p_dt >= date '2026-08-01' and p_dt <= date '2026-08-14');
$fn$;

comment on function public.fn_mestre_conta_na_meta(boolean, date) is
  'A linha do 59 entra no total? Espelho de colchaoContaNaMeta (analiticoComum.ts): colchao so conta de 01 a 14/08/2026.';

-- ---- Resumo por grupo ------------------------------------------------------

drop function if exists public.fn_mestre_resumo_grupos(uuid, text);

create function public.fn_mestre_resumo_grupos(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  cod_grupo_filtro  text,
  nome_no_relatorio text,
  nome_cadastrado   text,
  setor_id          uuid,
  setor_nome        text,
  estado            text,
  -- Daqui para baixo, tudo já sem o colchão fora da meta.
  linhas            bigint,
  recebido_proprio  numeric,
  integral_proprio  numeric,
  extra_proprio     numeric,
  contrib_integral  numeric,
  contrib_extra     numeric,
  saiu_outro_setor  numeric,
  saiu_somente_geral numeric,
  recebido_total    numeric,
  para_outros_integral numeric,
  para_outros_extra    numeric,
  sem_destino       numeric,
  colchao_valor     numeric,
  -- A parte do colchão que o 58 desvia para `analitico_colchao_fora_meta`.
  -- Já não está em `recebido_proprio`; fica aqui para conferência.
  colchao_fora      numeric,
  atestado_valor    numeric,
  equipes           bigint,
  cobradoras        bigint,
  dias              bigint,
  primeira_aparicao date,
  ultima_aparicao   date
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*, fn_mestre_conta_na_meta(r.colchao, r.dt_pgto) as conta
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
  ),
  nomes as (
    select distinct f.cod_grupo_filtro, f.nome_grupo_filtro
      from fatia f where f.nome_grupo_filtro <> ''
  ),
  resolvida as (
    select f.*, dn.destino_nome, n.cod_grupo_filtro as cod_destino,
           coalesce(me.destino, 'proprio') as destino_equipe
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
  ),
  propria as (
    select r.cod_grupo_filtro as cod,
           count(*) filter (where r.conta)                                     as linhas,
           sum(r.recebido) filter (where r.conta)                              as valor,
           sum(r.recebido) filter (where r.conta and lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where r.conta and lower(r.tipo) =  'extra') as extra,
           sum(r.recebido) filter (where r.colchao)                            as colchao,
           sum(r.recebido) filter (where not r.conta)                          as colchao_fora,
           sum(r.recebido) filter (where r.conta and upper(r.subgrupo_equipe) = 'ATESTADOS|FERIAS') as atestado,
           sum(r.recebido) filter (where r.conta and r.destino_nome is not null and r.cod_destino is null) as sem_destino,
           sum(r.recebido) filter (where r.conta and r.destino_equipe = 'outro_setor')   as saiu_outro,
           sum(r.recebido) filter (where r.conta and r.destino_equipe = 'somente_geral') as saiu_geral,
           sum(r.recebido) filter (where r.conta and r.cod_destino is not null
                                     and r.cod_destino <> r.cod_grupo_filtro
                                     and lower(r.tipo) <> 'extra')             as p_outros_integral,
           sum(r.recebido) filter (where r.conta and r.cod_destino is not null
                                     and r.cod_destino <> r.cod_grupo_filtro
                                     and lower(r.tipo) =  'extra')             as p_outros_extra,
           count(distinct r.subgrupo_equipe) filter (where r.conta and fn_mestre_e_equipe(r.subgrupo_equipe)) as equipes,
           count(distinct r.cobradora) filter (where r.conta)                  as cobradoras,
           count(distinct r.dt_pgto)   filter (where r.conta)                  as dias
      from resolvida r
     group by r.cod_grupo_filtro
  ),
  contribuida as (
    select r.cod_destino as cod,
           sum(r.recebido) filter (where lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where lower(r.tipo) =  'extra') as extra
      from resolvida r
     where r.conta and r.cod_destino is not null and r.cod_destino <> r.cod_grupo_filtro
     group by r.cod_destino
  ),
  chaves as (
    select cod from propria
    union select cod from contribuida
    union select g.cod_grupo_filtro from mestre_grupos g where g.empresa_id = p_empresa_id
  ),
  rotulo as (
    select f.cod_grupo_filtro as cod,
           (array_agg(f.nome_grupo_filtro order by f.id))[1] as nome
      from fatia f group by f.cod_grupo_filtro
  )
  select
    k.cod,
    coalesce(ro.nome, ''),
    coalesce(g.nome_grupo_filtro, ''),
    g.setor_id,
    s.nome,
    coalesce(g.estado, 'novo'),
    coalesce(p.linhas, 0),
    coalesce(p.valor, 0),
    coalesce(p.integral, 0),
    coalesce(p.extra, 0),
    coalesce(c.integral, 0),
    coalesce(c.extra, 0),
    coalesce(p.saiu_outro, 0),
    coalesce(p.saiu_geral, 0),
    coalesce(p.valor, 0) + coalesce(c.integral, 0)
      - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0),
    coalesce(p.p_outros_integral, 0),
    coalesce(p.p_outros_extra, 0),
    coalesce(p.sem_destino, 0),
    coalesce(p.colchao, 0),
    coalesce(p.colchao_fora, 0),
    coalesce(p.atestado, 0),
    coalesce(p.equipes, 0),
    coalesce(p.cobradoras, 0),
    coalesce(p.dias, 0),
    g.primeira_aparicao,
    g.ultima_aparicao
  from chaves k
  left join propria     p  on p.cod  = k.cod
  left join contribuida c  on c.cod  = k.cod
  left join rotulo      ro on ro.cod = k.cod
  left join mestre_grupos g on g.empresa_id = p_empresa_id and g.cod_grupo_filtro = k.cod
  left join setores     s  on s.id = g.setor_id
  where fn_user_is_super_admin()
  order by (coalesce(p.valor, 0) + coalesce(c.integral, 0)
            - coalesce(p.saiu_outro, 0) - coalesce(p.saiu_geral, 0)) desc, k.cod;
$fn$;

comment on function public.fn_mestre_resumo_grupos(uuid, text) is
  'Um grupo do 59 por linha, ja sem o colchao fora da meta (que fica visivel em colchao_fora). So leitura.';

-- ---- Composição do grupo ---------------------------------------------------
--
-- O colchão excluído vira uma origem própria, com `soma = false`. É a mesma
-- escolha do 58, que guarda essas linhas em tabela separada em vez de apagá-las:
-- o dinheiro existe, alguém cobrou, e some do total sem sumir da tela.

create or replace function public.fn_mestre_origens_do_grupo(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  origem     text,     -- 'proprio' | 'contribuicao' | 'para_outro' | 'sem_destino' | 'colchao_fora'
  cod_outro  text,
  rotulo     text,
  tipo       text,     -- 'Integral' | 'Extra'
  -- Esta linha entra no total do setor? O Extra vindo de fora não entra, e o
  -- colchão fora da meta também não.
  soma       boolean,
  linhas     bigint,
  valor      numeric
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*, fn_mestre_conta_na_meta(r.colchao, r.dt_pgto) as conta
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id and r.mes = (select d from ref)
  ),
  nomes as (
    select distinct f.cod_grupo_filtro, f.nome_grupo_filtro
      from fatia f where f.nome_grupo_filtro <> ''
  ),
  resolvida as (
    select f.*, dn.destino_nome, n.cod_grupo_filtro as cod_destino
      from fatia f
      cross join lateral (
        select case
                 when f.nome_grupo_filtro <> ''
                  and starts_with(f.setor, f.nome_grupo_filtro || ' - ')
                 then substr(f.setor, length(f.nome_grupo_filtro) + 4)
               end as destino_nome
      ) dn
      left join nomes n on n.nome_grupo_filtro = dn.destino_nome
  )
  select origem, cod_outro, rotulo, tipo, soma, linhas, valor from (
    -- Tudo o que o grupo cobrou, separado em direto e extra. Soma inteiro.
    select 'proprio'::text as origem, null::text as cod_outro,
           max(r.nome_grupo_filtro) as rotulo,
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end as tipo,
           true as soma,
           count(*)::bigint as linhas, sum(r.recebido) as valor
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and r.conta
       and not (r.destino_nome is not null and r.cod_destino is null)
     group by 4

    union all
    -- Composto que não achou destino. Fica à vista para alguém decidir.
    select 'sem_destino', null, max(r.destino_nome),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           true, count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and r.conta
       and r.destino_nome is not null and r.cod_destino is null
     group by r.destino_nome, 4

    union all
    -- Vindo de outro grupo. Integral SOMA (o setor não tem essa linha);
    -- Extra NÃO soma (é a segunda perna de um pagamento que o setor já tem).
    select 'contribuicao', r.cod_grupo_filtro, max(r.nome_grupo_filtro),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           lower(r.tipo) <> 'extra',
           count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_destino = p_cod and r.cod_grupo_filtro <> p_cod and r.conta
     -- 5 é a coluna `soma`, que deriva de `tipo` e precisa entrar no group by.
     group by r.cod_grupo_filtro, 4, 5

    union all
    -- Deste grupo, carimbado para outro. Informativo: continua no total daqui.
    select 'para_outro', r.cod_destino, max(r.destino_nome),
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           false, count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_grupo_filtro = p_cod
       and r.conta
       and r.cod_destino is not null and r.cod_destino <> p_cod
     group by r.cod_destino, 4

    union all
    -- Colchão fora da janela de exceção. O 58 guarda em outra tabela e não
    -- soma em meta nenhuma; aqui aparece pelo mesmo motivo -- para conferir.
    select 'colchao_fora', null, 'Colchão fora da meta',
           case when lower(r.tipo) = 'extra' then 'Extra' else 'Integral' end,
           false, count(*)::bigint, sum(r.recebido)
      from resolvida r
     where r.cod_grupo_filtro = p_cod and not r.conta
     group by 4
  ) x
  where fn_user_is_super_admin() and x.valor <> 0
  order by
    case x.origem when 'proprio' then 1 when 'contribuicao' then 2
                  when 'sem_destino' then 3 when 'para_outro' then 4 else 5 end,
    x.soma desc, x.valor desc;
$fn$;

comment on function public.fn_mestre_origens_do_grupo(uuid, text, text) is
  'A composicao do recebimento de um grupo. `soma` diz se a linha entra no total -- o Extra vindo de fora e o colchao fora da meta nao entram.';

-- ---- Resumo por setor ------------------------------------------------------
--
-- `dos_grupos` já vem limpo de `fn_mestre_resumo_grupos`; o que faltava era o
-- `movido`, que lê `mestre_recebimentos` direto e por isso precisa da régua.

create or replace function public.fn_mestre_resumo_setores(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  setor_id      uuid,
  setor_nome    text,
  dos_grupos    numeric,
  recebido_movido numeric,
  total         numeric,
  grupos        bigint
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  g as (
    select x.setor_id, sum(x.recebido_total) as valor, count(*)::bigint as grupos
      from fn_mestre_resumo_grupos(p_empresa_id, p_mes) x
     where x.setor_id is not null and x.estado = 'vinculado'
     group by x.setor_id
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
  )
  select s.id, s.nome,
         coalesce(g.valor, 0),
         coalesce(m.valor, 0),
         coalesce(g.valor, 0) + coalesce(m.valor, 0),
         coalesce(g.grupos, 0)
    from setores s
    left join g on g.setor_id = s.id
    left join movido m on m.setor_id = s.id
   where s.empresa_id = p_empresa_id
     and fn_user_is_super_admin()
     and (g.valor is not null or m.valor is not null)
   order by 5 desc, s.nome;
$fn$;

comment on function public.fn_mestre_resumo_setores(uuid, text) is
  'Quanto cada setor recebeu de verdade: os grupos ligados a ele, menos as equipes que sairam, mais as que vieram.';

-- ---- A comparação ----------------------------------------------------------
--
-- Duas duplas, não uma. `mestre_comparavel` contra `sistema_total` mede o
-- recebimento; `mestre_contribuido` contra `sistema_contrib_receptivo` mede o
-- lançamento manual do integral. Misturar os dois era o que fazia um erro de
-- digitação no card aparecer como buraco na importação.

drop function if exists public.fn_mestre_comparar_setores(uuid, text);

create function public.fn_mestre_comparar_setores(
  p_empresa_id uuid,
  p_mes        text
) returns table (
  cod_grupo_filtro  text,
  rotulo            text,
  setor_id          uuid,
  setor_nome        text,
  estado            text,
  -- O número econômico do grupo: tudo o que ele recebeu, integral incluído.
  mestre_total      numeric,
  mestre_proprio    numeric,
  mestre_contribuido numeric,
  -- Colchão que o 58 não soma. Já fora de `mestre_total`; aqui só para explicar
  -- a diferença de quem estranhar o total do relatório bruto.
  mestre_colchao_fora numeric,
  -- O que de fato se compara: o total sem o integral do receptivo, que vive em
  -- `contribuicao_receptivo` e é digitado à mão.
  mestre_comparavel numeric,
  sistema_total     numeric,
  sistema_linhas    bigint,
  -- As duas parcelas do lado do sistema, abertas.
  sistema_analitico numeric,
  sistema_ajustes   numeric,
  sistema_contrib_receptivo numeric,
  diferenca         numeric
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  m as (
    select g.cod_grupo_filtro, g.nome_no_relatorio, g.nome_cadastrado,
           g.setor_id, g.setor_nome, g.estado,
           g.recebido_total, g.recebido_proprio, g.contrib_integral,
           g.colchao_fora
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
  -- Equipes movidas PARA um setor entram na linha de UM grupo desse setor -- o
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
  -- Somado na leitura em todas as telas do sistema, nunca gravado no analítico.
  -- É por onde o recebimento de quem trocou de carteira no meio do mês volta
  -- para o setor certo -- o mesmo que o 59 já faz sozinho, pelo grupo da linha.
  aju as (
    select j.setor_id, sum(j.valor) as valor
      from analitico_ajustes_manuais j
     where j.empresa_id = p_empresa_id
       and j.mes_referencia = (select d from ref)
       and not j.cancelado
       and j.setor_id is not null
     group by j.setor_id
  ),
  -- O integral do receptivo como o sistema o conhece: digitado à mão.
  crec as (
    select c.setor_id, sum(c.acumulado) as valor
      from contribuicao_receptivo c
     where c.empresa_id = p_empresa_id and c.mes = p_mes
     group by c.setor_id
  ),
  base as (
    select m.*,
           m.recebido_total + coalesce(case when pr.cod_grupo_filtro = m.cod_grupo_filtro
                                            then mv.valor end, 0) as total_com_movido,
           coalesce(s.total, 0)  as sis_analitico,
           coalesce(s.linhas, 0) as sis_linhas,
           coalesce(a.valor, 0)  as sis_ajustes,
           coalesce(cr.valor, 0) as sis_contrib
      from m
      left join sis s       on s.setor_id  = m.setor_id
      left join movido mv   on mv.setor_id = m.setor_id
      left join principal pr on pr.setor_id = m.setor_id
      left join aju a       on a.setor_id  = m.setor_id
      left join crec cr     on cr.setor_id = m.setor_id
  )
  select
    b.cod_grupo_filtro,
    coalesce(nullif(b.nome_no_relatorio, ''), b.nome_cadastrado),
    b.setor_id,
    b.setor_nome,
    b.estado,
    b.total_com_movido,
    b.recebido_proprio,
    b.contrib_integral,
    b.colchao_fora,
    b.total_com_movido - b.contrib_integral,
    b.sis_analitico + b.sis_ajustes,
    b.sis_linhas,
    b.sis_analitico,
    b.sis_ajustes,
    b.sis_contrib,
    (b.total_com_movido - b.contrib_integral) - (b.sis_analitico + b.sis_ajustes)
  from base b
  where fn_user_is_super_admin()
  order by 6 desc, b.cod_grupo_filtro;
$fn$;

comment on function public.fn_mestre_comparar_setores(uuid, text) is
  'O 59 contra o sistema, na mesma regua: sem colchao fora da meta, sem o integral do receptivo (que tem dupla propria) e com os ajustes manuais somados do lado do sistema. So leitura.';

-- ---- Equipes ---------------------------------------------------------------

drop function if exists public.fn_mestre_resumo_equipes(uuid, text, text);

create function public.fn_mestre_resumo_equipes(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text
) returns table (
  nome_subgrupo     text,
  e_equipe          boolean,
  linhas            bigint,
  recebido          numeric,
  integral_valor    numeric,
  extra_valor       numeric,
  colchao_fora      numeric,
  cobradoras        bigint,
  equipe_id         uuid,
  equipe_nome       text,
  estado            text,
  destino           text,
  destino_setor_id  uuid,
  destino_setor_nome text,
  primeira_aparicao date,
  ultima_aparicao   date
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  agg as (
    select r.subgrupo_equipe as nome,
           count(*) filter (where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto))::bigint as linhas,
           sum(r.recebido) filter (where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)) as recebido,
           sum(r.recebido) filter (where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
                                     and lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
                                     and lower(r.tipo) =  'extra') as extra,
           sum(r.recebido) filter (where not fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)) as colchao_fora,
           count(distinct r.cobradora) filter (where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto))::bigint as cobradoras
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and r.cod_grupo_filtro = p_cod
     group by r.subgrupo_equipe
  )
  select
    a.nome,
    fn_mestre_e_equipe(a.nome),
    a.linhas,
    coalesce(a.recebido, 0),
    coalesce(a.integral, 0),
    coalesce(a.extra, 0),
    coalesce(a.colchao_fora, 0),
    a.cobradoras,
    e.equipe_id,
    eq.nome,
    coalesce(e.estado, 'novo'),
    coalesce(e.destino, 'proprio'),
    e.destino_setor_id,
    ds.nome,
    e.primeira_aparicao,
    e.ultima_aparicao
  from agg a
  left join mestre_equipes e
    on e.empresa_id = p_empresa_id and e.cod_grupo_filtro = p_cod and e.nome_subgrupo = a.nome
  left join equipes eq on eq.id = e.equipe_id
  left join setores ds on ds.id = e.destino_setor_id
  where fn_user_is_super_admin()
  order by coalesce(a.recebido, 0) desc, a.nome;
$fn$;

comment on function public.fn_mestre_resumo_equipes(uuid, text, text) is
  'As equipes (subgrupos) de um grupo do 59, ja sem o colchao fora da meta -- que fica em colchao_fora.';

-- ---- Operadores ------------------------------------------------------------

drop function if exists public.fn_mestre_operadores_da_equipe(uuid, text, text, text);

create function public.fn_mestre_operadores_da_equipe(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text,
  p_subgrupo   text
) returns table (
  cobradora      text,
  linhas         bigint,
  recebido       numeric,
  integral_valor numeric,
  extra_valor    numeric,
  colchao_valor  numeric,
  -- Quanto do colchão acima ficou de fora do total (fora da janela de exceção).
  colchao_fora   numeric,
  nrs            bigint,
  dias           bigint,
  -- Casamento automático com o cadastro. Nulo = não achou.
  perfil_id      uuid,
  perfil_nome    text,
  perfil_ativo   boolean,
  equipe_atual   text,
  setor_atual    text
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d),
  fatia as (
    select r.*, fn_mestre_conta_na_meta(r.colchao, r.dt_pgto) as conta
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and r.cod_grupo_filtro = p_cod
       and r.subgrupo_equipe = p_subgrupo
  ),
  agg as (
    select r.cobradora,
           count(*) filter (where r.conta)::bigint                            as linhas,
           sum(r.recebido) filter (where r.conta)                             as recebido,
           sum(r.recebido) filter (where r.conta and lower(r.tipo) <> 'extra') as integral,
           sum(r.recebido) filter (where r.conta and lower(r.tipo) =  'extra') as extra,
           sum(r.recebido) filter (where r.colchao)                           as colchao,
           sum(r.recebido) filter (where not r.conta)                         as colchao_fora,
           count(distinct r.nr_documento) filter (where r.conta)::bigint      as nrs,
           count(distinct r.dt_pgto)      filter (where r.conta)::bigint      as dias
      from fatia r
     group by r.cobradora
  )
  select
    a.cobradora, a.linhas, coalesce(a.recebido, 0),
    coalesce(a.integral, 0), coalesce(a.extra, 0),
    coalesce(a.colchao, 0), coalesce(a.colchao_fora, 0),
    a.nrs, a.dias,
    p.id, p.nome, p.ativo, eq.nome, s.nome
  from agg a
  left join perfis p
    on p.empresa_id = p_empresa_id and lower(p.usuario) = lower(a.cobradora)
  left join equipes eq on eq.id = p.equipe_id
  left join setores s  on s.id = p.setor_id
  where fn_user_is_super_admin()
    and (coalesce(a.recebido, 0) <> 0 or coalesce(a.colchao_fora, 0) <> 0)
  order by coalesce(a.recebido, 0) desc, a.cobradora;
$fn$;

comment on function public.fn_mestre_operadores_da_equipe(uuid, text, text, text) is
  'Operadores de uma equipe do relatorio, ja sem o colchao fora da meta, com o casamento automatico com perfis pelo login. So leitura.';

-- ---- Linhas do operador ----------------------------------------------------
--
-- Aqui NÃO se filtra. É a tela do detalhe, e esconder linha do relatório numa
-- tela de conferência derrota o propósito dela. O que se ganha é a coluna
-- `conta_na_meta`, para a lista dizer por que a soma da tela pode não bater com
-- o card do operador.

drop function if exists public.fn_mestre_linhas_do_operador(uuid, text, text, text, text, integer);

create function public.fn_mestre_linhas_do_operador(
  p_empresa_id uuid,
  p_mes        text,
  p_cod        text,
  p_cobradora  text,
  p_subgrupo   text default null,
  p_limite     integer default 300
) returns table (
  nr_documento text,
  parcela      text,
  titulo       text,
  cliente      text,
  cod_cli      text,
  empresa_erp  text,
  tp_doc       text,
  tipo_venda   text,
  dt_lig       date,
  dt_pgto      date,
  dias_atraso  integer,
  recebido     numeric,
  tipo         text,
  colchao      boolean,
  conta_na_meta boolean,
  setor_carimbado text,
  linha_num    integer
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with ref as (select ((p_mes || '-01')::date) as d)
  select r.nr_documento, r.parcela, r.titulo, r.cliente, r.cod_cli, r.empresa_erp,
         r.tp_doc, r.tipo_venda, r.dt_lig, r.dt_pgto, r.dias_atraso,
         r.recebido, r.tipo, r.colchao,
         fn_mestre_conta_na_meta(r.colchao, r.dt_pgto),
         r.setor, r.linha_num
    from mestre_recebimentos r
    join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
   where r.empresa_id = p_empresa_id
     and r.mes = (select d from ref)
     and r.cod_grupo_filtro = p_cod
     and lower(r.cobradora) = lower(p_cobradora)
     and (p_subgrupo is null or r.subgrupo_equipe = p_subgrupo)
     and fn_user_is_super_admin()
   order by r.dt_pgto desc, r.recebido desc, r.nr_documento
   -- Teto para a tela não travar num operador com milhares de linhas. O total
   -- verdadeiro está no card do operador, que agrega sem teto -- e a tela avisa
   -- quando a lista foi cortada, para ninguém somar a tela e achar que falta.
   limit greatest(1, least(coalesce(p_limite, 300), 2000));
$fn$;

comment on function public.fn_mestre_linhas_do_operador(uuid, text, text, text, text, integer) is
  'As linhas do relatorio de um operador. Traz TUDO, inclusive o colchao fora da meta -- conta_na_meta diz o que entra no total.';

grant execute on function public.fn_mestre_conta_na_meta(boolean, date)                  to authenticated;
grant execute on function public.fn_mestre_resumo_grupos(uuid, text)                     to authenticated;
grant execute on function public.fn_mestre_origens_do_grupo(uuid, text, text)            to authenticated;
grant execute on function public.fn_mestre_resumo_setores(uuid, text)                    to authenticated;
grant execute on function public.fn_mestre_comparar_setores(uuid, text)                  to authenticated;
grant execute on function public.fn_mestre_resumo_equipes(uuid, text, text)              to authenticated;
grant execute on function public.fn_mestre_operadores_da_equipe(uuid, text, text, text)  to authenticated;
grant execute on function public.fn_mestre_linhas_do_operador(uuid, text, text, text, text, integer) to authenticated;

COMMIT;
