-- ============================================================================
-- Sincronização do 59: o 58 de hoje que o 59 ainda não trouxe NÃO some
-- ============================================================================
--
-- ## O defeito (Plantão Elite, 28/09/2026)
--
-- «O Matheus já recebeu quase 5 mil hoje, e no Plantão Elite ele está com
-- 200 reais.» Medido:
--
--   10:41  o líder importa o 58 do Receptivo: Matheus com R$ 4.925,66 pagos
--          hoje (entre eles o NR 13061983, R$ 4.455,00 no cartão, Extra).
--   11:07  o robô do 59 sincroniza. O 59 ainda não traz esses pagamentos, e
--          `fn_mestre_sincronizar_analitico_aplicar` apaga toda linha que o 59
--          não tem — 58 incluído. O Matheus volta para R$ 234,01.
--
-- Não é o 59 errado: é o 59 ATRASADO. Tudo o que a sincronização tirou do 58
-- entre 22 e 26/09 está hoje no 59, na mesma data. Só o de hoje (36 linhas,
-- R$ 19.896,59) ainda não apareceu. O Plantão, que é hora a hora, mostra o
-- buraco; o analítico dos operadores também.
--
-- ## O conserto
--
-- 1. Linha do 58 com pagamento de HOJE ou ONTEM que o 59 ainda não conhece
--    (mesmo NR, mesma data) FICA. Quando o 59 trouxer o NR naquela data, a
--    linha dele manda — mesmo que seja de outro operador. Passados dois dias,
--    o 58 que o 59 nunca confirmou sai, como antes.
-- 2. A linha do 58 confirmada pelo 59 guarda a HORA em que chegou
--    (`importado_em`). Antes ela ganhava a hora da sincronização e pulava de
--    faixa no Plantão.
--
-- A mesma guarda vale para `fn_mestre_aplicar_no_analitico_interno` (a troca
-- de fonte do setor para o 59).
--
-- Só troca as duas funções. Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_mestre_sincronizar_analitico_aplicar(p_empresa_id uuid, p_mes date, p_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_alvos         integer;
  v_pulados       integer;
  v_antes         numeric;
  v_depois        numeric;
  v_projetadas    integer;
  v_contrib_proj  integer;
  v_removidas     integer := 0;
  v_alteradas     integer := 0;
  v_alteradas_c   integer := 0;
  v_inseridas     integer := 0;
  v_inseridas_c   integer := 0;
  -- «Hoje» em São Paulo: o 58 de hoje e de ontem pode estar à frente do 59.
  v_hoje          date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- O alvo: setor que JA e do 59 E que a projecao deste lote tem. Setor que o
  -- lote nao trouxe fica de fora e conserva o dado anterior.
  drop table if exists _sync_alvo;
  create temp table _sync_alvo on commit drop as
    select distinct a.setor_id
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id is not null
       and a.procedencia = 'relatorio_59';

  -- A projecao, uma vez so. A view agrupa o analitico inteiro.
  drop table if exists _sync_59;
  create temp table _sync_59 on commit drop as
    select v.operador_id, v.operador_usuario, v.codigo, v.nome_cliente,
           v.forma_pagamento, v.forma_detalhe, v.valor_recebido,
           v.data_pagamento, v.setor_id, v.tipo_comissao, v.instituicao
      from vw_mestre_projecao_analitico v
     where v.empresa_id = p_empresa_id and v.mes = p_mes
       and v.setor_id in (select setor_id from _sync_alvo);

  delete from _sync_alvo z
   where not exists (select 1 from _sync_59 n where n.setor_id = z.setor_id);

  select count(*) into v_alvos from _sync_alvo;
  if v_alvos = 0 then
    return jsonb_build_object('setores_sincronizados', 0);
  end if;

  drop table if exists _sync_contrib;
  create temp table _sync_contrib on commit drop as
    select c.operador_usuario, c.codigo, c.nome_cliente, c.forma_pagamento,
           c.forma_detalhe, c.valor_recebido, c.data_pagamento, c.setor_id,
           c.instituicao, c.origem_setor_id
      from vw_mestre_contribuicao_analitico c
     where c.empresa_id = p_empresa_id and c.mes = p_mes
       and c.setor_id in (select setor_id from _sync_alvo);

  analyze _sync_59;
  analyze _sync_contrib;
  select count(*) into v_projetadas   from _sync_59;
  select count(*) into v_contrib_proj from _sync_contrib;

  select count(distinct a.setor_id) into v_pulados
    from analitico_recebimentos a
   where a.empresa_id = p_empresa_id and a.mes_referencia = p_mes
     and a.setor_id is not null and a.procedencia = 'relatorio_59'
     and not exists (select 1 from _sync_alvo z where z.setor_id = a.setor_id);

  select coalesce(sum(valor_recebido), 0) into v_antes
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = p_mes
     and setor_id in (select setor_id from _sync_alvo);

  -- A hora em que cada pagamento do 58 CHEGOU. Quando o 59 alcança a linha,
  -- ela passa a ser do 59 mas não pode mudar de hora: o Plantão Elite monta o
  -- quadro hora a hora pela chegada (ver 20260928200000).
  drop table if exists _sync_chegada;
  create temp table _sync_chegada on commit drop as
    select a.codigo, a.data_pagamento, a.operador_id, min(a.importado_em) as chegou
      from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia = 'relatorio_58'
     group by a.codigo, a.data_pagamento, a.operador_id;

  -- ── 1. O que saiu do 59: guardar e apagar ────────────────────────────────
  with saiu as (
    delete from analitico_recebimentos a
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59')
       and not exists (
         select 1 from _sync_59 n
          where n.codigo = a.codigo and n.data_pagamento = a.data_pagamento
            and n.forma_pagamento = a.forma_pagamento
            and n.operador_usuario = a.operador_usuario)
       and not exists (
         select 1 from _sync_contrib n
          where n.codigo = a.codigo and n.data_pagamento = a.data_pagamento
            and n.forma_pagamento = a.forma_pagamento
            and n.operador_usuario = a.operador_usuario)
       -- O 58 de hoje e de ontem que o 59 AINDA NÃO TROUXE fica. O 59 chega
       -- horas depois do pagamento; apagar antes era sumir com o recebimento
       -- do dia (28/09/2026: 36 linhas, R$ 19.896,59 — o Plantão Elite do
       -- Matheus caiu de R$ 4.925,66 para R$ 234,01). Quando o 59 trouxer o
       -- mesmo NR na mesma data, a linha dele manda; passados dois dias, o 58
       -- que o 59 nunca confirmou sai como antes.
       and not (a.procedencia = 'relatorio_58'
                and a.data_pagamento >= v_hoje - 1
                and not exists (select 1 from _sync_59 n
                                 where n.codigo = a.codigo and n.data_pagamento = a.data_pagamento)
                and not exists (select 1 from _sync_contrib n
                                 where n.codigo = a.codigo and n.data_pagamento = a.data_pagamento))
    returning a.*
  )
  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, s.empresa_id, s.setor_id, s.mes_referencia,
         s.codigo, s.operador_usuario, s.data_pagamento, s.valor_recebido,
         to_jsonb(s), auth.uid()
    from saiu s;
  get diagnostics v_removidas = row_count;

  -- ── 2. Linha do setor que mudou: guardar a versão antiga e atualizar ──────
  -- Recebe exatamente o que a reinserção gravaria. Tabulação e `visto` ficam,
  -- salvo troca de operador.
  drop table if exists _sync_mudou;
  create temp table _sync_mudou on commit drop as
    select a.id, n.*
      from analitico_recebimentos a
      join _sync_59 n
        on n.codigo = a.codigo and n.data_pagamento = a.data_pagamento
       and n.forma_pagamento = a.forma_pagamento
       and n.operador_usuario = a.operador_usuario
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59')
       and (a.setor_id, a.operador_id, a.valor_recebido, a.nome_cliente,
            a.forma_detalhe, a.tipo_comissao, a.instituicao, a.procedencia,
            a.contribuicao_de_setor_id, a.pagamentos_detalhados)
           is distinct from
           (n.setor_id, n.operador_id, n.valor_recebido, n.nome_cliente,
            n.forma_detalhe, n.tipo_comissao, n.instituicao, 'relatorio_59'::text,
            null::uuid, null::jsonb);

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
    join _sync_mudou m on m.id = a.id;

  update analitico_recebimentos a
     set setor_id                 = m.setor_id,
         operador_id              = m.operador_id,
         valor_recebido           = m.valor_recebido,
         total_ho                 = 0,
         nome_cliente             = m.nome_cliente,
         forma_detalhe            = m.forma_detalhe,
         tipo_comissao            = m.tipo_comissao,
         instituicao              = m.instituicao,
         procedencia              = 'relatorio_59',
         contribuicao_de_setor_id = null,
         pagamentos_detalhados    = null,
         status_tabulacao         = case when a.operador_id is distinct from m.operador_id
                                         then 'nao_tabulado' else a.status_tabulacao end,
         acordo_id                = case when a.operador_id is distinct from m.operador_id
                                         then null else a.acordo_id end,
         lote_id                  = p_lote_id,
         importado_por_id         = auth.uid(),
         -- A linha do 58 que o 59 confirmou guarda a hora em que chegou.
         importado_em             = case
                                      when a.procedencia = 'relatorio_58'
                                       and a.operador_id is not distinct from m.operador_id
                                      then a.importado_em
                                      else now()
                                    end
    from _sync_mudou m
   where a.id = m.id;
  get diagnostics v_alteradas = row_count;

  -- ── 3. Linha nova do 59 ───────────────────────────────────────────────────
  -- O conflito aqui é com linha FORA do setor-alvo (outro setor, outra
  -- procedência): mesmo `do update` de antes, só quando algo muda.
  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, lote_id, importado_por_id, importado_em)
  select p_empresa_id, n.operador_id, n.operador_usuario, n.codigo, n.nome_cliente,
         n.forma_pagamento, n.forma_detalhe, n.valor_recebido, 0,
         n.data_pagamento, p_mes, n.setor_id, n.tipo_comissao, n.instituicao,
         -- Mesmo pagamento que o 58 já tinha trazido (outra forma ou outro
         -- usuário na chave): a hora continua a da chegada pelo 58.
         'relatorio_59', p_lote_id, auth.uid(), coalesce(ch.chegou, now())
    from _sync_59 n
    left join _sync_chegada ch
      on ch.codigo = n.codigo and ch.data_pagamento = n.data_pagamento
     and ch.operador_id is not distinct from n.operador_id
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
    lote_id        = excluded.lote_id
  where (analitico_recebimentos.setor_id, analitico_recebimentos.operador_id,
         analitico_recebimentos.valor_recebido, analitico_recebimentos.nome_cliente,
         analitico_recebimentos.forma_detalhe, analitico_recebimentos.tipo_comissao,
         analitico_recebimentos.instituicao, analitico_recebimentos.procedencia)
        is distinct from
        (excluded.setor_id, excluded.operador_id, excluded.valor_recebido,
         coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
         excluded.forma_detalhe,
         coalesce(excluded.tipo_comissao, analitico_recebimentos.tipo_comissao),
         coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
         'relatorio_59'::text);
  get diagnostics v_inseridas = row_count;

  -- ── 4. A contribuição que outro setor cobrou para este (14/09/2026) ──────
  drop table if exists _sync_mudou_c;
  create temp table _sync_mudou_c on commit drop as
    select a.id, c.*
      from analitico_recebimentos a
      join _sync_contrib c
        on c.codigo = a.codigo and c.data_pagamento = a.data_pagamento
       and c.forma_pagamento = a.forma_pagamento
       and c.operador_usuario = a.operador_usuario
     where a.empresa_id = p_empresa_id
       and a.mes_referencia = p_mes
       and a.setor_id in (select setor_id from _sync_alvo)
       and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59')
       and (a.setor_id, a.operador_id, a.valor_recebido, a.nome_cliente,
            a.forma_detalhe, a.tipo_comissao, a.instituicao, a.procedencia,
            a.contribuicao_de_setor_id, a.pagamentos_detalhados)
           is distinct from
           (c.setor_id, null::uuid, c.valor_recebido, c.nome_cliente,
            c.forma_detalhe, 'Integral'::text, c.instituicao, 'contribuicao_59'::text,
            c.origem_setor_id, null::jsonb);

  insert into analitico_removidos (
    lote_id, empresa_id, setor_id, mes_referencia,
    codigo, operador_usuario, data_pagamento, valor_recebido,
    conteudo, removido_por_id)
  select p_lote_id, a.empresa_id, a.setor_id, a.mes_referencia,
         a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
         to_jsonb(a), auth.uid()
    from analitico_recebimentos a
    join _sync_mudou_c m on m.id = a.id;

  update analitico_recebimentos a
     set setor_id                 = m.setor_id,
         operador_id              = null,
         valor_recebido           = m.valor_recebido,
         total_ho                 = 0,
         nome_cliente             = m.nome_cliente,
         forma_detalhe            = m.forma_detalhe,
         tipo_comissao            = 'Integral',
         instituicao              = m.instituicao,
         procedencia              = 'contribuicao_59',
         contribuicao_de_setor_id = m.origem_setor_id,
         pagamentos_detalhados    = null,
         status_tabulacao         = case when a.operador_id is not null
                                         then 'nao_tabulado' else a.status_tabulacao end,
         acordo_id                = case when a.operador_id is not null
                                         then null else a.acordo_id end,
         lote_id                  = p_lote_id,
         importado_por_id         = auth.uid(),
         importado_em             = now()
    from _sync_mudou_c m
   where a.id = m.id;
  get diagnostics v_alteradas_c = row_count;

  insert into analitico_recebimentos (
    empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
    forma_pagamento, forma_detalhe, valor_recebido, total_ho,
    data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
    procedencia, contribuicao_de_setor_id, lote_id, importado_por_id, importado_em)
  select p_empresa_id, null, c.operador_usuario, c.codigo, c.nome_cliente,
         c.forma_pagamento, c.forma_detalhe, c.valor_recebido, 0,
         c.data_pagamento, p_mes, c.setor_id, 'Integral', c.instituicao,
         'contribuicao_59', c.origem_setor_id, p_lote_id, auth.uid(), now()
    from _sync_contrib c
  on conflict (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)
  do update set
    setor_id                 = excluded.setor_id,
    valor_recebido           = excluded.valor_recebido,
    nome_cliente             = coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
    forma_detalhe            = excluded.forma_detalhe,
    instituicao              = coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
    procedencia              = 'contribuicao_59',
    contribuicao_de_setor_id = excluded.contribuicao_de_setor_id,
    lote_id                  = excluded.lote_id
  where (analitico_recebimentos.setor_id, analitico_recebimentos.valor_recebido,
         analitico_recebimentos.nome_cliente, analitico_recebimentos.forma_detalhe,
         analitico_recebimentos.instituicao, analitico_recebimentos.procedencia,
         analitico_recebimentos.contribuicao_de_setor_id)
        is distinct from
        (excluded.setor_id, excluded.valor_recebido,
         coalesce(excluded.nome_cliente, analitico_recebimentos.nome_cliente),
         excluded.forma_detalhe,
         coalesce(excluded.instituicao, analitico_recebimentos.instituicao),
         'contribuicao_59'::text, excluded.contribuicao_de_setor_id);
  get diagnostics v_inseridas_c = row_count;

  select coalesce(sum(valor_recebido), 0) into v_depois
    from analitico_recebimentos
   where empresa_id = p_empresa_id and mes_referencia = p_mes
     and setor_id in (select setor_id from _sync_alvo);

  return jsonb_build_object(
    'setores_sincronizados', v_alvos,
    'setores_pulados',       v_pulados,
    'projetadas',            v_projetadas,
    'contribuicoes',         v_contrib_proj,
    'removidas',             v_removidas,
    'alteradas',             v_alteradas + v_alteradas_c,
    'inseridas',             v_inseridas + v_inseridas_c,
    'intactas',              greatest(v_projetadas + v_contrib_proj
                                      - v_alteradas - v_alteradas_c
                                      - v_inseridas - v_inseridas_c, 0),
    'valor_antes',           v_antes,
    'valor_depois',          v_depois);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mestre_aplicar_no_analitico_interno(p_empresa_id uuid, p_mes text, p_setor_id uuid, p_lote_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mes_data      date := (p_mes || '-01')::date;
  v_valor_antes   numeric;
  v_removidas     integer := 0;
  v_projetadas    integer;
  v_gravadas      integer;
  v_contribuicoes integer := 0;
  v_valor_depois  numeric;
  v_hoje          date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select count(*) into v_projetadas
    from vw_mestre_projecao_analitico v
   where v.empresa_id = p_empresa_id and v.mes = v_mes_data and v.setor_id = p_setor_id;

  if v_projetadas = 0 then
    raise exception
      'PROJECAO_VAZIA: o 59 nao projeta nenhuma linha para este setor em %. '
      'Confira o vinculo da carteira antes de trocar a fonte.', p_mes;
  end if;

  -- O que o 59 conhece de hoje e de ontem, por NR e data — a mesma guarda da
  -- sincronização horária (20260928200000): o 58 recente que o 59 ainda não
  -- trouxe não é apagado.
  drop table if exists _aplicar_59_recente;
  create temp table _aplicar_59_recente on commit drop as
    select v.codigo, v.data_pagamento
      from vw_mestre_projecao_analitico v
     where v.empresa_id = p_empresa_id and v.mes = v_mes_data
       and v.data_pagamento >= v_hoje - 1
    union
    select c.codigo, c.data_pagamento
      from vw_mestre_contribuicao_analitico c
     where c.empresa_id = p_empresa_id and c.mes = v_mes_data
       and c.data_pagamento >= v_hoje - 1;

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
     and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59')
     and not (a.procedencia = 'relatorio_58'
              and a.data_pagamento >= v_hoje - 1
              and not exists (select 1 from _aplicar_59_recente r
                               where r.codigo = a.codigo and r.data_pagamento = a.data_pagamento));
  get diagnostics v_removidas = row_count;

  delete from analitico_recebimentos a
   where a.empresa_id = p_empresa_id and a.mes_referencia = v_mes_data
     and a.setor_id = p_setor_id
     and a.procedencia in ('relatorio_58', 'relatorio_59', 'contribuicao_59')
     and not (a.procedencia = 'relatorio_58'
              and a.data_pagamento >= v_hoje - 1
              and not exists (select 1 from _aplicar_59_recente r
                               where r.codigo = a.codigo and r.data_pagamento = a.data_pagamento));

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

commit;
