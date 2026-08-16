/**
 * CampoParticulas — partículas em Canvas, reagindo ao cursor.
 * ─────────────────────────────────────────────────────────────────────────────
 * Um canvas só, um `requestAnimationFrame` só. A alternativa — um elemento por
 * partícula — colocaria centenas de nós no DOM e faria o navegador recalcular
 * layout a cada quadro.
 *
 * ## O que segura o custo
 *
 *   • quantidade proporcional à ÁREA, com teto — telas grandes não viram
 *     milhares de partículas;
 *   • `devicePixelRatio` limitado a 2 — em telas 3x o ganho visual não paga o
 *     triplo de pixels;
 *   • laço PARADO quando a aba está escondida (Visibility API) e quando o
 *     elemento sai da tela (IntersectionObserver);
 *   • sem alocação dentro do laço: as partículas são criadas uma vez e
 *     atualizadas no lugar.
 *
 * Quem escolheu movimento reduzido não monta este componente: cem pontos
 * flutuando é exatamente o que essa escolha quer evitar. Repare que a decisão
 * vem da PESSOA, pelo provider, e não direto do `prefers-reduced-motion` — ver
 * `theme/CreatorsProvider.tsx` para o porquê.
 */
import { useEffect, useRef } from 'react';
import { distancia, influencia, repulsao, limitar } from '../lib/matematica';

interface Particula {
  x: number; y: number;
  vx: number; vy: number;
  raio: number;
  brilhoBase: number;
}

export function CampoParticulas({
  cor, corLigacao, ativo = true, densidade = 1,
}: {
  cor: string;
  corLigacao: string;
  /** false = não desenha nem agenda quadro. */
  ativo?: boolean;
  /** Multiplicador da quantidade. Mobile usa menos. */
  densidade?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef  = useRef({ x: -9999, y: -9999 });
  const frameRef  = useRef<number | null>(null);
  const rodandoRef = useRef(true);

  useEffect(() => {
    if (!ativo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;   // fallback: sem contexto, a página segue sem partículas

    let largura = 0;
    let altura  = 0;
    let particulas: Particula[] = [];

    // Acima de 2 o custo cresce com o quadrado e o olho não acompanha.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function semear() {
      const area = largura * altura;
      // Uma partícula a cada ~14.000 px², com teto — sem o teto, um monitor
      // ultrawide geraria três vezes mais que um notebook.
      const quantidade = Math.min(Math.round((area / 14000) * densidade), 140);
      particulas = Array.from({ length: quantidade }, () => ({
        x: Math.random() * largura,
        y: Math.random() * altura,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        raio: 0.7 + Math.random() * 1.6,
        brilhoBase: 0.18 + Math.random() * 0.35,
      }));
    }

    function medir() {
      const pai = canvas.parentElement;
      largura = pai?.clientWidth  ?? window.innerWidth;
      altura  = pai?.clientHeight ?? window.innerHeight;
      canvas.width  = Math.floor(largura * dpr);
      canvas.height = Math.floor(altura * dpr);
      canvas.style.width  = `${largura}px`;
      canvas.style.height = `${altura}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      semear();
    }

    const RAIO_MOUSE = 140;

    function quadro() {
      if (!rodandoRef.current) { frameRef.current = null; return; }

      ctx.clearRect(0, 0, largura, altura);
      const { x: mx, y: my } = mouseRef.current;

      for (const p of particulas) {
        // Repulsão suave: a força cai com o quadrado da distância e é limitada
        // — ver `repulsao`, que trata o caso do cursor exatamente em cima.
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < RAIO_MOUSE) {
          const { fx, fy } = repulsao(dx, dy, 900, 12, 1.4);
          p.vx += fx * 0.02;
          p.vy += fy * 0.02;
        }

        // Atrito, senão a energia da repulsão se acumula para sempre.
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.vx = limitar(p.vx, -1.6, 1.6);
        p.vy = limitar(p.vy, -1.6, 1.6);

        p.x += p.vx;
        p.y += p.vy;

        // Envolve nas bordas em vez de refletir: parece um campo contínuo.
        if (p.x < -8) p.x = largura + 8;
        if (p.x > largura + 8) p.x = -8;
        if (p.y < -8) p.y = altura + 8;
        if (p.y > altura + 8) p.y = -8;

        const perto = influencia(dist, RAIO_MOUSE);
        ctx.globalAlpha = Math.min(p.brilhoBase + perto * 0.65, 1);
        ctx.fillStyle = cor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.raio + perto * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ligações só perto do cursor: ligar todas contra todas é O(n²) e some
      // no ruído visual. Perto do mouse a malha aparece e faz sentido.
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = corLigacao;
      for (let i = 0; i < particulas.length; i++) {
        const a = particulas[i];
        if (distancia(a.x, a.y, mx, my) > RAIO_MOUSE) continue;
        for (let j = i + 1; j < particulas.length; j++) {
          const b = particulas[j];
          const d = distancia(a.x, a.y, b.x, b.y);
          if (d > 92) continue;
          ctx.globalAlpha = (1 - d / 92) * 0.35;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      frameRef.current = requestAnimationFrame(quadro);
    }

    function retomar() {
      if (frameRef.current === null && rodandoRef.current) {
        frameRef.current = requestAnimationFrame(quadro);
      }
    }

    function aoMover(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function aoSair() { mouseRef.current = { x: -9999, y: -9999 }; }

    function aoTrocarVisibilidade() {
      rodandoRef.current = !document.hidden;
      if (document.hidden) {
        if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
      } else {
        retomar();
      }
    }

    medir();
    rodandoRef.current = !document.hidden;
    retomar();

    // `passive` porque nunca chamamos preventDefault — sem isso o navegador
    // precisa esperar o handler antes de rolar.
    window.addEventListener('pointermove', aoMover, { passive: true });
    window.addEventListener('pointerleave', aoSair);
    window.addEventListener('resize', medir);
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerleave', aoSair);
      window.removeEventListener('resize', medir);
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    };
  }, [cor, corLigacao, ativo, densidade]);

  if (!ativo) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    />
  );
}
