/**
 * SpriteZumbi.tsx — um zumbi da caça num canvas, em pixel de verdade.
 *
 * O canvas tem o tamanho do sprite (um pixel por pixel da arte) e o CSS o
 * amplia por um número INTEIRO com `image-rendering: pixelated`: nada borra.
 * Serve ao cartão de Configurações, à faixa e ao recado; o zumbi escondido
 * (`cena.tsx`) usa os mesmos quadros, mas controla a animação ele mesmo.
 */
import { useEffect, useRef } from 'react';
import { ALTURA, LARGURA, MS_POR_QUADRO, QUADROS, type Zumbi } from './zumbis';
import { cabecaDoZumbi, quadrosDoZumbi } from './pixels';

interface Props {
  zumbi: Zumbi;
  /** Quantas vezes ampliar (inteiro). */
  escala?: number;
  /** Cambaleia (os 4 quadros) ou fica parado no primeiro. */
  animado?: boolean;
  /** Só a cabeça (o ícone). */
  soCabeca?: boolean;
  morta?: boolean;
  className?: string;
  titulo?: string;
}

export function SpriteZumbi({ zumbi, escala = 2, animado = false, soCabeca = false, morta = false, className, titulo }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    if (soCabeca) { ctx.putImageData(cabecaDoZumbi(zumbi, morta), 0, 0); return; }
    const quadros = quadrosDoZumbi(zumbi);
    ctx.putImageData(quadros[0], 0, 0);
    if (!animado) return;
    let i = 0;
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      i = (i + 1) % QUADROS.length;
      ctx.putImageData(quadros[i], 0, 0);
    }, MS_POR_QUADRO);
    return () => clearInterval(t);
  }, [zumbi, animado, soCabeca, morta]);

  // A cabeça, com moicano, machado, boné e véu, cabe nas colunas 0 a 21 e nas linhas 0 a 13.
  const largura = soCabeca ? 22 : LARGURA;
  const altura = soCabeca ? 14 : ALTURA;
  return (
    <canvas
      ref={ref}
      width={largura}
      height={altura}
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      style={{ width: largura * escala, height: altura * escala, imageRendering: 'pixelated' }}
    />
  );
}
