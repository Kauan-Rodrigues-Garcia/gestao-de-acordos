/**
 * cinzas.ts — os pedacinhos que se soltam quando a Coisa desmancha.
 *
 * A referência (pedido de 27/10/2026): no filme, quando ele apanha, a pele
 * descasca em lascas escuras, de borda acesa, que sobem flutuando e apagam
 * em cinza. Cada lasca aqui é um pixel (ou um bloco de 2 × 2) da tela baixa,
 * a que o CSS amplia sem borrar. A maioria sai com a cor que tinha, queima
 * para carvão e some subindo, balançando no ar; uma parte acende em brasa
 * antes de apagar.
 *
 * Tudo em vetores de números (sem um objeto por lasca): são dezenas de
 * milhares ao mesmo tempo quando a tela inteira desmancha.
 *
 * Mais o ruído (`ruido`) que deixa a borda do desmanche irregular.
 */

/** As cores do caminho da lasca: brasa clara, brasa, carvão, cinza. */
const BRASA_CLARA = [255, 196, 92] as const;
const BRASA = [226, 84, 28] as const;
const CARVAO = [30, 20, 18] as const;
const CINZA = [44, 38, 38] as const;

export interface Lasca {
  x: number;
  y: number;
  /** A cor que ela tinha, `0xRRGGBB`. */
  cor: number;
  /** Empurrão inicial (pixels por segundo); sem ele, sobe devagar. */
  vx?: number;
  vy?: number;
  /** Quanto tempo vive (segundos). */
  dura?: number;
}

export class Cinzas {
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vida: Float32Array;
  private readonly dura: Float32Array;
  private readonly fase: Float32Array;
  private readonly cor: Uint32Array;
  private readonly acesa: Uint8Array;
  private n = 0;
  private t = 0;

  /**
   * @param tam      o lado de cada lasca, em pixels da tela baixa (1 ou 2)
   * @param chanceDeBrasa quanto das lascas acende antes de apagar
   */
  constructor(
    readonly capacidade: number,
    private readonly acaso: () => number = Math.random,
    private readonly tam = 1,
    private readonly chanceDeBrasa = 0.35,
  ) {
    this.x = new Float32Array(capacidade);
    this.y = new Float32Array(capacidade);
    this.vx = new Float32Array(capacidade);
    this.vy = new Float32Array(capacidade);
    this.vida = new Float32Array(capacidade);
    this.dura = new Float32Array(capacidade);
    this.fase = new Float32Array(capacidade);
    this.cor = new Uint32Array(capacidade);
    this.acesa = new Uint8Array(capacidade);
  }

  get vivas(): number { return this.n; }

  /** Solta uma lasca. Cheio, a nova fica de fora (as que já sobem não somem do nada). */
  soltar(l: Lasca): void {
    if (this.n >= this.capacidade) return;
    const i = this.n++;
    const a = this.acaso;
    this.x[i] = l.x;
    this.y[i] = l.y;
    this.vx[i] = l.vx ?? (a() - 0.5) * 14;
    this.vy[i] = l.vy ?? -(6 + a() * 22);
    this.vida[i] = 0;
    this.dura[i] = l.dura ?? 1.1 + a() * 1.4;
    this.fase[i] = a() * Math.PI * 2;
    this.cor[i] = l.cor;
    this.acesa[i] = a() < this.chanceDeBrasa ? 1 : 0;
  }

  /** Anda `dt` segundos: sobem (o ar puxa para cima) e balançam. */
  passo(dt: number): void {
    this.t += dt;
    const t = this.t;
    let i = 0;
    while (i < this.n) {
      this.vida[i] += dt;
      if (this.vida[i] >= this.dura[i]) {
        // Tira trocando pela última: a ordem não importa.
        const u = --this.n;
        this.x[i] = this.x[u]; this.y[i] = this.y[u];
        this.vx[i] = this.vx[u]; this.vy[i] = this.vy[u];
        this.vida[i] = this.vida[u]; this.dura[i] = this.dura[u];
        this.fase[i] = this.fase[u]; this.cor[i] = this.cor[u]; this.acesa[i] = this.acesa[u];
        continue;
      }
      this.vy[i] -= 26 * dt;
      this.vx[i] += Math.sin(this.y[i] * 0.09 + t * 2.3 + this.fase[i]) * 34 * dt;
      this.vx[i] *= 1 - 0.8 * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      i++;
    }
  }

  /** Pinta cada lasca viva por cima de `buf` (RGBA, `w × h`). */
  desenhar(buf: Uint8ClampedArray, w: number, h: number): void {
    const tam = this.tam;
    for (let i = 0; i < this.n; i++) {
      const px = this.x[i] | 0, py = this.y[i] | 0;
      if (px < 0 || py < 0 || px + tam > w || py + tam > h) continue;
      const f = this.vida[i] / this.dura[i];
      const c = this.cor[i];
      const r0 = (c >> 16) & 255, g0 = (c >> 8) & 255, b0 = c & 255;
      let r: number, g: number, b: number, alfa = 1;
      if (this.acesa[i]) {
        // A que acende: a cor dela, brasa clara, brasa, cinza.
        if (f < 0.12) {
          const k = f / 0.12;
          r = mistura(r0, BRASA_CLARA[0], k); g = mistura(g0, BRASA_CLARA[1], k); b = mistura(b0, BRASA_CLARA[2], k);
        } else if (f < 0.4) {
          const k = (f - 0.12) / 0.28;
          r = mistura(BRASA_CLARA[0], BRASA[0], k); g = mistura(BRASA_CLARA[1], BRASA[1], k); b = mistura(BRASA_CLARA[2], BRASA[2], k);
        } else {
          const k = (f - 0.4) / 0.6;
          r = mistura(BRASA[0], CINZA[0], k); g = mistura(BRASA[1], CINZA[1], k); b = mistura(BRASA[2], CINZA[2], k);
          alfa = 1 - k * k;
        }
      } else if (f < 0.3) {
        // A que só queima: a cor dela escurecendo para carvão.
        const k = f / 0.3;
        r = mistura(r0, CARVAO[0], k); g = mistura(g0, CARVAO[1], k); b = mistura(b0, CARVAO[2], k);
      } else {
        const k = (f - 0.3) / 0.7;
        r = mistura(CARVAO[0], CINZA[0], k); g = mistura(CARVAO[1], CINZA[1], k); b = mistura(CARVAO[2], CINZA[2], k);
        alfa = 1 - k * k;
      }
      for (let dy = 0; dy < tam; dy++) {
        for (let dx = 0; dx < tam; dx++) pintarPor(buf, ((py + dy) * w + px + dx) * 4, r, g, b, alfa);
      }
    }
  }
}

function mistura(a: number, b: number, k: number): number { return a + (b - a) * k; }

/**
 * A borda do desmanche num pixel que ainda não soltou (`k` de 0 a 1, 1 = vai
 * soltar agora): primeiro escurece para carvão, e bem na beira acende.
 */
export function acender(buf: Uint8ClampedArray, o: number, k: number): void {
  if (k < 0.7) {
    const q = (k / 0.7) * 0.85;
    buf[o] = mistura(buf[o], CARVAO[0], q);
    buf[o + 1] = mistura(buf[o + 1], CARVAO[1], q);
    buf[o + 2] = mistura(buf[o + 2], CARVAO[2], q);
    return;
  }
  const q = (k - 0.7) / 0.3;
  const alvo = q > 0.5 ? BRASA_CLARA : BRASA;
  buf[o] = mistura(CARVAO[0], alvo[0], Math.min(1, q * 1.6));
  buf[o + 1] = mistura(CARVAO[1], alvo[1], Math.min(1, q * 1.6));
  buf[o + 2] = mistura(CARVAO[2], alvo[2], Math.min(1, q * 1.6));
}

/** Uma cor com transparência por cima do que já está em `buf` (RGBA sem pré-multiplicar). */
export function pintarPor(buf: Uint8ClampedArray, o: number, r: number, g: number, b: number, alfa: number): void {
  const fa = buf[o + 3] / 255;
  const sai = alfa + fa * (1 - alfa);
  if (sai <= 0) return;
  const resto = fa * (1 - alfa);
  buf[o] = (r * alfa + buf[o] * resto) / sai;
  buf[o + 1] = (g * alfa + buf[o + 1] * resto) / sai;
  buf[o + 2] = (b * alfa + buf[o + 2] * resto) / sai;
  buf[o + 3] = sai * 255;
}

// ── O ruído ─────────────────────────────────────────────────────────────────

function hash(x: number, y: number, semente: number): number {
  let h = (x * 374761393 + y * 668265263 + semente * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function suave(x: number, y: number, semente: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, semente), b = hash(x0 + 1, y0, semente);
  const c = hash(x0, y0 + 1, semente), d = hash(x0 + 1, y0 + 1, semente);
  return mistura(mistura(a, b, sx), mistura(c, d, sx), sy);
}

/** Ruído de 0 a 1, liso, em três camadas (a borda irregular do desmanche). */
export function ruido(x: number, y: number, semente = 1): number {
  return (suave(x, y, semente) * 0.55 + suave(x * 2.1, y * 2.1, semente + 7) * 0.3 + suave(x * 4.3, y * 4.3, semente + 13) * 0.15);
}
