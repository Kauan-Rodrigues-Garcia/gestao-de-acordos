/**
 * chefaoArte.ts — o chefão da caça, pixel a pixel, e a coreografia dele.
 *
 * Puro (sem DOM), como `zumbis.ts`: o desenho e a dança são dados. A cena do
 * chefão (`cenaChefao.tsx`) pinta e mexe; os testes conferem sem navegador.
 *
 * ## O pedido (09/10/2026)
 *
 * Um chefão zumbi «clássico»: o Rei do Pop do clipe de terror dos anos 80 —
 * jaqueta vermelha com os V pretos, calça vermelha, meia branca, mocassim
 * preto, cabelo cacheado, olhos amarelos e o chapéu de dançar. Ele fica
 * dançando os passinhos famosos, anda pela tela e desvia dos tiros. Todo
 * mundo atira na mesma vida. Na mesma tarde:
 *
 *   - conforme perde vida, se machuca e PERDE OS BRAÇOS (`Estagio`);
 *   - o moonwalk de verdade: um pé na ponta, o outro deslizando, e trocam;
 *   - o chapéu, e a pose com a mão na aba.
 *
 * ## Como o sprite é montado
 *
 * É um `Zumbi` de `zumbis.ts` (o mesmo corpo de 24×34 em seis peças) — por
 * isso a morte usa a física dos outros sem mudar nada, e o chapéu voa sozinho
 * quando ele cai (`solta: 'cai'`). Cada quadro escolhe os BRAÇOS e as PERNAS
 * (`Bracos`, `Pernas`); o `Estagio` dos ferimentos tira braços e põe sangue.
 * A combinação vira um zumbi próprio (`zumbiDoQuadro`), guardado.
 *
 * Os passos que mexem o corpo inteiro (o giro, a inclinação, a ponta do pé)
 * vão por fora, numa transformação do sprite (`Transforma`), em degraus.
 */
import { type Enfeite, type Grade, type Imagem, type NomeParte, type Paleta, type Quadro, type Zumbi } from './zumbis';

// ── A paleta ────────────────────────────────────────────────────────────────

const PALETA: Paleta = {
  o: '#120c16',
  // Pele de zumbi de cinema: cinza esverdeada, a sombra fria.
  1: '#343b3a', 2: '#59665a', 3: '#8a9a7c', 4: '#c0cca4',
  // Os olhos amarelos do clipe.
  y: '#ffe14d', Y: '#a8862a',
  m: '#3a0a16', t: '#e9dfbc', r: '#6e0a12', R: '#c8202a', n: '#efe6cc',
  g: '#17121c',
  // A jaqueta de couro vermelha, com brilho.
  a: '#5c0a10', b: '#b5161e', c: '#ec4b4f',
  // A calça, do mesmo vermelho, um tom abaixo.
  d: '#4a080d', e: '#931219', f: '#c72d33',
  // As listas pretas em V, o chapéu, a luva e a meia brancas, o cabelo.
  x: '#16111a', X: '#3d3644',
  z: '#f5f3ee', Z: '#bdb9c8',
  h: '#0f0b10', H: '#3e3346',
};

/**
 * Na Fúria do Rei os olhos acendem. A cor é única de propósito: a cena acha
 * os pixels dos olhos por ela, para pôr o brilho em cima.
 */
export const COR_OLHO_ACESO = '#fffbe6';
const PALETA_ACESA: Paleta = { ...PALETA, y: COR_OLHO_ACESO, Y: COR_OLHO_ACESO };

// ── As peças fixas ──────────────────────────────────────────────────────────

const CABECA: Grade = {
  x: 5, y: 2,
  linhas: [
    '.....ooooooo..',
    '...oo4443333o.',
    '..o444nr33333o',
    '..o44rR333332o',
    '..o4333322322o',
    '.o3233321y21yo',
    '.o21333321322o',
    '.o12332332oooo',
    '..o322332otmto',
    '...o22232ommto',
    '....oo1222ooo.',
    '......ooooo...',
  ],
};

/** A jaqueta: gola alta, os V pretos no peito e a barra preta na cintura. */
const TRONCO: Grade = {
  x: 5, y: 13,
  linhas: [
    '....oo2oo...',
    '.oobbc1cbbo.',
    'obxcbbrbbxao',
    'obcxbbRbxbao',
    'obcbxbrxbbao',
    'obbbbxxbbbao',
    'oaxbbbbbbxao',
    'oabxbbbbxbao',
    'oabbxbbxbaao',
    'oxxxxxxxxxxo',
    '.oeeeeeeedo.',
  ],
};

/** O cabelo cacheado, por baixo do chapéu: os cachos caem atrás até o ombro. */
const CABELO: Grade = {
  x: 4, y: 3,
  linhas: [
    '.ohHhhhhHhhhhho.',
    '.ohhhHhhhHhho...',
    'ohHHhhhhho......',
    'ohhhhHho........',
    'oHhhhHHo........',
    'ohhHhhho........',
    'ohHHhho.........',
    '.ohhhHo.........',
    '.oHhhho.........',
    '.ohHHo..........',
    '..ohho..........',
    '...oo...........',
  ],
};

/** O chapéu de dançar: preto, com a fita branca. Voa quando ele cai. */
const CHAPEU: Grade = {
  x: 6, y: 0,
  linhas: [
    '....oooooooo.....',
    '...oxxxXXxxxo....',
    '...oxxxXxxxxo....',
    '...ozzzzzzzzo....',
    '.ooxxxxxxxxxxooo.',
    'oxxXXxxxxxxxxxxxo',
    '.ooooooooooooooo.',
  ],
};

// ── Os braços ───────────────────────────────────────────────────────────────

export type Bracos = 'estendido' | 'garra' | 'baixo' | 'chapeu';

/** Braços estendidos para a frente: o andar de zumbi do clipe. Luva na mão da frente. */
const FRENTE_ESTENDIDO: Grade = {
  x: 9, y: 17,
  linhas: [
    '.oooooooooooo..',
    'obcxcbbbbbzzzzo',
    'obbbbbbbbaZzzzo',
    '.oaaaaaaaooZoZo',
    '..ooooooo..o.o.',
  ],
};
const TRAS_ESTENDIDO: Grade = {
  x: 12, y: 14,
  linhas: [
    'ooooooooo...',
    'abbbba1122o.',
    'aaaaaa11222o',
    'oooooo1o2o2o',
    '.......o.o.o',
  ],
};

/**
 * As garras para cima, ao lado do rosto: o passo mais famoso do clipe. O
 * antebraço da frente sobe na frente da cara (sem cobrir), a mão de trás
 * aparece por cima dela.
 */
const FRENTE_GARRA: Grade = {
  x: 9, y: 4,
  linhas: [
    '...........z.z.',
    '..........ozozo',
    '..........ozzzo',
    '..........oZzZo',
    '..........obcbo',
    '..........obcbo',
    '..........obbbo',
    '..........obbao',
    '..........obbao',
    '..........obbao',
    '..........obbao',
    '.ooooooooobbbao',
    'obcxcbbbbbbbbao',
    'obbbbbbbbbbbaao',
    '.oaaaaaaaaaaao.',
    '..ooooooooooo..',
  ],
};
const TRAS_GARRA: Grade = {
  x: 15, y: 0,
  linhas: [
    '...2.2..',
    '..o2o2o.',
    '..o222o.',
    '..o121o.',
    '..oaao..',
    '..oaao..',
    '..oaao..',
    '..oaao..',
    '..oaao..',
    '..oaao..',
    '..oaao..',
    '..oaao..',
    '..oaao..',
    'ooaaao..',
    'aaaao...',
    'oooo....',
  ],
};

/** A mão da luva segurando a aba do chapéu: a pose. */
const FRENTE_CHAPEU: Grade = {
  x: 9, y: 3,
  linhas: [
    '..........ozzo.',
    '.........ozzzzo',
    '.........oZzzZo',
    '..........obco.',
    '..........obcbo',
    '..........obbbo',
    '..........obbao',
    '..........obbao',
    '..........obbao',
    '..........obbao',
    '..........obbao',
    '.ooooooooobbbao',
    'obcxcbbbbbbbbao',
    'obbbbbbbbbbbaao',
    '.oaaaaaaaaaaao.',
    '..ooooooooooo..',
  ],
};

/**
 * Braços caídos ao lado do corpo: o moonwalk, o giro, a inclinação, o chute.
 * A mão fica sem luva: branca no meio do corpo, de longe, não lia como mão.
 */
const FRENTE_BAIXO: Grade = {
  x: 9, y: 14,
  linhas: [
    '.ooo.',
    'obcxo',
    'obcbo',
    'obbbo',
    'obbao',
    'obbao',
    'oxbao',
    'obbao',
    'oaaao',
    'o233o',
    'o322o',
    '.o2o.',
    '..o..',
  ],
};
const TRAS_BAIXO: Grade = {
  x: 14, y: 14,
  linhas: [
    '.ooo.',
    'oabao',
    'oabao',
    'oaaao',
    'oaaao',
    'oaaao',
    'oaaao',
    'oaaao',
    'o12o.',
    'o21o.',
    '.oo..',
  ],
};

const BRACOS: Readonly<Record<Bracos, { frente: Grade; tras: Grade }>> = {
  estendido: { frente: FRENTE_ESTENDIDO, tras: TRAS_ESTENDIDO },
  garra:     { frente: FRENTE_GARRA, tras: TRAS_GARRA },
  baixo:     { frente: FRENTE_BAIXO, tras: TRAS_BAIXO },
  chapeu:    { frente: FRENTE_CHAPEU, tras: TRAS_BAIXO },
};

// ── As pernas ───────────────────────────────────────────────────────────────

/**
 * normal       os dois pés no chão
 * chute        a perna da frente esticada na altura do quadril
 * pontaFrente  o pé da frente na ponta (joelho dobrado, calcanhar no ar) — o
 *              outro pé, chapado, é o que desliza no moonwalk
 * pontaTras    o mesmo, com o pé de trás na ponta
 */
export type Pernas = 'normal' | 'chute' | 'pontaFrente' | 'pontaTras';

const PERNA_TRAS: Grade = {
  x: 6, y: 23,
  linhas: [
    'oddeo.',
    'odeeo.',
    'odeeo.',
    'oddeo.',
    '.odeo.',
    '.odeo.',
    '.ozZo.',
    '.oggo.',
    'ogggo.',
    'oooooo',
  ],
};
const PERNA_TRAS_PONTA: Grade = {
  x: 6, y: 23,
  linhas: [
    'oddeo..',
    '.oddeo.',
    '.odeeo.',
    '..odeo.',
    '.odeeo.',
    '.odeo..',
    '.ozZo..',
    '..oggo.',
    '..ogggo',
    '...oooo',
  ],
};
const PERNA_FRENTE: Grade = {
  x: 10, y: 23,
  linhas: [
    'oeeefo...',
    'oeeefo...',
    'oe23fo...',
    '.o233fo..',
    '.oeeefo..',
    '.oeefo...',
    '.oeefo...',
    '.ozzZo...',
    '.oggggggo',
    '.oooooooo',
  ],
};
const PERNA_FRENTE_PONTA: Grade = {
  x: 10, y: 23,
  linhas: [
    'oeeefo....',
    '.oeeefo...',
    '..oeeefo..',
    '..oe23fo..',
    '..oeeefo..',
    '.oeeefo...',
    '.oeefo....',
    '.ozzZo....',
    '..oggggo..',
    '...ooooggo',
  ],
};
/** O chute: a perna da frente esticada, na altura do quadril, a meia à mostra. */
const PERNA_CHUTE: Grade = {
  x: 10, y: 22,
  linhas: [
    '.oooooooooo...',
    'oeeeeeeeefzzgo',
    'oeee23eeefzZgo',
    '.ooooooooooogg',
    '............oo',
  ],
};

const PERNAS: Readonly<Record<Pernas, { frente: Grade; tras: Grade }>> = {
  normal:      { frente: PERNA_FRENTE, tras: PERNA_TRAS },
  chute:       { frente: PERNA_CHUTE, tras: PERNA_TRAS },
  pontaFrente: { frente: PERNA_FRENTE_PONTA, tras: PERNA_TRAS },
  pontaTras:   { frente: PERNA_FRENTE, tras: PERNA_TRAS_PONTA },
};

// ── Os ferimentos ───────────────────────────────────────────────────────────

/**
 * Como ele vai ficando conforme perde vida (09/10/2026 — «chegando ao final
 * vai perdendo membros»):
 *
 *   0  inteiro
 *   1  machucado: sangue no rosto, jaqueta rasgada, calça manchada
 *   2  sem o braço de trás: o toco sangrando no ombro
 *   3  sem o braço da frente também (a luva vai junto), um olho vazado e a
 *      costela à mostra
 */
export type Estagio = 0 | 1 | 2 | 3;

/** O que cai em cada estágio (o braço voa com física na cena). */
export const PERDE_NO_ESTAGIO: Readonly<Record<Estagio, NomeParte | null>> = {
  0: null, 1: null, 2: 'bracoTras', 3: 'bracoFrente',
};

/** A fração de vida em que cada estágio começa. */
export const LIMIARES: readonly [number, number, number] = [0.7, 0.45, 0.2];

export function estagioDaVida(vida: number, vidaMax: number): Estagio {
  const f = vidaMax > 0 ? vida / vidaMax : 0;
  if (f > LIMIARES[0]) return 0;
  if (f > LIMIARES[1]) return 1;
  if (f > LIMIARES[2]) return 2;
  return 3;
}

const enfeite = (parte: NomeParte, x: number, y: number, linhas: string[], atras = false): Enfeite =>
  ({ parte, x, y, linhas, atras });

const FERIDAS: Readonly<Record<Exclude<Estagio, 0>, readonly Enfeite[]>> = {
  1: [
    // Sangue escorrendo do olho e da boca, um corte na bochecha.
    enfeite('cabeca', 14, 8, ['R', 'r']),
    enfeite('cabeca', 10, 9, ['rR.', '.rr']),
    enfeite('cabeca', 16, 13, ['R', 'r']),
    // A jaqueta rasgada no peito, a pele aparecendo.
    enfeite('tronco', 7, 17, ['o3r', 'r33', '.rR']),
    // A calça manchada.
    enfeite('pernaFrente', 11, 26, ['R', 'r', 'r']),
  ],
  2: [
    // O toco do braço de trás.
    enfeite('tronco', 13, 14, ['.oRRo', 'oRnnR', '.rRr.', '..r..']),
  ],
  3: [
    // O toco do braço da frente.
    enfeite('tronco', 8, 15, ['oRRo', 'RnnR', 'rRRr', '.rr.']),
    // O olho vazado.
    enfeite('cabeca', 17, 7, ['m', 'R', 'r']),
    // A costela à mostra.
    enfeite('tronco', 9, 19, ['n.n', 'rnr', '.r.']),
  ],
};

const NADA: Grade = { x: 0, y: 0, linhas: [] };

// ── O chefão montado ────────────────────────────────────────────────────────

export interface Pose {
  bracos: Bracos;
  pernas: Pernas;
}

const ID = 'rei-do-pop';
const montados = new Map<string, Zumbi>();

/**
 * O chefão numa pose, num estágio de ferimento, com ou sem os olhos acesos.
 * Guardado: a mesma combinação é sempre o mesmo objeto (o `id` dele é a
 * chave dos quadros prontos de `pixels.ts`).
 */
export function zumbiDaPose(p: Pose, estagio: Estagio = 0, aceso = false): Zumbi {
  const id = `${ID}:${p.bracos}:${p.pernas}:${estagio}${aceso ? ':aceso' : ''}`;
  let z = montados.get(id);
  if (!z) {
    const feridas: Enfeite[] = [];
    for (let e = 1; e <= estagio; e++) feridas.push(...FERIDAS[e as Exclude<Estagio, 0>]);
    z = {
      id,
      nome: 'o Rei do Pop Zumbi',
      paleta: aceso ? PALETA_ACESA : PALETA,
      enfeites: [
        { parte: 'cabeca', ...CABELO },
        { parte: 'cabeca', ...CHAPEU, solta: 'cai' },
        ...feridas,
      ],
      trocas: {
        cabeca: CABECA,
        tronco: TRONCO,
        pernaFrente: PERNAS[p.pernas].frente,
        pernaTras: PERNAS[p.pernas].tras,
        bracoFrente: estagio >= 3 ? NADA : BRACOS[p.bracos].frente,
        bracoTras: estagio >= 2 ? NADA : BRACOS[p.bracos].tras,
      },
    };
    montados.set(id, z);
  }
  return z;
}

/** O chefão inteiro, parado: a cabeça do placar, do painel e do ranking. */
export const CHEFAO: Zumbi = zumbiDaPose({ bracos: 'estendido', pernas: 'normal' });

// ── A coreografia ───────────────────────────────────────────────────────────

/**
 * O que o sprite inteiro faz por cima do desenho, a cada quadro:
 *   vira   -1 espelha (o giro passa por aqui), 1 normal
 *   gira   graus, em volta dos pés (a inclinação)
 *   sobe   px da arte para cima (a ponta do pé, o pulinho)
 */
export interface Transforma { vira: 1 | -1; gira: number; sobe: number }

export interface QuadroDanca extends Pose {
  quadro: Quadro;
  transforma: Transforma;
}

/**
 * Como o passo anda pela tela:
 *   frente  anda para onde olha
 *   tras    desliza para trás, olhando para a frente (o moonwalk)
 *   lado    vai e volta no lugar (o arrastado das garras)
 *   parado  fica onde está
 */
export type Anda = 'frente' | 'tras' | 'lado' | 'parado';

export interface Passo {
  id: string;
  /** Como aparece no letreiro que sobe quando o passo começa. */
  nome: string;
  quadros: readonly QuadroDanca[];
  msPorQuadro: number;
  /** Quantas voltas dos quadros o passo dura. */
  voltas: number;
  anda: Anda;
  /** px da tela por segundo, quando anda. */
  velocidade: number;
  /**
   * Chance de desviar de um tiro certeiro durante este passo (0–1). Girando e
   * deslizando ele escapa mais; parado na ponta do pé, quase nunca — é a
   * janela para acertar.
   */
  esquiva: number;
}

const RETO: Transforma = { vira: 1, gira: 0, sobe: 0 };
const q = (
  bracos: Bracos, pernas: Pernas, desloca: Quadro['desloca'] = {}, t: Partial<Transforma> = {}, piscando = false,
): QuadroDanca => ({ bracos, pernas, quadro: { desloca, piscando }, transforma: { ...RETO, ...t } });

export const PASSOS: readonly Passo[] = [
  {
    // As garras para cima, o ombro sacudindo e o arrastar de pés para o lado.
    id: 'garras', nome: 'THRILLER!', msPorQuadro: 170, voltas: 4, anda: 'lado', velocidade: 46, esquiva: 0.3,
    quadros: [
      q('garra', 'normal'),
      q('garra', 'normal', { cabeca: [1, 1], tronco: [0, 1], bracoFrente: [1, 1], bracoTras: [1, 1], pernaFrente: [1, 0] }),
      q('garra', 'normal', { bracoFrente: [0, -1], bracoTras: [0, -1] }, {}, true),
      q('garra', 'normal', { cabeca: [-1, 1], tronco: [0, 1], bracoFrente: [-1, 1], bracoTras: [-1, 1], pernaTras: [-1, 0] }),
    ],
  },
  {
    // O moonwalk de verdade: um pé na ponta, parado; o outro, chapado,
    // desliza para trás; trocam. O corpo não balança — desliza liso, para
    // trás, olhando para a frente. O braço da frente acompanha de leve.
    id: 'moonwalk', nome: 'MOONWALK', msPorQuadro: 115, voltas: 5, anda: 'tras', velocidade: 74, esquiva: 0.45,
    quadros: [
      q('baixo', 'pontaFrente', { pernaTras: [1, 0], bracoFrente: [1, 0] }),
      q('baixo', 'pontaFrente', { pernaTras: [0, 0] }),
      q('baixo', 'pontaFrente', { pernaTras: [-1, 0], bracoFrente: [-1, 0] }),
      q('baixo', 'pontaTras', { pernaFrente: [1, 0], bracoFrente: [-1, 0] }),
      q('baixo', 'pontaTras', { pernaFrente: [0, 0] }),
      q('baixo', 'pontaTras', { pernaFrente: [-1, 0], bracoFrente: [1, 0] }, {}, true),
    ],
  },
  {
    // O giro, que termina na ponta do pé.
    id: 'giro', nome: 'GIRO!', msPorQuadro: 80, voltas: 3, anda: 'parado', velocidade: 0, esquiva: 0.6,
    quadros: [
      q('baixo', 'pontaFrente', {}, { vira: 1 }),
      q('baixo', 'pontaFrente', { bracoFrente: [-1, 0] }, { vira: -1 }),
      q('baixo', 'pontaFrente', {}, { vira: 1 }),
      q('baixo', 'pontaFrente', { bracoFrente: [-1, 0] }, { vira: -1 }),
    ],
  },
  {
    // Parado na ponta dos pés, depois do giro: é aqui que ele mais apanha.
    id: 'ponta', nome: 'HEE-HEE!', msPorQuadro: 220, voltas: 2, anda: 'parado', velocidade: 0, esquiva: 0.05,
    quadros: [
      q('baixo', 'normal', { pernaFrente: [0, -1], pernaTras: [0, -1] }, { sobe: 2 }),
      q('baixo', 'normal', { pernaFrente: [0, -1], pernaTras: [0, -1], cabeca: [1, 0] }, { sobe: 3 }),
      q('baixo', 'normal', { pernaFrente: [0, -1], pernaTras: [0, -1] }, { sobe: 3 }, true),
      q('baixo', 'normal', { pernaFrente: [0, -1], pernaTras: [0, -1], cabeca: [1, 0] }, { sobe: 2 }),
    ],
  },
  {
    // A mão na aba do chapéu, a cabeça baixa, um pé na ponta: a pose.
    id: 'pose', nome: 'POSE!', msPorQuadro: 240, voltas: 2, anda: 'parado', velocidade: 0, esquiva: 0.15,
    quadros: [
      q('chapeu', 'pontaFrente'),
      q('chapeu', 'pontaFrente', { cabeca: [0, 1] }),
      q('chapeu', 'pontaFrente', { cabeca: [0, 1] }, {}, true),
      q('chapeu', 'pontaFrente', { cabeca: [0, 1] }),
    ],
  },
  {
    // A inclinação impossível para a frente, com os pés grudados no chão.
    id: 'inclina', nome: 'ANTIGRAVIDADE', msPorQuadro: 110, voltas: 1, anda: 'parado', velocidade: 0, esquiva: 0.15,
    quadros: [
      q('baixo', 'normal', {}, { gira: 6 }),
      q('baixo', 'normal', {}, { gira: 14 }),
      q('baixo', 'normal', {}, { gira: 22 }),
      q('baixo', 'normal', {}, { gira: 30 }),
      q('baixo', 'normal', {}, { gira: 34 }),
      q('baixo', 'normal', {}, { gira: 34 }),
      q('baixo', 'normal', {}, { gira: 34 }, true),
      q('baixo', 'normal', {}, { gira: 34 }),
      q('baixo', 'normal', {}, { gira: 34 }),
      q('baixo', 'normal', {}, { gira: 26 }),
      q('baixo', 'normal', {}, { gira: 16 }),
      q('baixo', 'normal', {}, { gira: 6 }),
    ],
  },
  {
    // O chute para a frente, e volta.
    id: 'chute', nome: 'AU!', msPorQuadro: 140, voltas: 3, anda: 'parado', velocidade: 0, esquiva: 0.3,
    quadros: [
      q('baixo', 'normal'),
      q('baixo', 'chute', { cabeca: [-1, 0] }, { sobe: 1 }),
      q('baixo', 'chute', { cabeca: [-1, 0] }, { sobe: 1 }),
      q('baixo', 'normal', { cabeca: [0, 1], tronco: [0, 1] }),
    ],
  },
  {
    // O andar de zumbi do clipe, braços para a frente, arrastando os pés.
    id: 'marcha', nome: 'ZUMBIS!', msPorQuadro: 200, voltas: 4, anda: 'frente', velocidade: 52, esquiva: 0.25,
    quadros: [
      q('estendido', 'normal', { pernaFrente: [1, 0], pernaTras: [-1, 0], bracoTras: [0, 1] }),
      q('estendido', 'normal', { tronco: [0, 1], cabeca: [0, 1], bracoFrente: [0, 1], bracoTras: [0, 1] }),
      q('estendido', 'normal', { pernaFrente: [-1, 0], pernaTras: [1, 0], bracoFrente: [0, 1], cabeca: [1, 0] }),
      q('estendido', 'normal', { tronco: [0, 1], cabeca: [1, 1], bracoFrente: [0, 1], bracoTras: [0, 1] }, {}, true),
    ],
  },
];

export const PASSO_POR_ID: Readonly<Record<string, Passo>> = Object.fromEntries(PASSOS.map(p => [p.id, p]));

// ── O banquete (09/10/2026) ─────────────────────────────────────────────────
//
// O super_admin aperta «Recuperar vida»: aparece uma pessoa, ele corre até
// ela, pula e devora (`chefao.ts`, «O banquete»). Estes dois passos ficam FORA
// de `PASSOS` — o sorteio da dança nunca escolhe correr nem comer.

/** Correndo até a vítima: a marcha do clipe, ligeira. */
export const CORRIDA: Passo = {
  ...PASSO_POR_ID.marcha, id: 'corrida', nome: 'FOME!', msPorQuadro: 95, voltas: Infinity, velocidade: 300, esquiva: 0,
};

/** Devorando: curvado sobre ela, as garras e a cabeça indo e vindo. */
export const BANQUETE: Passo = {
  id: 'banquete', nome: 'NHAC!', msPorQuadro: 120, voltas: Infinity, anda: 'parado', velocidade: 0, esquiva: 0,
  quadros: [
    q('garra', 'normal', { cabeca: [1, 1] }, { gira: 16 }),
    q('garra', 'normal', { cabeca: [1, 2], bracoFrente: [1, 1], bracoTras: [1, 1] }, { gira: 24 }),
    q('garra', 'normal', { cabeca: [0, 1] }, { gira: 12 }),
    q('garra', 'normal', { cabeca: [1, 2], bracoFrente: [0, 1] }, { gira: 22 }, true),
  ],
};

/**
 * A vítima: uma pessoa qualquer (não é ninguém do escritório), 12 × 18 px da
 * arte, montada por PARTES como o chefão — para ele poder arrancar uma a uma.
 *
 * Cores:  h cabelo · s pele · S pele na sombra · e olho · b boca aberta
 *         c camisa · C camisa na sombra · p calça · P calça na sombra · k sapato
 * Partes: H cabeça · T tronco (com o quadril) · a/b braços · l/r pernas
 *
 * Poses: `anda1`/`anda2` (a passada, distraída), `parada`, `susto` (braços
 * para cima, boca aberta). Caída é a de susto deitada (`girarImagem`).
 */
export type PoseVitima = 'anda1' | 'anda2' | 'parada' | 'susto';
export type ParteVitima = 'cabeca' | 'tronco' | 'bracoA' | 'bracoB' | 'pernaA' | 'pernaB';

const LETRA_DA_PARTE: Readonly<Record<string, ParteVitima>> = {
  H: 'cabeca', T: 'tronco', a: 'bracoA', b: 'bracoB', l: 'pernaA', r: 'pernaB',
};
export const NUMERO_DA_PARTE_VITIMA: Readonly<Record<ParteVitima, number>> = {
  cabeca: 1, tronco: 2, bracoA: 3, bracoB: 4, pernaA: 5, pernaB: 6,
};

const CABECA_CALMA = ['....hhhh....', '...hhhhhh...', '...hssssh...', '...sesses...', '...ssssss...', '...ssSSss...', '....SssS....'];
const CABECA_CALMA_P = ['....HHHH....', '...HHHHHH...', '...HHHHHH...', '...HHHHHH...', '...HHHHHH...', '...HHHHHH...', '....HHHH....'];
const CORPO_CALMO = ['..cccccccc..', '..cccccccc..', '..ccCcccCc..', '..cccccccc..', '..s.cccc.s..', '...pppppp...', '...ppPPpp...'];
const CORPO_CALMO_P = ['..aTTTTTTb..', '..aTTTTTTb..', '..aTTTTTTb..', '..aTTTTTTb..', '..a.TTTT.b..', '...TTTTTT...', '...TTTTTT...'];
const PERNAS_PARADAS = ['...pp..pp...', '...pp..pp...', '...Pp..pP...', '..kkk..kkk..'];
const PERNAS_PARADAS_P = ['...ll..rr...', '...ll..rr...', '...ll..rr...', '..lll..rrr..'];

export const VITIMA_POSES: Readonly<Record<PoseVitima, { cores: readonly string[]; partes: readonly string[] }>> = {
  anda1: {
    cores: [...CABECA_CALMA, ...CORPO_CALMO, '...pp..pp...', '..pp....pp..', '..Pp....pP..', '.kkk....kkk.'],
    partes: [...CABECA_CALMA_P, ...CORPO_CALMO_P, '...ll..rr...', '..ll....rr..', '..ll....rr..', '.lll....rrr.'],
  },
  anda2: {
    cores: [...CABECA_CALMA, ...CORPO_CALMO, '....pppp....', '....pppp....', '....PpPp....', '...kkkkkk...'],
    partes: [...CABECA_CALMA_P, ...CORPO_CALMO_P, '....llrr....', '....llrr....', '....llrr....', '...lllrrr...'],
  },
  parada: {
    cores: [...CABECA_CALMA, ...CORPO_CALMO, ...PERNAS_PARADAS],
    partes: [...CABECA_CALMA_P, ...CORPO_CALMO_P, ...PERNAS_PARADAS_P],
  },
  susto: {
    cores: [
      '....hhhh....', '.s.hhhhhh.s.', '.s.hssssh.s.', '.c.sesses.c.', '.c.ssssss.c.', '.c.ssbbss.c.', '.cc.SssS.cc.',
      '..cccccccc..', '...cccccc...', '...cCcccc...', '...ccccCc...', '...cccccc...', '...pppppp...', '...ppPPpp...',
      ...PERNAS_PARADAS,
    ],
    partes: [
      '....HHHH....', '.a.HHHHHH.b.', '.a.HHHHHH.b.', '.a.HHHHHH.b.', '.a.HHHHHH.b.', '.a.HHHHHH.b.', '.aa.HHHH.bb.',
      '..TTTTTTTT..', '...TTTTTT...', '...TTTTTT...', '...TTTTTT...', '...TTTTTT...', '...TTTTTT...', '...TTTTTT...',
      ...PERNAS_PARADAS_P,
    ],
  },
};

/** A pose de susto (a de antes das poses): o tamanho da vítima de pé. */
export const VITIMA_LINHAS: readonly string[] = VITIMA_POSES.susto.cores;

const CAMISAS = ['#3b82f6', '#16a34a', '#eab308', '#ef4444', '#a855f7', '#f97316'] as const;
const CABELOS = ['#3f2a1a', '#141414', '#c08a3e', '#6b3f1f', '#8a8a8a'] as const;
const PELES = ['#f1c7a0', '#d9a273', '#a86b45', '#7a4a2e'] as const;
const CALCAS = ['#1f2937', '#374151', '#1e3a8a', '#4b3b2a'] as const;

function sombra(cor: string, f = 0.72): string {
  const n = parseInt(cor.slice(1), 16);
  const c = (v: number) => Math.round(v * f).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/**
 * A vítima desta semente (a mesma em toda tela), na pose pedida, sem as
 * partes que ele já arrancou.
 */
export function imagemDaVitima(
  semente: number, pose: PoseVitima = 'susto', sem: ReadonlySet<ParteVitima> = new Set(),
): Imagem {
  const s = Math.abs(Math.trunc(semente));
  const camisa = CAMISAS[s % CAMISAS.length];
  const pele = PELES[Math.floor(s / 7) % PELES.length];
  const calca = CALCAS[Math.floor(s / 41) % CALCAS.length];
  const cor: Readonly<Record<string, string>> = {
    h: CABELOS[Math.floor(s / 3) % CABELOS.length], s: pele, S: sombra(pele), e: '#1a1a1a', b: '#5a0d0d',
    c: camisa, C: sombra(camisa), p: calca, P: sombra(calca), k: '#111111',
  };
  const { cores, partes } = VITIMA_POSES[pose];
  const largura = cores[0].length;
  const altura = cores.length;
  const img: Imagem = { largura, altura, cores: new Array(largura * altura).fill(null), partes: new Uint8Array(largura * altura) };
  for (let j = 0; j < altura; j++) for (let i = 0; i < largura; i++) {
    const parte = LETRA_DA_PARTE[partes[j][i]];
    if (!parte || sem.has(parte)) continue;
    img.cores[j * largura + i] = cor[cores[j][i]] ?? null;
    img.partes[j * largura + i] = NUMERO_DA_PARTE_VITIMA[parte];
  }
  return img;
}

/**
 * A imagem deitada: 90° para um lado (`1` = a cabeça vai para a direita).
 * Ela cai para longe de quem a derrubou.
 */
export function girarImagem(img: Imagem, sentido: 1 | -1): Imagem {
  const largura = img.altura;
  const altura = img.largura;
  const out: Imagem = { largura, altura, cores: new Array(largura * altura).fill(null), partes: new Uint8Array(largura * altura) };
  for (let j = 0; j < img.altura; j++) for (let i = 0; i < img.largura; i++) {
    // Horário: (i, j) → (altura-1-j, i). Anti-horário: (i, j) → (j, largura-1-i).
    const ni = sentido === 1 ? img.altura - 1 - j : j;
    const nj = sentido === 1 ? i : img.largura - 1 - i;
    out.cores[nj * largura + ni] = img.cores[j * img.largura + i];
    out.partes[nj * largura + ni] = img.partes[j * img.largura + i];
  }
  return out;
}

/** Só uma parte da imagem (o pedaço que vai voar). */
export function soAParte(img: Imagem, parte: ParteVitima): Imagem {
  const n = NUMERO_DA_PARTE_VITIMA[parte];
  return { ...img, cores: img.cores.map((c, i) => (img.partes[i] === n ? c : null)) };
}

/** Os passos da Fúria do Rei: só os rápidos, em sequência. */
export const PASSOS_DA_FURIA: readonly string[] = ['moonwalk', 'giro', 'garras', 'moonwalk', 'giro', 'pose'];

/**
 * O próximo passo. O giro sempre termina na ponta do pé (é o passo que ele
 * faz no clipe), e nunca repete o mesmo passo duas vezes seguidas.
 */
export function proximoPasso(atual: string | null, sorteio: number): Passo {
  if (atual === 'giro') return PASSO_POR_ID.ponta;
  const podem = PASSOS.filter(p => p.id !== atual && p.id !== 'ponta');
  const i = Math.min(podem.length - 1, Math.floor(Math.abs(sorteio) * podem.length));
  return podem[i];
}

// ── O tiro ──────────────────────────────────────────────────────────────────

/** Dano de cada acerto. Na cabeça vale o triplo. */
export const DANO_CORPO = 1;
export const DANO_CABECA = 3;

/**
 * A transformação do sprite inteiro no CSS, com a origem no meio dos pés
 * (`transform-origin: 50% 100%`). A ordem importa: gira, espelha, sobe —
 * para quem olha para a esquerda, a inclinação vai para a esquerda também.
 *
 * `achata` (0–1) é o amasso da aterrissagem do pulo: dura um instante, e o
 * tiro não o desfaz (a diferença é de um pixel).
 */
export function cssDaTransforma(t: Transforma, lado: 1 | -1, escala: number, achata = 0): string {
  const amasso = achata > 0 ? ` scale(${(1 + achata * 0.16).toFixed(3)}, ${(1 - achata * 0.2).toFixed(3)})` : '';
  return `translateY(${-t.sobe * escala}px)${amasso} scaleX(${lado * t.vira}) rotate(${t.gira}deg)`;
}

/**
 * Leva um ponto da caixa (em px da tela, a partir do canto de cima, sem a
 * transformação) de volta à arte, desfazendo `cssDaTransforma` na ordem
 * inversa: desce, desespelha, desgira. Devolve a coluna e a linha do pixel da
 * arte — às vezes fora dela: aí é tiro na parede.
 */
export function pontoNaArte(
  px: number, py: number,
  t: Transforma, lado: 1 | -1, escala: number,
  largura: number, altura: number,
): { x: number; y: number } {
  // Em px da arte, com a origem no meio dos pés.
  let x = px / escala - largura / 2;
  const y = py / escala - altura + t.sobe;
  x *= lado * t.vira;
  const g = (t.gira * Math.PI) / 180;
  const cos = Math.cos(g), sin = Math.sin(g);
  const rx = x * cos + y * sin;
  const ry = -x * sin + y * cos;
  return { x: Math.floor(rx + largura / 2), y: Math.floor(ry + altura) };
}
