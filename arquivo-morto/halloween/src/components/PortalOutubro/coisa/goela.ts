/**
 * goela.ts — a bocarra do bote no mural (pedido de 29/10/2026, com duas fotos
 * de modelo: «para mordida no mouse reproduza a segunda e terceira imagem»).
 * A segunda (a cara de baixo, a boca escancarada com as presas compridas) é o
 * busto de `cabecona.ts` com a cabeça indo para trás; esta é a terceira: a
 * cabeça jogada para trás até a cara virar uma faixa em cima — o nariz, o
 * risco vermelho e o cabelo nas pontas — e, embaixo, a boca desencaixada do
 * tamanho da tela, com o lábio vermelho em volta e anéis e mais anéis de
 * dentinhos finos apontando para o fundo escuro, cada anel girando para um
 * lado.
 *
 *   `abre`  de 0 (a boca fechada numa linha) a 1 (escancarada)
 *   `giro`  quanto os anéis já giraram (o tempo, em segundos)
 *
 * Puro, como `cabecona.ts`: grade de letras e paleta; os testes conferem sem
 * navegador.
 */
import type { Paleta } from './arte';
import { contornar, grao } from './desenho';

export const LARGURA_DA_GOELA = 100;
export const ALTURA_DA_GOELA = 124;

const W = LARGURA_DA_GOELA, H = ALTURA_DA_GOELA;
const CX = (W - 1) / 2;
/** O meio da boca e a meia-largura dela. */
export const MEIO_DA_GOELA = [CX, 72] as const;
const RX = 42;
/** A meia-altura da boca fechada e o quanto ela cresce aberta. */
const RY_FECHADA = 1.5, RY_ABRE = 47;

/** Os anéis de dentes, de fora (junto do lábio) para dentro: onde ficam e o comprimento. */
const ANEIS: readonly (readonly [number, number])[] = [
  [0.87, 0.17], [0.69, 0.13], [0.53, 0.11], [0.39, 0.1],
];

type Grade = string[][];

function pintar(g: Grade, x: number, y: number, ch: string) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = ch;
}

function elipse(g: Grade, cx: number, cy: number, rx: number, ry: number, cor: (ex: number, ey: number, x: number, y: number) => string | null) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const ex = (x - cx) / rx, ey = (y - cy) / ry;
      if (ex * ex + ey * ey > 1) continue;
      const ch = cor(ex, ey, x, y);
      if (ch) pintar(g, x, y, ch);
    }
  }
}

function linha(x0: number, y0: number, x1: number, y1: number, cada: (x: number, y: number, i: number, n: number) => void) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, x = x0, y = y0, i = 0;
  for (;;) {
    cada(x, y, i++, n);
    if (x === x1 && y === y1) return;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x += sx; }
    if (e2 <= dx) { e += dx; y += sy; }
  }
}

/** A meia-altura da boca com este `abre`. */
export function alturaDaGoela(abre: number): number {
  return RY_FECHADA + RY_ABRE * Math.max(0, Math.min(1, abre));
}

/** A goela inteira, numa grade de `LARGURA_DA_GOELA × ALTURA_DA_GOELA`. */
export function montarGoela(abre = 1, giro = 0): string[] {
  const k = Math.max(0, Math.min(1, abre));
  const [, MY] = MEIO_DA_GOELA;
  const ry = alturaDaGoela(k);
  const g: Grade = Array.from({ length: H }, () => Array<string>(W).fill('.'));

  // A cara: a pele esticada em volta da boca e, em cima, a testa jogada para
  // trás (quanto mais aberta, mais fina a faixa). A sombra fria do lado esquerdo.
  const domo = 21 - 7 * k;
  const topoDaBoca = MY - ry;
  const pele = (ex: number, ey: number, x: number, y: number) => {
    if (ex < -0.72) return grao(x, y) < 0.2 ? 's' : 'W';
    if (ex < -0.5 || ey > 0.82) return 'W';
    return grao(x, y) < 0.05 ? 'W' : 'w';
  };
  elipse(g, CX, MY, RX + 6, ry + 6, pele);
  elipse(g, CX, topoDaBoca + 3, RX - 5, domo, (ex, ey, x, y) => (ey > 0.2 ? null : pele(ex, ey, x, y)));

  // O cabelo ruivo nas pontas da testa.
  for (const lado of [-1, 1]) {
    elipse(g, CX + lado * (RX - 7), topoDaBoca - domo * 0.45, 7, 5 + domo * 0.2, (ex, ey, x, y) => {
      if (grao(x, y) < 0.3 && ex * ex + ey * ey > 0.55) return null;
      return ex * lado > 0.2 || ey > 0.4 ? 'H' : grao(x + 2, y) < 0.25 ? 'j' : 'h';
    });
  }

  // O risco vermelho de cada lado, descendo da testa até o canto do lábio.
  const topoDaTesta = topoDaBoca - domo + 6;
  for (const lado of [-1, 1]) {
    linha(CX + lado * 11, topoDaTesta, CX + lado * RX * 0.66, MY - ry * 0.7, (x, y) => { pintar(g, x, y, 'r'); pintar(g, x + lado, y, 'R'); });
  }
  // O nariz, logo acima do lábio, vermelho-escuro.
  const ny = topoDaBoca - Math.max(3, domo * 0.45);
  for (const [dx, dy, ch] of [[-1, 0, 'n'], [0, 0, 'n'], [1, 0, 'n'], [2, 0, 'n'], [-1, 1, 'n'], [0, 1, 'R'], [1, 1, 'R'], [2, 1, 'n'], [0, -1, 'r'], [1, -1, 'n']] as const) {
    pintar(g, CX + dx, ny + dy, ch);
  }

  // A boca: o lábio em volta, a gengiva e o fundo, cada vez mais escuro.
  elipse(g, CX, MY, RX, ry, (ex, ey, x, y) => {
    const e = Math.sqrt(ex * ex + ey * ey);
    if (e > 0.93) return ey < 0 ? 'r' : 'R';
    if (e > 0.89) return 'B';
    const s = e / 0.89;
    if (s > 0.3 && grao(x, y) < 0.025) return 'i';
    if (s > 0.8) return 'f';
    if (s > 0.55) return grao(x, y) < 0.3 ? 'f' : 'F';
    if (s > 0.3) return grao(x, y) < 0.25 ? 'F' : 'G';
    return 'x';
  });

  // Os anéis de dentes: cones finos, da gengiva para o meio. Os de fora são
  // maiores e claros; os de dentro, menores e na sombra. Cada anel gira para
  // um lado (o que deixa a goela «mastigando»).
  if (ry > 5) {
    ANEIS.forEach(([s, comp], anel) => {
      const n = Math.round(10 + 26 * s);
      const fundo = anel >= 3;
      const sentido = anel % 2 ? 1 : -1;
      const desvio = giro * (0.35 + anel * 0.08) * sentido + anel * 0.37;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + desvio;
        const c = Math.cos(a), sn = Math.sin(a);
        const l = comp * (0.75 + 0.5 * grao(j, anel));
        const bx = CX + c * s * 0.89 * RX, by = MY + sn * s * 0.89 * ry;
        const px = CX + c * (s - l) * 0.89 * RX, py = MY + sn * (s - l) * 0.89 * ry;
        const deitado = Math.abs(sn) > Math.abs(c);
        linha(bx, by, px, py, (x, y, i, tot) => {
          const ponta = i === tot;
          pintar(g, x, y, ponta ? (fundo ? 't' : 'q') : fundo ? 'u' : 't');
          // A base larga (três pixels), afinando até a ponta.
          const lado = fundo ? 'U' : 'T';
          if (i < tot * 0.65) {
            if (deitado) pintar(g, x + 1, y, lado); else pintar(g, x, y + 1, lado);
          }
          if (i < tot * 0.3) {
            if (deitado) pintar(g, x - 1, y, fundo ? 'u' : 't'); else pintar(g, x, y - 1, fundo ? 'u' : 't');
          }
        });
      }
    });
  }

  contornar(g);
  return g.map(l => l.join(''));
}

/** As cores da foto: a pele de giz fria, o lábio vivo, a gengiva e os dentinhos amarelados. */
export const PALETA_DA_GOELA: Paleta = {
  o: '#0b0a10',
  w: '#e6e8e2', W: '#b9bdb6', s: '#7f8a8c',
  r: '#b0121c', R: '#5e050b', n: '#4a0a10', B: '#2a0306',
  h: '#b8521f', H: '#6f2c12', j: '#de7f3e',
  f: '#8a1c14', F: '#56100b', G: '#2a0505', x: '#0c0202', i: '#d9707a',
  t: '#d6cf9a', T: '#958c5c', q: '#f6f2d4', u: '#8d8456', U: '#4f4a30',
};
