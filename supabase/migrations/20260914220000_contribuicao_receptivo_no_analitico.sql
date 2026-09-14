-- ============================================================================
-- A Contribuição Receptivo passa a ENTRAR no analítico com o 59
-- ============================================================================
--
-- Pedido de 14/09/2026: «o valor total já ir correto e só mostrar qual é o
-- total da contribuição do receptivo — assim que o 59 for importado atualiza o
-- valor geral já com a contribuição de cada setor, sem conta nenhuma».
--
-- ## O que havia
--
-- A sincronização do 59 gravava no analítico só a 1ª perna do rateio: o
-- `Integral` que o Receptivo cobra PARA o Play 1 ficava só no Receptivo. A tela
-- somava a contribuição por cima em quatro lugares (card do setor, comissão,
-- Dashboard), e as outras ~20 telas que leem o total do setor não somavam — a
-- aba Analítico do Play 1 mostrava R$ 238 mil a menos que o card.
--
-- ## O que passa a haver
--
-- A 2ª perna vira linha do analítico no setor que recebeu, com procedência
-- própria: `contribuicao_59`. Toda tela que lê o setor passa a ver o total com a
-- contribuição, e o card só soma essas linhas.
--
-- ## Os três cuidados, e como cada um foi resolvido
--
--   1. Não contar para o operador do Receptivo de novo: a linha nasce SEM
--      `operador_id`. Toda soma por operador (resumo, destaques, desafios, TV,
--      ranking) já exige `operador_id is not null`.
--   2. Não colidir no `idx_analitico_unicidade` (empresa, NR, data, forma,
--      login): o login é um marcador por setor de destino,
--      `#contribuicao>` + setor. Sem ele a gravação moveria a linha do Receptivo.
--   3. Não inchar o total da EMPRESA: o dinheiro está no Receptivo E no setor que
--      recebeu. As leituras de empresa, a conferência 58×59 e a validação passam a
--      ler o analítico sem `contribuicao_59` (bloco 6). As que já filtram
--      `relatorio_58` (pendências, remoção prevista) não precisam.
--
-- Uma linha que JÁ conta no destino pela 1ª perna (equipe movida para o mesmo
-- setor) não gera contribuição: somaria duas vezes ali.
--
-- ## Medido antes (setembro/2026, BookPlay)
--
--   Play 1  1.009 linhas  R$ 242.958,60     Play 4   33  R$ 12.791,78
--   Play 2    142         R$  62.069,03     Play 5   16  R$  5.761,66
--   Play 3     90         R$  60.638,05     Jornada 156  R$ 52.639,82
--
-- Igual ao centavo a `fn_mestre_diretoria_linhas` origem `integral`.
-- ============================================================================

begin;

set local lock_timeout = '15s';
set local statement_timeout = '180s';

-- ============================================================================
-- 1. A procedência nova e de onde a contribuição veio
-- ============================================================================

alter table public.analitico_recebimentos
  drop constraint if exists analitico_recebimentos_procedencia_valida;
alter table public.analitico_recebimentos
  add constraint analitico_recebimentos_procedencia_valida
  check (procedencia in ('relatorio_58','relatorio_59','manual','contribuicao_59')) not valid;
alter table public.analitico_recebimentos
  validate constraint analitico_recebimentos_procedencia_valida;

comment on column public.analitico_recebimentos.procedencia is
  'De onde a linha veio: relatorio_58 (importacao do analitico), relatorio_59 (o mestre escreveu), '
  'manual (correcao de super_admin) ou contribuicao_59 (a 2a perna do Integral que outro setor cobrou '
  'PARA este — sem operador, conta no setor e NAO no total da empresa).';

alter table public.analitico_recebimentos
  add column if not exists contribuicao_de_setor_id uuid;

comment on column public.analitico_recebimentos.contribuicao_de_setor_id is
  'So em procedencia = contribuicao_59: o setor de quem cobrou (o Receptivo). Nulo nas demais.';

create index if not exists idx_analitico_contribuicao
  on public.analitico_recebimentos (empresa_id, mes_referencia, setor_id)
  where procedencia = 'contribuicao_59';

-- ============================================================================
-- 2. A contribuição, como o 59 a escreve
-- ============================================================================
--
-- A MESMA regra da 2a perna de `fn_mestre_diretoria_linhas`: o destino sai do
-- nome «Carteira - Destino» da coluna setor, o grupo destino precisa estar
-- vinculado, so Integral, colchao fora. Uma linha por (setor, NR, data, forma).

create or replace view public.vw_mestre_contribuicao_analitico as
with nomes as (
  select distinct r.empresa_id, r.mes, r.cod_grupo_filtro, r.nome_grupo_filtro
    from mestre_recebimentos r
    join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
   where r.nome_grupo_filtro <> ''
),
base as (
  select r.empresa_id,
         r.mes,
         gd.setor_id,
         case when g.estado = 'vinculado' then g.setor_id end as origem_setor_id,
         fn_mestre_setor_resolvido(case when g.estado = 'vinculado' then g.setor_id end,
                                   me.destino, me.destino_setor_id) as setor_primeira_perna,
         coalesce(r.nr_documento, '')          as codigo,
         r.dt_pgto                             as data_pagamento,
         fn_analitico_forma_do_tpdoc(r.tp_doc) as forma_pagamento,
         btrim(r.tp_doc)                       as forma_detalhe,
         nullif(btrim(r.cliente), '')          as nome_cliente,
         nullif(btrim(r.empresa_erp), '')      as instituicao,
         r.recebido
    from mestre_recebimentos r
    join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
    cross join lateral (
      select case when r.nome_grupo_filtro <> ''
                   and starts_with(r.setor, r.nome_grupo_filtro || ' - ')
                  then substr(r.setor, length(r.nome_grupo_filtro) + 4) end as destino_nome
    ) dn
    join nomes n
      on n.empresa_id = r.empresa_id and n.mes = r.mes and n.nome_grupo_filtro = dn.destino_nome
    join mestre_grupos gd
      on gd.empresa_id = r.empresa_id and gd.cod_grupo_filtro = n.cod_grupo_filtro
     and gd.estado = 'vinculado' and gd.setor_id is not null
    left join mestre_grupos g
      on g.empresa_id = r.empresa_id and g.cod_grupo_filtro = r.cod_grupo_filtro
    left join mestre_equipes me
      on me.empresa_id = r.empresa_id and me.cod_grupo_filtro = r.cod_grupo_filtro
     and me.nome_subgrupo = r.subgrupo_equipe
   where fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
     and n.cod_grupo_filtro <> r.cod_grupo_filtro
     and lower(r.tipo) <> 'extra'
     and r.dt_pgto is not null
)
select b.empresa_id,
       b.mes,
       b.setor_id,
       (array_agg(b.origem_setor_id) filter (where b.origem_setor_id is not null))[1] as origem_setor_id,
       '#contribuicao>' || b.setor_id::text as operador_usuario,
       b.codigo,
       b.data_pagamento,
       b.forma_pagamento,
       max(b.forma_detalhe)  as forma_detalhe,
       max(b.nome_cliente)   as nome_cliente,
       max(b.instituicao)    as instituicao,
       round(sum(b.recebido), 2) as valor_recebido,
       count(*)::bigint      as linhas_no_59
  from base b
 where b.setor_primeira_perna is distinct from b.setor_id
 group by b.empresa_id, b.mes, b.setor_id, b.codigo, b.data_pagamento, b.forma_pagamento;

comment on view public.vw_mestre_contribuicao_analitico is
  'A 2a perna do Integral (o que outro setor cobrou PARA este) como linhas do analitico, por empresa e '
  'mes. Mesma regra de fn_mestre_diretoria_linhas origem integral. Nao concedida a authenticated.';

revoke all on public.vw_mestre_contribuicao_analitico from public;
revoke all on public.vw_mestre_contribuicao_analitico from authenticated;

-- ============================================================================
-- 3. Trocar a fonte de um setor grava a contribuição junto
-- ============================================================================

create or replace function public.fn_mestre_aplicar_no_analitico_interno(
  p_empresa_id uuid, p_mes text, p_setor_id uuid, p_lote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mes_data      date := (p_mes || '-01')::date;
  v_valor_antes   numeric;
  v_removidas     integer := 0;
  v_projetadas    integer;
  v_gravadas      integer;
  v_contribuicoes integer := 0;
  v_valor_depois  numeric;
begin
  select count(*) into v_projetadas
    from vw_mestre_projecao_analitico v
   where v.empresa_id = p_empresa_id and v.mes = v_mes_data and v.setor_id = p_setor_id;

  if v_projetadas = 0 then
    raise exception
      'PROJECAO_VAZIA: o 59 nao projeta nenhuma linha para este setor em %. '
      'Confira o vinculo da carteira antes de trocar a fonte.', p_mes;
  end if;

  select coalesce(sum(valor_recebido), 0) into v_valor_antes
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
   where a.empresa_id = p_empresa_id and a.mes_referencia = v_mes_data
     and a.setor_id = p_setor_id
     and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59');
  get diagnostics v_removidas = row_count;

  delete from analitico_recebimentos a
   where a.empresa_id = p_empresa_id and a.mes_referencia = v_mes_data
     and a.setor_id = p_setor_id
     and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59');

  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, lote_id, importado_por_id, importado_em)
  select p_empresa_id, v.operador_id, v.operador_usuario, v.codigo, v.nome_cliente,
         v.forma_pagamento, v.forma_detalhe, v.valor_recebido, 0,
         v.data_pagamento, v_mes_data, v.setor_id, v.tipo_comissao, v.instituicao,
         'relatorio_59', p_lote_id, auth.uid(), now()
    from vw_mestre_projecao_analitico v
   where v.empresa_id = p_empresa_id and v.mes = v_mes_data and v.setor_id = p_setor_id
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
  do update set
    setor_id       = excluded.setor_id,
    operador_id    = excluded.operador_id,
    valor_recebido = excluded.valor_recebido,
    nome_cliente   = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
    forma_detalhe  = excluded.forma_detalhe,
    tipo_comissao  = coalesce(excluded.tipo_comissao, analitico_recebimentos.tipo_comissao),
    instituicao    = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
    procedencia    = 'relatorio_59',
    lote_id        = excluded.lote_id;
  get diagnostics v_gravadas = row_count;

  -- A contribuição que outro setor cobrou para este (14/09/2026).
  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, contribuicao_de_setor_id, lote_id, importado_por_id, importado_em)
  select p_empresa_id, null, c.operador_usuario, c.codigo, c.nome_cliente,
         c.forma_pagamento, c.forma_detalhe, c.valor_recebido, 0,
         c.data_pagamento, v_mes_data, c.setor_id, 'Integral', c.instituicao,
         'contribuicao_59', c.origem_setor_id, p_lote_id, auth.uid(), now()
    from vw_mestre_contribuicao_analitico c
   where c.empresa_id = p_empresa_id and c.mes = v_mes_data and c.setor_id = p_setor_id
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
  do update set
    setor_id                 = excluded.setor_id,
    valor_recebido           = excluded.valor_recebido,
    nome_cliente             = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
    forma_detalhe            = excluded.forma_detalhe,
    instituicao              = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
    procedencia              = 'contribuicao_59',
    contribuicao_de_setor_id = excluded.contribuicao_de_setor_id,
    lote_id                  = excluded.lote_id;
  get diagnostics v_contribuicoes = row_count;

  select coalesce(sum(valor_recebido), 0) into v_valor_depois
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  return jsonb_build_object(
    'setor_id', p_setor_id, 'removidas', v_removidas, 'gravadas', v_gravadas,
    'contribuicoes', v_contribuicoes,
    'valor_antes', round(v_valor_antes, 2), 'valor_depois', round(v_valor_depois, 2),
    'delta', round(v_valor_depois - v_valor_antes, 2));
end;
$function$;

revoke all on function public.fn_mestre_aplicar_no_analitico_interno(uuid, text, uuid, uuid) from public;
revoke all on function public.fn_mestre_aplicar_no_analitico_interno(uuid, text, uuid, uuid) from authenticated;

-- ============================================================================
-- 4. A entrada do 59 sincroniza a contribuição junto
-- ============================================================================

create or replace function public.fn_mestre_sincronizar_analitico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mes           text;
  v_antes         numeric;
  v_depois        numeric;
  v_alvos         integer;
  v_pulados       integer;
  v_removidas     integer;
  v_gravadas      integer;
  v_contribuicoes integer := 0;
begin
  if new.estado is distinct from 'vigente'
     or coalesce(old.estado, '') = 'vigente' then
    return new;
  end if;

  v_mes := to_char(new.mes, 'YYYY-MM');

  -- O alvo: setor que JA e do 59 E que a projecao deste lote tem. Setor que o
  -- lote nao trouxe fica de fora e conserva o dado anterior — apagar e nao por
  -- nada no lugar continua sendo impossivel.
  drop table if exists _sync_alvo;
  create temp table _sync_alvo on commit drop as
    select distinct a.setor_id
      from analitico_recebimentos a
     where a.empresa_id = new.empresa_id
       and a.mes_referencia = new.mes
       and a.setor_id is not null
       and a.procedencia = 'relatorio_59'
       and exists (select 1 from vw_mestre_projecao_analitico v
                    where v.empresa_id = new.empresa_id and v.mes = new.mes
                      and v.setor_id = a.setor_id);

  select count(*) into v_alvos from _sync_alvo;
  if v_alvos = 0 then
    return new;
  end if;

  select count(distinct a.setor_id) into v_pulados
    from analitico_recebimentos a
   where a.empresa_id = new.empresa_id and a.mes_referencia = new.mes
     and a.setor_id is not null and a.procedencia = 'relatorio_59'
     and not exists (select 1 from _sync_alvo z where z.setor_id = a.setor_id);

  select coalesce(sum(valor_recebido), 0) into v_antes
    from analitico_recebimentos
   where empresa_id = new.empresa_id and mes_referencia = new.mes
     and setor_id in (select setor_id from _sync_alvo);

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select new.id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
   where a.empresa_id = new.empresa_id and a.mes_referencia = new.mes
     and a.setor_id in (select setor_id from _sync_alvo)
     and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59');
  get diagnostics v_removidas = row_count;

  delete from analitico_recebimentos a
   where a.empresa_id = new.empresa_id and a.mes_referencia = new.mes
     and a.setor_id in (select setor_id from _sync_alvo)
     and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59');

  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, lote_id, importado_por_id, importado_em)
  select new.empresa_id, v.operador_id, v.operador_usuario, v.codigo, v.nome_cliente,
         v.forma_pagamento, v.forma_detalhe, v.valor_recebido, 0,
         v.data_pagamento, new.mes, v.setor_id, v.tipo_comissao, v.instituicao,
         'relatorio_59', new.id, auth.uid(), now()
    from vw_mestre_projecao_analitico v
   where v.empresa_id = new.empresa_id and v.mes = new.mes
     and v.setor_id in (select setor_id from _sync_alvo)
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
  do update set
    setor_id       = excluded.setor_id,
    operador_id    = excluded.operador_id,
    valor_recebido = excluded.valor_recebido,
    nome_cliente   = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
    forma_detalhe  = excluded.forma_detalhe,
    tipo_comissao  = coalesce(excluded.tipo_comissao, analitico_recebimentos.tipo_comissao),
    instituicao    = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
    procedencia    = 'relatorio_59',
    lote_id        = excluded.lote_id;
  get diagnostics v_gravadas = row_count;

  -- A contribuição que outro setor cobrou para cada setor sincronizado.
  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, contribuicao_de_setor_id, lote_id, importado_por_id, importado_em)
  select new.empresa_id, null, c.operador_usuario, c.codigo, c.nome_cliente,
         c.forma_pagamento, c.forma_detalhe, c.valor_recebido, 0,
         c.data_pagamento, new.mes, c.setor_id, 'Integral', c.instituicao,
         'contribuicao_59', c.origem_setor_id, new.id, auth.uid(), now()
    from vw_mestre_contribuicao_analitico c
   where c.empresa_id = new.empresa_id and c.mes = new.mes
     and c.setor_id in (select setor_id from _sync_alvo)
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
  do update set
    setor_id                 = excluded.setor_id,
    valor_recebido           = excluded.valor_recebido,
    nome_cliente             = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
    forma_detalhe            = excluded.forma_detalhe,
    instituicao              = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
    procedencia              = 'contribuicao_59',
    contribuicao_de_setor_id = excluded.contribuicao_de_setor_id,
    lote_id                  = excluded.lote_id;
  get diagnostics v_contribuicoes = row_count;

  select coalesce(sum(valor_recebido), 0) into v_depois
    from analitico_recebimentos
   where empresa_id = new.empresa_id and mes_referencia = new.mes
     and setor_id in (select setor_id from _sync_alvo);

  begin
    insert into logs_sistema (
      acao, categoria, severidade, descricao, empresa_id, tabela,
      alvo_tipo, alvo_rotulo, origem, detalhes)
    values ('importacao_concluida', 'importacao',
      case when v_pulados > 0 then 'aviso' else 'info' end,
      format('O relatório 59 sincronizou %s setor(es) em %s — %s linha(s) no lugar de %s, '
             || 'de R$ %s para R$ %s%s',
             v_alvos, v_mes, v_gravadas + v_contribuicoes, v_removidas,
             translate(to_char(v_antes, 'FM999,999,990.00'), ',.', '.,'),
             translate(to_char(v_depois, 'FM999,999,990.00'), ',.', '.,'),
             case when v_pulados > 0
                  then format('; %s setor(es) sem linha neste lote, mantidos como estavam', v_pulados)
                  else '' end),
      new.empresa_id, 'analitico_recebimentos', 'importacao_analitico',
      format('Mês %s', v_mes), 'trigger',
      jsonb_build_object('mes', v_mes, 'lote_59', new.id,
        'setores_sincronizados', v_alvos, 'setores_pulados', v_pulados,
        'removidas', v_removidas, 'gravadas', v_gravadas,
        'contribuicoes', v_contribuicoes,
        'valor_antes', v_antes, 'valor_depois', v_depois));
  exception when others then
    null;  -- trilha e conveniencia; nada aqui derruba a promocao.
  end;

  return new;
end;
$function$;

-- ============================================================================
-- 5. Devolver o setor ao 58 tira a contribuição junto
-- ============================================================================

create or replace function public.fn_mestre_devolver_ao_58(
  p_empresa_id uuid, p_mes text, p_setor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mes_data  date := (p_mes || '-01')::date;
  v_tiradas   integer := 0;
  v_guardadas integer;
  v_voltaram  integer := 0;
  v_valor_antes  numeric;
  v_valor_depois numeric;
begin
  if not fn_user_is_super_admin() then
    raise exception 'Somente super_admin pode trocar a fonte de um setor.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  select coalesce(sum(valor_recebido), 0) into v_valor_antes
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  select count(*) into v_guardadas
    from analitico_removidos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data
     and setor_id = p_setor_id and restaurado_em is null;

  if v_guardadas = 0 then
    raise exception
      'NADA_GUARDADO: nao ha retrato guardado do setor em % para repor. '
      'Ou a fonte nunca foi trocada, ou ja foi devolvida.', p_mes;
  end if;

  -- 1. Tirar o que o 59 escreveu, contribuição inclusive. Antes de repor, senao
  --    a reposicao esbarra no indice de unicidade e volta quase nada, em silencio.
  delete from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data
     and setor_id = p_setor_id and procedencia in ('relatorio_59', 'contribuicao_59');
  get diagnostics v_tiradas = row_count;

  -- 2. Repor o que estava guardado. A contribuição não volta: ela é do 59, e o
  --    setor está saindo dele.
  with alvo as (
    select r.conteudo
      from analitico_removidos r
     where r.empresa_id = p_empresa_id and r.mes_referencia = v_mes_data
       and r.setor_id = p_setor_id and r.restaurado_em is null
       and coalesce(r.conteudo->>'procedencia', '') <> 'contribuicao_59'
  ),
  voltou as (
    insert into analitico_recebimentos
    select (jsonb_populate_record(null::analitico_recebimentos, a.conteudo)).*
      from alvo a
    -- Correcao manual lancada no meio-tempo fica: e trabalho de gente.
    on conflict do nothing
    returning id
  )
  select count(*) into v_voltaram from voltou;

  update analitico_removidos
     set restaurado_em = now(), restaurado_por_id = auth.uid()
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data
     and setor_id = p_setor_id and restaurado_em is null;

  select coalesce(sum(valor_recebido), 0) into v_valor_depois
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = v_mes_data and setor_id = p_setor_id;

  return jsonb_build_object(
    'mes', p_mes, 'setor_id', p_setor_id,
    'tiradas_do_59', v_tiradas,
    'guardadas', v_guardadas,
    'voltaram', v_voltaram,
    'ja_estavam', v_guardadas - v_voltaram,
    'valor_antes', round(v_valor_antes, 2),
    'valor_depois', round(v_valor_depois, 2));
end;
$function$;

-- ============================================================================
-- 6. Dashboard: a linha diz se é contribuição
-- ============================================================================
--
-- A tela decide o escopo (`linhaNoEscopo`): no setor a contribuição conta, na
-- empresa não. Para isso a linha precisa dizer o que é.

create or replace function public.fn_analitico_dashboard_mes_json(p_empresa_id uuid, p_mes text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_eu         uuid := (select auth.uid());
  v_escopo     integer;
  v_setores    uuid[] := array[]::uuid[];
  v_operadores uuid[] := array[]::uuid[];
  v_inicio     date := (p_mes || '-01')::date;
  v_fim        date := (date_trunc('month', (p_mes || '-01')::date)
                        + interval '1 month' - interval '1 day')::date;
  v_out        jsonb;
begin
  if not public.fn_can_access_empresa(p_empresa_id) then
    return '[]'::jsonb;
  end if;

  v_escopo := public.fn_user_escopo_analitico();

  if v_escopo = 2 then
    v_setores := array(select public.fn_setores_do_operador(v_eu));
    v_operadores := array(
      select p.id
        from public.perfis p
       where p.empresa_id = p_empresa_id
         and (
           p.setor_id = any(v_setores)
           or exists (
             select 1 from public.fn_equipes_do_operador(p.id) eq
              where eq.setor_id = any(v_setores)
           )
         )
    );
  elsif v_escopo = 1 then
    v_operadores := array(
      select p.id
        from public.perfis p
       where p.empresa_id = p_empresa_id
         and public.fn_operador_no_meu_alcance_de_equipe(p.id)
    );
  end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb)
    into v_out
    from (
      select
        ar.data_pagamento               as dia,
        ar.operador_id,
        coalesce(ar.setor_id, imp.setor_id) as setor_id,
        ar.forma_pagamento,
        ar.forma_detalhe,
        ar.status_tabulacao,
        -- 14/09/2026: conta no setor, não na empresa. Ver `linhaNoEscopo`.
        (ar.procedencia = 'contribuicao_59') as contribuicao,
        ar.contribuicao_de_setor_id,
        sum(ar.valor_recebido)::numeric as total,
        sum(ar.total_ho)::numeric       as total_ho,
        count(*)::bigint                as qtd
      from public.analitico_recebimentos ar
      left join public.perfis imp on imp.id = ar.importado_por_id
      where ar.empresa_id     = p_empresa_id
        and ar.data_pagamento between v_inicio and v_fim
        and (
          v_escopo >= 3
          or ar.operador_id = v_eu
          or coalesce(ar.setor_id, imp.setor_id) = any(v_setores)
          or ar.operador_id = any(v_operadores)
        )
      group by ar.data_pagamento, ar.operador_id,
               coalesce(ar.setor_id, imp.setor_id),
               ar.forma_pagamento, ar.forma_detalhe, ar.status_tabulacao,
               (ar.procedencia = 'contribuicao_59'), ar.contribuicao_de_setor_id
    ) t;

  return v_out;
end;
$function$;

-- ============================================================================
-- 7. Leituras de empresa, conferência 58×59 e validação: sem a contribuição
-- ============================================================================
--
-- Em vez de reescrever sete funções longas (e arriscar trazer de volta uma
-- versão velha do repositório — o histórico de migrations está defasado), o
-- corpo VIVO de cada uma é lido e a tabela é trocada por um recorte dela sem
-- `contribuicao_59`. A consulta muda de fonte, e nada mais. Se o padrão não for
-- achado, a migration para aqui e nada é aplicado.

do $patch$
declare
  v_fn     record;
  v_def    text;
  v_novo   text;
  v_marca  constant text := '__ANALITICO_SEM_CONTRIBUICAO__';
  v_filtro constant text :=
    '(select * from public.analitico_recebimentos where procedencia <> ''contribuicao_59'')';
begin
  for v_fn in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_analitico_atualizar_resumo', 'fn_mestre_fontes_dos_setores',
                         'fn_mestre_comparar_setores', 'fn_mestre_diferenca_detalhe',
                         'fn_mestre_divergencias', 'fn_relatorio_validar_setor',
                         'fn_relatorio_status_validacao')
  loop
    v_def := pg_get_functiondef(v_fn.oid);

    -- Já trocada (a migration rodou antes): trocar de novo embrulharia o recorte
    -- dentro dele mesmo.
    if position(v_filtro in v_def) > 0 then
      raise notice 'contribuicao_59: % ja le o analitico sem a contribuicao', v_fn.proname;
      continue;
    end if;

    -- Sem apelido: `from analitico_recebimentos where ...` — o recorte ganha o
    -- nome da tabela como apelido, e as colunas soltas continuam valendo.
    v_novo := regexp_replace(v_def,
      '(from|join)(\s+)(public\.)?analitico_recebimentos(\s+)(where|group|order|limit)\M',
      '\1\2' || v_marca || ' analitico_recebimentos\4\5', 'gi');

    -- Com apelido: `from analitico_recebimentos ar`, `join ... x`.
    v_novo := regexp_replace(v_novo,
      '(from|join)(\s+)(public\.)?analitico_recebimentos(\s+)(?!where\M|group\M|order\M|limit\M|on\M|left\M|right\M|inner\M|join\M)([a-z_][a-z0-9_]*)',
      '\1\2' || v_marca || '\4\5', 'gi');

    if v_novo = v_def then
      raise exception 'contribuicao_59: nenhuma leitura de analitico_recebimentos achada em %', v_fn.proname;
    end if;

    v_novo := replace(v_novo, v_marca, v_filtro);
    execute v_novo;
    raise notice 'contribuicao_59: % passa a ler o analitico sem a contribuicao', v_fn.proname;
  end loop;
end
$patch$;

-- ============================================================================
-- 8. Os meses que já estão no 59 recebem a contribuição agora
-- ============================================================================
--
-- As funções acima só gravam na PRÓXIMA entrada do 59. Aqui a contribuição
-- entra nos setores que já são do 59 (têm linha `relatorio_59` no mês), com o
-- lote vigente do mês — o mesmo recorte de `_sync_alvo`. Setor ainda no 58 fica
-- de fora, como na sincronização.
--
-- Dentro da mesma transação: ou as funções novas E os meses preenchidos, ou
-- nada. Rodar de novo não duplica — o `on conflict` só reescreve a linha.

insert into public.analitico_recebimentos (
  empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
  forma_pagamento, forma_detalhe, valor_recebido, total_ho,
  data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
  procedencia, contribuicao_de_setor_id, lote_id, importado_por_id, importado_em)
select c.empresa_id, null, c.operador_usuario, c.codigo, c.nome_cliente,
       c.forma_pagamento, c.forma_detalhe, c.valor_recebido, 0,
       c.data_pagamento, c.mes, c.setor_id, 'Integral', c.instituicao,
       'contribuicao_59', c.origem_setor_id, l.id, auth.uid(), now()
  from public.vw_mestre_contribuicao_analitico c
  join public.mestre_lotes l
    on l.empresa_id = c.empresa_id and l.mes = c.mes and l.estado = 'vigente'
 where exists (
   select 1 from public.analitico_recebimentos a
    where a.empresa_id = c.empresa_id and a.mes_referencia = c.mes
      and a.setor_id = c.setor_id and a.procedencia = 'relatorio_59')
on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
do update set
  setor_id                 = excluded.setor_id,
  valor_recebido           = excluded.valor_recebido,
  nome_cliente             = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
  forma_detalhe            = excluded.forma_detalhe,
  instituicao              = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
  procedencia              = 'contribuicao_59',
  contribuicao_de_setor_id = excluded.contribuicao_de_setor_id,
  lote_id                  = excluded.lote_id;

commit;

-- ============================================================================
-- Conferência (só leitura, depois do commit)
-- ============================================================================
--
-- Contribuição por setor e mês. Setembro/2026 medido antes: Play 1 R$ 242.958,60,
-- Play 2 R$ 62.069,03, Play 3 R$ 60.638,05, Play 4 R$ 12.791,78,
-- Play 5 R$ 5.761,66, Jornada R$ 52.639,82 (se o 59 não mudou desde então).
--
--   select to_char(a.mes_referencia, 'YYYY-MM') as mes, s.nome as setor,
--          count(*) as linhas, round(sum(a.valor_recebido), 2) as contribuicao
--     from public.analitico_recebimentos a
--     left join public.setores s on s.id = a.setor_id
--    where a.procedencia = 'contribuicao_59'
--    group by 1, 2 order by 1, 2;
