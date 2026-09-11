/**
 * coresSituacao — a cor de cada situação de um número.
 *
 * Mora fora de `EtiquetasNumero.tsx` porque dois componentes a usam: a etiqueta
 * e o cronômetro do proxy (`SituacaoDoNumero`), que desenha a própria etiqueta
 * com o tempo dentro. E arquivo de componente que exporta constante perde o
 * recarregamento rápido do Vite.
 *
 * As quatro de 11/09/2026 ganham tons próprios, fora do verde/âmbar/vermelho de
 * estado: esperar e estar restrito não é «bom» nem «morto», e roubar a cor de
 * «Ativo» ou de «Banido» faria duas situações parecerem a mesma de relance. O
 * texto da etiqueta continua dizendo qual é.
 */
import type { Situacao } from '@/services/numeros/numerosRegras';

export const CORES_SITUACAO: Record<Situacao, string> = {
  em_aquecimento:     'bg-warning/15 text-warning border-warning/30',
  ativo:              'bg-success/15 text-success border-success/30',
  banido:             'bg-destructive/15 text-destructive border-destructive/30',
  aguardando_12h:     'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  aguardando_24h:     'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  movimentando_proxy: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  em_restricao:       'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
};
