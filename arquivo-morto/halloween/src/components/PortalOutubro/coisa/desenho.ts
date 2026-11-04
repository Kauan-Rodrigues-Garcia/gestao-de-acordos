/**
 * desenho.ts — a Coisa em pixel, montada por partes (pedido de 27/10/2026,
 * com as fotos do palhaço dos filmes como modelo).
 *
 * O que se lê nas referências e vai para o desenho:
 *
 *   - a cabeça de ovo, careca em cima, testa enorme e rachada, com o topete
 *     ruivo enrolado bem no meio;
 *   - os tufos de cabelo ruivo armados dos lados, um pouco atrás da cabeça;
 *   - a sobrancelha pesada que faz sombra nos olhos amarelos, um pupila de
 *     cada lado (os olhos tortos);
 *   - o risco vermelho fino que desce da testa, atravessa o olho e vira o
 *     canto da boca, o sorriso vermelho com os dois dentes da frente, o nariz
 *     pequeno e escuro;
 *   - a gola de babado creme, larga, em pregas;
 *   - a roupa cinza-azulada, as mangas bufantes enormes nos ombros, os três
 *     pompons laranja no peito, as calças bufantes presas no tornozelo, os
 *     babados nos punhos e as luvas brancas.
 *
 * Cada parte é pintada numa grade de letras (a paleta em `arte.ts`), e o
 * contorno sai sozinho em volta de tudo. Os braços têm poses, a cabeça
 * balança, a boca abre: são os quadros da cena (`QUADROS`) — a dança do
 * palhaço no palco e ele parado babando. Puro: os testes conferem sem
 * navegador.
 */

export const LARGURA_DA_COISA = 44;
export const ALTURA_DA_COISA = 72;
/** Até onde é cabeça (o golpe ali vale mais). */
export const FIM_DA_CABECA = 28;

type Grade = string[][];
type Pose = 'baixo' | 'alto' | 'meio';

const L = LARGURA_DA_COISA, A = ALTURA_DA_COISA;
const espelho = (x: number) => L - 1 - x;

function grade(largura = L, altura = A): Grade {
  return Array.from({ length: altura }, () => Array<string>(largura).fill('.'));
}

function pintar(g: Grade, x: number, y: number, ch: string) {
  if (x >= 0 && y >= 0 && y < g.length && x < g[y].length) g[y][x] = ch;
}

/** Pinta dos dois lados (o palhaço é de frente). */
function ambos(g: Grade, x: number, y: number, ch: string) {
  pintar(g, x, y, ch);
  pintar(g, espelho(x), y, ch);
}

/** Uma elipse cheia; `cor(dx, dy)` escolhe a letra por posição (−1 a 1). */
function elipse(g: Grade, cx: number, cy: number, rx: number, ry: number, cor: (dx: number, dy: number, x: number, y: number) => string | null, dois = false) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const ch = cor(dx, dy, x, y);
      if (!ch) continue;
      if (dois) ambos(g, x, y, ch); else pintar(g, x, y, ch);
    }
  }
}

/** Um ruído fixo por coordenada (a textura do cabelo e da gola). */
export function grao(x: number, y: number): number {
  const h = Math.imul(x * 73856093 ^ y * 19349663, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// ── O cabelo e a cabeça ─────────────────────────────────────────────────────

/** A meia-largura da cabeça em cada linha (o ovo: testa larga, queixo fino). */
const CABECA: Readonly<Record<number, number>> = {
  3: 3.5, 4: 5.5, 5: 7, 6: 8, 7: 9, 8: 9.5, 9: 10, 10: 10, 11: 10, 12: 10, 13: 10, 14: 10, 15: 10, 16: 10,
  17: 10, 18: 9.5, 19: 9, 20: 9, 21: 8.5, 22: 8, 23: 7.5, 24: 7, 25: 6, 26: 5, 27: 3.5,
};
const MEIO = (L - 1) / 2;

function cabelo(g: Grade, dx: number) {
  // Os tufos dos lados, armados, mais escuros perto da cabeça e embaixo.
  elipse(g, 7.5 + dx, 14, 7, 8.5, (ex, ey, x, y) => {
    if (ex < -0.55 && grao(x, y) < 0.35) return null; // as pontas ralas
    if (ey > 0.55 && grao(x, y) < 0.3) return null;
    if (ex > 0.45 || ey > 0.5) return 'H';
    return ex + ey < -0.55 ? 'j' : grao(x, y) < 0.2 ? 'H' : 'h';
  });
  elipse(g, espelho(7.5) + dx, 14, 7, 8.5, (ex, ey, x, y) => {
    if (ex > 0.55 && grao(x + 7, y) < 0.35) return null;
    if (ey > 0.55 && grao(x + 7, y) < 0.3) return null;
    if (ex < -0.45 || ey > 0.5) return 'H';
    return -ex + ey < -0.55 ? 'j' : grao(x + 7, y) < 0.2 ? 'H' : 'h';
  });
  // O cabelo de trás, que aparece em volta do alto da cabeça.
  elipse(g, 13 + dx, 8, 5, 4.5, (ex) => (ex > 0.3 ? 'H' : 'h'));
  elipse(g, espelho(13) + dx, 8, 5, 4.5, (ex) => (ex < -0.3 ? 'H' : 'h'));
}

function cabeca(g: Grade, dx: number, boca: 'sorriso' | 'aberta') {
  for (const [ys, meia] of Object.entries(CABECA)) {
    const y = Number(ys);
    for (let x = Math.ceil(MEIO - meia); x <= Math.floor(MEIO + meia); x++) {
      const borda = Math.abs(x - MEIO) > meia - 1.2;
      pintar(g, x + dx, y, borda && y > 13 ? 'W' : 'w');
    }
  }
  const p = (x: number, y: number, ch: string) => { pintar(g, x + dx, y, ch); pintar(g, espelho(x) + dx, y, ch); };
  // A testa rachada.
  for (const [x, y] of [[18, 7], [19, 7], [15, 9], [16, 9], [20, 9], [16, 11], [17, 11], [18, 11], [19, 10]]) p(x, y, 'W');
  // A sobrancelha pesada: a sombra que desce nos olhos.
  for (let x = 14; x <= 19; x++) { p(x, 13, 'W'); p(x, 14, x === 14 || x === 19 ? 'W' : 's'); }
  // O risco vermelho: da testa, pelo olho, até o canto da boca.
  for (let y = 5; y <= 13; y++) p(17, y, 'r');
  for (let y = 17; y <= 19; y++) p(16, y, 'r');
  p(15, 20, 'r'); p(15, 21, 'r');
  // Os olhos amarelos, a pupila puxada para fora (os olhos tortos).
  p(15, 15, 's');
  for (let x = 16; x <= 19; x++) { p(x, 15, 'y'); p(x, 16, x === 19 ? 'Y' : 'y'); }
  p(16, 15, 'Y');
  for (let x = 15; x <= 19; x++) p(x, 17, x === 16 ? 'r' : 'W');
  // O nariz: pequeno e escuro.
  p(21, 19, 'n'); p(20, 20, 'n'); p(21, 20, 'n'); p(20, 19, 'W');
  if (boca === 'aberta') {
    // A boca aberta, babando (a cena do bueiro): os dentões, o queixo caído.
    p(16, 22, 'r'); p(17, 22, 'r');
    for (let x = 16; x <= 21; x++) p(x, 23, 'r');
    for (let y = 24; y <= 27; y++) { p(16, y, y === 27 ? 'R' : 'r'); for (let x = 17; x <= 21; x++) p(x, y, 'm'); }
    p(20, 24, 't'); p(21, 24, 't'); p(20, 25, 't'); p(21, 25, 't'); p(19, 24, 't');
    for (let x = 17; x <= 21; x++) p(x, 28, 'r');
    // Os olhos arregalados: a sombra da sobrancelha sobe.
    for (let x = 15; x <= 19; x++) p(x, 14, x === 15 ? 's' : 'y');
    p(19, 14, 'Y');
    return;
  }
  // O sorriso: os cantos sobem, os dois dentes da frente.
  p(16, 22, 'r'); p(17, 22, 'r');
  for (let x = 17; x <= 21; x++) p(x, 23, 'r');
  p(16, 23, 'r');
  p(17, 24, 'r');
  for (let x = 18; x <= 21; x++) p(x, 24, x >= 20 ? 't' : 'm');
  for (let x = 18; x <= 21; x++) p(x, 25, x === 21 ? 't' : 'm');
  for (let x = 18; x <= 21; x++) p(x, 26, 'r');
  p(17, 25, 'R');
  // O queixo e as bochechas: a sombra fria.
  p(19, 27, 'W'); p(20, 27, 'W');
}

function topete(g: Grade, dx: number) {
  const linhas: readonly [number, number, number, string][] = [
    [0, 21, 22, 'h'], [1, 20, 23, 'h'], [2, 19, 24, 'h'], [3, 19, 24, 'H'], [4, 20, 23, 'H'],
  ];
  for (const [y, de, ate, ch] of linhas) for (let x = de; x <= ate; x++) pintar(g, x + dx, y, ch);
  pintar(g, 20 + dx, 1, 'j'); pintar(g, 20 + dx, 2, 'j'); pintar(g, 21 + dx, 0, 'j');
  // A ponta enrolada para um lado.
  pintar(g, 24 + dx, 1, 'h'); pintar(g, 25 + dx, 2, 'H');
}

// ── A gola, o corpo, as pernas ──────────────────────────────────────────────

function gola(g: Grade) {
  elipse(g, MEIO, 31, 18, 5.2, (ex, ey, x) => {
    const prega = ((x + 30) % 3) === 0;
    if (ey > 0.75) return x % 2 ? 'C' : 'D'; // a borda franzida
    if (ey < -0.6) return 'C';
    return prega ? 'C' : grao(x, 31) < 0.1 ? 'D' : 'c';
  });
  // O babado de baixo, em pontas.
  for (let x = 5; x < L - 5; x++) if (x % 2 === 0) pintar(g, x, 37, 'D');
}

/** A manga bufante do ombro (a grande, armada). */
function ombro(g: Grade, cx: number, lado: 1 | -1) {
  elipse(g, cx, 40, 9, 8, (ex, ey, x, y) => {
    const fora = ex * lado;
    const r = ex * ex + ey * ey;
    if (r > 0.82 && ey > 0) return 'K'; // a costura por baixo
    if (fora < -0.2 && ey < -0.2 && r < 0.7) return 'l';
    if (fora > 0.5 || ey > 0.45) return 'G';
    const dobra = lado === 1 ? (x - y) : (espelho(x) - y);
    return ((dobra % 6) + 6) % 6 === 0 ? 'G' : 'g';
  });
}

function tronco(g: Grade) {
  for (let y = 36; y <= 52; y++) {
    for (let x = 12; x <= MEIO; x++) {
      let ch = 'g';
      if (x === 15 || x === 16 && y > 44) ch = 'G';
      if (x === 13 && y < 42) ch = 'l';
      ambos(g, x, y, ch);
    }
  }
  // Os três pompons laranja no peito.
  for (const y0 of [38, 44, 50]) {
    ambos(g, 21, y0 - 1, 'p');
    ambos(g, 20, y0, 'p'); ambos(g, 21, y0, 'p');
    ambos(g, 21, y0 + 1, 'P');
  }
  for (let x = 13; x <= MEIO; x++) ambos(g, x, 53, 'k');
}

function pernas(g: Grade, sobe: number) {
  // As calças bufantes: um balão por perna, presas no tornozelo.
  elipse(g, 15, 60 - sobe, 8.5, 7, (ex, ey, x, y) => {
    if (x >= 21) return null;
    const r = ex * ex + ey * ey;
    if (r > 0.8 && ey > 0.2) return 'K';
    if (ex > 0.5 || ey > 0.5) return 'G';
    if (ex < -0.3 && ey < -0.1) return 'l';
    return ((x + y * 2) % 7) === 0 ? 'G' : 'g';
  }, true);
  for (let y = 54; y <= 56; y++) for (let x = 12; x <= MEIO; x++) ambos(g, x, y, y === 54 ? 'G' : 'g');
  // O babado do tornozelo e o sapato com a ponta para fora.
  for (let x = 11; x <= 19; x++) { ambos(g, x, 66 - sobe, 'c'); ambos(g, x, 67 - sobe, x % 2 ? 'C' : 'c'); }
  const sapato: readonly [number, number, number, string][] = [
    [68, 10, 18, 'u'], [69, 8, 18, 'u'], [70, 7, 18, 'u'], [71, 7, 18, 'U'],
  ];
  for (const [y, de, ate, ch] of sapato) for (let x = de; x <= ate; x++) ambos(g, x, y - Math.min(sobe, 0), ch);
  pintar(g, 12, 69, 'U'); pintar(g, espelho(12), 69, 'U');
}

/** O braço de um lado (o lado esquerdo de quem olha é `lado = 1`). */
function braco(g: Grade, pose: Pose, lado: 1 | -1) {
  const X = (x: number) => (lado === 1 ? x : espelho(x));
  const ret = (x0: number, x1: number, y0: number, y1: number, cor: (x: number, y: number) => string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) pintar(g, X(x), y, cor(x, y));
  };
  const manga = (x: number) => (x >= 8 ? 'G' : x <= 3 ? 'l' : 'g');
  const luva = (x: number, y: number) => ((x + y) % 5 === 0 ? 'W' : 'w');
  if (pose === 'baixo') {
    ret(4, 10, 47, 55, manga);
    ret(3, 11, 56, 57, x => (x % 2 ? 'C' : 'c'));
    ret(4, 10, 58, 62, luva);
    ret(5, 9, 63, 63, () => 'W');
  } else if (pose === 'meio') {
    ret(1, 7, 45, 52, manga);
    ret(0, 8, 53, 54, x => (x % 2 ? 'C' : 'c'));
    ret(1, 7, 55, 59, luva);
    ret(2, 6, 60, 60, () => 'W');
  } else {
    // Para cima, aberto: a mão passa da altura da cabeça.
    ret(2, 7, 25, 35, manga);
    ret(1, 8, 23, 24, x => (x % 2 ? 'C' : 'c'));
    ret(2, 7, 17, 22, luva);
    for (const x of [2, 4, 6]) pintar(g, X(x), 16, 'w');
  }
}

/** O contorno: todo vazio encostado num pixel pintado. */
export function contornar(g: string[][]) {
  const marcar: [number, number][] = [];
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[y].length; x++) {
      if (g[y][x] !== '.') continue;
      const vizinho = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const c = g[y + dy]?.[x + dx];
        return c != null && c !== '.' && c !== 'o';
      });
      if (vizinho) marcar.push([x, y]);
    }
  }
  for (const [x, y] of marcar) g[y][x] = 'o';
}

export interface QuadroDaCoisa {
  linhas: readonly string[];
  /** Onde a mão segura o balão (`null` = sem balão, na dança). */
  mao: readonly [number, number] | null;
}

function montar(esquerdo: Pose, direito: Pose, cabecaDx: number, sobe: number, comBalao: boolean, boca: 'sorriso' | 'aberta' = 'sorriso'): QuadroDaCoisa {
  const g = grade();
  cabelo(g, cabecaDx);
  gola(g);
  ombro(g, 8, 1);
  ombro(g, espelho(8), -1);
  tronco(g);
  pernas(g, sobe);
  braco(g, esquerdo, 1);
  braco(g, direito, -1);
  cabeca(g, cabecaDx, boca);
  topete(g, cabecaDx);
  // O vão entre as pernas.
  for (let y = 58 - sobe; y < A; y++) { g[y][21] = '.'; g[y][22] = '.'; }
  contornar(g);
  return { linhas: g.map(l => l.join('')), mao: comBalao && esquerdo === 'baixo' ? [7, 61] : null };
}

/**
 * Os quadros: 0 é parado com o balão; 1–4 são a dança do palco (os braços
 * jogados para um lado e para o outro, a cabeça balançando, o corpo pulando);
 * 5 é parado babando, de boca aberta e olho arregalado (a cena do bueiro).
 */
export const QUADROS: readonly QuadroDaCoisa[] = [
  montar('baixo', 'baixo', 0, 0, true),
  montar('alto', 'baixo', -1, 0, false),
  montar('meio', 'meio', 0, 1, false),
  montar('baixo', 'alto', 1, 0, false),
  montar('meio', 'meio', 0, 1, false),
  montar('baixo', 'baixo', 0, 0, false, 'aberta'),
];
export const DANCA: readonly number[] = [1, 2, 3, 4];
export const BABANDO = 5;
/** Onde a baba escorre: os cantos do lábio de baixo (no quadro babando). */
export const CANTOS_DA_BOCA: readonly (readonly [number, number])[] = [[18, 29], [25, 29]];

// ── Ela puxando o mural ─────────────────────────────────────────────────────
//
// Pedido de 28/10/2026: «não só o braço dele puxando, quero uma animação dele
// puxando». O corpo inteiro: o tronco jogado para trás (as linhas de cima
// deslizam para a esquerda, como pixel art inclina) e as pernas arrastando de
// lado, abrindo e fechando. Desde 29/10 («faz ele puxando com uma mão e na
// outra fica segurando um balão») só o braço da direita vai ao mural, dobrado,
// com a luva fechada na borda; o da esquerda desce do lado do corpo com o
// punho fechado no fio do balão (o balão em si é do `Puxando.tsx`, que o faz
// balançar atrás dela).

/** A largura do quadro dela puxando: o corpo e o braço esticado. */
export const LARGURA_PUXANDO = 71;
/** Onde o corpo começa no quadro (sobra para o tronco inclinar para trás). */
export const CORPO_X = 11;
/** O meio da luva: ali fica a borda do mural. */
export const MAO_PUXANDO: readonly [number, number] = [66, 46];
/** O punho que segura o fio do balão (o mesmo em todos os quadros). */
export const MAO_DO_BALAO_PUXANDO: readonly [number, number] = [CORPO_X + 1, 58];

/** Uma perna só, de um lado, deslocada `dx` e erguida `sobe` (o pé sobe junto). */
function perna(g: Grade, lado: 1 | -1, dx: number, sobe: number) {
  const s = grade();
  elipse(s, 15, 60 - sobe, 8.5, 7, (ex, ey, x, y) => {
    if (x >= 21) return null;
    const r = ex * ex + ey * ey;
    if (r > 0.8 && ey > 0.2) return 'K';
    if (ex > 0.5 || ey > 0.5) return 'G';
    if (ex < -0.3 && ey < -0.1) return 'l';
    return ((x + y * 2) % 7) === 0 ? 'G' : 'g';
  });
  for (let x = 11; x <= 19; x++) { pintar(s, x, 66 - sobe, 'c'); pintar(s, x, 67 - sobe, x % 2 ? 'C' : 'c'); }
  const sapato: readonly [number, number, number, string][] = [
    [68, 10, 18, 'u'], [69, 8, 18, 'u'], [70, 7, 18, 'u'], [71, 7, 18, 'U'],
  ];
  for (const [y, de, ate, ch] of sapato) for (let x = de; x <= ate; x++) pintar(s, x, y - sobe, ch);
  pintar(s, 12, 69 - sobe, 'U');
  for (let y = 0; y < A; y++) {
    for (let x = 0; x < L; x++) {
      if (s[y][x] !== '.') pintar(g, (lado === 1 ? x : espelho(x)) + dx, y, s[y][x]);
    }
  }
}

/** A distância de (x, y) ao segmento a–b, de que lado dele (negativo em cima) e o caminho do ponto mais perto até (x, y). */
function aoSegmento(x: number, y: number, ax: number, ay: number, bx: number, by: number): readonly [number, number, number, number] {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (l * l)));
  const ox = x - ax - dx * k, oy = y - ay - dy * k;
  return [Math.hypot(ox, oy), (dx * (y - ay) - dy * (x - ax)) / l, ox, oy];
}

/** De onde vem a luz na manga (de cima, um tico da esquerda), normalizado. */
const LUZ = [-0.45, -0.89] as const;

/**
 * O cotovelo de um braço de dois pedaços de `comp` entre o ombro e o punho,
 * dobrando para baixo: perto (o tronco vindo para o mural) dobra muito; longe
 * (o tranco, o tronco para trás) quase estica.
 */
function cotovelo(sx: number, sy: number, px: number, py: number, comp: number): readonly [number, number] {
  const d = Math.min(2 * comp - 0.01, Math.max(0.01, Math.hypot(px - sx, py - sy)));
  const ang = Math.atan2(py - sy, px - sx) + Math.acos(d / (2 * comp));
  return [sx + Math.cos(ang) * comp, sy + Math.sin(ang) * comp];
}

/** A grossura da manga (o raio, em pixels dela). */
const MANGA = 2.9;

/**
 * A manga de um braço do ombro (sx, sy) ao punho (px, py), em dois pedaços
 * dobrando no cotovelo (pedido de 29/10/2026: «mais reais, dobrando e
 * segurando o mural, e não apenas retos»). A luz é a de um cilindro, vinda
 * de cima (`LUZ`), e por dentro do cotovelo o pano franze na sombra.
 * `naFrente`: o braço passa por cima do corpo (o contorno corta o que estiver
 * embaixo); sem ele, o braço fica ATRÁS do que já está pintado — sai de
 * baixo da manga bufante, pela borda dela, com o risco separando os dois
 * (até 29/10 ele era pintado por cima e parecia um cano saindo do meio da
 * manga).
 */
function mangaDobrada(g: Grade, sx: number, sy: number, px: number, py: number, comp: number, naFrente: boolean, ateX = Infinity) {
  const [ex, ey] = cotovelo(sx, sy, px, py, comp);
  // O lado de dentro da dobra é o contrário de onde o cotovelo foi.
  const fora = Math.sign((px - sx) * (ey - sy) - (py - sy) * (ex - sx));
  const x0 = Math.floor(Math.min(sx, ex, px) - MANGA - 1), x1 = Math.min(ateX, Math.ceil(Math.max(sx, ex, px) + MANGA + 1));
  const ya = Math.floor(Math.min(sy, ey, py) - MANGA - 1), yb = Math.ceil(Math.max(sy, ey, py) + MANGA + 1);
  const meus = new Set<string>();
  for (let y = ya; y <= yb; y++) {
    for (let x = x0; x <= x1; x++) {
      const livre = g[y]?.[x] === '.';
      const braco = aoSegmento(x, y, sx, sy, ex, ey), antebraco = aoSegmento(x, y, ex, ey, px, py);
      const [d, cru, ox, oy] = braco[0] < antebraco[0] ? braco : antebraco;
      if (d <= MANGA) {
        if (!naFrente && !livre) continue;
        const s = d > 0 ? ((ox * LUZ[0] + oy * LUZ[1]) / d) * Math.min(1, d / MANGA) : 0;
        const franze = Math.sign(cru) === -fora && Math.hypot(x - ex, y - ey) < MANGA + 1.4;
        pintar(g, x, y, franze ? (s < 0 ? 'K' : 'G') : s > 0.55 ? 'l' : s < -0.7 ? 'K' : s < -0.25 ? 'G' : (x + 2 * y) % 7 === 0 ? 'G' : 'g');
        meus.add(`${x},${y}`);
      } else if (d <= MANGA + 1 && (naFrente || livre)) {
        pintar(g, x, y, 'o');
      }
    }
  }
  // Atrás do corpo: o risco onde o braço encosta nele (a borda da manga bufante).
  if (naFrente) return;
  for (const chave of meus) {
    const [x, y] = chave.split(',').map(Number);
    const encosta = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const c = g[y + dy]?.[x + dx];
      return c != null && c !== '.' && c !== 'o' && !meus.has(`${x + dx},${y + dy}`);
    });
    if (encosta) g[y][x] = 'o';
  }
}

/** O braço que puxa: do ombro até a borda, o babado do punho e a luva fechada na borda. */
function bracoDoMural(g: Grade, sx: number, sy: number, comp: number, y0: number) {
  // A manga para no punho.
  mangaDobrada(g, sx, sy, 59.5, y0 + 2.5, comp, false, 59);
  const risco = (x: number, y: number) => { if (g[y]?.[x] === '.') pintar(g, x, y, 'o'); };
  for (let x = 60; x <= 61; x++) { risco(x, y0 - 2); risco(x, y0 + 7); }
  // O babado do punho, mais largo que a manga.
  for (let y = y0 - 1; y <= y0 + 6; y++) { pintar(g, 60, y, y % 2 ? 'C' : 'c'); pintar(g, 61, y, 'c'); }
  // A luva fechada na borda, separada do punho: os dedos dobrados, um em
  // cima do outro, e os nós dos dedos na sombra.
  for (let y = y0 - 1; y <= y0 + 6; y++) pintar(g, 62, y, 'o');
  for (let y = y0 - 1; y <= y0 + 5; y++) {
    for (let x = 63; x <= 69; x++) {
      const canto = (y === y0 - 1 || y === y0 + 5) && (x === 63 || x === 69);
      if (canto) continue;
      const dedo = x >= 66 && (y - y0) % 2 === 1;
      pintar(g, x, y, x === 63 || x === 69 || y === y0 + 5 || dedo ? 'W' : 'w');
    }
  }
}

/**
 * O braço do balão: desce do ombro pelo lado do corpo, o cotovelo para fora,
 * e o punho fechado no fio (`MAO_DO_BALAO_PUXANDO`), por cima da perna.
 */
function bracoDoBalao(g: Grade, sx: number, sy: number) {
  const [hx, hy] = MAO_DO_BALAO_PUXANDO;
  mangaDobrada(g, sx, sy, hx + 0.5, hy - 4, 6.5, false);
  // O babado do punho e a luva fechada.
  for (let x = hx - 3; x <= hx + 3; x++) { pintar(g, x, hy - 4, 'c'); pintar(g, x, hy - 3, x % 2 ? 'C' : 'c'); }
  for (let y = hy - 2; y <= hy + 2; y++) {
    for (let x = hx - 2; x <= hx + 2; x++) {
      if (Math.abs(x - hx) === 2 && Math.abs(y - hy) === 2) continue;
      pintar(g, x, y, x === hx + 2 || y === hy + 2 || (y === hy && x > hx - 2) ? 'W' : 'w');
    }
  }
  // O contorno da luva e do babado por cima da perna.
  for (let y = hy - 5; y <= hy + 3; y++) {
    for (let x = hx - 4; x <= hx + 4; x++) {
      const ch = g[y]?.[x];
      if (!ch || 'wWcC'.includes(ch)) continue;
      const encosta = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const v = g[y + dy]?.[x + dx];
        return v != null && 'wWcC'.includes(v) && Math.abs(x + dx - hx) <= 3 && y + dy >= hy - 4;
      });
      if (encosta && y >= hy - 4) g[y][x] = 'o';
    }
  }
}

/** A primeira linha abaixo da faixa da cintura: dali para baixo, as pernas. */
const CINTURA = 57;

/**
 * Um quadro dela puxando. `inclina` (0 a 1) joga o tronco para trás; `pes`
 * são os deslocamentos das duas pernas e `sobe`, quanto cada pé sai do chão.
 */
function montarPuxando(inclina: number, pes: readonly [number, number], sobe: readonly [number, number], cabecaDx: number, boca: 'sorriso' | 'aberta' = 'sorriso', agacha = 0): readonly string[] {
  const s = grade();
  cabelo(s, cabecaDx);
  gola(s);
  ombro(s, 8, 1);
  ombro(s, espelho(8), -1);
  tronco(s);
  for (let y = 54; y <= 56; y++) for (let x = 12; x <= MEIO; x++) ambos(s, x, y, y === 54 ? 'G' : 'g');
  perna(s, 1, pes[0], sobe[0]);
  perna(s, -1, pes[1], sobe[1]);
  cabeca(s, cabecaDx, boca);
  topete(s, cabecaDx);

  const desvio = (y: number) => -Math.round(inclina * Math.max(0, 56 - y) * 0.18);
  const g = grade(LARGURA_PUXANDO);
  // As pernas primeiro; da cintura para cima vem depois, `agacha` mais baixo.
  for (const parte of ['pernas', 'corpo'] as const) {
    for (let y = 0; y < A; y++) {
      if ((y < CINTURA) !== (parte === 'corpo')) continue;
      const dy = parte === 'corpo' ? agacha : 0;
      for (let x = 0; x < L; x++) if (s[y][x] !== '.') pintar(g, x + CORPO_X + desvio(y), y + dy, s[y][x]);
    }
  }
  // O braço da direita sai da manga bufante até a borda; a luva fica na
  // altura da borda, o tronco é que sobe e desce. O cotovelo dobra conforme o
  // tronco: inclinada para trás, o braço quase estica. O da esquerda segura o
  // fio do balão.
  bracoDoMural(g, CORPO_X + 38 + desvio(41), 42.5 + agacha, 7.2, 43);
  bracoDoBalao(g, CORPO_X + 7 + desvio(45), 45 + agacha);
  contornar(g);
  return g.map(l => l.join(''));
}

/**
 * Os quadros dela puxando:
 *   `anda`   o tronco reto, indo de lado até a borda (as pernas abrem e fecham)
 *   `firma`  agarrada, o pé da frente fincado, já tomando impulso
 *   `prepara` o embalo antes de cada tranco: o tronco vem para o mural
 *   `puxa`   o tranco: o tronco todo para trás, arrastando os pés
 *   `agachada` antes de arrancar: joelhos dobrados, toda para trás, a boca aberta
 */
export const PUXANDO = {
  anda: [
    montarPuxando(0, [-3, 3], [0, 0], 1),
    montarPuxando(0, [0, 0], [3, 0], 1),
    montarPuxando(0, [-3, 3], [0, 0], 1),
    montarPuxando(0, [0, 0], [0, 3], 1),
  ],
  firma: montarPuxando(0.45, [-4, 4], [0, 0], 1, 'aberta'),
  prepara: montarPuxando(-0.25, [-2, 5], [0, 0], 2),
  agachada: montarPuxando(1, [-6, 3], [0, 0], -1, 'aberta', 2),
  puxa: [
    montarPuxando(1, [-5, 2], [0, 0], -1, 'aberta'),
    montarPuxando(1, [-2, 2], [3, 0], -1, 'aberta'),
    montarPuxando(1, [-5, 2], [0, 0], -1, 'aberta'),
    montarPuxando(1, [-2, 2], [0, 2], -1, 'aberta'),
  ],
} as const;
