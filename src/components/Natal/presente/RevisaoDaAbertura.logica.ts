/**
 * As contas da revisão da abertura (`RevisaoDaAbertura.tsx`), sem tela.
 *
 * «Viu inteiro» é ter assistido pelo menos `PARTE_QUE_CONTA` do vídeo de
 * verdade — o que tocou, não onde a barra parou: arrastar até o fim não conta.
 */

/** Quanto do vídeo precisa ter tocado para contar como «viu inteiro». */
export const PARTE_QUE_CONTA = 0.9;

/** Segundos que de fato tocaram (somando os trechos, sem contar pulos). */
export function segundosAssistidos(trechos: Pick<TimeRanges, 'length' | 'start' | 'end'>): number {
  let s = 0;
  for (let i = 0; i < trechos.length; i++) s += Math.max(0, trechos.end(i) - trechos.start(i));
  return s;
}
