/**
 * caldeirao.ts — o caldeirão da cabana do pântano, onde a Bruxa recupera vida.
 *
 * É o bloco do Minecraft (16 × 16 texels, cada texel com `PIXEL_MC` pixels da
 * arte), visto de frente com a boca aparecendo: ferro cinza com o ruído da
 * textura, os quatro pés com o arco no meio, e a Poção de Cura vermelha
 * dentro, borbulhando — como os caldeirões das cabanas de bruxa do jogo, que
 * já vêm com poção.
 *
 * Ele leva tiro como um bloco que alguém está quebrando: a cada acerto
 * treme, e as RACHADURAS de quebra de bloco vão crescendo em dez estágios.
 * Com `PONTOS_CALDEIRAO` acertos ele quebra — a cura acaba.
 */
import { PIXEL_MC, acaso } from './arte';

/** Quantos tiros o caldeirão aguenta. */
export const PONTOS_CALDEIRAO = 18;
const T = 16;
/** A caixa do caldeirão (px da arte), do pé no chão para cima (com a boca). */
export const LARGURA_CALDEIRAO = T * PIXEL_MC;
export const ALTURA_CALDEIRAO = (T + 3) * PIXEL_MC;

const FERRO = ['#3c3c40', '#4a4a50', '#36363a'] as const;
const FERRO_LUZ = '#6a6a72';
const FERRO_SOMBRA = '#232326';
const BORDA = '#7c7c86';
export const COR_CURA = '#f82423';
const CURA_FUNDO = '#a8141a';
const CURA_LUZ = '#ff8a8a';
const RACHADURA = '#101012';

/** Um estágio de quebra (0–9) pela vida que sobra no caldeirão. */
export function estagioDeQuebra(inteiro: number): number {
  return Math.max(0, Math.min(9, Math.floor((1 - inteiro) * 10)));
}

/** Os texels rachados no estágio (fixos: a rachadura só cresce). */
function rachados(estagio: number): Set<number> {
  const s = new Set<number>();
  for (let k = 0; k < 4; k++) {
    let x = 8 + Math.round((acaso(k, 3, 5) - 0.5) * 4);
    let y = 6 + Math.round((acaso(k, 4, 5) - 0.5) * 4);
    for (let p = 0; p < estagio * 1.6; p++) {
      s.add(y * T + x);
      const a = Math.floor(acaso(k, p, 9) * 4);
      x += [1, -1, 0, 0][a] + (k % 2 ? 1 : -1) * (p % 3 === 0 ? 1 : 0);
      y += [0, 0, 1, -1][a];
      x = Math.max(0, Math.min(T - 1, x));
      y = Math.max(0, Math.min(12, y));
    }
  }
  return s;
}

export interface OpcoesCaldeirao {
  /** Relógio (s): as bolhas. */
  t: number;
  /** Quanto falta para quebrar (1 = inteiro). */
  inteiro: number;
  /** Tremor do último tiro (px). */
  tremor: number;
  /** 0–1 enquanto nasce (sobe do chão) ou some. */
  aparecendo: number;
}

/** Desenha o caldeirão com o pé em (`cx`, `chao`). */
export function desenharCaldeirao(c: CanvasRenderingContext2D, cx: number, chao: number, o: OpcoesCaldeirao): void {
  const P = PIXEL_MC;
  const x0 = Math.round(cx - (T * P) / 2 + (o.tremor ? (Math.random() < 0.5 ? -1 : 1) * Math.min(2, o.tremor) : 0));
  // Nasce subindo do chão: o que estaria abaixo dele não aparece.
  const sobe = Math.round((1 - o.aparecendo) * ALTURA_CALDEIRAO);
  const topo = chao - T * P + sobe;
  const texel = (x: number, y: number, cor: string) => {
    const py = topo + y * P;
    if (py >= chao) return;
    c.fillStyle = cor;
    c.fillRect(x0 + x * P, py, P, Math.min(P, chao - py));
  };
  const quebra = rachados(estagioDeQuebra(o.inteiro));

  // A boca, vista de cima: a borda e a poção dentro (3 texels acima do bloco).
  for (let y = -3; y < 0; y++) {
    for (let x = 0; x < T; x++) {
      const borda = x <= 1 || x >= T - 2 || y === -3;
      if (borda) texel(x, y, y === -3 || x <= 1 ? BORDA : FERRO_LUZ);
      else {
        const brilho = Math.floor((o.t * 10 + x * 1.3) % 11) === 0;
        texel(x, y, y === -2 ? (brilho ? CURA_LUZ : COR_CURA) : CURA_FUNDO);
      }
    }
  }
  // O bloco de frente: ferro com ruído, aro no alto, pés com o arco no meio.
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      if (y >= 13 && x >= 4 && x <= 11) continue;
      if (y >= 12 && y < 13 && x >= 5 && x <= 10) { texel(x, y, FERRO_SOMBRA); continue; }
      let cor: string = FERRO[Math.floor(acaso(x, y, 21) * FERRO.length)];
      if (y === 0) cor = FERRO_LUZ;
      else if (y === 1) cor = FERRO_SOMBRA;
      else if (x === 0) cor = FERRO_LUZ;
      else if (x === T - 1) cor = FERRO_SOMBRA;
      if (quebra.has(y * T + x)) cor = RACHADURA;
      texel(x, y, cor);
    }
  }
  // As bolhas: sobem um pouco da boca e estouram.
  for (let i = 0; i < 5; i++) {
    const fase = (o.t * 1.3 + i * 0.37) % 1;
    const bx = x0 + (3 + ((i * 5) % 10)) * P;
    const by = topo - 2 * P - Math.floor(fase * 7) * P;
    if (by + P > chao) continue;
    if (fase < 0.8) { c.fillStyle = i % 2 ? CURA_LUZ : COR_CURA; c.fillRect(bx, by, P, P); }
    else {
      c.fillStyle = CURA_LUZ;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.fillRect(bx + dx * P, by + dy * P, P, P);
    }
  }
}
