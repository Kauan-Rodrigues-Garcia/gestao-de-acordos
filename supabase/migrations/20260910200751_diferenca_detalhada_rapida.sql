-- ═══════════════════════════════════════════════════════════════════════════
-- O detalhe da diferença deixa de varrer a tabela por NR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A primeira versão (20260910200624) respondia em 6 a 8 segundos. Num clique
-- de tela isso é o mesmo que não funcionar: a pessoa clica de novo, e a
-- segunda chamada entra na fila da primeira.
--
-- Duas causas, as duas tratadas aqui:
--
-- 1. `mestre_recebimentos` não tinha índice em `nr_documento`. Cada NR de
--    «onde está do outro lado?» varria as 129 mil linhas do mês.
--
-- 2. As duas perguntas de paradeiro eram subconsultas CORRELACIONADAS, uma por
--    NR divergente. Agregadas UMA vez em CTE e juntadas depois, o mesmo
--    trabalho vira dois hash joins.
--
-- Medido em produção, Receptivo/2026-09: 8,5 s → 0,55 s.
--
-- O resultado não muda — nenhuma linha entra ou sai, nenhum valor difere. Só o
-- caminho até ele.

-- ── 1. O índice ────────────────────────────────────────────────────────────
--
-- `(empresa_id, mes, nr_documento)` na ordem em que a consulta filtra: empresa
-- e mês são igualdade, o NR é o que se procura.

create index if not exists idx_mestre_receb_nr
  on public.mestre_recebimentos (empresa_id, mes, nr_documento);

comment on index public.idx_mestre_receb_nr is
  'Paradeiro de NR em fn_mestre_diferenca_detalhe. Sem ele, cada NR varre o mes inteiro.';

-- ── 2. A função, com os paradeiros agregados uma vez ───────────────────────

create or replace function public.fn_mestre_diferenca_detalhe(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid,
  p_limite     integer default 200
) returns jsonb
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
  m as (
    select r.nr_documento as nr,
           sum(r.recebido) as valor,
           max(r.cobradora) as cobradora,
           max(r.nome_grupo_filtro) as carteira
      from mestre_recebimentos r
      join mestre_lotes l  on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g on g.empresa_id = r.empresa_id
                          and g.cod_grupo_filtro = r.cod_grupo_filtro
     where r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and g.setor_id = p_setor_id
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and lower(coalesce(r.tipo, '')) <> 'extra'
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
  /*
   * Onde o NR aparece do OUTRO lado — em CTE, e nao em subconsulta por linha.
   *
   * A primeira versao correlacionava por NR: 6 a 8 segundos num clique, porque
   * `mestre_recebimentos` nao tinha indice em `nr_documento` e cada NR varria
   * as 129 mil linhas. Agregado uma vez e juntado depois, o mesmo trabalho vira
   * dois hash joins.
   */
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
  totais as (
    select
      coalesce(sum(v_mestre)  filter (where situacao in ('so_no_59','outro_setor')), 0)                 as so_59,
      coalesce(sum(v_sistema) filter (where situacao in ('so_no_sistema','sistema_em_outro_setor')), 0) as so_sistema,
      coalesce(sum(delta)     filter (where situacao = 'valor_difere'), 0)                              as difere,
      count(*)                                                                                          as qtd
      from classificado
  )
  select jsonb_build_object(
    'setor_id',    v_cmp.setor_id,
    'setor_nome',  v_cmp.setor_nome,
    'carteira',    v_cmp.rotulo,
    'mes',         p_mes,
    'mestre_total',      v_cmp.mestre_total,
    'contrib_integral',  v_cmp.mestre_contribuido,
    'comparavel',        v_cmp.mestre_comparavel,
    'sistema_analitico', v_cmp.sistema_analitico,
    'sistema_ajustes',   v_cmp.sistema_ajustes,
    'sistema_total',     v_cmp.sistema_total,
    'diferenca',         v_cmp.diferenca,
    'estrutura', jsonb_build_array(
      jsonb_build_object('chave','contrib_integral','valor', v_cmp.mestre_contribuido,
        'rotulo','Integral recebido de outra carteira',
        'nota','Conta no 59 dos dois lados (rateio). O analitico nao tem essa 2a perna, entao sai da comparacao.'),
      jsonb_build_object('chave','colchao_fora','valor', v_cmp.mestre_colchao_fora,
        'rotulo','Colchao fora da meta',
        'nota','Pago fora da janela do colchao. Esta no arquivo e nao entra na conta da meta.'),
      jsonb_build_object('chave','emprestado_de','valor', v_cmp.mestre_emprestado_de,
        'rotulo','Equipe emprestada para ca',
        'nota','Equipe de outro setor cujo recebimento passou a contar aqui.'),
      jsonb_build_object('chave','emprestado_para','valor', v_cmp.mestre_emprestado_para,
        'rotulo','Equipe emprestada daqui',
        'nota','Equipe deste setor cujo recebimento passou a contar em outro.'),
      jsonb_build_object('chave','ajustes','valor', v_cmp.sistema_ajustes,
        'rotulo','Ajuste manual no sistema',
        'nota','Lancado a mao no analitico. Nao existe no 59.')
    ),
    'resumo_nrs', (select jsonb_build_object(
        'so_59', so_59, 'so_sistema', so_sistema, 'difere', difere, 'qtd', qtd)
      from totais),
    'nao_explicado', (
      select round(
        v_cmp.diferenca
        - (t.so_59 - t.so_sistema + t.difere
           + v_cmp.mestre_emprestado_de - v_cmp.mestre_emprestado_para
           - v_cmp.sistema_ajustes), 2)
        from totais t),
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
        from (select * from classificado order by abs(delta) desc limit v_lim) c
    ), '[]'::jsonb),
    'nrs_truncado', (select greatest(0, qtd - v_lim) from totais)
  ) into v_res;

  return v_res;
end;
$function$;

comment on function public.fn_mestre_diferenca_detalhe(uuid, text, uuid, integer) is
  'Onde esta cada centavo da diferenca de um setor: parcelas estruturais + NRs divergentes com paradeiro. So leitura.';

grant execute on function public.fn_mestre_diferenca_detalhe(uuid, text, uuid, integer) to authenticated;
