-- ═══════════════════════════════════════════════════════════════════════════
-- O detalhe volta à regra única, e `fn_mestre_esta_no_58` sai de cena
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Par da 20260913173442. A CTE `m` volta a `fn_mestre_conta_na_meta` para o
-- lado do 59 somar exatamente `mestre_comparavel` — é isso que permite o «não
-- explicado» chegar a zero. `linhas_emp` nunca mudou: ela reproduz o
-- empréstimo de `fn_mestre_resumo_grupos`, que sempre foi regra de meta.
--
-- A parcela «Colchão fora da meta» volta ao nome antigo e passa a valer zero
-- de setembro em diante — não porque esteja escondida, mas porque não existe
-- mais colchão a separar.
--
-- Com nenhuma função consultando o predicado separado, ele é derrubado aqui.
-- Duas funções idênticas são duas chances de divergir.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

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
        'nota','So existe ate agosto/2026. De 01/09/2026 em diante o colchao deixou de ser categoria: e linha comum nos dois lados, e esta parcela vale zero.'),
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
  '(carteira, fn_mestre_conta_na_meta, sem somente_geral, COM Extra). Separa o '
  'ESTRUTURAL (fora_da_comparacao) do DIVERGENTE (nrs). So leitura.';

-- Nenhuma funcao consulta mais o predicado separado: a regra voltou a ser uma.
drop function if exists public.fn_mestre_esta_no_58(boolean, date);

-- ── Prova ──────────────────────────────────────────────────────────────────

do $prova$
begin
  if to_regprocedure('public.fn_mestre_esta_no_58(boolean, date)') is not null then
    raise exception 'fn_mestre_esta_no_58 deveria ter saido.';
  end if;
  -- A regra unica, nas datas que decidem.
  if not fn_mestre_conta_na_meta(true, date '2026-08-10') then
    raise exception 'Colchao de 10/08/2026 conta (excecao daquele mes).';
  end if;
  if fn_mestre_conta_na_meta(true, date '2026-08-20') then
    raise exception 'Colchao de 20/08/2026 NAO conta.';
  end if;
  if not fn_mestre_conta_na_meta(true, date '2026-09-05') then
    raise exception 'De setembro em diante o colchao e linha comum e conta.';
  end if;
  if fn_mestre_conta_na_meta(true, date '2026-07-15') then
    raise exception 'Colchao de julho segue fora, como sempre esteve.';
  end if;
end
$prova$;

commit;
