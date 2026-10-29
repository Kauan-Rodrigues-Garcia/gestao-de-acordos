/**
 * pixelDoBueiro.ts — o bueiro, os olhos e a mão com o barco, em pixel art
 * (pedido de 29/10/2026: «todos os desenhos vão ser pixel art, o bueiro não
 * é, então redesenhe o bueiro, quero melhor ainda; a mão quero bem feita e em
 * pixel art segurando o barco»). Grades de letras, como o resto da Coisa
 * (`coisa/desenho.ts`); o `Bueiro.tsx` pinta num canvas, cada pixel em
 * `PX` × `PX` na tela. Puro: os testes conferem sem navegador.
 *
 * O bueiro é um pedaço quebrado da barra de cima (o `h-14`, 56 px = 18,7
 * pixels): o buraco de borda lascada com as rachaduras saindo pela barra, a
 * guia de concreto pontilhada (mais escura em cima, na sombra da barra), o
 * rebaixo com a cantoneira de ferro enferrujada, a boca de lobo, a beira da
 * guia passando da barra com as manchas da água, o limo nos cantos e dois
 * cacos da barra pendurados. As cores da barra (`B`, `R`, `r`) são as do tema
 * e entram na hora de pintar (`Bueiro.tsx`).
 */
/** O tamanho de um pixel do bueiro na tela. */
export const PX = 3;
export const LARGURA_DO_BUEIRO = 88;
export const ALTURA_DO_BUEIRO = 25;
/** A boca de lobo (o escuro dos olhos), em pixels. */
export const BOCA = { x: 18, y: 6, l: 52, a: 9 } as const;

type Grade = string[][];

function grade(l: number, a: number): Grade {
  return Array.from({ length: a }, () => Array<string>(l).fill('.'));
}

function pintar(g: Grade, x: number, y: number, ch: string) {
  if (y >= 0 && y < g.length && x >= 0 && x < g[y].length) g[y][x] = ch;
}

/** Ruído fixo por coordenada (as pedrinhas do concreto). */
function grao(x: number, y: number): number {
  const h = Math.imul((x * 73856093) ^ (y * 19349663), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** O pontilhado ordenado (Bayer 4 × 4): mistura dois tons sem degradê liso. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function pontilha(x: number, y: number, k: number): boolean {
  return k * 16 > BAYER[(y % 4) * 4 + (x % 4)] + 0.5;
}

/** Uma linha de pixels (Bresenham). */
function linha(g: Grade, x0: number, y0: number, x1: number, y1: number, ch: string) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let erro = dx + dy;
  for (;;) {
    pintar(g, x0, y0, ch);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * erro;
    if (e2 >= dy) { erro += dy; x0 += sx; }
    if (e2 <= dx) { erro += dx; y0 += sy; }
  }
}

/** A borda lascada do buraco na barra (pontos em pixels, no sentido do relógio). */
const BURACO: readonly (readonly [number, number])[] = [
  [10, 7], [11, 4], [14, 3], [17, 1], [21, 2], [25, 1], [29, 2], [34, 1], [38, 2], [43, 1], [47, 2], [51, 1],
  [55, 2], [59, 1], [63, 2], [68, 1], [71, 3], [74, 3], [76, 5], [78, 7], [77, 10], [79, 13], [77, 16], [79, 19],
  [76, 21], [12, 21], [8, 19], [10, 16], [8, 13], [10, 10],
];

function dentro(x: number, y: number): boolean {
  let d = false;
  for (let i = 0, j = BURACO.length - 1; i < BURACO.length; j = i++) {
    const [xi, yi] = BURACO[i], [xj, yj] = BURACO[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/** As rachaduras pela barra, saindo do buraco. */
const RACHAS: readonly (readonly [number, number])[][] = [
  [[10, 7], [5, 6], [1, 8]], [[5, 6], [4, 3]], [[9, 15], [4, 16], [0, 15]],
  [[78, 7], [83, 5], [87, 6]], [[83, 5], [84, 2]], [[78, 15], [83, 16], [87, 14]],
  [[43, 1], [42, 0]], [[63, 2], [65, 0]], [[25, 1], [24, 0]],
];
/** Os cacos da barra pendurados embaixo. */
const CACOS: readonly (readonly [number, number, number])[] = [[8, 19, 4], [76, 19, 3]];

/**
 * O bueiro. Letras: `B` a barra, `R` a borda dela, `r` as rachaduras; o
 * concreto de `1` (escuro) a `4` (claro), `k` as pedrinhas escuras, `L` as
 * claras; `E` a sombra da borda quebrada; `M`/`m` a cantoneira enferrujada;
 * `x` a boca; `T`/`U` o alto da guia, `F`/`G` a frente, `S` as manchas da
 * água, `j`/`J` o limo, `o` o contorno de baixo, `z` a sombra no chão.
 */
export function montarBueiro(): string[] {
  const g = grade(LARGURA_DO_BUEIRO, ALTURA_DO_BUEIRO);
  const { x: bx, y: by, l: bl, a: ba } = BOCA;
  const fimDaBoca = by + ba;
  for (let y = 0; y < ALTURA_DO_BUEIRO; y++) {
    for (let x = 0; x < LARGURA_DO_BUEIRO; x++) {
      if (!dentro(x + 0.5, y + 0.5)) continue;
      // O concreto: escuro em cima (a sombra da barra), clareando para baixo, pontilhado.
      const k = Math.min(1, Math.max(0, (y - 1) / 12)) * 3;
      const base = Math.floor(k), tom = base + (pontilha(x, y, k - base) ? 1 : 0);
      let ch = String(Math.min(4, tom + 1));
      const r = grao(x, y);
      if (r < 0.07) ch = 'k';
      else if (r > 0.95) ch = 'L';
      pintar(g, x, y, ch);
    }
  }
  // A sombra da borda quebrada, logo por dentro do buraco (a grossura da barra).
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < LARGURA_DO_BUEIRO; x++) {
      if (g[y][x] === '.' || g[y][x] === 'E') continue;
      const borda = [[0, -1], [-1, 0], [1, 0]].some(([dx, dy]) => (g[y + dy]?.[x + dx] ?? '.') === '.');
      if (borda) g[y][x] = 'E';
    }
  }
  // Uma rachadura no concreto.
  linha(g, 13, 8, 15, 12, 'k'); linha(g, 15, 12, 14, 15, 'k');
  linha(g, 74, 7, 72, 11, 'k');
  // O rebaixo em volta da boca: a cantoneira de ferro em cima, os lados na sombra.
  for (let x = bx - 2; x < bx + bl + 2; x++) {
    pintar(g, x, by - 2, grao(x, 3) < 0.3 ? 'm' : 'M');
    pintar(g, x, by - 1, '1');
  }
  for (let y = by - 1; y < fimDaBoca; y++) {
    pintar(g, bx - 2, y, '2'); pintar(g, bx - 1, y, '1');
    pintar(g, bx + bl, y, '1'); pintar(g, bx + bl + 1, y, '2');
  }
  for (let y = by; y < fimDaBoca; y++) for (let x = bx; x < bx + bl; x++) pintar(g, x, y, 'x');
  // A beira da guia: o alto na luz, a frente com as emendas e as manchas.
  for (let x = 12; x < 77; x++) {
    pintar(g, x, fimDaBoca, pontilha(x, 0, 0.3) ? 'U' : 'T');
    pintar(g, x, fimDaBoca + 1, pontilha(x, 1, 0.6) ? 'U' : 'T');
    for (let y = fimDaBoca + 2; y < 20; y++) pintar(g, x, y, pontilha(x, y, (y - fimDaBoca - 2) / 4) ? 'G' : 'F');
    pintar(g, x, 20, 'o');
  }
  pintar(g, 11, fimDaBoca + 1, 'U'); pintar(g, 77, fimDaBoca + 1, 'U');
  for (const x of [28, 46, 64]) for (let y = fimDaBoca + 2; y < 20; y++) pintar(g, x, y, 'o');
  for (const [x, comp] of [[22, 3], [33, 2], [38, 4], [52, 3], [59, 2]] as const) {
    for (let y = fimDaBoca + 2; y < fimDaBoca + 2 + comp; y++) pintar(g, x, y, 'S');
  }
  // O limo nos cantos da boca.
  for (const [x, y, ch] of [[bx, fimDaBoca, 'j'], [bx + 1, fimDaBoca, 'J'], [bx - 1, fimDaBoca, 'J'], [bx + bl - 1, fimDaBoca, 'J'], [bx + bl, fimDaBoca, 'j'], [bx + 4, fimDaBoca + 1, 'j']] as const) {
    pintar(g, x, y, ch);
  }
  // A borda da barra em volta do buraco, as rachaduras e os cacos pendurados.
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < LARGURA_DO_BUEIRO; x++) {
      if (g[y][x] !== '.') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const c = g[y + dy]?.[x + dx]; return c != null && c !== '.' && c !== 'R'; })) g[y][x] = 'R';
    }
  }
  for (const pontos of RACHAS) for (let i = 1; i < pontos.length; i++) {
    const [x0, y0] = pontos[i - 1], [x1, y1] = pontos[i];
    linha(g, x0, y0, x1, y1, 'r');
  }
  for (const [x0, y0, l] of CACOS) {
    for (let y = 0; y < l; y++) for (let x = x0 + y; x < x0 + l - Math.floor(y / 2); x++) pintar(g, x, y0 + y, y === l - 1 ? 'R' : 'B');
    pintar(g, x0 - 1 + 0, y0, 'R'); pintar(g, x0 + l, y0, 'R');
  }
  // A sombra da guia no que está embaixo da barra.
  for (let y = 21; y < ALTURA_DO_BUEIRO; y++) {
    for (let x = 10 + (y - 21); x < 79 - (y - 21); x++) if (g[y][x] === '.' && pontilha(x, y, 0.7 - (y - 21) * 0.18)) g[y][x] = 'z';
  }
  return g.map(l => l.join(''));
}

/** As cores fixas do bueiro (as da barra entram pelo tema: `B`, `R`, `r`). */
export const PALETA_DO_BUEIRO: Readonly<Record<string, string>> = {
  1: '#2f3437', 2: '#41474a', 3: '#555c5f', 4: '#6b7275',
  k: '#25292b', L: '#8c9396', E: '#1b1e20',
  M: '#5c3019', m: '#8a4a24', x: '#000000',
  T: '#a3aaac', U: '#8a9194', F: '#5f6669', G: '#484e51', S: '#33383a',
  j: '#3e5a2a', J: '#59783a', o: '#16191a', z: 'rgba(0, 0, 0, 0.32)',
};

// ── Os olhos no escuro ──────────────────────────────────────────────────────

/** Os dois olhos dentro da boca (x, y do meio de cada um). */
const OLHOS = [[19, 4], [32, 4]] as const;

/**
 * Os olhos na boca (a grade do tamanho da `BOCA`): a íris acesa, a pupila de
 * dois pixels que anda com `olhar` (−1 a 1), a pálpebra de baixo, a
 * sobrancelha preta inclinada para dentro (a cara de raiva) e o brilho em
 * volta, pontilhado. Piscando, só o risco da pálpebra.
 */
export function montarOlhos(olhar: number, piscando: boolean): string[] {
  const g = grade(BOCA.l, BOCA.a);
  const p = Math.max(-1, Math.min(1, Math.round(olhar)));
  OLHOS.forEach(([cx, cy], k) => {
    const l = k ? -1 : 1;
    const X = (dx: number) => cx + dx * l;
    // O brilho em volta.
    for (let y = cy - 3; y <= cy + 3; y++) {
      for (let x = cx - 6; x <= cx + 6; x++) {
        const d = ((x - cx) / 6) ** 2 + ((y - cy) / 3) ** 2;
        if (d <= 1 && (x + y) % 2 === 0) pintar(g, x, y, 'h');
      }
    }
    if (piscando) {
      for (let dx = -3; dx <= 3; dx++) pintar(g, X(dx), cy, 'c');
    } else {
      for (let dx = -2; dx <= 1; dx++) pintar(g, X(dx), cy - 1, dx === 1 ? 'b' : 'a');
      for (let dx = -3; dx <= 3; dx++) pintar(g, X(dx), cy, Math.abs(dx) === 3 ? 'b' : 'a');
      for (let dx = -1; dx <= 3; dx++) pintar(g, X(dx), cy + 1, 'c');
      pintar(g, cx + p, cy, 'p');
      pintar(g, cx + p, cy - 1, 'p');
    }
    // A sobrancelha: em cima e descendo para o lado de dentro.
    for (let dx = -4; dx <= 3; dx++) pintar(g, X(dx), cy - 2, 'x');
    for (let dx = 2; dx <= 4; dx++) pintar(g, X(dx), cy - 1, 'x');
    pintar(g, X(-5), cy - 3, 'x'); pintar(g, X(4), cy - 2, 'x');
  });
  return g.map(l => l.join(''));
}

/** As cores dos olhos: amarelos e, com a mão para fora, vermelhos. `aceso`: o brilho forte da abertura. */
export function paletaDosOlhos(vermelho: boolean, aceso = false): Readonly<Record<string, string>> {
  return vermelho
    ? { a: '#ffb3a3', b: '#e3141f', c: '#4c0006', p: '#1a0000', x: '#000000', h: `rgba(255, 30, 30, ${aceso ? 0.5 : 0.34})` }
    : { a: '#ffe27a', b: '#e8a922', c: '#6e3d06', p: '#140700', x: '#000000', h: `rgba(255, 170, 40, ${aceso ? 0.5 : 0.26})` };
}

// ── A mão com o barco ───────────────────────────────────────────────────────

export const LARGURA_DA_MAO = 28;
export const ALTURA_DA_MAO = 32;

/** O barco de perto, na mão (o da água, `BARCO`, é pequeno demais para ler entre os dedos). */
const BARCO_NA_MAO: readonly string[] = [
  '......oo......',
  '.....oPpo.....',
  '....oPppPo....',
  '...oPpppPpo...',
  '..oPppppPppo..',
  'oooooooooooooo',
  '.oppppppppppo.',
  '..oPppppppPo..',
  '...oooooooo...',
];

/**
 * A mão dela saindo do bueiro com o barco: o braço desce da boca (a manga
 * cinza-azulada com a luz do lado de fora e as dobras), o babado do punho, e
 * a luva branca de palma para cima, oferecendo: o barco em cima da palma, o
 * polegar fechado num lado do casco e os três dedos no outro. A paleta é a
 * da Coisa (`PALETA_DA_MAO`), com o papel do barco em `p`/`P`.
 */
export function montarMao(): string[] {
  const g = grade(LARGURA_DA_MAO, ALTURA_DA_MAO);
  // O braço: a manga sai fina da boca e vai bufando até o punho, curvando
  // um tico para a frente; a luz do lado de fora e as dobras na diagonal.
  for (let y = 0; y <= 19; y++) {
    const cx = 5.5 + (y / 19) ** 2 * 1.5, meia = 2.8 + (y / 19) * 0.9;
    for (let x = 0; x < LARGURA_DA_MAO; x++) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > meia) continue;
      let ch = dx < -meia + 0.9 ? 'l' : dx > meia - 0.9 ? 'K' : dx > meia * 0.35 ? 'G' : 'g';
      if (Math.abs(dx) < meia - 0.9 && (y - Math.round(dx)) % 6 === 0) ch = 'G';
      pintar(g, x, y, ch);
    }
  }
  // O babado do punho, em pregas.
  for (let y = 17; y <= 24; y++) {
    for (let x = 0; x < 16; x++) {
      const d = ((x + 0.5 - 7.5) / 6.8) ** 2 + ((y + 0.5 - 21) / 3) ** 2;
      if (d > 1) continue;
      pintar(g, x, y, y <= 18 ? 'C' : d > 0.6 && y >= 22 ? (x % 2 ? 'D' : 'C') : x % 3 === 0 ? 'C' : 'c');
    }
  }
  // O pulso e a palma, virada para cima, com a sombra embaixo.
  for (let y = 22; y <= 25; y++) for (let x = 8; x <= 12; x++) pintar(g, x, y, x === 12 ? 'W' : 'w');
  for (let y = 23; y <= 30; y++) {
    for (let x = 8; x < 25; x++) {
      const ey = (y + 0.5 - 26.5) / 3.3, ex = (x + 0.5 - 16) / 7;
      if (ex * ex + ey * ey > 1) continue;
      pintar(g, x, y, ey > 0.5 ? 'W' : 'w');
    }
  }
  // O barco em cima da palma, inteiro à vista.
  BARCO_NA_MAO.forEach((linhaDoBarco, y) => [...linhaDoBarco].forEach((ch, x) => {
    if (ch !== '.') pintar(g, 9 + x, 14 + y, ch);
  }));
  // Os dedos subindo pelo casco (com o contorno por cima do barco) e o polegar do outro lado.
  const dedo = (x0: number, y0: number, l: number, a: number, deitado: boolean) => {
    for (let y = y0 - 1; y <= y0 + a; y++) for (let x = x0 - 1; x <= x0 + l; x++) {
      const fora = y < y0 || y >= y0 + a || x < x0 || x >= x0 + l;
      const canto = (y === y0 - 1 || y === y0 + a) && (x === x0 - 1 || x === x0 + l);
      if (canto) continue;
      if (fora) { if (!'wW'.includes(g[y]?.[x] ?? 'w')) pintar(g, x, y, 'o'); continue; }
      pintar(g, x, y, (deitado ? y === y0 + a - 1 : x === x0 + l - 1) ? 'W' : 'w');
    }
  };
  dedo(21, 19, 3, 2, true);
  dedo(22, 21, 3, 2, true);
  dedo(21, 23, 3, 2, true);
  dedo(8, 19, 2, 5, false);
  // O contorno de tudo.
  const marcar: [number, number][] = [];
  for (let y = 0; y < ALTURA_DA_MAO; y++) {
    for (let x = 0; x < LARGURA_DA_MAO; x++) {
      if (g[y][x] !== '.') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const c = g[y + dy]?.[x + dx]; return c != null && c !== '.' && c !== 'o'; })) marcar.push([x, y]);
    }
  }
  for (const [x, y] of marcar) g[y][x] = 'o';
  return g.map(l => l.join(''));
}

export const PALETA_DA_MAO: Readonly<Record<string, string>> = {
  o: '#0b0a10',
  g: '#93a5b3', G: '#617482', l: '#c0ced8', K: '#3a4752',
  c: '#e3dbc6', C: '#b2a68b', D: '#7a6f58',
  w: '#f2efe8', W: '#bdb7ad',
  p: '#ebe3c1', P: '#b8ad86',
};
