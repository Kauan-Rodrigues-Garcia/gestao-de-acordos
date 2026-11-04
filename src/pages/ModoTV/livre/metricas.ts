/**
 * metricas.ts — o texto do «Número ao vivo» da cena livre.
 *
 * Os mesmos números das outras telas (`montarVisao`), já na unidade do painel.
 * Sem número ainda, ou sem meta para a conta, mostra «—»: a parede nunca
 * escreve «R$ 0,00» por falta de dado.
 *
 * Puro. Testado em `livre.test.ts`.
 */
import { moedaTv, percentualTv, type VisaoTv } from '../numeros';
import type { MetricaLivre } from './cena';

export function valorDaMetrica(v: VisaoTv | null, m: MetricaLivre): string {
  if (!v) return '—';
  const precisaMeta = m === 'meta' || m === 'falta' || m === 'percentual' || m === 'meta_hoje' || m === 'ritmo';
  if (precisaMeta && v.meta <= 0) return '—';
  switch (m) {
    case 'recebido':   return moedaTv(v.recebido);
    case 'meta':       return moedaTv(v.meta);
    case 'falta':      return moedaTv(v.falta);
    case 'percentual': return percentualTv(v.fracao);
    case 'hoje':       return moedaTv(v.hoje.recebido);
    case 'meta_hoje':  return moedaTv(v.hoje.alvo);
    case 'ritmo':      return moedaTv(v.ritmo);
    case 'projecao':   return v.diasDecorridos > 0 ? moedaTv(v.projecao) : '—';
  }
}
