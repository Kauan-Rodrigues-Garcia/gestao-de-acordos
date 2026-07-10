/**
 * Tipos compartilhados da leitura de acordo por imagem (BookPlay).
 *
 * Um único formato de saída, produzido tanto pela IA de visão (`_fonte: 'ia'`)
 * quanto pelo OCR local Tesseract (`_fonte: 'ocr'`), para que o formulário
 * consuma o resultado sem saber qual motor foi usado.
 */

/** Formas de pagamento aceitas no BookPlay (espelha TIPOS_BOOKPLAY). */
export type TipoBookplay =
  | 'boleto'
  | 'pix_automatico'
  | 'cartao_recorrente'
  | 'cartao'
  | 'pix';

/** Status aceitos no BookPlay (espelha STATUS_OPTIONS). */
export type StatusBookplay = 'verificar_pendente' | 'pago' | 'nao_pago';

export interface DadosExtraidosAcordo {
  /** NR / código do acordo. */
  nr_cliente?: string;
  nome_cliente?: string;
  whatsapp?: string;
  /** Primeiro vencimento no formato ISO `YYYY-MM-DD`. */
  vencimento?: string;
  /** Valor de CADA parcela em formato brasileiro (`"1.234,56"`). */
  valor?: string;
  parcelas?: string;
  tipo?: TipoBookplay;
  status?: StatusBookplay;
  instituicao?: string;

  /** Motor que produziu o resultado. */
  _fonte?: 'ia' | 'ocr';
  /** Texto bruto do OCR — apenas para diagnóstico (admin/console). */
  _textoOcr?: string;
}

/** Conjunto de chaves "de dados" (exclui os campos de diagnóstico `_*`). */
export const CAMPOS_DADOS: (keyof DadosExtraidosAcordo)[] = [
  'nr_cliente',
  'nome_cliente',
  'whatsapp',
  'vencimento',
  'valor',
  'parcelas',
  'tipo',
  'status',
  'instituicao',
];

/** Conta quantos campos de dados foram efetivamente preenchidos. */
export function contarCamposPreenchidos(d: DadosExtraidosAcordo): number {
  return CAMPOS_DADOS.filter((k) => {
    const v = d[k];
    return typeof v === 'string' && v.trim() !== '';
  }).length;
}
