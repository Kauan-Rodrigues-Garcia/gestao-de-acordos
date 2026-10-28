/**
 * Busto.tsx — o busto grande da Coisa (`cabecona.ts`) num canvas, em
 * pixel inteiro. Repinta só quando a pose muda (as poses são poucas: os
 * números de `olhar` e `queixo` já chegam arredondados pelo desenho).
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { ALTURA_DA_CABECONA, LARGURA_DA_CABECONA, PALETA_DA_CABECONA, PALETA_DO_FOGO, montarCabecona, paletaEmCinza, type PoseDaCabecona } from './cabecona';
import { pintarGrade } from './derry';

export function Busto({ pose, cinza = 0, tam, className, style }: {
  pose: PoseDaCabecona;
  /** 0 = em cores; 1 = o cinza da foto da porta (os olhos e o balão ficam). */
  cinza?: number;
  /** O tamanho de um pixel dela na tela. */
  tam: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chave = JSON.stringify(pose) + cinza;
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, LARGURA_DA_CABECONA, ALTURA_DA_CABECONA);
    pintarGrade(c, montarCabecona(pose), paletaEmCinza(Math.round(cinza * 10) / 10, pose.fogo ? PALETA_DO_FOGO : PALETA_DA_CABECONA), 0, 0);
    // A pose entra pela chave (um objeto novo a cada render não repinta à toa).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return (
    <canvas
      ref={ref}
      className={className}
      width={LARGURA_DA_CABECONA}
      height={ALTURA_DA_CABECONA}
      style={{ width: LARGURA_DA_CABECONA * tam, height: ALTURA_DA_CABECONA * tam, imageRendering: 'pixelated', display: 'block', ...style }}
      aria-hidden
    />
  );
}
