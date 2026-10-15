/**
 * percentual.ts — ler e escrever os percentuais de «Descontos e cálculos».
 *
 * O campo é de TEXTO (ver `CampoPercentual.tsx`): aceita vírgula ou ponto,
 * aceita o «%» colado junto, e nada se perde no meio da digitação.
 */

/** Maior número que o campo aceita. */
export const PERCENTUAL_MAX = 100;

/** 12.5 → «12,5»; 7 → «7». */
export function textoDoPercentual(n: number): string {
  return Number.isFinite(n) ? String(n).replace('.', ',') : '';
}

/**
 * «12,5» → 12.5; «7 %» → 7; «150» → 100. `null` quando ainda não é número
 * (vazio, só a vírgula, letras): quem chama decide o que fazer.
 */
export function lerPercentual(texto: string): number | null {
  const t = texto.replace(/[%\s]/g, '').replace(',', '.');
  if (t === '' || t === '.' || !/^\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.min(PERCENTUAL_MAX, Math.max(0, Math.round(n * 100) / 100));
}

/** O que pode aparecer no campo enquanto se digita: dígitos, uma vírgula ou ponto, «%». */
export function textoAceito(texto: string): boolean {
  return /^\s*\d*[.,]?\d*\s*%?\s*$/.test(texto);
}
