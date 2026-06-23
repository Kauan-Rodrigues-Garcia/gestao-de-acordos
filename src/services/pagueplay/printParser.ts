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
  /**
   * true quando a primeira parcela é significativamente maior que as demais
   * (indica uso do modelo 40% na 1ª parcela do Mundial ERP).
   */
  quarentaPct?: boolean;
}

// OCR frequentemente lê "." (separador de milhar) como " " (espaço): "1.590,40" → "1 590,40"
// Este regex aceita tanto "." quanto " " como separador de milhar.
// R[S$]? cobre "R$" e "RS" (OCR troca $ por S).
const RE_MOEDA = /R[S$]?\s*(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2})/g;
const RE_VALOR_BARE = /(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2})/;

/** Normaliza valor monetário OCR para formato BR padrão: "1 590,40" → "1.590,40" */
function normalizarValor(s: string): string {
  return s.replace(/(\d)\s(\d{3}),/, '$1.$2,');
}

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
  const t = textoOcr.replace(/ /g, ' ');

  // ── Código ────────────────────────────────────────────────────────────
  // OCR pode perder o acento: "Código" → "Codigo" ou "C6digo"
  const mCod = t.match(/c[o0][o6]?d[i1]g[o0]\s*[:#-]?\s*(\d{3,})/i) ||
               t.match(/c[oó]digo\s*[:#-]?\s*(\d{3,})/i);
  if (mCod) out.instituicao = mCod[1];

  // ── Forma de pagamento ────────────────────────────────────────────────
  if (/\b(boleto|pix|bolepix)\b/i.test(t)) out.tipo = 'boleto';
  else if (/\bcart[aã]o\b/i.test(t)) out.tipo = 'cartao';

  // ── Parcelas (apenas boleto/pix) ──────────────────────────────────────
  if (out.tipo === 'boleto') {
    const mParc =
      t.match(/(\d{1,2})\s*parcelas?\b/i) ||       // "06 parcelas" (Mundial ERP)
      t.match(/parcelas?\s*[:\-]?\s*(\d{1,2})/i) ||
      t.match(/\b1\s+de\s+(\d{1,2})\b/i) ||        // "1 de 6" (paginação da tabela)
      t.match(/(\d{1,2})\s*x\b/i) ||
      t.match(/em\s+(\d{1,2})\s+vezes/i);
    if (mParc) {
      const n = parseInt(mParc[1], 10);
      if (n >= 1 && n <= 12) out.parcelas = String(n);
    }

    // ── Detecção do 40% na primeira parcela ──────────────────────────────
    // Mundial ERP exibe: "06 parcelas - primeira: R$ 636,16 - demais: R$ 190,85"
    const rePrimeira = new RegExp(
      'primeira\\s*[:\\-]?\\s*R[S$]?\\s*' + RE_VALOR_BARE.source, 'i',
    );
    const reDemais = new RegExp(
      'demais\\s*[:\\-]?\\s*R[S$]?\\s*' + RE_VALOR_BARE.source, 'i',
    );
    const mPrimeira = t.match(rePrimeira);
    const mDemais   = t.match(reDemais);
    if (mPrimeira && mDemais) {
      const primeira = parseBRL(normalizarValor(mPrimeira[1]));
      const demais   = parseBRL(normalizarValor(mDemais[1]));
      if (primeira > 0 && demais > 0 && primeira >= demais * 1.3) {
        out.quarentaPct = true;
      }
    }
  }

  // ── Data (vencimento / data de pagamento) ─────────────────────────────
  // Prioridade: "Primeiro vencimento" > "Vencimento/Pagamento" > primeira data dd/mm/aaaa
  const mVenc =
    t.match(/primeiro\s+vencimento\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    t.match(/(?:data\s+de\s+pagamento|vencimento|pagamento)\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (mVenc) {
    out.vencimento = `${mVenc[3]}-${mVenc[2]}-${mVenc[1]}`;
  }

  // ── Valor total ───────────────────────────────────────────────────────
  // Preferência: "Valor do acordo" / "Valor total". Fallback: maior valor no texto.
  const reTotal = new RegExp(
    'valor\\s*(?:total|do\\s+acordo)\\s*[:\\-]?\\s*R[S$]?\\s*' + RE_VALOR_BARE.source, 'i',
  );
  const mTotal = t.match(reTotal);
  if (mTotal) {
    out.valor = normalizarValor(mTotal[1]);
  } else {
    const valores = [...t.matchAll(RE_MOEDA)].map((m) => normalizarValor(m[1]));
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
