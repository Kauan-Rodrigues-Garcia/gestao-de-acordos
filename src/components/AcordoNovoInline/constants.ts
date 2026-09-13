export const TIPOS_PAGUEPLAY = [
  { value: 'boleto_pix', label: 'Boleto / PIX',       parcelado: true  },
  { value: 'cartao',     label: 'Cartão de Crédito',   parcelado: false },
];

// BookPlay: as formas de pagamento parcelam. A trava em 'pix' e 'cartao' foi
// retirada em 05/08/2026 — na prática o cliente paga em parcelas
// independentemente da forma, e a forma pode até variar entre as parcelas do
// mesmo acordo (ver `tipo` por parcela em AcordoDetalheInline).
//
// As duas exceções são PIX Automático e Cartão Recorrente, `parcelado: false`
// desde 05/09/2026: o que se lança ali é a AUTORIZAÇÃO da cobrança, e quem
// parcela é a recorrência. Ver `lib/formasRecorrentes.ts` para a regra inteira
// — a mesma decisão também proíbe vencimento no passado.
export const TIPOS_BOOKPLAY = [
  { value: 'boleto',            label: 'Boleto',            parcelado: true  },
  { value: 'pix_automatico',    label: 'PIX Automático',    parcelado: false },
  { value: 'cartao_recorrente', label: 'Cartão Recorrente', parcelado: false },
  { value: 'cartao',            label: 'Cartão de Crédito', parcelado: true  },
  { value: 'pix',               label: 'PIX',               parcelado: true  },
];

export const STATUS_OPTIONS = [
  { value: 'verificar_pendente', label: 'Pendente' },
  { value: 'pago',               label: 'Pago'     },
  { value: 'nao_pago',           label: 'Não Pago' },
];

export const PARCELAS_PP = Array.from({ length: 12 }, (_, i) => i + 1);
