-- ─────────────────────────────────────────────────────────────────────────────
-- Onde está cada centavo da diferença entre o 59 e o sistema
--
-- ── O que existia ────────────────────────────────────────────────────────────
-- A aba de comparação mostrava MESTRE, SISTEMA e DIFERENÇA — e a diferença não
-- era a subtração das outras duas. Não era defeito de conta: a coluna MESTRE
-- mostra `mestre_total`, e a diferença é medida sobre `mestre_comparavel`, que
-- é `mestre_total` MENOS o Integral que outra carteira cobrou para este setor.
--
-- A regra está certa — o analítico não tem a 2ª perna do Integral, e comparar
-- com ela acusaria divergência falsa do tamanho exato da contribuição. Errado
-- era a tela pôr um número ao lado de uma diferença calculada sobre outro, sem
-- mostrar o do meio. Em 7 das 16 linhas as duas colunas não batiam.
--
-- ── O que esta função responde ───────────────────────────────────────────────
-- «Onde está cada centavo», em duas camadas.
--
-- **Estrutura** — as parcelas que fazem os dois lados divergirem POR
-- CONSTRUÇÃO, cada uma nomeada: Integral recebido, colchão fora da meta, equipe
-- emprestada para cá e daqui, ajustes manuais. Saem das colunas que
-- `fn_mestre_comparar_setores` já devolve, então são as mesmas que alimentam o
-- número da tabela.
--
-- **NRs** — a linha. Para cada `nr_documento` em que os dois lados discordam:
-- quanto o 59 tem, quanto o sistema tem, e ONDE está o que falta:
--
--     so_no_59        o NR não existe no analítico de lugar nenhum
--     outro_setor     existe no analítico, mas em OUTRO setor
--     outro_operador  existe no mesmo setor, com outro operador
--     so_no_sistema   o analítico tem e nenhuma carteira do 59 traz
--     valor_difere    os dois têm, com valores diferentes
--
-- ── Por que agregado por NR, e não linha a linha ─────────────────────────────
-- Tentei linha a linha primeiro, com a chave `NR + data + valor`. O resultado
-- foi inútil: no Play 1 deu R$ 165.486,56 «só no mestre» e exatamente
-- R$ 165.486,56 «só no sistema» — o mesmo dinheiro dos dois lados, desalinhado
-- pelo desempate de parcelas. Ruído do tamanho do sinal.
--
-- Agregando por `nr_documento`, o mesmo Play 1 fecha em 2.884 NRs com ZERO
-- divergência. A parcela não é do dado, é da forma de contar.
--
-- ── A chave ──────────────────────────────────────────────────────────────────
-- `mestre_recebimentos.nr_documento` = `analitico_recebimentos.codigo`. Medido:
-- 3.442 casamentos contra 0 para `cod_cli` e 0 para `titulo`.
--
-- ── Sobre o «não explicado» ──────────────────────────────────────────────────
-- A soma das parcelas fecha com a diferença oficial em 9 dos 10 setores
-- vinculados, ao centavo. No Receptivo sobra R$ 307.160,04, e isso NÃO é
-- escondido: vira uma linha própria.
--
-- Receptivo é a origem de todo o Integral da operação (R$ 624.844,68 saem dele
-- em setembro/2026), e o analítico dele tem R$ 311.117,33 em NRs que nenhuma
-- carteira dele traz no 59. Mostrar zero ali seria mentir; mostrar o resíduo é
-- o que faz alguém ir olhar.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mestre_diferenca_detalhe(
  p_empresa_id uuid,
  p_mes        text,
  p_setor_id   uuid,
  p_limite     integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
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

  -- A linha oficial: e dela que sai o numero que a tabela mostra.
  select * into v_cmp
    from fn_mestre_comparar_setores(p_empresa_id, p_mes) c
   where c.setor_id = p_setor_id
   limit 1;

  if v_cmp.setor_id is null then
    raise exception 'SETOR_SEM_COMPARACAO: setor % nao esta na comparacao de %.',
      p_setor_id, p_mes;
  end if;

  with
  -- O 59 deste setor: carteiras vinculadas a ele, o que conta na meta, sem o
  -- Extra (que e a segunda representacao de um pagamento ja contado).
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
  divergentes as (
    select * from juntos where abs(delta) >= 0.01
  ),
  -- Onde o NR aparece do OUTRO lado, quando nao aparece aqui.
  situado as (
    select d.*,
           -- No analitico de outro setor?
           (select s.nome from analitico_recebimentos x
              join setores s on s.id = x.setor_id
             where x.empresa_id = p_empresa_id and x.codigo = d.nr
               and x.setor_id is distinct from p_setor_id
               and x.data_pagamento >= v_mes
               and x.data_pagamento <  (v_mes + interval '1 month')
             limit 1) as sistema_em_outro_setor,
           -- No 59, em carteira de outro setor?
           (select coalesce(s2.nome, g2.nome_grupo_filtro)
              from mestre_recebimentos r2
              join mestre_lotes l2  on l2.id = r2.lote_id and l2.estado = 'vigente'
              join mestre_grupos g2 on g2.empresa_id = r2.empresa_id
                                   and g2.cod_grupo_filtro = r2.cod_grupo_filtro
              left join setores s2 on s2.id = g2.setor_id
             where r2.empresa_id = p_empresa_id and r2.mes = v_mes
               and r2.nr_documento = d.nr
               and g2.setor_id is distinct from p_setor_id
             limit 1) as mestre_em_outro_setor
      from divergentes d
  ),
  classificado as (
    select s.*,
           case
             when not s.tem_sistema and s.sistema_em_outro_setor is not null
               then 'outro_setor'
             when not s.tem_sistema then 'so_no_59'
             when not s.tem_mestre and s.mestre_em_outro_setor is not null
               then 'sistema_em_outro_setor'
             when not s.tem_mestre then 'so_no_sistema'
             else 'valor_difere'
           end as situacao
      from situado s
  ),
  totais as (
    select
      coalesce(sum(v_mestre)  filter (where situacao in ('so_no_59','outro_setor')), 0)              as so_59,
      coalesce(sum(v_sistema) filter (where situacao in ('so_no_sistema','sistema_em_outro_setor')), 0) as so_sistema,
      coalesce(sum(delta)     filter (where situacao = 'valor_difere'), 0)                            as difere,
      count(*)                                                                                       as qtd
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

    -- As parcelas que separam os dois lados POR CONSTRUÇÃO. Sinal na
    -- perspectiva da diferença (mestre − sistema).
    'estrutura', jsonb_build_array(
      jsonb_build_object('chave','contrib_integral','valor', v_cmp.mestre_contribuido,
        'rotulo','Integral recebido de outra carteira',
        'nota','Conta no 59 dos dois lados (rateio). O analítico não tem essa 2ª perna, então sai da comparação.'),
      jsonb_build_object('chave','colchao_fora','valor', v_cmp.mestre_colchao_fora,
        'rotulo','Colchão fora da meta',
        'nota','Pago fora da janela do colchão. Está no arquivo e não entra na conta da meta.'),
      jsonb_build_object('chave','emprestado_de','valor', v_cmp.mestre_emprestado_de,
        'rotulo','Equipe emprestada para cá',
        'nota','Equipe de outro setor cujo recebimento passou a contar aqui.'),
      jsonb_build_object('chave','emprestado_para','valor', v_cmp.mestre_emprestado_para,
        'rotulo','Equipe emprestada daqui',
        'nota','Equipe deste setor cujo recebimento passou a contar em outro.'),
      jsonb_build_object('chave','ajustes','valor', v_cmp.sistema_ajustes,
        'rotulo','Ajuste manual no sistema',
        'nota','Lançado à mão no analítico. Não existe no 59.')
    ),

    'resumo_nrs', (select jsonb_build_object(
        'so_59', so_59, 'so_sistema', so_sistema, 'difere', difere, 'qtd', qtd)
      from totais),

    -- O que a soma das parcelas NÃO explica. Zero em 9 dos 10 setores; onde
    -- não for, é dinheiro que merece alguém olhar — e por isso aparece.
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

COMMENT ON FUNCTION public.fn_mestre_diferenca_detalhe(uuid, text, uuid, integer) IS
  'Onde esta cada centavo da diferenca 59 x sistema de um setor: as parcelas '
  'estruturais (Integral, colchao, equipe emprestada, ajuste) e os NRs em que '
  'os dois lados discordam, dizendo se o NR esta em outro setor, com outro '
  'operador, ou em lugar nenhum. Agregado por nr_documento de proposito — '
  'linha a linha o desempate de parcelas produz ruido do tamanho do sinal.';

REVOKE ALL ON FUNCTION public.fn_mestre_diferenca_detalhe(uuid, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mestre_diferenca_detalhe(uuid, text, uuid, integer) TO authenticated;
