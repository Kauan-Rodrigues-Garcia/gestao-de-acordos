/**
 * figurinos.ts — os personagens que não usam o corpo da bruxa comum.
 *
 * Cada um troca peças inteiras (`trocas` em `arte.ts`): a cabeça grande da
 * bruxinha fofa, a gatinha, o gato e a fantasminha. As peças seguem as mesmas
 * regras do resto: grade de letras em x ABSOLUTO por linha, contorno `o`
 * escrito à mão, luz do alto à esquerda, virado para a direita, a vassoura no
 * mesmo lugar (y 24–27) para a mão de todo mundo cair nela.
 */
import type { Grade } from './arte';

type Fila = readonly [number, string] | null;

/** Uma grade escrita em x ABSOLUTO por linha: `[x, '...']`; `null` pula a linha. */
function d(y: number, filas: readonly Fila[]): Grade {
  const xs = filas.filter((f): f is readonly [number, string] => !!f).map(f => f[0]);
  const x0 = Math.min(...xs);
  return { x: x0, y, linhas: filas.map(f => (f ? '.'.repeat(f[0] - x0) + f[1] : '')) };
}

/** Peça sem pixel nenhum: o personagem não tem aquela parte. */
export const NADA: Grade = { x: 0, y: 0, linhas: [] };

// ── A bruxinha fofa (chibi) ────────────────────────────────────────────────
//
// Cabeça grande, franja, olhos enormes com brilho, bochecha rosada, chapelão
// com fita. Corpinho pequeno sentado na vassoura, perninhas balançando.

const CHAPELAO_ABA: Fila[] = [
  [22, 'oLLKKKKKKKKKKKko'],
  [21, 'ossssssssssssssGGso'],
  [16, 'ooooooLLLKKKKKKKKKKKKKKKkooooooo'],
  [15, 'oLLLLLLLLKKKKKKKKKKKKKKKKKKkkkkko'],
  [16, 'oooooooooooooooooooooooooooooooo'],
];

export const CHAPELAO: Grade[] = [
  d(0, [
    [26, 'oooo'],
    [24, 'ooLLKKoo'],
    [20, 'ooooLLKKKKko'],
    [18, 'ooLLKoooLLKKKKko'],
    [17, 'oLKko..oLLKKKKKKko'],
    [18, 'oo...oLLKKKKKKKKko'],
    ...CHAPELAO_ABA,
  ]),
  d(0, [
    [26, 'oooo'],
    [24, 'ooLLKKoo'],
    [16, 'ooooooooLLKKKKko'],
    [15, 'oLLKKKKooLLKKKKko'],
    [16, 'oooo...oLLKKKKKKko'],
    [23, 'oLLKKKKKKKKko'],
    ...CHAPELAO_ABA,
  ]),
];

/** A cabeça grande: franja, dois olhos enormes, bochecha e boquinha. */
const CABECONA_TOPO: Fila[] = [
  [20, 'ohhhhHHHHHHHHHHHHhhhhho'],
  [19, 'ohhHHHjjHHHHHHHHjjHHHhhho'],
  [19, 'ohHHHHHHHHHHHHHHHHHHHHhho'],
  [19, 'ohHH33HHH333HHHH333HHHhho'],
  [19, 'ohH33333ooo3333ooo3333Hho'],
  [19, 'ohH33333nyy3333nyy3333Hho'],
  [19, 'ohH33333yyy3333yyy3333Hho'],
  [19, 'ohH3333xXyX3333XyXx333Hho'],
];

export const CABECONA: Grade[] = [
  d(11, [
    ...CABECONA_TOPO,
    [19, 'ohH23xx3333mm3333xx32Hho'],
    [20, 'oh2233333333333333322ho'],
    [21, 'oo22333333333333322oo'],
    [23, 'ooooooooooooooooo'],
  ]),
  // Rindo: a boquinha abre.
  d(11, [
    ...CABECONA_TOPO,
    [19, 'ohH23xx333ommo333xx32Hho'],
    [20, 'oh223333333mm333333322ho'],
    [21, 'oo22333333333333322oo'],
    [23, 'ooooooooooooooooo'],
  ]),
];

/** Os cachos roxos, soltos ao vento atrás da cabeça. */
export const CACHOS: Grade[] = [
  d(12, [
    [16, 'oooo'],
    [12, 'ooooHHHho'],
    [10, 'ooHHjjHhhho'],
    [9, 'ohHHHHhhhhho'],
    [10, 'oohhhhhhhho'],
    [12, 'oohhhhhho'],
    [11, 'ohhho.ohho'],
    [10, 'oho...oho'],
    [10, 'oo....oo'],
  ]),
  d(12, [
    [16, 'oooo'],
    [11, 'oooooHHHo'],
    [9, 'ooHHjjHHhho'],
    [9, 'ohHHHHhhhhho'],
    [11, 'oohhhhhhhho'],
    [11, 'oohhhhhhho'],
    [12, 'ohhho.oho'],
    [11, 'oho..oho'],
    [12, 'o....oo'],
  ]),
  d(12, [
    [16, 'oooo'],
    [12, 'ooooHHHho'],
    [11, 'oHHjjHhhhho'],
    [10, 'ohHHHHhhhhho'],
    [9, 'oohhhhhhhhho'],
    [11, 'oohhhhhhho'],
    [10, 'ohhho.ohho'],
    [9, 'oho...oo'],
    [9, 'oo'],
  ]),
];

/** O vestidinho: gola de fita, saia rodada sobre a vassoura, babado. */
const VESTIDINHO_CIMA: Fila[] = [
  [28, 'ozzzzzo'],
  [26, 'oabbzbbbao'],
  [25, 'oabbbbbbbbao'],
  [24, 'oabbbbbbbbbbao'],
  [23, 'oabbbcbbbbcbbbao'],
  [22, 'oaabbbbbbbbbbbbbao'],
];

export const VESTIDINHO: Grade[] = [
  d(22, [
    ...VESTIDINHO_CIMA,
    [22, 'oaoabbaoabbaoabbao'],
    [23, 'o.o..o..o..o..oo'],
  ]),
  d(22, [
    ...VESTIDINHO_CIMA,
    [22, 'oabaoabbaoabbaobao'],
    [22, 'oo.o..o..o..o..o'],
  ]),
];

export const BRACINHO_FRENTE: Grade = d(23, [
  [35, 'oboo'],
  [36, 'obbo3o'],
  [37, 'ooo334o'],
  [40, 'o23o'],
  [40, 'ooo'],
]);

export const BRACINHO_TRAS: Grade = d(22, [
  [43, 'ooo'],
  [42, 'o21o'],
  [42, 'o11o'],
]);

export const PERNINHA_FRENTE: Grade = d(29, [
  [30, 'oIIo'],
  [30, 'oiio'],
  [30, 'oIIo'],
  [30, 'oiio'],
  [29, 'oguuo'],
  [29, 'oggggggo'],
  [30, 'oooooo'],
]);

export const PERNINHA_TRAS: Grade = d(29, [
  [26, 'oiio'],
  [26, 'oIIo'],
  [26, 'oiio'],
  [25, 'ogguo'],
  [25, 'oggggo'],
  [26, 'ooooo'],
]);

/** A capinha curta, batendo atrás das costas. */
export const CAPINHA: Grade[] = [
  d(22, [
    [21, 'oooooo'],
    [17, 'oooooeeeeeo'],
    [15, 'ooeeeeeddddddo'],
    [15, 'olleeedddddddo'],
    [16, 'ooFlleedddddo'],
    [18, 'ooollleddo'],
    [21, 'oooooo'],
  ]),
  d(22, [
    [21, 'oooooo'],
    [16, 'ooooooeeeeeo'],
    [14, 'ooeeeeeedddddo'],
    [15, 'oFlleeddddddo'],
    [16, 'oollleeddddo'],
    [19, 'oolllddo'],
    [21, 'ooooo'],
  ]),
  d(22, [
    [21, 'oooooo'],
    [18, 'ooooeeeeeo'],
    [15, 'oooeeeeddddddo'],
    [14, 'oFllleedddddddo'],
    [15, 'ooolFlleddddo'],
    [18, 'ooolllddo'],
    [21, 'oooo'],
  ]),
];

/** As juntas da bruxinha: cabeça grande, corpo curto. */
export const JUNTAS_CHIBI = {
  cabeca: [31, 16],
  pescoco: [31, 22],
  quadril: [30, 27],
  ombroF: [35, 23],
  maoF: [41, 25],
  ombroT: [38, 23],
  maoT: [43, 23],
  joelhoF: [31, 30],
  peF: [32, 34],
  joelhoT: [27, 30],
  peT: [27, 33],
} as const;

// ── A gatinha e o gato ─────────────────────────────────────────────────────
//
// A mesma cabeça redonda de gato (orelha de pé, bigode), em pelo branco ou
// preto. O olho é `y`: preto e redondo na gatinha, amarelo no gato. O nariz é
// `z`. O chapeuzinho fica de lado, em cima da orelha de trás.

const r = (c: string, n: number) => c.repeat(n);

/**
 * As duas orelhas (Cleber, 14/10/2026: «coloque mais uma orelha»). A da
 * esquerda nasce debaixo do chapeuzinho e desponta à esquerda do cone,
 * inclinada para fora; a parte de baixo dela fica atrás da aba.
 */
const CABECA_GATO_FILAS = (olho: string): Fila[] => [
  [18, 'oo'],
  [18, 'o44o' + r('.', 16) + 'oo'],
  [18, 'o4xx4o' + r('.', 13) + 'o44o'],
  [18, 'o44xx44o' + r('.', 10) + 'o4xx4o'],
  [18, 'o4444444o' + r('.', 8) + 'o44xx44o'],
  [19, 'o444444o' + r('.', 7) + 'o44444444o'],
  [19, '..' + r('o', 15) + r('4', 5) + 'o..'],
  [19, '.o' + r('4', 19) + '33' + 'o.'],
  [19, 'o' + r('4', 20) + '333' + 'o'],
  [19, 'o' + r('4', 20) + '333' + 'o'],
  [19, 'o' + r('4', 19) + '3333' + 'o'],
  [19, 'o' + r('4', 7) + olho + r('4', 5) + olho + r('4', 4) + '333' + 'o'],
  [19, 'o' + r('4', 7) + olho + r('4', 5) + olho + r('4', 4) + '333' + 'o'],
  [19, 'o' + r('4', 7) + olho + r('4', 5) + olho + r('4', 4) + '332' + 'o'],
  [19, 'o' + r('4', 11) + 'zz' + r('4', 7) + '332' + 'o'],
  [19, 'o' + r('4', 19) + '3322' + 'o'],
  [19, '.o' + '33' + r('4', 15) + '33' + '22' + 'o.'],
  [19, '..o' + '22' + r('3', 15) + '22' + 'o..'],
  [19, '....' + r('o', 17) + '....'],
];

/** A cabeça de gato: de boca fechada, e «rindo» (olhinho fechado de alegria). */
export const CABECA_GATO: Grade[] = [
  d(4, CABECA_GATO_FILAS('yy')),
  // As linhas 11 e 13 são as do olho (a 0 é a ponta da orelha da esquerda, em y 4).
  d(4, CABECA_GATO_FILAS('oo').map((f, i) => (i === 11 || i === 13 ? [19, 'o' + r('4', 27 - 20) + '44' + r('4', 5) + '44' + r('4', 4) + '333' + 'o'] as const : f))),
];

/** Os bigodes, para fora da cara. */
export const BIGODES: Grade = d(16, [
  [13, 'TTTTT' + r('.', 26) + 'TTTT'],
  null,
  [14, 'TTTT' + r('.', 26) + 'TTTTT'],
]);

/** A flor de laço na orelha da gatinha. */
export const FLOR: Grade = d(4, [
  [41, 'ooo'],
  [40, 'oxXxo'],
  [39, 'oxXnXxo'],
  [39, 'oxXXXxo'],
  [40, 'oxXxo'],
  [41, 'ooo'],
]);

/** O chapeuzinho de lado, a ponta enrolada para a frente. */
export const CHAPEUZINHO: Grade[] = [
  d(0, [
    [33, 'ooo'],
    [30, 'oooKKo'],
    [27, 'oooLKKoo'],
    [25, 'ooLLKKKo'],
    [24, 'oLLKKKKko'],
    [23, 'oLLKKKKKko'],
    [22, 'oLLKKKKKKko'],
    [21, 'oLLKKKKKKKko'],
    [17, 'ooooossssssssGsoooo'],
    [16, 'oLLLLLLLKKKKKKKKKkkko'],
    [17, 'oooooooooooooooooooo'],
  ]),
  d(0, [
    [34, 'oo'],
    [31, 'oooKo'],
    [28, 'ooLLKKoo'],
    [25, 'oooLLKKKo'],
    [24, 'oLLKKKKko'],
    [23, 'oLLKKKKKko'],
    [22, 'oLLKKKKKKko'],
    [21, 'oLLKKKKKKKko'],
    [17, 'ooooossssssssGsoooo'],
    [16, 'oLLLLLLLKKKKKKKKKkkko'],
    [17, 'oooooooooooooooooooo'],
  ]),
];

/** A estrela no chapeuzinho. */
export const ESTRELA: Grade = d(4, [[27, 'G'], [26, 'GGG'], [27, 'G']]);

/** O rabo, balançando atrás (no lugar do cabelo). */
export const RABO: Grade[] = [
  d(14, [
    [13, 'ooo'],
    [12, 'o443o'],
    [12, 'o43o'],
    [13, 'o43o'],
    [14, 'o433oo'],
    [15, 'oo3333oo'],
    [17, 'oo3333o'],
    [19, 'oooo'],
  ]),
  d(14, [
    null,
    [11, 'ooo'],
    [10, 'o443ooo'],
    [11, 'oo4333o'],
    [13, 'oo433oo'],
    [15, 'oo3333oo'],
    [17, 'oo3333o'],
    [19, 'oooo'],
  ]),
  d(14, [
    null,
    null,
    [11, 'oooo'],
    [10, 'o4433oo'],
    [11, 'oo44333oo'],
    [14, 'ooo3333o'],
    [17, 'oo3333o'],
    [19, 'oooo'],
  ]),
];

// ── A fantasminha ──────────────────────────────────────────────────────────
//
// Um lençol de chapéu. Não tem perna: a barra do lençol cobre a vassoura, e a
// ponta dele ondula para trás no lugar da capa.

const r4 = (n: number) => r('4', n);

/**
 * O alto da cabeça: uma cúpula, em degraus de 2 e 1 pixel, com a luz à
 * esquerda e a sombra (3) do lado direito. Era uma caixa de cantos retos
 * (Cleber, 14/10/2026: «a cabeça está quadrada»).
 */
const CUPULA: Fila[] = [
  [26, r('o', 11)],
  [23, 'ooo' + r4(10) + '3ooo'],
  [21, 'oo' + r4(14) + '333oo'],
  [20, 'o' + r4(18) + '333o'],
];

/**
 * A emenda com o lençol: a mesma primeira linha dele (`LENCOL_CIMA`). Parada,
 * cai em cima dela e não muda nada; na gargalhada a cabeça sobe 1 pixel e
 * ela tapa a risca que abria entre a cabeça e o corpo.
 */
const EMENDA: Fila = [19, 'o' + '2233' + r4(13) + '332222' + 'o'];

export const CABECA_FANTASMA: Grade[] = [
  d(10, [
    ...CUPULA,
    [19, 'o' + r4(7) + 'oo' + r4(5) + 'oo' + r4(4) + '333' + 'o'],
    [19, 'o' + r4(7) + 'oo' + r4(5) + 'oo' + r4(4) + '333' + 'o'],
    [19, 'o' + r4(7) + 'oo' + r4(5) + 'oo' + r4(4) + '332' + 'o'],
    [19, 'o' + r4(5) + 'xx' + r4(3) + 'mmm' + r4(3) + 'xx' + r4(3) + '332' + 'o'],
    [19, 'o' + r4(10) + 'mtm' + r4(6) + '3322' + 'o'],
    [19, 'o' + r4(19) + '3322' + 'o'],
    [19, 'o' + '33' + r4(17) + '3322' + 'o'],
    [19, 'o' + '233' + r4(15) + '33222' + 'o'],
    EMENDA,
  ]),
  d(10, [
    ...CUPULA,
    [19, 'o' + r4(7) + 'oo' + r4(5) + 'oo' + r4(4) + '333' + 'o'],
    [19, 'o' + r4(6) + 'o44o' + r4(3) + 'o44o' + r4(3) + '333' + 'o'],
    [19, 'o' + r4(23) + 'o'],
    [19, 'o' + r4(5) + 'xx' + r4(2) + 'mmmmm' + r4(2) + 'xx' + r4(3) + '332' + 'o'],
    [19, 'o' + r4(9) + 'mtttm' + r4(5) + '3322' + 'o'],
    [19, 'o' + r4(10) + 'mmm' + r4(6) + '3322' + 'o'],
    [19, 'o' + '33' + r4(17) + '3322' + 'o'],
    [19, 'o' + '233' + r4(15) + '33222' + 'o'],
    EMENDA,
  ]),
];

/** O corpo do lençol: desce sobre a vassoura e termina em ondas. */
const LENCOL_CIMA: Fila[] = [
  [19, 'o' + '2233' + r4(13) + '332222' + 'o'],
  [20, 'o' + '2233' + r4(11) + '33222' + 'o'],
  [20, 'o' + '22333' + r4(9) + '333222' + 'o'],
  [20, 'o' + '122333' + r4(7) + '3332221' + 'o'],
  [20, 'o' + '1222333' + r4(5) + '33322211' + 'o'],
  [20, 'o' + '11222333333333222211' + 'o'],
];

export const LENCOL: Grade[] = [
  d(22, [
    ...LENCOL_CIMA,
    [20, 'o1o12o2223o3322o211o'],
    [20, 'o.o.oo.ooo.ooooo.oo'],
  ]),
  d(22, [
    ...LENCOL_CIMA,
    [20, 'o12o122o333o222o21o'],
    [20, 'oo.o.oo..ooo.ooo.o'],
  ]),
];

/** A ponta do lençol, ondulando para trás (no lugar da capa). */
export const PONTA_LENCOL: Grade[] = [
  d(19, [
    [17, 'ooo'],
    [12, 'ooooo333o'],
    [8, 'oooo44443333o'],
    [6, 'oo4444443332o'],
    [7, 'oo33333322o'],
    [9, 'oooo2222o'],
    [13, 'oooo'],
  ]),
  d(19, [
    null,
    [11, 'oooooo33o'],
    [7, 'oooo444443333o'],
    [5, 'oo44444433322o'],
    [6, 'oo333333222o'],
    [8, 'ooooo222oo'],
    [13, 'ooo'],
  ]),
  d(19, [
    [16, 'oooo'],
    [12, 'oooo4333o'],
    [9, 'ooo4444333o'],
    [7, 'oo444443332o'],
    [6, 'oo3333333222o'],
    [7, 'oooo22222oo'],
    [11, 'ooooo'],
  ]),
];

export const BRACINHO_LENCOL: Grade = d(23, [
  [37, 'oo'],
  [37, 'o43o'],
  [38, 'o433o'],
  [39, 'o32o'],
  [40, 'oo'],
]);

// ── A bruxa feiosa ─────────────────────────────────────────────────────────
//
// Narigão adunco com verruga, sobrancelha brava, olho arregalado, queixo para
// a frente e dente torto. Usa o corpo da bruxa comum.

const FEIOSA_TOPO: Fila[] = [
  [30, 'oooooooo'],
  [29, 'o3q334444o'],
  [29, 'o23oooo444o'],
  [29, 'o23nno44444o'],
  [29, 'o2233334444oo'],
  [29, 'o12233333444444oo'],
  [29, 'o1223333o22344q44o'],
];

export const CABECA_FEIOSA: Grade[] = [
  d(10, [
    ...FEIOSA_TOPO,
    [29, 'o11223tmtoo.oo234o'],
    [30, 'o112223o.....oooo'],
    [31, 'o1122223o'],
    [32, 'ooooooo'],
  ]),
  d(10, [
    ...FEIOSA_TOPO,
    [29, 'o1122mmmmmo..o234o'],
    [30, 'o112mtmtmo...oooo'],
    [31, 'o11mmm23o'],
    [32, 'ooooooo'],
  ]),
];

/** A fivela grande na fita do chapéu. */
export const FIVELA: Grade = d(7, [[30, 'GGGG'], [30, 'GssG'], [30, 'GGGG']]);
