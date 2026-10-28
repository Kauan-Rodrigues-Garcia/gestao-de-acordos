/**
 * TelaQueDesmancha.tsx — a tela desmanchando como a Coisa (`desmanche.ts`).
 *
 * Põe o retrato da tela (`fotografar.ts`) por cima, no lugar exato, e
 * desmancha: o que estava embaixo dele (o mural, o palco de Derry) vai
 * aparecendo.
 */
import { useEffect, useRef } from 'react';
import { Desmanche, type Pixels } from './desmanche';
import { useVelocidadeDoMural } from './estado';

interface Props {
  foto: Pixels;
  /** De onde começa, em fração da tela (0 a 1). */
  origens: readonly (readonly [number, number])[];
  duracaoS: number;
  leve?: boolean;
  semente?: number;
  aoTerminar: () => void;
  className?: string;
}

export function TelaQueDesmancha({ foto, origens, duracaoS, leve = false, semente, aoTerminar, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const v = useVelocidadeDoMural();
  const vRef = useRef(v);
  vRef.current = v;
  const fim = useRef(aoTerminar);
  fim.current = aoTerminar;

  useEffect(() => {
    const cv = ref.current;
    const c = cv?.getContext('2d', { willReadFrequently: true });
    if (!cv || !c) return;
    cv.width = foto.width;
    cv.height = foto.height;
    const d = new Desmanche(foto, {
      origens: origens.map(([x, y]) => [x * foto.width, y * foto.height] as const),
      duracaoS,
      semente,
      densidade: leve ? 0.05 : 0.13,
      tamDaLasca: 2,
    });
    const img = new ImageData(d.quadro, d.largura, d.altura);
    c.putImageData(img, 0, 0);
    let id = 0, antesMs = performance.now(), acabou = false;
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - antesMs) / 1000) * vRef.current;
      antesMs = agora;
      const segue = d.passo(dt);
      c.putImageData(img, 0, 0);
      if (segue) id = requestAnimationFrame(quadro);
      else if (!acabou) { acabou = true; fim.current(); }
    };
    id = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(id);
    // O desmanche é um só: começa com o retrato e vai até o fim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto]);

  return <canvas ref={ref} className={`portal-desmanche${className ? ` ${className}` : ''}`} aria-hidden />;
}
