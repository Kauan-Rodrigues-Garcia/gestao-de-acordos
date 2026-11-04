/**
 * arte.ts — as cores da Coisa, o balão vermelho, o barquinho de papel e a
 * letrinha das placas de Derry. O palhaço em si é montado por partes em
 * `desenho.ts` (os quadros da dança).
 *
 * As cores saem das fotos dos filmes (27/10/2026): a cara de giz rachada, o
 * risco e a boca vermelho-sangue, os olhos amarelos, o cabelo ruivo-cobre, a
 * gola creme envelhecida e a roupa cinza-azulada, com os pompons laranja.
 * Na fúria, a roupa escurece (a do segundo filme) e as luzes mortas acendem
 * nos olhos e na boca, com o fogo atrás.
 */
import { ALTURA_DA_COISA, FIM_DA_CABECA, LARGURA_DA_COISA, QUADROS } from './desenho';

export type Paleta = Readonly<Record<string, string>>;

export const PALETA_DA_COISA: Paleta = {
  o: '#0b0a10',
  // A cara de giz, a sombra fria e a das rugas.
  w: '#efece4', W: '#c3bdb3', s: '#837b74',
  // O risco, a boca, os dentes, o nariz.
  r: '#a8101a', R: '#5e050b', m: '#2a0407', t: '#e9dca6', n: '#5a0d14',
  // Os olhos amarelos.
  y: '#f2c23a', Y: '#6e4606',
  // O cabelo ruivo-cobre.
  h: '#b8521f', H: '#6f2c12', j: '#de7f3e',
  // A gola de babado, creme envelhecido.
  c: '#e3dbc6', C: '#b2a68b', D: '#7a6f58',
  // A roupa cinza-azulada, o brilho, as dobras, o cinto.
  g: '#93a5b3', G: '#617482', l: '#c0ced8', K: '#3a4752', k: '#2a333c',
  // Os pompons e o sapato.
  p: '#e3562a', P: '#8c2a12',
  u: '#c9a467', U: '#7a5c2c',
};

/**
 * Na fúria (pouca vida) as luzes mortas acendem: os olhos e a boca viram
 * laranja de fogo, e a roupa fica a escura. A cor do olho é única: a cena acha
 * os pixels por ela.
 */
export const COR_DA_LUZ = '#ffb43a';
export const PALETA_DA_FURIA: Paleta = {
  ...PALETA_DA_COISA,
  y: COR_DA_LUZ, Y: '#ff6a10', m: '#ff8a1e', t: '#fff1b0',
  w: '#efd9c4', W: '#c4a58c',
  g: '#3c424b', G: '#272b32', l: '#59616c', K: '#16181c', k: '#101114',
  c: '#bfb39a', C: '#8a7e66',
};

/** O palhaço parado, com o balão (o quadro 0). */
export const COISA = QUADROS[0].linhas;
export { ALTURA_DA_COISA, FIM_DA_CABECA, LARGURA_DA_COISA };
/** A mão que segura o balão (a da esquerda de quem olha). */
export const MAO_DO_BALAO: readonly [number, number] = QUADROS[0].mao ?? [7, 61];

// ── O balão e o barquinho ───────────────────────────────────────────────────

export const PALETA_DO_BALAO: Paleta = { o: '#2a0306', b: '#d9121c', B: '#7e070e', l: '#ff8f8a' };

export const BALAO: readonly string[] = [
  '....oooo....',
  '..oobbbboo..',
  '.obblbbbbbo.',
  'obbllbbbbbbo',
  'obblbbbbbbbo',
  'obbbbbbbbbBo',
  'obbbbbbbbbBo',
  'obbbbbbbbBBo',
  '.obbbbbbbBo.',
  '.obbbbbbBBo.',
  '..obbbbBBo..',
  '...obbBBo...',
  '....oBBo....',
  '.....oo.....',
  '....oBBo....',
];

export const PALETA_DO_BARCO: Paleta = { o: '#2b2a24', W: '#b8ad86', w: '#ebe3c1' };

export const BARCO: readonly string[] = [
  '....o.....',
  '...oWo....',
  '..oWwWo...',
  'oooooooooo',
  '.owwwwwwo.',
  '..oooooo..',
];

// ── A letrinha (3 × 5) das placas ───────────────────────────────────────────

const LETRAS: Readonly<Record<string, string>> = {
  A: '.#.#.#####.##.#', B: '##.#.###.#.###.', D: '##.#.##.##.###.', E: '####..##.#..###',
  I: '###.#..#..#.###', M: '#.#####.##.##.#', N: '##.#.##.##.##.#', O: '####.##.##.####',
  R: '##.#.###.#.##.#', S: '####..###..####', V: '#.##.##.##.#.#.', Y: '#.##.#.#..#..#.',
  '-': '......###......', '+': '....#.###.#....', ' ': '...............',
  0: '####.##.##.####', 1: '.#.##..#..#.###', 2: '###..#####..###', 3: '###..####..####',
  4: '#.##.####..#..#', 5: '####..###..####', 6: '####..####.####', 7: '###..#..#..#..#',
  8: '####.#####.####', 9: '####.####..####',
};
/** Os pontos acesos de uma letra, linha a linha (3 × 5). */
export function letra(ch: string): string {
  return LETRAS[ch] ?? LETRAS[' '];
}

/** Escreve `texto` com a letrinha: `pintar(x, y)` em cada ponto aceso. */
export function escrever(texto: string, x0: number, y0: number, pintar: (x: number, y: number) => void): number {
  let x = x0;
  for (const ch of texto.toUpperCase()) {
    const l = letra(ch);
    for (let i = 0; i < 15; i++) if (l[i] === '#') pintar(x + (i % 3), y0 + Math.floor(i / 3));
    x += 4;
  }
  return x - x0 - 1;
}
