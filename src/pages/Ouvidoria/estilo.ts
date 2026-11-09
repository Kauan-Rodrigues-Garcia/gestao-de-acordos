/** estilo.ts — classes compartilhadas da aba Ouvidoria (fora dos componentes, por causa do fast refresh). */
import type { CorEtiqueta, Status } from './ouvidoria';

/** O ponto colorido do status, para a lateral do cartão. */
export const COR_FAIXA_STATUS: Record<Status, string> = {
  aberto: 'bg-info',
  em_andamento: 'bg-primary',
  pendente_documentos: 'bg-warning',
  encaminhado_coren: 'bg-violet-500',
  concluido: 'bg-success',
};

/**
 * As cores da legenda das anuidades: `chip` para o ano pintado, `ponto` para a
 * bolinha da legenda. Escritas por extenso para o Tailwind achar as classes.
 */
export const COR_ETIQUETA: Record<CorEtiqueta, { chip: string; ponto: string }> = {
  verde: { chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/50', ponto: 'bg-emerald-500' },
  vermelho: { chip: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/50', ponto: 'bg-red-500' },
  amarelo: { chip: 'bg-amber-400/20 text-amber-800 dark:text-amber-300 border-amber-500/50', ponto: 'bg-amber-400' },
  azul: { chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/50', ponto: 'bg-sky-500' },
  roxo: { chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/50', ponto: 'bg-violet-500' },
  laranja: { chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/50', ponto: 'bg-orange-500' },
  rosa: { chip: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/50', ponto: 'bg-pink-500' },
  cinza: { chip: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/50', ponto: 'bg-slate-500' },
};
