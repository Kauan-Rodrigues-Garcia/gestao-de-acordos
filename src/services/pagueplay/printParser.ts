import { parseBRL } from '@/lib/money';

/**
 * Dados extraídos do print do Mundial ERP (apenas Pagueplay).
 * Formato neutro — cada tela faz seu próprio mapeamento para os campos do form.
 */
export interface DadosExtraidosPP {
  /** Código do cliente/acordo (campo `instituicao`). */
  instituicao?: string;
  /** Forma de pagamento normalizada. `boleto` cobre Boleto e PIX. */
  tipo?: 'boleto' | 'cartao';
  /** Quantidade de parcelas (1..12) — só faz sentido quando `tipo === 'boleto'`. */
  parcelas?: string;
  /** Data de pagamento/vencimento no formato `yyyy-MM-dd`. */
  vencimento?: string;
  /** Valor total como string BR (ex.: `1.422,81`). */
  valor?: string;
  /** Nome completo do cliente/profissional. */
  nome_cliente?: string;
}

// Valor monetário BR: "1.422,81", "355,71" (com ou sem separador de milhar)
// R[S$]? cobre tanto "R$" quanto "RS" (OCR frequentemente troca $ por S)
const RE_MOEDA = /R[S$]?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;

/**
 * Extrai os campos do acordo a partir do texto bruto do OCR.
 * Função pura (sem dependência de DOM/OCR) — fácil de testar.
 *
 * ⚠️ Os regex assumem o layout atual do Mundial ERP. Se a tela do ERP mudar,
 * estes padrões precisam ser ajustados.
 */
export function extrairDadosPrintPP(textoOcr: string): DadosExtraidosPP {
  const out: DadosExtraidosPP = {};
  if (!textoOcr) return out;

  // normaliza espaços não-quebráveis
  const t = textoOcr.replace(/ /g, ' ');

  // ── Código / Inscrição ────────────────────────────────────────────────
  // O modal do ERP usa "Inscrição XXXXXX"; a ficha do cliente usa "Código: XXXXXX"
  const mCod =
    t.match(/inscri[cç][aã]o\s*[:#-]?\s*(\d{3,})/i) ||
    t.match(/c[oó]digo\s*[:#-]?\s*(\d{3,})/i);
  if (mCod) out.instituicao = mCod[1];

  // ── Forma de pagamento ────────────────────────────────────────────────
  if (/\b(boleto|pix)\b/i.test(t)) out.tipo = 'boleto';
  else if (/\bcart[aã]o\b/i.test(t)) out.tipo = 'cartao';

  // ── Parcelas (apenas boleto/pix) ──────────────────────────────────────
  if (out.tipo === 'boleto') {
    const mParc =
      t.match(/(\d{1,2})\s*parcelas?\b/i) ||   // "06 parcelas" (ERP Mundial)
      t.match(/parcelas?\s*[:\-]?\s*(\d{1,2})/i) ||
      t.match(/(\d{1,2})\s*x\b/i) ||
      t.match(/em\s+(\d{1,2})\s+vezes/i);
    if (mParc) {
      const n = parseInt(mParc[1], 10);
      if (n >= 1 && n <= 12) out.parcelas = String(n);
    }
  }

  // ── Data (vencimento / data de pagamento) ─────────────────────────────
  // Tenta primeiro uma data rotulada; senão, a primeira data dd/mm/aaaa do texto.
  const mVenc =
    t.match(
      /(?:primeiro\s+vencimento|data\s+de\s+pagamento|vencimento|pagamento)\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i,
    ) || t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (mVenc) {
    out.vencimento = `${mVenc[3]}-${mVenc[2]}-${mVenc[1]}`;
  }

  // ── Valor total ───────────────────────────────────────────────────────
  // Preferência: valor rotulado como "total"/"do acordo". Fallback: maior valor.
  const mTotal = t.match(
    /valor\s*(?:total|do\s+acordo)\s*[:\-]?\s*R[S$]?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/i,
  );
  if (mTotal) {
    out.valor = mTotal[1];
  } else {
    const valores = [...t.matchAll(RE_MOEDA)].map((m) => m[1]);
    if (valores.length) {
      out.valor = valores.reduce((a, b) => (parseBRL(b) > parseBRL(a) ? b : a));
    }
  }

  // ── Nome do cliente ───────────────────────────────────────────────────
  const mNome = t.match(/(?:cliente|nome)\s*[:\-]?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]{3,60})/i);
  if (mNome) {
    out.nome_cliente = mNome[1].trim().replace(/\s{2,}/g, ' ');
  }

  return out;
}
