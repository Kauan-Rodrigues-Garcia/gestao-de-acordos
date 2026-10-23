export interface Qualidade {
  /** 0 leve, 1 normal, 2 forte. */
  readonly nivel: 0 | 1 | 2;
  /** O intervalo (ms) desde o último quadro e o quanto ele levou para ser feito (ms). */
  quadro(intervalo: number, gasto?: number, escondida?: boolean): void;
  aoMudar(f: (nivel: 0 | 1 | 2) => void): () => void;
}
export function nivelDoAparelho(nav?: { hardwareConcurrency?: number; deviceMemory?: number }): 0 | 1 | 2;
export function criarQualidade(o?: { leve?: boolean; inicio?: number }): Qualidade;
