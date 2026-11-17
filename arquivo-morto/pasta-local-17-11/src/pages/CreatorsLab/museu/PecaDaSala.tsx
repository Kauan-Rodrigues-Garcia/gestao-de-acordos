/**
 * PecaDaSala — a demonstração para mexer de uma sala do Museu.
 *
 * Cada peça é um `import()` separado, feito só quando a sala é aberta. Todas
 * são encenações com dados fictícios: nenhuma importa serviço, cliente do
 * banco ou hook de dados — o teste do Museu lê os arquivos e confere.
 */
import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { useCreators } from '../theme/CreatorsProvider';
import type { IdPeca } from './museu.config';

const PECAS: Record<IdPeca, LazyExoticComponent<ComponentType>> = {
  caca:      lazy(() => import('./pecas/Caca')),
  pesquisa:  lazy(() => import('./pecas/Pesquisa')),
  corrida:   lazy(() => import('./pecas/Corrida')),
  sirene:    lazy(() => import('./pecas/Sirene')),
  'modo-tv': lazy(() => import('./pecas/ModoTv')),
};

export function PecaDaSala({ id }: { id: IdPeca }) {
  const { tokens } = useCreators();
  const Peca = PECAS[id];

  return (
    <Suspense fallback={<p className="creators-lab__carregando">{tokens.vocab.carregando}</p>}>
      <Peca />
    </Suspense>
  );
}
