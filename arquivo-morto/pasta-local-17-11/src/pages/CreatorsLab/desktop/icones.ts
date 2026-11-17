/**
 * icones.ts — os desenhos dos programas, em mapa de pixels.
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada ícone é uma grade de 12×12 escrita à mão, um caractere por pixel. Vira
 * um `<svg>` de retângulos com `shape-rendering: crispEdges`, pintado com
 * `currentColor` — a cor, a placa em volta e a sombra são do tema, e ficam no
 * CSS (`data-icones`). Aqui mora só o desenho.
 *
 * Por que mapa de pixels e não uma biblioteca de ícones: o Lab não instala
 * dependência nova, e um desenho de 144 pixels é mais fácil de corrigir num
 * editor de texto do que um `path` de SVG.
 *
 * Para criar um ícone: doze linhas de doze caracteres, `#` aceso e `.` apagado.
 * O teste confere a medida.
 */
export type IdIcone =
  | 'terminal' | 'fliperama' | 'criadores' | 'projetos' | 'playground'
  | 'mathlab' | 'conquistas' | 'descobridores' | 'configuracoes' | 'desligar'
  | 'museu' | 'arquivo';

export const LADO_ICONE = 12;

export const MAPAS: Record<IdIcone, string[]> = {
  terminal: [
    '############',
    '#..........#',
    '#.#........#',
    '#..#.......#',
    '#...#......#',
    '#..#.......#',
    '#.#...####.#',
    '#..........#',
    '#..........#',
    '############',
    '............',
    '............',
  ],
  fliperama: [
    '....####....',
    '...######...',
    '...######...',
    '....####....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.##########.',
    '############',
    '############',
    '.##########.',
  ],
  criadores: [
    '............',
    '.####.......',
    '######......',
    '############',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '#..........#',
    '############',
    '............',
  ],
  projetos: [
    '###########.',
    '#.#......#.#',
    '#.#......#.#',
    '#.#......#.#',
    '#.########.#',
    '#..........#',
    '#..######..#',
    '#..#...#.#.#',
    '#..#...#.#.#',
    '#..#...#.#.#',
    '############',
    '............',
  ],
  playground: [
    '............',
    '...#....#...',
    '..#......#..',
    '.#...##...#.',
    '#....##....#',
    '.#..##....#.',
    '..#.##...#..',
    '...##...#...',
    '...##.......',
    '............',
    '............',
    '............',
  ],
  mathlab: [
    '...........#',
    '..........##',
    '.........#.#',
    '........#..#',
    '.......#...#',
    '......#....#',
    '.....#.....#',
    '....#......#',
    '...#.......#',
    '..#......###',
    '.#.......#.#',
    '############',
  ],
  conquistas: [
    '.##########.',
    '###......###',
    '#.#......#.#',
    '#.#......#.#',
    '.##......##.',
    '..#......#..',
    '...#....#...',
    '....####....',
    '.....##.....',
    '.....##.....',
    '...######...',
    '..########..',
  ],
  descobridores: [
    '.....##.....',
    '.....##.....',
    '....####....',
    '############',
    '.##########.',
    '..########..',
    '...######...',
    '..###..###..',
    '..##....##..',
    '.##......##.',
    '.#........#.',
    '............',
  ],
  configuracoes: [
    '............',
    '..###.......',
    '###.########',
    '..###.......',
    '............',
    '.......###..',
    '#######.####',
    '.......###..',
    '............',
    '....###.....',
    '#####.######',
    '....###.....',
  ],
  desligar: [
    '.....##.....',
    '.....##.....',
    '..##.##.##..',
    '.##..##..##.',
    '##...##...##',
    '##...##...##',
    '##........##',
    '##........##',
    '.##......##.',
    '..###..###..',
    '...######...',
    '....####....',
  ],
  museu: [
    '.....##.....',
    '....####....',
    '..########..',
    '############',
    '.##..##..##.',
    '.##..##..##.',
    '.##..##..##.',
    '.##..##..##.',
    '.##..##..##.',
    '############',
    '############',
    '............',
  ],
  arquivo: [
    '.#######....',
    '.#.....##...',
    '.#.....#.#..',
    '.#.....####.',
    '.#........#.',
    '.#.######.#.',
    '.#........#.',
    '.#.######.#.',
    '.#........#.',
    '.#.####...#.',
    '.#........#.',
    '.##########.',
  ],
};

/**
 * Junta os pixels acesos de cada linha em faixas horizontais.
 *
 * Um retângulo por faixa em vez de um por pixel: o mesmo desenho, com um terço
 * dos nós no DOM. Exportada para o teste conferir que nenhum pixel se perde.
 */
export function faixasDoMapa(mapa: string[]): { x: number; y: number; l: number }[] {
  const faixas: { x: number; y: number; l: number }[] = [];
  mapa.forEach((linha, y) => {
    let inicio = -1;
    for (let x = 0; x <= linha.length; x++) {
      const aceso = linha[x] === '#';
      if (aceso && inicio < 0) inicio = x;
      if (!aceso && inicio >= 0) { faixas.push({ x: inicio, y, l: x - inicio }); inicio = -1; }
    }
  });
  return faixas;
}
