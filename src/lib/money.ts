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
 *  Aceita: "1.234,56" | "1234,56" | "R$ 1.234,56" | "1200" | "1.200"
 *  NOTA: não passa por safeNum no branch com vírgula — safeNum removeria o
 *  ponto decimal já convertido, transformando "1200.00" em 120000. */
export function parseBRL(v: string): number {
  if (!v) return 0;
  const s = v.replace(/[R$\s]/g, '').trim();
  if (s.includes(',')) {
    // "1.234,56" → "1234,56" → "1234.56" → parseFloat diretamente
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  // Sem vírgula: pontos são separadores de milhar (padrão BR) → remove e parseia
  const n = parseFloat(s.replace(/\./g, ''));
  return isFinite(n) ? n : 0;
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

/**
 * Divide valorTotal em numParcelas.
 * Se quarentaPct=true: parcela[0] = 40% do total, restantes dividem os 60% restantes igualmente.
 * Ajuste de centavos sempre vai para a parcela[0] (nunca para as demais).
 * Retorna array de length === numParcelas, valores em reais com 2 casas decimais.
 */
export function calcularParcelas(
  valorTotal: number,
  numParcelas: number,
  quarentaPct: boolean,
): number[] {
  if (numParcelas <= 0) return [];
  if (numParcelas === 1) return [Math.round(valorTotal * 100) / 100];

  const totalCents = Math.round(valorTotal * 100);

  if (quarentaPct) {
    const primeiraCents = Math.round(totalCents * 0.4);
    const restanteCents = totalCents - primeiraCents;
    const demaisCents   = Math.floor(restanteCents / (numParcelas - 1));
    const sobra         = restanteCents - demaisCents * (numParcelas - 1);
    const result        = [primeiraCents + sobra];
    for (let i = 1; i < numParcelas; i++) result.push(demaisCents);
    return result.map(c => c / 100);
  }

  const baseCents = Math.floor(totalCents / numParcelas);
  const sobra     = totalCents - baseCents * numParcelas;
  const result    = [baseCents + sobra];
  for (let i = 1; i < numParcelas; i++) result.push(baseCents);
  return result.map(c => c / 100);
}

/**
 * Detecta se a 1ª parcela usou a regra dos 40%.
 * Só faz sentido chamar quando acordo.valor_total != null e numero_parcela === 1.
 */
export function foiUsadoQuarentaPct(acordo: { valor: number; valor_total?: number | null; parcelas?: number | null }): boolean {
  if (!acordo.valor_total || !acordo.parcelas || acordo.parcelas < 2) return false;
  const esperado40 = Math.round(acordo.valor_total * 0.4 * 100) / 100;
  return Math.abs(acordo.valor - esperado40) < 0.005;
}
