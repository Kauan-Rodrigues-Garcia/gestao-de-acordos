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
/** Uma janela em cada tantas tem visita (sorteio fixo por janela). */
export const VISITA_A_CADA = 4;

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

/* As falas do urso (e do iglu, com ele lá dentro) moram em `falas.ts`. */
