/**
 * cabecona.ts — a Coisa de perto (pedido de 28/10/2026, com seis fotos dos
 * filmes como modelo das «caras e bocas»): o busto grande, montado por
 * contas e não por quadros prontos, para o close no palco, para ela
 * escondida no mural e para o bote no mouse.
 *
 * O que cada foto virou:
 *
 *   `baixa`    a cabeça baixa, afundada na gola, e os olhos lá em cima, por
 *              baixo da sobrancelha (as fotos no fogo e na caverna);
 *   `inclina`  a cabeça torta para um lado, a testa rachada (a foto de cima);
 *   `olhar`    para onde as pupilas vão (no mural, o mouse);
 *   `brilho`   as luzes mortas: os olhos acendem em laranja, com um halo;
 *   `queixo`   a boca que abre até o peito, com as fileiras de dentes em
 *              volta e a luz lá no fundo da garganta (a foto da bocarra);
 *   `dentes`   o sorriso mostrando a fileira de dentes;
 *   `sangue`   a boca e o queixo manchados, escorrendo (as fotos 2 e 3);
 *   `balao`    o balão vermelho na frente da cara, só os olhos por cima
 *              (a foto da porta, que no mural também fica em cinza);
 *   `baba`     o fio de baba de cada canto da boca, em pixels de comprimento;
 *   `fogo`     a cara encarando no fogo (a pixel art de 28/10, «a cara
 *              encarando babando»): a luz de baixo, as órbitas fundas, a
 *              sobrancelha pesando, os olhos em fenda amarelos acesos e a pele
 *              suja de sombra (pinte com `PALETA_DO_FOGO`);
 *   `piscando` as pálpebras fechadas (o bueiro).
 *
 * A bocarra aberta tem no fundo as três luzes mortas (as fotos da boca
 * abrindo para «flutuar»): duas em cima, uma embaixo, no clarão da garganta.
 *
 * A cabeça é pintada numa grade só dela (para inclinar e para o queixo
 * descer), depois vai por cima da gola e do corpo; o contorno sai sozinho.
 * Puro: grade de letras e paleta, como `desenho.ts`; os testes conferem sem
 * navegador.
 */
import { PALETA_DA_COISA, type Paleta } from './arte';
import { contornar, grao } from './desenho';

export const LARGURA_DA_CABECONA = 64;
export const ALTURA_DA_CABECONA = 96;

export interface PoseDaCabecona {
  /** Para onde as pupilas olham, de −1 a 1 (x, y). */
  olhar?: readonly [number, number];
  baixa?: boolean;
  /** De −1 a 1: o alto da cabeça vai para a esquerda ou para a direita. */
  inclina?: number;
  /** De 0 (fechada) a 1 (aberta até o peito). */
  queixo?: number;
  dentes?: boolean;
  sangue?: boolean;
  brilho?: boolean;
  balao?: boolean;
  /** A gola e os ombros (sem eles, só a cabeça e o babado). */
  corpo?: boolean;
  baba?: readonly [number, number];
  /** A cara no fogo, com luz e sombra (pinte com `PALETA_DO_FOGO`). */
  fogo?: boolean;
  /** Os olhos fechados. */
  piscando?: boolean;
  /** O quanto as três luzes da bocarra já giraram, em voltas (o close, 29/10). */
  giro?: number;
}

type Grade = string[][];

const W = LARGURA_DA_CABECONA, H = ALTURA_DA_CABECONA;
const CX = (W - 1) / 2;
/** O alto da cabeça (sem o topete) e o quanto a boca desce, no máximo. */
const TOPO = 8;
const QUEIXO_MAX = 30;
/** Na cabeça: a linha da boca, os olhos e o queixo (contados do topo). */
const BOCA = 37;
const OLHO_Y = 24;
const FIM = 48;
const OLHOS = [23, 40] as const;

function grade(): Grade {
  return Array.from({ length: H }, () => Array<string>(W).fill('.'));
}

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

/** Uma linha de pixel a pixel (Bresenham). */
function linha(x0: number, y0: number, x1: number, y1: number, cada: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy, x = x0, y = y0;
  for (;;) {
    cada(x, y);
    if (x === x1 && y === y1) return;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x += sx; }
    if (e2 <= dx) { e += dx; y += sy; }
  }
}

/** A meia-largura da cabeça na linha `r` (contada do topo): o ovo, testa larga e queixo fino. */
export function meiaLargura(r: number): number {
  if (r < 0 || r > FIM) return -1;
  if (r <= 18) return 18 * Math.sqrt(Math.max(0, 1 - ((18 - r) / 18.6) ** 2));
  return 18 - 10 * ((r - 18) / 30) ** 2.4;
}

/** Quantas linhas a boca abre com este `queixo`. */
export function aberturaDaBoca(queixo = 0): number {
  return Math.round(Math.max(0, Math.min(1, queixo)) * QUEIXO_MAX);
}

/** O meio da boca aberta, na grade (onde o bote mira o mouse). */
export function meioDaBoca(pose: PoseDaCabecona): readonly [number, number] {
  const topo = TOPO + (pose.baixa ? 3 : 0);
  return [CX, topo + BOCA + aberturaDaBoca(pose.queixo) / 2];
}

// ── O corpo: a gola de babado e os ombros ───────────────────────────────────

function corpo(g: Grade) {
  // Os ombros bufantes e o peito, com os pompons.
  for (let y = 66; y < H; y++) for (let x = CX - 14; x <= CX + 14; x++) pintar(g, x, y, Math.abs(x - CX) > 11 ? 'G' : 'g');
  for (const lado of [-1, 1]) {
    elipse(g, CX + lado * 20, 80, 14, 13.5, (ex, ey, x, y) => {
      const fora = ex * lado;
      const r = ex * ex + ey * ey;
      if (r > 0.8 && ey > 0.1) return 'K';
      if (fora < -0.1 && ey < -0.2 && r < 0.75) return 'l';
      if (fora > 0.5 || ey > 0.45) return 'G';
      // As dobras da manga, em arco.
      return Math.round(Math.hypot(x - (CX + lado * 26), y - 72)) % 7 === 0 ? 'G' : 'g';
    });
  }
  for (const y0 of [78, 89]) {
    elipse(g, CX, y0, 2.6, 2.2, (ex, ey) => (ex + ey > 0.6 ? 'P' : 'p'));
  }
  // A gola: duas camadas de babado em pregas, a de baixo mais larga, a borda em pontas.
  const babado = (cy: number, rx: number, ry: number) => elipse(g, CX, cy, rx, ry, (ex, ey, x) => {
    if (ey > 0.7) return (x + cy) % 3 === 0 ? 'D' : 'C';
    if (ey < -0.72) return 'C';
    const prega = ((x + 30) % 3) === 0;
    return prega ? 'C' : grao(x, cy) < 0.12 ? 'D' : 'c';
  });
  babado(66, 31, 6.5);
  for (let x = Math.ceil(CX - 29); x <= CX + 29; x++) if (x % 3 !== 0) pintar(g, x, 73, 'D');
  babado(60, 26, 6.5);
}

function cabelo(g: Grade, topo: number) {
  for (const lado of [-1, 1]) {
    // Os tufos dos lados, armados, mais escuros perto da cabeça e embaixo.
    elipse(g, CX + lado * 19.5, topo + 20, 10.5, 13, (ex, ey, x, y) => {
      const fora = ex * lado;
      if (fora > 0.55 && grao(x, y) < 0.4) return null; // as pontas ralas, enroladas
      if (ey > 0.6 && grao(x, y) < 0.35) return null;
      if (ey < -0.7 && grao(x + 3, y) < 0.3) return null;
      if (fora < -0.4 || ey > 0.45) return 'H';
      return fora - ey > 0.9 ? 'j' : grao(x, y) < 0.22 ? 'H' : 'h';
    });
    // O cabelo de trás, em volta do alto da cabeça.
    elipse(g, CX + lado * 11, topo + 7, 9, 6.5, (ex, ey, x, y) => {
      if (ey < -0.5 && grao(x, y) < 0.3) return null;
      return ex * lado < -0.2 ? 'H' : grao(x, y) < 0.2 ? 'j' : 'h';
    });
  }
  // O topete enrolado no meio, a ponta virada para um lado.
  const topete: readonly [number, number, number, string][] = [
    [-5, 31, 32, 'h'], [-4, 30, 33, 'h'], [-3, 29, 34, 'H'], [-2, 29, 34, 'h'], [-1, 30, 33, 'H'],
  ];
  for (const [r, de, ate, ch] of topete) for (let x = de; x <= ate; x++) pintar(g, x, topo + r, ch);
  pintar(g, 30, topo - 4, 'j'); pintar(g, 30, topo - 3, 'j');
  pintar(g, 35, topo - 4, 'h'); pintar(g, 36, topo - 5, 'H');
}

interface Rosto {
  topo: number;
  abre: number;
  /** Pinta na linha `r` da cabeça fechada (o que fica abaixo da boca desce com o queixo). */
  p(x: number, r: number, ch: string): void;
  /** Lê o que está pintado lá. */
  em(x: number, r: number): string;
}

function rosto(g: Grade, topo: number, abre: number): Rosto {
  const y = (r: number) => topo + (r > BOCA ? r + abre : r);
  return {
    topo, abre,
    p: (x, r, ch) => pintar(g, x, y(r), ch),
    em: (x, r) => g[Math.round(y(r))]?.[Math.round(x)] ?? '.',
  };
}

/** As quatro luzes da pele no fogo, da mais clara à mais funda. */
const LUZ_DA_PELE = ['w', 'W', 'a', 'A'] as const;
const PELE = new Set<string>(LUZ_DA_PELE);

/**
 * No fogo, quanto de sombra cai em cada ponto da cara (0 a 3): as beiradas e
 * o alto da testa escuros, o meio da cara (o nariz, o buço) fundo, as maçãs
 * claras de luz, e o grão da pele suja por cima.
 */
function sombraNoFogo(x: number, r: number, meia: number): number {
  const dx = Math.abs(x - CX) / Math.max(1, meia);
  let n = dx > 0.88 ? 2 : dx > 0.7 ? 1 : 0;
  if (r < 3) n = Math.max(n, 1);
  // O nariz e o buço no escuro, entre as duas maçãs.
  if (r >= 28 && r <= BOCA && Math.abs(x - CX) < 4.5) n = Math.max(n, r > 33 ? 3 : 2);
  else if (r >= 27 && r <= BOCA && Math.abs(x - CX) < 6.5) n = Math.max(n, 1);
  // A bochecha funda embaixo da maçã, e o queixo longe da luz.
  if (r > 32 && dx > 0.5 && dx <= 0.7) n = Math.max(n, 1);
  if (r > 43) n = Math.max(n, 1);
  const k = grao(x, r);
  if (k < 0.07) n += 1;
  else if (k > 0.96 && n > 0) n -= 1;
  return Math.min(3, n);
}

function pele(g: Grade, f: Rosto, queixo: number, fogo: boolean) {
  const { topo, abre } = f;
  for (let yy = topo; yy <= topo + FIM + abre; yy++) {
    const r = yy - topo;
    // A faixa da boca aberta: as bochechas esticam.
    const meia = r > BOCA && r <= BOCA + abre ? meiaLargura(BOCA) * (1 + 0.12 * queixo) : meiaLargura(r > BOCA ? r - abre : r);
    const rs = r > BOCA + abre ? r - abre : Math.min(r, BOCA);
    for (let x = Math.ceil(CX - meia); x <= Math.floor(CX + meia); x++) {
      if (fogo) { pintar(g, x, yy, LUZ_DA_PELE[sombraNoFogo(x, rs, meia)]); continue; }
      const borda = Math.abs(x - CX) > meia - 1.3;
      pintar(g, x, yy, borda && rs > 12 ? 'W' : 'w');
    }
  }
  // A testa rachada: as rachaduras finas e o calombo do meio.
  const rachas: readonly (readonly [number, number])[][] = [
    [[30, 3], [28, 7], [29, 10], [26, 13]],
    [[34, 4], [36, 8], [35, 11]],
    [[21, 8], [19, 11], [20, 13]],
    [[42, 7], [45, 10], [44, 13]],
    [[25, 5], [23, 7]],
  ];
  const racha = fogo ? 'a' : 'W';
  for (const r of rachas) {
    for (let i = 1; i < r.length; i++) linha(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1], (x, yy) => f.p(x, yy, racha));
  }
  for (const x of [26, 37]) for (let r = 4; r <= 9; r++) f.p(x, r, racha);
}

/**
 * Os olhos no fogo: a órbita funda embaixo da sobrancelha pesada e, dentro
 * dela, a fenda amarela acesa, puxada de raiva, com a brasa em volta.
 */
function olhosNoFogo(f: Rosto, pose: PoseDaCabecona, px: number) {
  OLHOS.forEach((ex, i) => {
    const dentro = i === 0 ? 1 : -1; // o lado do nariz
    // A órbita: funda no meio, rasa na borda.
    for (let r = OLHO_Y - 4; r <= OLHO_Y + 5; r++) {
      for (let x = ex - 7; x <= ex + 7; x++) {
        const e = ((x - ex) / 6.8) ** 2 + ((r - (OLHO_Y + 0.5)) / 4.4) ** 2;
        if (e <= 1 && PELE.has(f.em(x, r))) f.p(x, r, e < 0.5 ? 'A' : 'a');
      }
    }
    // A sobrancelha em V, pesando por cima do olho.
    for (let x = ex - 6; x <= ex + 6; x++) {
      const k = ((x - ex) * dentro + 6) / 12;
      const yb = 18 + Math.round(k * 3) + (pose.baixa ? 1 : 0);
      f.p(x, yb - 1, 'W');
      f.p(x, yb, 's');
      f.p(x, yb + 1, 's');
    }
    // O risco vermelho: da testa até a sobrancelha, e do olho ao canto da boca.
    for (let r = 7; r <= 18; r++) f.p(ex, r, 'r');
    linha(ex - dentro, OLHO_Y + 3, ex - dentro * 3, BOCA - 1, (x, r) => f.p(x, r, 'r'));
    if (pose.piscando) {
      for (let x = ex - 3; x <= ex + 3; x++) f.p(x, OLHO_Y + 1, 's');
      return;
    }
    // A fenda: o canto de dentro mais baixo (a raiva) e o miolo claro para onde ela olha.
    for (let x = ex - 3; x <= ex + 3; x++) {
      const t = (x - ex) * dentro; // de −3 (fora) a 3 (perto do nariz)
      const r = OLHO_Y + (t > 1 ? 1 : 0);
      f.p(x, r, 'E');
      if (Math.abs(t) < 2) f.p(x, r + 1, 'e');
    }
    f.p(ex + px, OLHO_Y, 'L'); f.p(ex + px - 1, OLHO_Y, 'L');
    // A brasa em volta da fenda, só no escuro da órbita.
    for (const [dx, dr] of [[-4, 0], [4, 0], [-2, -1], [0, -1], [2, -1], [-1, 2], [1, 2]] as const) {
      const ch = f.em(ex + dx, OLHO_Y + dr);
      if (ch === 'A' || ch === 'a') f.p(ex + dx, OLHO_Y + dr, 'e');
    }
  });
  // O nariz: pequeno, redondo, na sombra do meio da cara.
  for (const [x, r] of [[31, 31], [32, 31], [30, 32], [31, 32], [32, 32], [33, 32], [31, 33], [32, 33]]) f.p(x, r, 'n');
  f.p(32, 31, 'W');
}

function olhos(f: Rosto, pose: PoseDaCabecona) {
  const [ox, oy] = pose.olhar ?? [0, 0];
  const px = Math.round(Math.max(-1, Math.min(1, ox)) * 2);
  const py = pose.baixa ? -1 : Math.round(Math.max(-1, Math.min(1, oy)));
  const aceso = !!pose.brilho;
  if (pose.fogo) { olhosNoFogo(f, pose, px); return; }
  OLHOS.forEach((ex, i) => {
    const dentro = i === 0 ? 1 : -1; // o lado do nariz
    // A sobrancelha pesada, em V: o canto de dentro desce (a raiva).
    for (let x = ex - 5; x <= ex + 5; x++) {
      const k = ((x - ex) * dentro + 5) / 10;
      const yb = 19 + Math.round(k * 2.4) + (pose.baixa ? 1 : 0);
      f.p(x, yb, 's');
      f.p(x, yb + 1, 'W');
      if (pose.baixa) f.p(x, yb + 2, k > 0.3 ? 's' : 'W');
    }
    // A piscada: só a linha da pálpebra fechada (e o risco, que não pisca).
    if (pose.piscando) {
      for (let x = ex - 4; x <= ex + 4; x++) { f.p(x, OLHO_Y, 'W'); f.p(x, OLHO_Y + 1, 's'); }
      for (let r = 9; r <= 18; r++) f.p(ex, r, 'r');
      linha(ex, OLHO_Y + 3, ex - dentro * 2, BOCA - 1, (x, r) => f.p(x, r, 'r'));
      return;
    }
    // O olho amendoado.
    for (let r = OLHO_Y - 2; r <= OLHO_Y + 3; r++) {
      for (let x = ex - 5; x <= ex + 5; x++) {
        const e = ((x - ex) / 4.4) ** 2 + ((r - (OLHO_Y + 0.5)) / 2) ** 2;
        if (e > 1) continue;
        if (pose.baixa && r < OLHO_Y) continue; // a pálpebra baixa cobre o alto do olho
        f.p(x, r, aceso ? (e < 0.35 ? 'L' : 'E') : e > 0.62 ? 'Y' : 'y');
      }
    }
    // A pupila, para onde ela olha.
    for (const [dx, dy] of [[-1, 0], [0, 0], [-1, 1], [0, 1]]) {
      const x = ex + px + dx + (px < 0 ? 1 : 0), r = OLHO_Y + py + dy;
      const ch = f.em(x, r);
      if (ch === 'y' || ch === 'Y' || ch === 'L' || ch === 'E') f.p(x, r, aceso ? 'e' : 'm');
    }
    // O halo das luzes mortas, em volta do olho.
    if (aceso) {
      for (let r = OLHO_Y - 3; r <= OLHO_Y + 4; r++) {
        for (let x = ex - 6; x <= ex + 6; x++) {
          const e = ((x - ex) / 5.6) ** 2 + ((r - (OLHO_Y + 0.5)) / 3) ** 2;
          if (e <= 1 && (f.em(x, r) === 'w' || f.em(x, r) === 'W')) f.p(x, r, 'e');
        }
      }
    }
    // As olheiras fundas e o risco vermelho: da testa, pelo olho, até o canto da boca.
    for (let x = ex - 4; x <= ex + 4; x++) {
      f.p(x, OLHO_Y + 3, pose.baixa ? 's' : 'W');
      if (Math.abs(x - ex) < 3) f.p(x, OLHO_Y + 4, 'W');
    }
    f.p(ex - 6 * dentro, OLHO_Y, 'W'); f.p(ex - 6 * dentro, OLHO_Y + 1, 'W');
    for (let r = 9; r <= 18; r++) f.p(ex, r, 'r');
    linha(ex, OLHO_Y + 3, ex - dentro * 2, BOCA - 1, (x, r) => f.p(x, r, 'r'));
  });
  // O nariz: pequeno, redondo, vermelho-escuro.
  for (const [x, r] of [[31, 31], [32, 31], [30, 32], [31, 32], [32, 32], [33, 32], [31, 33], [32, 33]]) f.p(x, r, 'n');
  f.p(31, 31, 'r');
}

function bocaFechada(f: Rosto, pose: PoseDaCabecona) {
  // O sorriso: os cantos sobem, o lábio de baixo vermelho.
  for (let x = 21; x <= 42; x++) {
    const t = (x - CX) / 10.5;
    const y = 35 + Math.round(2.2 * (1 - t * t));
    f.p(x, y, 'r');
    f.p(x, y + 1, 'r');
    if (Math.abs(t) < 0.85) f.p(x, y + 2, pose.dentes ? (x % 3 === 0 ? 'm' : 't') : 'm');
    if (Math.abs(t) < 0.78) f.p(x, y + 3, 'r');
    if (Math.abs(t) < 0.5) f.p(x, y + 4, 'R');
  }
  // Os dois dentes da frente.
  if (!pose.dentes) { f.p(31, 39, 't'); f.p(32, 39, 't'); }
  // A sombra do queixo.
  for (let x = 28; x <= 35; x++) f.p(x, 46, 'W');
}

/**
 * A bocarra: um buraco que desce com o queixo, o lábio em volta, duas
 * fileiras de dentes cônicos (as de fora claras, as de dentro na luz) e, no
 * fundo, a garganta escura com as luzes mortas.
 */
function bocarra(g: Grade, f: Rosto, queixo: number, giro: number) {
  const abre = f.abre;
  const cy = f.topo + BOCA + abre / 2 + 0.5;
  const rx = 8.5 + 7.5 * queixo, ry = abre / 2 + 1.4;
  const luz = queixo > 0.55;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(CX - rx); x <= Math.ceil(CX + rx); x++) {
      const e = Math.sqrt(((x - CX) / rx) ** 2 + ((y - cy) / ry) ** 2);
      if (e > 1) continue;
      const k = 1 - e;
      let ch: string;
      if (e > 0.88) ch = y < cy ? 'r' : 'R';
      else if (k < 0.16) ch = 'f';
      else if (luz && k > 0.8) ch = 'e';
      else if (luz && k > 0.66) ch = 'f';
      else ch = k < 0.34 ? 'F' : 'x';
      pintar(g, x, y, ch);
    }
  }
  // As três luzes mortas no clarão: duas em cima, uma embaixo, cada uma com o
  // miolo branco, girando em volta do meio (pedido de 29/10: «as luzes quando
  // ele abre a boca também girar»).
  if (luz) {
    const d = Math.max(3, Math.round(rx * 0.28)), h = Math.max(2.5, ry * 0.3);
    const volta = giro * Math.PI * 2;
    const lugares = [-5 / 6, -1 / 6, 1 / 2].map(k => [CX + Math.cos(k * Math.PI + volta) * d, cy + Math.sin(k * Math.PI + volta) * h] as const);
    for (const [lx, ly] of lugares) {
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) pintar(g, lx + dx, ly + dy, 'E');
      pintar(g, lx, ly, 'L');
    }
  }
  if (abre < 6) return;
  // As fileiras: os dentes de fora, compridos e claros, junto do lábio; os de
  // dentro, menores, na luz da garganta. Cada dente é um cone: dois pixels na
  // base, um na ponta, e o vão escuro entre um e outro.
  const fileira = (anel: number, comp: number, passo: number, desvio: number, base: string, ponta: string) => {
    for (const lado of [-1, 1]) {
      for (let x = Math.ceil(CX - rx * anel) + desvio; x <= CX + rx * anel - 1; x += passo) {
        const t = (x + 0.5 - CX) / (rx * anel);
        if (Math.abs(t) > 0.96) continue;
        const borda = Math.round(cy + lado * ry * anel * Math.sqrt(Math.max(0, 1 - t * t)));
        const l = Math.max(2, Math.round(comp * (1 - Math.abs(t) * 0.55)));
        for (let j = 0; j < l; j++) {
          const y = borda - lado * j;
          const ch = j >= l - 1 ? ponta : base;
          pintar(g, x, y, ch);
          if (j < l * 0.55) pintar(g, x + 1, y, j === 0 ? 'T' : base);
        }
      }
    }
  };
  fileira(0.9, 2 + 6 * queixo, 3, 1, 't', 'q');
  fileira(0.62, 1 + 3 * queixo, 4, 2, 'Q', 'q');
}

function sangue(f: Rosto, fogo: boolean) {
  // No fogo, a mancha é borrada: forte na boca, rareando até o queixo, e os
  // pingos.
  if (fogo) {
    for (let r = BOCA + 2; r <= FIM; r++) {
      const meia = meiaLargura(r);
      for (let x = Math.ceil(CX - meia); x <= Math.floor(CX + meia); x++) {
        if (!PELE.has(f.em(x, r))) continue;
        const k = grao(x * 3, r) - Math.abs(x - CX) / 30;
        if (k > 0.32 + (r - 40) * 0.07) f.p(x, r, k > 0.8 ? 'r' : 'b');
      }
    }
    for (const [x, l] of [[25, 4], [29, 7], [34, 9], [38, 5]] as const) {
      for (let r = BOCA + 3; r <= FIM + l; r++) f.p(x, r, r > FIM + l - 2 ? 'B' : 'b');
    }
    return;
  }
  // A boca e o queixo manchados: da boca para baixo é tudo vermelho, a borda
  // de cima irregular, e os pingos descendo pela gola.
  for (let r = 33; r <= FIM; r++) {
    const meia = meiaLargura(r);
    for (let x = Math.ceil(CX - meia); x <= Math.floor(CX + meia); x++) {
      if (!PELE.has(f.em(x, r))) continue;
      const borda = 36 + Math.round(Math.abs(x - CX) / 4 + grao(x, 7) * 2.5);
      if (r < borda) continue;
      const fora = Math.abs(x - CX) > meia - 1.5;
      f.p(x, r, fora || r === borda ? 'B' : grao(x, r) < 0.1 ? 'r' : 'b');
    }
  }
  for (const [x, l] of [[24, 3], [27, 6], [31, 9], [35, 5], [38, 7]] as const) {
    for (let r = FIM - 1; r <= FIM + l; r++) f.p(x, r, r > FIM + l - 2 ? 'B' : 'b');
  }
}

function balao(g: Grade, topo: number) {
  const cx = CX - 2, cy = topo + 43, rx = 12.5, ry = 14.5;
  elipse(g, cx, cy, rx, ry, (ex, ey) => {
    const e = ex * ex + ey * ey;
    if (e > 0.88) return 'o';
    if (ex < -0.2 && ey < -0.3 && ex + ey > -1.25 && ex + ey < -0.85) return 'i';
    return ex + ey > 0.55 ? 'V' : 'v';
  });
  const pe = Math.round(cy + ry);
  pintar(g, cx, pe + 1, 'V'); pintar(g, cx - 1, pe + 2, 'V'); pintar(g, cx + 1, pe + 2, 'V');
  for (let y = pe + 3; y < H; y++) pintar(g, cx + Math.round(Math.sin(y * 0.35)), y, 'S');
}

function baba(g: Grade, f: Rosto, pose: PoseDaCabecona, deslocar: (y: number) => number) {
  const [a, b] = pose.baba ?? [0, 0];
  const abre = f.abre;
  const rx = 8.5 + 5.5 * (pose.queixo ?? 0);
  const cantos = abre > 0
    ? [[CX - rx * 0.6, f.topo + BOCA + abre + 1], [CX + rx * 0.6, f.topo + BOCA + abre + 1]]
    : [[23, f.topo + BOCA + 1], [40, f.topo + BOCA + 1]];
  [a, b].forEach((comp, i) => {
    if (comp <= 0) return;
    const [x0, y0] = cantos[i];
    const x = Math.round(x0 + deslocar(y0));
    for (let k = 0; k < comp; k++) { pintar(g, x, y0 + k, 'z'); if (k > 1) pintar(g, x + 1, y0 + k, 'Z'); }
    pintar(g, x - 1, y0 + comp, 'Z'); pintar(g, x, y0 + comp, 'z'); pintar(g, x + 1, y0 + comp, 'Z');
    pintar(g, x, y0 + comp + 1, 'Z');
  });
}

/** O busto inteiro, numa grade de `LARGURA_DA_CABECONA × ALTURA_DA_CABECONA`. */
export function montarCabecona(pose: PoseDaCabecona = {}): string[] {
  const queixo = Math.max(0, Math.min(1, pose.queixo ?? 0));
  const abre = aberturaDaBoca(queixo);
  const topo = TOPO + (pose.baixa ? 3 : 0);

  const g = grade();
  if (pose.corpo !== false) corpo(g);
  else {
    // Sem o corpo: só o babado em volta do pescoço.
    elipse(g, CX, 62, 26, 6, (ex, ey, x) => (ey > 0.7 ? (x % 2 ? 'C' : 'D') : ((x + 30) % 3) === 0 ? 'C' : 'c'));
  }

  // A cabeça numa grade só dela: inclina e desce o queixo sem mexer no corpo.
  const h = grade();
  cabelo(h, topo);
  const f = rosto(h, topo, abre);
  pele(h, f, queixo, !!pose.fogo);
  olhos(f, pose);
  if (abre > 0) bocarra(h, f, queixo, pose.giro ?? 0); else bocaFechada(f, pose);
  if (pose.sangue) sangue(f, !!pose.fogo);
  contornar(h);

  // Inclinar é deslizar as linhas: o pescoço fica, o alto da cabeça vai.
  const pivo = topo + FIM + abre;
  const inclina = Math.max(-1, Math.min(1, pose.inclina ?? 0));
  const deslocar = (y: number) => Math.round(inclina * (pivo - y) * 0.18);
  for (let y = 0; y < H; y++) {
    const d = deslocar(y);
    for (let x = 0; x < W; x++) if (h[y][x] !== '.') pintar(g, x + d, y, h[y][x]);
  }

  if (pose.balao) balao(g, topo);
  baba(g, f, pose, deslocar);
  contornar(g);
  return g.map(l => l.join(''));
}

/** O que é do olho na grade: o amarelo, a pupila e as luzes. */
const DO_OLHO = new Set(['y', 'Y', 'm', 'L', 'E', 'e']);

/**
 * Só os dois olhos (o bueiro, pedido de 28/10: «não quero o rosto, quero
 * apenas os olhos»): o mesmo desenho do busto, recortado em volta deles e sem
 * mais nada. A pupila vai com `olhar`; `piscando` apaga; `brilho` acende.
 */
export function olhosDaCabecona(pose: PoseDaCabecona = {}): string[] {
  const g = montarCabecona({ olhar: pose.olhar, brilho: pose.brilho, piscando: pose.piscando, corpo: false });
  const y0 = TOPO + OLHO_Y - 3, x0 = OLHOS[0] - 7, x1 = OLHOS[1] + 7;
  return g.slice(y0, y0 + 8).map(l => [...l.slice(x0, x1 + 1)].map(ch => (DO_OLHO.has(ch) ? ch : '.')).join(''));
}

// ── As cores ────────────────────────────────────────────────────────────────

export const PALETA_DA_CABECONA: Paleta = {
  ...PALETA_DA_COISA,
  // As sombras da pele (no giz só aparecem no fogo, mas têm cor em toda paleta).
  a: '#8f877d', A: '#4f4943',
  // O sangue.
  b: '#8f0a16', B: '#4f040b',
  // A boca por dentro: a gengiva, o escuro, o fundo.
  f: '#7c1610', F: '#2e0606', x: '#0e0203',
  // Os dentes: os de fora (t, T) e os de dentro, na luz (Q), com a ponta acesa.
  T: '#a99d78', Q: '#d9823a', q: '#ffd59a',
  // As luzes mortas: o miolo, o laranja e o halo.
  L: '#fff2b8', E: '#ffab2e', e: '#ff6a10',
  // O balão e o fio, a baba.
  v: '#d9121c', V: '#7e070e', i: '#ff8f8a', S: '#cfcfcf',
  z: '#cfeee2', Z: '#5f877a',
};

/**
 * A cara no fogo (a pixel art de 28/10): o giz sujo virando marrom quente na
 * luz de baixo, as órbitas e o meio da cara quase pretos, o cabelo ruivo
 * queimado com a borda acesa, a gola e a roupa no escuro, o vermelho da boca
 * e do risco forte, e os olhos amarelos acesos.
 */
export const PALETA_DO_FOGO: Paleta = {
  ...PALETA_DA_CABECONA,
  o: '#0a0302',
  w: '#e4c4a6', W: '#b48a6c', a: '#6f4434', A: '#2b130b', s: '#1c0b06',
  r: '#c0141c', R: '#5e050a', m: '#140303', n: '#2a0a08',
  t: '#ecc98a', T: '#8f6738',
  h: '#4d1d0e', H: '#230b05', j: '#d0601d',
  c: '#5c3a29', C: '#382114', D: '#1e0e07',
  g: '#2a140d', G: '#150906', l: '#4c2817', K: '#0c0403', k: '#080302',
  p: '#9c3410', P: '#4f1607',
  b: '#a4111a', B: '#55050b',
  L: '#fff8c4', E: '#ffcb2a', e: '#d4640f',
  z: '#e2a493', Z: '#8a3427',
};

/** O que fica com cor no cinza da foto da porta: os olhos e o balão. */
const CORES_QUE_FICAM = new Set(['y', 'Y', 'L', 'E', 'e', 'v', 'V', 'i']);

function cinzaDe(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.3 * r + 0.59 * g + 0.11 * b) * 0.62;
  const m = (c: number) => Math.round(c + (lum - c) * k);
  return `#${((m(r) << 16) | (m(g) << 8) | m(b)).toString(16).padStart(6, '0')}`;
}

/** A paleta em cinza (0 = cores, 1 = a foto da porta), menos os olhos e o balão. */
export function paletaEmCinza(k: number, base: Paleta = PALETA_DA_CABECONA): Paleta {
  if (k <= 0) return base;
  const nova: Record<string, string> = {};
  for (const [ch, cor] of Object.entries(base)) nova[ch] = CORES_QUE_FICAM.has(ch) ? cor : cinzaDe(cor, k);
  return nova;
}
