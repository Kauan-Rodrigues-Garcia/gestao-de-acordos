/**
 * Formatos e cores da Visão geral — fora dos componentes, para o recarregar
 * do Vite continuar funcionando nos arquivos de componente.
 */
import type { MesDoEscopo } from '@/services/mestre/diretoriaCidades.service';
import { mediaDiaria, type MarcaVisual } from './modelo';

/** «R$ 54,5 mil». */
export const mil = (v: number) =>
  `R$ ${(v / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;

/** «R$ 12,9 mi», ou em mil abaixo de um milhão. */
export const milhoes = (v: number) =>
  v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : mil(v);

/** «17,2%». */
export const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** «▲ 12,5%» / «▼ 3%»; nada sem base de comparação. */
export const sinal = (v: number | null) => (v === null ? '' : `${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v))}`);

const COR_DA_MARCA: Record<MarcaVisual, string> = { bp: 'var(--vg-bp)', pp: 'var(--vg-pp)', neutra: 'var(--primary)' };
export const corDaMarca = (m: MarcaVisual) => COR_DA_MARCA[m];

/** A média diária do mês anterior de um escopo (a linha tracejada do gráfico). */
export const mediaDoAnterior = (m: MesDoEscopo) => mediaDiaria(m.mesAnteriorTotal, m.mesAnteriorDias);
