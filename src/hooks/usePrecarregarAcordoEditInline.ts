import { comNovaTentativa } from '@/lib/sobDemanda';
import { usePrecarregarQuandoOcioso } from '@/hooks/useSobDemanda';

/**
 * O download da área de editar acordo, um só para o pré-carregamento e para a
 * abertura de verdade. Ver `components/AcordoEditInlineSobDemanda.tsx`.
 */
export const carregarAcordoEditInline = comNovaTentativa(() => import('@/components/AcordoEditInline'));

const CARREGADORES = [carregarAcordoEditInline] as const;
const SEM_CARREGADORES = [] as const;

/** Para as tabelas que podem abrir a edição: baixa o pedaço quando a tela assenta. */
export function usePrecarregarAcordoEditInline(ativo = true): void {
  usePrecarregarQuandoOcioso(ativo ? CARREGADORES : SEM_CARREGADORES);
}
