-- ═══════════════════════════════════════════════════════════════════════════
-- A previsão de remoção acompanha a chave da LINHA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fase 0.3 do `docs/PLANO-SINCRONIZACAO-59.md`, lado do banco. O lado do código
-- é `idsAusentesDoRelatorioMensal`, em `analitico.service.ts`.
--
-- ## A assimetria, que era o defeito
--
-- A importação do 58 tinha DUAS chaves, e elas não eram a mesma coisa:
--
--   inserção ... `idx_analitico_unicidade` (empresa, codigo, data, forma, operador)
--   remoção .... `chaveGrupoAnalitico`     (operador, codigo, mês)
--
-- Uma linha cujo DIA sumiu do arquivo sobrevivia — bastava outra linha do mesmo
-- NR no mesmo mês estar presente — e a linha nova, com a data nova, entrava do
-- lado dela. Duas linhas, o mesmo dinheiro.
--
-- Foi assim que R$ 698,43 ficaram duplicados no Receptivo em agosto/2026, nos
-- NRs 12984182, 13000560 e 13012299. Em todos, o ERP moveu uma parcela de dia
-- entre dois exports.
--
-- ## O raio da mudança é pequeno, e foi medido
--
-- Em agosto e setembro juntos, de 24.567 grupos (operador, NR, mês), apenas
-- **17** têm linhas em dias diferentes. Três deles são exatamente os duplicados
-- acima; os outros 14 são cliente que pagou em dois dias, e nesses os dois dias
-- estão no arquivo — nada a mais é removido.
--
-- Num arquivo completo a mudança não remove nada de novo: toda linha do banco
-- veio daquele arquivo, com aquela data.
--
-- ## Por que esta função tem de mudar junto
--
-- Ela é o aviso da Fase 0.2 («esta importação vai apagar N linhas»). Se ficasse
-- na chave de grupo, passaria a prever MENOS do que vai sair — que é o pior lado
-- para errar num aviso: a pessoa confirma porque a tela disse que nada saía.
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
  -- A MESMA chave do `chaveLinhaAnalitico` do importador, que por sua vez e a
  -- mesma de `idx_analitico_unicidade`:
  --
  --     operador_usuario :: codigo :: data_pagamento :: forma_pagamento
  --
  -- O mes ja esta no recorte, entao nao entra aqui.
  --
  -- ⚠️ As tres tem de andar juntas. Enquanto a remocao era por GRUPO
  -- (operador::codigo) e a insercao por LINHA, uma linha cujo dia sumiu do
  -- arquivo sobrevivia e a nova entrava do lado — R$ 698,43 contados duas vezes
  -- no Receptivo em agosto/2026. Se esta funcao ficar na chave antiga, o aviso
  -- passa a prever MENOS do que vai sair, que e o pior lado para errar.
  select a.data_pagamento,
         count(*)::bigint,
         round(sum(a.valor_recebido), 2)
    from analitico_recebimentos a
   where a.empresa_id = p_empresa_id
     and a.setor_id = p_setor_id
     and a.mes_referencia = p_mes
     and not (a.operador_usuario || '::' || a.codigo || '::'
              || a.data_pagamento::text || '::' || a.forma_pagamento = any(p_chaves))
     and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
   group by a.data_pagamento
   order by a.data_pagamento;
$function$;

comment on function public.fn_analitico_remocao_prevista(uuid, uuid, date, text[]) is
  'O que a sincronizacao mensal do 58 REMOVERIA se este arquivo fosse '
  'confirmado, por dia. Chave por LINHA (operador::codigo::data::forma), a mesma '
  'de idx_analitico_unicidade e do chaveLinhaAnalitico. Chamada no preview, '
  'antes de confirmar. So leitura.';

commit;
