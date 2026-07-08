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

/** Normaliza "1 590,40" → "1.590,40" (OCR troca separador de milhar por espaço) */
function norm(s: string): string {
  return s.replace(/(\d)\s(\d{3}),/, '$1.$2,');
}

/** Converte número para string BR: 1422.81 → "1.422,81" */
function formatBR(n: number): string {
  return n
    .toFixed(2)
    .replace('.', ',')
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function extrairDadosPrintPP(textoOcr: string): DadosExtraidosPP {
  const out: DadosExtraidosPP = {};
  if (!textoOcr) return out;

  const t = textoOcr.replace(/ /g, ' ');

  // ── Código ────────────────────────────────────────────────────────────
  // OCR lê bordas do campo como "| ]": "Código:| 1375834]"
  const mCod = t.match(/c[oó]digo[^\d\n]{0,12}(\d{4,8})/i);
  if (mCod) out.instituicao = mCod[1];

  // ── Forma de pagamento ────────────────────────────────────────────────
  if (/\b(boleto|bolepix|bolepd[a-z]|pix)\b/i.test(t)) out.tipo = 'boleto';
  else if (/\bcart[aã]o\b/i.test(t)) out.tipo = 'cartao';

  // ── Tabela de parcelas: "valor  dd/mm/aaaa" ───────────────────────────
  // O ERP exibe uma linha por parcela — cada linha tem valor e data lado a lado.
  // Isso é mais confiável do que tentar parsear "06 parcelas" (OCR troca 0→O)
  // ou "Valor do acordo" (label fragmentado pelo OCR).
  if (out.tipo === 'boleto') {
    const RE_LINHA = /(\d{1,3}(?:[.\s]\d{3})*,\d{2})\s+(\d{2}\/\d{2}\/\d{4})/g;
    const linhas = [...t.matchAll(RE_LINHA)];

    if (linhas.length >= 1 && linhas.length <= 12) {
      out.parcelas = String(linhas.length);

      // Soma todas as parcelas = valor total do acordo
      const vals = linhas.map(r => parseBRL(norm(r[1])));
      const totalCents = vals.reduce((acc, v) => acc + Math.round(v * 100), 0);
      out.valor = formatBR(totalCents / 100);

      // quarentaPct: primeira parcela >= 1.3× a média das demais
      if (vals.length > 1) {
        const somaResto = vals.slice(1).reduce((a, b) => a + b, 0);
        const mediaResto = somaResto / (vals.length - 1);
        if (vals[0] >= mediaResto * 1.3) out.quarentaPct = true;
      }
    }

    // Fallback parcelas: "06 parcelas" no texto (aceita O no lugar de 0)
    if (!out.parcelas) {
      const mParc =
        t.match(/([0O\d][0-9]|[1-9])\s+parcelas?\b/i) ||
        t.match(/parcelas?\s*[:-]?\s*(\d{1,2})/i) ||
        t.match(/\b1\s*de\s*(\d{1,2})\b/i);
      if (mParc) {
        const n = parseInt(mParc[1].replace(/O/gi, '0'), 10);
        if (n >= 1 && n <= 12) out.parcelas = String(n);
      }
    }
  }

  // ── Data (primeiro vencimento) ─────────────────────────────────────────
  const mVenc =
    t.match(/primeiro\s+vencimento\s*[:-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    t.match(/(?:data\s+de\s+pagamento|vencimento|pagamento)\s*[:-]?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
    t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (mVenc) {
    out.vencimento = `${mVenc[3]}-${mVenc[2]}-${mVenc[1]}`;
  }

  // ── Valor total (fallback quando tabela não foi usada) ────────────────
  // Tenta o label "Valor do acordo" mesmo fragmentado: "Valor d: do: 1.422,81"
  // Requer "do" na linha (descarta "Valor original", "Valor corrigido", etc.)
  if (!out.valor) {
    const mDo = t.match(
      /valor\b(?!\s*(?:original|corrigido|atualizado))[^\n]{0,40}\bdo\b[^\d\n]{0,20}(\d{1,3}(?:[.\s]\d{3})*,\d{2})/i,
    );
    if (mDo) out.valor = norm(mDo[1]);
  }

  // ── Nome do cliente ───────────────────────────────────────────────────
  const mNome = t.match(/(?:cliente|nome)\s*[:-]?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]{3,60})/i);
  if (mNome) {
    out.nome_cliente = mNome[1].trim().replace(/\s{2,}/g, ' ');
  }

  return out;
}
