/**
 * Icone — desenha um dos mapas de pixels de `icones.ts`.
 *
 * Um `<svg>` de faixas com `currentColor`. Cor, placa e sombra são do tema e
 * ficam no CSS; ver o cabeçalho de `icones.ts`.
 */
import { memo } from 'react';
import { LADO_ICONE, MAPAS, faixasDoMapa, type IdIcone } from './icones';

export const Icone = memo(function Icone({ id }: { id: IdIcone }) {
  return (
    <svg
      viewBox={`0 0 ${LADO_ICONE} ${LADO_ICONE}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {faixasDoMapa(MAPAS[id]).map(f => (
        <rect key={`${f.x}-${f.y}`} x={f.x} y={f.y} width={f.l} height={1} />
      ))}
    </svg>
  );
});
