export const DURACAO_VALOR_ANIMADO = 900;

/** easeInOutCubic: começa devagar, acelera no meio e desacelera no final. */
export function suavizarValorAnimado(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
