-- ═══════════════════════════════════════════════════════════════════════════
-- O Colchão conta no TOTAL DA EMPRESA e não conta para SETOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## A regra, decidida pela diretoria em 13/09/2026
--
-- Colchão é a parcela da 2ª em diante de acordo de Pix automático ou cartão
-- recorrente. Ele:
--
--   • ENTRA no total da empresa (`fn_mestre_diretoria_visao_geral`);
--   • NÃO conta para setor, equipe ou operador.
--
-- É exatamente o tratamento que a equipe de Retenção já tem há meses
-- (`mestre_equipes.destino = 'somente_geral'`). O Colchão passa a ser a segunda
-- coisa com esse comportamento — e agora há um nome para ele.
--
-- Única exceção, preservada: o pago entre 01 e 14/08/2026. Agosto foi fechado e
-- conferido com essa janela valendo; mexer nela reescreveria meta já apurada.
--
-- ## O caminho torto até aqui, para ninguém refazer
--
-- Em 10/09 a 20260910215830 fez o colchão CONTAR de setembro em diante. O motivo
-- era real — três abas do painel mostravam três totais para o mesmo arquivo —,
-- mas a solução tratou o sintoma: em vez de fazer todo mundo aplicar a regra,
-- mudou a regra para que a divergência sumisse.
--
-- Em 13/09, ao alinhar o 58 com o 59, o custo apareceu: o comparável inflava em
-- R$ 163.876,90 em setembro, porque o parser do 58 continuava descartando o
-- colchão e o 59 passara a somá-lo. Foram três tentativas no mesmo dia —
-- `fn_mestre_esta_no_58` (172128/172251), depois abolir a separação
-- (173442/173539) — até a diretoria dizer o que de fato queria, que é isto aqui.
--
-- A lição: quando duas pontas discordam, a pergunta é «qual delas está errada»,
-- não «como faço a diferença sumir».
--
-- ## O que esta migration faz
--
-- Devolve `fn_mestre_conta_na_meta` à janela fixa de agosto. As migrations
-- irmãs (`…201024`, `…201057`, `…201148`) fazem as três funções do Painel
-- Diretoria que liam a tabela direto passarem a consultá-la — que era a
-- correção que faltava desde 10/09.
--
-- `fn_mestre_diretoria_visao_geral` fica INTOCADA, de propósito: ela é o total
-- da empresa, e o colchão conta lá.
--
-- ## Efeito medido, setembro/2026
--
--   total da empresa ........ não muda
--   soma dos setores ........ cai R$ 163.876,90
--     Receptivo 78.207,16 · Manutenção 34.322,98 · Play 1 24.410,11 ·
--     Play 2 11.000,93 · Jornada Play 6.995,21 · Play 3 4.653,64 ·
--     Playmix 2.866,54 · Play 5 857,33 · Play Mix Marília 300,00 · Play 4 263,00
--
-- E a comparação com o 58, de 01 a 10/09, fica:
--
--   Play 4 ............. 0,00        Play 5 ....... −218,40 (NR 12580468)
--   Play Mix Marília ... 0,00        Receptivo .. −1.252,08 (NR 12657532)
--
-- Os dois residuais são divergência de DATA entre os relatórios, já mapeada.
--
-- ## O espelho no parser
--
-- `colchaoContaNaMeta`, em `src/services/analitico/analiticoComum.ts`, diz a
-- mesma coisa. As duas têm de ser mexidas juntas — foi justamente elas se
-- separarem que produziu o erro de setembro.
--
-- ## Escrita: nenhuma
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
  -- Nao e colchao: conta, e sempre contou.
  select not coalesce(p_colchao, false)
      -- A excecao de agosto/2026, preservada como foi aplicada na epoca.
      or (p_dt >= date '2026-08-01' and p_dt <= date '2026-08-14');
$function$;

comment on function public.fn_mestre_conta_na_meta(boolean, date) is
  'Esta linha do 59 conta para o SETOR? Colchao NAO conta — ele entra no total '
  'da empresa e fica de fora de setor, equipe e operador, igual a Retencao '
  '(destino somente_geral). Unica excecao: 01 a 14/08/2026. Espelha o '
  'colchaoContaNaMeta do parser do 58; as duas tem de dizer a mesma coisa.';

-- ── Prova ──────────────────────────────────────────────────────────────────
--
-- As datas que decidem. Se alguma falhar, a transação volta inteira.

do $prova$
begin
  if not fn_mestre_conta_na_meta(false, date '2026-09-20') then
    raise exception 'Linha sem colchao conta sempre.';
  end if;
  if not fn_mestre_conta_na_meta(true, date '2026-08-10') then
    raise exception 'Colchao de 10/08/2026 conta (excecao daquele mes).';
  end if;
  if fn_mestre_conta_na_meta(true, date '2026-08-20') then
    raise exception 'Colchao de 20/08/2026 NAO conta para setor.';
  end if;
  if fn_mestre_conta_na_meta(true, date '2026-09-05') then
    raise exception 'Colchao de setembro NAO conta para setor.';
  end if;
  if fn_mestre_conta_na_meta(true, date '2026-12-31') then
    raise exception 'Colchao de dezembro NAO conta para setor.';
  end if;
  if fn_mestre_conta_na_meta(true, date '2026-07-15') then
    raise exception 'Colchao de julho nunca contou.';
  end if;
  if not fn_mestre_conta_na_meta(null, date '2026-09-05') then
    raise exception 'Colchao nulo vale como nao-colchao.';
  end if;
end
$prova$;

commit;
