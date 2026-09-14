-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 2: de onde veio cada linha do analítico
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fase 2 do `docs/PLANO-SINCRONIZACAO-59.md`, regra 4.
--
-- **Esta é a primeira migration desta sequência que muda a ESTRUTURA de uma
-- tabela com dados reais.** Todas as anteriores criaram função de leitura. Ela
-- foi mostrada em SQL exato e aprovada antes de rodar.
--
-- ## O que ela resolve
--
-- Hoje toda linha de `analitico_recebimentos` veio do relatório 58, e o código
-- pode assumir isso. Quando o 59 virar a fonte oficial (Fase 7) e quando houver
-- correção manual (Fase 4), a tabela passa a ter linhas de três origens — e uma
-- delas é perigosa de confundir.
--
-- O perigo tem nome e já aconteceu: `sincronizarAusentesDoSetor` trata o
-- arquivo do 58 como retrato completo do mês e **apaga** o que não está nele.
-- Uma importação de um 58 antigo já apagou 413 linhas e R$ 175.768,38 em
-- silêncio. Se o 59 escrever linhas na mesma tabela, a próxima importação do 58
-- as levaria junto — e dessa vez o dado não estaria em lugar nenhum para
-- reimportar.
--
-- `procedencia` é a trava: o que o 58 não trouxe, o 58 não apaga.
--
-- ## Custo
--
-- `add column` com default constante é operação de metadado no Postgres 11+:
-- nenhuma das 48.550 linhas é reescrita. O `check` entra como `not valid` e é
-- validado em seguida, o que troca ACCESS EXCLUSIVE por SHARE UPDATE EXCLUSIVE
-- durante a verificação.
--
-- Depois de aplicar: 48.550 linhas, todas `relatorio_58`, nenhuma confirmada,
-- constraint validada.
--
-- ## `confirmado_em` nasceu de um desenho que a medição desfez
--
-- A ideia era carimbar aqui quando o 59 confirmasse a linha, por trigger na
-- promoção do lote. Medido logo depois:
--
--   carimbar (semi join, dentro da promoção) ...... 289 ms
--   derivar  (anti join, `fn_analitico_pendencias`) . 92 ms
--
-- A derivação é mais barata e mais correta — estorno no ERP faz a pendência
-- voltar, e o carimbo diria «confirmado» para sempre. Por isso `procedencia`
-- está em uso (é a trava acima) e `confirmado_em` está, por ora, sem uso.
-- Ver `20260914010454`.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

alter table public.analitico_recebimentos
  add column procedencia   text not null default 'relatorio_58',
  add column confirmado_em timestamptz;

alter table public.analitico_recebimentos
  add constraint analitico_recebimentos_procedencia_valida
  check (procedencia in ('relatorio_58','relatorio_59','manual')) not valid;

alter table public.analitico_recebimentos
  validate constraint analitico_recebimentos_procedencia_valida;

comment on column public.analitico_recebimentos.procedencia is
  'De onde a linha veio: relatorio_58 (importacao do analitico), relatorio_59 '
  '(o mestre escreveu) ou manual (correcao de super_admin). Toda linha que ja '
  'existia nasceu relatorio_58, que e a verdade — foi assim que entraram.';

-- Este comentario foi corrigido logo apos a migration: ele dizia que a regra 4
-- saia daqui, e a medicao feita em seguida mostrou que nao. Ver o bloco acima.
comment on column public.analitico_recebimentos.confirmado_em is
  'SEM USO hoje. Nasceu para carimbar quando o 59 confirmasse a linha, mas a '
  'pendencia acabou derivada em fn_analitico_pendencias — mais barata (92 ms '
  'contra 289) e mais correta, porque estorno no ERP faz a pendencia voltar e o '
  'carimbo diria confirmado para sempre. Mantida para o historico da Fase 5; se '
  'a Fase 5 nao usar, deve ser removida em vez de ficar de enfeite.';

commit;
