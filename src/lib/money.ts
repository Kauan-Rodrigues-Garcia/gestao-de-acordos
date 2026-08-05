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
 * Divide valorTotal em numParcelas usando ROUND (arredondamento padrão, igual à planilha).
 * As parcelas "regulares" usam Math.round; a parcela[0] absorve o ajuste residual
 * (pode ser positivo ou negativo dependendo do arredondamento).
 * Se quarentaPct=true: parcela[0] = exatamente 40%; parcela[1] absorve o ajuste
 * do restante; parcelas[2..N] usam Math.round do restante/(N-1).
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
    const demaisCents   = Math.round(restanteCents / (numParcelas - 1));
    const ajuste        = restanteCents - demaisCents * (numParcelas - 1);
    const result        = [primeiraCents, demaisCents + ajuste];
    for (let i = 2; i < numParcelas; i++) result.push(demaisCents);
    return result.map(c => c / 100);
  }

  const demaisCents = Math.round(totalCents / numParcelas);
  const p1Cents     = totalCents - (numParcelas - 1) * demaisCents;
  const result      = [p1Cents];
  for (let i = 1; i < numParcelas; i++) result.push(demaisCents);
  return result.map(c => c / 100);
}

// ── Entrada + demais parcelas (BookPlay) ────────────────────────────────────
//
// Acordo negociado como "entrada de X e mais N−1 de Y". A entrada É a parcela
// 1 de N: com 4 parcelas o cliente paga 4 vezes (1 entrada + 3 iguais), e o
// contador segue 1/4 … 4/4 como em qualquer outro acordo.
//
// Difere do rateio normal e da regra dos 40% (PaguePlay), que PARTEM do total
// e dividem. Aqui os dois valores são digitados pelo operador e o total é
// consequência — não há resto de divisão para alguém absorver.
//
// No banco: `valor_entrada` guarda a entrada e `valor_total` a soma. O valor
// das demais é derivado de volta por `valorDemaisParcelas`, então os dois
// números nunca podem divergir entre si.

/** true quando o acordo foi negociado com entrada (qualquer parcela do grupo). */
export function temEntrada(acordo: {
  valor_entrada?: number | null;
  parcelas?:      number | null;
}): boolean {
  return acordo.valor_entrada != null
    && acordo.valor_entrada > 0
    && (acordo.parcelas ?? 1) > 1;
}

/** Total do acordo: entrada + demais × (N−1). Em centavos, para não somar float. */
export function totalComEntrada(
  valorEntrada: number,
  valorDemais:  number,
  numParcelas:  number,
): number {
  if (numParcelas <= 1) return Math.round(valorEntrada * 100) / 100;
  const cents = Math.round(valorEntrada * 100)
    + Math.round(valorDemais * 100) * (numParcelas - 1);
  return cents / 100;
}

/**
 * As N parcelas: a primeira é a entrada, as demais são iguais.
 * Sem resto para distribuir — os dois valores vieram digitados.
 */
export function calcularParcelasComEntrada(
  valorEntrada: number,
  valorDemais:  number,
  numParcelas:  number,
): number[] {
  if (numParcelas <= 0) return [];
  const entrada = Math.round(valorEntrada * 100) / 100;
  if (numParcelas === 1) return [entrada];
  const demais = Math.round(valorDemais * 100) / 100;
  return [entrada, ...Array<number>(numParcelas - 1).fill(demais)];
}

/**
 * Volta o valor de CADA parcela que não é a entrada, a partir do que está
 * gravado. É o número que o reagendamento sugere da 2ª em diante — sem ele a
 * parcela 2 repetiria o valor da entrada.
 *
 * `null` quando o acordo não tem entrada ou não dá para derivar.
 */
export function valorDemaisParcelas(acordo: {
  valor_total?:   number | null;
  valor_entrada?: number | null;
  parcelas?:      number | null;
}): number | null {
  if (!temEntrada(acordo)) return null;
  const n = acordo.parcelas ?? 1;
  if (acordo.valor_total == null) return null;
  const restoCents = Math.round(acordo.valor_total * 100) - Math.round(acordo.valor_entrada! * 100);
  if (restoCents <= 0) return null;
  return Math.round(restoCents / (n - 1)) / 100;
}

/**
 * Deriva o VALOR TOTAL do acordo a partir do valor de UMA parcela vinda do
 * relatório analítico (PaguePlay), onde boleto/Pix informam só a parcela.
 *
 * - Sem 40%: total = parcela × N.
 * - Com 40% e a parcela paga é a 1ª: a parcela é 40% do total → total = v/0,4.
 * - Com 40% e a parcela paga é 2ª+: a parcela é uma das demais (60% ÷ (N−1))
 *   → total = v×(N−1)/0,6.
 * A regra dos 40% só vale para N ≥ 3 (mesma regra do formulário).
 */
export function calcularTotalAnalitico(
  valorParcela: number,
  totalParcelas: number,
  parcelaAtual: number,
  quarentaPct: boolean,
): number {
  const round2 = (v: number) => Math.round(v * 100) / 100;
  if (totalParcelas <= 1) return round2(valorParcela);
  const q40 = quarentaPct && totalParcelas > 2;
  if (!q40) return round2(valorParcela * totalParcelas);
  if (parcelaAtual <= 1) return round2(valorParcela / 0.4);
  return round2((valorParcela * (totalParcelas - 1)) / 0.6);
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
