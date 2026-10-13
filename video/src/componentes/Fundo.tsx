import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { COR } from '../tema';

/** Fundo escuro com duas luzes suaves (verde e azul) derivando devagar. */
export const Fundo: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / 60;
  const verdeX = 18 + Math.sin(t * 0.21) * 6;
  const verdeY = 78 + Math.cos(t * 0.17) * 5;
  const azulX = 82 + Math.cos(t * 0.19) * 6;
  const azulY = 20 + Math.sin(t * 0.23) * 5;
  return (
    <AbsoluteFill style={{ background: COR.fundo, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${verdeX}% ${verdeY}%, rgba(46,155,62,0.20), transparent 70%),
                       radial-gradient(1000px 760px at ${azulX}% ${azulY}%, rgba(41,168,224,0.20), transparent 70%),
                       radial-gradient(1400px 900px at 50% 50%, rgba(18,32,48,0.9), transparent 80%)`,
        }}
      />
      {/* grade bem sutil, só para dar profundidade */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
    </AbsoluteFill>
  );
};
