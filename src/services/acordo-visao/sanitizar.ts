import type {
  DadosExtraidosAcordo,
  StatusBookplay,
  TipoBookplay,
} from './types';

/**
 * Normaliza e valida o resultado da extração antes de chegar ao formulário.
 *
 * Vale para AMBOS os motores: a IA pode devolver `tipo`/`status` fora do
 * vocabulário, datas em formatos variados ou valores como número; o OCR pode
 * trazer sujeira. Aqui garantimos que só campos válidos e no formato esperado
 * pelo formulário BookPlay cheguem à UI.
 */

const TIPOS_VALIDOS: TipoBookplay[] = [
  'boleto',
  'pix_automatico',
  'cartao_recorrente',
  'cartao',
  'pix',
];

const STATUS_VALIDOS: StatusBookplay[] = ['verificar_pendente', 'pago', 'nao_pago'];

function str(v: unknown): string | undefined {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/** Aceita `YYYY-MM-DD` ou `DD/MM/YYYY` → devolve ISO `YYYY-MM-DD`. */
function normVencimento(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return undefined;
}

/** Garante formato brasileiro "1.234,56"; converte "1234.56" ou número. */
function normValor(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  const s = str(v);
  if (!s) return undefined;
  // Já em BR ("1.234,56" ou "1234,56")
  if (/,\d{2}$/.test(s)) return s;
  // Formato americano "1234.56" → BR
  const am = s.match(/^\d+(\.\d{2})?$/);
  if (am) {
    const n = parseFloat(s);
    if (Number.isFinite(n)) {
      return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
  }
  return s;
}

function normParcelas(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 1 && n <= 60 ? String(n) : undefined;
}

function normTipo(v: unknown): TipoBookplay | undefined {
  const s = str(v)?.toLowerCase();
  return s && (TIPOS_VALIDOS as string[]).includes(s) ? (s as TipoBookplay) : undefined;
}

function normStatus(v: unknown): StatusBookplay | undefined {
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  if ((STATUS_VALIDOS as string[]).includes(s)) return s as StatusBookplay;
  // sinônimos comuns que a IA pode devolver
  if (/pendente|aguardando/.test(s)) return 'verificar_pendente';
  if (/n[ãa]o.?pago|aberto|inadimplente/.test(s)) return 'nao_pago';
  if (/pago|quitado|liquidado/.test(s)) return 'pago';
  return undefined;
}

export function sanitizarDadosAcordo(
  bruto: { [K in keyof DadosExtraidosAcordo]?: unknown },
): DadosExtraidosAcordo {
  const out: DadosExtraidosAcordo = {};

  const nr = str(bruto.nr_cliente);
  if (nr) out.nr_cliente = nr;

  const nome = str(bruto.nome_cliente);
  if (nome) out.nome_cliente = nome;

  const whats = str(bruto.whatsapp);
  if (whats) out.whatsapp = whats;

  const venc = normVencimento(bruto.vencimento);
  if (venc) out.vencimento = venc;

  const valor = normValor(bruto.valor);
  if (valor) out.valor = valor;

  const parcelas = normParcelas(bruto.parcelas);
  if (parcelas) out.parcelas = parcelas;

  const tipo = normTipo(bruto.tipo);
  if (tipo) out.tipo = tipo;

  const status = normStatus(bruto.status);
  if (status) out.status = status;

  const inst = str(bruto.instituicao);
  if (inst) out.instituicao = inst;

  if (typeof bruto._textoOcr === 'string') out._textoOcr = bruto._textoOcr;

  return out;
}
