import { Landmark, QrCode, CreditCard } from 'lucide-react';

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
// O analítico traz outro vocabulário (`forma_detalhe`, o rótulo real do ERP) e
// ele agora mora em `@/lib/formasPagamento`: a aba Analítico desenha as mesmas
// formas, e duas telas escolhendo cores por conta própria é como o mesmo "Pix"
// aparecia em dois verdes. Reexportado para não mudar quem já importava daqui.
export { corDaForma, iconeDaForma, rotuloDaForma } from '@/lib/formasPagamento';
