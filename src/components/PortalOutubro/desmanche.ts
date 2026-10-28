/**
 * desmanche.ts — uma imagem desmanchando como a Coisa (`cinzas.ts`): a borda
 * anda das origens para fora, irregular (o ruído), acendendo em brasa um
 * pouco antes de soltar; cada pixel que solta vira lasca e sobe.
 *
 * A borda escurece para carvão e só a beira acende — a pele queimada do
 * filme, não um incêndio.
 *
 * Serve à tela do Gestão às 16h (`TelaQueDesmancha.tsx`) e ao mural quando a
 * Coisa chega (`coisa/ACoisa.tsx`). Puro: recebe os pixels e devolve o
 * quadro, sem DOM — os testes rodam sem navegador.
 */
import { Cinzas, acender, ruido } from './cinzas';
import { sorteador } from './acaso';

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface OpcoesDoDesmanche {
  /** De onde começa (em pixels da imagem). */
  origens: readonly (readonly [number, number])[];
  /** Quanto a borda leva para atravessar tudo (segundos). */
  duracaoS: number;
  semente?: number;
  /** Quanto dos pixels vira lasca (o resto some na hora). Máquina fraca: menos. */
  densidade?: number;
  /** O lado da lasca em pixels (2 = lascas maiores, e menos delas). */
  tamDaLasca?: number;
  /** Quanto o ruído entorta a borda (0 = círculo perfeito). */
  pesoDoRuido?: number;
}

/** A faixa acesa logo antes da borda, na mesma medida do progresso (0 a 1). */
const FAIXA_ACESA = 0.018;
const BALDES = 4096;
const MAX_LASCAS = 80_000;

export class Desmanche {
  readonly largura: number;
  readonly altura: number;
  /** O quadro pronto para pintar (RGBA, `largura × altura`). */
  readonly quadro: Uint8ClampedArray<ArrayBuffer>;
  private readonly restante: Uint8ClampedArray;
  /** Os pixels que têm cor, na ordem em que soltam. */
  private readonly ordem: Uint32Array;
  /** O limiar de cada um, na mesma ordem. */
  private readonly limiar: Float32Array;
  private readonly cinzas: Cinzas;
  private readonly acaso: () => number;
  private readonly densidade: number;
  private readonly duracaoS: number;
  private proximo = 0;
  private progresso = 0;

  constructor(base: Pixels, op: OpcoesDoDesmanche) {
    const w = base.width, h = base.height;
    this.largura = w;
    this.altura = h;
    this.restante = new Uint8ClampedArray(base.data);
    this.quadro = new Uint8ClampedArray(base.data.length);
    this.acaso = sorteador(op.semente ?? 1962);
    this.densidade = op.densidade ?? 0.7;
    this.duracaoS = op.duracaoS;
    const peso = op.pesoDoRuido ?? 0.35;
    const grao = Math.max(w, h) / 9;
    const origens = op.origens.length ? op.origens : [[w / 2, h / 2] as const];
    const diagonal = Math.hypot(w, h);

    // O limiar de cada pixel: perto da origem solta antes; o ruído entorta.
    const bruto = new Float32Array(w * h);
    let maior = 0, comCor = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (this.restante[i * 4 + 3] === 0) { bruto[i] = -1; continue; }
        let d = Infinity;
        for (const [ox, oy] of origens) d = Math.min(d, Math.hypot(x - ox, y - oy));
        const v = (d / diagonal) * (1 - peso) + ruido(x / grao, y / grao, op.semente ?? 1962) * peso;
        bruto[i] = v;
        if (v > maior) maior = v;
        comCor++;
      }
    }
    // Em ordem por baldes (a conta de ordenar 100 mil números com função pesa).
    const conta = new Uint32Array(BALDES + 1);
    const balde = (v: number) => Math.min(BALDES - 1, Math.floor((v / (maior || 1)) * BALDES));
    for (let i = 0; i < bruto.length; i++) if (bruto[i] >= 0) conta[balde(bruto[i]) + 1]++;
    for (let b = 0; b < BALDES; b++) conta[b + 1] += conta[b];
    this.ordem = new Uint32Array(comCor);
    this.limiar = new Float32Array(comCor);
    for (let i = 0; i < bruto.length; i++) {
      if (bruto[i] < 0) continue;
      const b = balde(bruto[i]);
      const pos = conta[b]++;
      this.ordem[pos] = i;
      this.limiar[pos] = (b + 1) / BALDES;
    }
    this.cinzas = new Cinzas(Math.min(MAX_LASCAS, Math.ceil(comCor * this.densidade) + 16), this.acaso, op.tamDaLasca ?? 1, 0.2);
    this.quadro.set(this.restante);
  }

  /** Quanto da imagem já soltou (0 a 1). */
  get andamento(): number { return this.ordem.length ? this.proximo / this.ordem.length : 1; }

  get terminou(): boolean { return this.proximo >= this.ordem.length && this.cinzas.vivas === 0; }

  /** Anda `dt` segundos e monta o quadro. Devolve `false` quando acabou de vez. */
  passo(dt: number): boolean {
    const w = this.largura;
    this.progresso = Math.min(1, this.progresso + dt / this.duracaoS);
    const p = this.progresso;
    const a = this.acaso;
    while (this.proximo < this.ordem.length && this.limiar[this.proximo] <= p) {
      const i = this.ordem[this.proximo++];
      const o = i * 4;
      if (a() < this.densidade) {
        const cor = (this.restante[o] << 16) | (this.restante[o + 1] << 8) | this.restante[o + 2];
        this.cinzas.soltar({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5, cor });
      }
      this.restante[o + 3] = 0;
    }
    this.cinzas.passo(dt);

    this.quadro.set(this.restante);
    // A faixa que ainda não soltou mas já acende.
    for (let j = this.proximo; j < this.ordem.length && this.limiar[j] <= p + FAIXA_ACESA; j++) {
      const k = 1 - (this.limiar[j] - p) / FAIXA_ACESA;
      acender(this.quadro, this.ordem[j] * 4, k * k);
    }
    this.cinzas.desenhar(this.quadro, w, this.altura);
    return !this.terminou;
  }
}
