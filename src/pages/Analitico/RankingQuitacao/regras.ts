/**
 * As regras do ranking moram em `services/rankingQuitacao/ranking.ts` desde
 * 11/11/2026 (a aba e a TV leem o mesmo módulo). Isto fica para quem ainda
 * conta só por valor.
 */
import { faltaParaPassar as faltaPeloCriterio } from '@/services/rankingQuitacao/ranking';

/**
 * Quanto falta para passar quem está logo acima, por valor. Empatar não basta
 * (o desempate é a quantidade), então passar é ficar 1 centavo acima.
 */
export function faltaParaPassar(valorAcima: number, valor: number): number {
  return faltaPeloCriterio('valor', { valor: valorAcima, quitacoes: 0 }, { valor, quitacoes: 0 });
}
