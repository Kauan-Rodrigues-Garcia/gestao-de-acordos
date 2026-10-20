/**
 * O pedaço das placas do hover (`Placas.tsx`), baixado sob demanda: quando o
 * mouse chega perto das medalhas ou a lista do pessoal abre. Fora do
 * `Estante.tsx` para ele exportar só componentes (o recarregamento do Vite).
 */
import { comNovaTentativa } from '@/lib/sobDemanda';

export const carregarPlacas = comNovaTentativa(() => import('./Placas'));

/** Começa a baixar as placas — o mouse chegou perto das medalhas. */
export function prepararPlacas(): void {
  void carregarPlacas().catch(() => {});
}
