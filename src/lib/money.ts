/**
 * src/lib/money.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Utilitários CENTRALIZADOS para tudo que envolve dinheiro no sistema.
 *
 * Regras:
 *  - Internamente tudo é `number` (float64)
 *  - Banco salva como NUMERIC(12,2) — vem como string ou number, normalize com safeNum()
 *  - Exibição sempre via formatBRL()
 *  - Entrada de formulário via parseBRL()
 *  - NUNCA concatenar string + number para soma
 */

/** Converte QUALQUER valor para number seguro. Retorna 0 em caso de falha. */
export function safeNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  // Formato BR: "1.234,56" → "1234.56"
  const normalized = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  return isFinite(n) ? n : 0;
}

/** Formata para moeda BRL. Aceita qualquer input — usa safeNum internamente. */
export function formatBRL(v: unknown): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNum(v));
}

/** Parse de campo de formulário para número.
 *  Aceita: "1.234,56" | "1234.56" | "1234,56" | "R$ 1.234,56" */
export function parseBRL(v: string): number {
  if (!v) return 0;
  // Remove símbolo de moeda e espaços
  const s = v.replace(/[R$\s]/g, '').trim();
  // Se tem vírgula como separador decimal (formato BR)
  if (s.includes(',')) {
    // "1.234,56" → remove pontos → "1234,56" → troca vírgula → "1234.56"
    return safeNum(s.replace(/\./g, '').replace(',', '.'));
  }
  return safeNum(s);
}

/** Soma um array de valores com segurança. */
export function sumSafe(arr: unknown[]): number {
  return arr.reduce<number>((acc, v) => acc + safeNum(v), 0);
}

/** Percentual seguro. Retorna 0 se divisor for 0. */
export function pct(part: unknown, total: unknown): number {
  const t = safeNum(total);
  if (t === 0) return 0;
  return Math.round((safeNum(part) / t) * 100);
}

/** Alias de compatibilidade com o antigo parseCurrencyInput */
export const parseCurrencyInput = parseBRL;

/** Alias de compatibilidade com o antigo formatCurrency */
export const formatCurrency = formatBRL;
