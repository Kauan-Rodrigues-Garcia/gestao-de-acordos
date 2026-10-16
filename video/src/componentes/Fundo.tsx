import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COR } from '../tema';

/**
 * Fundo claro, com três manchas de cor derivando devagar — o mesmo «fundo
 * vivo» do app do celular (azul, verde e lilás bem claros) — e uma grade de
 * pontos quase invisível para dar profundidade.
 */
export const Fundo: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 60;
  const mancha = (cor: string, x: number, y: number, raio: number) =>
    `radial-gradient(${raio}px ${raio}px at ${x}% ${y}%, ${cor}, transparent 70%)`;
  return (
    <AbsoluteFill style={{ background: COR.fundo, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: [
            mancha('rgba(191,227,244,0.85)', 14 + Math.sin(t * 0.17) * 6, 18 + Math.cos(t * 0.13) * 5, 900),
            mancha('rgba(201,236,214,0.85)', 86 + Math.cos(t * 0.15) * 6, 70 + Math.sin(t * 0.19) * 6, 950),
            mancha('rgba(228,224,243,0.7)', 40 + Math.sin(t * 0.11) * 8, 96 + Math.cos(t * 0.16) * 4, 800),
          ].join(', '),
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(15,27,38,0.07) 1.2px, transparent 1.2px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
        }}
      />
    </AbsoluteFill>
  );
};
