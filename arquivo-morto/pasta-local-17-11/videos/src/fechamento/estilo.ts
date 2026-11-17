// Cores, fontes e física do «Entre Metas e Risadas». Tema cinema: veludo
// vermelho, letreiro dourado, polaroid creme, grão de película.

import { Easing, interpolate, spring } from 'remotion';
import { loadFont as anton } from '@remotion/google-fonts/Anton';
import { loadFont as pacifico } from '@remotion/google-fonts/Pacifico';
import { loadFont as caveat } from '@remotion/google-fonts/Caveat';
import { loadFont as marcador } from '@remotion/google-fonts/PermanentMarker';
import { loadFont as serifa } from '@remotion/google-fonts/DMSerifDisplay';
import { FPS } from './tempo';

export const F = {
  letreiro: anton('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  script: pacifico('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  mao: caveat('normal', { weights: ['700'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  giz: marcador('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily,
  serifa: serifa('italic', { weights: ['400'], subsets: ['latin', 'latin-ext'] }).fontFamily,
};

export const C = {
  noite: '#0d0709',
  veludo: '#8e1022',
  veludoEscuro: '#3a050d',
  ouro: '#f5c451',
  ouroClaro: '#ffe3a1',
  creme: '#fbf3e2',
  tinta: '#1d1a2b',
};

export const SUAVE = Easing.bezier(0.25, 1, 0.5, 1);
export const ACELERA = Easing.bezier(0.5, 0, 0.75, 0);
export const VAI_VOLTA = Easing.bezier(0.65, 0, 0.35, 1);

export function entre(f: number, ini: number, fim: number, de: number, para: number, easing: (t: number) => number = SUAVE) {
  if (fim <= ini) return f >= ini ? para : de;
  return interpolate(f, [ini, fim], [de, para], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

/** Mola com um pouco de sobra (passa ~4% e assenta). */
export function mola(f: number, ini: number, cfg: { stiffness?: number; damping?: number; mass?: number } = {}) {
  return spring({ frame: f - ini, fps: FPS, config: { mass: 1, stiffness: 160, damping: 15, ...cfg } });
}

/** Pseudoaleatório fixo por semente: o mesmo quadro sai igual em todo render. */
export function sorte(semente: number) {
  const x = Math.sin(semente * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
