// O céu da noite do vídeo: o fundo da conversa do começo, da demonstração do
// Halloween (atrás da janela do sistema) e da montagem do fim. Estrelas
// piscando e andando devagar, e o chão iluminado de roxo.

import { AbsoluteFill, useCurrentFrame } from 'remotion';

export const L = 1920;
/** 1920 × 936: a proporção da área do navegador (ver `Root.tsx`). */
export const A = 936;

export function sorteio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ESTRELAS = (() => {
  const r = sorteio(1031);
  return Array.from({ length: 110 }, () => ({ x: r() * L, y: r() * A * 0.8, tam: 1 + r() * 2.2, vel: 0.6 + r() * 1.8, fase: r() * 6.28, deriva: 3 + r() * 9 }));
})();

/** O céu; `quente` (0 a 1) mistura um brilho dourado no alto (a luz do presente se desfazendo). */
export const Ceu: React.FC<{ quente?: number }> = ({ quente = 0 }) => {
  const t = useCurrentFrame() / 60;
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 95% at 50% 115%, #2d2158 0%, #161135 46%, #08071b 100%)' }}>
      {ESTRELAS.map((e, i) => (
        <div key={i} style={{
          position: 'absolute', left: ((e.x - e.deriva * t) % L + L) % L, top: e.y, width: e.tam, height: e.tam, borderRadius: '50%',
          background: '#fff', opacity: 0.25 + 0.6 * Math.abs(Math.sin(t * e.vel + e.fase)),
        }} />
      ))}
      <div style={{ position: 'absolute', left: -200, right: -200, bottom: -260, height: 520, borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(150,110,255,.28), transparent)' }} />
      {quente > 0 && <AbsoluteFill style={{ background: 'radial-gradient(70% 60% at 50% 14%, rgba(255,214,120,.55), transparent 70%)', opacity: quente }} />}
    </AbsoluteFill>
  );
};
