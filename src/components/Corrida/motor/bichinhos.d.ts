/** O contrato de `bichinhos.js` (JavaScript puro, ver o cabeçalho de lá). */

export interface Estilo {
  modelo: string;
  cor: string;
  acessorio: string;
}

export interface OpcoesDesenho {
  expr?: 'normal' | 'feliz' | 'medo' | 'tonta' | 'grudada' | 'sono';
  /** Para onde os olhos olham (-1..1). */
  lx?: number;
  ly?: number;
  /** Tempo, em segundos: mexe asas, orelhas, tentáculos. */
  t?: number;
  pisca?: boolean;
  /** Inclinação, em radianos. */
  inc?: number;
}

export const CALMO: boolean;
export const CORES: ReadonlyArray<readonly [string, string]>;
export const MODELOS: ReadonlyArray<readonly [string, string]>;
export const ACESSORIOS: ReadonlyArray<readonly [string, string, string]>;

export function descreve(est: Estilo): { modelo: string; cor: string; acessorio: string };
export function desenhaBichinho(c: CanvasRenderingContext2D, x: number, y: number, r: number, est: Estilo, opcoes: OpcoesDesenho): void;
export function altoDemais(est: Estilo): boolean;
/** Uma miniatura (data URL) do bichinho. */
export function thumb(est: Estilo, tamanho: number, expr?: OpcoesDesenho['expr']): string;
export function mulberry32(semente: number): () => number;
export function hashStr(s: string): number;
export function tresBichinhos(rng: () => number): [Estilo, Estilo, Estilo];
/** Os três bichinhos que a pessoa pode escolher nesta corrida. */
export function opcoesDe(corridaId: number, usuario: string): [Estilo, Estilo, Estilo];
/** O bichinho que corre: o escolhido, ou um dos três (sempre o mesmo) se a pessoa não escolheu. */
export function bichinhoDe(corridaId: number, usuario: string, escolha: number | null | undefined): Estilo;
export function rgba(hex: string, alfa: number): string;
export function tom(hex: string, quanto: number): string;
