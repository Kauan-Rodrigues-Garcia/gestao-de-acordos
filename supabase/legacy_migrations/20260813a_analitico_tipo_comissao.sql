-- ============================================================================
-- 20260813a — "Tipo comissão" do relatório passa a ser importado
-- ============================================================================
--
-- ## O problema
--
-- O relatório analítico do ERP traz uma coluna "Tipo comissão" com dois
-- valores: EXTRA (recebimento de NR vinculado a outro operador) e INTEGRAL
-- (recebimento do próprio operador). É a resposta pronta para a separação
-- Direto × Extra que o painel de metas mostra.
--
-- Essa coluna nunca foi lida. Nem `analiticoParser` nem
-- `bookplayRecebimentoParser` a tinham em `COL_ALIASES`, e a tabela não tinha
-- onde guardá-la — o dado chegava em toda importação e era descartado.
--
-- Sem ela, a única pista de vínculo era `acordo_id` → `acordos.tipo_vinculo`,
-- que só existe DEPOIS de alguém tabular. No setor Receptivo isso significava
-- zero: das 269 linhas do mês da equipe Matheus, NENHUMA tinha acordo
-- tabulado, então direto e extra apareciam como R$ 0,00 apesar de o relatório
-- dizer exatamente quais eram quais.
--
-- ## O que muda
--
-- Coluna nova, texto cru do relatório. Guardar o rótulo original em vez de um
-- booleano é de propósito: se o ERP passar a mandar um terceiro valor, ele
-- aparece aqui em vez de ser silenciosamente dobrado em "direto". A
-- normalização mora na aplicação (`ehComissaoExtra`, em analiticoComum.ts).
--
-- ## Retroativo?
--
-- NÃO. As 23 mil linhas já importadas ficam com NULL — o relatório de origem
-- não está guardado, então não há de onde tirar. Para o mês corrente passar a
-- separar, o relatório precisa ser reimportado depois desta migration. Linha
-- com NULL continua caindo em "sem vínculo definido" na tela, que é honesto:
-- não sabemos, e não vamos chutar.
-- ============================================================================

ALTER TABLE public.analitico_recebimentos
  ADD COLUMN IF NOT EXISTS tipo_comissao TEXT;

COMMENT ON COLUMN public.analitico_recebimentos.tipo_comissao IS
  'Coluna "Tipo comissão" do relatório do ERP, texto cru (ex.: Extra, Integral). '
  'NULL = importado antes da 20260813a, ou relatório sem a coluna. '
  'A leitura normalizada é ehComissaoExtra() em src/services/analitico/analiticoComum.ts.';

-- O painel de metas filtra por mês + escopo e agrupa por este campo. Índice
-- parcial: a esmagadora maioria das linhas antigas é NULL e não interessa a
-- nenhuma consulta.
CREATE INDEX IF NOT EXISTS idx_analitico_tipo_comissao
  ON public.analitico_recebimentos (empresa_id, mes_referencia, tipo_comissao)
  WHERE tipo_comissao IS NOT NULL;

-- ============================================================================
-- Conferência (rodar depois de reimportar o relatório do mês):
--
--   SELECT tipo_comissao, count(*), sum(valor_recebido)
--     FROM public.analitico_recebimentos
--    WHERE mes_referencia = date_trunc('month', current_date)::date
--    GROUP BY tipo_comissao
--    ORDER BY 2 DESC;
--
-- Esperado: linhas em 'Extra' e 'Integral'. Se vier tudo NULL, o relatório
-- reimportado não tinha a coluna ou o cabeçalho mudou de nome — conferir os
-- aliases em COL_ALIASES.
-- ============================================================================
