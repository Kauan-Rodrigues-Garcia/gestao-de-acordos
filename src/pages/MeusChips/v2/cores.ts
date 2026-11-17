/**
 * Cores da Meus Chips 2.0.
 *
 * Gráfico usa HEX, nunca `hsl(var(--x))`: as variáveis do tema são oklch e
 * `hsl(oklch(...))` apaga o gráfico (memória «cor de gráfico»).
 */
import type { StatusChip } from '@/services/chipsFisicos/chipsFisicosRegras';

/** Do bom ao ruim — a ordem de tudo na tela. */
export const ORDEM_STATUS: StatusChip[] = ['ativo', 'recuperar', 'restricao', 'banido'];

export const HEX_STATUS: Record<StatusChip, string> = {
  ativo: '#10b981',
  recuperar: '#eab308',
  restricao: '#f97316',
  banido: '#ef4444',
};

export const ROTULO_STATUS_PLURAL: Record<StatusChip, string> = {
  ativo: 'Ativos', recuperar: 'Recuperar', restricao: 'Restrição', banido: 'Banidos',
};

/** Fundo suave + texto forte, para selos e ícones. */
export const TOM_STATUS: Record<StatusChip, { fundo: string; texto: string; borda: string; solido: string }> = {
  ativo:     { fundo: 'bg-emerald-500/12', texto: 'text-emerald-700 dark:text-emerald-300', borda: 'border-emerald-500/40', solido: 'bg-emerald-500' },
  recuperar: { fundo: 'bg-yellow-500/15', texto: 'text-yellow-700 dark:text-yellow-300', borda: 'border-yellow-500/40', solido: 'bg-yellow-400' },
  restricao: { fundo: 'bg-orange-500/12', texto: 'text-orange-700 dark:text-orange-300', borda: 'border-orange-500/40', solido: 'bg-orange-500' },
  banido:    { fundo: 'bg-red-500/12', texto: 'text-red-700 dark:text-red-300', borda: 'border-red-500/40', solido: 'bg-red-500' },
};

export const DESCRICAO_STATUS: Record<StatusChip, string> = {
  ativo: 'funcionando',
  recuperar: 'voltando',
  restricao: 'presos por tempo',
  banido: 'caíram',
};
