/**
 * Artes.tsx — os desenhos do mural, todos das próprias gincanas (nada
 * redesenhado): os zumbis da caça, o Rei do Pop, as bruxas, a Bruxa do
 * Pântano do Minecraft, o Cavalo da Guerra e a garrafa do jogo.
 */
import { useEffect, useRef } from 'react';
import { SpriteZumbi } from '@/components/Insignias/desenhos/SpriteZumbi';
import { ZUMBIS } from '@/components/Insignias/desenhos/zumbis';
import { CHEFAO } from '@/components/Insignias/desenhos/chefaoArte';
import { SpriteBruxa } from '@/components/Insignias/desenhos/bruxas/SpriteBruxa';
import { BRUXAS } from '@/components/Insignias/desenhos/bruxas/arte';
import { canvasDaImagem, miniatura } from '@/components/Insignias/desenhos/bruxas/pixels';
import { DROPS, QUADROS_FLUTUANDO, comContorno, montarBruxaMC } from '@/components/Insignias/desenhos/bruxas/chefona/arte';
import { SpriteCavaloDaGuerra } from '@/components/Corrida/guerra/SpriteCavaloDaGuerra';
import type { IdInsignia } from '@/components/Insignias/insignias';

/** Um canvas de pixel ampliado por CSS, sem borrar. */
function Ampliado({ canvas, escala }: { canvas: HTMLCanvasElement; escala: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    canvas.style.width = `${canvas.width * escala}px`;
    canvas.style.height = `${canvas.height * escala}px`;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    el.replaceChildren(canvas);
  }, [canvas, escala]);
  return <div ref={ref} />;
}

/** A Bruxa do Pântano flutuando (os quadros do jogo). */
function BruxaDoPantano({ escala }: { escala: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, c = cv?.getContext('2d');
    if (!cv || !c) return;
    const quadros = Array.from({ length: QUADROS_FLUTUANDO }, (_, i) => canvasDaImagem(montarBruxaMC(i), false));
    cv.width = quadros[0].width;
    cv.height = quadros[0].height;
    let i = 0;
    const desenhar = () => { c.clearRect(0, 0, cv.width, cv.height); c.drawImage(quadros[i], 0, 0); i = (i + 1) % quadros.length; };
    desenhar();
    const id = window.setInterval(desenhar, 180);
    return () => window.clearInterval(id);
  }, []);
  return <canvas ref={ref} style={{ imageRendering: 'pixelated', transform: `scale(${escala})`, transformOrigin: 'bottom center' }} />;
}

/** `fator` encolhe a arte (no mural ela vai numa foto pequena); o pixel continua inteiro. */
export function ArteDaGincana({ id, fator = 1 }: { id: IdInsignia; fator?: number }) {
  const inteiro = (n: number) => Math.max(1, Math.round(n * fator));
  switch (id) {
    case 'zumbi':
      return (
        <div className="portal-arte-fila">
          {ZUMBIS.slice(0, 3).map((z, i) => <SpriteZumbi key={i} zumbi={z} escala={inteiro(5)} animado />)}
        </div>
      );
    case 'reiDoPop':
      return <SpriteZumbi zumbi={CHEFAO} escala={inteiro(8)} animado />;
    case 'bruxas':
      return (
        <div className="portal-arte-fila">
          {[BRUXAS[0], BRUXAS[Math.min(2, BRUXAS.length - 1)]].map((b, i) => <SpriteBruxa key={i} bruxa={b} escala={inteiro(4)} animado />)}
        </div>
      );
    case 'pantano':
      return <div style={{ height: 84 * 3.4 * fator, display: 'flex', alignItems: 'flex-end' }}><BruxaDoPantano escala={3.4 * fator} /></div>;
    case 'guerra':
      return <SpriteCavaloDaGuerra escala={1.9 * fator} animado />;
  }
}

/** A garrafa do jogo (a vazia, que a bruxa larga). */
export function ArteGarrafa({ escala = 12 }: { escala?: number }) {
  const canvas = miniatura(comContorno(DROPS[1]))[0];
  return <Ampliado canvas={canvas} escala={escala} />;
}
