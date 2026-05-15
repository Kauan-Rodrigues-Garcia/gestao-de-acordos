-- Adiciona coluna valor_total em acordos para suporte a acordos parcelados PaguePay
-- null = comportamento antigo/Bookplay (nunca assumir preenchido)
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(12,2) DEFAULT NULL;

COMMENT ON COLUMN public.acordos.valor_total IS
  'Valor total do acordo parcelado (PaguePay). NULL = comportamento antigo/Bookplay.
   Quando preenchido: campo valor armazena o valor da 1ª parcela (pode usar 40%).';
