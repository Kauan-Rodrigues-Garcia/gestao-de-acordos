/**
 * zumbis.ts — os zumbis da caça, pixel a pixel.
 *
 * Puro (sem DOM): o desenho é dado. `cena.tsx` pinta num canvas, `fisica.ts`
 * despedaça, e os testes conferem sem navegador.
 *
 * ## Como o sprite é montado
 *
 * Um corpo-base de 24×32 em seis peças (cabeça, tronco, dois braços, duas
 * pernas), cada uma com a própria grade e o próprio lugar. A peça é a unidade
 * de tudo: a animação mexe a peça inteira um pixel, o clique pergunta em que
 * peça caiu, e a explosão arranca a peça do corpo.
 *
 * Cada zumbi é o corpo-base com outra paleta e enfeites por cima (cabelo,
 * gravata, crachá, véu…) — o enfeite pertence a uma peça e anda com ela.
 *
 * As letras da grade são as cores da paleta. `.` é transparente.
 *
 *   o        contorno
 *   1 2 3 4  pele, da sombra ao brilho (a sombra puxa para o frio, o brilho
 *            para o quente — a regra de paleta da arte em pixel)
 *   a b c    roupa de cima          d e f   calça
 *   g        sapato e cinto         y Y     olho aceso e olho apagado
 *   m t      boca e dente           r R     sangue escuro e vivo
 *   n        osso                   h H     cabelo, escuro e claro
 *   x X z Z  enfeite de cada zumbi
 *
 * Luz sempre do alto à esquerda. Zumbi virado para a direita; o da esquerda é
 * o mesmo espelhado.
 */

export const LARGURA = 24;
export const ALTURA = 34;

export type NomeParte = 'bracoTras' | 'pernaTras' | 'pernaFrente' | 'tronco' | 'cabeca' | 'bracoFrente';

/** A ordem de pintura: de trás para a frente. */
export const ORDEM: readonly NomeParte[] = ['bracoTras', 'pernaTras', 'pernaFrente', 'tronco', 'cabeca', 'bracoFrente'];

export interface Grade {
  /** Linhas de mesma largura. */
  linhas: readonly string[];
  x: number;
  y: number;
}

export type Paleta = Readonly<Record<string, string>>;

export interface Enfeite extends Grade {
  parte: NomeParte;
  /** Pintado antes da peça (atrás dela) em vez de por cima. */
  atras?: boolean;
  /** Na morte, sai da peça e cai do seu jeito (`fisica.ts`). Sem isso, vira pedaço junto com a peça. */
  solta?: Solta;
}

/**
 * Como cada enfeite cai quando o zumbi morre (Cleber, 08/10/2026 — «cada um
 * morre do seu jeito»):
 *
 *   cai     voa girando e quica (boné, fone, tiara, óculos, canetas)
 *   plana   desce devagar, balançando no ar (gravata, véu, crachá, laço)
 *   crava   gira no ar e finca no chão (o machado do Lenhador)
 *   abre    cai e se abre: sai uma pizza (a bag do Entregador)
 *   miolo   quica mole e suja o chão de rosa (o cérebro do Cientista)
 */
export type Solta = 'cai' | 'plana' | 'crava' | 'abre' | 'miolo';

export interface Zumbi {
  id: string;
  /** Como aparece no painel: «o Gerente». */
  nome: string;
  paleta: Paleta;
  enfeites: readonly Enfeite[];
  /** Peças trocadas inteiras (o vestido da Noiva no lugar das pernas). */
  trocas?: Partial<Record<NomeParte, Grade>>;
}

// ── O corpo-base ─────────────────────────────────────────────────────────────

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

const TRONCO: Grade = {
  x: 5, y: 13,
  linhas: [
    '.....o2ro...',
    '.oobccb1bbo.',
    'obccbbbrbbao',
    'obcbbbrRbbao',
    'obcbbbRrbbao',
    'obbbbbrbbbao',
    'oabbbbbbbaao',
    'oabbbbbbbaao',
    'oa2ab1bba2ao',
    'oggggtgggggo',
    '.oeeeeeeedo.',
  ],
};

const BRACO_TRAS: Grade = {
  x: 12, y: 14,
  linhas: [
    'ooooooooo...',
    'abbbba1122o.',
    'aaaaaa11222o',
    'oooooo1o2o2o',
    '.......o.o.o',
  ],
};

const BRACO_FRENTE: Grade = {
  x: 9, y: 17,
  linhas: [
    '.oooooooooooo..',
    'obcccbbbbb3344o',
    'obbbbbbbba2333o',
    '.oaaaaaaaoo2o2o',
    '..ooooooo..o.o.',
  ],
};

const PERNA_TRAS: Grade = {
  x: 6, y: 23,
  linhas: [
    'oddeo.',
    'odeeo.',
    'odeeo.',
    'oddeo.',
    '.odeo.',
    '.odeo.',
    '.oddo.',
    '.oggo.',
    'ogggo.',
    'oooooo',
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
    '.odeeo...',
    '.oggggggo',
    '.oooooooo',
  ],
};

const BASE: Record<NomeParte, Grade> = {
  cabeca: CABECA,
  tronco: TRONCO,
  bracoTras: BRACO_TRAS,
  bracoFrente: BRACO_FRENTE,
  pernaTras: PERNA_TRAS,
  pernaFrente: PERNA_FRENTE,
};

// ── As cores comuns ──────────────────────────────────────────────────────────

const COMUM: Paleta = {
  o: '#1a1124',
  y: '#ffe14d',
  Y: '#a8862a',
  m: '#3a0a16',
  t: '#e9dfbc',
  r: '#6e0a12',
  R: '#c8202a',
  n: '#efe6cc',
  g: '#2a2230',
};

const PELE = {
  verde:   { 1: '#2c4a3c', 2: '#4c7845', 3: '#78a24e', 4: '#b3cf6a' },
  cinza:   { 1: '#363f40', 2: '#5c6b5d', 3: '#889a78', 4: '#bccaa0' },
  azulada: { 1: '#2b3652', 2: '#4a5f78', 3: '#7690a2', 4: '#aac6c6' },
  lilas:   { 1: '#3d3152', 2: '#6a5a80', 3: '#9c8eae', 4: '#d3c9d8' },
  amarela: { 1: '#3a4826', 2: '#687834', 3: '#9dad4a', 4: '#d5db7e' },
  palida:  { 1: '#25403f', 2: '#3f6b62', 3: '#68a08a', 4: '#a6d6b4' },
  podre:   { 1: '#3b2f2a', 2: '#6b5a3e', 3: '#9b8a55', 4: '#cfc283' },
} as const;

function paleta(...partes: Readonly<Record<string, string>>[]): Paleta {
  return Object.assign({}, COMUM, ...partes);
}

function enfeite(parte: NomeParte, x: number, y: number, linhas: string[], atras = false): Enfeite {
  return { parte, x, y, linhas, atras };
}

function solto(jeito: Solta, e: Enfeite): Enfeite {
  return { ...e, solta: jeito };
}

/** Peça sem nenhum pixel: some com a peça-base (a Noiva não tem perna de trás à vista). */
const NADA: Grade = { x: 0, y: 0, linhas: [] };

// ── Os zumbis ────────────────────────────────────────────────────────────────
//
// Oito, um de cada jeito: a silhueta muda (boné, moicano, véu, cérebro, machado)
// e a cor da roupa também — dá para saber qual é só de relance. A ordem não
// importa: o banco sorteia um que ainda não saiu no dia.

export const ZUMBIS: readonly Zumbi[] = [
  {
    id: 'operador',
    nome: 'o Operador',
    paleta: paleta(PELE.verde, {
      a: '#14524f', b: '#1f8a7f', c: '#4cc4ae',
      d: '#2e3442', e: '#4a5366', f: '#6d7891',
      x: '#22202a', X: '#6b6878', z: '#f2f2e8', Z: '#3b82f6',
    }),
    enfeites: [
      // Fone de operador: o arco por cima da cabeça, a concha na orelha e o
      // microfone até a boca.
      solto('cai', enfeite('cabeca', 5, 3, [
        '.....XX',
        '...XX..',
        '...X...',
        '.xXx...',
        'xXXx...',
        'xXZx...',
        '.xxxx..',
        '....xxxxX',
      ])),
      // Crachá no peito.
      solto('plana', enfeite('tronco', 8, 14, [
        '.Z',
        'zz',
        'ZZ',
      ])),
    ],
  },
  {
    id: 'gerente',
    nome: 'o Gerente',
    paleta: paleta(PELE.cinza, {
      a: '#8b8798', b: '#cdc8d6', c: '#f3f0f6',
      d: '#1b2135', e: '#2b3452', f: '#43517d',
      h: '#2a1c15', H: '#5c3e2a', x: '#8f1820', X: '#d9363e',
    }),
    enfeites: [
      // O topete penteado de lado, que não esconde nada.
      enfeite('cabeca', 8, 3, [
        '..HhHhhHh',
        'hHh..h.h.',
        'h........',
        'h........',
      ]),
      // A gravata, frouxa.
      solto('plana', enfeite('tronco', 11, 14, [
        'xx',
        'Xx',
        'xX',
      ])),
    ],
  },
  {
    id: 'estagiaria',
    nome: 'a Estagiária',
    paleta: paleta(PELE.azulada, {
      a: '#7d2652', b: '#c04a82', c: '#ec86b3',
      d: '#1d3560', e: '#2e5694', f: '#4f7fc0',
      h: '#6e2412', H: '#b5501f', x: '#e83e8c', X: '#ff9ccb',
    }),
    enfeites: [
      enfeite('cabeca', 2, 4, [
        '...oo',
        '..oHh',
        '.oHhh',
        'oHhho',
        'ohhho',
        'ohho.',
        'ohho.',
        '.oo..',
      ], true),
      enfeite('cabeca', 7, 3, [
        '...HHHhhhh',
        '.HHHhhhhhhh',
        '.hhhhhh.h.h',
        '.hh',
        'hh',
        'hh',
        'h',
      ]),
      // O laço do rabo de cavalo.
      solto('plana', enfeite('cabeca', 4, 4, [
        'xXx',
        '.x.',
      ])),
    ],
  },
  {
    id: 'entregador',
    nome: 'o Entregador',
    paleta: paleta(PELE.amarela, {
      a: '#94620c', b: '#e0a21c', c: '#ffd451',
      d: '#262a33', e: '#3c4250', f: '#5b6273',
      x: '#a3151d', X: '#e0353b', z: '#5e0c12', Z: '#ffd451',
    }),
    enfeites: [
      // O boné, com a aba para a frente.
      solto('cai', enfeite('cabeca', 9, 1, [
        '.oooooo',
        'oXXXxxxo',
        'oXXxxxxxo',
        '.oxxxxxxzzzz',
        '........oooo',
      ])),
      // A bag de entrega nas costas.
      solto('abre', enfeite('tronco', 0, 13, [
        'ooooooo',
        'oXXXXxo',
        'oXZZXxo',
        'oXXZXxo',
        'oxxxxxo',
        'oxxxxxo',
        'oxxxxxo',
        'ooooooo',
      ], true)),
      // A alça da bag.
      enfeite('tronco', 7, 14, [
        'g..',
        '.g.',
        '..g',
      ]),
    ],
  },
  {
    id: 'noiva',
    nome: 'a Noiva',
    paleta: paleta(PELE.lilas, {
      a: '#9a93ab', b: '#d7d1e0', c: '#f4f1f7',
      // A cintura (que no corpo-base é calça) é vestido também.
      d: '#9a93ab', e: '#d7d1e0', f: '#f4f1f7',
      y: '#a8f0ff', Y: '#4c8a99',
      h: '#241a2c', H: '#4a3a58', x: '#e8c45a', X: '#fff1a8', z: '#e9e7f0', Z: '#a9a5bc',
    }),
    trocas: {
      pernaTras: NADA,
      // O vestido no lugar das pernas: rasgado na barra, sujo de sangue.
      pernaFrente: {
        x: 4, y: 23,
        linhas: [
          '.obbbbbbbbbo.',
          '.obcbbbbbbbao',
          'obcbbbbrbbbao',
          'obcbbbbbbbbao',
          'obbbbbbbbbbao',
          'oabbbbbbbbaao',
          'oabbrbbbabbao',
          'oaoabaoabaoao',
          '...o22o.o22o.',
          '..oggo..oggo.',
        ],
      },
    },
    enfeites: [
      // O véu caindo pelas costas: a parte de cima vai com a cabeça, a de baixo
      // fica atrás do corpo. A borda mais escura é o que o separa de um fundo claro.
      solto('plana', enfeite('cabeca', 1, 3, [
        '......ZZZ',
        '....ZZzzz',
        '...Zzzzzz',
        '..Zzzzzz',
        '..Zzzzzz',
        '.Zzzzzz',
        '.ZzzZzz',
        '.Zzzzzz',
        '.ZzZzz',
        '.Zzzzz',
      ], true)),
      solto('plana', enfeite('tronco', 2, 13, [
        '.ZzzZz',
        '.Zzzzz',
        '.ZzZzz',
        '.Zzzzz',
        '.ZzZzZ',
        '..ZzZ',
        '..Z.Z',
      ], true)),
      enfeite('cabeca', 7, 3, [
        '...hhhhhhh',
        '.hhHhhhhhhh',
        '.hHh....h.h',
        '.hh',
        'hh',
        'hh',
        'hh',
      ]),
      // A tiara.
      solto('cai', enfeite('cabeca', 10, 3, ['XxXxX'])),
    ],
  },
  {
    id: 'roqueiro',
    nome: 'o Roqueiro',
    paleta: paleta(PELE.verde, {
      a: '#121017', b: '#2a2733', c: '#4e4a5e',
      d: '#35537f', e: '#5b84bd', f: '#9bbfe6',
      y: '#ff4033', Y: '#8a1d17',
      x: '#c2186b', X: '#ff6fb5', z: '#cfd2dc', Z: '#ffd34d',
    }),
    enfeites: [
      // O moicano.
      enfeite('cabeca', 10, 0, [
        '.X.X.X.',
        'XxXxXxX',
        'xxxxxxx',
        '.xxxxx.',
      ]),
      // O brinco.
      enfeite('cabeca', 7, 9, ['Z']),
      // As tachas da jaqueta e o zíper.
      enfeite('tronco', 6, 14, [
        '.z.z..z',
        'z.z...z',
        '......z',
      ]),
    ],
  },
  {
    id: 'cientista',
    nome: 'o Cientista',
    paleta: paleta(PELE.palida, {
      a: '#8f9aa3', b: '#d6dee3', c: '#f7fbfc',
      d: '#3a3046', e: '#5a4b6b', f: '#7d6c91',
      y: '#8dff6b', Y: '#3d8a32',
      x: '#c4527a', X: '#f08aaa', z: '#7d2448', Z: '#5ad1e6',
    }),
    enfeites: [
      // O cérebro à mostra, com a borda do crânio aberto.
      solto('miolo', enfeite('cabeca', 8, 1, [
        '..ooooo...',
        '.oXXxXXxo.',
        'oXxzXxzxxo',
        'nnrnnnnrnn',
      ])),
      // Os óculos de proteção na testa.
      solto('cai', enfeite('cabeca', 8, 6, ['gggggoZZoZ'])),
      // O jaleco: as abas por cima da calça e as canetas no bolso.
      enfeite('tronco', 5, 22, [
        'obbbbbbbbbbo',
        'obcbbbbbbbao',
        'obbbbo.obbao',
        'oabbo...oaao',
        'oooo.....ooo',
      ]),
      solto('cai', enfeite('tronco', 8, 14, [
        'ZR',
        'aa',
      ])),
    ],
  },
  {
    id: 'lenhador',
    nome: 'o Lenhador',
    paleta: paleta(PELE.podre, {
      a: '#4a0f14', b: '#9e2228', c: '#d4474b',
      d: '#2e3a4a', e: '#465870', f: '#6b809c',
      h: '#3d2414', H: '#6b4026', x: '#2a0b10', X: '#8a5a2e', z: '#7d8792', Z: '#dfe5ea',
    }),
    enfeites: [
      // A camisa xadrez: listas escuras cruzando o vermelho.
      enfeite('tronco', 8, 14, [
        'x...x',
        'x...x',
        'xxxxx',
      ]),
      enfeite('bracoFrente', 12, 18, [
        'x...x',
        'x...x',
      ]),
      // A barba.
      enfeite('cabeca', 8, 9, [
        'h',
        'hhHhhh',
        '.hhhHh',
        '...hhhh',
      ]),
      // O machado cravado no alto da cabeça.
      solto('crava', enfeite('cabeca', 2, 0, [
        'oo.....oooo.',
        'oXXo..oZZZzo',
        '.oXXXooZzzzo',
        '..ooXXXzzzRo',
        '....oo.rRRr.',
      ])),
    ],
  },
];

// ── A montagem ───────────────────────────────────────────────────────────────

export type Deslocamento = Partial<Record<NomeParte, readonly [number, number]>>;

export interface Quadro {
  /** Quanto cada peça andou neste quadro. */
  desloca: Deslocamento;
  /** Olho apagado (pisca). */
  piscando?: boolean;
}

/**
 * A animação parada: o zumbi cambaleia sem sair do lugar. Quatro quadros —
 * a regra da arte em pixel é poucos quadros bem escolhidos. O movimento é de
 * um pixel, sempre para baixo (o corpo afunda e volta), para nunca abrir
 * buraco entre as peças.
 */
export const QUADROS: readonly Quadro[] = [
  { desloca: {} },
  { desloca: { cabeca: [0, 1], bracoFrente: [0, 1] } },
  { desloca: { cabeca: [1, 1], tronco: [0, 1], bracoFrente: [0, 1], bracoTras: [0, 1] }, piscando: true },
  { desloca: { cabeca: [0, 1], bracoTras: [0, 1] } },
];

export const MS_POR_QUADRO = 190;

/**
 * Andando (Cleber, 07/10/2026 — «andasse devagar, para deixar mais difícil»).
 * Quatro quadros de passo arrastado: o pé da frente adiante, a passagem (o
 * corpo afunda um pixel), o pé de trás adiante, a passagem de novo. O zumbi
 * anda um pixel da arte por quadro; os pés trocam de lugar no mesmo ritmo, e o
 * passo não parece patinar.
 */
export const ANDANDO: readonly Quadro[] = [
  { desloca: { pernaFrente: [1, 0], pernaTras: [-1, 0], bracoTras: [0, 1] } },
  { desloca: { tronco: [0, 1], cabeca: [0, 1], bracoFrente: [0, 1], bracoTras: [0, 1] } },
  { desloca: { pernaFrente: [-1, 0], pernaTras: [1, 0], bracoFrente: [0, 1], cabeca: [1, 0] } },
  { desloca: { tronco: [0, 1], cabeca: [1, 1], bracoFrente: [0, 1], bracoTras: [0, 1] }, piscando: true },
];

export const MS_POR_PASSO = 240;

/**
 * Todos os quadros, parado e andando, numa lista só: o número do quadro é o que
 * o tiro e a física usam para saber como o zumbi estava. 0–3 parado, 4–7 andando.
 */
export const TODOS_OS_QUADROS: readonly Quadro[] = [...QUADROS, ...ANDANDO];
export const PRIMEIRO_PASSO = QUADROS.length;

/** O número de cada peça no mapa de peças: 0 é vazio. */
export const NUMERO_DA_PARTE: Readonly<Record<NomeParte, number>> = {
  cabeca: 1, tronco: 2, bracoTras: 3, bracoFrente: 4, pernaTras: 5, pernaFrente: 6,
};

export interface Imagem {
  largura: number;
  altura: number;
  /** Cor de cada pixel, `null` = transparente. */
  cores: (string | null)[];
  /** Em que peça cada pixel está (`NUMERO_DA_PARTE`), 0 = nenhuma. */
  partes: Uint8Array;
}

function pintar(img: Imagem, g: Grade, pal: Paleta, parte: number, dx: number, dy: number, troca?: (letra: string) => string): void {
  g.linhas.forEach((linha, j) => {
    for (let i = 0; i < linha.length; i++) {
      let letra = linha[i];
      if (letra === '.') continue;
      if (troca) letra = troca(letra);
      const x = g.x + dx + i;
      const y = g.y + dy + j;
      if (x < 0 || y < 0 || x >= img.largura || y >= img.altura) continue;
      const cor = pal[letra];
      if (!cor) continue;
      img.cores[y * img.largura + x] = cor;
      img.partes[y * img.largura + x] = parte;
    }
  });
}

export function gradeDa(z: Zumbi, parte: NomeParte): Grade {
  return z.trocas?.[parte] ?? BASE[parte];
}

/** Olho de quem morreu: apagado. */
function olhoDeMorto(letra: string): string {
  return letra === 'y' ? 'o' : letra;
}

export function imagemVazia(largura: number, altura: number): Imagem {
  return { largura, altura, cores: new Array(largura * altura).fill(null), partes: new Uint8Array(largura * altura) };
}

/**
 * O zumbi num quadro da animação — inteiro, ou só as peças que `quais` deixar
 * (a explosão separa a cabeça do resto sem o desenho pular de lugar).
 */
export function montarQuadro(
  z: Zumbi,
  quadro: Quadro,
  quais: (p: NomeParte) => boolean = () => true,
  opcoes: { morta?: boolean; sem?: (e: Enfeite) => boolean } = {},
): Imagem {
  const img = imagemVazia(LARGURA, ALTURA);
  const pal: Paleta = quadro.piscando ? { ...z.paleta, y: z.paleta.Y } : z.paleta;
  const troca = opcoes.morta ? olhoDeMorto : undefined;
  const usa = (e: Enfeite) => !opcoes.sem?.(e);
  for (const parte of ORDEM) {
    if (!quais(parte)) continue;
    const [dx, dy] = quadro.desloca[parte] ?? [0, 0];
    const n = NUMERO_DA_PARTE[parte];
    for (const e of z.enfeites) if (e.parte === parte && e.atras && usa(e)) pintar(img, e, pal, n, dx, dy);
    pintar(img, gradeDa(z, parte), pal, n, dx, dy, troca);
    for (const e of z.enfeites) if (e.parte === parte && !e.atras && usa(e)) pintar(img, e, pal, n, dx, dy);
  }
  return img;
}

/** Um enfeite sozinho, onde ele estava no quadro (o que se solta na morte). */
export function montarEnfeite(z: Zumbi, quadro: Quadro, e: Enfeite): Imagem {
  const img = imagemVazia(LARGURA, ALTURA);
  const [dx, dy] = quadro.desloca[e.parte] ?? [0, 0];
  pintar(img, e, z.paleta, NUMERO_DA_PARTE[e.parte], dx, dy);
  return img;
}

/**
 * Em que peça caiu o tiro: o pixel exato e, se for fundo, o vizinho mais perto
 * (um pixel de tolerância — a mira é da pessoa, não do mouse). 0 = errou.
 */
export function parteNoPonto(img: Imagem, x: number, y: number): number {
  const em = (i: number, j: number) => (i < 0 || j < 0 || i >= img.largura || j >= img.altura ? 0 : img.partes[j * img.largura + i]);
  const exato = em(x, y);
  if (exato) return exato;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const p = em(x + dx, y + dy);
    if (p) return p;
  }
  return 0;
}

/** O centro de uma peça no quadro — onde o tiro «de outra pessoa» acerta. */
export function centroDaParte(img: Imagem, numero: number): { x: number; y: number } {
  let sx = 0, sy = 0, n = 0;
  for (let j = 0; j < img.altura; j++) for (let i = 0; i < img.largura; i++) {
    if (img.partes[j * img.largura + i] === numero) { sx += i; sy += j; n++; }
  }
  return n ? { x: Math.round(sx / n), y: Math.round(sy / n) } : { x: LARGURA / 2, y: ALTURA / 2 };
}

/** O zumbi da rodada: o banco escolhe (`zumbi`); sem isso, a semente. */
export function zumbiDaRodada(r: { zumbi?: number | null; semente: number }): Zumbi {
  const n = ZUMBIS.length;
  const i = r.zumbi != null && Number.isFinite(r.zumbi) ? r.zumbi : Math.abs(r.semente);
  return ZUMBIS[((i % n) + n) % n];
}
