import { parseBRL } from '@/lib/money';

export interface DadosExtraidosPP {
  instituicao?: string;
  tipo?: 'boleto' | 'cartao';
  parcelas?: string;
  vencimento?: string;
  valor?: string;
  nome_cliente?: string;
  quarentaPct?: boolean;
}

// Valor monetário BR: aceita "R$", "RS" (OCR troca $→S) e sem prefixo.
// Aceita "." ou " " como separador de milhar ("1.590,40" ou "1 590,40").
const RE_MOEDA_G = /(?:R[S$]?\s*)?(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d{2,},\d{2})/g;

/** Normaliza "1 590,40" → "1.590,40" (OCR troca ponto de milhar por espaço) */
function norm(s: string): string {
  return s.replace(/(\d)\s(\d{3}),/, '$1.$2,');
}

export function extrairDadosPrintPP(textoOcr: string): DadosExtraidosPP {
  const out: DadosExtraidosPP = {};
  if (!textoOcr) return out;

  const t = textoOcr.replace(/ /g, ' ');

  // ── Código ────────────────────────────────────────────────────────────
  // OCR lê bordas do campo como "|" e "]", ex: "Código:| 1375834]"
  // [^\d\n]{0,12} absorve qualquer lixo entre o label e o número
  const mCod = t.match(/c[oó]digo[^\d\n]{0,12}(\d{4,8})/i);
  if (mCod) out.instituicao = mCod[1];

  // ── Forma de pagamento ────────────────────────────────────────────────
  if (/\b(boleto|bolepix|bolepdc|bolepd[a-z]|pix)\b/i.test(t)) out.tipo = 'boleto';
  else if (/\bcart[aã]o\b/i.test(t)) out.tipo = 'cartao';

  // ── Parcelas e 40% (apenas boleto) ───────────────────────────────────
  if (out.tipo === 'boleto') {

    // 1) "06 parcelas" — número ANTES da palavra (layout do Mundial ERP)
    // 2) "parcelas: 6"  — número DEPOIS
    // 3) Contar linhas da tabela de parcelas: "2 190,85 23/07/2026" …
    //    o maior número de linha encontrado = total de parcelas
    // 4) "1de6" / "1 de 6" — paginação da tabela de parcelas
    // 5) "6x" / "em 6 vezes"
    let nParc: number | null = null;

    const m1 = t.match(/(\d{1,2})\s+parcelas?\b/i);
    if (m1) nParc = parseInt(m1[1], 10);

    if (!nParc) {
      const m2 = t.match(/parcelas?\s*[:\-]?\s*(\d{1,2})/i);
      if (m2) nParc = parseInt(m2[1], 10);
    }

    if (!nParc) {
      // Linhas da tabela: "N  valor  dd/mm/aaaa" — pega o maior N
      const linhas = [...t.matchAll(/\b(\d{1,2})\s+\d+,\d{2}\s+\d{2}\/\d{2}\/\d{4}/g)];
      if (linhas.length >= 2) {
        const maxLinha = Math.max(...linhas.map(m => parseInt(m[1], 10)));
        if (maxLinha >= 2 && maxLinha <= 12) nParc = maxLinha;
      }
    }

    if (!nParc) {
      // "1de6" ou "1 de 6" — paginação da tabela de parcelas
      const m4 = t.match(/\b1\s*de\s*(\d{1,2})\b/i);
      if (m4) nParc = parseInt(m4[1], 10);
    }

    if (!nParc) {
      const m5 = t.match(/(\d{1,2})\s*x\b/i) || t.match(/em\s+(\d{1,2})\s+vezes/i);
      if (m5) nParc = parseInt(m5[1], 10);
    }

    if (nParc && nParc >= 1 && nParc <= 12) out.parcelas = String(nParc);

    // ── Detecção do 40% ──────────────────────────────────────────────────
    // "primeira: R$ 636,16 - demais: R$ 190,85"
    const mPrimeira = t.match(/primeira\s*[:\-]?\s*(?:R[S$]?\s*)?(\d[\d\s.,]+,\d{2})/i);
    const mDemais   = t.match(/demais\s*[:\-]?\s*(?:R[S$]?\s*)?(\d[\d\s.,]+,\d{2})/i);
    if (mPrimeira && mDemais) {
      const primeira = parseBRL(norm(mPrimeira[1]));
      const demais   = parseBRL(norm(mDemais[1]));
      if (primeira > 0 && demais > 0 && primeira >= demais * 1.3) {
        out.quarentaPct = true;
      }

      // Calcula o valor total a partir das parcelas (fallback para quando
      // o OCR fragmenta o label "Valor do acordo")
      if (out.parcelas) {
        const n = parseInt(out.parcelas, 10);
        const total = primeira + (n - 1) * demais;
        // Formata como "1.590,40"
        out.valor = total.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      }
    }
  }

  // ── Data ──────────────────────────────────────────────────────────────
  // Prioridade: "Primeiro vencimento" > outros labels > primeira data no texto
  const mVenc =
    t.match(/primeiro\s+vencimento\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    t.match(/(?:data\s+de\s+pagamento|vencimento|pagamento)\s*[:\-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (mVenc) {
    out.vencimento = `${mVenc[3]}-${mVenc[2]}-${mVenc[1]}`;
  }

  // ── Valor total ───────────────────────────────────────────────────────
  // 1) Label "Valor do acordo" / "Valor total" (fuzzy — OCR fragmenta o label)
  // 2) Calculado de primeira+demais×(n-1) — já feito acima dentro do bloco boleto
  // 3) Fallback: maior valor monetário que apareça após "Valor" no texto

  if (!out.valor) {
    // Fuzzy: "Valor" seguido de qualquer coisa (até 60 chars) e depois um número
    const mFuzzy = t.match(/valor\b.{0,60}?(\d{1,3}(?:[.\s]\d{3})*,\d{2})/is);
    if (mFuzzy) out.valor = norm(mFuzzy[1]);
  }

  if (!out.valor) {
    // Último recurso: maior valor monetário com prefixo R$ no texto
    const rMoeda = /R[S$]\s*(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2})/g;
    const vals = [...t.matchAll(rMoeda)].map(m => norm(m[1]));
    if (vals.length) {
      out.valor = vals.reduce((a, b) => (parseBRL(b) > parseBRL(a) ? b : a));
    }
  }

  // ── Nome do cliente ───────────────────────────────────────────────────
  const mNome = t.match(/(?:cliente|nome)\s*[:\-]?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]{3,60})/i);
  if (mNome) {
    out.nome_cliente = mNome[1].trim().replace(/\s{2,}/g, ' ');
  }

  return out;
}
