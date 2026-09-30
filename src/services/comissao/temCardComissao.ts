/**
 * Quando o card de comissão aparece — no Dashboard e na tela mínima do celular.
 *
 * Sem meta ou sem configuração no mês não há card: um R$ 0,00 ali pareceria
 * resultado. A exceção é quem tem bônus (16/09/2026): o card aparece para
 * mostrá-lo. «Nenhuma faixa ainda» aparece — é quanto falta para a 1ª.
 */
import type { ResultadoComissao } from './comissao';

export function temCardComissao(resultado: ResultadoComissao | null): boolean {
  if (!resultado) return false;
  return (resultado.motivo !== 'sem_meta' && resultado.motivo !== 'sem_config')
    || resultado.bonus.length > 0;
}
