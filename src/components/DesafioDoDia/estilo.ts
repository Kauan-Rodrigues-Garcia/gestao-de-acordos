/**
 * A cor do desafio do dia.
 *
 * São os MESMOS seis acentos da campanha (`ACENTOS_DISPONIVEIS`), com as peças
 * que a barra superior e o anel pedem a mais: o traço do anel (`currentColor`),
 * o brilho em volta da pílula e o fundo do Hero. Nenhum hexadecimal: a paleta do
 * Tailwind, que acompanha o tema claro e o escuro sozinha.
 */
import type { AcentoDesafio } from '@/services/desafios/types';

export interface EstiloDoDia {
  /** Texto de destaque — o número da contagem. */
  texto: string;
  /** Cor do traço do anel e da barra (via `currentColor`). */
  traco: string;
  /** Preenchimento de barra. */
  barra: string;
  /** Fundo suave de selo e de pílula. */
  suave: string;
  borda: string;
  /** Gradiente do Hero do painel. */
  hero: string;
  /** Anel de brilho da pílula quando entra dinheiro. */
  brilho: string;
}

const ESTILOS: Record<AcentoDesafio, EstiloDoDia> = {
  ambar: {
    texto: 'text-amber-600 dark:text-amber-400',
    traco: 'text-amber-500',
    barra: 'bg-gradient-to-r from-amber-400 to-orange-500',
    suave: 'bg-amber-500/10',
    borda: 'border-amber-500/35',
    hero:  'from-amber-500/20 via-orange-500/5 to-card',
    brilho: 'ring-amber-400/60 shadow-amber-500/30',
  },
  violeta: {
    texto: 'text-violet-600 dark:text-violet-400',
    traco: 'text-violet-500',
    barra: 'bg-gradient-to-r from-violet-400 to-fuchsia-500',
    suave: 'bg-violet-500/10',
    borda: 'border-violet-500/35',
    hero:  'from-violet-500/20 via-fuchsia-500/5 to-card',
    brilho: 'ring-violet-400/60 shadow-violet-500/30',
  },
  esmeralda: {
    texto: 'text-emerald-600 dark:text-emerald-400',
    traco: 'text-emerald-500',
    barra: 'bg-gradient-to-r from-emerald-400 to-teal-500',
    suave: 'bg-emerald-500/10',
    borda: 'border-emerald-500/35',
    hero:  'from-emerald-500/20 via-teal-500/5 to-card',
    brilho: 'ring-emerald-400/60 shadow-emerald-500/30',
  },
  rosa: {
    texto: 'text-rose-600 dark:text-rose-400',
    traco: 'text-rose-500',
    barra: 'bg-gradient-to-r from-rose-400 to-pink-500',
    suave: 'bg-rose-500/10',
    borda: 'border-rose-500/35',
    hero:  'from-rose-500/20 via-pink-500/5 to-card',
    brilho: 'ring-rose-400/60 shadow-rose-500/30',
  },
  azul: {
    texto: 'text-sky-600 dark:text-sky-400',
    traco: 'text-sky-500',
    barra: 'bg-gradient-to-r from-sky-400 to-indigo-500',
    suave: 'bg-sky-500/10',
    borda: 'border-sky-500/35',
    hero:  'from-sky-500/20 via-indigo-500/5 to-card',
    brilho: 'ring-sky-400/60 shadow-sky-500/30',
  },
  laranja: {
    texto: 'text-orange-600 dark:text-orange-400',
    traco: 'text-orange-500',
    barra: 'bg-gradient-to-r from-orange-400 to-red-500',
    suave: 'bg-orange-500/10',
    borda: 'border-orange-500/35',
    hero:  'from-orange-500/20 via-red-500/5 to-card',
    brilho: 'ring-orange-400/60 shadow-orange-500/30',
  },
};

/** Batido, o desafio fica verde-vitória, qualquer que seja a cor escolhida. */
export const ESTILO_BATIDO: EstiloDoDia = ESTILOS.esmeralda;

export function estiloDoDia(acento: AcentoDesafio | null | undefined): EstiloDoDia {
  return ESTILOS[acento ?? 'ambar'] ?? ESTILOS.ambar;
}
