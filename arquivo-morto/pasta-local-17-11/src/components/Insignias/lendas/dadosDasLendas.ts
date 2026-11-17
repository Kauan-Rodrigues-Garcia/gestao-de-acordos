/**
 * dadosDasLendas.ts — as três Lendas de Outubro, com os números da pontuação.
 *
 * Fora de `Lendas.tsx` (30/10/2026) para o arquivo da arte exportar só
 * componentes — o fast refresh do Vite não recarrega um módulo misto.
 */

export interface Lenda {
  posicao: 1 | 2 | 3;
  nome: string;
  setor: string;
  pontos: number;
  pegos: number;
  naCabeca: number;
  chefes: number;
  golpeFinal: boolean;
}

/** O top 3 da pontuação de 26/10/2026: as únicas três com as cinco. */
export const LENDAS: readonly Lenda[] = [
  { posicao: 1, nome: 'Erika Eduarda', setor: 'Receptivo', pontos: 630, pegos: 2, naCabeca: 1, chefes: 3, golpeFinal: true },
  { posicao: 2, nome: 'Ayslan Silva', setor: 'Play 2', pontos: 595, pegos: 3, naCabeca: 2, chefes: 3, golpeFinal: false },
  { posicao: 3, nome: 'Nicole Pacheco', setor: 'Receptivo', pontos: 575, pegos: 3, naCabeca: 0, chefes: 3, golpeFinal: false },
];
