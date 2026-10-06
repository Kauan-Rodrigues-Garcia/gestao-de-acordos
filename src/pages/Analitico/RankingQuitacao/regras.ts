/** Até que posição o ranking paga prêmio. Do 7º ao 10º aparece, sem prêmio. */
export const POSICOES_COM_PREMIO = 6;

/**
 * Quanto falta para passar quem está logo acima. A ordem é por valor; empatar
 * não basta (o desempate é a quantidade), então passar é ficar 1 centavo acima.
 */
export function faltaParaPassar(valorAcima: number, valor: number): number {
  return Math.max(0.01, Math.round((valorAcima - valor) * 100) / 100 + 0.01);
}
