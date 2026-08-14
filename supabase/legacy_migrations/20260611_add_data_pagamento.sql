-- Adiciona coluna data_pagamento para registrar a data real do pagamento
-- (útil quando o pagamento é registrado em atraso, ex: nao_pago → pago dias depois)
ALTER TABLE public.acordos
  ADD COLUMN IF NOT EXISTS data_pagamento DATE;
