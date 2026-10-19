-- ============================================================================
-- O 59 recalcula o resumo mensal do Analítico ao sincronizar
-- ============================================================================
--
-- ## O defeito (BookPlay, medido em 19/10/2026)
--
-- O card «Total recebido» da aba Analítico, sem filtro de setor ou equipe, e o
-- card de % H.O. leem `analitico_resumo_mensal` — um retrato do mês gravado
-- por `fn_analitico_atualizar_resumo`. Quem chamava essa função era só o
-- navegador: ao importar o 58 (`useAnaliticoImport`) e ao limpar o mês.
--
-- A sincronização do 59 (`trg_mestre_aplicar_no_analitico` →
-- `fn_mestre_sincronizar_analitico`) reescreve o analítico de hora em hora e
-- NUNCA recalculava o retrato. Numa hora sem importação de 58, o card ficava
-- no número da última importação, e pulava para o do 59 só quando alguém
-- importasse de novo. Em 19/10 às 17:10 o card estava certo por coincidência:
-- a Paola importou o 58 do Play 1 às 17:09, três minutos depois do 59.
--
-- ## O conserto
--
-- Depois de sincronizar ao menos um setor, o gatilho chama
-- `fn_analitico_atualizar_resumo` para a empresa e o mês do lote. A conta é a
-- MESMA da importação do 58 — nenhuma regra nova. Quem promove o lote é o
-- `robo_importar`, que tem perfil na empresa, então a trava de acesso da
-- função passa; num contexto sem acesso ela volta sem gravar, como antes.
--
-- Um erro aqui não derruba a promoção do lote: fica no mesmo bloco de
-- «conveniência» que já protege o registro no log.
--
-- O resto da função é IDÊNTICO ao corpo vivo lido do banco em 19/10/2026
-- (`pg_get_functiondef`). Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.fn_mestre_sincronizar_analitico()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mes  text;
  v_r    jsonb;
  v_lote uuid := coalesce(nullif(current_setting('mestre.lote_importacao', true), '')::uuid, new.id);
begin
  if new.estado is distinct from 'vigente'
     or coalesce(old.estado, '') = 'vigente' then
    return new;
  end if;

  v_mes := to_char(new.mes, 'YYYY-MM');
  v_r   := public.fn_mestre_sincronizar_analitico_aplicar(new.empresa_id, new.mes, v_lote);

  if coalesce((v_r ->> 'setores_sincronizados')::integer, 0) = 0 then
    return new;
  end if;

  -- O retrato do mês que alimenta o card sem filtro do Analítico (20261019220000).
  begin
    perform public.fn_analitico_atualizar_resumo(new.empresa_id, v_mes);
  exception when others then
    null;  -- o card fica com o retrato anterior; a promocao segue.
  end;

  begin
    insert into logs_sistema (
      acao, categoria, severidade, descricao, empresa_id, tabela,
      alvo_tipo, alvo_rotulo, origem, detalhes)
    values ('importacao_concluida', 'importacao',
      case when (v_r ->> 'setores_pulados')::integer > 0 then 'aviso' else 'info' end,
      format('O relatório 59 sincronizou %s setor(es) em %s — %s nova(s), %s alterada(s), '
             || '%s removida(s), %s sem mudança; de R$ %s para R$ %s%s',
             v_r ->> 'setores_sincronizados', v_mes,
             v_r ->> 'inseridas', v_r ->> 'alteradas', v_r ->> 'removidas', v_r ->> 'intactas',
             translate(to_char((v_r ->> 'valor_antes')::numeric, 'FM999,999,990.00'), ',.', '.,'),
             translate(to_char((v_r ->> 'valor_depois')::numeric, 'FM999,999,990.00'), ',.', '.,'),
             case when (v_r ->> 'setores_pulados')::integer > 0
                  then format('; %s setor(es) sem linha neste lote, mantidos como estavam',
                              v_r ->> 'setores_pulados')
                  else '' end),
      new.empresa_id, 'analitico_recebimentos', 'importacao_analitico',
      format('Mês %s', v_mes), 'trigger',
      v_r || jsonb_build_object('mes', v_mes, 'lote_59', v_lote,
        -- Chave antiga, com o significado antigo: linhas do 59 no lugar.
        'gravadas', (v_r ->> 'projetadas')::integer));
  exception when others then
    null;  -- trilha e conveniencia; nada aqui derruba a promocao.
  end;

  return new;
end;
$function$;

commit;

-- ============================================================================
-- Conferência (só leitura), depois da próxima promoção do 59
-- ============================================================================
--
--   select r.atualizado_em, l.promovido_em
--     from analitico_resumo_mensal r
--     join mestre_lotes l on l.empresa_id = r.empresa_id
--                        and l.mes = (r.mes || '-01')::date and l.estado = 'vigente'
--    where r.mes = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
--   -- esperado: atualizado_em logo depois de promovido_em
