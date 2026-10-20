/**
 * SpriteBruxa.tsx — uma bruxa da caça num canvas, em pixel de verdade: o
 * par do `SpriteZumbi` para o cartão de Configurações.
 *
 * Usa os mesmos quadros do palco (`pixels.ts`): voando (os quadros do voo,
 * em laço) ou parada no primeiro; ou só a cabeça com o chapéu, o ícone da
 * linha do dia (de olho apagado, se morreu).
 */
import { useEffect, useRef } from 'react';
import { ALTURA, LARGURA, MS_POR_QUADRO, VOO, type Bruxa } from './arte';
import { cabecaDaBruxa, quadrosDa } from './pixels';

interface Props {
  bruxa: Bruxa;
  /** Quantas vezes ampliar (inteiro). */
  escala?: number;
  animado?: boolean;
  soCabeca?: boolean;
  morta?: boolean;
  className?: string;
  titulo?: string;
}

export function SpriteBruxa({ bruxa, escala = 1, animado = false, soCabeca = false, morta = false, className, titulo }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cabeca = soCabeca ? cabecaDaBruxa(bruxa, morta) : null;
  const largura = cabeca?.width ?? LARGURA;
  const altura = cabeca?.height ?? ALTURA;

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const pintar = (c: HTMLCanvasElement) => { ctx.clearRect(0, 0, largura, altura); ctx.drawImage(c, 0, 0); };
    if (cabeca) { pintar(cabeca); return; }
    const quadros = quadrosDa(bruxa, false).direita;
    pintar(quadros[0]);
    if (!animado) return;
    let i = 0;
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      i = (i + 1) % VOO.length;
      pintar(quadros[i]);
    }, MS_POR_QUADRO);
    return () => clearInterval(t);
  }, [bruxa, animado, cabeca, largura, altura]);

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
