/**
 * A cor de cada status de chip físico. Fora dos componentes porque arquivo de
 * componente que exporta constante perde o recarregamento rápido do Vite.
 *
 * Ativo e Banido usam os mesmos tons do Controle de Números — quem olha as duas
 * separações lê a mesma cor com o mesmo sentido. Recuperar fica no âmbar de
 * «em andamento». «Tempo encerrado» não é status, é aviso: tom próprio, para
 * não se confundir com nenhum dos três.
 */
import type { StatusChip } from '@/services/chipsFisicos/chipsFisicosRegras';

export const CORES_STATUS_CHIP: Record<StatusChip, string> = {
  ativo:     'bg-success/15 text-success border-success/30',
  banido:    'bg-destructive/15 text-destructive border-destructive/30',
  recuperar: 'bg-warning/15 text-warning border-warning/30',
};

/** O ponto colorido dos contadores e do seletor. */
export const PONTO_STATUS_CHIP: Record<StatusChip, string> = {
  ativo:     'bg-success',
  banido:    'bg-destructive',
  recuperar: 'bg-warning',
};

export const COR_TEMPO_ENCERRADO =
  'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30';

export const PONTO_TEMPO_ENCERRADO = 'bg-sky-500';
