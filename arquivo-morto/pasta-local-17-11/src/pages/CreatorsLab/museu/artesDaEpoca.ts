/**
 * Quais salas têm arte da ÉPOCA (o sprite original), e não uma placa refeita.
 *
 * Fica separado do componente para o teste poder conferir, sem montar nada,
 * que `origemDaArte` de cada sala diz a verdade.
 */
import type { IdArte } from './museu.config';

export const ARTES_DA_EPOCA: readonly IdArte[] = ['caca', 'insignias', 'corrida', 'guerra'];

export function temArteDaEpoca(id: IdArte): boolean {
  return ARTES_DA_EPOCA.includes(id);
}
