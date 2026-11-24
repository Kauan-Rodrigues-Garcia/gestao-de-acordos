/**
 * pixRankingPodio.ts — as cores do pódio do ranking Pix, para operadores e
 * para equipes. Num lugar só para o 1º da equipe e o 1º do operador terem a
 * mesma cara: a hierarquia é lida pelo tamanho antes da cor, e a cor tem de
 * significar a mesma coisa nos dois modos.
 *
 * Do 4º em diante, tudo neutro de propósito.
 */
export const PODIO: Record<number, {
  /** Aro em volta da foto/ícone — é o que diz o lugar quando o rosto ocupa o disco. */
  anel: string;
  barra: string; texto: string; cartao: string;
}> = {
  1: {
    anel:   'ring-2 ring-amber-500/70',
    barra:  'bg-gradient-to-r from-amber-500 to-amber-300',
    texto:  'text-amber-500 dark:text-amber-300',
    cartao: 'border-amber-500/45 bg-gradient-to-br from-amber-500/[0.14] to-amber-500/[0.03] shadow-[0_0_28px_-12px_rgb(245_158_11_/_0.55)]',
  },
  2: {
    anel:   'ring-2 ring-slate-400/60',
    barra:  'bg-slate-400',
    texto:  'text-slate-500 dark:text-slate-300',
    cartao: 'border-slate-400/30 bg-slate-400/[0.06]',
  },
  3: {
    anel:   'ring-2 ring-orange-500/60',
    barra:  'bg-orange-500',
    texto:  'text-orange-600 dark:text-orange-400',
    cartao: 'border-orange-600/30 bg-orange-600/[0.06]',
  },
};

/** Lê `localStorage` sem derrubar a aba na navegação privada. */
export function lido(chave: string): string | null {
  try { return window.localStorage.getItem(chave); } catch { return null; }
}
export function grava(chave: string, valor: string): void {
  try { window.localStorage.setItem(chave, valor); } catch { /* modo privado */ }
}
