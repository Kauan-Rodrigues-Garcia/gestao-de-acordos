/** estilo.ts — classes compartilhadas da aba Ouvidoria (fora dos componentes, por causa do fast refresh). */
import type { Status } from './ouvidoria';

/** O ponto colorido do status, para a lateral do cartão. */
export const COR_FAIXA_STATUS: Record<Status, string> = {
  aberto: 'bg-info',
  em_andamento: 'bg-primary',
  pendente_documentos: 'bg-warning',
  encaminhado_coren: 'bg-violet-500',
  concluido: 'bg-success',
};

/** O `<select>` nativo com a cara dos campos do app (os filtros usam muitos). */
export const CLASSE_SELECT =
  'h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';
