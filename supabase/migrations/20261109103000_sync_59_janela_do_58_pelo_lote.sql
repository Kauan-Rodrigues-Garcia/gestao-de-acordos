-- ============================================================================
-- Sincronização do 59: o 58 fica a partir de onde o LOTE parou, não de ontem
-- ============================================================================
--
-- ## O defeito (09/11/2026)
--
-- O robô do 59 parou em 06/11 às 13h30. Duas travas supunham o 59 sempre em
-- dia e, juntas, deixaram dias inteiros sem fonte nenhuma:
--
--   app ....... o 58 de um mês do 59 só gravava hoje e ontem;
--   banco ..... esta sincronização apaga o 58 que o 59 não tem, menos o de
--               hoje e ontem (20260928200000).
--
-- No Play 3: relatório R$ 170.967,22, app R$ 128.678,23 — a falta, R$ 42.288,99,
-- é exatamente a tarde de 06/11 (R$ 18.970,64) e o sábado 07/11 (R$ 23.318,35).
-- A regra da casa é «o 58 entra tudo, o 59 sincroniza».
--
-- ## O conserto
--
-- A guarda «o 58 de hoje e de ontem que o 59 ainda não trouxe fica» passa a
-- valer a partir do ÚLTIMO DIA QUE ESTE LOTE TRAZ, quando ele está atrás de
-- ontem:
--
--   v_desde_58 = least(ontem, último data_pagamento da projeção do lote)
--
-- 59 em dia: o último dia é hoje, a janela continua ontem — nada muda.
-- 59 atrasado (lote velho entrando, ERP travado): o 58 dos dias que o lote
-- não cobre não é apagado. Quando um 59 completo chegar, ele manda, como antes.
-- O app usa a mesma janela (`inicioDaJanelaDo58`, analitico.service.ts).
--
-- ## Por que remendo, e não a função inteira
--
-- O banco já recebeu alterações pelo SQL Editor que não estão nos arquivos
-- (CLAUDE.md, «Migrations»). Reescrever a função a partir de 20261028150000
-- poderia desfazer uma delas sem ninguém ver. Então este arquivo lê a
-- definição VIVA, troca só a guarda de data e confere:
--
--   - a guarda `a.data_pagamento >= v_hoje - 1` aparece exatamente uma vez;
--   - `with saiu as (` (o passo 1, onde a janela é calculada) aparece uma vez;
--   - a declaração de `v_hoje` está lá.
--
-- Qualquer surpresa aborta tudo, sem mudar nada. Já aplicada, avisa e sai —
-- reexecutável.
--
-- `fn_mestre_aplicar_no_analitico_interno` (a troca de fonte de um setor para
-- o 59, coisa de uma vez) fica como está.
--
-- Escrita: só a definição da função. Nenhuma linha de dado.
-- ============================================================================

begin;

set local lock_timeout = '15s';

do $remendo$
declare
  v_def     text;
  v_novo    text;
  v_guarda  constant text := 'a.data_pagamento >= v_hoje - 1';
  v_passo1  constant text := 'with saiu as (';
  v_decl    constant text := 'v_hoje          date := (now() at time zone ''America/Sao_Paulo'')::date;';
  v_vezes   integer;
begin
  v_def := pg_get_functiondef(
    'public.fn_mestre_sincronizar_analitico_aplicar(uuid, date, uuid)'::regprocedure);

  if position('v_desde_58' in v_def) > 0 then
    raise notice '20261109120000 já aplicada: a função já tem v_desde_58. Nada a fazer.';
    return;
  end if;

  v_vezes := (length(v_def) - length(replace(v_def, v_guarda, ''))) / length(v_guarda);
  if v_vezes <> 1 then
    raise exception 'Esperava a guarda «%» 1 vez na função, achei %. Nada foi alterado.', v_guarda, v_vezes;
  end if;

  v_vezes := (length(v_def) - length(replace(v_def, v_passo1, ''))) / length(v_passo1);
  if v_vezes <> 1 then
    raise exception 'Esperava «%» 1 vez na função, achei %. Nada foi alterado.', v_passo1, v_vezes;
  end if;

  if position(v_decl in v_def) = 0 then
    raise exception 'A declaração de v_hoje não está como esperado. Nada foi alterado.';
  end if;

  v_novo := replace(v_def, v_decl,
    v_decl || E'\n'
    || E'  -- Janela do 58 (20261109120000): de ontem, ou do último dia que este\n'
    || E'  -- lote traz, se ele estiver atrás. Calculada antes do passo 1.\n'
    || E'  v_desde_58      date;');

  v_novo := replace(v_novo, v_passo1,
       E'-- A janela do 58 (20261109120000). O 59 atrasado não apaga o 58 dos\n'
    || E'  -- dias que ele não cobre: com o robô parado em 06/11/2026, «ontem»\n'
    || E'  -- deixou a tarde de 06/11 e o dia 07/11 sem fonte nenhuma.\n'
    || E'  v_desde_58 := least(v_hoje - 1,\n'
    || E'                      coalesce(greatest((select max(n.data_pagamento) from _sync_59 n),\n'
    || E'                                        (select max(c.data_pagamento) from _sync_contrib c)),\n'
    || E'                               v_hoje - 1));\n\n'
    || E'  ' || v_passo1);

  v_novo := replace(v_novo, v_guarda, 'a.data_pagamento >= v_desde_58');

  execute v_novo;

  -- Conferência: a definição gravada é a remendada.
  v_def := pg_get_functiondef(
    'public.fn_mestre_sincronizar_analitico_aplicar(uuid, date, uuid)'::regprocedure);
  if position('a.data_pagamento >= v_desde_58' in v_def) = 0
     or position(v_guarda in v_def) > 0 then
    raise exception 'O remendo não ficou como esperado. Transação desfeita.';
  end if;

  raise notice '20261109120000 aplicada: a janela do 58 agora segue o lote.';
end;
$remendo$;

comment on function public.fn_mestre_sincronizar_analitico_aplicar(uuid, date, uuid) is
  'Sincroniza o analitico pelo lote vigente do 59. O 58/994 que o 59 ainda nao trouxe '
  '(mesmo NR e data) fica a partir de least(ontem, ultimo dia do lote) — 20261109120000; '
  'antes era so hoje e ontem (20260928200000). Dono do 994: 20261028150000.';

commit;
