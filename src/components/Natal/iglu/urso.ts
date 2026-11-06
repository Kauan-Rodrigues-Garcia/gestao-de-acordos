/**
 * Quando o urso do iglu sai para pescar — o mesmo para todo mundo.
 *
 * Pedido do Cleber, 04/11/2026: no Analítico há um iglu com um laguinho
 * congelado na frente, e RARAMENTE um urso sai, senta e pesca; fisgando o
 * peixe, entra de volta e fecha a porta. Enquanto ele está lá dentro, a
 * janelinha fica acesa.
 *
 * Como o trem e a música, sai do relógio do Natal (`relogioNatal`), sem estado:
 * o dia é dividido em janelas de `JANELA_MS`; um sorteio fixo por janela
 * (`espalhar`) decide se ela tem visita (uma em cada `VISITA_A_CADA`, em média
 * a cada 2 h) e em que minuto ela começa. Quem abre o Analítico na hora certa
 * vê o urso — todo mundo junto.
 *
 * Uma visita:  saindo (a porta abre, ele vai até a beira do lago)
 *            → pescando → fisgou (o peixe pula da água para a pata)
 *            → entrando (volta com o peixe e fecha a porta).
 */
import { EPOCA } from '../musica';

export const JANELA_MS = 30 * 60_000;
/**
 * Uma janela em cada tantas tem visita (sorteio fixo por janela). Era 4 (uma
 * a cada 2 h); o Cleber achou raro demais (05/11/2026: «acontece algumas vezes
 * no dia, é raro, mas não tão raro»): com 2, é uma por hora em média — umas
 * nove no expediente, cada uma com uns 2 min e meio.
 */
export const VISITA_A_CADA = 2;

export const SAINDO_S = 3.4;
export const PESCANDO_S = 150;
export const FISGOU_S = 4.5;
export const ENTRANDO_S = 3.8;
export const DURACAO_VISITA_S = SAINDO_S + PESCANDO_S + FISGOU_S + ENTRANDO_S;

export type FaseDoUrso = 'dentro' | 'saindo' | 'pescando' | 'fisgou' | 'entrando';

/** Um embaralhador de inteiros (sem `Math.random`: todo mundo sorteia igual). */
function espalhar(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Quando (ms) começa a visita da janela `j`, ou `null` se essa janela não tem urso. */
export function visitaDaJanela(j: number): number | null {
  if (espalhar(j) % VISITA_A_CADA !== 0) return null;
  const folga = JANELA_MS - DURACAO_VISITA_S * 1000;
  return EPOCA + j * JANELA_MS + (espalhar(j * 31 + 7) % Math.floor(folga));
}

let visitaDeTeste: number | null = null;

/** Só no `npm run dev`: o urso sai agora (o botão «Chamar o urso»). */
export function chamarUrsoParaTeste(agoraMs: number) {
  if (import.meta.env.DEV) visitaDeTeste = agoraMs;
}

export function oUrsoAgora(agoraMs: number): { fase: FaseDoUrso; t: number } {
  const j = Math.floor((agoraMs - EPOCA) / JANELA_MS);
  const inicios = [visitaDeTeste, visitaDaJanela(j), visitaDaJanela(j - 1)];
  for (const inicio of inicios) {
    if (inicio === null) continue;
    const s = (agoraMs - inicio) / 1000;
    if (s < 0 || s >= DURACAO_VISITA_S) continue;
    if (s < SAINDO_S) return { fase: 'saindo', t: s };
    if (s < SAINDO_S + PESCANDO_S) return { fase: 'pescando', t: s - SAINDO_S };
    if (s < SAINDO_S + PESCANDO_S + FISGOU_S) return { fase: 'fisgou', t: s - SAINDO_S - PESCANDO_S };
    return { fase: 'entrando', t: s - SAINDO_S - PESCANDO_S - FISGOU_S };
  }
  return { fase: 'dentro', t: 0 };
}

/*
 * As beliscadas: pescando, de tempos em tempos um peixe belisca a isca — a
 * boia afunda, a vara verga e o urso fica atento («!»). Também saem do
 * relógio: a pesca é dividida em ciclos de `CICLO_BELISCADA_S`, e dois em
 * cada três têm uma beliscada, num ponto sorteado do ciclo.
 */
export const BELISCADA_S = 1.6;
export const CICLO_BELISCADA_S = 13;

/** Durante uma beliscada, o quanto dela já foi (0 a 1); fora, `null`. `tPesca`: segundos de pesca. */
export function beliscada(tPesca: number): number | null {
  if (tPesca < 0) return null;
  const k = Math.floor(tPesca / CICLO_BELISCADA_S);
  const h = espalhar(k * 97 + 13);
  if (h % 3 === 0) return null;
  const inicio = k * CICLO_BELISCADA_S + 2 + (h % 7);
  const d = tPesca - inicio;
  return d >= 0 && d < BELISCADA_S ? d / BELISCADA_S : null;
}

/*
 * O trem passando pelo iglu (Cleber, 05/11/2026: «se ele estiver pescando
 * quando o trem passar, fala pra ele dar um tchauzinho»). O iglu mora na
 * ponta direita da pista do ALTO do Analítico. Na janela do Analítico (ida
 * ou volta), a pista do alto é a primeira parte do progresso (até ~0,47: uma
 * pista de duas, mais a folga), e a ponta direita dela fica de 0,3 em diante
 * — tanto na ida (indo para a direita) quanto na volta (vindo dela).
 */
export const PERTO_DO_IGLU = { de: 0.3, ate: 0.47 } as const;

export function tremPassaPeloIglu(p: { fechado: unknown; aba: string; fase: string; progresso: number }): boolean {
  return !p.fechado && p.aba === 'analitico' && (p.fase === 'ida' || p.fase === 'volta')
    && p.progresso >= PERTO_DO_IGLU.de && p.progresso < PERTO_DO_IGLU.ate;
}

/* As falas do urso (e do iglu, com ele lá dentro) moram em `falas.ts`. */
