// O "efeito Thanos": o conteúdo se desfaz em pedaços irregulares, da esquerda
// para a direita, e as bordas se esgarçam enquanto somem.
//
// É um filtro SVG: ruído fractal + uma rampa horizontal decidem a ordem em que
// cada pixel some; um limiar que avança com o progresso apaga quem ficou para
// trás; o deslocamento por ruído rasga a borda que está sumindo.

import { useCurrentFrame } from 'remotion';
import { entre } from '../movimento';

const RAMPA =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" preserveAspectRatio="none">
       <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
         <stop offset="0" stop-color="#000" stop-opacity="0"/>
         <stop offset="1" stop-color="#000" stop-opacity="1"/>
       </linearGradient></defs>
       <rect width="100" height="100" fill="url(#g)"/>
     </svg>`,
  );

type Props = {
  id: string;
  /** Frame em que começa a sumir. */
  inicio: number;
  /** Quantos frames leva para sumir por inteiro. */
  duracao: number;
  largura: number;
  altura: number;
  semente?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

export function progressoDesintegrar(frame: number, inicio: number, duracao: number) {
  return entre(frame, inicio, inicio + duracao, 0, 1, (t) => t);
}

export const Desintegrar: React.FC<Props> = ({ id, inicio, duracao, largura, altura, semente = 3, style, children }) => {
  const frame = useCurrentFrame();
  const p = progressoDesintegrar(frame, inicio, duracao);
  if (p >= 1) return <div style={{ ...style, width: largura, height: altura }} />;
  if (p <= 0) return <div style={{ ...style, width: largura, height: altura }}>{children}</div>;

  // Limiar: de -0,1 (nada some) a 1,1 (tudo sumiu).
  const limiar = -0.1 + p * 1.2;
  const K = 14;
  // ruído com ~1 ciclo a cada 38 px: pedaços graúdos, não chiado
  const fx = largura / 38;
  const fy = altura / 38;
  const fid = `desintegrar-${id}`;

  return (
    <div style={{ ...style, width: largura, height: altura }}>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter
          id={fid}
          x="-0.05"
          y="-0.1"
          width="1.25"
          height="1.2"
          filterUnits="objectBoundingBox"
          primitiveUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency={`${fx} ${fy}`} numOctaves={2} seed={semente} result="ruido" />
          <feColorMatrix in="ruido" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.7 0 0 0 -0.35" result="ruidoA" />
          <feImage href={RAMPA} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="rampa" />
          <feComposite in="ruidoA" in2="rampa" operator="arithmetic" k1={0} k2={0.5} k3={0.5} k4={0} result="ordem" />
          <feComponentTransfer in="ordem" result="mascara">
            <feFuncA type="linear" slope={K} intercept={-limiar * K} />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="mascara" operator="in" result="resto" />
          <feDisplacementMap in="resto" in2="ruido" scale={0.02 + p * 0.05} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div style={{ width: largura, height: altura, filter: `url(#${fid})` }}>{children}</div>
    </div>
  );
};
