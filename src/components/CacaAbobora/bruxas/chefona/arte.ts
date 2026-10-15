/**
 * arte.ts — a Bruxa do Pântano, a chefona da Caça às Bruxas (15/10/2026).
 *
 * O que o Rei do Pop foi para os zumbis (o Thriller), ela é para as bruxas:
 * a referência é a BRUXA DO MINECRAFT, a que mora na cabana do pântano. O
 * desenho segue a referência que o usuário mandou (15/10/2026): chapéu preto
 * de degraus com a pedra verde na frente, rosto bege com a monocelha preta e
 * os olhos roxos, o narigão laranja, a gola e a faixa verdes, os ombros roxos
 * largos (os braços cruzados do aldeão), o manto roxo e os pés cinza, tudo
 * com contorno escuro. A fumaça roxa que sai do chapéu o palco solta.
 *
 * Não usa o esqueleto de 48×38 das bruxas de vassoura (`../arte.ts`): ela fica
 * de frente, em pé, como no jogo. O modelo é desenhado em TEXELS (o pixel da
 * textura do Minecraft, 22 × 46 com o contorno), e cada texel vira `PIXEL_MC`
 * × `PIXEL_MC` pixels da arte. A cor de cada texel tem o ruído das texturas
 * do jogo (um sorteio fixo entre tons), então nada fica chapado.
 *
 * As peças usam os mesmos nomes e números de `../arte.ts` (`NUMERO_DA_PARTE`):
 * o tiro por peça, o crítico na cabeça e o dano vêm de `alvoDaParte`.
 */
import { NUMERO_DA_PARTE, type Imagem, type NomeParte } from '../arte';

/** O modelo em texels, com o contorno. */
export const TEXELS_LARGURA = 22;
export const TEXELS_ALTURA = 46;
/** Quantos pixels da arte cada texel ocupa. */
export const PIXEL_MC = 2;
/** O sprite em pixels da arte. */
export const LARGURA_MC = TEXELS_LARGURA * PIXEL_MC;
export const ALTURA_MC = TEXELS_ALTURA * PIXEL_MC;

/** Quantos px da tela cada pixel da arte ocupa. */
export const ESCALA_CHEFONA = 3;

export const NOME_CHEFONA = 'Bruxa do Pântano';

/** Onde fica a ponta do chapéu (texel): de lá sai a fumaça roxa. */
export const PONTA_DO_CHAPEU = { x: 10.5, y: 1 } as const;

// ── As cores (as da referência) ────────────────────────────────────────────

export const CORES_MC = {
  contorno: '#0e0b14',
  chapeu: ['#1a1a1c', '#222226', '#2a2a2e'],
  chapeuLuz: '#3c3c42',
  chapeuSombra: '#0f0f12',
  pedra: '#1ec83a',
  pedraLuz: '#7aff86',
  pedraSombra: '#0f8a22',
  pele: ['#cdb59c', '#c6ad93', '#d4bea6'],
  peleSombra: '#a8907a',
  monocelha: '#141014',
  olhoBranco: '#f2f0f4',
  olhoRoxo: '#7a3ac8',
  nariz: '#d07848',
  narizSombra: '#a0522a',
  gola: '#1f8a2a',
  golaSombra: '#145a1c',
  faixa: '#1f8a2a',
  faixaLuz: '#3ab048',
  faixaSombra: '#145a1c',
  ombro: ['#6a1fb0', '#7226b8', '#6420a8'],
  ombroLuz: '#8a3ad0',
  ombroSombra: '#4a148a',
  ombroFundo: '#34106a',
  manto: ['#5a1a9a', '#621ea4', '#541892'],
  mantoSombra: '#3e1272',
  pe: ['#6a6a6e', '#5e5e62', '#747478'],
  peLuz: '#8a8a8e',
  peSombra: '#3e3e42',
} as const;

// ── Os quadros ─────────────────────────────────────────────────────────────
//
// 0–3 flutuando (o nariz mexe e a ponta do chapéu balança), 4–5 gargalhando
// (a cabeça vai para trás: quando joga poção, bebe ou fica tonta).

export interface QuadroMC {
  /** O nariz desce um texel (o nariz que mexe sozinho, do jogo). */
  nariz: number;
  /** A ponta do chapéu: −1, 0 ou 1 texel para o lado. */
  ponta: number;
  /** A cabeça e o chapéu sobem (gargalhando). */
  cabecaSobe: number;
  /** Um pé levanta (o «andar» no ar): −1 o esquerdo, 1 o direito. */
  passo: number;
}

export const QUADROS_MC: readonly QuadroMC[] = [
  { nariz: 0, ponta: 0, cabecaSobe: 0, passo: 0 },
  { nariz: 1, ponta: 0, cabecaSobe: 0, passo: 1 },
  { nariz: 0, ponta: 1, cabecaSobe: 0, passo: 0 },
  { nariz: 1, ponta: -1, cabecaSobe: 0, passo: -1 },
  { nariz: 0, ponta: 1, cabecaSobe: 1, passo: 0 },
  { nariz: 1, ponta: 0, cabecaSobe: 1, passo: 0 },
];
export const QUADROS_FLUTUANDO = 4;
export const PRIMEIRO_RINDO_MC = 4;

/** Um sorteio fixo por ponto (0–1): o mesmo tom no mesmo texel, sempre. */
export function acaso(x: number, y: number, s: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

const tom = (lista: readonly string[], x: number, y: number, s: number) => lista[Math.floor(acaso(x, y, s) * lista.length)];

/** Os texels do modelo: cor e peça de cada um. */
export interface Texels {
  cores: (string | null)[];
  partes: Uint8Array;
}

/** Contorno de 1 texel em volta do que estiver pintado (a peça é a do vizinho). */
function contornar(t: Texels, w: number, h: number, cor: string): void {
  const cores = t.cores.slice();
  const partes = t.partes.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (t.cores[y * w + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !t.cores[ny * w + nx]) continue;
        cores[y * w + x] = cor;
        partes[y * w + x] = t.partes[ny * w + nx];
        break;
      }
    }
  }
  t.cores = cores;
  t.partes = partes;
}

/** O modelo de frente, texel a texel. */
export function montarTexels(quadro: number): Texels {
  const q = QUADROS_MC[((quadro % QUADROS_MC.length) + QUADROS_MC.length) % QUADROS_MC.length];
  const W = TEXELS_LARGURA, H = TEXELS_ALTURA;
  const t: Texels = { cores: new Array(W * H).fill(null), partes: new Uint8Array(W * H) };
  const por = (x: number, y: number, cor: string, parte: NomeParte) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    t.cores[y * W + x] = cor;
    t.partes[y * W + x] = NUMERO_DA_PARTE[parte];
  };
  const C = CORES_MC;
  const sobe = q.cabecaSobe;

  // ── Os pés cinza (um levanta no passo) ──
  for (const [x0, lado] of [[6, -1], [11, 1]] as const) {
    const ergue = q.passo === lado ? 1 : 0;
    for (let y = 41; y <= 44 - ergue; y++) {
      for (let x = x0; x < x0 + 5; x++) {
        let cor: string = tom(C.pe, x, y, 1);
        if (y === 41) cor = C.peSombra;
        else if (x === x0) cor = C.peLuz;
        else if (x === x0 + 4) cor = C.peSombra;
        por(x, y, cor, 'pernaFrente');
      }
    }
  }

  // ── O manto de baixo, com a faixa verde no meio ──
  for (let y = 31; y <= 40; y++) {
    for (let x = 5; x <= 16; x++) {
      let cor: string = tom(C.manto, x, y, 2);
      if (x === 5 || x === 16) cor = C.mantoSombra;
      if (x === 10) cor = C.faixaLuz;
      if (x === 11) cor = C.faixa;
      if ((x === 10 || x === 11) && y === 40) cor = C.faixaSombra;
      por(x, y, cor, 'tronco');
    }
  }

  // ── Os ombros largos (os braços cruzados por baixo da capa) ──
  for (let y = 22; y <= 30; y++) {
    for (let x = 1; x <= 20; x++) {
      let cor: string = tom(C.ombro, x, y, 3);
      if (y === 22) cor = C.ombroLuz;
      if (y === 26) cor = C.ombroSombra;
      if (y >= 29) cor = C.ombroFundo;
      if ((x === 1 || x === 20) && y < 29) cor = C.ombroSombra;
      // A dobra do meio, onde os braços se cruzam.
      if ((x === 10 || x === 11) && y >= 27 && y < 29) cor = C.ombroSombra;
      por(x, y, cor, 'bracoFrente');
    }
  }
  // A gola verde, por baixo do nariz.
  for (let x = 8; x <= 13; x++) {
    por(x, 22, C.gola, 'tronco');
    por(x, 23, x === 8 || x === 13 ? C.golaSombra : C.gola, 'tronco');
  }

  // ── A cabeça (10 × 9), por baixo da aba do chapéu ──
  const cy = 13 - sobe;
  // Gargalhando, a cabeça sobe e aparece o pescoço.
  if (sobe) for (let x = 8; x <= 13; x++) por(x, 21, C.peleSombra, 'cabeca');
  for (let y = cy; y < cy + 9; y++) {
    for (let x = 6; x <= 15; x++) {
      const borda = x === 6 || x === 15 || y === cy + 8;
      por(x, y, borda ? C.peleSombra : tom(C.pele, x, y, 4), 'cabeca');
    }
  }
  // A monocelha preta e os olhos: branco por fora, roxo por dentro.
  for (let x = 7; x <= 14; x++) por(x, cy + 2, C.monocelha, 'cabeca');
  por(7, cy + 3, C.olhoBranco, 'cabeca');
  por(8, cy + 3, C.olhoRoxo, 'cabeca');
  por(13, cy + 3, C.olhoRoxo, 'cabeca');
  por(14, cy + 3, C.olhoBranco, 'cabeca');
  // O narigão laranja: do olho até passar do queixo. Ele mexe.
  const ny = cy + 3 + q.nariz;
  for (let y = ny; y <= cy + 9; y++) {
    por(10, y, C.nariz, 'cabeca');
    por(11, y, C.narizSombra, 'cabeca');
  }
  por(10, cy + 9, C.narizSombra, 'cabeca');

  // ── O chapéu: ponta, degrau de cima, degrau da pedra verde, aba ──
  const hy = -sobe;
  const chapeu = (x: number, y: number, cor?: string) => por(x, y + hy, cor ?? tom(C.chapeu, x, y, 5), 'chapeu');
  for (let x = 4; x <= 17; x++) {
    chapeu(x, 10, C.chapeuLuz);
    chapeu(x, 11);
    chapeu(x, 12, C.chapeuSombra);
  }
  for (let y = 6; y <= 9; y++) for (let x = 6; x <= 15; x++) chapeu(x, y, x === 15 ? C.chapeuSombra : undefined);
  // A pedra verde na frente do chapéu.
  for (let y = 6; y <= 9; y++) {
    for (let x = 9; x <= 12; x++) {
      const meio = (x === 10 || x === 11) && (y === 7 || y === 8);
      chapeu(x, y, meio ? (y === 7 && x === 10 ? C.pedraLuz : C.pedra) : C.pedraSombra);
    }
  }
  for (let y = 2; y <= 5; y++) for (let x = 8; x <= 13; x++) chapeu(x, y, x === 13 ? C.chapeuSombra : undefined);
  chapeu(10 + q.ponta, 1);
  chapeu(11 + q.ponta, 1);

  contornar(t, W, H, C.contorno);
  return t;
}

/** O sprite em pixels da arte (cada texel vira um quadrado de `PIXEL_MC`). */
export function texelsParaImagem(t: Texels): Imagem {
  const w = LARGURA_MC, h = ALTURA_MC;
  const img: Imagem = { largura: w, altura: h, cores: new Array(w * h).fill(null), partes: new Uint8Array(w * h) };
  for (let y = 0; y < TEXELS_ALTURA; y++) {
    for (let x = 0; x < TEXELS_LARGURA; x++) {
      const i = y * TEXELS_LARGURA + x;
      if (!t.cores[i]) continue;
      for (let j = 0; j < PIXEL_MC; j++) for (let k = 0; k < PIXEL_MC; k++) {
        const o = (y * PIXEL_MC + j) * w + x * PIXEL_MC + k;
        img.cores[o] = t.cores[i];
        img.partes[o] = t.partes[i];
      }
    }
  }
  return img;
}

// ── O dano (15/10/2026) ────────────────────────────────────────────────────
//
// No Minecraft nada sangra: o que «apanha» são os blocos, que racham em dez
// estágios antes de quebrar. Ela racha assim também, em três estágios (75%,
// 50% e 25% da vida). As rachaduras são linhas de texel que andam ao acaso a
// partir de pontos fixos, então ficam no mesmo lugar em todo quadro.

/** 0 inteira … 3 em pedaços. */
export function estagioDoDano(fracaoDaVida: number): 0 | 1 | 2 | 3 {
  if (fracaoDaVida > 0.75) return 0;
  if (fracaoDaVida > 0.5) return 1;
  if (fracaoDaVida > 0.25) return 2;
  return 3;
}

const COR_RACHADURA = '#0e0b14';
const RACHADURAS_POR_ESTAGIO = [0, 3, 6, 10] as const;
const PASSOS_POR_ESTAGIO = [0, 4, 6, 8] as const;

/** Os texels de rachadura do estágio (posições fixas, em texel). */
export function rachaduras(estagio: number): Set<number> {
  const s = new Set<number>();
  const e = Math.max(0, Math.min(3, estagio));
  for (let k = 0; k < RACHADURAS_POR_ESTAGIO[e]; k++) {
    let x = 4 + Math.floor(acaso(k, 1, 11) * 14);
    let y = 6 + Math.floor(acaso(k, 2, 13) * 34);
    for (let p = 0; p < PASSOS_POR_ESTAGIO[e]; p++) {
      s.add(y * TEXELS_LARGURA + x);
      const r = acaso(k, p, 17);
      if (r < 0.4) x += 1; else if (r < 0.7) x -= 1;
      y += acaso(p, k, 19) < 0.6 ? 1 : 0;
      x = Math.max(0, Math.min(TEXELS_LARGURA - 1, x));
      y = Math.min(TEXELS_ALTURA - 1, y);
    }
  }
  return s;
}

/** Os texels com as rachaduras do estágio. Só as cores mudam (o tiro por peça continua igual). */
export function rachar(t: Texels, estagio: number): Texels {
  if (estagio <= 0) return t;
  const cores = t.cores.slice();
  for (const i of rachaduras(estagio)) if (cores[i] && cores[i] !== CORES_MC.contorno) cores[i] = COR_RACHADURA;
  return { cores, partes: t.partes };
}

/** O sprite pronto: quadro, estágio do dano. */
export function montarBruxaMC(quadro: number, estagio = 0): Imagem {
  return texelsParaImagem(rachar(montarTexels(quadro), estagio));
}

/** Só a cabeça com o chapéu (o retrato da contagem e da conquista), em texels. */
export function cabecaMC(): Imagem {
  const t = montarTexels(0);
  const x0 = 3, x1 = 18, y1 = 23;
  const w = x1 - x0 + 1, h = y1 + 1;
  const img: Imagem = { largura: w, altura: h, cores: new Array(w * h).fill(null), partes: new Uint8Array(w * h) };
  for (let y = 0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    // Do ombro só entra a gola: o retrato fecha no queixo.
    const parte = t.partes[y * TEXELS_LARGURA + x];
    if (y >= 22 && parte !== NUMERO_DA_PARTE.cabeca && parte !== NUMERO_DA_PARTE.tronco) continue;
    img.cores[y * w + x - x0] = t.cores[y * TEXELS_LARGURA + x];
  }
  return img;
}

// ── A garrafa de poção e os itens (os da referência, 16 × 16) ──────────────
//
// A garrafa do jogo: rolha laranja, boca e gargalo de vidro azulado, o bojo
// redondo com o líquido (L), o brilho do líquido (l), o fundo escuro (D) e os
// reflexos brancos do vidro (w). Sem líquido, é a Garrafa de Vidro.

export interface Item { nome: string; linhas: readonly string[]; cores: Readonly<Record<string, string>> }

export const GARRAFA: readonly string[] = [
  '......CCCC......',
  '......cccc......',
  '.....gwwwwg.....',
  '......gwwg......',
  '......gLLg......',
  '....ggLLLLgg....',
  '...gwlLLLLLLg...',
  '..gwllLLLLLLLg..',
  '.gwlLLLLLLLLLLg.',
  '.gwLLLLLLLLLLLg.',
  '.gwLLLLLLLLLDLg.',
  '.gLLLLLLLLLDDLg.',
  '.gLLLLLLLLDDDLg.',
  '..gLLLLLLLLLLg..',
  '...gwwwwwwwwg...',
  '....gggggggg....',
];

const VIDRO = { C: '#d08a50', c: '#8a4a24', g: '#9ec4e8', w: '#f0f8ff' } as const;

/** As cores de uma poção: o líquido, o brilho e o fundo. */
export function coresDaPocao(cor: string, clara: string, escura: string): Record<string, string> {
  return { ...VIDRO, L: cor, l: clara, D: escura };
}

/** Uma linha de 16 com `s` começando na coluna `c`. */
const em = (c: number, s: string) => ('.'.repeat(c) + s + '.'.repeat(16)).slice(0, 16);

const BASTAO: readonly string[] = Array.from({ length: 16 }, (_, r) => {
  if (r < 1 || r > 14) return '.'.repeat(16);
  // A vareta na diagonal, de baixo à esquerda para cima à direita, em gomos.
  return em(14 - r, r % 3 === 0 ? 'wd' : 'Ww');
});

const MONTE: readonly string[] = [
  '................',
  '................',
  '................',
  '.......R........',
  '......rHr.......',
  '.....rRRRr..R...',
  '...r.RRHRRr.rR..',
  '..rRrRRRRRRrRr..',
  '.rRRHRRrRRRHRRr.',
  '.rRRRRRRRRRRRRr.',
  '..rRRRrRRHRRRr..',
  '...rRRRRRRRRr...',
  '....rrRRRRrr....',
  '......rrrr......',
  '................',
  '................',
];

/** Os drops dela, como na referência: cada um sai 0 ou 1 vez. */
export const DROPS: readonly Item[] = [
  { nome: 'Poção de Cura', linhas: GARRAFA, cores: coresDaPocao('#d81c2c', '#ff7a7a', '#8a0a14') },
  { nome: 'Poção de Veneno', linhas: GARRAFA, cores: coresDaPocao('#4e8a1c', '#8ac83a', '#2a5a10') },
  { nome: 'Poção de Fraqueza', linhas: GARRAFA, cores: coresDaPocao('#7a2ae0', '#b88aff', '#4a1090') },
  { nome: 'Garrafa de Vidro', linhas: GARRAFA, cores: { ...VIDRO, D: '#c8e0f4' } },
  { nome: 'Bastão de Bruxa', linhas: BASTAO, cores: { W: '#b0844e', w: '#7a5228', d: '#4a2e14' } },
  { nome: 'Pó de Redstone', linhas: MONTE, cores: { r: '#6a0a08', R: '#d01a10', H: '#ff6a5a' } },
  { nome: 'Pó de Glowstone', linhas: MONTE, cores: { r: '#8a5a10', R: '#f0b81a', H: '#fff8a0' } },
  {
    nome: 'Olho de Aranha',
    linhas: [
      '................',
      '................',
      '.....rrrr.......',
      '....rHHRRr......',
      '...rHHRRRRr.....',
      '...rHRkkRRr.....',
      '...rRRkkRRr.....',
      '...rRRRRRRr.....',
      '....rRRRRRRr....',
      '.....rrRRRRr....',
      '.......rRRRr....',
      '........rRRr....',
      '.........rRRr...',
      '..........rRr...',
      '...........r....',
      '................',
    ],
    cores: { r: '#6a0a1a', R: '#c8304a', H: '#ff8aa0', k: '#1a0a0e' },
  },
];

/** O item com contorno escuro de 1 pixel (para ler na tela clara do Gestão). */
export function comContorno(it: Item): Item {
  const h = it.linhas.length, w = it.linhas[0].length;
  const cheio = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && it.linhas[y][x] !== '.';
  const linhas = it.linhas.map((l, y) => [...l].map((ch, x) => {
    if (ch !== '.') return ch;
    return cheio(x + 1, y) || cheio(x - 1, y) || cheio(x, y + 1) || cheio(x, y - 1) ? 'o' : '.';
  }).join(''));
  return { ...it, linhas, cores: { ...it.cores, o: CORES_MC.contorno } };
}
