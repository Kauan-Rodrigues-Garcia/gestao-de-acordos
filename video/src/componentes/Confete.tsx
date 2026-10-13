// Confete em canvas: duas explosões dos cantos de baixo, com gravidade,
// arrasto do ar e papelzinho girando (achata e desachata).

import { useLayoutEffect, useMemo, useRef } from 'react';
import { AbsoluteFill, random, useCurrentFrame } from 'remotion';
import { FPS } from '../movimento';

const CORES = ['#4ade80', '#5cc8f5', '#f5a524', '#f472b6', '#ffffff', '#a78bfa', '#29a8e0', '#2e9b3e'];

type Papel = { x0: number; y0: number; vx: number; vy: number; giro: number; vgiro: number; l: number; a: number; cor: string; atraso: number };

export const Confete: React.FC<{ inicio: number; quantidade?: number }> = ({ inicio, quantidade = 320 }) => {
  const frame = useCurrentFrame();
  const canvas = useRef<HTMLCanvasElement>(null);

  const papeis = useMemo<Papel[]>(() => {
    return Array.from({ length: quantidade }).map((_, i) => {
      const lado = i % 2 === 0 ? -1 : 1;
      // canto esquerdo atira para a direita, o direito para a esquerda
      const desvio = 12 + random(`ang${i}`) * 38;
      const ang = (-90 + (lado < 0 ? desvio : -desvio)) * (Math.PI / 180);
      const v = 1300 + random(`v${i}`) * 1100;
      return {
        x0: lado < 0 ? -20 : 1940,
        y0: 1000 + random(`y${i}`) * 120,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        giro: random(`g${i}`) * Math.PI * 2,
        vgiro: (random(`vg${i}`) - 0.5) * 14,
        l: 9 + random(`l${i}`) * 9,
        a: 5 + random(`a${i}`) * 6,
        cor: CORES[Math.floor(random(`c${i}`) * CORES.length)],
        atraso: random(`d${i}`) * 0.25,
      };
    });
  }, [quantidade]);

  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);
    const tGlobal = (frame - inicio) / FPS;
    if (tGlobal < 0) return;
    for (const p of papeis) {
      const t = tGlobal - p.atraso;
      if (t < 0) continue;
      // arrasto do ar: velocidade cai exponencialmente; gravidade puxa
      const k = 1.6;
      const fator = (1 - Math.exp(-k * t)) / k;
      const x = p.x0 + p.vx * fator + Math.sin(t * 3 + p.giro) * 30 * Math.min(1, t);
      const y = p.y0 + p.vy * fator + 420 * t * t * 0.5 + 160 * t;
      if (y > 1200) continue;
      const alfa = Math.max(0, Math.min(1, 3.4 - t));
      if (alfa <= 0) continue;
      const g = p.giro + p.vgiro * t;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(g);
      ctx.scale(1, Math.cos(g * 1.7));
      ctx.globalAlpha = alfa;
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.l / 2, -p.a / 2, p.l, p.a);
      ctx.restore();
    }
  }, [frame, inicio, papeis]);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <canvas ref={canvas} width={1920} height={1080} style={{ width: 1920, height: 1080 }} />
    </AbsoluteFill>
  );
};
