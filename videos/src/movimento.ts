// Física do movimento. Nenhum movimento linear: tudo passa por uma destas
// curvas ou pela mola.

import { Easing, interpolate, spring } from 'remotion';

export const FPS = 60;

/** Ease-out elegante: cubic-bezier(0.25, 1, 0.5, 1). Padrão de toda transição. */
export const SUAVE = Easing.bezier(0.25, 1, 0.5, 1);
/** Para o que sai e entra do quadro de uma vez (cursor, câmera). */
export const SUAVE_IDA_VOLTA = Easing.bezier(0.65, 0, 0.35, 1);
/** Para o que acelera saindo (elementos indo embora). */
export const ACELERA = Easing.bezier(0.5, 0, 0.75, 0);

/**
 * Mola com razão de amortecimento ~0,75: passa 2–3% do alvo e assenta.
 * (overshoot = e^(−ζπ/√(1−ζ²)) ≈ 2,8%)
 */
export const MOLA = { mass: 1, stiffness: 170, damping: 19.6, overshootClamping: false };
/** Mola firme, sem sobra — para câmera e coisas grandes. */
export const MOLA_FIRME = { mass: 1, stiffness: 120, damping: 26, overshootClamping: true };

export const s = (segundos: number) => Math.round(segundos * FPS);
export const ms = (milis: number) => Math.round((milis / 1000) * FPS);

export function entre(
  frame: number,
  inicio: number,
  fim: number,
  de: number,
  para: number,
  easing: (t: number) => number = SUAVE,
) {
  if (fim <= inicio) return frame >= inicio ? para : de;
  return interpolate(frame, [inicio, fim], [de, para], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

export function mola(frame: number, inicio: number, config = MOLA) {
  return spring({ frame: frame - inicio, fps: FPS, config });
}

/**
 * Coreografia escalonada: o elemento `indice` entra 40 ms depois do anterior,
 * subindo 18 px enquanto a opacidade vai de 0 a 1.
 */
export function entrada(
  frame: number,
  inicio: number,
  indice = 0,
  { passoMs = 40, deslocY = 18, duracaoMs = 550 }: { passoMs?: number; deslocY?: number; duracaoMs?: number } = {},
): React.CSSProperties {
  const ini = inicio + ms(passoMs * indice);
  const p = entre(frame, ini, ini + ms(duracaoMs), 0, 1);
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * deslocY}px)`,
  };
}

/** Saída rápida: some subindo um pouco, com leve desfoque. */
export function saida(frame: number, inicio: number, duracaoMs = 260): React.CSSProperties {
  const p = entre(frame, inicio, inicio + ms(duracaoMs), 0, 1, ACELERA);
  return {
    opacity: 1 - p,
    transform: `translateY(${-p * 12}px)`,
    filter: p > 0 ? `blur(${p * 4}px)` : undefined,
  };
}

/**
 * Botão físico sendo apertado: 1 → 0,95 → 1,02 → 1 em 150 ms.
 */
export function aperto(frame: number, clique: number) {
  const t = ((frame - clique) / FPS) * 1000;
  if (t < 0 || t > 150) return 1;
  if (t < 50) return 1 - 0.05 * (t / 50);
  if (t < 110) return 0.95 + 0.07 * ((t - 50) / 60);
  return 1.02 - 0.02 * ((t - 110) / 40);
}

/** Desfoque de movimento simulado: 0 parado, até 4 px no pico da velocidade. */
export function desfoque(velocidadePxPorFrame: number, limiar = 6, maximo = 4) {
  const v = Math.abs(velocidadePxPorFrame);
  if (v <= limiar) return 0;
  return Math.min(maximo, 2 + (v - limiar) / 10);
}
