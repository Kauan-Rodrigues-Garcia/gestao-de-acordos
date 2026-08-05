import { parseCurrencyInput } from '@/lib/index';
import { z } from 'zod';

/**
 * Formas de pagamento que geram parcelas na BookPlay. Vive aqui para que o
 * formulário e o `onSubmit` decidam pela MESMA lista — antes o `onSubmit`
 * tinha a sua cópia local e o formulário não tinha nenhuma.
 */
export const TIPOS_PARCELADOS_BP = [
  'boleto', 'cartao_recorrente', 'pix_automatico',
  // Liberados em 05/08/2026: na BookPlay qualquer forma parcela.
  'pix', 'cartao',
];

export const schemaBase = z.object({
  nome_cliente: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100, 'Nome muito longo'),
  nr_cliente:   z.string().trim().min(1, 'NR é obrigatório').max(100, 'NR muito longo'),
  vencimento:   z.string().min(1, 'Data de vencimento é obrigatória'),
  valor: z.string().min(1, 'Valor é obrigatório').refine(v => {
    const n = parseCurrencyInput(v);
    return !isNaN(n) && n > 0;
  }, 'Valor deve ser maior que zero'),
  tipo:        z.enum(['boleto', 'pix', 'cartao', 'cartao_recorrente', 'pix_automatico']),
  parcelas:    z.string().optional().refine(v => !v || (parseInt(v) > 0 && parseInt(v) <= 60), 'Parcelas inválidas'),
  whatsapp:    z.string().optional().refine(v => !v || v.replace(/\D/g, '').length >= 10, 'WhatsApp deve ter DDD + número'),
  instituicao: z.string().max(100, 'Nome da instituição muito longo').optional(),
  status:      z.enum(['verificar_pendente', 'pago', 'nao_pago']),
  observacoes: z.string().max(500, 'Campo muito longo').optional(),
  // Entrada (BookPlay): quando ligada, `valor` passa a ser o valor da ENTRADA
  // e este o de cada uma das demais parcelas. Opcional no schema porque só
  // existe com a entrada ligada — a obrigatoriedade é checada em onSubmit,
  // que é quem sabe se ela está ativa.
  valor_demais: z.string().optional().refine(v => {
    if (!v) return true;
    const n = parseCurrencyInput(v);
    return !isNaN(n) && n > 0;
  }, 'Valor das demais parcelas deve ser maior que zero'),
});

export const schemaPP = z.object({
  nome_cliente: z.string().max(100, 'Nome muito longo').optional().or(z.literal('')),
  nr_cliente:   z.string().optional().or(z.literal('')),
  vencimento:   z.string().min(1, 'Data de vencimento é obrigatória')
    .refine(v => v >= '2026-01-01', 'A data não pode ser anterior a 01/01/2026'),
  valor: z.string().min(1, 'Valor é obrigatório').refine(v => {
    const n = parseCurrencyInput(v);
    return !isNaN(n) && n > 0;
  }, 'Valor deve ser maior que zero'),
  tipo:        z.enum(['boleto', 'pix', 'cartao', 'cartao_recorrente', 'pix_automatico']),
  parcelas:    z.string().optional().refine(v => !v || (parseInt(v) > 0 && parseInt(v) <= 60), 'Parcelas inválidas'),
  whatsapp:    z.string().optional().refine(v => {
    if (!v) return true;
    let d = v.replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
    return d.length === 11;
  }, 'Número deve ter DDD + 9 dígitos (11 no total)'),
  instituicao: z.string().min(1, 'Código é obrigatório').max(100, 'Código muito longo'),
  status:      z.enum(['verificar_pendente', 'pago', 'nao_pago']),
  observacoes: z.string().max(500, 'Campo muito longo').optional(),
});

export type FormData = z.infer<typeof schemaBase>;
