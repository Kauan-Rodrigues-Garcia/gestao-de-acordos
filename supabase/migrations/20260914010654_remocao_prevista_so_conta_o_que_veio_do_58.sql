-- ═══════════════════════════════════════════════════════════════════════════
-- A prévia de remoção passa a respeitar a procedência
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `idsAusentesDoRelatorioMensal` deixou de apagar linha que não veio do 58
-- (migration 20260914010002). Esta função prevê o que a importação vai apagar,
-- e as duas contas têm de ser a MESMA — uma prévia que anuncia remoção que não
-- acontece ensina a pessoa a ignorar o aviso, e o aviso existe por causa de um
-- incidente de 413 linhas e R$ 175.768,38.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_analitico_remocao_prevista(
  p_empresa_id uuid, p_setor_id uuid, p_mes date, p_chaves text[]
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
     -- O 58 so apaga o que o 58 trouxe. Linha escrita pelo 59 ou corrigida a
     -- mao nao sai por ausencia no arquivo do 58 — ele nunca soube dela.
     and a.procedencia = 'relatorio_58'
     and not (a.operador_usuario || '::' || a.codigo || '::'
              || a.data_pagamento::text || '::' || a.forma_pagamento = any(p_chaves))
     and (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
   group by a.data_pagamento
   order by a.data_pagamento;
$function$;

comment on function public.fn_analitico_remocao_prevista(uuid, uuid, date, text[]) is
  'Quanto sairia do setor se este arquivo do 58 fosse confirmado, por dia. '
  'Conta igual a de idsAusentesDoRelatorioMensal, procedencia inclusive: o 58 '
  'so apaga o que o 58 trouxe. So leitura.';

commit;
