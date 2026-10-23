/** O Cavalo da Guerra em pixel art (ver o cabeçalho de `cavaloDaGuerra.js`). Só o que o TypeScript usa. */
export const CW: number;
export const CH: number;
export const CCHAO: number;
export const CMEIO: number;
export const CPIV: number;
export const MARGEM_ALTO: number;
export const MARGEM_TRAS: number;
export const EXTENSAO: { tras: number; frente: number; alto: number };
export interface Destino { cv: HTMLCanvasElement; cx: CanvasRenderingContext2D; img: ImageData; g: Uint8Array; d: Uint8Array; I: Float32Array }
export interface Pose {
  t?: number; modo?: 'parado' | 'anda' | 'galope' | 'empina'; p?: number; by?: number; cab?: number; jaw?: number;
  furia?: number; flash?: number; feridas?: { x: number; y: number; r: number }[]; num?: string | number; espelho?: boolean;
}
export const CAVALEIROS: Record<'guerra' | 'peste' | 'fome' | 'morte', unknown>;
export function criarDestino(): Destino;
export function construirCavalo(o: Pose, cav: unknown, dest: Pick<Destino, 'g' | 'd' | 'I' | 'img' | 'cx'> & { cv?: HTMLCanvasElement | null }): HTMLCanvasElement;
