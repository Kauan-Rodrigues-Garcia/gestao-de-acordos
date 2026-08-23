/**
 * useAtualizacaoGlobal — quantas telas estão relendo em silêncio agora.
 *
 * Fica separado de `BarraAtualizacao.tsx` para o arquivo do componente exportar
 * só componente (é o que o `react-refresh` pede para o hot reload funcionar), e
 * porque o dado interessa a mais gente que a barra: qualquer tela pode querer
 * dizer "atualizado há 12 s" no próprio cabeçalho.
 *
 * O estado vive em `lib/estadoAtualizacao.ts`, que não conhece React.
 */
import { useSyncExternalStore } from 'react';
import {
  assinarAtualizacao, lerAtualizacao, type EstadoAtualizacao,
} from '@/lib/estadoAtualizacao';

export function useAtualizacaoGlobal(): EstadoAtualizacao {
  return useSyncExternalStore(assinarAtualizacao, lerAtualizacao, lerAtualizacao);
}

export default useAtualizacaoGlobal;
