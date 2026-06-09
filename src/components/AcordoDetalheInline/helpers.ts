export const _TIPO_LABELS_PP: Record<string, string> = {
  boleto: 'Boleto / PIX',
  cartao: 'Cartão de Crédito',
  pix: 'Boleto / PIX',
};

export const _TIPO_LABELS_BK: Record<string, string> = {
  boleto: 'Boleto',
  cartao_recorrente: 'Cartão Recorrente',
  pix_automatico: 'Pix automático',
  cartao: 'Cartão',
  pix: 'Pix',
};

export const _STATUS_LABELS_PP: Record<string, string> = {
  verificar_pendente: 'Pendente',
  pago: 'Pago',
  nao_pago: 'Não Pago',
};

export const _STATUS_LABELS_BK: Record<string, string> = {
  verificar_pendente: 'Verificar',
  pago: 'Pago',
  nao_pago: 'Não Pago',
};

export const TIPOS_PARCELADOS_BOOKPLAY  = ['boleto', 'pix_automatico', 'cartao_recorrente'];
export const TIPOS_PARCELADOS_PAGUEPLAY = ['boleto', 'pix'];

export function isTipoParcelado(tipo: string, isPP: boolean): boolean {
  return isPP
    ? TIPOS_PARCELADOS_PAGUEPLAY.includes(tipo)
    : TIPOS_PARCELADOS_BOOKPLAY.includes(tipo);
}

/** Somar N meses a uma data YYYY-MM-DD */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = m - 1 + months;
  return `${y + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
