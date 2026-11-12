/**
 * podio.ts — os QUADROS DO PÓDIO da Bruxa do Pântano: uma arte única para
 * cada pessoa do top 3. O Kauan pediu em 20/10/2026: «algo único, maior que
 * um card, cada um sendo mais foda, sendo um degrau». Lembrou também que o 3º,
 * Eduardo Naia, deu o golpe final, e o quadro dele tem que contar isso.
 *
 * O degrau é literal. Cada quadro é maior que o de baixo: o 3º tem 1440 × 2016,
 * o 2º 1620 × 2268 e o 1º 1800 × 2520, todos 5:7 como a carta. Cada pessoa sobe
 * num pódio de blocos mais alto que o anterior. Lado a lado, com as bases
 * alinhadas (`desenharPodio`), os três formam a escada.
 *
 * A bruxa conta a história nos três quadros:
 * - no 3º, ela despenca com o golpe final, a barra de vida zerada;
 * - no 2º, fica congelada num bloco de gelo;
 * - no 1º, acaba presa na própria garrafa.
 *
 * A moldura sobe com o lugar: esmeralda, diamante e ouro, e mais enfeitada a
 * cada degrau.
 *
 * As fotos são as versões em pixel que o Kauan mandou (Downloads/Top 3). O
 * fundo sai no recorte (`recortarFoto`). Os números são os das cartas de
 * 19/10/2026, da rodada que caiu em 16/10.
 */
import { canvasDaImagem, miniatura } from '../../pixels';
import { DROPS, NOME_CHEFONA, acaso, montarBruxaMC, type Item } from '../arte';
import { desenharPlaca } from '../conquista';
import { larguraTextoMC } from '../fonteMC';
import { CORACAO_CHEIO_MC, GLOWSTONE_MC, OLHO_MC, REDSTONE_MC, TEIA_MC, TOTEM_MC } from '../texturasMC';
import {
  ARCADE, PIXEL, TERROR, brilho, caber, degraus, halo, item, mc, metalDaPosicao, novoCanvas, quebrarMC,
  silhueta, textoComSombra, type Ctx, type Metal,
} from './carta';

// ── Quem está no pódio ──────────────────────────────────────────────────────

export interface Heroi {
  posicao: 1 | 2 | 3;
  nome: string;
  setor: string;
  dano: number;
  acertos: number;
  criticos: number;
  /** Quanto da vida dela foi dessa pessoa (como a carta mostrou). */
  parte: string;
  golpeFinal: boolean;
}

/** O top 3 da rodada de 16/10/2026 (os números das cartas de 19/10). */
export const TOP3: readonly Heroi[] = [
  { posicao: 1, nome: 'Pedro Pugina Verdinasse', setor: 'Receptivo', dano: 1728, acertos: 385, criticos: 173, parte: '6,7%', golpeFinal: false },
  { posicao: 2, nome: 'Erika Eduarda', setor: 'Receptivo', dano: 1643, acertos: 331, criticos: 183, parte: '6,3%', golpeFinal: false },
  { posicao: 3, nome: 'Eduardo Naia', setor: 'Play 3', dano: 1523, acertos: 336, criticos: 152, parte: '5,9%', golpeFinal: true },
];
export const PARTICIPANTES = 74;
export const DATA_DA_QUEDA = '16/10/2026';

/** O tamanho de cada quadro: cada degrau é maior que o de baixo. */
export const TAMANHO: Readonly<Record<1 | 2 | 3, { w: number; h: number }>> = {
  3: { w: 1440, h: 2016 },
  2: { w: 1620, h: 2268 },
  1: { w: 1800, h: 2520 },
};

export function nomeDoQuadro(h: Heroi): string {
  return `Top ${h.posicao} - ${h.nome}.png`;
}

// ── A foto sem o fundo ───────────────────────────────────────────────────────

/** Como tirar o fundo: a foto já veio sem, ou o fundo é de uma cor só. */
export type ComoRecortar = { tipo: 'pronta' } | { tipo: 'chave'; cor: readonly [number, number, number]; tolerancia: number };

export interface FotoRecortada {
  canvas: HTMLCanvasElement;
  /** Onde está a pessoa no canvas (o que não ficou transparente). */
  caixa: { x: number; y: number; w: number; h: number };
}

/**
 * Tira o fundo de cor só, a partir das bordas: o preenchimento só anda pelo
 * fundo que toca a beirada, então o preto da roupa, que não toca, fica.
 */
export function recortarFoto(img: HTMLImageElement, como: ComoRecortar): FotoRecortada {
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = novoCanvas(w, h);
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0);
  const dados = c.getImageData(0, 0, w, h);
  const d = dados.data;
  if (como.tipo === 'chave') {
    const [kr, kg, kb] = como.cor;
    const longe = (i: number) => Math.max(Math.abs(d[i] - kr), Math.abs(d[i + 1] - kg), Math.abs(d[i + 2] - kb));
    const visto = new Uint8Array(w * h);
    const pilha: number[] = [];
    const tenta = (p: number) => {
      if (visto[p]) return;
      visto[p] = 1;
      if (longe(p * 4) <= como.tolerancia) pilha.push(p);
    };
    for (let x = 0; x < w; x++) { tenta(x); tenta((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { tenta(y * w); tenta(y * w + w - 1); }
    const fundo = new Uint8Array(w * h);
    while (pilha.length) {
      const p = pilha.pop()!;
      fundo[p] = 1;
      const x = p % w, y = (p / w) | 0;
      if (x > 0) tenta(p - 1);
      if (x < w - 1) tenta(p + 1);
      if (y > 0) tenta(p - w);
      if (y < h - 1) tenta(p + w);
    }
    // A franja: o pixel da beirada que ainda puxa para a cor do fundo também sai.
    const franja: number[] = [];
    for (let p = 0; p < w * h; p++) {
      if (fundo[p]) continue;
      const x = p % w, y = (p / w) | 0;
      const vizinho = (x > 0 && fundo[p - 1]) || (x < w - 1 && fundo[p + 1]) || (y > 0 && fundo[p - w]) || (y < h - 1 && fundo[p + w]);
      if (vizinho && longe(p * 4) <= como.tolerancia * 2.2) franja.push(p);
    }
    for (const p of franja) fundo[p] = 1;
    for (let p = 0; p < w * h; p++) if (fundo[p]) d[p * 4 + 3] = 0;
  }
  // O que ficou quase transparente vira transparente de vez (a borda limpa).
  for (let p = 0; p < w * h; p++) d[p * 4 + 3] = d[p * 4 + 3] < 60 ? 0 : 255;
  // As ilhas soltas (o ruído do fundo que passou da tolerância) saem: fica só o que é grande.
  const grupo = new Int32Array(w * h).fill(-1);
  const tamanhos: number[] = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (grupo[p0] >= 0 || d[p0 * 4 + 3] === 0) continue;
    const id = tamanhos.length;
    let n = 0;
    const fila = [p0];
    grupo[p0] = id;
    while (fila.length) {
      const p = fila.pop()!;
      n++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || grupo[q] >= 0 || d[q * 4 + 3] === 0) continue;
        grupo[q] = id;
        fila.push(q);
      }
    }
    tamanhos.push(n);
  }
  for (let p = 0; p < w * h; p++) if (grupo[p] >= 0 && tamanhos[grupo[p]] < 3000) d[p * 4 + 3] = 0;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] === 0) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  c.putImageData(dados, 0, 0);
  return { canvas: cv, caixa: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

// ── Os itens desenhados aqui (no estilo das texturas do jogo) ───────────────

/** Uma grade de letras a partir de uma regra por pixel, com o contorno `o` em volta. */
function grade(w: number, h: number, regra: (x: number, y: number) => string | null): string[] {
  const g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => regra(x, y) ?? '.'));
  const cheio = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && g[y][x] !== '.' && g[y][x] !== 'o';
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] === '.' && (cheio(x - 1, y) || cheio(x + 1, y) || cheio(x, y - 1) || cheio(x, y + 1))) g[y][x] = 'o';
  }
  return g.map(l => l.join(''));
}

interface CoresDaEspada { L: string; M: string; D: string; G: string; g: string; H: string; h: string; P: string }

/** A espada do jogo, 16 × 16: a lâmina em diagonal (a ponta em cima à direita), a guarda, o cabo e o pomo. */
const MOLDE_ESPADA: readonly string[] = [
  '.............ooo',
  '............oLLo',
  '...........oLMLo',
  '..........oLMDo.',
  '.........oLMDo..',
  '........oLMDo...',
  '.......oLMDo....',
  '...oo.oLMDo.....',
  '...oGoLMDo......',
  '....oGMDo.......',
  '....ohGgo.......',
  '...ohHogGo......',
  '..ohHo..oo......',
  '.oPHo...........',
  'oPPo............',
  'ooo.............',
];

function espada(nome: string, k: CoresDaEspada): Item {
  return { nome, linhas: MOLDE_ESPADA, cores: { o: '#0d0a12', ...k } };
}

export const ESPADA_DIAMANTE = espada('Espada de Diamante', {
  L: '#e6fffb', M: '#4aedd9', D: '#1f9fa0', G: '#2bb5a5', g: '#0f5f5a', H: '#6b4a25', h: '#493017', P: '#4aedd9',
});
export const ESPADA_OURO = espada('Espada de Ouro', {
  L: '#fffbd0', M: '#f6d43c', D: '#b88a10', G: '#e0a818', g: '#7a5200', H: '#6b4a25', h: '#493017', P: '#f6d43c',
});

/** A coroa: cinco pontas (as três grandes com pérola), a faixa com as pedras. */
export const COROA: Item = {
  nome: 'Coroa',
  linhas: grade(24, 16, (x, y) => {
    const pontas: [number, number][] = [[2, 4], [7, 6], [12, 1], [17, 6], [22, 4]];
    // A pérola no alto das três grandes.
    for (const [cx, ap] of [pontas[0], pontas[2], pontas[4]]) {
      if (Math.abs(x - cx) <= (y === ap - 2 ? 0 : 1) && y >= ap - 3 && y <= ap - 1 && !(Math.abs(x - cx) === 1 && y !== ap - 2)) return y === ap - 3 ? 'W' : 'w';
    }
    if (x < 1 || x > 23 || y > 14) return null;
    const topo = Math.min(...pontas.map(([cx, ap]) => ap + Math.abs(x - cx) * 1.25));
    if (y < topo || y < 1) return null;
    if (y >= 10) {
      if (y === 10) return 'L';
      if (y === 14) return 'D';
      // As pedras da faixa.
      if (y >= 11 && y <= 13) {
        if (x >= 3 && x <= 4) return y === 11 ? 'r' : 'R';
        if (x >= 11 && x <= 13) return y === 11 ? 'b' : 'B';
        if (x >= 20 && x <= 21) return y === 11 ? 'r' : 'R';
      }
      return x > 18 ? 'M' : 'Y';
    }
    if (y < topo + 1) return 'L';
    return x > 17 || (x > 12 && acaso(x, y, 3) > 0.6) ? 'M' : 'Y';
  }),
  cores: { o: '#2a1600', Y: '#f6c518', L: '#fff1a0', M: '#c8900c', D: '#7a4f00', W: '#ffffff', w: '#e6e0f0', r: '#ff6a6a', R: '#c81818', b: '#8ad8ff', B: '#1f6fd0' },
};

/** O diamante do jogo (o item). */
export const DIAMANTE: Item = {
  nome: 'Diamante',
  linhas: grade(16, 16, (x, y) => {
    const cx = 7.5, dx = Math.abs(x - cx);
    if (y < 3 || y > 13) return null;
    const meia = y <= 6 ? 3 + (y - 3) * 1.4 : 7.5 - (y - 6) * 1.05;
    if (dx > meia) return null;
    if (y === 3 || (y <= 5 && x < 6)) return 'W';
    if (x - y > 1) return 'D';
    return (x + y) % 5 === 0 ? 'L' : 'M';
  }),
  cores: { o: '#0a2e33', W: '#eaffff', L: '#b8fbff', M: '#4fe0e8', D: '#1f9fb0' },
};

/** A esmeralda do jogo (o item). */
export const ESMERALDA: Item = {
  nome: 'Esmeralda',
  linhas: grade(16, 16, (x, y) => {
    const cx = 7.5, dx = Math.abs(x - cx);
    if (y < 2 || y > 14) return null;
    const meia = y <= 4 ? 1.5 + (y - 2) * 1.5 : y >= 12 ? 4.5 - (y - 12) * 1.5 : 4.5;
    if (dx > meia) return null;
    if (dx <= 1 && y >= 4 && y <= 12) return 'L';
    if (x < cx && y < 7) return 'W';
    return x > cx + 2 ? 'D' : 'M';
  }),
  cores: { o: '#03260f', W: '#d6ffe0', L: '#a8ffbf', M: '#2fd860', D: '#109a3e' },
};

/** O lingote de ouro do jogo. */
export const LINGOTE: Item = {
  nome: 'Lingote de Ouro',
  linhas: grade(16, 16, (x, y) => {
    if (y < 5 || y > 11) return null;
    const recuo = (11 - y) * 0.5;
    if (x < 1 + recuo || x > 14 - recuo) return null;
    if (y === 5) return 'W';
    if (y === 11) return 'D';
    return x > 11 ? 'M' : 'Y';
  }),
  cores: { o: '#3a2200', W: '#fff6c8', Y: '#f0c020', M: '#c08a10', D: '#7a5200' },
};

// ── Pedacinhos de desenho do quadro ─────────────────────────────────────────

const PRETO = '#05030a';

/** Arredonda para a grade do pixel `b`. */
const g = (v: number, b: number) => Math.round(v / b) * b;

/** Faixas de cor com o pontilhado entre elas (o degradê do jogo, sem degradê). */
function faixas(c: Ctx, x: number, y: number, w: number, h: number, cores: readonly string[], b: number): void {
  const alto = Math.ceil(h / cores.length / b) * b;
  cores.forEach((cor, i) => {
    c.fillStyle = cor;
    c.fillRect(x, y + i * alto, w, alto + b);
    if (i > 0) {
      c.fillStyle = cores[i - 1];
      const yy = y + i * alto;
      for (let xx = x; xx < x + w; xx += b * 2) c.fillRect(xx + ((xx / b / 2) % 2 ? b : 0), yy, b, b);
      for (let xx = x + b; xx < x + w; xx += b * 4) c.fillRect(xx, yy + b, b, b);
    }
  });
}

/** Estrelas: quadradinhos e alguns brilhos de quatro pontas. */
function estrelas(c: Ctx, x: number, y: number, w: number, h: number, n: number, semente: number, cor: string, b: number): void {
  for (let i = 0; i < n; i++) {
    const r = acaso(i, 3, semente);
    const sx = g(x + acaso(i, 1, semente) * w, b / 2), sy = g(y + acaso(i, 2, semente) * h, b / 2);
    if (r > 0.96) { brilho(c, sx, sy, b, cor, 0.85); continue; }
    c.fillStyle = r > 0.75 ? cor : '#ffffff';
    c.globalAlpha = 0.2 + r * 0.65;
    const t = r > 0.88 ? b : b / 2;
    c.fillRect(sx, sy, t, t);
  }
  c.globalAlpha = 1;
}

/** Os raios de luz saindo de um ponto. */
function raios(c: Ctx, cx: number, cy: number, n: number, cor: string, alfa: number, largura: number, comprimento: number, giro = 0): void {
  c.save();
  c.translate(cx, cy);
  c.rotate(giro);
  for (let i = 0; i < n; i++) {
    c.rotate((Math.PI * 2) / n);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-largura, -comprimento);
    c.lineTo(largura, -comprimento);
    c.closePath();
    c.fillStyle = cor;
    c.globalAlpha = i % 2 ? alfa * 0.5 : alfa;
    c.fill();
  }
  c.restore();
}

/** Um disco em blocos (a lua, os halos fortes). */
function disco(c: Ctx, cx: number, cy: number, r: number, b: number, pintar: (x: number, y: number, dd: number) => string | null): void {
  for (let y = -r; y <= r; y += b) for (let x = -r; x <= r; x += b) {
    const dd = x * x + y * y;
    if (dd > r * r) continue;
    const cor = pintar(x, y, dd);
    if (!cor) continue;
    c.fillStyle = cor;
    c.fillRect(g(cx + x, b), g(cy + y, b), b, b);
  }
}

/** A gema da moldura (losango em pixel, com o brilho no canto). */
function gema(c: Ctx, cx: number, cy: number, b: number, cores: readonly [string, string, string, string], r = 3): void {
  const losango = (rr: number, cor: string) => {
    c.fillStyle = cor;
    for (let k = -rr; k <= rr; k++) c.fillRect(cx - (rr - Math.abs(k)) * b - b / 2, cy + k * b - b / 2, ((rr - Math.abs(k)) * 2 + 1) * b, b);
  };
  losango(r + 1, PRETO);
  losango(r, cores[0]);
  losango(r - 1, cores[1]);
  if (r > 2) losango(r - 2, cores[2]);
  c.fillStyle = cores[3];
  c.fillRect(cx - b * 1.5, cy - b * 1.5, b, b);
  c.fillRect(cx - b * 0.5, cy - b * 2.5, b, b);
}

/** A textura de um bloco do metal (16 × 16): borda clara em cima, escura embaixo, e o veio do minério. */
function texturaDoBloco(m: Metal, estilo: 'ouro' | 'diamante' | 'esmeralda'): HTMLCanvasElement {
  const cv = novoCanvas(16, 16);
  const c = cv.getContext('2d')!;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let cor = m.base;
    const r = acaso(x, y, 51);
    if (estilo === 'diamante') {
      // As facetas do bloco de diamante: losangos claros.
      const fx = (x + 4) % 8 - 4, fy = (y + 4) % 8 - 4;
      cor = Math.abs(fx) + Math.abs(fy) <= 1 ? m.brilho : Math.abs(fx) + Math.abs(fy) === 2 ? m.luz : r > 0.85 ? m.meio : m.base;
    } else if (estilo === 'esmeralda') {
      const fx = x % 8, fy = y % 8;
      cor = (fx === 1 || fx === 6) && fy > 0 && fy < 7 ? m.luz : (fy === 1 || fy === 6) && fx > 0 && fx < 7 ? m.meio : r > 0.88 ? m.luz : m.base;
    } else {
      cor = r > 0.9 ? m.luz : r < 0.08 ? m.meio : m.base;
      if (y % 5 === 2 && x > 1 && x < 14 && acaso(x, y, 52) > 0.4) cor = m.luz;
    }
    if (x === 0 || y === 0) cor = m.brilho;
    else if (x === 15 || y === 15) cor = m.sombra;
    else if (x === 1 || y === 1) cor = m.luz;
    else if (x === 14 || y === 14) cor = m.meio;
    c.fillStyle = cor;
    c.fillRect(x, y, 1, 1);
  }
  return cv;
}

/** O pódio de blocos: a face da frente (blocos inteiros), o tampo e a sombra no chão. */
function podio(c: Ctx, x: number, y: number, w: number, h: number, bloco: HTMLCanvasElement, m: Metal, lado: number): void {
  // A sombra no chão.
  c.fillStyle = '#000000';
  c.globalAlpha = 0.45;
  c.fillRect(x - lado / 2, y + h - lado / 3, w + lado, lado / 2);
  c.globalAlpha = 1;
  c.imageSmoothingEnabled = false;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  const colunas = Math.ceil(w / lado), linhas = Math.ceil(h / lado);
  const dx = x + (w - colunas * lado) / 2;
  for (let j = 0; j < linhas; j++) for (let i = 0; i < colunas; i++) {
    c.drawImage(bloco, dx + i * lado, y + j * lado, lado, lado);
    // Mais escuro descendo: a luz vem de cima.
    c.fillStyle = '#000000';
    c.globalAlpha = Math.min(0.55, 0.06 + j * 0.07);
    c.fillRect(dx + i * lado, y + j * lado, lado, lado);
    c.globalAlpha = 1;
  }
  c.restore();
  // O tampo (a face de cima, em perspectiva achatada) e o contorno.
  const t = lado / 4;
  c.fillStyle = PRETO;
  c.fillRect(x - 6, y - t - 6, w + 12, t + 12);
  c.fillStyle = m.brilho;
  c.fillRect(x, y - t, w, t);
  c.fillStyle = m.luz;
  for (let xx = x; xx < x + w; xx += 12) if (acaso(xx, 1, 61) > 0.5) c.fillRect(xx, y - t + 6, 6, t - 6);
  c.fillStyle = PRETO;
  c.fillRect(x - 6, y, 6, h);
  c.fillRect(x + w, y, 6, h);
}

/** A moldura do quadro: metal em relevo e, a cada degrau, mais enfeite. */
function moldura(c: Ctx, W: number, H: number, m: Metal, B: number, nivel: 1 | 2 | 3, b: number, pedra: readonly [string, string, string, string]): void {
  degraus(c, 0, 0, W, H, 8, 3, PRETO);
  degraus(c, b, b, W - b * 2, H - b * 2, 8, 3, m.meio);
  degraus(c, b, b, W - b * 3, H - b * 3, 8, 3, m.luz);
  degraus(c, b * 2, b * 2, W - b * 4, H - b * 4, 8, 3, m.base);
  // As riscas do metal escovado.
  for (let y = b * 2; y < H - b * 2; y += b) for (let x = b * 2; x < W - b * 2; x += b) {
    if (x > B && x < W - B && y > B && y < H - B) continue;
    const r = acaso(x, y, 7);
    if (r < 0.1) { c.fillStyle = m.luz; c.fillRect(x, y, b, b); }
    else if (r > 0.92) { c.fillStyle = m.meio; c.fillRect(x, y, b, b); }
  }
  // O friso do meio da moldura, em baixo-relevo.
  const fr = Math.round(B / 2 / b) * b;
  c.fillStyle = m.meio;
  c.fillRect(fr, fr, W - fr * 2, b / 2);
  c.fillRect(fr, H - fr, W - fr * 2, b / 2);
  c.fillRect(fr, fr, b / 2, H - fr * 2);
  c.fillRect(W - fr, fr, b / 2, H - fr * 2);
  c.fillStyle = m.brilho;
  c.fillRect(fr, fr + b / 2, W - fr * 2, b / 2);
  c.fillRect(fr + b / 2, fr, b / 2, H - fr * 2);
  // O fio escuro de dentro.
  degraus(c, B - b, B - b, W - (B - b) * 2, H - (B - b) * 2, 8, 2, PRETO);

  // Os rebites ao longo da moldura (do 2º para cima).
  if (nivel >= 2) {
    const passo = g(nivel === 3 ? 96 : 132, b);
    for (let x = B + passo; x < W - B - passo / 2; x += passo) for (const y of [fr, H - fr]) {
      c.fillStyle = PRETO;
      c.fillRect(x - b, y - b, b * 2, b * 2);
      c.fillStyle = m.brilho;
      c.fillRect(x - b, y - b, b, b);
    }
    for (let y = B + passo; y < H - B - passo / 2; y += passo) for (const x of [fr, W - fr]) {
      c.fillStyle = PRETO;
      c.fillRect(x - b, y - b, b * 2, b * 2);
      c.fillStyle = m.brilho;
      c.fillRect(x - b, y - b, b, b);
    }
  }
  // As gemas: no meio de cada lado sempre; no 1º, uma fileira em cima e embaixo.
  gema(c, W / 2, fr, b, pedra, 3);
  gema(c, W / 2, H - fr, b, pedra, 3);
  gema(c, fr, H / 2, b, pedra, 3);
  gema(c, W - fr, H / 2, b, pedra, 3);
  if (nivel === 3) {
    for (const f of [0.25, 0.75]) {
      gema(c, W * f, fr, b, ['#4fe0e8', '#1f9fb0', '#0b3f4a', '#eaffff'], 2);
      gema(c, W * f, H - fr, b, ['#ff5555', '#c81818', '#5a0000', '#ffd0d0'], 2);
      gema(c, fr, H * f, b, ['#9d4ee8', '#6a24b0', '#2a0650', '#f5e8ff'], 2);
      gema(c, W - fr, H * f, b, ['#9d4ee8', '#6a24b0', '#2a0650', '#f5e8ff'], 2);
    }
  }
  // Os cantos: uma placa quadrada com a gema; no 2º e no 1º, maior e com brilho.
  const canto = nivel === 1 ? B + b * 2 : nivel === 2 ? B + b * 4 : B + b * 6;
  for (const [cx, cy] of [[0, 0], [W - canto, 0], [0, H - canto], [W - canto, H - canto]] as const) {
    degraus(c, cx + b, cy + b, canto - b * 2, canto - b * 2, b, 2, PRETO);
    degraus(c, cx + b * 2, cy + b * 2, canto - b * 4, canto - b * 4, b, 1, m.luz);
    degraus(c, cx + b * 3, cy + b * 3, canto - b * 6, canto - b * 6, b, 1, m.meio);
    degraus(c, cx + b * 4, cy + b * 4, canto - b * 8, canto - b * 8, b, 1, m.base);
    gema(c, cx + canto / 2, cy + canto / 2, b, pedra, nivel === 1 ? 2 : 3);
    if (nivel >= 2) brilho(c, cx + canto / 2 + b * 4, cy + canto / 2 - b * 4, b, m.brilho, 0.9);
  }
}

/** A pessoa recortada, com o contorno escuro e a aura da cor do lugar em volta. */
function heroi(c: Ctx, foto: FotoRecortada, x: number, y: number, s: number, aura: string, b: number): void {
  const w = foto.canvas.width * s, h = foto.canvas.height * s;
  const sil = silhueta(foto.canvas, aura);
  c.save();
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  for (const [raio, alfa] of [[b * 5, 0.1], [b * 3.5, 0.16], [b * 2, 0.3]] as const) {
    c.globalAlpha = alfa;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      c.drawImage(sil, x + Math.cos(a) * raio, y + Math.sin(a) * raio, w, h);
    }
  }
  c.globalAlpha = 1;
  const escuro = silhueta(foto.canvas, PRETO);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
    c.drawImage(escuro, x + dx * b * 0.7, y + dy * b * 0.7, w, h);
  }
  c.drawImage(foto.canvas, x, y, w, h);
  c.restore();
}

/** A bruxa do jogo (quadro e estágio do dano), pronta para ampliar. */
function bruxaMC(quadro: number, estagio: 0 | 1 | 2 | 3, espelhar: boolean): HTMLCanvasElement {
  return canvasDaImagem(montarBruxaMC(quadro, estagio), espelhar);
}

/** Desenha um canvas de pixel ampliado, girado em volta do centro (sem borrar). */
function girado(c: Ctx, src: HTMLCanvasElement, cx: number, cy: number, s: number, giro: number, contorno: string | null, aura: string | null): void {
  const w = src.width * s, h = src.height * s;
  c.save();
  c.translate(cx, cy);
  c.rotate(giro);
  c.imageSmoothingEnabled = false;
  if (aura) {
    const a = silhueta(src, aura);
    for (const [raio, alfa] of [[5, 0.1], [3.5, 0.16], [2, 0.26]] as const) {
      c.globalAlpha = alfa;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        c.drawImage(a, -w / 2 + dx * raio * s, -h / 2 + dy * raio * s, w, h);
      }
    }
    c.globalAlpha = 1;
  }
  if (contorno) {
    const sil = silhueta(src, contorno);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.drawImage(sil, -w / 2 + dx * s, -h / 2 + dy * s, w, h);
  }
  c.drawImage(src, -w / 2, -h / 2, w, h);
  c.restore();
}

/** Um item do jogo ampliado e girado, com contorno de brilho opcional. */
function itemGirado(c: Ctx, it: Item, cx: number, cy: number, s: number, giro: number, aura: string | null = null, espelhar = false): void {
  girado(c, miniatura(it)[espelhar ? 1 : 0], cx, cy, s, giro, null, aura);
}

/** O brilho de encantamento do jogo: as faixas roxas passando por cima do item. */
function encantado(c: Ctx, it: Item, cx: number, cy: number, s: number, giro: number): void {
  const src = miniatura(it)[0];
  const cv = novoCanvas(src.width * s, src.height * s);
  const k = cv.getContext('2d')!;
  k.imageSmoothingEnabled = false;
  k.drawImage(src, 0, 0, cv.width, cv.height);
  k.globalCompositeOperation = 'source-atop';
  for (let i = -cv.height; i < cv.width; i += s * 5) {
    k.fillStyle = '#b06cff';
    k.globalAlpha = 0.2;
    k.beginPath();
    k.moveTo(i, cv.height);
    k.lineTo(i + s * 2, cv.height);
    k.lineTo(i + s * 2 + cv.height, 0);
    k.lineTo(i + cv.height, 0);
    k.closePath();
    k.fill();
  }
  c.save();
  c.translate(cx, cy);
  c.rotate(giro);
  c.drawImage(cv, -cv.width / 2, -cv.height / 2);
  c.restore();
}

/** A fita do nome, com as pontas dobradas (a da carta, no tamanho do quadro). */
function fita(c: Ctx, m: Metal, nome: string, setor: string, cx: number, cy: number, w: number, h: number, b: number): void {
  const x = cx - w / 2, y = cy - h / 2;
  const linhas = Math.round((h * 0.62) / b), ty = y + h * 0.28, tw = h * 1.25;
  for (const lado of [-1, 1]) {
    const px = lado < 0 ? x - tw * 0.62 : x + w - tw * 0.38;
    for (const [borda, cor] of [[1, PRETO], [0, m.meio]] as const) {
      for (let r = -borda; r < linhas + borda; r++) {
        const meio = (linhas - 1) / 2;
        const corte = Math.round(Math.max(0, 1 - Math.abs(r - meio) / meio) * 6) * b - borda * b;
        const x0 = lado < 0 ? px + corte : px - borda * b;
        const x1 = lado < 0 ? px + tw + borda * b : px + tw - corte;
        c.fillStyle = cor;
        c.fillRect(x0, ty + r * b, x1 - x0, b);
      }
    }
    c.fillStyle = m.sombra;
    c.fillRect(lado < 0 ? px + tw - b * 6 : px, ty, b * 6, linhas * b);
  }
  degraus(c, x, y, w, h, b, 2, PRETO);
  degraus(c, x + b, y + b, w - b * 2, h - b * 2, b, 1, m.luz);
  degraus(c, x + b * 2, y + b * 2, w - b * 3, h - b * 3, b, 1, m.meio);
  degraus(c, x + b * 2, y + b * 2, w - b * 4, h - b * 4, b, 1, m.base);
  // O brilho que corre na fita.
  c.fillStyle = m.brilho;
  c.globalAlpha = 0.5;
  c.fillRect(x + b * 4, y + b * 3, w - b * 8, b);
  c.globalAlpha = 1;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  caber(c, nome, px => `500 ${px}px ${PIXEL}`, Math.round(h * 0.6), w - b * 18, 26);
  textoComSombra(c, nome, cx, cy + b * 0.5, m.textoFita, m.sombraFita, Math.max(3, Math.round(b / 2)));
  const t = setor.toUpperCase().split('').join(' ');
  caber(c, t, px => `500 ${px}px ${PIXEL}`, Math.round(h * 0.27), w - b * 20, 14);
  textoComSombra(c, t, cx, y + h + h * 0.34, m.luz, PRETO, 3);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

/** As quatro caixas de número (a dica de item do jogo). */
function numeros(c: Ctx, m: Metal, h: Heroi, cx: number, y: number, w: number, alto: number, b: number): void {
  const caixas: [Item, string, string][] = [
    [REDSTONE_MC, h.dano.toLocaleString('pt-BR'), 'de dano'],
    [OLHO_MC, h.acertos.toLocaleString('pt-BR'), 'acertos'],
    [GLOWSTONE_MC, h.criticos.toLocaleString('pt-BR'), 'críticos'],
    [CORACAO_CHEIO_MC, h.parte, 'da vida dela'],
  ];
  const gap = b * 3, cw = (w - gap * 3) / 4, x0 = cx - w / 2;
  const escalaMC = Math.max(2, Math.round(alto / 46));
  caixas.forEach(([it, valor, rotulo], i) => {
    const x = x0 + i * (cw + gap);
    c.fillStyle = '#100010';
    c.globalAlpha = 0.95;
    c.fillRect(x, y, cw, alto);
    c.globalAlpha = 1;
    c.fillStyle = m.base;
    c.fillRect(x + b, y + b, cw - b * 2, b / 2);
    c.fillRect(x + b, y + b, b / 2, alto / 2 - b);
    c.fillRect(x + cw - b * 1.5, y + b, b / 2, alto / 2 - b);
    c.fillStyle = m.sombra;
    c.fillRect(x + b, y + alto - b * 1.5, cw - b * 2, b / 2);
    c.fillRect(x + b, y + alto / 2, b / 2, alto / 2 - b);
    c.fillRect(x + cw - b * 1.5, y + alto / 2, b / 2, alto / 2 - b);
    c.fillStyle = PRETO;
    c.fillRect(x - b / 2, y, b / 2, alto);
    c.fillRect(x + cw, y, b / 2, alto);
    c.fillRect(x, y - b / 2, cw, b / 2);
    c.fillRect(x, y + alto, cw, b / 2);
    const icone = Math.round(alto * 0.4 / 16) * 16;
    const img = miniatura(it)[0];
    const s = Math.max(1, Math.floor(icone / Math.max(img.width, img.height)));
    item(c, it, x + b * 3.5, y + alto * 0.18 + (icone - img.height * s) / 2, s);
    c.textBaseline = 'middle';
    caber(c, valor, px => `${px}px ${ARCADE}`, Math.round(alto * 0.25), cw - icone - b * 7, 14);
    textoComSombra(c, valor, x + icone + b * 5, y + alto * 0.18 + icone / 2, '#ffffff', '#3f3f3f', 3);
    c.textBaseline = 'alphabetic';
    mc(c, rotulo, x + b * 3.5, y + alto * 0.7, escalaMC, '#c6c6c6', '#3f3f3f', 'esquerda');
  });
}

/** A placa de conquista do jogo, ampliada em escala inteira. */
function placa(c: Ctx, cx: number, y: number, s: number, nome: string, descricao: string, raridade: string, icone: Item): number {
  const p = desenharPlaca({ titulo: 'Desafio concluído!', nome, descricao, raridade }, miniatura(icone)[0]);
  c.imageSmoothingEnabled = false;
  c.drawImage(p, Math.round(cx - (p.width * s) / 2), Math.round(y), p.width * s, p.height * s);
  return p.height * s;
}

/** O agradecimento: a frase grande do Halloween e a linha na fonte do jogo. */
function agradecimento(c: Ctx, cx: number, y: number, w: number, linha: string, f: number): void {
  const t = 'Obrigado por fazer parte de um evento único!';
  c.textAlign = 'center';
  caber(c, t, px => `${px}px ${TERROR}`, Math.round(64 * f), w, 30);
  textoComSombra(c, t, cx, y, '#80ff20', PRETO, Math.round(4 * f));
  c.textAlign = 'left';
  const e = Math.max(3, Math.round(3 * f));
  quebrarMC(linha, Math.floor(w / e)).forEach((l, i) => mc(c, l, cx, y + 22 * f + i * 11 * e, e, '#d6e4cf', PRETO));
}

/** O medalhão da posição: o escudo com «TOP» e o número, e a coroa de louros (2º e 1º). */
function medalhao(c: Ctx, m: Metal, posicao: number, cx: number, cy: number, f: number, louros: boolean): void {
  const w = 220 * f, h = 250 * f, x = cx - w / 2, y = cy - h / 2, b = Math.round(6 * f);
  if (louros) {
    // Os louros: dois ramos que sobem do pé do escudo, com folhas em gota viradas para fora.
    const folha = (fx: number, fy: number, ang: number, comp: number, larg: number, cor: string, luz: string) => {
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const caixa = comp + b * 2;
      for (const [extra, tinta] of [[b, PRETO], [0, cor]] as const) {
        for (let yy = -caixa; yy <= caixa; yy += b) for (let xx = -caixa; xx <= caixa; xx += b) {
          const t = xx * ux + yy * uy, n = -xx * uy + yy * ux;
          // Gota: larga na base, fina na ponta.
          const meiaLarg = (larg / 2) * Math.sin(Math.PI * Math.min(1, Math.max(0, t / comp))) + extra;
          if (t < -extra || t > comp + extra || Math.abs(n) > meiaLarg) continue;
          c.fillStyle = extra === 0 && n < -larg * 0.1 && t > comp * 0.2 ? luz : tinta;
          c.fillRect(g(fx + xx, b), g(fy + yy, b), b, b);
        }
      }
    };
    for (const lado of [-1, 1]) {
      // O ramo: um arco fino em volta do escudo.
      const rx = w * 0.66, ry = h * 0.56, oy = cy + h * 0.04;
      for (let a = 0.25; a < 2.55; a += 0.04) {
        const ang = Math.PI / 2 + lado * a;
        c.fillStyle = PRETO;
        c.fillRect(g(cx + Math.cos(ang) * rx, b) - b / 2, g(oy + Math.sin(ang) * ry, b) - b / 2, b * 2, b * 2);
        c.fillStyle = m.sombra;
        c.fillRect(g(cx + Math.cos(ang) * rx, b), g(oy + Math.sin(ang) * ry, b), b, b);
      }
      for (let k = 0; k < 7; k++) {
        const ang = Math.PI / 2 + lado * (0.45 + k * 0.32);
        const fx = cx + Math.cos(ang) * rx, fy = oy + Math.sin(ang) * ry;
        const sobe = ang + lado * Math.PI / 2;
        const tam = (52 - k * 3) * f;
        folha(fx, fy, sobe - lado * 0.75, tam, tam * 0.5, m.base, m.brilho);
        folha(fx, fy, sobe + lado * 0.35, tam * 0.9, tam * 0.45, m.meio, m.luz);
      }
    }
  }
  const escudo = (e: number, cor: string) => {
    degraus(c, x - e, y - e, w + e * 2, h * 0.72 + e * 2, 8, 3, cor);
    c.fillStyle = cor;
    const base = y + h * 0.72 + e, meia = w / 2 + e;
    for (let k = 0; k * b < meia; k++) c.fillRect(cx - meia + k * b, base + k * b * 0.9 - b, (meia - k * b) * 2, b * 1.4);
  };
  escudo(14 * f, PRETO);
  escudo(7 * f, m.luz);
  escudo(0, m.base);
  escudo(-12 * f, m.meio);
  escudo(-19 * f, m.sombra);
  brilho(c, x + 22 * f, y + 20 * f, b, m.brilho, 0.9);
  brilho(c, x + w - 24 * f, y + h * 0.62, b * 0.66, m.brilho, 0.8);
  c.textAlign = 'center';
  c.font = `${Math.round(30 * f)}px ${ARCADE}`;
  textoComSombra(c, 'TOP', cx, y + 66 * f, m.luz, PRETO, 3);
  c.font = `${Math.round(112 * f)}px ${ARCADE}`;
  textoComSombra(c, String(posicao), cx + 7 * f, y + 190 * f, '#ffffff', PRETO, Math.round(8 * f));
  c.textAlign = 'left';
}

/** A barra de vida do chefe, do jogo: o nome em cima e a barra (rosa) embaixo. */
function barraDoChefe(c: Ctx, cx: number, y: number, w: number, fracao: number, e: number, legenda: string): void {
  mc(c, NOME_CHEFONA, cx, y, e, '#ffffff', '#3f3f3f');
  const by = y + 12 * e, bh = 5 * e, x = cx - w / 2;
  c.fillStyle = PRETO;
  c.fillRect(x - e, by - e, w + e * 2, bh + e * 2);
  c.fillStyle = '#3a0f30';
  c.fillRect(x, by, w, bh);
  // Os entalhes da barra (os 20 pedaços do jogo).
  c.fillStyle = '#25081f';
  for (let i = 1; i < 20; i++) c.fillRect(x + (w * i) / 20 - e / 2, by + e, e, bh - e * 2);
  if (fracao > 0) {
    c.fillStyle = '#e83ad0';
    c.fillRect(x, by, w * fracao, bh);
    c.fillStyle = '#ff8af0';
    c.fillRect(x, by, w * fracao, e);
  }
  mc(c, legenda, cx, by + bh + e * 3, Math.max(2, e - 1), '#ff5555', '#3f0000');
}

/** Um raio (o relâmpago) em zigue-zague de blocos, com a luz em volta. */
function relampago(c: Ctx, x: number, y: number, comprimento: number, semente: number, b: number): void {
  const pontos: [number, number][] = [[x, y]];
  let px = x, py = y;
  while (py < y + comprimento) {
    py += b * (6 + Math.floor(acaso(py, 1, semente) * 6));
    px += b * (Math.floor(acaso(py, 2, semente) * 9) - 4);
    pontos.push([px, py]);
  }
  for (const [larg, cor, alfa] of [[b * 5, '#ff4040', 0.12], [b * 3, '#ffd0d0', 0.3], [b, '#ffffff', 1]] as const) {
    c.globalAlpha = alfa;
    c.fillStyle = cor;
    for (let i = 1; i < pontos.length; i++) {
      const [ax, ay] = pontos[i - 1], [bx, by] = pontos[i];
      const passos = Math.ceil(Math.hypot(bx - ax, by - ay) / b);
      for (let k = 0; k <= passos; k++) {
        const t = k / passos;
        c.fillRect(g(ax + (bx - ax) * t, b) - larg / 2, g(ay + (by - ay) * t, b) - larg / 2, larg, larg);
      }
    }
  }
  c.globalAlpha = 1;
}

/** Os fogos de artifício: o estouro em raios de pontinhos, com o miolo branco. */
function fogos(c: Ctx, cx: number, cy: number, r: number, cor: string, luz: string, semente: number, b: number): void {
  halo(c, cx, cy, r * 0.7, cor, 0.25, b);
  const n = 14 + Math.floor(acaso(cx, cy, semente) * 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + acaso(i, semente, 2) * 0.2;
    const comp = r * (0.7 + acaso(i, semente, 3) * 0.3);
    for (let t = 0.2; t <= 1; t += 0.12) {
      c.globalAlpha = 1 - t * 0.6;
      c.fillStyle = t > 0.85 ? luz : cor;
      const q = t > 0.85 ? b * 1.5 : b;
      c.fillRect(g(cx + Math.cos(a) * comp * t, b), g(cy + Math.sin(a) * comp * t, b), q, q);
    }
  }
  c.globalAlpha = 1;
  brilho(c, cx, cy, b, luz, 1);
}

/** A luz do sinalizador (o feixe do jogo): o miolo branco e as bordas na cor. */
function feixe(c: Ctx, cx: number, topo: number, base: number, larg: number, cor: string, b: number): void {
  for (const [w, alfa, tinta] of [[larg * 2.2, 0.06, cor], [larg * 1.5, 0.1, cor], [larg, 0.22, cor], [larg * 0.5, 0.45, '#ffffff'], [larg * 0.22, 0.7, '#ffffff']] as const) {
    c.globalAlpha = alfa;
    c.fillStyle = tinta;
    c.fillRect(g(cx - w / 2, b), topo, g(w, b), base - topo);
  }
  // As fagulhas que sobem no feixe.
  for (let i = 0; i < 40; i++) {
    c.globalAlpha = 0.4 + acaso(i, 7, cx) * 0.5;
    c.fillStyle = acaso(i, 8, cx) > 0.5 ? '#ffffff' : cor;
    c.fillRect(g(cx + (acaso(i, 9, cx) - 0.5) * larg * 1.6, b), g(topo + acaso(i, 10, cx) * (base - topo), b), b, b);
  }
  c.globalAlpha = 1;
}

/** O cristal (o aglomerado que nasce no chão): prismas em pé com a ponta em bisel. */
function cristais(c: Ctx, x: number, base: number, alto: number, b: number, cores: readonly [string, string, string, string], semente: number, espelhar = false): void {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const k = espelhar ? n - 1 - i : i;
    const h = alto * (0.45 + acaso(k, 1, semente) * 0.55) * (k === 2 ? 1.15 : 1);
    const w = g(b * (4 + Math.floor(acaso(k, 2, semente) * 3)), b);
    const px = g(x + (k - 2) * b * 4.5, b), inclina = (k - 2) * 0.12;
    c.save();
    c.translate(px, base);
    c.rotate(inclina);
    c.fillStyle = PRETO;
    c.fillRect(-w / 2 - b, -h - b, w + b * 2, h + b);
    c.fillStyle = cores[2];
    c.fillRect(-w / 2, -h + w / 2, w, h - w / 2);
    c.fillStyle = cores[1];
    c.fillRect(-w / 2, -h + w / 2, w / 2, h - w / 2);
    // A ponta em bisel.
    for (let j = 0; j < w / 2; j += b) {
      c.fillStyle = cores[0];
      c.fillRect(-w / 2 + j, -h + w / 2 - j - b, w - j * 2, b);
    }
    c.fillStyle = cores[3];
    c.fillRect(-w / 2 + b, -h + w / 2 + b, b, h * 0.5);
    c.restore();
  }
}

/** Os cacos de vidro e as gotas voando de uma garrafa que estourou. */
function estilhacos(c: Ctx, cx: number, cy: number, r: number, cor: string, semente: number, b: number): void {
  for (let i = 0; i < 26; i++) {
    const a = acaso(i, 1, semente) * Math.PI * 2, d = r * (0.3 + acaso(i, 2, semente) * 0.7);
    const x = g(cx + Math.cos(a) * d, b), y = g(cy + Math.sin(a) * d, b);
    c.fillStyle = acaso(i, 3, semente) > 0.5 ? '#d4e5f7' : cor;
    c.globalAlpha = 0.6 + acaso(i, 4, semente) * 0.4;
    c.fillRect(x, y, b * (1 + Math.round(acaso(i, 5, semente))), b);
  }
  c.globalAlpha = 1;
}

/** As partículas de crítico do jogo (as estrelinhas marrons e brancas). */
function criticos(c: Ctx, cx: number, cy: number, r: number, semente: number, b: number): void {
  for (let i = 0; i < 34; i++) {
    const a = acaso(i, 1, semente) * Math.PI * 2, d = r * Math.sqrt(acaso(i, 2, semente));
    const x = g(cx + Math.cos(a) * d, b), y = g(cy + Math.sin(a) * d, b);
    const cor = acaso(i, 3, semente) > 0.5 ? '#ffffff' : '#e8c890';
    c.globalAlpha = 0.9;
    c.fillStyle = cor;
    c.fillRect(x, y - b, b, b * 3);
    c.fillRect(x - b, y, b * 3, b);
  }
  c.globalAlpha = 1;
}

/** O corte da espada: a meia-lua branca com a borda vermelha, mais fina nas pontas. */
function corte(c: Ctx, cx: number, cy: number, r: number, de: number, ate: number, grossura: number, b: number): void {
  const passos = Math.ceil((Math.abs(ate - de) * r) / b);
  for (const [extra, cor, alfa] of [[b * 4, '#ff2a2a', 0.18], [b * 2, '#ff5050', 0.55], [0, '#ffe8e8', 1]] as const) {
    c.globalAlpha = alfa;
    c.fillStyle = cor;
    for (let k = 0; k <= passos; k++) {
      const t = k / passos;
      const a = de + (ate - de) * t;
      const esp = Math.sin(Math.PI * t) * grossura + extra;
      for (let e = -esp / 2; e <= esp / 2; e += b) {
        c.fillRect(g(cx + Math.cos(a) * (r + e), b), g(cy + Math.sin(a) * (r + e), b), b, b);
      }
    }
  }
  c.globalAlpha = 1;
}

/** A névoa do pântano: faixas soltas, transparentes. */
function nevoa(c: Ctx, x: number, y: number, w: number, h: number, cor: string, n: number, semente: number, b: number): void {
  for (let i = 0; i < n; i++) {
    c.fillStyle = cor;
    c.globalAlpha = 0.04 + acaso(i, 33, semente) * 0.05;
    c.fillRect(g(x - 200 + acaso(i, 32, semente) * w, b), g(y + acaso(i, 31, semente) * h, b), 260 + acaso(i, 34, semente) * 420, b * (2 + Math.floor(acaso(i, 35, semente) * 5)));
  }
  c.globalAlpha = 1;
}

/** O chão do pântano: água escura com reflexo e o mato na beirada. */
function pantano(c: Ctx, x: number, topo: number, w: number, fundo: number, b: number, agua: string, reflexo: string): void {
  c.fillStyle = agua;
  c.fillRect(x, topo, w, fundo - topo);
  for (let i = 0; i < 90; i++) {
    c.fillStyle = acaso(i, 13, 2) > 0.6 ? reflexo : '#123c32';
    c.globalAlpha = 0.7;
    c.fillRect(g(x + acaso(i, 11, 2) * w, b), g(topo + b * 2 + acaso(i, 12, 2) * (fundo - topo - b * 4), b), b * (3 + Math.floor(acaso(i, 14, 2) * 7)), b);
  }
  c.globalAlpha = 1;
  for (let xx = x; xx < x + w; xx += b) {
    const alto = 1 + Math.floor(acaso(xx, 21, 2) * 4);
    c.fillStyle = acaso(xx, 22, 2) > 0.5 ? '#0f3a1c' : '#0b2d16';
    c.fillRect(xx, topo - alto * b, b, alto * b);
  }
}

// ── O quadro ────────────────────────────────────────────────────────────────

interface Tema {
  nivel: 1 | 2 | 3;
  /** Onde fica o topo do pódio (fração da altura): quanto mais alto o lugar, mais alto o pódio. */
  topoPodio: number;
  pedra: readonly [string, string, string, string];
  bloco: 'ouro' | 'diamante' | 'esmeralda';
  aura: string;
  ceu: readonly string[];
  manchete: string;
  corManchete: string;
  sombraManchete: string;
  linhaManchete: string;
  placa: { nome: string; descricao: string; raridade: string; icone: Item };
  agradecimento: string;
  /** A foto: altura em que a pessoa aparece (fração do espaço acima do pódio) e onde fica o rosto (x da foto). */
  foto: { escala: number; rostoX: number; deslocaX: number; sobe: number };
  medalhao: { x: number; y: number };
}

/** Os textos e as cores de cada degrau. */
function temaDe(h: Heroi): Tema {
  if (h.posicao === 3) return {
    nivel: 1, topoPodio: 0.6, bloco: 'esmeralda', aura: '#2fd860',
    pedra: ['#2fd860', '#109a3e', '#063d1a', '#e6ffee'],
    ceu: ['#040306', '#070409', '#0b050c', '#10060e', '#160810', '#1d0a12', '#240c13', '#2c0f14', '#341214', '#3c1614'],
    manchete: 'GOLPE FINAL', corManchete: '#ff4040', sombraManchete: '#3f0000',
    linhaManchete: 'Foi dele o golpe que derrubou a Bruxa do Pântano',
    placa: { nome: 'O Golpe Final', descricao: 'Top 3 e o último golpe na Bruxa do Pântano', raridade: '★ Feito único: só um no jogo todo ★', icone: ESPADA_DIAMANTE },
    agradecimento: `A bruxa caiu com o seu golpe: top 3 entre ${PARTICIPANTES} pessoas.`,
    foto: { escala: 0.86, rostoX: 640, deslocaX: -30, sobe: 0 },
    medalhao: { x: 0.155, y: 0.42 },
  };
  if (h.posicao === 2) return {
    nivel: 2, topoPodio: 0.585, bloco: 'diamante', aura: '#4fe0e8',
    pedra: ['#4fe0e8', '#1f9fb0', '#0b3f4a', '#eaffff'],
    ceu: ['#020509', '#03080d', '#040b12', '#050f18', '#06131e', '#071824', '#081d2a', '#0a2330', '#0c2936', '#0e303c'],
    manchete: 'TERROR DO PÂNTANO', corManchete: '#8af6ff', sombraManchete: '#06303a',
    linhaManchete: 'Top 2 - a bruxa congelou de medo',
    placa: { nome: 'Terror do Pântano', descricao: 'Top 2 contra a Bruxa do Pântano', raridade: '★ Raridade lendária ★', icone: DIAMANTE },
    agradecimento: `183 críticos, o maior número do pódio: top 2 entre ${PARTICIPANTES} pessoas.`,
    foto: { escala: 0.9, rostoX: 730, deslocaX: -40, sobe: 0 },
    medalhao: { x: 0.15, y: 0.4 },
  };
  return {
    nivel: 3, topoPodio: 0.57, bloco: 'ouro', aura: '#ffd23a',
    pedra: ['#ff5555', '#c81818', '#5a0000', '#ffd0d0'],
    ceu: ['#050308', '#08040c', '#0d0610', '#130814', '#1a0b16', '#220f16', '#2b1414', '#351a12', '#402210', '#4a2a0e'],
    manchete: 'PESADELO DA BRUXA', corManchete: '#ffd23a', sombraManchete: '#3a2200',
    linhaManchete: 'Top 1 - ninguém tirou mais vida dela',
    placa: { nome: 'Pesadelo da Bruxa', descricao: 'Top 1 contra a Bruxa do Pântano', raridade: '★ Raridade mítica ★', icone: COROA },
    agradecimento: `O maior dano da caçada: top 1 entre ${PARTICIPANTES} pessoas.`,
    foto: { escala: 0.86, rostoX: 610, deslocaX: 0, sobe: 0 },
    medalhao: { x: 0.14, y: 0.39 },
  };
}

/**
 * Um quadro inteiro. A foto já sem fundo (`recortarFoto`) e as fontes prontas
 * (`prepararFontes` de `carta.ts`).
 */
export function desenharQuadro(h: Heroi, foto: FotoRecortada): HTMLCanvasElement {
  const { w: W, h: H } = TAMANHO[h.posicao];
  const f = W / 1440;
  const b = 6;
  const t = temaDe(h);
  const m = metalDaPosicao(h.posicao);
  const B = g(t.nivel === 1 ? 54 : t.nivel === 2 ? 66 : 78, b);
  const cv = novoCanvas(W, H);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;

  moldura(c, W, H, m, B, t.nivel, b, t.pedra);
  c.save();
  c.beginPath();
  c.rect(B, B, W - B * 2, H - B * 2);
  c.clip();

  const topo = g(H * t.topoPodio, b);
  const meio = W / 2;
  faixas(c, B, B, W - B * 2, topo - B + 120 * f, t.ceu, b);
  estrelas(c, B, B, W - B * 2, topo * 0.7, 150, h.posicao, m.brilho, b);

  // A cena de trás (antes da pessoa): cada degrau tem a sua.
  if (h.posicao === 3) cenaGolpeFinal(c, W, H, f, b, B, topo);
  else if (h.posicao === 2) cenaGelo(c, W, H, f, b, B, topo, m);
  else cenaCoroa(c, W, H, f, b, B, topo, m);

  // O chão do pântano atrás do pódio.
  pantano(c, B, topo + 60 * f, W - B * 2, H - B, b, '#071a17', '#1d5a48');
  nevoa(c, B, topo - 120 * f, W - B * 2, 260 * f, h.posicao === 3 ? '#ff7a7a' : h.posicao === 2 ? '#9ff6ff' : '#ffe08a', 16, h.posicao, b);

  // O topo do quadro: o evento e a manchete.
  mc(c, 'Caça às Bruxas - Halloween 2026', meio, B + 30 * f, Math.round(3 * f), m.luz, PRETO);
  let yManchete = B + 210 * f;
  if (h.posicao === 3) {
    barraDoChefe(c, meio, B + 78 * f, 860 * f, 0, Math.round(4 * f), 'vida 0 - derrotada');
    yManchete = B + 360 * f;
  }
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const tam = caber(c, t.manchete, px => `${px}px ${TERROR}`, Math.round((h.posicao === 3 ? 220 : 170) * f), W - B * 2 - 120 * f, 40);
  c.translate(meio, yManchete);
  c.rotate(h.posicao === 3 ? -0.05 : 0);
  c.font = `${tam}px ${TERROR}`;
  // O contorno grosso e o brilho em cima.
  c.fillStyle = PRETO;
  for (let a = 0; a < 16; a++) c.fillText(t.manchete, Math.cos((a / 16) * Math.PI * 2) * 10 * f, Math.sin((a / 16) * Math.PI * 2) * 10 * f);
  c.fillStyle = t.sombraManchete;
  c.fillText(t.manchete, 7 * f, 9 * f);
  c.fillStyle = t.corManchete;
  c.fillText(t.manchete, 0, 0);
  c.restore();
  const lm = quebrarMC(t.linhaManchete, Math.floor((W - B * 2 - 140 * f) / Math.round(4 * f)));
  lm.forEach((l, i) => {
    // A tarja escura atrás da frase: lê em cima de qualquer coisa da cena.
    const e = Math.round(4 * f), lw = larguraTextoMC(l) * e, ly = yManchete + 30 * f + i * 40 * f;
    c.fillStyle = PRETO;
    c.globalAlpha = 0.62;
    c.fillRect(g(meio - lw / 2 - e * 4, b), ly - e * 2, g(lw + e * 8, b), e * 12);
    c.globalAlpha = 1;
    mc(c, l, meio, ly, e, '#ffffff', PRETO);
  });

  // A pessoa, em pé no pódio.
  const s = (topo - (yManchete + 70 * f)) / foto.caixa.h * t.foto.escala;
  const fy = topo + 40 * f - (foto.caixa.y + foto.caixa.h) * s - t.foto.sobe * f;
  const fx = meio + t.foto.deslocaX * f - t.foto.rostoX * s;
  medalhao(c, m, h.posicao, W * t.medalhao.x, H * t.medalhao.y, f, t.nivel >= 2);
  heroi(c, foto, fx, fy, s, t.aura, b);

  // A cena da frente (por cima da pessoa).
  if (h.posicao === 3) frenteGolpeFinal(c, W, f, b, topo);
  else if (h.posicao === 2) frenteGelo(c, W, f, b, topo);
  else frenteCoroa(c, W, f, b, topo, fx, fy, s, foto);


  // O pódio: blocos do metal, cada degrau mais alto.
  const lado = g(96 * f, b);
  const pw = W - B * 2 - 120 * f;
  podio(c, meio - pw / 2, topo, pw, H - B - topo, texturaDoBloco(m, t.bloco), m, lado);
  // O véu escuro na face, para ler o texto.
  c.fillStyle = '#030605';
  c.globalAlpha = 0.72;
  c.fillRect(meio - pw / 2 + 30 * f, topo + 110 * f, pw - 60 * f, H - B - topo - 150 * f);
  c.globalAlpha = 1;

  fita(c, m, h.nome, h.setor, meio, topo + 10 * f, 1040 * f, 132 * f, b);
  // A face do pódio, de baixo para cima: o rodapé, o agradecimento, a placa e os números.
  // O que sobra (o pódio mais alto tem mais) fica dividido entre os vãos.
  const escalaPlaca = Math.round(3.4 * f);
  const alturaPlaca = 62 * escalaPlaca;
  const linhasAgr = quebrarMC(t.agradecimento, Math.floor((pw - 140 * f) / Math.max(3, Math.round(3 * f)))).length;
  const alturaAgr = 22 * f + linhasAgr * 11 * Math.max(3, Math.round(3 * f));
  const fim = H - B - 70 * f;
  const comeco = topo + 140 * f;
  const ocupado = 140 * f + alturaPlaca + 60 * f + alturaAgr;
  const vao = Math.max(30 * f, (fim - comeco - ocupado) / 3);
  const yNum = comeco + vao * 0.6;
  numeros(c, m, h, meio, yNum, pw - 120 * f, 140 * f, b);
  const yPlaca = yNum + 140 * f + vao;
  placa(c, meio, yPlaca, escalaPlaca, t.placa.nome, t.placa.descricao, t.placa.raridade, t.placa.icone);
  const yAgr = yPlaca + alturaPlaca + vao + 60 * f;
  agradecimento(c, meio, yAgr, pw - 140 * f, t.agradecimento, f);

  // O rodapé.
  c.font = `${Math.round(16 * f)}px ${ARCADE}`;
  c.fillStyle = m.luz;
  c.globalAlpha = 0.85;
  c.textAlign = 'left';
  c.fillText(`Nº ${String(h.posicao).padStart(2, '0')}/${PARTICIPANTES}`, B + 40 * f, H - B - 26 * f);
  c.textAlign = 'right';
  c.fillText(`${m.nome.toUpperCase()}  ·  ${DATA_DA_QUEDA}`, W - B - 40 * f, H - B - 26 * f);
  c.globalAlpha = 1;
  c.textAlign = 'left';
  c.restore();

  // A teia nos cantos de dentro.
  c.globalAlpha = 0.55;
  item(c, TEIA_MC, B, B, Math.round(7 * f));
  item(c, TEIA_MC, W - B - 16 * Math.round(7 * f), B, Math.round(7 * f), true);
  c.globalAlpha = 1;
  return cv;
}

// ── 3º · O golpe final ──────────────────────────────────────────────────────

/** A lua de sangue, os raios, a espada atrás e a bruxa despencando com os drops. */
function cenaGolpeFinal(c: Ctx, W: number, _H: number, f: number, b: number, B: number, topo: number): void {
  const lx = W * 0.74, ly = topo * 0.42, R = g(250 * f, b * 2);
  for (const [extra, alfa] of [[90, 0.05], [60, 0.08], [30, 0.12]] as const) {
    c.globalAlpha = alfa;
    disco(c, lx, ly, R + extra * f, b * 2, () => '#ff5a40');
  }
  c.globalAlpha = 1;
  disco(c, lx, ly, R, b * 2, (x, y, dd) => {
    if (dd > (R - b * 4) ** 2) return '#8a1f14';
    const cratera = [[-90, -60, 70], [110, 40, 50], [-20, 120, 60], [60, -150, 36], [-160, 70, 30]]
      .some(([cx, cy, cr]) => (x - cx * f) ** 2 + (y - cy * f) ** 2 <= (cr * f) ** 2);
    if (cratera) return acaso(x, y, 5) > 0.5 ? '#a8301c' : '#9a2818';
    return acaso(x, y, 9) > 0.86 ? '#e2604a' : '#c4432c';
  });
  raios(c, lx, ly, 20, '#ff8a6a', 0.05, 90 * f, 1600 * f);
  relampago(c, W * 0.1, B, topo * 0.55, 3, b);
  relampago(c, W * 0.9, B, topo * 0.38, 7, b);

  // A espada gigante atrás da pessoa, encantada, com a ponta para a bruxa.
  halo(c, W * 0.46, topo * 0.5, 300 * f, '#b06cff', 0.2, b * 2);
  encantado(c, ESPADA_DIAMANTE, W * 0.44, topo * 0.56, Math.round(38 * f), 0);

  // O corte da espada: sai de cima da cabeça dele e acerta a bruxa em cheio.
  const bx = W * 0.79, by = topo * 0.47;
  const ox = W * 0.48, oy = topo * 1.02, raio = Math.hypot(bx - ox, by - oy);
  corte(c, ox, oy, raio, -2.45, Math.atan2(by - oy, bx - ox) + 0.12, 70 * f, b);

  // A bruxa caindo para trás: em frangalhos, de olhos fechados, girando.
  halo(c, bx, by, 260 * f, '#7a2fd0', 0.45, b * 2);
  girado(c, bruxaMC(12, 3, true), bx, by, Math.round(7 * f), 0.55, '#0d0a12', '#9a4dff');
  // O impacto: o clarão e as estrelinhas do crítico.
  halo(c, bx - 10 * f, by + 60 * f, 80 * f, '#ffffff', 0.22, b);
  brilho(c, bx - 10 * f, by + 60 * f, b * 2, '#ffd0d0', 1);
  criticos(c, bx - 30 * f, by - 40 * f, 190 * f, 11, b);
  // Os drops dela voando.
  const voando: [number, number, number, number][] = [
    [0.93, 0.36, 0.5, 5], [0.68, 0.3, -0.6, 4], [0.95, 0.66, 0.9, 5], [0.7, 0.72, -0.3, 4], [0.86, 0.22, 0.2, 4], [0.62, 0.62, 1.2, 4], [0.97, 0.5, -1.1, 4],
  ];
  voando.forEach(([px, py, giro, s], i) => {
    const it = DROPS[i % DROPS.length];
    halo(c, W * px, topo * py, 34 * f, '#ffd8a0', 0.18, b);
    itemGirado(c, it, W * px, topo * py, Math.round(s * f), giro, '#ffffff');
  });
  estilhacos(c, W * 0.9, topo * 0.44, 120 * f, '#8932b8', 4, b);
  estilhacos(c, W * 0.72, topo * 0.68, 90 * f, '#f82423', 5, b);
}

/** Por cima da pessoa: a poeira do crítico ainda caindo do lado dela. */
function frenteGolpeFinal(c: Ctx, W: number, f: number, b: number, topo: number): void {
  criticos(c, W * 0.88, topo * 0.72, 100 * f, 13, b);
}

// ── 2º · O gelo ──────────────────────────────────────────────────────────────

/** A aurora, o feixe de diamante, as espadas cruzadas e os cristais. */
function cenaGelo(c: Ctx, W: number, _H: number, f: number, b: number, B: number, topo: number, m: Metal): void {
  // A aurora: faixas onduladas e transparentes.
  for (const [cor, base, amp, fase, alfa] of [['#4fe0e8', 0.2, 60, 0, 0.12], ['#9d4ee8', 0.27, 80, 2, 0.1], ['#b8fbff', 0.33, 50, 4, 0.08]] as const) {
    c.fillStyle = cor;
    for (let x = B; x < W - B; x += b * 2) {
      const y = topo * base + Math.sin(x / (160 * f) + fase) * amp * f;
      for (let k = 0; k < 5; k++) {
        c.globalAlpha = alfa * (1 - k / 5);
        c.fillRect(x, g(y + k * 26 * f, b), b * 2, 26 * f);
      }
    }
  }
  c.globalAlpha = 1;
  raios(c, W / 2, topo * 0.55, 24, m.luz, 0.05, 80 * f, 1800 * f);
  feixe(c, W / 2, B, topo, 130 * f, '#4fe0e8', b);
  // As duas espadas de diamante cruzadas atrás dela.
  halo(c, W / 2, topo * 0.42, 280 * f, '#4fe0e8', 0.18, b * 2);
  encantado(c, ESPADA_DIAMANTE, W * 0.5 - 150 * f, topo * 0.46, Math.round(30 * f), 0);
  c.save();
  c.translate(W * 0.5 + 150 * f, topo * 0.46);
  c.scale(-1, 1);
  encantado(c, ESPADA_DIAMANTE, 0, 0, Math.round(30 * f), 0);
  c.restore();
  // Os diamantes flutuando em volta.
  const voando: [number, number, number][] = [[0.1, 0.5, -0.3], [0.88, 0.3, 0.4], [0.94, 0.55, -0.2], [0.18, 0.28, 0.2], [0.8, 0.12, 0], [0.24, 0.72, 0.5]];
  voando.forEach(([px, py, giro], i) => {
    halo(c, W * px, topo * py, 44 * f, '#4fe0e8', 0.3, b);
    itemGirado(c, DIAMANTE, W * px, topo * py, Math.round((i % 2 ? 5 : 6) * f), giro, '#b8fbff');
  });
  brilho(c, W * 0.3, topo * 0.2, b, '#eaffff', 1);
  brilho(c, W * 0.72, topo * 0.4, b, '#eaffff', 1);
}

/** Por cima: a bruxa presa no bloco de gelo, e os cristais nascendo no pódio. */
function frenteGelo(c: Ctx, W: number, f: number, b: number, topo: number): void {
  const bw = g(276 * f, b), bh = g(440 * f, b), bx = g(W - 66 * f - 40 * f - bw, b), by = g(topo - bh - 40 * f, b);
  const dentro = bruxaMC(12, 2, true);
  halo(c, bx + bw / 2, by + bh / 2, 260 * f, '#9ff6ff', 0.35, b * 2);
  // O fundo do gelo (o azul do gelo compactado do jogo, em placas).
  for (let y = by; y < by + bh; y += b * 2) for (let x = bx; x < bx + bw; x += b * 2) {
    const r = acaso(x, y, 73);
    c.fillStyle = r > 0.8 ? '#a9c9f7' : r > 0.4 ? '#8db4ec' : '#7ea6e2';
    c.globalAlpha = 0.9;
    c.fillRect(x, y, b * 2, b * 2);
  }
  c.globalAlpha = 1;
  // Ela dentro do gelo, um pouco torta e azulada de frio.
  girado(c, dentro, bx + bw / 2, by + bh / 2 + 6 * f, Math.round(4 * f), 0.12, '#0d0a12', null);
  c.fillStyle = '#bfe0ff';
  c.globalAlpha = 0.3;
  c.fillRect(bx, by, bw, bh);
  // As riscas brancas do gelo e as rachaduras.
  c.globalAlpha = 0.75;
  c.fillStyle = '#eaf6ff';
  for (let y = by; y < by + bh; y += b) for (let x = bx; x < bx + bw; x += b) if (acaso(x, y, 71) > 0.95) c.fillRect(x, y, b * 3, b);
  c.globalAlpha = 0.9;
  c.fillStyle = '#ffffff';
  for (let k = 0; k < 16; k++) c.fillRect(bx + b * 2 + k * b, by + b * 3 + k * b * 2, b, b * 2);
  for (let k = 0; k < 9; k++) c.fillRect(bx + bw - b * 6 - k * b, by + bh * 0.55 + k * b * 2, b, b * 2);
  c.globalAlpha = 1;
  // A borda: preta por fora, clara por dentro (o bloco do jogo).
  c.fillStyle = PRETO;
  c.fillRect(bx - b, by - b, bw + b * 2, b);
  c.fillRect(bx - b, by + bh, bw + b * 2, b);
  c.fillRect(bx - b, by, b, bh);
  c.fillRect(bx + bw, by, b, bh);
  c.fillStyle = '#e6f4ff';
  c.fillRect(bx, by, bw, b);
  c.fillRect(bx, by, b, bh);
  c.fillStyle = '#5f86c8';
  c.fillRect(bx, by + bh - b, bw, b);
  c.fillRect(bx + bw - b, by, b, bh);
  // Os pingentes de gelo pendurados embaixo e a neve em volta.
  for (let x = bx + b; x < bx + bw - b; x += b * 3) {
    const comp = (1 + Math.floor(acaso(x, 5, 75) * 4)) * b;
    c.fillStyle = PRETO;
    c.fillRect(x - b / 2, by + bh, b * 2, comp + b);
    c.fillStyle = '#d8eeff';
    c.fillRect(x, by + bh, b, comp);
  }
  for (let i = 0; i < 40; i++) {
    c.fillStyle = '#ffffff';
    c.globalAlpha = 0.5 + acaso(i, 2, 77) * 0.5;
    c.fillRect(g(bx - 80 * f + acaso(i, 1, 77) * (bw + 160 * f), b), g(by - 120 * f + acaso(i, 3, 77) * (bh + 160 * f), b), b, b);
  }
  c.globalAlpha = 1;
  // Os cristais nos cantos do pódio.
  cristais(c, 150 * f, topo, 220 * f, b, ['#eaffff', '#b8fbff', '#4fe0e8', '#ffffff'], 3);
  cristais(c, bx - 40 * f, topo, 150 * f, b, ['#eaffff', '#b8fbff', '#4fe0e8', '#ffffff'], 5, true);
  brilho(c, bx + bw - 30 * f, by + 30 * f, b, '#ffffff', 1);
  brilho(c, 160 * f, topo - 200 * f, b, '#ffffff', 0.9);
}

// ── 1º · A coroa ─────────────────────────────────────────────────────────────

/** O céu dourado: os raios de glória, os fogos, o feixe de ouro e os totens. */
function cenaCoroa(c: Ctx, W: number, _H: number, f: number, b: number, B: number, topo: number, m: Metal): void {
  raios(c, W / 2, topo * 0.5, 28, '#ffd23a', 0.08, 90 * f, 2200 * f, 0.05);
  halo(c, W / 2, topo * 0.5, 520 * f, '#ffb020', 0.14, b * 2);
  feixe(c, W / 2, B, topo, 150 * f, '#ffd23a', b);
  const estouros: [number, number, number, string, string][] = [
    [0.16, 0.16, 120, '#ff5555', '#ffd0d0'], [0.84, 0.14, 140, '#4fe0e8', '#eaffff'], [0.3, 0.07, 80, '#80ff20', '#e6ffd0'],
    [0.7, 0.3, 90, '#ff55ff', '#ffd8ff'], [0.1, 0.38, 80, '#ffd23a', '#fff6c8'], [0.92, 0.4, 100, '#ffd23a', '#fff6c8'],
  ];
  estouros.forEach(([px, py, r, cor, luz], i) => fogos(c, W * px, topo * py, r * f, cor, luz, i + 1, b));
  // Os confetes de ouro caindo.
  for (let i = 0; i < 160; i++) {
    const cores = ['#ffd23a', '#fff1a0', '#ff5555', '#4fe0e8', '#80ff20', '#ff55ff'];
    c.fillStyle = cores[i % cores.length];
    c.globalAlpha = 0.5 + acaso(i, 5, 9) * 0.5;
    c.fillRect(g(B + acaso(i, 1, 9) * (W - B * 2), b), g(B + acaso(i, 2, 9) * topo * 0.95, b), b * (1 + (i % 2)), b);
  }
  c.globalAlpha = 1;
  // As duas espadas de ouro cruzadas, bem atrás.
  encantado(c, ESPADA_OURO, W * 0.5 - 170 * f, topo * 0.5, Math.round(27 * f), 0);
  c.save();
  c.translate(W * 0.5 + 170 * f, topo * 0.5);
  c.scale(-1, 1);
  encantado(c, ESPADA_OURO, 0, 0, Math.round(27 * f), 0);
  c.restore();
  void m;
}

/** Por cima: a coroa na cabeça, os totens, o ouro no pódio e a bruxa presa na garrafa. */
function frenteCoroa(c: Ctx, W: number, f: number, b: number, topo: number, fx: number, fy: number, s: number, foto: FotoRecortada): void {
  // A coroa flutuando logo acima da cabeça.
  const cabecaX = fx + 620 * s, cabecaY = fy + foto.caixa.y * s;
  const cs = Math.round(10 * f);
  halo(c, cabecaX, cabecaY - 40 * f, 190 * f, '#ffd23a', 0.35, b * 2);
  girado(c, miniatura(COROA)[0], cabecaX, cabecaY - 50 * f, cs, -0.08, null, '#fff1a0');
  brilho(c, cabecaX - 120 * f, cabecaY - 150 * f, b, '#ffffff', 1);
  brilho(c, cabecaX + 140 * f, cabecaY - 40 * f, b, '#fff6c8', 0.9);
  brilho(c, cabecaX + 40 * f, cabecaY - 210 * f, b * 0.7, '#ffffff', 0.9);

  // O pote da bruxa: ela presa dentro, de olhos fechados, afundando na própria poção.
  pote(c, g(W - 78 * f - 24 * f - 42 * 7, 7), g(topo - 58 * 7 - 60 * f, 7), 7, f);

  // Os totens nos cantos do pódio e o ouro amontoado.
  const ts = Math.round(9 * f);
  halo(c, 190 * f, topo - 80 * f, 110 * f, '#41e67f', 0.25, b);
  girado(c, miniatura(TOTEM_MC)[0], 190 * f, topo - 80 * f, ts, -0.1, '#0d0a12', '#fff1a0');
  for (let i = 0; i < 7; i++) {
    const lx = 290 * f + (i % 4) * 58 * f + (i >= 4 ? 29 * f : 0), ly = topo - 84 * f - (i >= 4 ? 34 * f : 0);
    itemGirado(c, LINGOTE, lx, ly, Math.round(5 * f), 0, null, i % 2 === 1);
  }
  itemGirado(c, ESMERALDA, 420 * f, topo - 110 * f, Math.round(4 * f), 0.3, '#a8ffbf');
  itemGirado(c, DIAMANTE, 470 * f, topo - 90 * f, Math.round(4 * f), -0.2, '#b8fbff');
}

/**
 * O pote de vidro com a bruxa presa: 42 × 58 células de `q` px. A rolha em cima,
 * o gargalo, os ombros e o corpo; a poção roxa até a cintura dela, as bolhas
 * subindo e o reflexo do vidro por cima de tudo.
 */
function pote(c: Ctx, x: number, y: number, q: number, f: number): void {
  const L = 42, A = 58;
  /** A meia largura do pote em cada linha (em células). */
  const meia = (r: number): number => {
    if (r < 3) return 0;
    if (r < 9) return 9;
    if (r < 11) return 8;
    if (r < 17) return 9 + (r - 11) * 2;
    if (r > A - 4) return L / 2 - (r - (A - 4)) * 2;
    return L / 2;
  };
  const corpo = new Path2D();
  for (let r = 3; r < A; r++) corpo.rect(x + (L / 2 - meia(r)) * q, y + r * q, meia(r) * 2 * q, q);
  const cx = x + (L / 2) * q;
  halo(c, cx, y + A * q * 0.6, 230 * f, '#9a4dff', 0.4, q * 2);
  // O contorno: o pote pintado de preto, uma célula maior em volta.
  c.fillStyle = PRETO;
  for (let r = 2; r <= A; r++) {
    const m = Math.max(meia(r), meia(r - 1), meia(Math.min(A - 1, r + 1))) + 1;
    if (r >= 3 || meia(r + 1) > 0) c.fillRect(x + (L / 2 - m) * q, y + r * q, m * 2 * q, q);
  }
  c.save();
  c.clip(corpo);
  // O vidro de trás, a bruxa e a poção na frente dela.
  c.fillStyle = '#26183a';
  c.globalAlpha = 0.85;
  c.fillRect(x, y, L * q, A * q);
  c.globalAlpha = 1;
  const bruxa = bruxaMC(12, 3, false);
  const bs = 3;
  c.imageSmoothingEnabled = false;
  c.drawImage(bruxa, cx - (bruxa.width * bs) / 2, y + 17 * q, bruxa.width * bs, bruxa.height * bs);
  const nivel = y + 40 * q;
  c.fillStyle = '#8932b8';
  c.globalAlpha = 0.62;
  c.fillRect(x, nivel, L * q, A * q);
  c.fillStyle = '#c070ff';
  c.globalAlpha = 0.9;
  c.fillRect(x, nivel, L * q, q);
  c.fillStyle = '#e8b8ff';
  for (let i = 0; i < L; i += 3) if (acaso(i, 3, 81) > 0.5) c.fillRect(x + i * q, nivel - q, q * 2, q);
  // As bolhas subindo.
  for (let i = 0; i < 14; i++) {
    const bx = x + (6 + acaso(i, 1, 83) * (L - 12)) * q, by = nivel + (2 + acaso(i, 2, 83) * 12) * q;
    c.globalAlpha = 0.8;
    c.fillStyle = '#f0d8ff';
    c.fillRect(g(bx, q), g(by, q), q, q);
    if (i % 3 === 0) c.fillRect(g(bx, q) + q, g(by, q) - q * 2, q, q);
  }
  // O vidro da frente: azulado, o reflexo comprido à esquerda e o brilho.
  c.globalAlpha = 0.16;
  c.fillStyle = '#bfe8ff';
  c.fillRect(x, y, L * q, A * q);
  c.globalAlpha = 0.6;
  c.fillStyle = '#ffffff';
  c.fillRect(x + 4 * q, y + 18 * q, q * 2, q * 30);
  c.fillRect(x + 7 * q, y + 20 * q, q, q * 8);
  c.fillRect(x + (L - 6) * q, y + 22 * q, q, q * 18);
  c.globalAlpha = 1;
  c.restore();
  // A beirada do vidro (mais clara) no gargalo e nos ombros.
  c.fillStyle = '#d8f4ff';
  for (let r = 3; r < 17; r++) {
    c.fillRect(x + (L / 2 - meia(r)) * q, y + r * q, q, q);
    c.fillRect(x + (L / 2 + meia(r) - 1) * q, y + r * q, q, q);
  }
  // A rolha.
  for (let r = 0; r < 6; r++) {
    const w = r === 0 ? 8 : 10;
    c.fillStyle = PRETO;
    c.fillRect(cx - (w / 2 + 1) * q, y + (r - 1) * q, (w + 2) * q, q * 2);
  }
  for (let r = 0; r < 6; r++) {
    const w = r === 0 ? 8 : 10;
    c.fillStyle = r === 0 ? '#c99a62' : r % 2 ? '#8a5a2b' : '#a87440';
    c.fillRect(cx - (w / 2) * q, y + r * q, w * q, q);
  }
  c.fillStyle = '#e6c08a';
  c.fillRect(cx - 4 * q, y, q * 3, q);
  brilho(c, x + 5 * q, y + 16 * q, q, '#ffffff', 1);
  brilho(c, x + (L - 5) * q, y + 44 * q, q * 0.7, '#f0d8ff', 0.9);
}

// ── Os três juntos ───────────────────────────────────────────────────────────

/**
 * O pódio inteiro, com as bases alinhadas: 2º, 1º e 3º, como no pódio de
 * verdade. Os quadros de alturas diferentes formam a escada. `escala` reduz
 * para caber numa tela.
 */
export function desenharPodio(quadros: Readonly<Record<1 | 2 | 3, HTMLCanvasElement>>, escala = 0.5): HTMLCanvasElement {
  const ordem = [quadros[2], quadros[1], quadros[3]];
  const gap = 90, margem = 120, cabeca = 300;
  const w = ordem.reduce((s, q) => s + q.width, 0) + gap * 2 + margem * 2;
  const h = cabeca + Math.max(...ordem.map(q => q.height)) + margem;
  const cv = novoCanvas(Math.round(w * escala), Math.round(h * escala));
  const c = cv.getContext('2d')!;
  c.scale(escala, escala);
  faixas(c, 0, 0, w, h, ['#040306', '#06050a', '#08060e', '#0a0812', '#0c0a16', '#0e0c1a'], 12);
  estrelas(c, 0, 0, w, h * 0.6, 260, 21, '#fff6c8', 12);
  mc(c, 'Caça às Bruxas - Halloween 2026', w / 2, 70, 7, '#dcb6ff', PRETO);
  const e = Math.floor(1800 / larguraTextoMC(`Top 3 - ${NOME_CHEFONA}`));
  mc(c, `Top 3 - ${NOME_CHEFONA}`, w / 2, 150, Math.min(14, e), '#80ff20', '#1f3f08');
  let x = margem;
  const base = h - margem;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  for (const q of ordem) {
    c.fillStyle = '#000000';
    c.globalAlpha = 0.5;
    c.fillRect(x + 30, base - q.height + 40, q.width, q.height);
    c.globalAlpha = 1;
    c.drawImage(q, x, base - q.height);
    x += q.width + gap;
  }
  return cv;
}
