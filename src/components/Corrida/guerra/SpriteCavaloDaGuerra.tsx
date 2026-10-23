/**
 * SpriteCavaloDaGuerra — o Cavalo da Guerra andando, pequeno, para a placa da
 * insígnia dele (`Insignias/Placas.tsx`). O mesmo desenho do chefe, refeito a
 * 10 quadros por segundo só enquanto a placa está aberta.
 */
import { useEffect, useRef } from 'react';
import { CW, CH, CAVALEIROS, criarDestino, construirCavalo } from './cavaloDaGuerra.js';

export function SpriteCavaloDaGuerra({ escala = 0.5, animado = true }: { escala?: number; animado?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, x = c?.getContext('2d');
    if (!c || !x) return;
    x.imageSmoothingEnabled = false;
    const d = criarDestino();
    let t = 0;
    const quadro = () => {
      construirCavalo({ t, modo: 'anda', p: (t * 0.85) % 1, furia: 1, jaw: 0, cab: 0, by: Math.round(Math.sin(t * 2.2) * 0.8), feridas: [], num: '' }, CAVALEIROS.guerra, d);
      x.clearRect(0, 0, c.width, c.height); x.drawImage(d.cv, 0, 0, CW, CH, 0, 0, c.width, c.height);
      t += 0.1;
    };
    quadro();
    if (!animado) return;
    const id = window.setInterval(quadro, 100);
    return () => window.clearInterval(id);
  }, [animado]);
  return <canvas ref={ref} width={Math.round(CW * escala)} height={Math.round(CH * escala)} style={{ imageRendering: 'pixelated' }} />;
}
