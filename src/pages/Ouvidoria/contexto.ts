/**
 * contexto.ts — o que todas as peças do painel da Ouvidoria precisam saber:
 * o setor, quem sou eu, a legenda de cores, os grupos, quem atende e se o
 * banco já tem a parte 2 (migration 20261109120000).
 *
 * Fica fora dos componentes por causa do fast refresh.
 */
import { createContext, useContext } from 'react';
import type { Etiqueta, Grupo, Manifestacao, PessoaOuvidoria, SetorOuvidoria } from './ouvidoria';

export interface ContextoOuvidoria {
  setor: SetorOuvidoria;
  meuId: string | null;
  /** Todas as manifestações do setor (para «outras deste cliente», grupos, alertas). */
  todas: readonly Manifestacao[];
  etiquetas: readonly Etiqueta[];
  grupos: readonly Grupo[];
  pessoas: readonly PessoaOuvidoria[];
  /** O banco já tem retorno agendado, encaminhamento, tickets, etiquetas e grupos. */
  v2: boolean;
  /** Relê a lista, a linha do tempo, os grupos e a legenda. */
  recarregar: () => void;
  abrirManifestacao: (id: string) => void;
}

export const OuvidoriaCtx = createContext<ContextoOuvidoria | null>(null);

export function useOuvidoria(): ContextoOuvidoria {
  const ctx = useContext(OuvidoriaCtx);
  if (!ctx) throw new Error('useOuvidoria fora do painel da Ouvidoria.');
  return ctx;
}
