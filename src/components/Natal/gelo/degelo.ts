/**
 * O bloco de gelo do Analítico (Cleber, 05/11/2026): um cantor congelado
 * dentro de um bloco de gelo que DERRETE com o passar dos dias. Parar o mouse
 * em cima por um segundo toca a música dele — abafada e com eco, como quem
 * ouve através do gelo: «está chegando, descongelando».
 *
 * Tudo aqui é conta pura, para testar sem tela:
 *   - `quantoDerreteu`: de 0 (01/11, quando o Natal começou) a 1 (25/12), de
 *     dia em dia — o mesmo para todo mundo, e não muda no meio do dia;
 *   - `formaDoGelo`: a altura do gelo (o rosto vai saindo por cima), o
 *     arredondado das quinas e a poça embaixo;
 *   - `somDoGelo`: o quanto a música soa abafada e com eco. Quanto mais
 *     derretido, mais limpa; no Natal, limpa de vez.
 */

const DIA_MS = 86_400_000;
/** 01/11/2026 00:00 em Brasília: o Natal começou (a mesma `EPOCA` da rádio). */
export const CONGELOU_EM = Date.UTC(2026, 10, 1, 3, 0, 0);
/** 25/12/2026 00:00 em Brasília: descongelou. */
export const DESCONGELA_EM = Date.UTC(2026, 11, 25, 3, 0, 0);
export const DIAS_DE_GELO = Math.round((DESCONGELA_EM - CONGELOU_EM) / DIA_MS);

/** Quanto o gelo já derreteu (0 a 1), contado em dias inteiros. */
export function quantoDerreteu(agoraMs: number): number {
  const dias = Math.floor((agoraMs - CONGELOU_EM) / DIA_MS);
  return Math.min(1, Math.max(0, dias / DIAS_DE_GELO));
}

/** Quantos dias faltam para descongelar de vez. */
export function diasParaDescongelar(agoraMs: number): number {
  return Math.max(0, Math.ceil((DESCONGELA_EM - agoraMs) / DIA_MS));
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Derrete devagar no começo e mais rápido perto do fim (gelo fino derrete depressa). */
const acelera = (k: number) => k * k * (3 - 2 * k) * 0.35 + k * k * 0.65;

/** O desenho do bloco, em px, para quanto derreteu. */
export interface FormaDoGelo {
  /** A altura do bloco (de baixo para cima). */
  altura: number;
  /** O arredondado das quinas de cima (gelo derretendo fica redondo). */
  raio: number;
  /** A largura da poça d'água embaixo. */
  poca: number;
  /** Quantas gotas escorrem ao mesmo tempo. */
  gotas: number;
  /** O embaçado do que está dentro (px de blur) e o branco da geada (0 a 1). */
  embacado: number;
  geada: number;
}

/** O cubo cheio é quase um cubo (62 de altura, 60 de lado — Cleber, 05/11/2026: «mais quadradinho»); no fim, só os ombros. */
export const ALTURA_CHEIA = 62;
export const ALTURA_FINAL = 22;

export function formaDoGelo(derreteu: number): FormaDoGelo {
  const k = acelera(Math.min(1, Math.max(0, derreteu)));
  return {
    altura: Math.round(lerp(ALTURA_CHEIA, ALTURA_FINAL, k)),
    raio: Math.round(lerp(9, 24, k)),
    poca: Math.round(lerp(58, 112, k)),
    gotas: Math.round(lerp(1, 5, k)),
    embacado: Number(lerp(0.9, 0.25, k).toFixed(2)),
    geada: Number(lerp(0.26, 0.08, k).toFixed(2)),
  };
}

/** Como a música soa através do gelo. */
export interface SomDoGelo {
  /** O corte do filtro (Hz): baixo = bem abafado. */
  corte: number;
  /** Quanto de eco (0 a 1) e quanto ele se repete. */
  eco: number;
  repeticao: number;
}

export function somDoGelo(derreteu: number): SomDoGelo {
  const k = Math.min(1, Math.max(0, derreteu));
  // Descongelou: a música limpa, só um restinho de eco de festa.
  if (k >= 1) return { corte: 18_000, eco: 0.05, repeticao: 0.1 };
  return {
    // De 420 Hz (bem abafado) a 4,8 kHz (quase limpo), subindo em escala de ouvido.
    corte: Math.round(420 * Math.pow(4800 / 420, k)),
    // «Um pouquinho menos de eco» (Cleber, 05/11/2026): era de 0,5 a 0,18, repetindo 0,45 a 0,25.
    eco: Number(lerp(0.32, 0.1, k).toFixed(2)),
    repeticao: Number(lerp(0.3, 0.15, k).toFixed(2)),
  };
}
