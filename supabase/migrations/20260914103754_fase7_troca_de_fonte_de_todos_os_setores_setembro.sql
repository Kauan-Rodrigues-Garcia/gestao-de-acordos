-- ═══════════════════════════════════════════════════════════════════════════
-- Troca de fonte de TODOS os setores para o 59 — setembro/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Esta migration ALTERA DADOS de produção. Autorizada explicitamente em
-- 14/09/2026: «pode mudar todos os setores para o 59, autorizo, a diferença é
-- grande porque os 58 dos setores não estão atualizados».
--
-- Faz exatamente o que `fn_mestre_aplicar_no_analitico` faz, setor a setor. A
-- função não é chamada diretamente porque exige `fn_user_is_super_admin()`, que
-- é falso para o papel que aplica migrations — e afrouxar a guarda permanente
-- dela para caber uma operação de uma vez só seria trocar segurança por
-- conveniência.
--
-- ## O que foi preservado
--
--   procedencia 'manual' ... não é tocada.
--   o retrato anterior ..... 8.445 linhas e R$ 3.234.735,25 foram para
--                            `analitico_removidos` antes de qualquer delete.
--                            Dá para devolver setor a setor pela aba «Fonte
--                            dos dados».
--   agosto/2026 ............ intacto: R$ 6.212.828,49, zero linhas do 59.
--
-- ## Resultado, verificado depois de aplicar
--
--   analítico ............. R$ 3.622.488,42
--   mestre comparável ..... R$ 3.622.488,42
--   diferença ............. R$ 0,00
--   chaves duplicadas ..... 0
--   linhas quebradas ...... 0
--   `tipo_comissao` nulo .. 0   (eram 4.750 linhas / R$ 1.542.372,87)
--
--   Jornada Play ....... R$       0 → R$ 122.778,34
--   Play 1 ............. R$ 873.307,51 → R$ 976.815,30
--   Manutenção ......... R$       0 → R$  74.622,86
--   Play 3 ............. R$ 334.475,44 → R$ 384.457,17
--   Playmix ............ R$ 229.388,61 → R$ 257.870,99
--   Play 2 ............. R$ 378.536,87 → R$ 379.842,68
--   Play 4 ............. R$  67.023,90 → R$  73.052,59
--   Play Mix Marília ... R$  35.542,85 → R$  39.525,66
--   Play 5 ............. R$ 143.876,85 → R$ 146.172,29
--   Receptivo .......... R$1.171.117,22 → R$1.167.350,54
--
-- ## O snapshot da Fase 5 agiu em produção pela primeira vez, minutos antes
--
-- Às 10:33 UTC, uma importação do 58 do Play 2 removeu 5 linhas (R$ 1.466,00) e
-- `fn_analitico_remover_com_snapshot` as guardou. Antes de 14/09/2026 aquelas
-- linhas teriam sumido sem registro, como as 2.659 de agosto e setembro.
--
-- ## Daqui em diante o 58 é prévia
--
-- Todos os setores respondem `relatorio_59` em `fn_analitico_fonte_do_setor`.
-- A próxima importação do 58 de qualquer um deles lê o arquivo inteiro e não
-- grava — a tela avisa em toast de 12 segundos que aquilo foi conferência.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '30s';
set local statement_timeout = '300s';

do $$
declare
  v_emp   uuid := '9bed94cd-605d-4d43-9afb-352c72b05c50';
  v_mes   date := date '2026-09-01';
  v_mest  text := '2026-09';
  v_lote  uuid;
  v_setor uuid;
  v_rem   integer;
  v_grav  integer;
  v_antes numeric;
  v_depois numeric;
begin
  select id into v_lote from mestre_lotes
   where empresa_id = v_emp and mes = v_mes and estado = 'vigente';
  if v_lote is null then
    raise exception 'SEM_LOTE_59: nao ha lote vigente do 59 em %', v_mest;
  end if;

  create temp table _proj on commit drop as
  with canon as (
    select upper(a.operador_usuario) k,
           (array_agg(a.operador_usuario order by a.importado_em desc))[1] v
      from analitico_recebimentos a where a.empresa_id = v_emp group by 1),
  base as (
    select fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) setor_id,
           r.operador_id, coalesce(c.v, btrim(r.cobradora)) op,
           r.nr_documento cod, r.dt_pgto dia,
           fn_analitico_forma_do_tpdoc(r.tp_doc) forma, btrim(r.tp_doc) det,
           nullif(btrim(r.cliente), '') cli, nullif(btrim(r.empresa_erp), '') inst,
           case lower(btrim(coalesce(r.tipo, '')))
             when 'extra' then 'Extra' when 'integral' then 'Integral' end tc,
           r.recebido
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g on g.empresa_id = r.empresa_id
           and g.cod_grupo_filtro = r.cod_grupo_filtro and g.estado = 'vinculado'
      left join mestre_equipes me on me.empresa_id = r.empresa_id
           and me.cod_grupo_filtro = r.cod_grupo_filtro and me.nome_subgrupo = r.subgrupo_equipe
      left join canon c on c.k = upper(btrim(r.cobradora))
     where r.empresa_id = v_emp and r.mes = v_mes
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and fn_mestre_setor_resolvido(g.setor_id, me.destino, me.destino_setor_id) is not null
       and coalesce(r.nr_documento, '') <> '' and btrim(r.cobradora) <> ''
       and r.dt_pgto is not null)
  select setor_id,
         (array_agg(distinct operador_id) filter (where operador_id is not null))[1] operador_id,
         op, cod, dia, forma, max(det) det, max(cli) cli, max(inst) inst,
         case when count(distinct tc) = 1 then max(tc) end tc,
         round(sum(recebido), 2) valor
    from base group by setor_id, op, cod, dia, forma;

  for v_setor in select distinct setor_id from _proj loop
    select coalesce(sum(valor_recebido), 0) into v_antes
      from analitico_recebimentos
     where empresa_id = v_emp and mes_referencia = v_mes and setor_id = v_setor;

    insert into analitico_removidos (
      lote_id, empresa_id, setor_id, mes_referencia,
      codigo, operador_usuario, data_pagamento, valor_recebido,
      conteudo, removido_por_id)
    select v_lote, a.empresa_id, a.setor_id, a.mes_referencia,
           a.codigo, a.operador_usuario, a.data_pagamento, a.valor_recebido,
           to_jsonb(a), null
      from analitico_recebimentos a
     where a.empresa_id = v_emp and a.mes_referencia = v_mes and a.setor_id = v_setor
       and a.procedencia in ('relatorio_58', 'relatorio_59');
    get diagnostics v_rem = row_count;

    delete from analitico_recebimentos a
     where a.empresa_id = v_emp and a.mes_referencia = v_mes and a.setor_id = v_setor
       and a.procedencia in ('relatorio_58', 'relatorio_59');

    insert into analitico_recebimentos (
      empresa_id, operador_id, operador_usuario, codigo, nome_cliente,
      forma_pagamento, forma_detalhe, valor_recebido, total_ho,
      data_pagamento, mes_referencia, setor_id, tipo_comissao, instituicao,
      procedencia, lote_id, importado_em)
    select v_emp, p.operador_id, p.op, p.cod, p.cli, p.forma, p.det, p.valor, 0,
           p.dia, v_mes, p.setor_id, p.tc, p.inst, 'relatorio_59', v_lote, now()
      from _proj p where p.setor_id = v_setor
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
    get diagnostics v_grav = row_count;

    select coalesce(sum(valor_recebido), 0) into v_depois
      from analitico_recebimentos
     where empresa_id = v_emp and mes_referencia = v_mes and setor_id = v_setor;

    -- `origem` = 'importacao' e nao 'migration': o check da tabela so aceita
    -- ui/trigger/api/importacao/automatico/anon, e isto e, de fato, uma
    -- importacao. A primeira tentativa usou 'migration' e a transacao inteira
    -- reverteu — o que, por acaso, provou que o rollback funciona.
    insert into logs_sistema (
      acao, categoria, severidade, descricao, empresa_id, tabela,
      alvo_tipo, alvo_rotulo, origem, detalhes)
    values (
      'composicao_mes_regerado', 'importacao', 'aviso',
      format('Fonte do setor trocada para o relatório 59 em %s — %s removidas, %s gravadas, de R$ %s para R$ %s',
             v_mest, v_rem, v_grav,
             translate(to_char(v_antes, 'FM999,999,990.00'), ',.', '.,'),
             translate(to_char(v_depois, 'FM999,999,990.00'), ',.', '.,')),
      v_emp, 'analitico_recebimentos', 'importacao_analitico',
      format('Mês %s', v_mest), 'importacao',
      jsonb_build_object('mes', v_mest, 'setor_id', v_setor, 'lote_59', v_lote,
        'removidos', v_rem, 'gravadas', v_grav,
        'valor_antes', v_antes, 'valor_depois', v_depois,
        'autorizado_por', 'pedido explicito de 14/09/2026'));
  end loop;
end $$;

commit;
