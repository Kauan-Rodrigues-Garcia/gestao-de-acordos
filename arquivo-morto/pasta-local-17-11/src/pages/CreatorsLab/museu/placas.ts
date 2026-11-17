/**
 * placas.ts — as artes refeitas para o Museu, em mapa de pixels.
 * ─────────────────────────────────────────────────────────────────────────────
 * Nem toda sala tem arte da época que dê para trazer: o desenho do mascote, do
 * Modo TV ou do tema de Halloween morava junto de código que lê o banco, ou
 * dependia de contexto que não existe mais. Para essas salas a arte é uma
 * PLACA feita para o Museu — e a sala diz isso na tela («reconstituição»), para
 * ninguém tomar a placa pelo desenho original.
 *
 * As salas com arte da época (os zumbis, as bruxas, os bichinhos, o Cavalo da
 * Guerra) não passam por aqui: usam o próprio sprite, em `museu/artes/`.
 *
 * Cada placa é uma grade de 14×14, um caractere por pixel, com `.` apagado e
 * uma letra por cor. O teste confere a medida e que toda letra tem cor.
 */

export const LADO_PLACA = 14;

export interface Placa {
  mapa: string[];
  /** Letra → cor. */
  paleta: Record<string, string>;
}

export type IdPlaca =
  | 'pet' | 'comemoracoes' | 'colchao' | 'ouvidoria' | 'modo-tv'
  | 'halloween' | 'pesquisa' | 'cavalos' | 'sirene' | 'natal';

export const PLACAS: Record<IdPlaca, Placa> = {
  pet: {
    paleta: { L: '#B79CFF', P: '#FF9ED2', K: '#2A1B4A', R: '#FF7FBF' },
    mapa: [
      '..LL......LL..',
      '..LP......PL..',
      '..LP......PL..',
      '..LP......PL..',
      '..LLLLLLLLLL..',
      '.LLLLLLLLLLLL.',
      '.LLKLLLLLLKLL.',
      '.LLLLLLLLLLLL.',
      '.LLLLLPPLLLLL.',
      '.LLRLLLLLLRLL.',
      '..LLLLLLLLLL..',
      '...LLLLLLLL...',
      '...LL....LL...',
      '..............',
    ],
  },
  comemoracoes: {
    paleta: { R: '#FF4D6D', W: '#FFD6DE', K: '#555555', Y: '#FFD23F', G: '#3DDC97', B: '#4D9DFF' },
    mapa: [
      '.Y...RRR....B.',
      '....RRRRR.G...',
      '.G..RRWRR....Y',
      '....RRRRR.....',
      '..B..RRR...R..',
      '......R.......',
      '.Y....K....G..',
      '......K.......',
      '..R...K...B...',
      '.....K........',
      '.G...K.....Y..',
      '....K.........',
      '..B.K....R....',
      '..............',
    ],
  },
  colchao: {
    paleta: { K: '#3A3A3A', T: '#0A6F66', G: '#9A9A9A' },
    mapa: [
      'KKKKKKKKKKKKKK',
      'KTTTTTTTTTTTTK',
      'KKKKKKKKKKKKKK',
      'K.GGGG..GGG..K',
      'K............K',
      'K.GGG...GGGG.K',
      'K............K',
      'K.GGGGG.GG...K',
      'K............K',
      'K.GG....GGGG.K',
      'K............K',
      'KKKKKKKKKKKKKK',
      'K.....TTTTTT.K',
      'KKKKKKKKKKKKKK',
    ],
  },
  ouvidoria: {
    paleta: { K: '#3A3A3A', W: '#F4F2EC', B: '#4D7BD6' },
    mapa: [
      '..............',
      '.KKKKKKKKKKKK.',
      '.KWWWWWWWWWWK.',
      '.KWBBBBBBBWWK.',
      '.KWWWWWWWWWWK.',
      '.KWBBBBBWWWWK.',
      '.KWWWWWWWWWWK.',
      '.KWBBBBBBBBWK.',
      '.KWWWWWWWWWWK.',
      '.KKKKKKWWKKKK.',
      '......KWWK....',
      '......KWK.....',
      '......KK......',
      '..............',
    ],
  },
  'modo-tv': {
    paleta: { K: '#2B2B2B', B: '#16355C', Y: '#FFD23F', G: '#3DDC97' },
    mapa: [
      '...K......K...',
      '....K....K....',
      '.....K..K.....',
      '.KKKKKKKKKKKK.',
      '.KBBBBBBBBBBK.',
      '.KBBBYYBBBBBK.',
      '.KBBYYYYBBGBK.',
      '.KBBBYYBBGGBK.',
      '.KBBBBBBGGGBK.',
      '.KBBBBBBBBBBK.',
      '.KKKKKKKKKKKK.',
      '.....KKKK.....',
      '...KKKKKKKK...',
      '..............',
    ],
  },
  halloween: {
    paleta: { O: '#FF7A1A', K: '#2A1200', G: '#3E8E41' },
    mapa: [
      '......GG......',
      '.....GG.......',
      '...OOOOOOOO...',
      '..OOOOOOOOOO..',
      '.OOOOOOOOOOOO.',
      '.OOKKOOOOKKOO.',
      '.OOKKOOOOKKOO.',
      '.OOOOOKKOOOOO.',
      '.OOOOOOOOOOOO.',
      '.OOKOKOKOKOOO.',
      '.OOKKKKKKKKOO.',
      '..OOOOOOOOOO..',
      '...OOOOOOOO...',
      '..............',
    ],
  },
  pesquisa: {
    paleta: { Y: '#FFD23F', K: '#4A3200' },
    mapa: [
      '....YYYYYY....',
      '..YYYYYYYYYY..',
      '.YYYYYYYYYYYY.',
      '.YYKKYYYYKKYY.',
      'YYYKKYYYYKKYYY',
      'YYYYYYYYYYYYYY',
      'YYYYYYYYYYYYYY',
      'YYKYYYYYYYYKYY',
      'YYYKYYYYYYKYYY',
      '.YYYKKKKKKYYY.',
      '.YYYYYYYYYYYY.',
      '..YYYYYYYYYY..',
      '....YYYYYY....',
      '..............',
    ],
  },
  cavalos: {
    paleta: { K: '#2B1A0E', B: '#A8703A' },
    mapa: [
      '......KK......',
      '.....KBBK.K...',
      '....KBBBBKBK..',
      '...KBBBBBBBK..',
      '..KBBKBBBBBK..',
      '.KBBBBBBBBBK..',
      '.KBBBBBBBBBK..',
      '.KBBKKBBBBBK..',
      '..KK.KBBBBBK..',
      '.....KBBBBBK..',
      '....KBBBBBBK..',
      '...KBBBBBBBBK.',
      '...KKKKKKKKKK.',
      '..............',
    ],
  },
  sirene: {
    paleta: { R: '#E5262B', W: '#FFB3B5', Y: '#FFD23F', K: '#333333' },
    mapa: [
      '......RR......',
      '.Y...RRRR...Y.',
      '..Y.RRRRRR.Y..',
      '....RRWRRR....',
      'YY..RRWRRR..YY',
      '....RRWRRR....',
      '....RRRRRR....',
      '....RRRRRR....',
      '....RRRRRR....',
      '..KKKKKKKKKK..',
      '..KKKKKKKKKK..',
      '.KKKKKKKKKKKK.',
      '..............',
      '..............',
    ],
  },
  natal: {
    paleta: { G: '#1F8A4C', Y: '#FFD23F', R: '#E5262B', B: '#4D9DFF', T: '#6B4423' },
    mapa: [
      '......YY......',
      '......YY......',
      '.....GGGG.....',
      '....GGRGGG....',
      '...GGGGGGGG...',
      '....GGGGBG....',
      '...GGYGGGGG...',
      '..GGGGGGGGGG..',
      '...GGGGRGGG...',
      '..GGBGGGGGGG..',
      '.GGGGGGGGYGGG.',
      '......TT......',
      '......TT......',
      '..............',
    ],
  },
};

/** As faixas horizontais de uma placa: pixels vizinhos da mesma cor viram um retângulo. */
export function faixasDaPlaca(p: Placa): { x: number; y: number; l: number; cor: string }[] {
  const faixas: { x: number; y: number; l: number; cor: string }[] = [];
  p.mapa.forEach((linha, y) => {
    let inicio = 0;
    for (let x = 1; x <= linha.length; x++) {
      if (linha[x] === linha[inicio]) continue;
      const cor = p.paleta[linha[inicio]];
      if (cor) faixas.push({ x: inicio, y, l: x - inicio, cor });
      inicio = x;
    }
  });
  return faixas;
}
