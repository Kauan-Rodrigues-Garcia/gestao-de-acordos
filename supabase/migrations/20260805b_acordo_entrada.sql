-- ═══════════════════════════════════════════════════════════════════════════
-- 20260805b — Entrada no acordo (BookPlay)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido de 05/08/2026: ao salvar um acordo parcelado, poder marcar que o
-- PRIMEIRO pagamento é uma entrada. Com a marca ligada, as parcelas deixam de
-- ter todas o mesmo valor: o operador digita o valor da entrada e o valor das
-- demais.
--
-- CONTAGEM: a entrada é a parcela 1 de N. "4 parcelas com entrada" = 4
-- pagamentos (1 entrada + 3 iguais) e o contador segue 1/4 … 4/4, como em
-- qualquer outro acordo. Nada muda no reagendamento nem na exibição.
--
-- COMO FICA GRAVADO, por parcela do grupo:
--   valor_entrada = valor da entrada   (NULL = acordo sem entrada, o normal)
--   valor_total   = entrada + demais × (N−1)
--   valor         = o desta parcela — a entrada na 1ª, o valor das demais nas outras
--
-- O valor das demais NÃO tem coluna própria de propósito: é derivado por
-- (valor_total − valor_entrada) ÷ (N−1) em `valorDemaisParcelas` (src/lib/money.ts).
-- Guardar os três números deixaria o total divergir dos valores no dia em que
-- alguém editasse só um deles.
--
-- `valor_total` já existia para os acordos parcelados da PaguePlay
-- (20260515100000) e é reaproveitado aqui em vez de ganhar um gêmeo.

ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS valor_entrada NUMERIC(12,2) DEFAULT NULL;

COMMENT ON COLUMN public.acordos.valor_entrada IS
  'BookPlay: valor da entrada quando o 1º pagamento foi negociado como entrada. NULL no acordo comum. O valor das demais parcelas sai de (valor_total - valor_entrada) / (parcelas - 1).';

-- Entrada zero ou negativa não existe — seria um acordo comum gravado errado,
-- e faria `valorDemaisParcelas` devolver um valor inflado para as outras
-- parcelas. Todas as linhas de hoje têm NULL, então a checagem entra válida.
ALTER TABLE public.acordos
  DROP CONSTRAINT IF EXISTS acordos_valor_entrada_positivo;

ALTER TABLE public.acordos
  ADD CONSTRAINT acordos_valor_entrada_positivo
  CHECK (valor_entrada IS NULL OR valor_entrada > 0);

-- Índice parcial: os acordos com entrada são a minoria, e é só sobre eles que
-- as telas de detalhe/reagendamento perguntam.
CREATE INDEX IF NOT EXISTS idx_acordos_com_entrada
  ON public.acordos (acordo_grupo_id)
  WHERE valor_entrada IS NOT NULL;

-- ── Diagnóstico ─────────────────────────────────────────────────────────────
-- Deve voltar 0 linhas numa base recém-migrada. Serve para conferir depois,
-- quando os primeiros acordos com entrada tiverem sido tabulados: o valor das
-- demais parcelas tem de bater com o que está gravado em cada linha.
SELECT
  a.nr_cliente,
  a.parcelas,
  a.valor_entrada,
  a.valor_total,
  ROUND((a.valor_total - a.valor_entrada) / NULLIF(a.parcelas - 1, 0), 2) AS demais_derivado
FROM public.acordos a
WHERE a.valor_entrada IS NOT NULL
  AND a.numero_parcela = 1
ORDER BY a.criado_em DESC
LIMIT 20;
