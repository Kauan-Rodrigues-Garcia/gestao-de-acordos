/**
 * Formatos e cores da Visão geral — fora dos componentes, para o recarregar
 * do Vite continuar funcionando nos arquivos de componente.
 */
import type { MesDoEscopo } from '@/services/mestre/diretoriaCidades.service';
import { mediaDiaria, type MarcaVisual, type ModoCofen } from './modelo';

/** «H.O.» / «bruto» — como o Cofen está aparecendo. */
export const rotuloModo = (m: ModoCofen) => (m === 'ho' ? 'H.O.' : 'bruto');

/** «R$ 54,5 mil», «R$ 160 mil», «R$ 1,48 mi». */
export const mil = (v: number) => (Math.abs(v) >= 1_000_000
  ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  : `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`);

/** «R$ 12,9 mi», ou em mil abaixo de um milhão. */
export const milhoes = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : mil(v);

/**
 * «58%», «4,8%»: casa decimal só onde ela muda a leitura (abaixo de 10%).
 *
 * Cortado, não arredondado (26/10/2026): 99,6% da meta arredondado virava
 * «100%» para um setor que ainda não tinha batido. O `1e-9` é só o ruído do
 * ponto flutuante, como em `cortarPct`.
 */
export const pct = (v: number) => {
  const fator = Math.abs(v) >= 10 ? 1 : 10;
  const cortado = Math.trunc(v * fator + Math.sign(v) * 1e-9) / fator;
  return `${cortado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
};

/** «▲ 12,5%» / «▼ 3%»; nada sem base de comparação. */
export const sinal = (v: number | null) => (v === null ? '' : `${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v))}`);

const COR_DA_MARCA: Record<MarcaVisual, string> = { bp: 'var(--vg-bp)', pp: 'var(--vg-pp)', neutra: 'var(--primary)' };
export const corDaMarca = (m: MarcaVisual) => COR_DA_MARCA[m];

/** A média diária do mês anterior de um escopo (a linha tracejada do gráfico). */
export const mediaDoAnterior = (m: MesDoEscopo) => mediaDiaria(m.mesAnteriorTotal, m.mesAnteriorDias);
