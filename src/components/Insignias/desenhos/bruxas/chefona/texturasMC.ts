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

// ── A mesa de encantamento (o feitiço forte) ──

export const MESA_TOPO_MC: Item = {
  nome: "Mesa de Encantamento (tampo)",
  linhas: [
    'ABBCDDDDDDDDCBBA',
    'BEEFGHHHHHHGFEEB',
    'BEEFGHHHHHHGFEEB',
    'CFFGHHHIIHHHGFFC',
    'DGGHHIJJJJIHHGGD',
    'DHHHIJJJJJJIHHHD',
    'DHHHJJJJJJJJHHHD',
    'DHHIJJJJJJJJIHHD',
    'DHHIJJJJJJJJIHHD',
    'DHHHJJJJJJJJHHHD',
    'DHHHIJJJJJJIHHHD',
    'DGGHHIJJJJIHHGGD',
    'CFFGHHHIIHHHGFFC',
    'BEEFGHHHHHHGFEEB',
    'BEEFGHHHHHHGFEEB',
    'ABBCDDDDDDDDCBBA',
  ],
  cores: {"A": "#ffffff", "B": "#c3fbf1", "C": "#2ccdb1", "D": "#6b002f", "E": "#a2f6e7", "F": "#4aedd1", "G": "#7f0728", "H": "#a22929", "I": "#741d32", "J": "#58162c"},
};

export const MESA_LADO_MC: Item = {
  nome: "Mesa de Encantamento (lado)",
  linhas: [
    '................',
    '................',
    '................',
    '................',
    'ABBCDDDDDDDDCBBA',
    'BEEFDGHHHHGDFEEB',
    'BEEFIDHHHHDIFEEB',
    'CFFJIIDHHDIIJFFC',
    'IIJKJJIDDLJJKJJJ',
    'KJIIJLKKJLIJLJLL',
    'JLLILLLJLLIIJLIK',
    'IJLLJILJLMMKJJJJ',
    'LMMJIJJJKMJLJMJL',
    'KKJLLLIJJJLLLIKL',
    'IKLLJLKLLJJILIIL',
    'JLIJILJKJILLLLLL',
  ],
  cores: {"A": "#ffffff", "B": "#c3fbf1", "C": "#2ccdb1", "D": "#6b002f", "E": "#a2f6e7", "F": "#4aedd1", "G": "#7f0728", "H": "#a22929", "I": "#000001", "J": "#100c1c", "K": "#271e3d", "L": "#06030b", "M": "#3b2754"},
};

export const ESTANTE_MC: Item = {
  nome: "Estante de Livros",
  linhas: [
    'ABBCCDCCCBBBBCBA',
    'AEEEFFEEEFFGHIEA',
    'AFJJKKJJJLMJNIFA',
    'CKPPQKJJRSTKNIUC',
    'VQPPQKNERLMKNIUV',
    'AQPWQPNRXLRPNHUA',
    'AKWJKPIXFMRPIHYB',
    'CAZZVVVZAAZZZAAC',
    'ACCBBDBCCBBBCCDA',
    'AFFGGFXaFEGFFGEA',
    'AQKFNIRXKJJXaJFA',
    'CSTYNIRXKQERXUYD',
    'VQKYNIbcPQKRXSTV',
    'AQPYNHbcFKQRXUYA',
    'BKPdIHXXdPKXaYIA',
    'AZZVVVZAAZZZZAAA',
  ],
  cores: {"A": "#b38c51", "B": "#9f844d", "C": "#9b7742", "D": "#7c623e", "E": "#2c2213", "F": "#362a15", "G": "#271e11", "H": "#315b8e", "I": "#2a4e7a", "J": "#41311a", "K": "#911111", "L": "#a89b0a", "M": "#897e08", "N": "#3163a3", "P": "#773007", "Q": "#bc1616", "R": "#758e11", "S": "#b5b5b5", "T": "#898989", "U": "#118e6b", "V": "#cca66c", "W": "#632805", "X": "#5e720d", "Y": "#0c6b50", "Z": "#bc9862", "a": "#556809", "b": "#494949", "c": "#3f3f3f", "d": "#695433"},
};

/** O livro da mesa: a capa (6 × 10) e a página (5 × 8), recortadas da textura do modelo. */
export const LIVRO_CAPA_MC: Item = {
  nome: "Livro (capa)",
  linhas: [
    'ABBBBC',
    'DDDCCC',
    'DCCCCC',
    'CCCCCC',
    'CCCCCC',
    'CCCCCC',
    'CCCCCC',
    'DCCCCC',
    'DDDCCC',
    'ABBBBC',
  ],
  cores: {"A": "#ffd800", "B": "#a76e2d", "C": "#774e22", "D": "#875622"},
};

export const LIVRO_PAGINA_MC: Item = {
  nome: "Livro (página)",
  linhas: [
    'AAAAA',
    'BCACC',
    'CBCCC',
    'AAAAA',
    'CCACB',
    'CAAAA',
    'BBCCC',
    'CCAAC',
  ],
  cores: {"A": "#f4e9bf", "B": "#c4b78b", "C": "#dfd3a6"},
};

// ── A conquista: a moldura de desafio e as caixas da tela de conquistas do jogo ──

export const MOLDURA_DESAFIO_MC: Item = {
  nome: "Moldura de desafio",
  linhas: [
    '.AAA..................AAA.',
    'ABBBAA....AAAAAA....AABBCA',
    'ABDDBBAAAABBBBBBAAAABBDDEA',
    'ABDDDDBBBBDDDDDDBBBBDDDDEA',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '..ABDDDDDDDDDDDDDDDDDDEA..',
    '..ABDDDDDDDDDDDDDDDDDDEA..',
    '..ABDDDDDDDDDDDDDDDDDDEA..',
    '..ABDDDDDDDDDDDDDDDDDDEA..',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '..ABDDDDDDDDDDDDDDDDDDEA..',
    '..ABDDDDDDDDDDDDDDDDDDEA..',
    '..ABDDDDDDDDDDDDDDDDDDEA..',
    '..ABDDDDDDDDDDDDDDDDDDEA..',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    '.ABDDDDDDDDDDDDDDDDDDDDEA.',
    'ABDDDDEEEEDDDDDDEEEEDDDDEA',
    'ABDDEEAAAAEEEEEEAAAAEEDDEA',
    'ACEEAA....AAAAAA....AAEEEA',
    '.AAA..................AAA.',
  ],
  cores: {"A": "#000000", "B": "#dba213", "C": "#b98f2c", "D": "#aa7e0f", "E": "#493606"},
};

export const BARRA_CONQUISTA_MC: Item = {
  nome: "Barra da conquista (obtida)",
  linhas: [
    '........................................................................................................................................................................................................',
    '........................................................................................................................................................................................................',
    '........................................................................................................................................................................................................',
    '..AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA..',
    '.ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA.',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCDA',
    '.ADDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDA.',
    '..AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA..',
    '........................................................................................................................................................................................................',
    '........................................................................................................................................................................................................',
    '........................................................................................................................................................................................................',
  ],
  cores: {"A": "#000000", "B": "#dba213", "C": "#b98f2c", "D": "#493606"},
};

export const CAIXA_CONQUISTA_MC: Item = {
  nome: "Caixa da descrição",
  linhas: [
    '........................................................................................................................................................................................................',
    '........................................................................................................................................................................................................',
    '........................................................................................................................................................................................................',
    '..AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA..',
    '.ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA.',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    'ABCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCBA',
    '.ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA.',
    '..AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA..',
    '........................................................................................................................................................................................................',
    '........................................................................................................................................................................................................',
    '........................................................................................................................................................................................................',
  ],
  cores: {"A": "#000000", "B": "#555555", "C": "#212121"},
};

// ── Os corações (9 × 9) da barra de vida: os do modo hardcore, de chefe ──

export const CORACAO_VAZIO_MC: Item = {
  nome: "Coração (vazio)",
  linhas: [
    '..AA.AA..',
    '.ABBABBA.',
    'ABBBBBBBA',
    'ABBBBBBBA',
    'ABBBBBBBA',
    '.ABBBBBA.',
    '..ABBBA..',
    '...ABA...',
    '....A....',
  ],
  cores: {"A": "#000000", "B": "#282828"},
};

export const CORACAO_VAZIO_PISCA_MC: Item = {
  nome: "Coração (vazio, piscando)",
  linhas: [
    '..AA.AA..',
    '.ABBABBA.',
    'ABBBBBBBA',
    'ABBBBBBBA',
    'ABBBBBBBA',
    '.ABBBBBA.',
    '..ABBBA..',
    '...ABA...',
    '....A....',
  ],
  cores: {"A": "#ffffff", "B": "#282828"},
};

export const CORACAO_CHEIO_MC: Item = {
  nome: "Coração",
  linhas: [
    '.........',
    '..AA.AA..',
    '.ABAAABA.',
    '.ABBABBA.',
    '.CABABAC.',
    '..CAAAC..',
    '...CAC...',
    '....C....',
    '.........',
  ],
  cores: {"A": "#ff1313", "B": "#600707", "C": "#bb1313"},
};

export const CORACAO_METADE_MC: Item = {
  nome: "Meio coração",
  linhas: [
    '.........',
    '..AA.....',
    '.ABAA....',
    '.ABBA....',
    '.CABA....',
    '..CAA....',
    '...CA....',
    '....C....',
    '.........',
  ],
  cores: {"A": "#ff1313", "B": "#600707", "C": "#bb1313"},
};

export const CORACAO_CHEIO_PISCA_MC: Item = {
  nome: "Coração (piscando)",
  linhas: [
    '.........',
    '..AA.AA..',
    '.ABAAABA.',
    '.ABBABBA.',
    '.CABABAC.',
    '..CAAAC..',
    '...CAC...',
    '....C....',
    '.........',
  ],
  cores: {"A": "#ffa1a1", "B": "#b78f8f", "C": "#dea1a1"},
};

export const CORACAO_METADE_PISCA_MC: Item = {
  nome: "Meio coração (piscando)",
  linhas: [
    '.........',
    '..AA.....',
    '.ABAA....',
    '.ABBA....',
    '.CABA....',
    '..CAA....',
    '...CA....',
    '....C....',
    '.........',
  ],
  cores: {"A": "#ffa1a1", "B": "#b78f8f", "C": "#dea1a1"},
};

export const CORACAO_OURO_MC: Item = {
  nome: "Coração de Absorção",
  linhas: [
    '.........',
    '..AA.AA..',
    '.ABAAAAA.',
    '.ACDAAAA.',
    '.EACAAAE.',
    '..EAAAE..',
    '...EAE...',
    '....E....',
    '.........',
  ],
  cores: {"A": "#d4af37", "B": "#d0bf89", "C": "#beae77", "D": "#c7b780", "E": "#d4a200"},
};

export const CORACAO_OURO_METADE_MC: Item = {
  nome: "Meio coração de Absorção",
  linhas: [
    '.........',
    '..AA.....',
    '.ABAA....',
    '.ACDA....',
    '.EACA....',
    '..EAA....',
    '...EA....',
    '....E....',
    '.........',
  ],
  cores: {"A": "#d4af37", "B": "#d0bf89", "C": "#beae77", "D": "#c7b780", "E": "#d4a200"},
};

export const CORACAO_CURA_MC: Item = {
  nome: "Coração (a cura chegando)",
  linhas: [
    '.........',
    '..AA.AA..',
    '.ABAAAAA.',
    '.AAAAAAA.',
    '.CAAAAAC.',
    '..CAAAC..',
    '...CAC...',
    '....C....',
    '.........',
  ],
  cores: {"A": "#ffa1a1", "B": "#ffe3e3", "C": "#dea1a1"},
};

export const CORACAO_SECO_MC: Item = {
  nome: "Coração (fúria)",
  linhas: [
    '.........',
    '..AA.AA..',
    '.ABCACDA.',
    '.EDFCGDH.',
    '.IJKCDJI.',
    '..IJCJI..',
    '...IJI...',
    '....I....',
    '.........',
  ],
  cores: {"A": "#3b1313", "B": "#cbcbcb", "C": "#2b2b2b", "D": "#9d9d9d", "E": "#2f0f0f", "F": "#b5b5b5", "G": "#b4b4b4", "H": "#2c0e0e", "I": "#2a0e0e", "J": "#202020", "K": "#9c9c9c"},
};

export const CORACAO_SECO_METADE_MC: Item = {
  nome: "Meio coração (fúria)",
  linhas: [
    '.........',
    '..AA.....',
    '.ABCA....',
    '.DEFC....',
    '.GHIC....',
    '..GHC....',
    '...GH....',
    '....G....',
    '.........',
  ],
  cores: {"A": "#3b1313", "B": "#cbcbcb", "C": "#2b2b2b", "D": "#2f0f0f", "E": "#9d9d9d", "F": "#b5b5b5", "G": "#2a0e0e", "H": "#202020", "I": "#9c9c9c"},
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
