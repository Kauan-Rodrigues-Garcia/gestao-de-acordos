// Um sprite de pixel art do app (zumbi, bruxa) desenhado pelo QUADRO do vídeo.
//
// No app os sprites se animam sozinhos (`setInterval`); aqui isso sairia
// tremido, porque o Remotion grava quadro a quadro. Quem escolhe o quadro do
// sprite é quem chama, a partir do `useCurrentFrame()`.

import { useLayoutEffect, useRef } from 'react';

type Props = {
  quadros: ImageData[];
  indice: number;
  escala: number;
  espelhar?: boolean;
  style?: React.CSSProperties;
};

export const Sprite: React.FC<Props> = ({ quadros, indice, escala, espelhar = false, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const q = quadros[((indice % quadros.length) + quadros.length) % quadros.length];
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || !q) return;
    c.getContext('2d')?.putImageData(q, 0, 0);
  }, [q]);
  if (!q) return null;
  return (
    <canvas
      ref={ref}
      width={q.width}
      height={q.height}
      style={{
        width: q.width * escala,
        height: q.height * escala,
        imageRendering: 'pixelated',
        transform: espelhar ? 'scaleX(-1)' : undefined,
        ...style,
      }}
    />
  );
};
