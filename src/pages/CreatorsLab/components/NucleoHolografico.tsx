/**
 * NucleoHolografico — o objeto 3D, em Canvas 2D e matemática própria.
 * ─────────────────────────────────────────────────────────────────────────────
 * Um icosaedro aramado girando, que se inclina na direção do cursor. A rotação,
 * a projeção em perspectiva e a ordenação por profundidade vêm de
 * `lib/projecao3d.ts` — ver lá o porquê de não haver Three.js aqui.
 *
 * ## Fallback
 *
 * Canvas 2D é o caminho de menor risco: existe em praticamente todo navegador,
 * não depende de driver de vídeo e não falha em máquina fraca do jeito que
 * WebGL falha. Ainda assim, se `getContext('2d')` devolver nulo, o componente
 * mostra um emblema estático em vez de sumir — e nada quebra.
 *
 * Com movimento reduzido o sólido é desenhado UMA vez, parado. Continua sendo
 * 3D de verdade; só não gira.
 */
import { useEffect, useRef, useState } from 'react';
import {
  icosaedro, transformar, ordenarPorProfundidade, opacidadePorProfundidade,
} from '../lib/projecao3d';
import { limitar } from '../lib/matematica';

export function NucleoHolografico({
  cor, corSecundaria, tamanho = 260, movimentoReduzido = false,
}: {
  cor: string;
  corSecundaria: string;
  tamanho?: number;
  movimentoReduzido?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef  = useRef<number | null>(null);
  const alvoRef   = useRef({ x: 0, y: 0 });
  const atualRef  = useRef({ x: 0, y: 0 });
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setFalhou(true); return; }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = tamanho * dpr;
    canvas.height = tamanho * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const raio = tamanho * 0.3;
    const solido = icosaedro(raio);
    const centro = tamanho / 2;
    let giro = 0;
    let rodando = true;

    function desenhar(anguloY: number, anguloX: number) {
      ctx.clearRect(0, 0, tamanho, tamanho);

      const pontos = transformar(solido.vertices, anguloY, anguloX, centro, centro, raio * 4.2);
      const arestas = ordenarPorProfundidade(solido.arestas, pontos);

      for (const [ia, ib] of arestas) {
        const a = pontos[ia];
        const b = pontos[ib];
        const zMedio = (a.z + b.z) / 2;
        const opacidade = opacidadePorProfundidade(zMedio, raio);

        ctx.globalAlpha = opacidade;
        // A aresta mais próxima ganha a cor de destaque — dá leitura de
        // profundidade sem precisar de sombra.
        ctx.strokeStyle = zMedio < -raio * 0.45 ? corSecundaria : cor;
        ctx.lineWidth = 0.6 + opacidade * 1.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Vértices por cima das linhas, com tamanho pela profundidade.
      for (const p of pontos) {
        const opacidade = opacidadePorProfundidade(p.z, raio);
        ctx.globalAlpha = opacidade;
        ctx.fillStyle = cor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1 + p.escala * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    if (movimentoReduzido) {
      // Um quadro, num ângulo bonito, e pronto.
      desenhar(0.6, -0.35);
      return;
    }

    function quadro() {
      if (!rodando) { frameRef.current = null; return; }

      giro += 0.005;

      // Suavização: o sólido persegue o alvo em vez de saltar para ele. É o
      // que faz a reação ao mouse parecer inércia, e não teletransporte.
      atualRef.current.x += (alvoRef.current.x - atualRef.current.x) * 0.06;
      atualRef.current.y += (alvoRef.current.y - atualRef.current.y) * 0.06;

      desenhar(giro + atualRef.current.x, atualRef.current.y);
      frameRef.current = requestAnimationFrame(quadro);
    }

    function aoMover(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      alvoRef.current = { x: limitar(nx, -1, 1) * 0.6, y: limitar(ny, -1, 1) * -0.5 };
    }

    function aoTrocarVisibilidade() {
      rodando = !document.hidden;
      if (document.hidden) {
        if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
      } else if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(quadro);
      }
    }

    frameRef.current = requestAnimationFrame(quadro);
    window.addEventListener('pointermove', aoMover, { passive: true });
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);

    return () => {
      rodando = false;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      window.removeEventListener('pointermove', aoMover);
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    };
  }, [cor, corSecundaria, tamanho, movimentoReduzido]);

  if (falhou) {
    return (
      <div
        className="flex items-center justify-center rounded-full border-2"
        style={{ width: tamanho, height: tamanho, borderColor: cor, color: cor }}
        role="img"
        aria-label="Núcleo do sistema"
      >
        <span className="font-mono text-xs tracking-widest">CORE</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: tamanho, height: tamanho }}
      role="img"
      aria-label="Icosaedro giratório — os vértices saem da razão áurea"
    />
  );
}
