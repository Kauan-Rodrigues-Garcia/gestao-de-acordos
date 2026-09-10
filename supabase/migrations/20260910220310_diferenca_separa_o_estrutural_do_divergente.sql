-- ═══════════════════════════════════════════════════════════════════════════
-- A diferença para de chamar de divergência o que é estrutura
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que estava errado na leitura da tela
--
-- Abrir a diferença do Receptivo mostrava **686 NRs que divergem** para uma
-- diferença de R$ 6.934,58. Os dois números não conversam, e quem olha conclui
-- — com razão — que a tela está quebrada.
--
-- Não estava. O que ela chamava de «divergência» misturava duas coisas de
-- naturezas opostas:
--
--   1. NR que só um dos dois lados conhece, ou que os dois conhecem por valores
--      diferentes. Isso É divergência: alguém precisa olhar.
--
--   2. NR que os DOIS lados conhecem, cada um no seu lugar certo. O Receptivo
--      cobra para a carteira do Play 3: o 59 registra a cobrança no Receptivo,
--      e o analítico registra o acordo no Play 3. Nenhum dos dois está errado —
--      é assim que a operação funciona.
--
-- O caso 2 é a esmagadora maioria das 686 linhas, e ele nunca deveria ter
-- entrado numa lista chamada «NRs que divergem». Ele sai para um bloco próprio:
-- `fora_da_comparacao`.
--
-- ## A conta não muda
--
-- Os valores continuam entrando na reconciliação, e `nao_explicado` devolve
-- exatamente o mesmo número de antes. O que muda é onde eles aparecem:
--
--     antes:  so_59  = so_no_59 + outro_setor
--     agora:  so_59  = so_no_59
--             fora_59 = outro_setor          ← bloco próprio
--
--     nao_explicado = diferenca
--                   − (so_59 + fora_59 − so_sistema − fora_sistema + difere
--                      + emprestado_de − emprestado_para − sistema_ajustes)
--
-- Mover uma parcela de lugar sem mexer na soma é o ponto: a tela passa a
-- separar «isto é assim mesmo» de «isto alguém tem que olhar», e o total
-- continua fechando.
--
-- Os NRs do bloco estrutural continuam disponíveis — `fora_da_comparacao` traz
-- a lista, para quem quiser clicar e conferir. Ela só não aparece mais no meio
-- do que exige ação.
--
-- ## «Equipe emprestada» passa a dizer QUEM
--
-- A tela mostrava «Equipe emprestada para cá — R$ 614,16» e parava aí. Sem nome
-- de pessoa, sem carteira, sem setor: um valor que ninguém consegue conferir e
-- que, por isso, ninguém acredita.
--
-- Apesar do rótulo, a marcação é por PESSOA e não por equipe: `emprestada` em
-- `fn_mestre_resumo_grupos` marca a linha em que `operador_setor_id` difere do
-- setor da carteira. Cada parcela ganha agora um `detalhe` com cobradora,
-- carteira, o outro setor e o valor de cada uma.
--
--   emprestado_para  o dinheiro SAI daqui: a carteira é deste setor, e quem
--                    cobrou é de outro.
--   emprestado_de    o dinheiro CHEGA aqui: a pessoa é deste setor, e cobrou na
--                    carteira de outro.
--
-- ## O colchão sai de cena em setembro
--
-- A parcela «colchão fora da meta» continua no lugar, e a partir de 2026-09 ela
-- vale zero — a migration 20260910220000 tirou a exceção. A tela deixa de
-- desenhar parcela zerada, então ela some sozinha nos meses novos e continua
-- visível em agosto, onde a exceção existiu de verdade.
--
-- ## Escrita: nenhuma
--
-- Só `create or replace` de uma função de leitura. Nenhuma linha de
-- `mestre_recebimentos`, `analitico_recebimentos` ou `mestre_equipes` é tocada.
--
-- ## Esta função DERIVOU do repositório antes desta migration
--
-- A versão que rodava no banco não era a de `20260910200751`. Esta migration
-- parte do que estava NO AR (lido com `pg_get_functiondef`), e não do arquivo —
-- reescrever por cima do arquivo teria desfeito o índice e as CTEs de
-- desempenho aplicadas pelo dashboard. Ver `20260910240000`, que traz as outras
-- duas funções derivadas para cá.
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
  /*
   * ── A separação, e é o ponto desta migration ──
   *
   * `estrutural` é o NR que os dois lados conhecem, cada um no seu lugar certo:
   * o 59 registra a cobrança aqui, o analítico registra o acordo no setor dono
   * da carteira. Não há nada a investigar — é o desenho da operação.
   *
   * `divergente` é o que sobra, e é isso que alguém precisa olhar.
   */
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
  /*
   * ── Quem é a «equipe emprestada» ──
   *
   * A marcação é por PESSOA, apesar do rótulo: `fn_mestre_resumo_grupos` marca
   * a linha em que `operador_setor_id` difere do setor da carteira, e conta
   * `distinct cobradora`. As duas listas abaixo reproduzem exatamente esse
   * filtro, para o detalhe somar o mesmo que a parcela.
   */
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
  -- Sai daqui: a carteira é deste setor, quem cobrou é de fora.
  emp_para as (
    select e.cobradora, e.carteira,
           coalesce(e.setor_operador_nome, '—') as outro_setor,
           sum(e.recebido) as valor
      from linhas_emp e
     where e.setor_carteira = p_setor_id
     group by 1, 2, 3
  ),
  -- Chega aqui: a pessoa é deste setor, cobrou na carteira de fora.
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
        'nota','Excecao de agosto/2026. De setembro em diante o colchao conta como qualquer linha, e esta parcela vale zero.'),
      jsonb_build_object('chave','emprestado_de','valor', v_cmp.mestre_emprestado_de,
        'rotulo','Emprestado para ca',
        'nota','Gente deste setor que cobrou na carteira de outro. O 59 conta aqui; o analitico lancou la.',
        'detalhe', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'cobradora', e.cobradora, 'carteira', e.carteira,
                   'outro_setor', e.outro_setor, 'valor', e.valor)
                 order by e.valor desc)
            from emp_de e), '[]'::jsonb)),
      jsonb_build_object('chave','emprestado_para','valor', v_cmp.mestre_emprestado_para,
        'rotulo','Emprestado daqui',
        'nota','Gente de outro setor que cobrou na carteira deste. O 59 conta la; o analitico lancou aqui.',
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
    /*
     * O bloco novo: o que os dois lados conhecem, cada um no seu lugar.
     * Nao e divergencia, e por isso nao entra na lista que pede acao — mas o
     * valor continua na reconciliacao, e os NRs ficam aqui para quem quiser
     * conferir.
     */
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
     * A soma NAO muda. `fora_59` e `fora_sistema` saem da lista de divergentes
     * e entram aqui explicitamente — se ficassem de fora da conta, o
     * «nao explicado» inflaria pelo tamanho exato do bloco estrutural, e a tela
     * passaria a acusar como buraco justamente o que ela acabou de explicar.
     */
    'nao_explicado', (
      select round(
        v_cmp.diferenca
        - (t.so_59 + te.fora_59 - t.so_sistema - te.fora_sistema + t.difere
           + v_cmp.mestre_emprestado_de - v_cmp.mestre_emprestado_para
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
  'Onde esta cada centavo da diferenca de um setor. Separa o ESTRUTURAL (NR que '
  'os dois lados conhecem, cada um no seu lugar — bloco fora_da_comparacao) do '
  'DIVERGENTE (o que alguem precisa olhar — nrs). As parcelas de emprestimo '
  'trazem cobradora, carteira e setor. So leitura.';

commit;
