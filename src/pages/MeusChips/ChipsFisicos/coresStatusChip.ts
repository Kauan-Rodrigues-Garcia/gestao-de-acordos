/**
 * A cor de cada status de chip físico. Fora dos componentes porque arquivo de
 * componente que exporta constante perde o recarregamento rápido do Vite.
 *
 * Ativo e Banido usam os mesmos tons do Controle de Números — quem olha as duas
 * separações lê a mesma cor com o mesmo sentido. Restrição usa o laranja de
 * «Em restrição» do Controle, pelo mesmo motivo. Recuperar fica no âmbar de
 * «em andamento». «Tempo encerrado» não é status, é aviso: tom próprio, para
 * não se confundir com nenhum dos três.
 */
import type { EtiquetaChip, StatusChip } from '@/services/chipsFisicos/chipsFisicosRegras';

export const CORES_STATUS_CHIP: Record<StatusChip, string> = {
  ativo:     'bg-success/15 text-success border-success/30',
  restricao: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  banido:    'bg-destructive/15 text-destructive border-destructive/30',
  recuperar: 'bg-warning/15 text-warning border-warning/30',
};

/** O ponto colorido dos contadores e do seletor. */
export const PONTO_STATUS_CHIP: Record<StatusChip, string> = {
  ativo:     'bg-success',
  restricao: 'bg-orange-500',
  banido:    'bg-destructive',
  recuperar: 'bg-warning',
};

export const COR_TEMPO_ENCERRADO =
  'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30';

export const PONTO_TEMPO_ENCERRADO = 'bg-sky-500';

// ── 2.0 (17/11/2026) ────────────────────────────────────────────────────────

/** A cor de cada etiqueta — tons fora dos quatro status, para não confundir. */
export const COR_ETIQUETA: Record<EtiquetaChip, string> = {
  movimentando: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  principal:    'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  reserva:      'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  aquecendo:    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  campanha:     'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  sem_credito:  'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

/** A faixa de cor na borda esquerda do cartão do chip. */
export const FAIXA_STATUS_CHIP: Record<StatusChip, string> = {
  ativo:     'before:bg-emerald-500',
  recuperar: 'before:bg-yellow-400',
  restricao: 'before:bg-orange-500',
  banido:    'before:bg-red-500',
};

export const COR_LEMBRETE =
  'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30';

/** A luz acesa de cada status no semáforo: o fundo e o brilho em volta. */
export const LUZ_STATUS: Record<StatusChip, string> = {
  ativo:     'bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.75)]',
  recuperar: 'bg-yellow-300 shadow-[0_0_6px_1px_rgba(253,224,71,0.75)]',
  restricao: 'bg-orange-500 shadow-[0_0_6px_1px_rgba(249,115,22,0.75)]',
  banido:    'bg-red-500 shadow-[0_0_6px_1px_rgba(239,68,68,0.8)]',
};
