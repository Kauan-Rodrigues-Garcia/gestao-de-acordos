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
import {
  ACUCAR_MC, CINZA_DO_LIQUIDO_MC, GARRAFA_VAZIA_MC, GLOWSTONE_MC, GRAVETO_MC, OLHO_MC, PEROLA_MC, POCAO_MC, POLVORA_MC,
  REDSTONE_MC, TEIA_MC, TOTEM_MC, VIDRO_MC,
} from './texturasMC';

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

/** O modelo de frente, texel a texel, no quadro pedido, com o estrago do estágio (`estragos`). */
export function montarTexels(quadro: number, estagio = 0): Texels {
  const qd = QUADROS_MC[((quadro % QUADROS_MC.length) + QUADROS_MC.length) % QUADROS_MC.length];
  const W = TEXELS_LARGURA, H = TEXELS_ALTURA;
  const t: Texels = { cores: new Array(W * H).fill(null), partes: new Uint8Array(W * H) };
  const estrago = estragos(estagio);
  const por = (x: number, y: number, letra: string, xo = x, yo = y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const l = LETRAS[letra];
    // O estrago mora na posição do MODELO: anda junto quando ela respira ou gargalha.
    const e = estrago.get(yo * W + xo);
    if (e === 'some') return;
    const base = corDa(l, xo, yo);
    t.cores[y * W + x] = !e ? base : 'cor' in e ? e.cor : misturar(base, e.mistura, e.k);
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

// ── O dano (15/10/2026, refeito na mesma noite) ────────────────────────────
//
// A primeira versão rachava como bloco: linhas de texel quase pretas. Numa
// bruxa que já é preta e roxa, isso virou «ela ficando só preta» (Kauan). Agora
// ela fica ESTRAGADA, cada estágio por cima do anterior (75%, 50% e 25% da vida):
//
//   1  fuligem no manto e nos ombros, um arranhão na bochecha, a pedra verde do
//      chapéu lascando
//   2  o manto rasga (aparece o linho cru por baixo), um remendo no ombro, a
//      barra esfarrapada, o olho roxo, a aba do chapéu queimada
//   3  mais rasgo e mais fuligem, a manga rasgada, a pele esverdeada de quem
//      está passando mal, um curativo no nariz e brasas no manto
//
// Tudo em posições fixas do MODELO (sorteio fixo por texel), então o estrago
// não pisca e só cresce. O tiro por peça usa o sprite inteiro (`imagemDoQuadro`
// no palco): um rasgo não vira buraco na mira.

/** 0 inteira … 3 em frangalhos. */
export function estagioDoDano(fracaoDaVida: number): 0 | 1 | 2 | 3 {
  if (fracaoDaVida > 0.75) return 0;
  if (fracaoDaVida > 0.5) return 1;
  if (fracaoDaVida > 0.25) return 2;
  return 3;
}

/** O que acontece com um texel: cor nova, misturado com outra cor, ou some (o pano que rasgou). */
export type Estrago = { cor: string } | { mistura: string; k: number } | 'some';

/** As cores do estrago: nenhuma é preta (a bruxa já é escura). */
export const CORES_ESTRAGO = {
  fuligem: '#5b4a3e',
  linho: ['#dcc7a1', '#b59d77', '#8c7556'],
  remendo: ['#7d5c33', '#9b7747'],
  costura: '#d8c090',
  arranhao: ['#b85a52', '#9a4a44'],
  olhoRoxo: '#6a3f78',
  curativo: ['#e9cfa6', '#f3dcb5'],
  enjoo: '#8fa070',
  pedraLascada: ['#707070', '#555555'],
  queimado: ['#4b3221', '#3a281c'],
  brasa: ['#ff8a2a', '#ffb040'],
} as const;

/** Mistura duas cores (`k` = quanto da segunda). */
export function misturar(a: string, b: string, k: number): string {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const canal = (s: number) => Math.round(((na >> s) & 255) * (1 - k) + ((nb >> s) & 255) * k).toString(16).padStart(2, '0');
  return `#${canal(16)}${canal(8)}${canal(0)}`;
}

const cacheEstragos = new Map<number, ReadonlyMap<number, Estrago>>();

/**
 * Os texels estragados do estágio, pela posição no `MODELO` (y × largura + x).
 * Cada tipo de estrago tem a sua ordem fixa: o estágio seguinte pega os mesmos
 * do anterior e mais alguns.
 */
export function estragos(estagio: number): ReadonlyMap<number, Estrago> {
  const e = Math.max(0, Math.min(3, Math.floor(estagio)));
  const pronto = cacheEstragos.get(e);
  if (pronto) return pronto;
  const W = TEXELS_LARGURA;
  const m = new Map<number, Estrago>();
  cacheEstragos.set(e, m);
  if (e === 0) return m;
  const E = CORES_ESTRAGO;
  const letra = (x: number, y: number) => MODELO[y]?.[x] ?? '.';
  const por = (x: number, y: number, v: Estrago) => { if (letra(x, y) !== '.') m.set(y * W + x, v); };
  const onde = (f: (ch: string, x: number, y: number) => boolean, semente: number) => {
    const l: [number, number][] = [];
    MODELO.forEach((linha, y) => [...linha].forEach((ch, x) => { if (ch !== '.' && f(ch, x, y)) l.push([x, y]); }));
    return l.sort((a, b) => acaso(a[0], a[1], semente) - acaso(b[0], b[1], semente));
  };
  const ROUPA = 'oOdDrRxvV';

  // 1 · A fuligem: borrões de três texels no manto e nos ombros.
  for (const [x, y] of onde(ch => ROUPA.includes(ch), 21).slice(0, [0, 4, 8, 13][e])) {
    por(x, y, { mistura: E.fuligem, k: e === 3 ? 0.72 : 0.62 });
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      if (ROUPA.includes(letra(x + dx, y + dy)) && !m.has((y + dy) * W + x + dx)) por(x + dx, y + dy, { mistura: E.fuligem, k: 0.45 });
    }
  }
  // 1 · A pedra verde do chapéu lascando.
  onde(ch => ch === 'g' || ch === 'G', 23).slice(0, e).forEach(([x, y], i) => por(x, y, { cor: E.pedraLascada[i % 2] }));
  // 1 · O arranhão na bochecha.
  por(6, 16, { cor: E.arranhao[0] });
  por(6, 17, { cor: E.arranhao[1] });

  if (e >= 2) {
    // 2 · O manto rasgado: o linho cru aparece por baixo, num rasgo de três texels.
    for (const [x, y] of onde((ch, _x, y) => (ch === 'r' || ch === 'R') && y >= 27 && y <= 33, 29).slice(0, e === 3 ? 4 : 2)) {
      [[0, 0], [1, 1], [1, 2]].forEach(([dx, dy], i) => { if (ROUPA.includes(letra(x + dx, y + dy))) por(x + dx, y + dy, { cor: E.linho[i] }); });
    }
    // 2 · O remendo no ombro, com a costura no canto.
    for (const [x, y] of onde((ch, x, y) => ch === 'O' && y >= 21 && y <= 22 && (x <= 5 || x >= 12), 31).slice(0, e === 3 ? 2 : 1)) {
      por(x, y, { cor: E.remendo[0] });
      por(x + 1, y, { cor: E.remendo[1] });
      por(x, y + 1, { cor: E.remendo[1] });
      por(x + 1, y + 1, { cor: E.costura });
    }
    // 2 · A barra esfarrapada: a última linha do manto perde pedaços.
    const barra = onde((_ch, _x, y) => y === 36, 33).slice(0, e === 3 ? 5 : 3);
    barra.forEach(([x, y]) => por(x, y, 'some'));
    if (e === 3) barra.slice(0, 2).forEach(([x]) => por(x, 35, 'some'));
    // 2 · O olho roxo (o da esquerda).
    for (const [x, y] of [[5, 13], [5, 14], [5, 15], [6, 15], [7, 15]] as const) por(x, y, { mistura: E.olhoRoxo, k: 0.55 });
    // 2 · A aba do chapéu queimada na ponta.
    por(4, 8, 'some');
    por(5, 8, { cor: E.queimado[0] });
    por(4, 9, { cor: E.queimado[1] });
  }

  if (e >= 3) {
    // 3 · A manga rasgada na beirada.
    for (const [x, y] of [[1, 20], [1, 22], [16, 21], [16, 23]] as const) por(x, y, 'some');
    // 3 · A pele esverdeada de quem está passando mal (sem apagar o olho roxo nem o arranhão).
    for (const [x, y] of onde(ch => 'sS1t'.includes(ch), 37)) if (!m.has(y * W + x)) por(x, y, { mistura: E.enjoo, k: 0.22 });
    // 3 · O curativo atravessado no nariz.
    por(7, 16, { cor: E.curativo[0] });
    por(8, 16, { cor: E.curativo[1] });
    por(9, 16, { cor: E.curativo[1] });
    por(10, 16, { cor: E.curativo[0] });
    // 3 · Mais aba queimada, com a brasa acesa, e o chapéu chamuscado.
    por(13, 8, 'some');
    por(12, 8, { cor: E.brasa[0] });
    por(6, 8, { cor: E.brasa[1] });
    onde(ch => ch === 'H', 41).slice(0, 2).forEach(([x, y]) => por(x, y, { mistura: E.queimado[0], k: 0.5 }));
    // 3 · As brasas na beirada do manto.
    onde((ch, x, y) => (x === 4 || x === 13) && y >= 28 && y <= 35 && 'rR'.includes(ch), 43).slice(0, 2)
      .forEach(([x, y], i) => por(x, y, { cor: E.brasa[i % 2] }));
  }
  return m;
}

/** O sprite pronto: quadro, estágio do dano. */
export function montarBruxaMC(quadro: number, estagio = 0): Imagem {
  return texelsParaImagem(montarTexels(quadro, estagio));
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

// ── A garrafa de poção e os itens (os do jogo, `texturasMC.ts`) ─────────────
//
// Desde 15/10/2026 as texturas são as do Minecraft (o Kauan pediu: «pode puxar
// para itens e detalhes»; o totem desenhado à mão tinha ficado feio). Toda
// poção é a garrafa do jogo, e o líquido é o cinza do `potion_overlay`
// multiplicado pela cor da poção, como o jogo faz.

export interface Item { nome: string; linhas: readonly string[]; cores: Readonly<Record<string, string>> }

/** A garrafa de poção do jogo (letras: vidro e rolha; dígitos: o líquido). */
export const GARRAFA: readonly string[] = POCAO_MC;

/** A cor multiplicada pelo cinza (0–255), como o jogo pinta o líquido. */
function multiplicar(hex: string, cinza: number): string {
  const n = parseInt(hex.slice(1), 16);
  const canal = (s: number) => Math.round((((n >> s) & 255) * cinza) / 255).toString(16).padStart(2, '0');
  return `#${canal(16)}${canal(8)}${canal(0)}`;
}

/** As cores de uma poção: o vidro do jogo e o líquido na cor dela (o jogo só multiplica a cor pelo cinza). */
export function coresDaPocao(cor: string): Record<string, string> {
  const liquido = Object.fromEntries(Object.entries(CINZA_DO_LIQUIDO_MC).map(([k, g]) => [k, multiplicar(cor, g)]));
  return { ...VIDRO_MC, ...liquido };
}

/** A Poção de Cura (Vida Instantânea): a cor do jogo. */
export const COR_DA_CURA = '#f82423';

/** Os drops dela, como no jogo (a bruxa larga estes sete, e a poção que bebia). */
export const DROPS: readonly Item[] = [
  { nome: 'Poção de Cura', linhas: GARRAFA, cores: coresDaPocao(COR_DA_CURA) },
  GARRAFA_VAZIA_MC,
  GLOWSTONE_MC,
  REDSTONE_MC,
  OLHO_MC,
  ACUCAR_MC,
  POLVORA_MC,
  GRAVETO_MC,
];

/** O Totem da Imortalidade do jogo. */
export const TOTEM: Item = TOTEM_MC;

/** A Pérola do Ender do jogo (a que ela joga para se teleportar). */
export const PEROLA: Item = PEROLA_MC;

/** A teia de aranha do jogo (a Poção de Lentidão). */
export const TEIA: Item = TEIA_MC;

/** O item com contorno escuro de 1 pixel (para ler na tela clara do Gestão). */
export function comContorno(it: Item): Item {
  const h = it.linhas.length, w = it.linhas[0].length;
  const cheio = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && it.linhas[y][x] !== '.';
  const fora = 'o' in it.cores ? '#' : 'o';
  const linhas = it.linhas.map((l, y) => [...l].map((ch, x) => {
    if (ch !== '.') return ch;
    return cheio(x + 1, y) || cheio(x - 1, y) || cheio(x, y + 1) || cheio(x, y - 1) ? fora : '.';
  }).join(''));
  return { ...it, linhas, cores: { ...it.cores, [fora]: CORES_MC.contorno } };
}
