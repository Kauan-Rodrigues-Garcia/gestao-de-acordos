/** Um bichinho vivo num canvas pequeno (pisca, respira, olha em volta). Leve: um canvas, um requestAnimationFrame. */
import { useEffect, useRef } from 'react';
import { CALMO, desenhaBichinho, altoDemais, type Estilo } from './motor/bichinhos';

interface Props {
  est: Estilo;
  tamanho: number;
  feliz?: boolean;
  className?: string;
  /** Um atraso de fase, para três lado a lado não piscarem juntos. */
  fase?: number;
}

export function MiniBichinho({ est, tamanho, feliz, className, fase = 0 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = tamanho * dpr; cv.height = tamanho * dpr;
    const c = cv.getContext('2d'); if (!c) return;
    let raf = 0;
    const r = tamanho * 0.27, base = tamanho * (altoDemais(est) ? 0.6 : 0.55);
    const quadro = (ms: number) => {
      const t = ms / 1000 + fase;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, tamanho, tamanho);
      const pulo = CALMO ? 0 : Math.abs(Math.sin(t * 2.2)) * tamanho * 0.025;
      desenhaBichinho(c, tamanho / 2, base - pulo, r, est, {
        expr: feliz ? 'feliz' : (Math.floor(t / 2.7) % 5 === 3 ? 'feliz' : 'normal'),
        lx: CALMO ? 0.2 : Math.sin(t * 0.7) * 0.7, ly: CALMO ? 0.1 : Math.cos(t * 0.5) * 0.3, t, pisca: !CALMO && (t % 3.4) < 0.12,
      });
      if (!CALMO) raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [est, tamanho, feliz, fase]);
  return <canvas ref={ref} className={className} style={{ width: tamanho, height: tamanho }} aria-hidden="true" />;
}
