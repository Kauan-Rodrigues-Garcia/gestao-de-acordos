-- ═══════════════════════════════════════════════════════════════════════════
-- A trava de arquivo curto: dizer o que vai ser APAGADO, antes de confirmar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fase 0.2 do `docs/PLANO-SINCRONIZACAO-59.md`.
--
-- ## O incidente
--
-- Na BookPlay o 58 é o retrato completo do mês: ao importar, o que não está no
-- arquivo é removido do setor (`sincronizarAusentesDoSetor`). A regra faz
-- sentido — é ela que tira do sistema a linha que o ERP cancelou.
--
-- Em 13/09/2026 alguém importou um export salvo da manhã do dia 11. O sistema
-- fez exatamente o que devia: apagou 413 linhas e R$ 175.768,38 do Receptivo,
-- incluindo os dias 12, 13 e 14 inteiros. O único registro foi uma frase no
-- log, DEPOIS do fato:
--
--     «1 linha nova, 2103 ja existentes, 1 reconciliada, 413 ausentes removidas»
--
-- Ninguém leu. E não havia como ler antes.
--
-- ## O que esta função faz
--
-- Responde, no preview: quantas linhas e quanto valor sairiam se este arquivo
-- fosse confirmado, e de quais dias. A conta é a MESMA que a importação faz
-- depois — chave `operador_usuario::codigo` dentro do mês.
--
-- ## Por que a conta é aqui, e não por diferença de datas na tela
--
-- Porque o número não é «tudo o que está depois da última data do arquivo». Um
-- NR pago nos dias 3 e 13 sobrevive: a chave dele está no arquivo pelo dia 3.
--
-- Simulando o incidente sobre os dados de hoje, um arquivo parando em 11/09
-- tiraria 124 linhas e R$ 44.868,19 — não as 413. A diferença é exatamente o
-- efeito de a chave não olhar a data, e uma previsão feita na tela por
-- comparação de datas mostraria um número que não é o que vai acontecer.
--
-- ## Não bloqueia
--
-- Avisa. Reduzir o mês é legítimo — o ERP cancela acordo e o relatório encolhe
-- de verdade. Uma trava dura faria a pessoa procurar como desligá-la; o que
-- faltava era a informação na hora da decisão.
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '60s';

create or replace function public.fn_analitico_remocao_prevista(
  p_empresa_id uuid,
  p_setor_id   uuid,
  p_mes        date,
  p_chaves     text[]
)
returns table(dia date, linhas bigint, valor numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- A MESMA chave do `chaveGrupoAnalitico` do importador:
  -- operador_usuario::codigo. O mes ja esta no recorte, entao nao entra aqui.
  -- Se as duas divergirem, o aviso passa a mentir — e mentir para menos, que e
  -- o pior lado: diz que nada sai, e sai.
  select a.data_pagamento,
         count(*)::bigint,
         round(sum(a.valor_recebido), 2)
    from analitico_recebimentos a
   where a.empresa_id = p_empresa_id
     and a.setor_id = p_setor_id
     and a.mes_referencia = p_mes
     and not (a.operador_usuario || '::' || a.codigo = any(p_chaves))
     and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
   group by a.data_pagamento
   order by a.data_pagamento;
$function$;

comment on function public.fn_analitico_remocao_prevista(uuid, uuid, date, text[]) is
  'O que a sincronizacao mensal do 58 REMOVERIA se este arquivo fosse '
  'confirmado, por dia. Chamada no preview, antes de confirmar. Em 13/09/2026 '
  'um export antigo do Receptivo apagou 413 linhas e R$ 175.768,38 sem aviso, e '
  'o unico registro foi uma frase no log depois do fato. So leitura.';

grant execute on function public.fn_analitico_remocao_prevista(uuid, uuid, date, text[]) to authenticated;

commit;
