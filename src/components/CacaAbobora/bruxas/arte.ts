/**
 * arte.ts — as bruxas da caça, pixel a pixel.
 *
 * Puro (sem DOM), no mesmo molde de `../zumbis.ts`: o desenho é dado. Quem
 * pinta é `pixels.ts`; quem despedaça é `queda.ts`; os testes conferem sem
 * navegador.
 *
 * ## Como o sprite é montado
 *
 * Uma bruxa de 48×38 montada na vassoura, virada para a direita, em onze peças
 * (capa, cabelo, os dois braços, as duas pernas, a vara, a palha, o tronco com
 * a saia, a cabeça e o chapéu). Cada peça é uma grade de letras escrita em x
 * ABSOLUTO por linha (`d()`), para alinhar de olho. A peça é a unidade de tudo:
 * a animação troca a variante da peça (a capa e o cabelo ondulam), o clique
 * pergunta em que peça caiu, e a queda solta as peças num boneco de juntas.
 *
 * As letras são as cores da paleta (`.` é transparente):
 *
 *   o        contorno                 1 2 3 4  pele, da sombra ao brilho
 *   a b c    vestido                  d e      capa (fora)   l F  forro
 *   k K L    chapéu                   s G      fita e fivela
 *   h H j    cabelo                   i I      meia listrada
 *   g u      bota                     v W w    madeira       q P p  palha
 *   y Y      olho aceso e piscando    m t      boca e dente
 *   5 6      remendo e ponto          x X z Z  enfeite de cada bruxa
 *
 * Luz do alto à esquerda, como nos zumbis.
 */

export const LARGURA = 48;
export const ALTURA = 38;

export type NomeParte =
  | 'capa' | 'cabelo' | 'bracoTras' | 'pernaTras' | 'palha' | 'vassoura'
  | 'tronco' | 'pernaFrente' | 'cabeca' | 'chapeu' | 'bracoFrente';

/** A ordem de pintura: de trás para a frente. */
export const ORDEM: readonly NomeParte[] = [
  'capa', 'cabelo', 'bracoTras', 'pernaTras', 'vassoura', 'palha', 'tronco', 'pernaFrente', 'cabeca', 'chapeu', 'bracoFrente',
];

export interface Grade { linhas: readonly string[]; x: number; y: number }
export type Paleta = Readonly<Record<string, string>>;

type Fila = readonly [number, string] | null;

/** Uma grade escrita em x ABSOLUTO por linha: `[x, '...']`; `null` pula a linha. */
function d(y: number, filas: readonly Fila[]): Grade {
  const xs = filas.filter((f): f is readonly [number, string] => !!f).map(f => f[0]);
  const x0 = Math.min(...xs);
  return { x: x0, y, linhas: filas.map(f => (f ? '.'.repeat(f[0] - x0) + f[1] : '')) };
}

// ── As peças ───────────────────────────────────────────────────────────────

const CHAPEU_FIM: Fila[] = [
  [24, 'oLLKKKkko'],
  [24, 'oLLKKKKkko'],
  [23, 'oLLKKKKKkkko'],
  [19, 'oooo' + 'ossssssssGGso' + 'oooooo'],
  [19, 'ooLLLLLKKKKKKKKKKKKKkkoo'],
  [20, 'oooooooooooooooooooooo'],
];

/** A ponta dobrada do chapéu balança com o vento: duas posições. */
const CHAPEU: Grade[] = [
  d(0, [
    [19, 'oooooo'],
    [16, 'oooLLLKKKko'],
    [14, 'ooKKoooooooLKko'],
    [13, 'oKoo........oLKKko'],
    [14, 'oo.........oLKKkko'],
    ...CHAPEU_FIM,
  ]),
  d(0, [
    [19, 'oooooo'],
    [16, 'oooLLLKKKko'],
    [13, 'oooKKoooooooLKko'],
    [13, 'oo..........oLKKko'],
    [25, 'oLKKkko'],
    ...CHAPEU_FIM,
  ]),
];

const CABECA_TOPO: Fila[] = [
  [30, 'oooooooo'],
  [29, 'o33334444o'],
  [29, 'o2333oo444o'],
  [29, 'o23333yo444o'],
  [29, 'o22333333344o'],
];

/** A cabeça: de boca fechada e gargalhando (a cabeça vai para trás). */
const CABECA: Grade[] = [
  d(10, [
    ...CABECA_TOPO,
    [29, 'o1223333233o'],
    [30, 'o1222mtmoo'],
    [30, 'o11222233o'],
    [33, 'oooooo'],
  ]),
  d(10, [
    ...CABECA_TOPO,
    [29, 'o12233mmm3o'],
    [30, 'o122mtmtmo'],
    [30, 'o112mmmm3o'],
    [31, 'oo11222oo'],
    [33, 'ooooo'],
  ]),
];

const TRONCO_CIMA: Fila[] = [
  [30, 'o21o'],
  [27, 'occbbbbbo'],
  [26, 'ocbbbbbbao'],
  [25, 'ocbbbbbbao'],
  [24, 'obbbbbbaao'],
  [23, 'obbbbbbaao'],
  [20, 'oabgggGGggggo'],
  [15, 'oaabbbbcbbbbcbbbaao'],
  [13, 'oaabbbcb5555bbbbbbaao'],
  [12, 'oabbbcbb5656bbbbbbbaao'],
  [12, 'oabbcbbb5555bcbbbbbaao'],
  [13, 'oaabbbbbbbbcbbbbbbaao'],
];

/** O tronco com a saia: a barra rasgada tremula. */
const TRONCO: Grade[] = [
  d(17, [
    ...TRONCO_CIMA,
    [13, 'oaoaaobaaabaaobbaao'],
    [14, 'o.oao.oao..oaao'],
    [16, 'o...o.....oo'],
  ]),
  d(17, [
    ...TRONCO_CIMA,
    [13, 'oaaoaobaabaaaobbaao'],
    [12, 'oo.oao.oaoo.oaao'],
    [12, 'o...o...o....oo'],
  ]),
];

const BRACO_FRENTE = d(18, [
  [29, 'obbo'],
  [29, 'ocbbo'],
  [30, 'ocbbo'],
  [31, 'ocbbo'],
  [32, 'ocbbbo'],
  [32, 'oabbbbbo'],
  [32, 'oaaaaaoo3o'],
  [38, 'o3334o'],
  [38, 'o2o3o'],
  [38, 'o1o2o'],
  [39, 'ooo'],
]);

const BRACO_TRAS = d(19, [
  [33, 'oao'],
  [33, 'oaao'],
  [34, 'oaao'],
  [35, 'oaaao'],
  [36, 'oaaaaao'],
  [37, 'ooooo21o'],
  [42, 'o221o'],
  [42, 'o1o1o'],
  [43, 'ooo'],
]);

const PERNA_FRENTE = d(28, [
  [28, 'oIIo'],
  [28, 'oiio'],
  [28, 'oIIo'],
  [27, 'ouuuuo'],
  [28, 'oguuo...oo'],
  [28, 'oguuggggguo'],
  [28, 'ogggggggggo'],
  [29, 'ooooooooo'],
]);

const PERNA_TRAS = d(29, [
  [23, 'oiio'],
  [23, 'oIio'],
  [22, 'oggggo'],
  [22, 'oggggo..oo'],
  [22, 'ogggggggggo'],
  [23, 'ooooooooo'],
]);

/** A capa ondula em três tempos: a onda corre do ombro para a ponta. */
const CAPA: Grade[] = [
  d(15, [
    [9, 'oooo'],
    [5, 'ooooeeeeoooooooooooo'],
    [3, 'ooeeeeeeeeeeeeeeeeddddeoo'],
    [2, 'oeeeeeddddeeeeeeedddddddeo'],
    [3, 'oFllleeddddddeeeddddddddo'],
    [4, 'oollFlleedddddddddddddo'],
    [6, 'ooollllleeddddddddo'],
    [9, 'oooFllleeddddo'],
    [12, 'ooollleeoo'],
    [15, 'oooo'],
  ]),
  d(15, [
    null,
    [6, 'oooooooooooooooooooo'],
    [3, 'oooeeeeeeeeeeeeeeeddddeoo'],
    [1, 'ooeeeeeddddeeeeeeedddddddeo'],
    [2, 'oFlleeedddddeeeeddddddddo'],
    [4, 'oolFlllleeddddddddddddo'],
    [7, 'ooolllleeeddddddddo'],
    [10, 'ooFllleedddddo'],
    [13, 'ooollleooo'],
    [16, 'ooo'],
  ]),
  d(15, [
    [8, 'ooo'],
    [4, 'oooeeeeooooooooooooo'],
    [2, 'ooeeeeeeeeeeeeeeeeeddddeoo'],
    [2, 'oeeeeddddeeeeeeeedddddddeo'],
    [4, 'oFlleeddddddeeeddddddddo'],
    [5, 'oolFlleeddddddddddddo'],
    [6, 'ooolllllleeddddddddo'],
    [10, 'ooFlllleeddddo'],
    [13, 'oolllleoo'],
    [15, 'oooo'],
  ]),
];

/** O cabelo, solto ao vento, em três tempos. */
const CABELO: Grade[] = [
  d(10, [
    [26, 'ooooo'],
    [21, 'oooooHHhhho'],
    [18, 'oooHHjjHHhhhhho'],
    [16, 'ooHHjHHhhhhjhhhho'],
    [15, 'oHjhhhhHhhhhhhho'],
    [16, 'oohhhjhhhhhhho'],
    [18, 'oohhhhhhhho'],
    [17, 'oohhho.oohho'],
    [16, 'oo..o....oo'],
  ]),
  d(10, [
    [26, 'ooooo'],
    [20, 'ooooooHHhhho'],
    [17, 'oooHHjjHHhhhhhho'],
    [15, 'ooHjjHHhhhhjhhhho'],
    [15, 'ohhhhhHhhhhhhhho'],
    [17, 'oohhjhhhhhhho'],
    [17, 'oohhhhhhhhho'],
    [16, 'oohho..oohho'],
    [15, 'oo..oo...oo'],
  ]),
  d(10, [
    [26, 'ooooo'],
    [21, 'oooooHHhhho'],
    [19, 'ooHHjjHHhhhhho'],
    [16, 'oooHjHHhhhhjhhhho'],
    [14, 'ooHjhhhhHhhhhhhho'],
    [15, 'ohhhhjhhhhhhho'],
    [17, 'ooohhhhhhhho'],
    [18, 'oohho.ohhho'],
    [17, 'oo.....ooo'],
  ]),
];

const PALHA_MEIO: Fila[] = [
  [1, 'oPPPqPPPPPPPoGo'],
  [0, 'oPPpPPPPpPPPPGGo'],
  [1, 'opPPPpPPPPpPPgGo'],
  [0, 'oPPPpPPPPPpPPGGo'],
  [0, 'opppPpppPpppPgGo'],
  [1, 'oppppPpppppppGGo'],
  [0, 'oppwpppppwpppgGo'],
  [1, 'owppwpppwpppoGo'],
];

/** A palha: um leque de fios desenhado à mão; as pontas tremem no vento. */
const PALHA: Grade[] = [
  d(19, [
    [6, 'oo'],
    [3, 'ooooqo'],
    [1, 'ooqqqqqqoo'],
    [0, 'oqqPqqqqPPqoo'],
    ...PALHA_MEIO,
    [0, 'oowpwwpwwpoo'],
    [1, 'oowwoowoo'],
    [3, 'oo..o'],
  ]),
  d(19, [
    [5, 'oo'],
    [2, 'oooooqo'],
    [0, 'ooqqqqqqqoo'],
    [1, 'oqPqqqqPPqoo'],
    ...PALHA_MEIO,
    [1, 'owpwwpwwpoo'],
    [0, 'oowwoowoo'],
    [2, 'oo.o'],
  ]),
];

/** A vara: feita por regra (nós da madeira em lugares fixos) e a ponta torta. */
function vara(): Grade {
  const de = 14, ate = 44;
  const n = ate - de + 1;
  const nos1 = new Set([5, 17, 26]);
  const nos2 = new Set([9, 21]);
  return d(24, [
    [ate + 1, 'oo'],
    [de, 'o'.repeat(n) + 'vWo'],
    [de, Array.from({ length: n }, (_, i) => (nos1.has(i) ? 'W' : 'v')).join('') + 'Wwo'],
    [de, Array.from({ length: n }, (_, i) => (nos2.has(i) ? 'w' : 'W')).join('') + 'wo'],
    [de, 'o'.repeat(n + 2)],
  ]);
}

const BASE: Record<NomeParte, Grade[]> = {
  capa: CAPA,
  cabelo: CABELO,
  bracoTras: [BRACO_TRAS],
  pernaTras: [PERNA_TRAS],
  palha: PALHA,
  vassoura: [vara()],
  tronco: TRONCO,
  pernaFrente: [PERNA_FRENTE],
  cabeca: CABECA,
  chapeu: CHAPEU,
  bracoFrente: [BRACO_FRENTE],
};

/** O topo da cabeça quando o chapéu voou: o cabelo arrepiado. */
const TOPETE = d(7, [
  [31, 'o.o.o'],
  [30, 'ohoHoho'],
  [29, 'ohhHhjhho'],
  [29, 'ohhhhhhhho'],
]);

// ── Enfeites e bruxas ──────────────────────────────────────────────────────

/**
 * Como cada enfeite cai quando a bruxa morre — «cada uma morre do seu jeito»,
 * como os zumbis:
 *
 *   cai     voa girando e quica (cogumelo, óculos, fone)
 *   plana   desce devagar, balançando (crachá, flores)
 *   quebra  cai e estoura no chão com uma poça da cor dele (a poção)
 *   gato    pula fora, cai de pé e foge aos saltos (o gato da Anciã)
 */
export type Solta = 'cai' | 'plana' | 'quebra' | 'gato';

export interface Enfeite extends Grade {
  parte: NomeParte;
  atras?: boolean;
  solta?: Solta;
  /** Só aparece com o chapéu (está nele) ou só sem ele. */
  so?: 'comChapeu' | 'semChapeu';
}

function enfeite(parte: NomeParte, g: Grade, extra: Partial<Enfeite> = {}): Enfeite {
  return { ...g, parte, ...extra };
}

/** O rastro que a vassoura deixa no ar. */
export type Rastro = 'faisca' | 'brasa' | 'poeira' | 'vagalume' | 'estrela' | 'nevoa' | 'petala' | 'moeda';

export interface Bruxa {
  id: string;
  /** Como aparece no painel: «a Bruxa da Lua». */
  nome: string;
  paleta: Paleta;
  enfeites: readonly Enfeite[];
  trocas?: Partial<Record<NomeParte, Grade[]>>;
  rastro: { tipo: Rastro; cores: readonly string[] };
  /** Quem voa junto: some (foge) quando ela cai. */
  companheiro?: 'morcego';
  /** Na morte, além do sangue, voam papéis (os boletos da Bruxa da Cobrança). */
  papeis?: boolean;
}

const COMUM: Paleta = {
  o: '#170f1f', y: '#ffe14d', Y: '#8a6d1f', m: '#2a0812', t: '#efe6cc', n: '#efe6cc',
  r: '#6e0a12', R: '#c8202a',
  v: '#c49563', W: '#8a5e33', w: '#5a3a1e',
  q: '#f6dc8a', P: '#d6aa4a', p: '#a07628',
  G: '#d9a52b', g: '#231a28', u: '#4a3a56',
};

function paleta(...partes: Readonly<Record<string, string>>[]): Paleta {
  return Object.assign({}, COMUM, ...partes);
}

/** O gato preto da Anciã, sentado na palha, de olho na tela. */
const GATO = d(12, [
  [11, 'o..o'],
  [10, 'oXooXo'],
  [10, 'oXxxxo'],
  [10, 'oxZxZxo'],
  [5, 'oo..oxxnxxo'],
  [4, 'oXo..oxxxxo'],
  [4, 'oxo.oXxxxxo'],
  [5, 'oxoXxxxxxxo'],
  [5, 'oXxxxxxxxxxo'],
  [6, 'oooooooooooo'],
]);

export const BRUXAS: readonly Bruxa[] = [
  {
    id: 'classica',
    nome: 'a Bruxa Clássica',
    paleta: paleta({
      1: '#2c4a2a', 2: '#4f8a3a', 3: '#7cbf4a', 4: '#b8e070',
      a: '#2a1840', b: '#4a2c6e', c: '#7048a0',
      d: '#1d1030', e: '#3a2058', l: '#8a1c3c', F: '#c03a5a',
      k: '#1a1222', K: '#33283f', L: '#5e4c74', s: '#7a2a9a',
      h: '#141018', H: '#2e2638', j: '#5a4e6a',
      i: '#1c1424', I: '#8a5ab8', 5: '#5a7a3a', 6: '#c8d890',
      x: '#3a6a2a',
    }),
    enfeites: [
      // A verruga na ponta do nariz.
      enfeite('cabeca', d(14, [[39, 'x']])),
    ],
    rastro: { tipo: 'faisca', cores: ['#9dff5c', '#d4ff9a', '#4fbf2a'] },
  },
  {
    id: 'ruiva',
    nome: 'a Feiticeira Ruiva',
    paleta: paleta({
      1: '#a2564a', 2: '#d48a70', 3: '#f2b896', 4: '#ffe0c8',
      a: '#0c3424', b: '#17573c', c: '#2a8a58',
      d: '#140a10', e: '#2a1a22', l: '#b8862a', F: '#f0c050',
      k: '#2a0e14', K: '#4e1a26', L: '#7e3242', s: '#d9a52b',
      h: '#6a1a0c', H: '#c0401a', j: '#ff8a3a',
      i: '#1a1410', I: '#e8e0d0', 5: '#7e3242', 6: '#f0c050',
      y: '#3aff8a', Y: '#1a8a4a', m: '#7a1a20',
      x: '#3aff6a', X: '#c8ffd0', z: '#8a6a3a',
    }),
    enfeites: [
      // A poção pendurada no cinto.
      enfeite('tronco', d(23, [[31, 'oz'], [30, 'oxxo'], [29, 'oxXxxo'], [29, 'oxxxxo'], [30, 'oooo']]), { solta: 'quebra' }),
      // As sardas.
      enfeite('cabeca', d(14, [[32, '2.2']])),
    ],
    rastro: { tipo: 'brasa', cores: ['#ff8a3a', '#ffd04a', '#ff4a1a'] },
  },
  {
    id: 'ancia',
    nome: 'a Bruxa Anciã',
    paleta: paleta({
      1: '#3e4038', 2: '#62665a', 3: '#8a8e7c', 4: '#b4b8a2',
      a: '#2e2016', b: '#4e3826', c: '#6e5238',
      d: '#1a1410', e: '#2e2420', l: '#4a5a2a', F: '#6e8a3e',
      k: '#2a1e16', K: '#4a3626', L: '#6e5640', s: '#3a5a2a',
      h: '#7a7a84', H: '#b8b8c2', j: '#f0f0f6',
      i: '#2a2420', I: '#6e5a40', 5: '#7a6a3a', 6: '#c8b070',
      y: '#ff7a3a', Y: '#8a3a1a',
      x: '#2a2636', X: '#5a5470', Z: '#ffd030', n: '#e88aa8',
    }),
    enfeites: [
      enfeite('palha', GATO, { solta: 'gato' }),
      // A verruga e as rugas.
      enfeite('cabeca', d(12, [[31, '1'], [38, 'o'], null, [31, '1']])),
      // Remendo no chapéu.
      enfeite('chapeu', d(5, [[26, '56'], [26, '65']])),
    ],
    rastro: { tipo: 'poeira', cores: ['#b4b0a0', '#8a8678', '#d8d4c4'] },
  },
  {
    id: 'pantano',
    nome: 'a Bruxa do Pântano',
    paleta: paleta({
      1: '#1e3a3a', 2: '#2e6a5a', 3: '#4e9a7a', 4: '#8acaa0',
      a: '#1e2412', b: '#3a4222', c: '#5a6232',
      d: '#0e1a12', e: '#1e3022', l: '#4a3a1a', F: '#7a5a2a',
      k: '#142012', K: '#2a3e1e', L: '#4a6a32', s: '#7a4a1e',
      h: '#1a2e12', H: '#3a5a1e', j: '#7aa83a',
      i: '#1a2412', I: '#5a7a2a', 5: '#6a4a2a', 6: '#a07a4a',
      y: '#e0ff40', Y: '#6a7a1a',
      x: '#c8202a', X: '#f0e8d8',
    }),
    enfeites: [
      // O cogumelo crescendo no chapéu.
      enfeite('chapeu', d(2, [[29, 'ooooo'], [28, 'oxXxxxo'], [28, 'oxxxXxo'], [29, 'ooXXo'], [30, 'oXo']]), { solta: 'cai' }),
    ],
    rastro: { tipo: 'vagalume', cores: ['#e0ff40', '#a0ff60', '#fff8a0'] },
  },
  {
    id: 'lua',
    nome: 'a Bruxa da Lua',
    paleta: paleta({
      1: '#2a3a5a', 2: '#4a6a8e', 3: '#7a9ac0', 4: '#b4d0ec',
      a: '#101a40', b: '#1e306a', c: '#34509a',
      d: '#080c20', e: '#141c40', l: '#c8b060', F: '#ffe08a',
      k: '#0e1230', K: '#1e2a5a', L: '#34488a', s: '#ffd34d',
      h: '#5a6a8a', H: '#9aaac8', j: '#e8f0ff',
      i: '#0e1230', I: '#ffd34d', 5: '#34488a', 6: '#ffd34d',
      y: '#9ae8ff', Y: '#3a6a8a',
      x: '#ffd34d', X: '#fff4c0',
    }),
    enfeites: [
      // A lua crescente e as estrelas no chapéu.
      enfeite('chapeu', d(3, [[29, 'X'], null, [27, 'xx'], [26, 'x...X'], [26, 'xx'], [31, 'X']])),
    ],
    rastro: { tipo: 'estrela', cores: ['#ffd34d', '#fff4c0', '#9ae8ff'] },
  },
  {
    id: 'vampira',
    nome: 'a Bruxa Vampira',
    paleta: paleta({
      1: '#6a5a6a', 2: '#a898a8', 3: '#d8cad4', 4: '#f8f0f4',
      a: '#3a0810', b: '#6a1020', c: '#9a1a30',
      d: '#08060c', e: '#141018', l: '#8a0a1a', F: '#d02a3a',
      k: '#0a0810', K: '#1a1420', L: '#2e2638', s: '#b81a2a',
      h: '#0a0a10', H: '#1e1a28', j: '#3a3448',
      i: '#0a0810', I: '#6a1020', 5: '#2a0810', 6: '#9a1a30',
      y: '#ff2a3a', Y: '#7a0a14', m: '#b81a2a', t: '#ffffff',
    }),
    enfeites: [
      // A gola alta da capa, atrás da cabeça.
      enfeite('tronco', d(12, [[27, 'oo'], [26, 'oFo'], [26, 'oFlo'], [26, 'olFo'], [27, 'olo']]), { atras: true }),
    ],
    rastro: { tipo: 'nevoa', cores: ['#b81a2a', '#6a1020', '#ff4a5a'] },
    companheiro: 'morcego',
  },
  {
    id: 'catrina',
    nome: 'a Catrina',
    paleta: paleta({
      1: '#8a8090', 2: '#c8c0cc', 3: '#ece6ee', 4: '#ffffff',
      a: '#3a0e06', b: '#a8401a', c: '#ff8a3a',
      d: '#0e0a10', e: '#1e1620', l: '#6a2a8a', F: '#a04ac8',
      k: '#0e0a10', K: '#1e1620', L: '#3a2e40', s: '#ff8a3a',
      h: '#0a0a10', H: '#1e1a28', j: '#3a3448',
      i: '#0e0a10', I: '#ff8a3a', 5: '#6a2a8a', 6: '#ffd04a',
      y: '#ff5ab4', Y: '#8a2a5a', m: '#170f1f', t: '#ffffff',
      x: '#ff8a1a', X: '#ffd04a', z: '#c8202a', Z: '#3aa04a',
    }),
    enfeites: [
      // O olho fundo da caveira, o nariz e a boca costurada.
      enfeite('cabeca', d(12, [[34, 'oo'], [33, 'o'], [38, 'o'], [34, 'otot']])),
      // As flores de cempasúchil na fita do chapéu.
      enfeite('chapeu', d(6, [[24, 'oXo'], [23, 'oxXxo'], [24, 'oxozo'], [25, 'oZo']]), { solta: 'plana' }),
      // Os desenhos no rosto: pétalas na têmpora.
      enfeite('cabeca', d(11, [[31, 'z'], [30, 'zxz'], [31, 'z']])),
    ],
    rastro: { tipo: 'petala', cores: ['#ff8a1a', '#ffd04a', '#ff5a1a'] },
  },
  {
    id: 'cobranca',
    nome: 'a Bruxa da Cobrança',
    paleta: paleta({
      1: '#3a5a1a', 2: '#5a8a2a', 3: '#8aba3a', 4: '#c4e070',
      a: '#0e3a5a', b: '#1a5a8a', c: '#3a8ac0',
      d: '#0a1420', e: '#14243a', l: '#e8c02a', F: '#fff08a',
      k: '#0e1a2e', K: '#1e3050', L: '#34507a', s: '#e8c02a',
      h: '#2a1a10', H: '#4e3220', j: '#7a5236',
      i: '#0e1a2e', I: '#3a8ac0', 5: '#34507a', 6: '#e8c02a',
      x: '#22202a', X: '#8a8698', z: '#f2f2e8', Z: '#c8202a',
    }),
    enfeites: [
      // O fone de operadora: a concha na orelha e o microfone até a boca.
      enfeite('cabeca', d(13, [[30, 'xX'], [30, 'xx'], [31, 'xxxxX']]), { solta: 'cai' }),
      // O crachá no peito, na fita amarela.
      enfeite('tronco', d(19, [[31, 'l'], [30, 'zz'], [30, 'zZ']]), { solta: 'plana' }),
    ],
    rastro: { tipo: 'moeda', cores: ['#ffd34d', '#fff4c0', '#c8901a'] },
    papeis: true,
  },
];

// ── A animação ─────────────────────────────────────────────────────────────

export type Deslocamento = Partial<Record<NomeParte, readonly [number, number]>>;

export interface Quadro {
  /** Qual variante de cada peça (o que não está aqui usa a 0). */
  v: Partial<Record<NomeParte, number>>;
  desloca: Deslocamento;
  piscando?: boolean;
}

/** Quem monta afunda um pixel junto (a vassoura e as mãos ficam). */
const MONTADA: Deslocamento = { tronco: [0, 1], cabeca: [0, 1], chapeu: [0, 1], cabelo: [0, 1], capa: [0, 1] };

/**
 * O voo: quatro quadros. A capa e o cabelo ondulam (a onda corre para trás),
 * a ponta do chapéu e a barra da saia batem no vento, a palha treme, e quem
 * monta sobe e desce um pixel no ritmo da vassoura.
 */
export const VOO: readonly Quadro[] = [
  { v: {}, desloca: {} },
  { v: { capa: 1, cabelo: 1, chapeu: 1, tronco: 1, palha: 1 }, desloca: MONTADA },
  { v: { capa: 2, cabelo: 2 }, desloca: MONTADA, piscando: true },
  { v: { capa: 1, cabelo: 1, chapeu: 1, tronco: 1, palha: 1 }, desloca: {} },
];
export const MS_POR_QUADRO = 110;

/** Gargalhando: a cabeça vai para trás, a boca abre. Quando ela para no ar. */
export const RINDO: readonly Quadro[] = [
  { v: { cabeca: 1 }, desloca: { cabeca: [0, -1], chapeu: [0, -1], cabelo: [0, -1] } },
  { v: { cabeca: 1, capa: 1, cabelo: 1, chapeu: 1, tronco: 1, palha: 1 }, desloca: {} },
];

/** Todos os quadros numa lista: o número é o que o tiro e a queda usam. 0–3 voo, 4–5 rindo. */
export const QUADROS: readonly Quadro[] = [...VOO, ...RINDO];
export const PRIMEIRO_RINDO = VOO.length;

// ── A montagem ─────────────────────────────────────────────────────────────

export const NUMERO_DA_PARTE: Readonly<Record<NomeParte, number>> = {
  capa: 1, cabelo: 2, bracoTras: 3, pernaTras: 4, palha: 5, vassoura: 6,
  tronco: 7, pernaFrente: 8, cabeca: 9, chapeu: 10, bracoFrente: 11,
};
export const PARTE_DO_NUMERO: readonly (NomeParte | null)[] = [null, ...ORDEM.slice().sort((a, b) => NUMERO_DA_PARTE[a] - NUMERO_DA_PARTE[b])];

/** O que um tiro em cada peça faz. */
export type Alvo = 'cabeca' | 'corpo' | 'vassoura' | 'chapeu' | 'raspao';
export function alvoDaParte(p: NomeParte): Alvo {
  if (p === 'cabeca') return 'cabeca';
  if (p === 'chapeu') return 'chapeu';
  if (p === 'vassoura' || p === 'palha') return 'vassoura';
  if (p === 'capa' || p === 'cabelo') return 'raspao';
  return 'corpo';
}

export interface Imagem {
  largura: number;
  altura: number;
  cores: (string | null)[];
  /** Em que peça cada pixel está (`NUMERO_DA_PARTE`), 0 = nenhuma. */
  partes: Uint8Array;
}

export function imagemVazia(largura = LARGURA, altura = ALTURA): Imagem {
  return { largura, altura, cores: new Array(largura * altura).fill(null), partes: new Uint8Array(largura * altura) };
}

function pintar(img: Imagem, g: Grade, pal: Paleta, parte: number, dx: number, dy: number, troca?: (l: string) => string): void {
  g.linhas.forEach((linha, j) => {
    for (let i = 0; i < linha.length; i++) {
      let letra = linha[i];
      if (letra === '.') continue;
      if (troca) letra = troca(letra);
      const x = g.x + dx + i, y = g.y + dy + j;
      if (x < 0 || y < 0 || x >= img.largura || y >= img.altura) continue;
      const cor = pal[letra];
      if (!cor) continue;
      img.cores[y * img.largura + x] = cor;
      img.partes[y * img.largura + x] = parte;
    }
  });
}

export function gradeDa(b: Bruxa, parte: NomeParte, variante = 0): Grade {
  const vs = b.trocas?.[parte] ?? BASE[parte];
  return vs[variante % vs.length];
}

export interface OpcoesMontar {
  /** Só as peças que passarem. */
  quais?: (p: NomeParte) => boolean;
  /** O chapéu já voou (tiro no chapéu): aparece o topete. */
  semChapeu?: boolean;
  /** Olho apagado. */
  morta?: boolean;
  /** Enfeites que não entram (os que se soltaram). */
  sem?: (e: Enfeite) => boolean;
}

function enfeiteVale(e: Enfeite, o: OpcoesMontar): boolean {
  if (o.sem?.(e)) return false;
  if (e.so === 'comChapeu' && o.semChapeu) return false;
  if (e.so === 'semChapeu' && !o.semChapeu) return false;
  // Enfeite do chapéu vai junto com ele.
  if (e.parte === 'chapeu' && o.semChapeu) return false;
  return true;
}

export function montarQuadro(b: Bruxa, quadro: Quadro | number, o: OpcoesMontar = {}): Imagem {
  const q = typeof quadro === 'number' ? QUADROS[((quadro % QUADROS.length) + QUADROS.length) % QUADROS.length] : quadro;
  const img = imagemVazia();
  const pal: Paleta = q.piscando ? { ...b.paleta, y: b.paleta.Y } : b.paleta;
  const troca = o.morta ? (l: string) => (l === 'y' ? 'o' : l) : undefined;
  for (const parte of ORDEM) {
    if (o.quais && !o.quais(parte)) continue;
    if (parte === 'chapeu' && o.semChapeu) continue;
    const [dx, dy] = q.desloca[parte] ?? [0, 0];
    const n = NUMERO_DA_PARTE[parte];
    for (const e of b.enfeites) if (e.parte === parte && e.atras && enfeiteVale(e, o)) pintar(img, e, pal, n, dx, dy);
    pintar(img, gradeDa(b, parte, q.v[parte] ?? 0), pal, n, dx, dy, troca);
    if (parte === 'cabeca' && o.semChapeu) pintar(img, TOPETE, pal, n, dx, dy);
    for (const e of b.enfeites) if (e.parte === parte && !e.atras && enfeiteVale(e, o)) pintar(img, e, pal, n, dx, dy);
  }
  return img;
}

/** Um enfeite sozinho, onde ele estava no quadro (o que se solta na queda). */
export function montarEnfeite(b: Bruxa, quadro: number, e: Enfeite): Imagem {
  const q = QUADROS[((quadro % QUADROS.length) + QUADROS.length) % QUADROS.length];
  const img = imagemVazia();
  const [dx, dy] = q.desloca[e.parte] ?? [0, 0];
  pintar(img, e, b.paleta, NUMERO_DA_PARTE[e.parte], dx, dy);
  return img;
}

/**
 * Em que peça caiu o tiro: o pixel exato e, se for fundo, o vizinho mais perto
 * (um pixel de tolerância, como nos zumbis). 0 = errou.
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

// ── As juntas (para a queda) ───────────────────────────────────────────────

/**
 * Os pontos do boneco de juntas, no sprite parado (quadro 0). Na queda cada
 * ponto vira uma partícula, e cada peça é desenhada entre duas delas.
 */
export const JUNTAS = {
  cabeca: [34, 13],
  pescoco: [31, 17],
  quadril: [25, 24],
  ombroF: [30, 19],
  maoF: [40, 26],
  ombroT: [34, 20],
  maoT: [44, 26],
  joelhoF: [29, 28],
  peF: [33, 34],
  joelhoT: [24, 29],
  peT: [26, 33],
} as const satisfies Record<string, readonly [number, number]>;
export type Junta = keyof typeof JUNTAS;

/** Cada peça do boneco: quais partes do sprite, e entre que juntas ela vai. Na ordem de pintura. */
export const OSSOS: readonly { nome: string; partes: readonly NomeParte[]; de: Junta; para: Junta }[] = [
  { nome: 'bracoT', partes: ['bracoTras'], de: 'ombroT', para: 'maoT' },
  { nome: 'pernaT', partes: ['pernaTras'], de: 'joelhoT', para: 'peT' },
  { nome: 'tronco', partes: ['capa', 'tronco'], de: 'pescoco', para: 'quadril' },
  { nome: 'pernaF', partes: ['pernaFrente'], de: 'joelhoF', para: 'peF' },
  { nome: 'cabeca', partes: ['cabelo', 'cabeca'], de: 'pescoco', para: 'cabeca' },
  { nome: 'bracoF', partes: ['bracoFrente'], de: 'ombroF', para: 'maoF' },
];

/** A bruxa da rodada: o número do banco, ou a semente. */
export function bruxaDaRodada(r: { bruxa?: number | null; semente: number }): Bruxa {
  const n = BRUXAS.length;
  const i = r.bruxa != null && Number.isFinite(r.bruxa) ? r.bruxa : Math.abs(r.semente);
  return BRUXAS[((i % n) + n) % n];
}

// ── Quem voa junto e o que voa na queda ────────────────────────────────────

/** Um desenho pequeno com paleta própria (o morcego, o boleto). */
export interface Miniatura { linhas: readonly string[]; cores: Readonly<Record<string, string>> }

/** O morcego da Vampira: asas em cima e embaixo. */
export const MORCEGO: readonly Miniatura[] = [
  {
    linhas: [
      'o.........o',
      'xo.......ox',
      'xxo.o.o.oxx',
      '.xxoxxxoxx.',
      '..oxRxRxo..',
      '...ooxoo...',
    ],
    cores: { o: '#120c18', x: '#3a2e48', R: '#ff2a3a' },
  },
  {
    linhas: [
      '....o.o....',
      '...oxxxo...',
      '..oxRxRxo..',
      '.oxxxxxxxo.',
      'oxxo.o.oxxo',
      'oo.......oo',
    ],
    cores: { o: '#120c18', x: '#3a2e48', R: '#ff2a3a' },
  },
];

/** O boleto que voa da Bruxa da Cobrança. */
export const BOLETO: Miniatura = {
  linhas: ['ooooo', 'ozzzo', 'oZZzo', 'ozzzo', 'oZZZo', 'ozzzo', 'ooooo'],
  cores: { o: '#5a5a68', z: '#f6f6ee', Z: '#2a2a34' },
};
