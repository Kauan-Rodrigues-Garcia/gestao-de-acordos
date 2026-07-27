/**
 * corStatus.ts — classificação PAGO/PENDENTE pela cor de preenchimento real das
 * células (ExcelJS: fill.fgColor argb OU theme+tint).
 *
 * Calibrado com os arquivos reais (Luciana/Bryan/Matheus):
 *   PAGO     = tema 9 tint ~0.60  (≈ #C6E0B4)
 *   PENDENTE = tema 4 tint ~0.80  (≈ #D9E2F3), branco puro ou sem preenchimento
 *
 * A coluna Super NÃO entra na decisão (fica azul nas duas situações). O status
 * da linha é o preenchimento predominante entre Data e Meta batida-Pendente.
 */

import type { StatusCor } from './types';

/** Cor de UMA célula: 'PAGO' | 'PENDENTE' | 'OUTRO'. */
export type CorCelula = 'PAGO' | 'PENDENTE' | 'OUTRO';

/** Estrutura mínima de fill que consumimos do ExcelJS (evita depender do tipo). */
export interface FillLike {
  type?: string;
  fgColor?: { argb?: string; theme?: number; tint?: number };
}

function argbHex(argb?: string): string {
  return (argb ?? '').toUpperCase().replace(/^FF/, '');
}

function pertoDe(a: number | undefined, alvo: number, tol = 0.05): boolean {
  return a !== undefined && Math.abs(a - alvo) <= tol;
}

/** Classifica a cor de uma célula. */
export function corDaCelula(fill: FillLike | null | undefined): CorCelula {
  if (!fill || fill.type !== 'pattern' || !fill.fgColor) return 'PENDENTE'; // sem fill = pendente
  const fg = fill.fgColor;
  const hex = argbHex(fg.argb);

  // Verde (pago)
  if (hex === 'C6E0B4') return 'PAGO';
  if (fg.theme === 9 && pertoDe(fg.tint, 0.60)) return 'PAGO';

  // Azul claro (pendente) / branco
  if (hex === 'D9E2F3' || hex === 'FFFFFF' || hex === '') return 'PENDENTE';
  if (fg.theme === 4 && pertoDe(fg.tint, 0.80)) return 'PENDENTE';

  // Tema 4 com outros tints (ex.: 0.40 da coluna Super) não decide → OUTRO
  return 'OUTRO';
}

/**
 * Status da linha pelo preenchimento predominante das células informadas
 * (já deve vir SEM a coluna Super). Empate real ou conflito claro → 'CONFLITO'.
 */
export function statusDaLinha(fills: Array<FillLike | null | undefined>): StatusCor {
  let pago = 0, pend = 0;
  for (const f of fills) {
    const c = corDaCelula(f);
    if (c === 'PAGO') pago++;
    else if (c === 'PENDENTE') pend++;
    // 'OUTRO' (amarelo isolado, super) não conta para a decisão
  }
  // "outro" (amarelo isolado, super) não conta para a decisão
  if (pago === 0 && pend === 0) return 'CONFLITO';
  if (pago > 0 && pend > 0) {
    // predominância clara (≥70%) resolve; senão, revisão
    const total = pago + pend;
    if (pago / total >= 0.7) return 'PAGO';
    if (pend / total >= 0.7) return 'PENDENTE';
    return 'CONFLITO';
  }
  return pago > pend ? 'PAGO' : 'PENDENTE';
}
