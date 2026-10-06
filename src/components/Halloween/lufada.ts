/**
 * lufada.ts — as lufadas de fumaça (ruído fractal), feitas uma vez e reusadas
 * a cada quadro: a névoa do Analítico (`Fumaca`).
 */

// ── Lufada ────────────────────────────────────────────────────────────────────

/**
 * Ruído de valor com interpolação suave, em oitavas: é o que dá à fumaça os
 * fiapos e buracos irregulares que um gradiente redondo não tem.
 */
export function ruidoFractal(tam: number, oitavas: number[]): Float32Array {
  const saida = new Float32Array(tam * tam);
  let pesoTotal = 0;
  oitavas.forEach((celulas, k) => {
    const peso = 1 / (k + 1);
    pesoTotal += peso;
    const grade = Array.from({ length: (celulas + 1) * (celulas + 1) }, () => Math.random());
    const v = (gx: number, gy: number) => grade[(gy % (celulas + 1)) * (celulas + 1) + (gx % (celulas + 1))];
    const suave = (t: number) => t * t * (3 - 2 * t);
    for (let y = 0; y < tam; y++) {
      const fy = (y / tam) * celulas, y0 = Math.floor(fy), ty = suave(fy - y0);
      for (let x = 0; x < tam; x++) {
        const fx = (x / tam) * celulas, x0 = Math.floor(fx), tx = suave(fx - x0);
        const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
        const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
        saida[y * tam + x] += (a + (b - a) * ty) * peso;
      }
    }
  });
  for (let i = 0; i < saida.length; i++) saida[i] /= pesoTotal;
  return saida;
}

/** Uma lufada pronta, numa cor: ruído fractal apagado nas bordas. */
export function desenharLufada(tam: number, r: number, g: number, b: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const cx = c.getContext('2d');
  if (!cx) return c;
  const ruido = ruidoFractal(tam, [3, 6, 12, 24]);
  const img = cx.createImageData(tam, tam);
  const meio = tam / 2;
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const d = Math.hypot(x - meio, y - meio) / meio;
      // Borda que some devagar; dentro, só o que passa do limiar do ruído vira fumaça.
      const borda = Math.max(0, 1 - d);
      const n = Math.max(0, ruido[y * tam + x] - 0.38) / 0.62;
      const a = Math.pow(n, 1.6) * borda * borda;
      const k = (y * tam + x) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b;
      img.data[k + 3] = Math.round(Math.min(1, a * 1.6) * 255);
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}
