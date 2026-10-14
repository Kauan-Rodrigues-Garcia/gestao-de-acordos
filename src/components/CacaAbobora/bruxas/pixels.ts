/**
 * pixels.ts — as bruxas prontas para o canvas, guardadas: monta uma vez,
 * pinta sempre.
 *
 * Tudo vira um canvas pequeno, do tamanho do sprite (um pixel por pixel da
 * arte). Quem desenha faz `drawImage` em posição INTEIRA num palco de baixa
 * resolução que o CSS amplia com `image-rendering: pixelated`: nada borra.
 *
 * Os giros também são em pixel de verdade: o recorte é girado por amostragem
 * do pixel mais perto, em passos de 15° (`PASSO_ANGULO`), e guardado. O canvas
 * nunca gira nada sozinho (giro do canvas suaviza a borda).
 */
import { ALTURA, LARGURA, QUADROS, montarQuadro, type Bruxa, type Imagem, type Miniatura } from './arte';
import { PASSO_ANGULO, type Recorte } from './queda';
import { cor32 } from '../fisica';

function novoCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function pintarPixels(c: HTMLCanvasElement, px: Uint32Array, w: number, h: number): void {
  const ctx = c.getContext('2d');
  if (!ctx || w * h === 0) return;
  const img = new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer, 0, w * h * 4), w, h);
  ctx.putImageData(img, 0, 0);
}

export function canvasDaImagem(img: Imagem, espelhar: boolean): HTMLCanvasElement {
  const px = new Uint32Array(img.largura * img.altura);
  for (let j = 0; j < img.altura; j++) for (let i = 0; i < img.largura; i++) {
    const c = img.cores[j * img.largura + i];
    if (c) px[j * img.largura + (espelhar ? img.largura - 1 - i : i)] = cor32(c);
  }
  const c = novoCanvas(img.largura, img.altura);
  pintarPixels(c, px, img.largura, img.altura);
  return c;
}

export interface QuadrosDaBruxa {
  /** [quadro] — virada para a direita e para a esquerda. */
  direita: HTMLCanvasElement[];
  esquerda: HTMLCanvasElement[];
  /** O mapa de peças de cada quadro (para o tiro). */
  imagens: Imagem[];
}

const cacheQuadros = new Map<string, QuadrosDaBruxa>();

export function quadrosDa(b: Bruxa, semChapeu: boolean): QuadrosDaBruxa {
  const chave = `${b.id}:${semChapeu}`;
  let q = cacheQuadros.get(chave);
  if (!q) {
    const imagens = QUADROS.map((_, i) => montarQuadro(b, i, { semChapeu }));
    q = { imagens, direita: imagens.map(i => canvasDaImagem(i, false)), esquerda: imagens.map(i => canvasDaImagem(i, true)) };
    cacheQuadros.set(chave, q);
  }
  return q;
}

/** O ícone da bruxa parada (para o painel). */
export function retrato(b: Bruxa): HTMLCanvasElement {
  return quadrosDa(b, false).direita[0];
}

const cacheMini = new Map<Miniatura, HTMLCanvasElement[]>();

/** Um desenho pequeno (o morcego), virado para os dois lados. */
export function miniatura(m: Miniatura): HTMLCanvasElement[] {
  let c = cacheMini.get(m);
  if (!c) {
    const w = m.linhas[0].length, h = m.linhas.length;
    const img: Imagem = { largura: w, altura: h, cores: new Array(w * h).fill(null), partes: new Uint8Array(w * h) };
    m.linhas.forEach((l, j) => [...l].forEach((ch, i) => { if (ch !== '.') img.cores[j * w + i] = m.cores[ch]; }));
    c = [canvasDaImagem(img, false), canvasDaImagem(img, true)];
    cacheMini.set(m, c);
  }
  return c;
}

export interface Girado { canvas: HTMLCanvasElement; ox: number; oy: number }

const cacheGiro = new Map<number, Map<number, Girado>>();

/**
 * O recorte girado em volta de (ax, ay) — um ponto DENTRO do recorte. Desenhe
 * o canvas em (âncora no mundo, arredondada) + (ox, oy).
 */
export function girado(rec: Recorte, ax: number, ay: number, giro: number): Girado {
  const passo = ((Math.round(giro / PASSO_ANGULO) % 24) + 24) % 24;
  // A âncora entra na chave: o mesmo recorte pode girar em volta de pontos diferentes.
  const chave = passo * 100000 + Math.round(ax * 10) * 300 + Math.round(ay * 10);
  let doRec = cacheGiro.get(rec.id);
  if (!doRec) { doRec = new Map(); cacheGiro.set(rec.id, doRec); }
  let g = doRec.get(chave);
  if (g) return g;

  const ang = passo * PASSO_ANGULO;
  const c = Math.cos(ang), s = Math.sin(ang);
  // Os cantos do recorte, girados em volta da âncora.
  const cantos = [[0, 0], [rec.w, 0], [0, rec.h], [rec.w, rec.h]].map(([i, j]) => {
    const dx = i - ax, dy = j - ay;
    return [c * dx - s * dy, s * dx + c * dy];
  });
  const ox = Math.floor(Math.min(...cantos.map(k => k[0])));
  const oy = Math.floor(Math.min(...cantos.map(k => k[1])));
  const w = Math.ceil(Math.max(...cantos.map(k => k[0]))) - ox;
  const h = Math.ceil(Math.max(...cantos.map(k => k[1]))) - oy;
  const px = new Uint32Array(Math.max(1, w * h));
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const dx = X + ox + 0.5, dy = Y + oy + 0.5;
    const sx = c * dx + s * dy + ax, sy = -s * dx + c * dy + ay;
    const i = Math.floor(sx), j = Math.floor(sy);
    if (i < 0 || j < 0 || i >= rec.w || j >= rec.h) continue;
    const cor = rec.px[j * rec.w + i];
    if (cor) px[Y * w + X] = cor;
  }
  const canvas = novoCanvas(w, h);
  pintarPixels(canvas, px, w, h);
  g = { canvas, ox, oy };
  doRec.set(chave, g);
  return g;
}

/** Esquece os giros de uma queda que acabou (memória). */
export function esquecer(ids: Iterable<number>): void {
  for (const id of ids) cacheGiro.delete(id);
}

export const SPRITE = { largura: LARGURA, altura: ALTURA };
