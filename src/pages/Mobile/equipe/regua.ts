/**
 * A régua da tela da equipe — as contas de posição e cor, sem desenho.
 * O desenho (`Regua`, `EscalaRegua`) está em `partes.tsx`.
 */
import type { QuartilConfig } from '@/lib/supabase';

/** Cor do quartil — os tons do protótipo v2, na ordem do site (1º verde … 4º vermelho). */
export function corDoQuartil(quartil: number | null | undefined): string {
  switch (quartil) {
    case 1: return 'var(--e-q1)';
    case 2: return 'var(--e-q2)';
    case 3: return 'var(--e-q3)';
    case 4: return 'var(--e-q4)';
    default: return 'var(--e-grafite)';
  }
}

/** Até onde vai a régua de uma pessoa: 130% do esperado — sobra espaço para quem passou. */
export const ESCALA_REGUA = 130;

/** As marcas da régua: as faixas da aba Metas (sem a de 0%). */
export function marcasDosQuartis(quartis: QuartilConfig[]): number[] {
  return quartis.map(q => q.min_pct).filter(p => p > 0 && p < ESCALA_REGUA).sort((a, b) => a - b);
}
