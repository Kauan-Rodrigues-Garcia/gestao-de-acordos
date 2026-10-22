/** O contrato de `simulacao.js` (JavaScript puro, ver o cabeçalho de lá). */

/** Uma corrida simulada: o que a gravação leva e cada tela reproduz. */
export interface CorridaCavalos {
  seed: number;
  /** A «personalidade» da corrida: normal, pelotão, virada, disparada ou duelo (os dois da frente, na reta final). */
  tipo: string;
  /** Quantos cavalos (um por raia, na ordem da `faixa`). */
  n: number;
  /** Quantos quadros de 1/30 s. */
  frames: number;
  /** Posição de cada cavalo a cada quadro, em quartos de pixel desde a largada: X[quadro * n + raia]. */
  X: Int16Array;
  /** O segundo em que cada raia cruzou a chegada. */
  fin: number[];
  /** As raias na ordem de chegada. */
  ordem: number[];
  /** Onde estão as barreiras, no mundo. */
  barreiras: number[];
  /** bate[raia][barreira]: quem derruba a vara de cima. */
  bate: boolean[][];
  /** A raia que venceu. */
  vencedor: number;
  tVenc: number;
  /** Segundos entre o 1º e o 2º. */
  gap: number;
  apertada: boolean;
  /** Duração da gravação, em segundos. */
  dur: number;
}

export const X0: number;
export const DIST: number;
export const L: number;
export const METROS: number;
export const PXM: number;
export const FPS: number;
export const T2: number;
export function clamp(v: number, a: number, b: number): number;
export function suave(t: number): number;
export function rng(seed: number): () => number;
export const BARREIRAS_EM: number[];
export const CHANCE_BATER: number;
export const TOMBO: number;
export const TOMBO_PX: number;
export const OB_K: number;
export const OB_Y0: number;
export const OB_Y1: number;
export const OB_GEO: { k: number; y0: number; y1: number };
export function desvioRaia(i: number, n: number): number;
export const SALTO0: number;
export const SALTO1: number;
export const SALTO_ALT: number;
export const SALTO_BATE: number;
export const SALTO_Q: number;
export const RECUP: number;
export const RECUP_PX: number;
export function pouso(d: number): number;
/** Simula a corrida inteira: a mesma semente e o mesmo `n` dão a mesma corrida. */
export function simular(seed: number, n: number): CorridaCavalos;
