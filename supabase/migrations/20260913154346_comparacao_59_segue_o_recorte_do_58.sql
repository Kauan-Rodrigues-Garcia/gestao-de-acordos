-- ═══════════════════════════════════════════════════════════════════════════
-- A comparação do 59 passa a usar o MESMO recorte que o 58 faz
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que o 58 é, medido e não suposto
--
-- O 58 de um setor é a fatia do 59 pela CARTEIRA (`cod_grupo_filtro`), com duas
-- exclusões e mais nada:
--
--   1. carteira → setor, via `mestre_grupos`. Não por `setor`, não por pessoa.
--   2. colchão fora da janela sai (`fn_mestre_conta_na_meta`).
--   3. Retenção sai (`mestre_equipes.destino = 'somente_geral'`, que hoje marca
--      `RETENÇÃO` e `EQUIPE RETENÇÃO` da carteira 63 — o mesmo que o
--      `ehEquipeRetencao` do parser do 58 derruba na importação).
--
-- Medido em 2026-09-13 sobre agosto/2026, contra o que cada setor tem gravado
-- em `analitico_recebimentos`:
--
--   Play 4 ....... 165.045,89  ×  165.045,89  →  0,00   ·  0 NR divergente
--   Play 5 ....... 360.873,55  ×  360.873,55  →  0,00   ·  0 NR divergente
--   Play 3 ....... 934.550,07  ×  934.550,07  →  0,00   ·  0 NR em 1.280
--   Play Mix ..... 116.524,59  ×  115.834,59  → +690,00 ·  2 NR
--   Receptivo .. 2.658.753,66  × 2.659.113,98 → −360,32 ·  5 NR
--
-- Os três zeros são BIJETIVOS nota a nota, não compensação de erros: nenhum
-- NrDocumento com delta ≥ R$ 0,01 dos dois lados.
--
-- ## O que estava errado
--
-- `mestre_comparavel` era `mestre_total − contrib_integral`, e `mestre_total`
-- move dinheiro por PESSOA (`emprestado_para` / `chegou`): quem é de um setor e
-- cobrou na carteira de outro leva o valor consigo. O 58 não faz isso — o
-- arquivo é da carteira, e não importa de que setor é quem cobrou.
--
-- Era a única divergência de desenho entre os dois lados, e ela sozinha
-- respondia por:
--
--   Play 4 ..... +1.995,00        Play Mix .... −31.513,67
--   Play 5 .... +27.376,83        Receptivo ... +25.392,00
--
-- ## O que muda, e o que explicitamente NÃO muda
--
-- `mestre_total` fica intacto. Ele é o número REAL do setor — com empréstimo,
-- com contribuição, com equipe movida — e é o que o Painel Diretoria mostra
-- como resultado do setor. Mexer nele seria trocar o fechamento da diretoria
-- por causa de uma conferência, que é o contrário do pedido.
--
-- O que muda é só a coluna do meio, que existe UNICAMENTE para comparar contra
-- o 58:
--
--     antes:  mestre_comparavel = mestre_total − contrib_integral
--     agora:  mestre_comparavel = recebido_proprio − saiu_somente_geral
--
-- E entra `mestre_fora_do_58` = `mestre_total − mestre_comparavel`, para a
-- subtração continuar fechando na horizontal na tela. Sem ela a tabela mostra
-- três números que não se ligam por conta nenhuma, que foi o defeito que a
-- 20260910200500 tinha acabado de corrigir.
--
-- ## `fn_mestre_diferenca_detalhe` acompanha, ou o «não explicado» mente
--
-- Três ajustes, todos consequência do de cima:
--
--   • o filtro `lower(tipo) <> 'extra'` SAI. O Extra está no 58 — em agosto são
--     R$ 869.047,73 do Receptivo dentro dos R$ 2.658.753,66 conferidos. Mantê-lo
--     fora fazia a lista de NR acusar como «só no sistema» quase um milhão de
--     reais que os dois lados conhecem.
--   • as linhas de `somente_geral` saem, para o lado do 59 somar exatamente
--     `mestre_comparavel`.
--   • `emprestado_de` e `emprestado_para` saem da conta do `nao_explicado`.
--     Eles não deslocam mais a diferença; continuam no bloco `estrutura` como
--     informação, com a nota dizendo que agora são só leitura.
--
-- Sem o terceiro, `nao_explicado` passaria a acusar um buraco do tamanho exato
-- do empréstimo — justamente o que esta migration acabou de tirar do caminho.
--
-- ## Escrita: nenhuma
--
-- Duas funções de leitura em `create or replace`. Nenhuma linha de
-- `mestre_recebimentos`, `analitico_recebimentos`, `mestre_grupos` ou
-- `mestre_equipes` é tocada. Os dois relatórios seguem exatamente como foram
-- importados.
--
-- ## O que esta migration NÃO resolve, de propósito
--
-- As diferenças que sobram são de DADO, não de filtro, e corrigi-las é apagar
-- ou reescrever linha de gente real:
--
--   • Play Mix, R$ 690,00 — NR 12972071 e 12842628, em que o 58 do Play Mix traz
--     MENOS valor que o 59 na mesma linha (389,66 contra 889,66, e 0,00 contra
--     190,00). Nada foi carimbado em outro setor: ver o doc, secao «Correcao de
--     2026-09-13».
--   • Receptivo, R$ 698,43 — NR 12984182, 13000560 e 13012299 contados duas
--     vezes: o lote de 2026-09-09 (5 linhas) reinseriu parcelas que já estavam
--     dentro das linhas consolidadas do lote de 2026-09-08. Escaparam porque
--     `idx_analitico_unicidade` é (empresa, codigo, data_pagamento, forma,
--     operador) e o ERP reexportou a mesma parcela com outra DtPgto.
--   • Receptivo, R$ 338,11 — NR 12987483 e 13019778, que o 58 não trouxe.
--
-- Ficam visíveis na tela, com NR, operador e data. Corrigi-las é decisão de
-- quem manda, uma a uma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- ── A comparação por carteira ──────────────────────────────────────────────
--
-- `drop` antes do `create`: a função ganha uma coluna de saída, e o Postgres
-- não deixa `create or replace` mudar o tipo de retorno.

drop function if exists public.fn_mestre_comparar_setores(uuid, text);

create function public.fn_mestre_comparar_setores(
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
           g.colchao_fora, g.emprestado_para,
           g.saiu_outro_setor, g.saiu_somente_geral
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
  ),
  /*
   * ── O recorte do 58, e só ele ──
   *
   * A carteira inteira que conta na meta, menos o que o 58 descarta na
   * importação. `saiu_outro_setor` NÃO é descontado: o 58 da carteira traz
   * aquelas linhas: mover equipe entre setores é decisão daqui, que o arquivo
   * do ERP desconhece.
   */
  final as (
    select b.*, (b.recebido_proprio - b.saiu_somente_geral) as comparavel
      from base b
  )
  select
    f.cod_grupo_filtro,
    coalesce(nullif(f.nome_no_relatorio, ''), f.nome_cadastrado),
    f.setor_id,
    f.setor_nome,
    f.estado,
    f.recebido_total + f.chegou,
    f.recebido_proprio,
    f.contrib_integral,
    f.colchao_fora,
    f.emprestado_para,
    f.emprestado_de,
    f.saiu_somente_geral,
    (f.recebido_total + f.chegou) - f.comparavel,
    f.comparavel,
    f.sis_analitico + f.sis_ajustes,
    f.sis_linhas,
    f.sis_analitico,
    f.sis_ajustes,
    f.sis_contrib,
    f.comparavel - (f.sis_analitico + f.sis_ajustes)
  from final f
  where fn_user_is_super_admin()
  order by 6 desc, f.cod_grupo_filtro;
$function$;

comment on function public.fn_mestre_comparar_setores(uuid, text) is
  'O mestre contra analitico_recebimentos, por carteira. mestre_comparavel usa o '
  'MESMO recorte do 58: a carteira que conta na meta, menos as equipes marcadas '
  'somente_geral (Retencao). mestre_total segue sendo o numero real do setor, com '
  'emprestimo e contribuicao. So leitura.';

grant execute on function public.fn_mestre_comparar_setores(uuid, text) to authenticated;

-- ── O detalhe da diferença, no mesmo recorte ───────────────────────────────

create or replace function public.fn_mestre_diferenca_detalhe(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid,
  p_limite     integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare
  v_mes  date;
  v_res  jsonb;
  v_cmp  record;
  v_lim  integer := greatest(1, least(coalesce(p_limite, 200), 1000));
begin
  if not fn_user_is_super_admin() then
    raise exception 'Somente super_admin.' using errcode = 'insufficient_privilege';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;
  v_mes := (p_mes || '-01')::date;

  select * into v_cmp
    from fn_mestre_comparar_setores(p_empresa_id, p_mes) c
   where c.setor_id = p_setor_id
   limit 1;

  if v_cmp.setor_id is null then
    raise exception 'SETOR_SEM_COMPARACAO: setor % nao esta na comparacao de %.',
      p_setor_id, p_mes;
  end if;

  with
  /*
   * O lado do 59, com o recorte do 58: a carteira do setor, o que conta na
   * meta, sem as equipes `somente_geral`. Sem filtro de `tipo` — o Extra ESTÁ
   * no 58, e tirá-lo daqui fazia a lista acusar como divergência o que os dois
   * lados conhecem. A soma desta CTE é `mestre_comparavel`, e é isso que faz o
   * `nao_explicado` poder chegar a zero.
   */
  m as (
    select r.nr_documento as nr,
           sum(r.recebido) as valor,
           max(r.cobradora) as cobradora,
           max(r.nome_grupo_filtro) as carteira
      from mestre_recebimentos r
      join mestre_lotes l  on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g on g.empresa_id = r.empresa_id
                          and g.cod_grupo_filtro = r.cod_grupo_filtro
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and g.setor_id = p_setor_id
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and coalesce(me.destino, 'proprio') <> 'somente_geral'
       and coalesce(r.nr_documento, '') <> ''
     group by 1
  ),
  a as (
    select x.codigo as nr,
           sum(x.valor_recebido) as valor,
           max(x.operador_usuario) as operador
      from analitico_recebimentos x
     where x.empresa_id = p_empresa_id
       and x.setor_id = p_setor_id
       and x.data_pagamento >= v_mes
       and x.data_pagamento <  (v_mes + interval '1 month')
       and coalesce(x.codigo, '') <> ''
     group by 1
  ),
  sis_outros as (
    select x.codigo as nr, min(s.nome) as setor
      from analitico_recebimentos x
      join setores s on s.id = x.setor_id
     where x.empresa_id = p_empresa_id
       and x.setor_id is distinct from p_setor_id
       and x.data_pagamento >= v_mes
       and x.data_pagamento <  (v_mes + interval '1 month')
       and coalesce(x.codigo, '') <> ''
     group by 1
  ),
  mes_outros as (
    select r.nr_documento as nr,
           min(coalesce(s2.nome, g2.nome_grupo_filtro)) as onde
      from mestre_recebimentos r
      join mestre_lotes l   on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g2 on g2.empresa_id = r.empresa_id
                           and g2.cod_grupo_filtro = r.cod_grupo_filtro
      left join setores s2  on s2.id = g2.setor_id
     where r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and g2.setor_id is distinct from p_setor_id
       and coalesce(r.nr_documento, '') <> ''
     group by 1
  ),
  juntos as (
    select coalesce(m.nr, a.nr) as nr,
           coalesce(m.valor, 0) as v_mestre,
           coalesce(a.valor, 0) as v_sistema,
           coalesce(m.valor, 0) - coalesce(a.valor, 0) as delta,
           m.cobradora, m.carteira, a.operador,
           (m.nr is not null) as tem_mestre,
           (a.nr is not null) as tem_sistema
      from m full outer join a on a.nr = m.nr
  ),
  classificado as (
    select j.*,
           so.setor as sistema_em_outro_setor,
           mo.onde   as mestre_em_outro_setor,
           case
             when not j.tem_sistema and so.setor is not null then 'outro_setor'
             when not j.tem_sistema                          then 'so_no_59'
             when not j.tem_mestre  and mo.onde  is not null then 'sistema_em_outro_setor'
             when not j.tem_mestre                           then 'so_no_sistema'
             else 'valor_difere'
           end as situacao
      from juntos j
      left join sis_outros so on so.nr = j.nr
      left join mes_outros mo on mo.nr = j.nr
     where abs(j.delta) >= 0.01
  ),
  estrutural as (
    select * from classificado
     where situacao in ('outro_setor', 'sistema_em_outro_setor')
  ),
  divergente as (
    select * from classificado
     where situacao not in ('outro_setor', 'sistema_em_outro_setor')
  ),
  totais as (
    select
      coalesce(sum(v_mestre)  filter (where situacao = 'so_no_59'), 0)      as so_59,
      coalesce(sum(v_sistema) filter (where situacao = 'so_no_sistema'), 0) as so_sistema,
      coalesce(sum(delta)     filter (where situacao = 'valor_difere'), 0)  as difere,
      count(*)                                                              as qtd
      from divergente
  ),
  totais_estr as (
    select
      coalesce(sum(v_mestre)  filter (where situacao = 'outro_setor'), 0)            as fora_59,
      count(*)                filter (where situacao = 'outro_setor')                as qtd_fora_59,
      coalesce(sum(v_sistema) filter (where situacao = 'sistema_em_outro_setor'), 0) as fora_sistema,
      count(*)                filter (where situacao = 'sistema_em_outro_setor')     as qtd_fora_sistema
      from estrutural
  ),
  linhas_emp as (
    select r.cobradora,
           r.nome_grupo_filtro                      as carteira,
           gr.setor_id                              as setor_carteira,
           sc.nome                                  as setor_carteira_nome,
           r.operador_setor_id,
           so.nome                                  as setor_operador_nome,
           r.recebido
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos gr
        on gr.empresa_id = r.empresa_id
       and gr.cod_grupo_filtro = r.cod_grupo_filtro
       and gr.estado = 'vinculado'
       and gr.setor_id is not null
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
      left join setores sc on sc.id = gr.setor_id
      left join setores so on so.id = r.operador_setor_id
     where r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and r.operador_setor_id is not null
       and r.operador_setor_id <> gr.setor_id
       and coalesce(me.destino, 'proprio') = 'proprio'
  ),
  emp_para as (
    select e.cobradora, e.carteira,
           coalesce(e.setor_operador_nome, '—') as outro_setor,
           sum(e.recebido) as valor
      from linhas_emp e
     where e.setor_carteira = p_setor_id
     group by 1, 2, 3
  ),
  emp_de as (
    select e.cobradora, e.carteira,
           coalesce(e.setor_carteira_nome, '—') as outro_setor,
           sum(e.recebido) as valor
      from linhas_emp e
     where e.operador_setor_id = p_setor_id
     group by 1, 2, 3
  )
  select jsonb_build_object(
    'setor_id',    v_cmp.setor_id,
    'setor_nome',  v_cmp.setor_nome,
    'carteira',    v_cmp.rotulo,
    'mes',         p_mes,
    'mestre_total',      v_cmp.mestre_total,
    'contrib_integral',  v_cmp.mestre_contribuido,
    'fora_do_58',        v_cmp.mestre_fora_do_58,
    'comparavel',        v_cmp.mestre_comparavel,
    'sistema_analitico', v_cmp.sistema_analitico,
    'sistema_ajustes',   v_cmp.sistema_ajustes,
    'sistema_total',     v_cmp.sistema_total,
    'diferenca',         v_cmp.diferenca,
    /*
     * O bloco `estrutura` agora responde a OUTRA pergunta. Ele explicava a
     * diferença; passa a explicar por que `mestre_total` e `mestre_comparavel`
     * não são o mesmo número. Nenhuma destas parcelas desloca mais a diferença.
     */
    'estrutura', jsonb_build_array(
      jsonb_build_object('chave','contrib_integral','valor', v_cmp.mestre_contribuido,
        'rotulo','Integral recebido de outra carteira',
        'nota','Conta no 59 dos dois lados (rateio). O 58 desta carteira nao tem essa 2a perna: fica fora do comparavel.'),
      jsonb_build_object('chave','retencao','valor', v_cmp.mestre_retencao,
        'rotulo','Retencao',
        'nota','Equipe marcada «somente geral». O parser do 58 derruba essas linhas na importacao, e aqui elas saem do comparavel pelo mesmo motivo.'),
      jsonb_build_object('chave','colchao_fora','valor', v_cmp.mestre_colchao_fora,
        'rotulo','Colchao fora da meta',
        'nota','Excecao de agosto/2026. De setembro em diante o colchao conta como qualquer linha, e esta parcela vale zero.'),
      jsonb_build_object('chave','emprestado_de','valor', v_cmp.mestre_emprestado_de,
        'rotulo','Emprestado para ca',
        'nota','Gente deste setor que cobrou na carteira de outro. Entra em mestre_total; NAO entra no comparavel, porque o 58 segue a carteira e nao a pessoa.',
        'detalhe', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'cobradora', e.cobradora, 'carteira', e.carteira,
                   'outro_setor', e.outro_setor, 'valor', e.valor)
                 order by e.valor desc)
            from emp_de e), '[]'::jsonb)),
      jsonb_build_object('chave','emprestado_para','valor', v_cmp.mestre_emprestado_para,
        'rotulo','Emprestado daqui',
        'nota','Gente de outro setor que cobrou na carteira deste. Sai de mestre_total; CONTINUA no comparavel, porque o 58 desta carteira traz essas linhas.',
        'detalhe', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'cobradora', e.cobradora, 'carteira', e.carteira,
                   'outro_setor', e.outro_setor, 'valor', e.valor)
                 order by e.valor desc)
            from emp_para e), '[]'::jsonb)),
      jsonb_build_object('chave','ajustes','valor', v_cmp.sistema_ajustes,
        'rotulo','Ajuste manual no sistema',
        'nota','Lancado a mao no analitico. Nao existe no 59.')
    ),
    'fora_da_comparacao', (
      select jsonb_build_object(
        'no_59_lancado_em_outro_setor', jsonb_build_object(
          'valor', te.fora_59, 'qtd', te.qtd_fora_59,
          'nota', 'Cobrado por este setor no 59; o acordo esta lancado no setor dono da carteira. E assim que a operacao funciona.'),
        'lancado_aqui_no_59_de_outro', jsonb_build_object(
          'valor', te.fora_sistema, 'qtd', te.qtd_fora_sistema,
          'nota', 'Lancado neste setor no analitico; no 59 a cobranca esta em outra carteira.'),
        'nrs', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'nr', c.nr, 'mestre', c.v_mestre, 'sistema', c.v_sistema,
                   'delta', c.delta, 'situacao', c.situacao,
                   'cobradora', c.cobradora, 'carteira', c.carteira,
                   'operador', c.operador,
                   'onde', coalesce(c.sistema_em_outro_setor, c.mestre_em_outro_setor))
                 order by abs(c.delta) desc)
            from (select * from estrutural order by abs(delta) desc limit v_lim) c
        ), '[]'::jsonb),
        'nrs_truncado', greatest(0, (te.qtd_fora_59 + te.qtd_fora_sistema) - v_lim))
        from totais_estr te),
    'resumo_nrs', (select jsonb_build_object(
        'so_59', so_59, 'so_sistema', so_sistema, 'difere', difere, 'qtd', qtd)
      from totais),
    /*
     * `emprestado_de` e `emprestado_para` SAEM desta conta. Com o comparavel
     * seguindo a carteira, o emprestimo nao desloca mais a diferenca — deixa-lo
     * aqui faria o «nao explicado» acusar um buraco do tamanho exato dele.
     */
    'nao_explicado', (
      select round(
        v_cmp.diferenca
        - (t.so_59 + te.fora_59 - t.so_sistema - te.fora_sistema + t.difere
           - v_cmp.sistema_ajustes), 2)
        from totais t, totais_estr te),
    'nrs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nr',        c.nr,
               'mestre',    c.v_mestre,
               'sistema',   c.v_sistema,
               'delta',     c.delta,
               'situacao',  c.situacao,
               'cobradora', c.cobradora,
               'carteira',  c.carteira,
               'operador',  c.operador,
               'onde',      coalesce(c.sistema_em_outro_setor, c.mestre_em_outro_setor))
             order by abs(c.delta) desc)
        from (select * from divergente order by abs(delta) desc limit v_lim) c
    ), '[]'::jsonb),
    'nrs_truncado', (select greatest(0, qtd - v_lim) from totais)
  ) into v_res;

  return v_res;
end;
$function$;

comment on function public.fn_mestre_diferenca_detalhe(uuid, text, uuid, integer) is
  'Onde esta cada centavo da diferenca de um setor, no mesmo recorte do 58 '
  '(carteira, conta na meta, sem somente_geral, COM Extra). Separa o ESTRUTURAL '
  '(bloco fora_da_comparacao) do DIVERGENTE (nrs). So leitura.';

-- ── Prova ──────────────────────────────────────────────────────────────────
--
-- As colunas que o serviço e a tela consomem, e a conta fechando sobre agosto
-- de verdade. Se qualquer uma falhar, a transação volta inteira.

do $prova$
declare
  v_faltando text;
begin
  select string_agg(c, ', ') into v_faltando
    from unnest(array['mestre_total','mestre_comparavel','mestre_fora_do_58',
                      'mestre_retencao','mestre_emprestado_para','mestre_emprestado_de',
                      'sistema_total','sistema_ajustes','diferenca']) as c
   where c not in (
     select unnest(p.proargnames)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_mestre_comparar_setores');

  if v_faltando is not null then
    raise exception 'fn_mestre_comparar_setores ficou sem as colunas: %', v_faltando;
  end if;
end
$prova$;

/*
 * A prova de valor roda como super_admin — a função filtra por
 * `fn_user_is_super_admin()`, e sem isso ela devolve zero linha e o teste
 * passaria vazio, que é pior que falhar.
 *
 * Os cinco números são os de 2026-09-13. Play 3, 4 e 5 têm de fechar em ZERO
 * contra `analitico_recebimentos`; Play Mix e Receptivo ficam com a diferença
 * de DADO que esta migration não corrige e documenta acima.
 */
do $prova$
declare
  v_emp  uuid := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  r      record;
  v_esperado numeric;
begin
  if to_regclass('public.mestre_recebimentos') is null then return; end if;
  if not exists (select 1 from mestre_lotes
                  where empresa_id = v_emp and mes = date '2026-08-01' and estado = 'vigente') then
    raise notice 'Sem lote vigente de 2026-08: prova de valor pulada.';
    return;
  end if;

  for r in
    select s.nome,
           round(sum(rec.recebido) filter (
             where fn_mestre_conta_na_meta(rec.colchao, rec.dt_pgto)
               and coalesce(me.destino, 'proprio') <> 'somente_geral'), 2) as v59,
           (select round(coalesce(sum(x.valor_recebido), 0), 2)
              from analitico_recebimentos x
             where x.empresa_id = v_emp and x.setor_id = g.setor_id
               and x.data_pagamento >= date '2026-08-01'
               and x.data_pagamento <  date '2026-09-01') as v58
      from mestre_recebimentos rec
      join mestre_lotes l on l.id = rec.lote_id and l.estado = 'vigente'
      join mestre_grupos g on g.empresa_id = rec.empresa_id
                          and g.cod_grupo_filtro = rec.cod_grupo_filtro
                          and g.estado = 'vinculado' and g.setor_id is not null
      join setores s on s.id = g.setor_id
      left join mestre_equipes me on me.empresa_id = rec.empresa_id
                                and me.cod_grupo_filtro = rec.cod_grupo_filtro
                                and me.nome_subgrupo = rec.subgrupo_equipe
     where rec.empresa_id = v_emp and rec.mes = date '2026-08-01'
       and g.setor_id in ('84a7e60b-dcb5-4962-90a4-f7d842438661',   -- Play 3
                          'a2f0aad7-f108-40a3-9c68-80798c7fd5c1',   -- Play 4
                          '8e20366d-6771-4dc9-9d4a-3ec579ad066e')   -- Play 5
     group by s.nome, g.setor_id
  loop
    if r.v59 is distinct from r.v58 then
      raise exception 'Recorte do 58 nao fecha em %: 59=% x 58=%', r.nome, r.v59, r.v58;
    end if;
  end loop;

  -- Receptivo: o recorte tem de dar 2.658.753,66, e a sobra de R$ 360,32 e de
  -- dado, nao de filtro. Se este numero mudar, alguem reimportou agosto.
  select round(sum(rec.recebido) filter (
           where fn_mestre_conta_na_meta(rec.colchao, rec.dt_pgto)
             and coalesce(me.destino, 'proprio') <> 'somente_geral'), 2)
    into v_esperado
    from mestre_recebimentos rec
    join mestre_lotes l on l.id = rec.lote_id and l.estado = 'vigente'
    left join mestre_equipes me on me.empresa_id = rec.empresa_id
                              and me.cod_grupo_filtro = rec.cod_grupo_filtro
                              and me.nome_subgrupo = rec.subgrupo_equipe
   where rec.empresa_id = v_emp and rec.mes = date '2026-08-01'
     and rec.cod_grupo_filtro = '63';

  if v_esperado is distinct from 2658753.66 then
    raise notice 'Receptivo mudou: recorte deu % (esperado 2658753.66).', v_esperado;
  end if;
end
$prova$;

commit;
