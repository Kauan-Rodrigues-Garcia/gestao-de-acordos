/**
 * ArteDaSala — a arte de uma sala do Museu.
 * ─────────────────────────────────────────────────────────────────────────────
 * Dois tipos de arte:
 *
 *  • **da época** — o sprite original, importado do arquivo morto ou do código
 *    vivo (`museu/artes/`). Cada um é um `import()` separado: os zumbis só
 *    entram na rede para quem abre a sala da Caça.
 *  • **reconstituição** — uma placa em pixels feita para o Museu
 *    (`museu/placas.ts`), para as salas cujo desenho original não dava para
 *    trazer sem trazer junto código que lê o banco.
 *
 * Qual é qual está em `SalaMuseu.origemDaArte`, e a tela escreve a diferença.
 */
import { Suspense, lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { useCreators } from '../theme/CreatorsProvider';
import type { IdArte } from './museu.config';
import { LADO_PLACA, PLACAS, faixasDaPlaca, type IdPlaca } from './placas';

/** As artes da época. O que não está aqui é placa. */
const DA_EPOCA: Partial<Record<IdArte, LazyExoticComponent<ComponentType>>> = {
  caca:      lazy(() => import('./artes/Caca')),
  insignias: lazy(() => import('./artes/Insignias')),
  corrida:   lazy(() => import('./artes/Corrida')),
  guerra:    lazy(() => import('./artes/Guerra')),
};

function PlacaPixel({ id }: { id: IdPlaca }) {
  const placa = PLACAS[id];
  return (
    <div className="creators-lab__vitrine">
      <svg
        viewBox={`0 0 ${LADO_PLACA} ${LADO_PLACA}`}
        shapeRendering="crispEdges"
        className="creators-lab__placa"
        aria-hidden="true"
        focusable="false"
      >
        {faixasDaPlaca(placa).map(f => (
          <rect key={`${f.x}-${f.y}`} x={f.x} y={f.y} width={f.l} height={1} fill={f.cor} />
        ))}
      </svg>
    </div>
  );
}

export function ArteDaSala({ id }: { id: IdArte }) {
  const { tokens } = useCreators();
  const DaEpoca = DA_EPOCA[id];

  if (DaEpoca) {
    return (
      <Suspense fallback={<div className="creators-lab__vitrine creators-lab__carregando">{tokens.vocab.carregando}</div>}>
        <DaEpoca />
      </Suspense>
    );
  }

  // Tudo que não é arte da época tem placa: o teste garante que não sobra id sem desenho.
  return <PlacaPixel id={id as IdPlaca} />;
}

