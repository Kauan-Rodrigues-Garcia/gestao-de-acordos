-- ═══════════════════════════════════════════════════════════════════════════
-- O colchão para de apagar dinheiro de setembro em diante
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O sintoma
--
-- Três abas do Painel Diretoria mostravam três totais para o MESMO relatório 59
-- de 2026-09:
--
--   Visão Geral ............... 4.201.060,89
--   Relatório 59 .............. 4.063.669,94
--   Setores e Equipes ......... (Receptivo) 1.005.078,06, contra 972.512,94
--                               na aba ao lado
--
-- ## A causa, e é uma só
--
-- `fn_mestre_conta_na_meta(colchao, dt_pgto)` rodava assim:
--
--     select not coalesce(p_colchao, false)
--         or (p_dt >= date '2026-08-01' and p_dt <= date '2026-08-14');
--
-- A janela é FIXA em agosto. Ela foi escrita para a exceção daquele mês e nunca
-- mais foi olhada. Em setembro nenhuma data cabe nela, então a função responde
-- `false` para TODA linha de colchão — e quem a consulta simplesmente perde esse
-- dinheiro.
--
-- Quem consulta: `fn_mestre_resumo_grupos`, `fn_mestre_comparar_setores` e
-- `fn_mestre_diferenca_detalhe`. Quem NÃO consulta:
-- `fn_mestre_diretoria_visao_geral` e `fn_mestre_diretoria_linhas` (a base de
-- Setores e Equipes).
--
-- Daí as três respostas. A conta fecha ao centavo:
--
--     setembro, colchão ......................  137.390,95
--     4.201.060,89 − 137.390,95 .............. 4.063.669,94
--
--     Receptivo próprio bruto ................ 1.031.080,25
--       − colchão do Receptivo (58.567,31) ...   972.512,94  ← Relatório 59
--       − equipes em «somente geral» (26.002,19) 1.005.078,06 ← Setores e Equipes
--
-- Não havia `integral` entrando no Receptivo em setembro, e não há equipe
-- duplicada em `mestre_equipes` — as duas outras suspeitas foram medidas e
-- descartadas. É o colchão, e só ele.
--
-- ## A decisão
--
-- O colchão era uma exceção de UM mês. De 2026-09 em diante ele conta como
-- qualquer outra linha do relatório: o que está no arquivo é o que vale.
--
-- Agosto fica como está. Mudar o passado reescreveria um mês já fechado e já
-- conferido — e a exceção existiu de verdade lá.
--
-- ## Por que uma função de seis linhas, e não mexer nas que a chamam
--
-- Porque a regra é uma e as consumidoras são três. Corrigir cada uma daria três
-- oportunidades de divergir, que é exatamente a doença que esta migration está
-- curando.
--
-- E porque `fn_mestre_resumo_grupos` e `fn_mestre_comparar_setores` **derivaram
-- do repositório**: as versões que rodam no banco não são as dos arquivos daqui
-- (a primeira chama `fn_mestre_conta_na_meta`, e o arquivo de 20260904500000
-- não chama). Reescrevê-las nesta migration apagaria correção aplicada pelo
-- dashboard que ninguém trouxe para cá ainda. Reconciliar essas duas é tarefa
-- própria, e precisa começar por ler o que roda hoje.
--
-- ## O efeito, número a número
--
--   Relatório 59, total de setembro ..... 4.063.669,94 → 4.201.060,89
--   Relatório 59, Receptivo próprio .....   972.512,94 → 1.031.080,25
--   Comparação, `mestre_comparavel` ..... sobe pelo colchão de cada setor
--   Diferença detalhada, parcela
--     «colchão fora da meta» ............ vai a zero em setembro
--
-- Nenhuma linha de `mestre_recebimentos` é tocada. A migration troca uma função
-- de leitura, e nada mais: o mesmo arquivo importado passa a ser lido inteiro.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '60s';

create or replace function public.fn_mestre_conta_na_meta(p_colchao boolean, p_dt date)
returns boolean
language sql
immutable
parallel safe
set search_path to ''
as $function$
  -- Não é colchão: conta, e sempre contou.
  select not coalesce(p_colchao, false)
      -- De setembro/2026 em diante o colchão deixou de ser exceção.
      or p_dt >= date '2026-09-01'
      -- A exceção de agosto/2026, preservada como foi aplicada na época.
      or (p_dt >= date '2026-08-01' and p_dt <= date '2026-08-14');
$function$;

comment on function public.fn_mestre_conta_na_meta(boolean, date) is
  'Esta linha do 59 entra na conta? Colchao foi excecao de agosto/2026 (janela '
  '01 a 14). De 2026-09 em diante conta como qualquer outra linha. Consultada '
  'por fn_mestre_resumo_grupos, fn_mestre_comparar_setores e '
  'fn_mestre_diferenca_detalhe — uma regra, tres leitoras.';

-- ── Prova ──────────────────────────────────────────────────────────────────
--
-- Casos de mesa, sem tocar em dado real. Se algum falhar, a transação volta e
-- a função antiga continua no ar.

do $prova$
begin
  -- Linha comum: conta, em qualquer data.
  if not public.fn_mestre_conta_na_meta(false, date '2026-09-20') then
    raise exception 'Linha sem colchao deixou de contar.';
  end if;
  if not public.fn_mestre_conta_na_meta(false, date '2026-08-30') then
    raise exception 'Linha sem colchao de agosto deixou de contar.';
  end if;

  -- Agosto: a janela continua valendo, dos dois lados.
  if not public.fn_mestre_conta_na_meta(true, date '2026-08-10') then
    raise exception 'Colchao dentro da janela de agosto deveria contar.';
  end if;
  if public.fn_mestre_conta_na_meta(true, date '2026-08-20') then
    raise exception 'Colchao fora da janela de agosto NAO deveria contar.';
  end if;

  -- Setembro em diante: conta.
  if not public.fn_mestre_conta_na_meta(true, date '2026-09-01') then
    raise exception 'Colchao de 01/09 deveria contar.';
  end if;
  if not public.fn_mestre_conta_na_meta(true, date '2026-12-31') then
    raise exception 'Colchao de dezembro deveria contar.';
  end if;

  -- Antes de agosto: segue fora, como sempre esteve. Mexer aqui reescreveria
  -- meses fechados que ninguem pediu para mexer.
  if public.fn_mestre_conta_na_meta(true, date '2026-07-15') then
    raise exception 'Colchao de julho nao deveria passar a contar.';
  end if;

  -- `null` no colchao vale «nao e colchao», como antes.
  if not public.fn_mestre_conta_na_meta(null, date '2026-09-05') then
    raise exception 'Colchao nulo deveria contar.';
  end if;
end
$prova$;

commit;
