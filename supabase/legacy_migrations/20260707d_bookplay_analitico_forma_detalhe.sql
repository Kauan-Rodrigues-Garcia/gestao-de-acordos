-- =====================================================================
-- BookPlay: rótulo detalhado da forma de pagamento no Analítico.
--
-- A coluna `forma_pagamento` tem CHECK ('boleto_pix','cartao') e serve para
-- agrupamento/consolidação. Para a BookPlay precisamos exibir o tipo real
-- (Boleto, Pix, Pix Automático, Cartão Recorrente, Cartão de Crédito), então
-- guardamos o rótulo em `forma_detalhe` (nullable; a PaguePlay não usa).
--
-- DEPENDÊNCIAS: 20260629_analitico_recebimentos.sql
-- =====================================================================

ALTER TABLE public.analitico_recebimentos
  ADD COLUMN IF NOT EXISTS forma_detalhe TEXT;
