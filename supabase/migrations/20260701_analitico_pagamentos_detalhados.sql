-- Adiciona coluna para detalhar múltiplos pagamentos consolidados numa única linha analítica.
-- Ocorre quando o mesmo cliente paga via métodos distintos (ex: BOLETO + PIX) no mesmo dia
-- para o mesmo operador. O campo fica NULL para linhas com pagamento único.
ALTER TABLE analitico_recebimentos
ADD COLUMN IF NOT EXISTS pagamentos_detalhados JSONB NULL;
