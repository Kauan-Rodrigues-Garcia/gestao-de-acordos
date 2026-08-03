import { Landmark, QrCode, CreditCard, type LucideIcon } from 'lucide-react';

export interface SetorAgendamento {
  id: string;
  nome: string;
  totalAgendado: number;
  totalRecebido: number;
  totalNaoPago: number;
  totalPendente: number;
  totalAcordos: number;
  porTipo: Record<string, { agendado: number; recebido: number; qtd: number }>;
  perc: number;
}

export interface MesAnteriorData {
  valorAgendado: number;
  valorRecebido: number;
  totalAcordos: number;
}

export const TIPO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  boleto:            Landmark,
  pix:               QrCode,
  pix_automatico:    QrCode,
  cartao:            CreditCard,
  cartao_recorrente: CreditCard,
};

export const TIPO_CORES: Record<string, string> = {
  boleto:            '#6366f1',
  pix:               '#22c55e',
  pix_automatico:    '#10b981',
  cartao:            '#f59e0b',
  cartao_recorrente: '#f97316',
};

export const EVOL_AGENDADO = '#6366f1';
export const EVOL_RECEBIDO = '#22c55e';

export const TIPO_LABELS_DISPLAY: Record<string, string> = {
  boleto:            'Boleto / PIX',
  pix:               'Pix',
  pix_automatico:    'Pix Automático',
  cartao:            'Cartão',
  cartao_recorrente: 'Cartão Recorrente',
};

export const PIE_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6',
];

// ── Formas de pagamento do relatório analítico ───────────────────────────────
// Os mapas acima são indexados pelo `tipo` do ACORDO (boleto, pix, cartao…).
// O analítico traz outro vocabulário: `forma_detalhe` é o rótulo real do ERP
// ("Pix Automático", "Boleto Negociação", "Cartão de Crédito"…) e varia entre
// os dois tenants. Casar por palavra-chave é o que sobrevive a um rótulo novo
// aparecer no relatório sem virar uma fatia cinza sem ícone no gráfico.

export function corDaForma(rotulo: string): string {
  const n = rotulo.toLowerCase();
  if (n.includes('cart')) return n.includes('recorrente') ? '#f97316' : '#f59e0b';
  if (n.includes('pix'))  return n.includes('autom')      ? '#10b981' : '#22c55e';
  if (n.includes('boleto')) return '#6366f1';
  return '#94a3b8';
}

/**
 * O tipo é `LucideIcon`, não `ComponentType<{ className }>`: quem chama passa
 * também `style` para colorir o ícone com a cor da forma de pagamento, e a
 * assinatura estreita rejeitava isso.
 */
export function iconeDaForma(rotulo: string): LucideIcon {
  const n = rotulo.toLowerCase();
  if (n.includes('cart')) return CreditCard;
  if (n.includes('pix'))  return QrCode;
  return Landmark;
}
