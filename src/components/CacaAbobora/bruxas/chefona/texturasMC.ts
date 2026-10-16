/**
 * texturasMC.ts — as texturas do Minecraft (Java 1.21.10), tiradas do jogo
 * instalado no computador do Kauan em 15/10/2026, a pedido dele («pode puxar
 * para itens e detalhes»). Gerado por script: cada letra é uma cor da textura
 * original de 16 × 16; `.` é transparente. Não edite à mão: gere de novo.
 *
 * As texturas (e os sons em `public/sons/minecraft/`) são da Mojang; o Kauan
 * escolheu usar os originais sabendo disso (15/10/2026).
 */
import type { Item } from './arte';

export const TOTEM_MC: Item = {
  nome: "Totem da Imortalidade",
  linhas: [
    '................',
    '.....AAAAAA.....',
    '....ABBBBBBA....',
    '....CBDDEEBC....',
    '....CFFEBFFC....',
    '....CDGFFDGC....',
    '....CGHDEGHC....',
    '....CIFEBFIC....',
    '.AAAACIBBICAAAA.',
    '.ABFCBFIIFICIFC.',
    '..CCAEDEBBFACC..',
    '....ABFFFFIC....',
    '....CAAAAAAC....',
    '.....CFIIIC.....',
    '.....CFIIFC.....',
    '......CCCC......',
  ],
  cores: {"A": "#a05b23", "B": "#eadb84", "C": "#85400f", "D": "#fdfbee", "E": "#f8eea5", "F": "#d1a75d", "G": "#41e67f", "H": "#00bb46", "I": "#c58742"},
};

export const PEROLA_MC: Item = {
  nome: "Pérola do Ender",
  linhas: [
    '................',
    '................',
    '.......AAA......',
    '.....AABBCAA....',
    '....ABBCDDCCE...',
    '...ABCFGHHDDCE..',
    '...ABFGIIIHHDE..',
    '..ABCGIEEEIHHDE.',
    '..EBDHIEEEIHCDE.',
    '..ECDHIEEEIHBDE.',
    '...ECHHIIIHGBE..',
    '...ECDHHHHGFDE..',
    '....EJDHCBBDE...',
    '.....EEDDDEE....',
    '.......EEE......',
    '................',
  ],
  cores: {"A": "#0c3730", "B": "#349988", "C": "#258474", "D": "#105e51", "E": "#032620", "F": "#8cf4e2", "G": "#2ccdb1", "H": "#0b4d42", "I": "#063931", "J": "#1b7b6b"},
};

export const TEIA_MC: Item = {
  nome: "Teia",
  linhas: [
    'A.......B......A',
    '.B....ACBCA...B.',
    '..CABA..B..B.B..',
    '...C...BA...C...',
    '...AB.BA.C.C.B..',
    '..A..C.B..C...C.',
    '..C.A.BC.B.C..A.',
    'ACCBCBBBC...B..A',
    '.A..B..CBBCCACBA',
    '..A..ACB.A..B..C',
    '..B..C.B..B.B.C.',
    '...C.B.C.ABB..A.',
    '...AC.ACA...CA..',
    '..B..BC...ACBC..',
    '.B....ACCA....B.',
    'A.....B........A',
  ],
  cores: {"A": "#c4ced2", "B": "#ffffff", "C": "#e4e9e9"},
};

export const GARRAFA_VAZIA_MC: Item = {
  nome: "Garrafa de Vidro",
  linhas: [
    '................',
    '................',
    '.......AAB......',
    '......CDDDE.....',
    '......EBBFE.....',
    '.......E.G......',
    '.......E.G......',
    '......C...G.....',
    '.....C.E...G....',
    '....C.E.....G...',
    '....C.E.....G...',
    '....E.....H.G...',
    '....G.....H.G...',
    '.....G...H.G....',
    '......GGGGG.....',
    '................',
  ],
  cores: {"A": "#d46d49", "B": "#a94725", "C": "#d4e5f7", "D": "#ccafa5", "E": "#b3cfec", "F": "#973716", "G": "#5d8fc2", "H": "#8badd0"},
};

export const GLOWSTONE_MC: Item = {
  nome: "Pó de Glowstone",
  linhas: [
    '................',
    '................',
    '................',
    '.......AA.......',
    '......ABCA......',
    '.....ACDCEF.....',
    '....ACDCBDEF....',
    '...ACCCDCEAEF...',
    '..ABDCBEDBEDGF..',
    '..ACBCDCBEEAEF..',
    '..FECDEBEBEEGF..',
    '...FECBEAEEBF...',
    '....FFGEEGFF....',
    '......FFFF......',
    '................',
    '................',
  ],
  cores: {"A": "#7e4821", "B": "#ebaa4e", "C": "#ffbc5e", "D": "#f9d49c", "E": "#b47140", "F": "#5a391c", "G": "#8e562e"},
};

export const REDSTONE_MC: Item = {
  nome: "Pó de Redstone",
  linhas: [
    '................',
    '................',
    '................',
    '.......AA.......',
    '......ABCA......',
    '.....ACDCEF.....',
    '....ACDCBDEF....',
    '...ACCCDCEAEF...',
    '..ABDCBEDBECGF..',
    '..ACBCDCBEEAEF..',
    '..FECDCBECEEGF..',
    '...FECBEAEEGF...',
    '....FFGEEGFF....',
    '......FFFF......',
    '................',
    '................',
  ],
  cores: {"A": "#5c0700", "B": "#720000", "C": "#aa0f01", "D": "#ff0000", "E": "#410500", "F": "#2d0000", "G": "#340605"},
};

export const OLHO_MC: Item = {
  nome: "Olho de Aranha",
  linhas: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......AABB......',
    '.....ACDCAE.....',
    '.....BFGCHE.....',
    '.....BCCAHE.....',
    '.....BAHHBE.....',
    '......EEEEBE....',
    '.........BAE....',
    '........BCHE....',
    '........EHE.....',
    '.........E......',
    '................',
  ],
  cores: {"A": "#7b0d27", "B": "#550222", "C": "#9d1e2d", "D": "#e0c9cc", "E": "#2a0010", "F": "#e0aeb4", "G": "#c45f6b", "H": "#65062b"},
};

export const ACUCAR_MC: Item = {
  nome: "Açúcar",
  linhas: [
    '................',
    '................',
    '................',
    '.......AA.......',
    '......ABCA......',
    '.....ACCCDE.....',
    '....ACCCBCDE....',
    '...ACCCCCDADE...',
    '..ABCCBDCBDCAE..',
    '..ACBCCCBDDADE..',
    '..EDCCCBDCDDAE..',
    '...EDCBDADDAE...',
    '....EEADDAEE....',
    '......EEEE......',
    '................',
    '................',
  ],
  cores: {"A": "#b9b9cb", "B": "#eaeaea", "C": "#ffffff", "D": "#d5d5df", "E": "#545468"},
};

export const POLVORA_MC: Item = {
  nome: "Pólvora",
  linhas: [
    '................',
    '................',
    '................',
    '.......AA.......',
    '......ABCA......',
    '.....ACDCEF.....',
    '....ACDCBDEF....',
    '...ACCCDCEAEF...',
    '..ABDCBEDBECGF..',
    '..ACBCDCBEEAEF..',
    '..FECDCBECEEGF..',
    '...FECBEAEEGF...',
    '....FFGEEGFF....',
    '......FFFF......',
    '................',
    '................',
  ],
  cores: {"A": "#505050", "B": "#545454", "C": "#727272", "D": "#8a8a8a", "E": "#494949", "F": "#2d2d2d", "G": "#3e3e3e"},
};

export const GRAVETO_MC: Item = {
  nome: "Graveto",
  linhas: [
    '................',
    '................',
    '.............AB.',
    '............ACB.',
    '...........ACB..',
    '..........ADB...',
    '.........ACB....',
    '........ADB.....',
    '.......ACB......',
    '......ADB.......',
    '.....ACB........',
    '....ADB.........',
    '...ACB..........',
    '..ACB...........',
    '..BB............',
    '................',
  ],
  cores: {"A": "#493615", "B": "#281e0b", "C": "#896727", "D": "#684e1e"},
};

/**
 * A garrafa de poção: letra é o vidro e a rolha; dígito é o líquido, no
 * cinza do `potion_overlay` (a cor da poção multiplica, como no jogo).
 */
export const POCAO_MC: readonly string[] = [
  '................',
  '................',
  '.......AAB......',
  '......CDDDE.....',
  '......EBBFE.....',
  '.......E.G......',
  '.......E.G......',
  '......C...G.....',
  '.....C1E223G....',
  '....C3E14423G...',
  '....C2E15442G...',
  '....E24464H7G...',
  '....G32472H3G...',
  '.....G322H3G....',
  '......GGGGG.....',
  '................',
];

export const VIDRO_MC: Readonly<Record<string, string>> = {"A": "#d46d49", "B": "#a94725", "C": "#d4e5f7", "D": "#ccafa5", "E": "#b3cfec", "F": "#973716", "G": "#5d8fc2", "H": "#8badd0"};

export const CINZA_DO_LIQUIDO_MC: Readonly<Record<string, number>> = {"1": 255, "2": 154, "3": 99, "4": 197, "5": 170, "6": 148, "7": 166};

/** As bolinhas de XP, da menor para a maior (quadros 0, 1, 2 e 4 da folha), em cinza: o jogo pinta na hora. */
export const ORBES_MC: readonly { linhas: readonly string[]; cinzas: Readonly<Record<string, number>> }[] = [
  { linhas: [".AAAAAA.", "AABBBBAA", "ABBCCBBA", "ABCDDCBA", "ABCDDCBA", "ABBCCBBA", "AABBBBAA", ".AAAAAA."], cinzas: {"A": 112, "B": 160, "C": 193, "D": 255} },
  { linhas: ["..AAAAAA..", ".ABBBBBBA.", "ABBCCCCBBA", "ABCCDDCCBA", "ABCDDDDCBA", "ABCDDDDCBA", "ABCCDDCCBA", "ABBCCCCBBA", ".ABBBBBBA.", "..AAAAAA.."], cinzas: {"A": 112, "B": 160, "C": 193, "D": 255} },
  { linhas: ["...AAAAAA...", "..ABBBBBBA..", ".ABCCCCCCBA.", "ABCCCCCCCCBA", "ABCCDDDDCCBA", "ABCCDDDDCCBA", "ABCCDDDDCCBA", "ABCCDDDDCCBA", "ABCCCCCCCCBA", ".ABCCCCCCBA.", "..ABBBBBBA..", "...AAAAAA..."], cinzas: {"A": 112, "B": 160, "C": 193, "D": 255} },
  { linhas: ["...AAAAAA...", "..ABBCCBBA..", ".ABCDDDDCBA.", "ABCDDDDDDCBA", "ABDDDDDDDDBA", "ACDDDDDDDDCA", "ACDDDDDDDDCA", "ABDDDDDDDDBA", "ABCDDDDDDCBA", ".ABCDDDDCBA.", "..ABBCCBBA..", "...AAAAAA..."], cinzas: {"A": 112, "B": 160, "C": 193, "D": 255} },
];
