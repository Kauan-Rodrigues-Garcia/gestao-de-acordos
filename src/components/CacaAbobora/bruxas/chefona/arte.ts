/**
 * arte.ts — a Bruxa do Pântano, a chefona da Caça às Bruxas (15/10/2026).
 *
 * O que o Rei do Pop foi para os zumbis (o Thriller), ela é para as bruxas:
 * a referência é a BRUXA DO MINECRAFT, a que mora na cabana do pântano.
 *
 * ## O modelo é a imagem de referência, texel a texel
 *
 * O desenho foi tirado da imagem que o usuário mandou (15/10/2026), contando
 * os texels dela: a grade `MODELO` tem 18 × 42 texels e cada letra é uma cor
 * da referência. De cima para baixo: a ponta do chapéu (2 de largura), o
 * degrau de cima (4), o degrau da pedra verde (6 e 8, com a pedra de 4 × 3),
 * a aba larga em três tons (10); o rosto bege de 8 com as laterais na sombra,
 * a monocelha preta, os olhos brancos por fora e roxos por dentro, o narigão
 * laranja de 2 que passa do queixo; a gola verde por baixo do nariz; os ombros
 * roxos de 16 (os braços cruzados do aldeão), mais claros embaixo e com o vão
 * escuro no meio; o manto de 10 com a faixa verde de 2 entre dois vincos; e os
 * pés cinza, com a costura. O contorno escuro em volta vem de `contornar`.
 *
 * Cada texel vira `PIXEL_MC` × `PIXEL_MC` pixels da arte. Algumas letras têm
 * ruído (um sorteio fixo entre tons, como nas texturas do jogo).
 *
 * ## As animações
 *
 * Tudo em passos de texel inteiro, para a pixel art não borrar: o corpo de cima
 * «respira» (desce um texel e volta), a ponta do chapéu balança, o nariz mexe
 * (o do jogo, que mexe quando ela bebe), um pé de cada vez fica pendurado na
 * levitação, ela fecha os olhos quando apanha, joga a cabeça para trás quando
 * gargalha, e ergue o braço para segurar a poção ou o totem.
 *
 * As peças usam os mesmos nomes e números de `../arte.ts` (`NUMERO_DA_PARTE`):
 * o tiro por peça, o crítico na cabeça e o dano vêm de `alvoDaParte`.
 */
import { NUMERO_DA_PARTE, type Imagem, type NomeParte } from '../arte';

/** O modelo em texels, com o contorno. */
export const TEXELS_LARGURA = 18;
export const TEXELS_ALTURA = 42;
/** Quantos pixels da arte cada texel ocupa. */
export const PIXEL_MC = 2;
/** O sprite em pixels da arte. */
export const LARGURA_MC = TEXELS_LARGURA * PIXEL_MC;
export const ALTURA_MC = TEXELS_ALTURA * PIXEL_MC;

/** Quantos px da tela cada pixel da arte ocupa. */
export const ESCALA_CHEFONA = 3;

export const NOME_CHEFONA = 'Bruxa do Pântano';

/** Onde fica a ponta do chapéu (texel): de lá sai a fumaça roxa. */
export const PONTA_DO_CHAPEU = { x: 9, y: 1 } as const;
/** A mão erguida (texel, lado para onde ela olha): onde fica a garrafa que ela vai jogar. */
export const MAO_ERGUIDA = { x: 15, y: 10 } as const;
/** A mão erguida bem alto (o totem). */
export const MAO_NO_ALTO = { x: 15, y: 6 } as const;
/** A boca (texel): onde a garrafa encosta quando ela bebe. */
export const BOCA = { x: 11, y: 16 } as const;
/** A outra mão (texel), onde ela segura o totem enquanto está protegida. */
export const OUTRA_MAO = { x: 1, y: 21 } as const;

// ── As cores (tiradas da referência) ───────────────────────────────────────

export const CORES_MC = {
  contorno: '#0d0a12',
  chapeu: ['#232325', '#202022', '#262628'],
  chapeuEscuro: ['#151517', '#131315', '#18181a'],
  chapeuSombra: '#0c0c0e',
  chapeuLuz: '#2c2c2e',
  pedraSombra: '#0c3a12',
  pedra: '#0b8a1a',
  pedraLuz: '#16c826',
  peleTopo: '#a08672',
  pele: ['#b49b88', '#ae9581', '#b8a08d'],
  peleLuz: '#c0a895',
  peleSombra: '#7a6150',
  queixo: '#76695d',
  monocelha: '#20180f',
  olhoBranco: '#fdfcff',
  olhoRoxo: '#5e2c74',
  narizLuz: '#c47446',
  nariz: '#b2643a',
  narizSombra: '#6a3418',
  pontaNariz: '#9a8570',
  golaSombra: '#0b3603',
  gola: '#135407',
  ombro: ['#3e0a6c', '#3a0866', '#420c72'],
  ombroLuz: ['#4c1084', '#48107e', '#521488'],
  ombroSombra: '#2a0650',
  ombroFundo: '#1c0636',
  manto: ['#3c0868', '#380664', '#3e0a6c'],
  mantoLuz: '#46107a',
  vinco: '#1a0630',
  faixa: '#105204',
  faixaLuz: '#186a08',
  peTopo: '#1a1a1a',
  peMeio: '#2e2a26',
  pe: ['#464646', '#424242', '#4a4a4a'],
  peLuz: '#575757',
  peSombra: '#222222',
} as const;

type Camada = 'pe' | 'manto' | 'corpo' | 'cabeca' | 'chapeu' | 'braco';

interface Letra { cor: string | readonly string[]; parte: NomeParte; camada: Camada }

const C = CORES_MC;

/** Cada letra do `MODELO`: a cor, a peça (para o tiro) e a camada (para a animação). */
const LETRAS: Readonly<Record<string, Letra>> = {
  // O chapéu
  H: { cor: C.chapeu, parte: 'chapeu', camada: 'chapeu' },
  h: { cor: C.chapeuEscuro, parte: 'chapeu', camada: 'chapeu' },
  k: { cor: C.chapeuSombra, parte: 'chapeu', camada: 'chapeu' },
  j: { cor: C.chapeuLuz, parte: 'chapeu', camada: 'chapeu' },
  e: { cor: C.pedraSombra, parte: 'chapeu', camada: 'chapeu' },
  g: { cor: C.pedra, parte: 'chapeu', camada: 'chapeu' },
  G: { cor: C.pedraLuz, parte: 'chapeu', camada: 'chapeu' },
  // O rosto
  '1': { cor: C.peleTopo, parte: 'cabeca', camada: 'cabeca' },
  s: { cor: C.pele, parte: 'cabeca', camada: 'cabeca' },
  S: { cor: C.peleLuz, parte: 'cabeca', camada: 'cabeca' },
  t: { cor: C.peleSombra, parte: 'cabeca', camada: 'cabeca' },
  q: { cor: C.queixo, parte: 'cabeca', camada: 'cabeca' },
  b: { cor: C.monocelha, parte: 'cabeca', camada: 'cabeca' },
  W: { cor: C.olhoBranco, parte: 'cabeca', camada: 'cabeca' },
  p: { cor: C.olhoRoxo, parte: 'cabeca', camada: 'cabeca' },
  N: { cor: C.narizLuz, parte: 'cabeca', camada: 'cabeca' },
  n: { cor: C.nariz, parte: 'cabeca', camada: 'cabeca' },
  m: { cor: C.narizSombra, parte: 'cabeca', camada: 'cabeca' },
  u: { cor: C.pontaNariz, parte: 'cabeca', camada: 'cabeca' },
  // A gola e os ombros
  c: { cor: C.golaSombra, parte: 'tronco', camada: 'corpo' },
  C: { cor: C.gola, parte: 'tronco', camada: 'corpo' },
  o: { cor: C.ombro, parte: 'bracoFrente', camada: 'corpo' },
  O: { cor: C.ombroLuz, parte: 'bracoFrente', camada: 'corpo' },
  d: { cor: C.ombroSombra, parte: 'bracoFrente', camada: 'corpo' },
  D: { cor: C.ombroFundo, parte: 'bracoFrente', camada: 'corpo' },
  // O manto
  r: { cor: C.manto, parte: 'tronco', camada: 'manto' },
  R: { cor: C.mantoLuz, parte: 'tronco', camada: 'manto' },
  x: { cor: C.vinco, parte: 'tronco', camada: 'manto' },
  v: { cor: C.faixa, parte: 'tronco', camada: 'manto' },
  V: { cor: C.faixaLuz, parte: 'tronco', camada: 'manto' },
  // Os pés
  f: { cor: C.peTopo, parte: 'pernaFrente', camada: 'pe' },
  a: { cor: C.peMeio, parte: 'pernaFrente', camada: 'pe' },
  A: { cor: C.pe, parte: 'pernaFrente', camada: 'pe' },
  z: { cor: C.peLuz, parte: 'pernaFrente', camada: 'pe' },
  y: { cor: C.peSombra, parte: 'pernaFrente', camada: 'pe' },
  // O braço erguido (só nos quadros de segurar, beber e totem)
  M: { cor: C.pele, parte: 'bracoFrente', camada: 'braco' },
  T: { cor: C.peleSombra, parte: 'bracoFrente', camada: 'braco' },
};

/**
 * A bruxa da referência, de frente, sem o contorno de fora (18 × 42).
 * Linhas: 1 ponta · 2–3 degrau · 4–7 degrau da pedra · 8–10 aba · 11–18 rosto ·
 * 18–25 ombros · 19–20 gola · 26 vinco · 27–36 manto · 37–40 pés.
 */
export const MODELO: readonly string[] = [
  '..................',
  '........HH........',
  '.......hhhh.......',
  '.......hhhk.......',
  '......HHHHHH......',
  '......heggeh......',
  '.....HhgGGghH.....',
  '.....HheggehH.....',
  '....jjjjjjjjjj....',
  '....hhhhhhhhhh....',
  '....kkkkkkkkkk....',
  '.....11111111.....',
  '.....tsSssSst.....',
  '.....tbbbbbbt.....',
  '.....tWpsspWt.....',
  '.....tssNnsst.....',
  '.....tSsNnSst.....',
  '.....tssNnsst.....',
  '..ooooqqmmqqoooo..',
  '.ooooodcuucdooooo.',
  '.oooooDdCCdDooooo.',
  '.OOOOOOoDDoOOOOOO.',
  '.OOOOOOoDDoOOOOOO.',
  '.OOOOOOOddOOOOOOO.',
  '.dddddddDDddddddd.',
  '..DDDDDDDDDDDDDD..',
  '....xxxxxxxxxx....',
  '....rRrxvVxrRr....',
  '....rRrxvVxrRr....',
  '....rRrxvVxrRr....',
  '....rRrxvVxrRr....',
  '....rRrxvVxrRr....',
  '....rRrxvVxrRr....',
  '....rRrxvVxrRr....',
  '....rRrxvVxrRr....',
  '....rRrxvVxrRr....',
  '.....RrxvVxrR.....',
  '.....ffffffff.....',
  '.....aaafaaaa.....',
  '.....zAAyAAAA.....',
  '.....zAAyAAzA.....',
  '..................',
];

/** As linhas do nariz e a do queixo (no `MODELO`). */
const NARIZ_DE = 15;
const LINHA_QUEIXO = 18;
/** As colunas de cada pé (o esquerdo leva a costura). */
const PE_ESQUERDO = [5, 8] as const;
const PE_DIREITO = [9, 12] as const;
const PRIMEIRA_LINHA_PE = 37;

// ── Os quadros ─────────────────────────────────────────────────────────────

export type Braco = 'cruzado' | 'erguido' | 'boca' | 'alto';

export interface QuadroMC {
  /** O nariz desce um texel (o nariz que mexe sozinho, do jogo). */
  nariz: 0 | 1;
  /** A ponta do chapéu: −1, 0 ou 1 texel para o lado. */
  ponta: -1 | 0 | 1;
  /** O corpo de cima desce um texel (a respiração). */
  respira: 0 | 1;
  /** A cabeça e o chapéu sobem (gargalhando, bebendo). */
  cabecaSobe: 0 | 1;
  /** Um pé fica pendurado: −1 o esquerdo, 1 o direito. */
  passo: -1 | 0 | 1;
  olhos: 'abertos' | 'fechados';
  braco: Braco;
}

const q = (o: Partial<QuadroMC>): QuadroMC => ({ nariz: 0, ponta: 0, respira: 0, cabecaSobe: 0, passo: 0, olhos: 'abertos', braco: 'cruzado', ...o });

export const QUADROS_MC: readonly QuadroMC[] = [
  // 0–5 flutuando: respira, a ponta balança, o nariz mexe, um pé de cada vez.
  q({}),
  q({ ponta: 1, nariz: 1, passo: 1 }),
  q({ ponta: 1, respira: 1, passo: 1 }),
  q({ respira: 1 }),
  q({ ponta: -1, respira: 1, nariz: 1, passo: -1 }),
  q({ ponta: -1, passo: -1 }),
  // 6–7 gargalhando: cabeça para trás, olhos fechados, o chapéu sacudindo.
  q({ cabecaSobe: 1, olhos: 'fechados', ponta: 1 }),
  q({ cabecaSobe: 1, olhos: 'fechados', ponta: -1, nariz: 1, respira: 1 }),
  // 8–9 segurando a poção no alto, pronta para jogar.
  q({ braco: 'erguido', ponta: 1 }),
  q({ braco: 'erguido', ponta: -1, nariz: 1, respira: 1 }),
  // 10–11 bebendo: cabeça para trás, a garrafa na boca, o nariz mexendo.
  q({ braco: 'boca', cabecaSobe: 1 }),
  q({ braco: 'boca', cabecaSobe: 1, nariz: 1 }),
  // 12–13 apanhando ou tonta: olhos fechados.
  q({ olhos: 'fechados', respira: 1 }),
  q({ olhos: 'fechados', nariz: 1, ponta: 1 }),
  // 14–15 erguendo o totem bem alto.
  q({ braco: 'alto', cabecaSobe: 1, ponta: 1 }),
  q({ braco: 'alto', cabecaSobe: 1, ponta: -1, nariz: 1 }),
];
export const QUADROS_FLUTUANDO = 6;
export const PRIMEIRO_RINDO_MC = 6;
export const PRIMEIRO_SEGURANDO_MC = 8;
export const PRIMEIRO_BEBENDO_MC = 10;
export const PRIMEIRO_DOR_MC = 12;
export const PRIMEIRO_TOTEM_MC = 14;

/** Um sorteio fixo por ponto (0–1): o mesmo tom no mesmo texel, sempre. */
export function acaso(x: number, y: number, s: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

/** A cor da letra no texel (com o ruído fixo, quando a letra tem vários tons). */
function corDa(l: Letra, x: number, y: number): string {
  return typeof l.cor === 'string' ? l.cor : l.cor[Math.floor(acaso(x, y, 7) * l.cor.length)];
}

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

/** As camadas, de trás para a frente. */
const ORDEM_CAMADAS: readonly Camada[] = ['pe', 'manto', 'corpo', 'cabeca', 'chapeu'];

/** O braço erguido, do lado para onde ela olha: manga roxa e a mão. */
function braco(tipo: Braco, por: (x: number, y: number, l: string) => void, dy: number): void {
  if (tipo === 'cruzado') return;
  if (tipo === 'boca') {
    // A mão sobe até a boca, rente ao rosto (a garrafa cobre o resto).
    for (let y = 15; y <= 17; y++) { por(13, y + dy, 'O'); por(14, y + dy, 'd'); }
    por(12, 14 + dy, 'M');
    por(13, 14 + dy, 'M');
    return;
  }
  const mao = tipo === 'alto' ? MAO_NO_ALTO.y + 1 : MAO_ERGUIDA.y + 1;
  for (let y = mao + 2; y <= 17; y++) { por(14, y + dy, 'O'); por(15, y + dy, 'd'); }
  por(14, mao + dy, 'M');
  por(15, mao + dy, 'T');
  por(14, mao + 1 + dy, 'M');
  por(15, mao + 1 + dy, 'T');
}

/** O modelo de frente, texel a texel, no quadro pedido. */
export function montarTexels(quadro: number): Texels {
  const qd = QUADROS_MC[((quadro % QUADROS_MC.length) + QUADROS_MC.length) % QUADROS_MC.length];
  const W = TEXELS_LARGURA, H = TEXELS_ALTURA;
  const t: Texels = { cores: new Array(W * H).fill(null), partes: new Uint8Array(W * H) };
  const por = (x: number, y: number, letra: string, xo = x, yo = y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const l = LETRAS[letra];
    t.cores[y * W + x] = corDa(l, xo, yo);
    t.partes[y * W + x] = NUMERO_DA_PARTE[l.parte];
  };
  const dyCorpo = qd.respira;
  const dyCabeca = qd.respira - qd.cabecaSobe;
  for (const camada of ORDEM_CAMADAS) {
    // Gargalhando, a cabeça sobe e aparece o pescoço onde estava o queixo.
    if (camada === 'cabeca' && qd.cabecaSobe) for (let x = 6; x <= 11; x++) por(x, LINHA_QUEIXO + dyCorpo, 't');
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = MODELO[y][x];
        const l = LETRAS[ch];
        if (!l || l.camada !== camada) continue;
        let ny = y, nx = x;
        if (camada === 'corpo') ny += dyCorpo;
        else if (camada === 'cabeca' || camada === 'chapeu') ny += dyCabeca;
        if (camada === 'chapeu' && y === PONTA_DO_CHAPEU.y) nx += qd.ponta;
        if (camada === 'pe') {
          const [a, b] = qd.passo < 0 ? PE_ESQUERDO : PE_DIREITO;
          if (qd.passo && x >= a && x <= b) ny -= 1;
          // O pé que subiu esconde o topo atrás do manto: some a linha de cima.
          if (qd.passo && x >= a && x <= b && y === PRIMEIRA_LINHA_PE) continue;
        }
        if (camada === 'cabeca' && 'Nnmu'.includes(ch) && qd.nariz) {
          // O nariz desce: onde ele estava no alto vira pele.
          if (y === NARIZ_DE) por(nx, ny, 's', x, y);
          ny += 1;
        }
        const letra = qd.olhos === 'fechados' && (ch === 'W' || ch === 'p') ? 'q' : ch;
        por(nx, ny, letra, x, y);
      }
    }
  }
  braco(qd.braco, (x, y, l) => por(x, y, l), dyCorpo);
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
    let x = 4 + Math.floor(acaso(k, 1, 11) * 10);
    let y = 4 + Math.floor(acaso(k, 2, 13) * 34);
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

/** Só a cabeça com o chapéu e a gola (o retrato da contagem), em texels. */
export function cabecaMC(): Imagem {
  const t = montarTexels(0);
  const x0 = 3, x1 = 14, y1 = 20;
  const w = x1 - x0 + 1, h = y1 + 1;
  const img: Imagem = { largura: w, altura: h, cores: new Array(w * h).fill(null), partes: new Uint8Array(w * h) };
  for (let y = 0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    // Do ombro não entra nada: o retrato fecha na gola.
    const parte = t.partes[y * TEXELS_LARGURA + x];
    if (parte === NUMERO_DA_PARTE.bracoFrente) continue;
    img.cores[y * w + x - x0] = t.cores[y * TEXELS_LARGURA + x];
  }
  return img;
}

// ── A garrafa de poção e os itens (os da referência, 16 × 16) ──────────────
//
// A garrafa da referência: rolha laranja (C) presa num aro de vidro, com a
// rolha aparecendo clara pelo vidro (K) e escura embaixo (c); o gargalo oco
// (só as duas paredes de vidro, g); os ombros; o bojo redondo com o vidro
// em volta, o líquido (L), o brilho do líquido (l), o fundo escuro (D), o
// reflexo comprido do vidro (w) e o quadradinho rosado de luz (h). TODA poção
// é esta garrafa, só trocando as cores do líquido. Sem líquido, é a Garrafa
// de Vidro.

export interface Item { nome: string; linhas: readonly string[]; cores: Readonly<Record<string, string>> }

export const GARRAFA: readonly string[] = [
  '......CCCC......',
  '.....gKKKKg.....',
  '.....gccccg.....',
  '......g..g......',
  '......g..g......',
  '.....gg..gg.....',
  '....gwhLLLDg....',
  '...gLLwLLLLDg...',
  '..gLLLwLLLLLDg..',
  '..gLLLwLLLLlDg..',
  '..gLLLLLLLgLDg..',
  '..gDLLLLLLgLDg..',
  '..gDDLLLLLLDDg..',
  '...gDDDDlDDDg...',
  '....gggggggg....',
  '................',
];

const VIDRO = { C: '#d0783a', K: '#ecc0a0', c: '#a2501e', g: '#cfe4f6', w: '#ffffff' } as const;

/** A cor misturada com branco (`k` de 0 a 1): o quadradinho de luz. */
function clarear(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const canal = (s: number) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * k).toString(16).padStart(2, '0');
  return `#${canal(16)}${canal(8)}${canal(0)}`;
}

/** As cores de uma poção: o líquido, o brilho e o fundo (o resto é a garrafa, igual para todas). */
export function coresDaPocao(cor: string, clara: string, escura: string): Record<string, string> {
  return { ...VIDRO, L: cor, l: clara, D: escura, h: clarear(cor, 0.55) };
}

/** O Bastão de Bruxa: a vareta na diagonal, em gomos claros e escuros. */
const BASTAO: readonly string[] = [
  '................',
  '.............dd.',
  '............dWd.',
  '...........dwd..',
  '..........dWd...',
  '.........dwd....',
  '........dWd.....',
  '.......dwd......',
  '......dWd.......',
  '.....dwd........',
  '....dWd.........',
  '...dwd..........',
  '..dWd...........',
  '.dwd............',
  '.dd.............',
  '................',
];

/** O montinho de pó (o mesmo para a redstone e a glowstone, só trocando a cor). */
const MONTE: readonly string[] = [
  '................',
  '................',
  '.......rr.......',
  '......rRHr......',
  '.....rRHRRr.....',
  '....rRRmHRRr....',
  '...rHRRRRRmRr...',
  '..rHHRRmRRHRRr..',
  '.rRHRRRRRRRmRRr.',
  '.rRRHRmRRRHRRRr.',
  '..rRmRRrRRRmrr..',
  '...rrRRRRmRrr...',
  '....rrRRRRrr....',
  '......rrrr......',
  '................',
  '................',
];

const OLHO: readonly string[] = [
  '................',
  '................',
  '....rrrrrr......',
  '...rHHRRRRr.....',
  '..rHHRRRRRRr....',
  '..rHRkkRRRRr....',
  '..rRRkkkRRMr....',
  '..rRRRRRRRMr....',
  '...rrRRRRRMr....',
  '.....rrRRRMr....',
  '.......rRRMr....',
  '.......rRRRRrr..',
  '........rRRRMRr.',
  '........rRRrrr..',
  '.........rr.....',
  '................',
];

/** Os drops dela, como na referência: cada um sai 0 ou 1 vez. */
export const DROPS: readonly Item[] = [
  { nome: 'Poção de Cura', linhas: GARRAFA, cores: coresDaPocao('#d01a24', '#ff6a6a', '#860a12') },
  { nome: 'Poção de Veneno', linhas: GARRAFA, cores: coresDaPocao('#4e8a1c', '#8ac83a', '#2a5a10') },
  { nome: 'Poção de Fraqueza', linhas: GARRAFA, cores: coresDaPocao('#7a2ae0', '#b88aff', '#4a1090') },
  { nome: 'Garrafa de Vidro', linhas: GARRAFA, cores: { ...VIDRO } },
  { nome: 'Bastão de Bruxa', linhas: BASTAO, cores: { W: '#b8864a', w: '#94642e', d: '#3e2810' } },
  { nome: 'Pó de Redstone', linhas: MONTE, cores: { r: '#5a0606', R: '#c41410', m: '#8a0a08', H: '#ff3a2a' } },
  { nome: 'Pó de Glowstone', linhas: MONTE, cores: { r: '#7a5208', R: '#eab21c', m: '#c48a14', H: '#fff27a' } },
  { nome: 'Olho de Aranha', linhas: OLHO, cores: { r: '#5a0818', R: '#c02a48', M: '#9a1a34', H: '#ff96aa', k: '#1a0a0e' } },
];

/** O Totem da Imortalidade do jogo: o ídolo dourado de olhos e barriga de esmeralda. */
export const TOTEM: Item = {
  nome: 'Totem da Imortalidade',
  linhas: [
    '................',
    '.....oooooo.....',
    '....owYYYYYo....',
    '....oYGYYGYo....',
    '....oyYYYYyo....',
    '.....oyyyyo.....',
    '.oooooYYYYooooo.',
    'oYYYYYYwYYYYYYYo',
    'oyyyoYYYYYYoyyyo',
    '.ooo.oYGGYo.ooo.',
    '.....oYYYYo.....',
    '.....oyYYyo.....',
    '......oYYo......',
    '......oyyo......',
    '.......oo.......',
    '................',
  ],
  cores: { o: '#6a4608', Y: '#f8d64a', y: '#c8921a', w: '#fff6b0', G: '#36dc58' },
};

/** O item com contorno escuro de 1 pixel (para ler na tela clara do Gestão). */
export function comContorno(it: Item): Item {
  const h = it.linhas.length, w = it.linhas[0].length;
  const cheio = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && it.linhas[y][x] !== '.';
  const linhas = it.linhas.map((l, y) => [...l].map((ch, x) => {
    if (ch !== '.') return ch;
    return cheio(x + 1, y) || cheio(x - 1, y) || cheio(x, y + 1) || cheio(x, y - 1) ? 'o' : '.';
  }).join(''));
  // O totem usa `o` para o dourado escuro: o contorno de fora ganha outra letra.
  if ('o' in it.cores) {
    const fora = linhas.map((l, y) => [...l].map((ch, x) => (ch === 'o' && it.linhas[y][x] === '.' ? '#' : ch)).join(''));
    return { ...it, linhas: fora, cores: { ...it.cores, '#': CORES_MC.contorno } };
  }
  return { ...it, linhas, cores: { ...it.cores, o: CORES_MC.contorno } };
}
