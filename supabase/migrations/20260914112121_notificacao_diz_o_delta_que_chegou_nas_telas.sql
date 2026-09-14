-- ═══════════════════════════════════════════════════════════════════════════
-- A notificação dizia o delta do LOTE, não o que chegou nas telas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Estado final de duas migrations aplicadas em sequência (112037 e 112121). A
-- primeira corrigiu o número; a segunda parou de avisar quando ele é zero.
--
-- ## O que a primeira importação real mostrou
--
-- Em 14/09/2026 11:17, a promoção de um lote novo gerou:
--
--   notificação para 301 pessoas .... «R$ 3.385,58 a mais»
--   o que a sincronização moveu ..... R$ 1.780,63
--
-- Os dois números estão certos e são coisas diferentes:
--
--   R$ 3.385,58 = total do lote novo menos o do anterior. Inclui colchão,
--                 Retenção e a segunda perna do rateio — tudo que o 59 tem e
--                 que NÃO conta para setor.
--   R$ 1.780,63 = o que de fato entrou em `analitico_recebimentos`, e portanto
--                 o que o dashboard, o painel e o analítico mostram.
--
-- A mensagem afirmava «os números do dashboard já refletem a mudança» logo
-- depois de anunciar o primeiro número. Quem conferisse acharia R$ 1.604,95 de
-- diferença e concluiria que a sincronização falhou — quando nada falhou.
--
-- ## De onde vem o número certo
--
-- O gatilho de sincronização roda ANTES deste (`trg_mestre_aplicar...` ordena
-- antes de `trg_mestre_notificar...`, a < n) e na MESMA transação, deixando na
-- trilha o delta que chegou. A notificação lê dali.
--
-- ## E quando ele é zero, ninguém é avisado
--
-- A guarda antiga só pulava quando o total do lote era idêntico. Ficava de fora
-- um caso real: lote com total diferente cuja diferença inteira é
-- colchão/Retenção/rateio — nenhuma tela muda, e a mensagem saía «R$ 0,00 a
-- mais nos setores», que é verdade e é inútil.
--
-- Avisar 301 pessoas de uma mudança de zero é o começo de todo mundo desligar a
-- notificação — e aí o aviso que importa some junto.
--
-- ## Quando nenhum setor lê o 59 ainda
--
-- A mensagem cai para o delta do lote, dizendo com todas as letras que é «no
-- total da empresa». Prometer «o dashboard já reflete» seria falso ali: se
-- nenhum setor é do 59, o dashboard não mudou nada.
--
-- ## Verificado contra produção (em bloco revertido)
--
--   repromover o mesmo lote → 0 notificações, dados intactos
--   (9.647 linhas / R$ 3.624.269,05)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

create or replace function public.fn_mestre_notificar_atualizacao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anterior numeric;
  v_delta    numeric;
  v_sync     numeric;
  v_setores  integer;
  v_mes      text;
  v_msg      text;
begin
  if new.estado is distinct from 'vigente'
     or coalesce(old.estado, '') = 'vigente' then
    return new;
  end if;

  v_mes := to_char(new.mes, 'YYYY-MM');

  select ml.total_recebido into v_anterior
    from mestre_lotes ml
   where ml.substituido_por = new.id
   limit 1;

  v_delta := coalesce(new.total_recebido, 0) - coalesce(v_anterior, 0);

  -- Mesmo arquivo de novo: nada mudou em lugar nenhum.
  if v_anterior is not null and v_delta = 0 then
    return new;
  end if;

  -- O que a sincronizacao acabou de mover, deixado na trilha pelo gatilho que
  -- roda antes deste, na MESMA transacao. E este o numero que as telas mostram.
  select (lg.detalhes->>'valor_depois')::numeric - (lg.detalhes->>'valor_antes')::numeric,
         (lg.detalhes->>'setores_sincronizados')::integer
    into v_sync, v_setores
    from logs_sistema lg
   where lg.origem = 'trigger'
     and lg.detalhes->>'lote_59' = new.id::text
     and lg.detalhes ? 'setores_sincronizados'
   order by lg.criado_em desc
   limit 1;

  -- A sincronizacao rodou e nao moveu nada: a diferenca do lote era toda
  -- colchao, Retencao ou segunda perna de rateio. Nenhuma tela mudou, entao
  -- nao ha o que avisar.
  if v_setores is not null and v_setores > 0 and coalesce(v_sync, 0) = 0 then
    return new;
  end if;

  -- `,` e `.` sao literais no to_char; `G` e `D` e que seguem o locale, e o
  -- deste banco daria 36,849.34 em vez de 36.849,34.
  v_msg := case
    when v_setores is not null and v_setores > 0 then
      format('O relatório 59 de %s foi atualizado: R$ %s %s nos setores. '
             || 'Os números do dashboard, do painel e do analítico já refletem a mudança.',
             v_mes,
             translate(to_char(abs(v_sync), 'FM999,999,990.00'), ',.', '.,'),
             case when v_sync >= 0 then 'a mais' else 'a menos' end)
    when v_anterior is null then
      format('O relatório 59 de %s entrou no sistema.', v_mes)
    else
      -- Nenhum setor le o 59 ainda: o dashboard nao mudou, e prometer que
      -- mudou seria falso. Diz o que e — total da empresa.
      format('O relatório 59 de %s foi atualizado: R$ %s %s no total da empresa.',
             v_mes,
             translate(to_char(abs(v_delta), 'FM999,999,990.00'), ',.', '.,'),
             case when v_delta >= 0 then 'a mais' else 'a menos' end)
  end;

  insert into notificacoes (usuario_id, titulo, mensagem, empresa_id, rota)
  select p.id, 'Dados analíticos atualizados', v_msg, new.empresa_id, '/'
    from perfis p
   where p.empresa_id = new.empresa_id
     and coalesce(p.ativo, true);

  return new;
end;
$function$;

comment on function public.fn_mestre_notificar_atualizacao() is
  'Avisa toda a empresa quando um lote do 59 passa a vigente, dizendo o delta '
  'QUE CHEGOU NAS TELAS — nao o do lote (a diferenca foi R$ 3.385,58 contra '
  'R$ 1.780,63 na primeira importacao real). Nao avisa quando o arquivo e '
  'identico, nem quando a diferenca foi toda em colchao/Retencao/rateio e as '
  'telas nao mudaram.';

commit;
