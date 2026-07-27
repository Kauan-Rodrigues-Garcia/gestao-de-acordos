/**
 * consolidar.ts — soma e arredondamento monetário SEM float (BigInt).
 *
 * Os valores vêm de fórmulas (Valor de Nota × %) e podem ter muitas casas. Para
 * não perder precisão, trabalhamos numa escala interna alta (10 casas) e só
 * arredondamos na EXIBIÇÃO: bruto com 5 casas, PIX por operador com 2 casas
 * (ROUND_HALF_UP, uma única vez por operador). Assim a soma dos arredondados por
 * operador bate com o esperado (ex.: total bruto 543.0952 → R$ 543,12).
 */

const ESCALA = 10;

/**
 * "128,55715" | "128.55715" | " R$ 1.234,50 " → BigInt na escala interna (10),
 * com ROUND_HALF_UP na 11ª casa (remove o ruído de float ao ler a célula).
 * Lança se não for numérico (o chamador trata como linha inválida).
 */
export function paraEscala5(bruto: string | number | null | undefined): bigint {
  if (bruto == null || bruto === '') throw new Error('valor vazio');
  let s = String(bruto).trim().replace(/\s/g, '').replace(/r\$/i, '');
  let sinal = 1n;
  if (s.startsWith('-')) { sinal = -1n; s = s.slice(1); }

  const idx = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const inteiro = (idx === -1 ? s : s.slice(0, idx)).replace(/[^\d]/g, '');
  const fracao = (idx === -1 ? '' : s.slice(idx + 1)).replace(/[^\d]/g, '');
  if (inteiro === '' && fracao === '') throw new Error(`valor não numérico: ${bruto}`);

  const fracPad = (fracao + '0'.repeat(ESCALA + 1)).slice(0, ESCALA + 1); // ESCALA+1 dígitos
  let escala = BigInt((inteiro || '0') + fracPad.slice(0, ESCALA));
  if (fracPad.charCodeAt(ESCALA) - 48 >= 5) escala += 1n;                 // half-up
  return sinal * escala;
}

/** Soma valores (strings decimais) na escala interna, com precisão total. */
export function somarEscala5(valores: Array<string | number>): bigint {
  return valores.reduce<bigint>((acc, v) => acc + paraEscala5(v), 0n);
}

/**
 * Arredonda um valor da escala interna para `casas` decimais com ROUND_HALF_UP.
 * Retorna string (ex.: casas=2 → "543.12"; casas=5 → "128.55715").
 */
export function arredondarHalfUp(v: bigint, casas: number): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const div = 10n ** BigInt(ESCALA - casas);
  const q = abs / div;
  const r = abs % div;
  const arred = r * 2n >= div ? q + 1n : q;
  const f = 10n ** BigInt(casas);
  const inteiro = arred / f;
  const frac = (arred % f).toString().padStart(casas, '0');
  return `${neg ? '-' : ''}${inteiro}${casas > 0 ? '.' + frac : ''}`;
}

/** Atalho: arredonda para 2 casas (valor de PIX por operador). */
export function arredondar2HalfUp(v: bigint): string {
  return arredondarHalfUp(v, 2);
}

/** String de precisão total (10 casas) — depuração/auditoria. */
export function formatarEscala5(v: bigint): string {
  return arredondarHalfUp(v, ESCALA);
}
