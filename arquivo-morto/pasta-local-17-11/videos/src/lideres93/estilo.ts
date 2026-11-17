// Cores, fontes e física do «Líderes que bateram o desafio».
// Tema premiação: azul-noite, ouro de troféu e o verde-limão da blusa de quem
// entregou os cupons.

import { Easing, interpolate, spring } from 'remotion';
import { loadFont as anton } from '@remotion/google-fonts/Anton';
import { loadFont as montserrat } from '@remotion/google-fonts/Montserrat';
import linhaJson from './linha.json';

export type Transicao = 'faixa' | 'zoom' | 'chicote';
export type Corte = { clip: string; de: number; vel: number; ini: number; dur: number };
export type Cena = { n: number; ini: number; dur: number; ganhou: number; cortes: Corte[]; foto: [string, number] };
export type Linha = {
  versao?: string;
  audio?: string;
  fps: number;
  bpm: number;
  B: number;
  abertura: { ini: number; dur: number; clip: string; de: number; vel: number };
  cenas: Cena[];
  final: { ini: number; dur: number };
  transicoes: { q: number; tipo: Transicao }[];
  total: number;
};
export const LINHA = linhaJson as unknown as Linha;
export const FPS = LINHA.fps;
export const B = LINHA.B;

export const F = {
  titulo: anton('normal', { weights: ['400'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  texto: montserrat('normal', { weights: ['600', '800', '900'], subsets: ['latin', 'latin-ext'] }).fontFamily,
};

export const C = {
  noite: '#070b1f',
  azul: '#0f1a4a',
  azulClaro: '#2747c8',
  ouro: '#ffc93c',
  ouroEscuro: '#d48a00',
  ouroClaro: '#fff0b8',
  limao: '#b6e83a',
  branco: '#ffffff',
};

export const OURO_GRAD = 'linear-gradient(135deg, #fff3c4 0%, #ffd34d 28%, #f2a900 55%, #ffe082 78%, #c98400 100%)';

export const SUAVE = Easing.bezier(0.25, 1, 0.5, 1);
export const ACELERA = Easing.bezier(0.5, 0, 0.75, 0);
export const VAI_VOLTA = Easing.bezier(0.65, 0, 0.35, 1);

export function entre(f: number, ini: number, fim: number, de: number, para: number, easing: (t: number) => number = SUAVE) {
  if (fim <= ini) return f >= ini ? para : de;
  return interpolate(f, [ini, fim], [de, para], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

export function mola(f: number, ini: number, cfg: { stiffness?: number; damping?: number; mass?: number } = {}) {
  return spring({ frame: f - ini, fps: FPS, config: { mass: 1, stiffness: 170, damping: 14, ...cfg } });
}

/** Pseudoaleatório fixo por semente: o mesmo quadro sai igual em todo render. */
export function sorte(semente: number) {
  const x = Math.sin(semente * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const dois = (n: number) => String(n).padStart(2, '0');
