/**
 * Confete.tsx — o estouro de confete e luz da abertura do Natal: papel em
 * leque (com gravidade, girando e balançando ao cair) e faíscas. Um canvas do
 * tamanho da tela, com o brilho pré-desenhado uma vez; roda uns 4 s e para.
 */
import { useEffect, useRef } from 'react';

type Ponto = { x: number; y: number };

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

/** Um brilho redondo pronto: o miolo branco e a borda na cor. */
function criarBrilho(cor: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.22, cor);
  grad.addColorStop(1, 'rgba(255, 233, 166, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

/** Uma estrelinha de quatro pontas, para as faíscas maiores. */
function criarEstrela(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 40;
  const g = c.getContext('2d')!;
  const halo = g.createRadialGradient(20, 20, 0, 20, 20, 20);
  halo.addColorStop(0, 'rgba(255,250,220,.9)');
  halo.addColorStop(0.3, 'rgba(255,224,130,.35)');
  halo.addColorStop(1, 'rgba(255,224,130,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 40, 40);
  g.fillStyle = '#fffbe8';
  g.beginPath();
  g.moveTo(20, 1);
  g.quadraticCurveTo(22, 18, 39, 20);
  g.quadraticCurveTo(22, 22, 20, 39);
  g.quadraticCurveTo(18, 22, 1, 20);
  g.quadraticCurveTo(18, 18, 20, 1);
  g.fill();
  return c;
}

interface Papel { x: number; y: number; vx: number; vy: number; giro: number; vgiro: number; largura: number; altura: number; cor: string; vida: number; dura: number; balanco: number; redondo: boolean }

/** Só ouro e branco: a purpurina do lacre. */
export const PURPURINA = ['#f4c542', '#ffe066', '#fff4c4', '#ffffff', '#c98f17'] as const;

const CORES_DO_CONFETE: readonly string[] = ['#e0283a', '#f4c542', '#2fa85a', '#ffffff', '#ff7aa8', '#7cc6ff', '#ffe066'];

/**
 * O estouro do pacote: confete em leque (com gravidade e o papel girando e
 * balançando ao cair) e faíscas de luz. Roda uns 4 s e para sozinho.
 */
export function Confete({ origem, cores = CORES_DO_CONFETE, quantidade = 280, forca = 1, className = 'np-confete' }: {
  origem: Ponto;
  cores?: readonly string[];
  quantidade?: number;
  /** Multiplica a velocidade do leque (o estouro do lacre é menor que o da festa). */
  forca?: number;
  /** Onde o canvas fica (a cesta da bola usa a dela, acima da página). */
  className?: string;
}) {
  const tela = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = tela.current;
    const cx = cv?.getContext('2d');
    if (!cv || !cx) return;
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = w; cv.height = h;
    const brilho = criarBrilho('#FFE9A6'), estrela = criarEstrela();
    const papeis: Papel[] = [];
    for (let i = 0; i < quantidade; i++) {
      // Em leque para cima, com um tanto para os lados.
      const ang = -Math.PI / 2 + acaso(-1.35, 1.35), vel = acaso(380, 1150) * forca;
      papeis.push({
        x: origem.x + acaso(-20, 20), y: origem.y + acaso(-14, 14),
        vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
        giro: acaso(0, Math.PI * 2), vgiro: acaso(-12, 12),
        largura: acaso(7, 13), altura: acaso(4, 8), cor: cores[i % cores.length],
        vida: 0, dura: acaso(2.6, 4.2), balanco: acaso(0, Math.PI * 2), redondo: Math.random() < 0.18,
      });
    }
    const luzes = Array.from({ length: Math.round(quantidade / 4) }, () => {
      const ang = acaso(0, Math.PI * 2), vel = acaso(120, 620) * forca;
      return { x: origem.x, y: origem.y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, vida: 0, dura: acaso(0.6, 1.4), tam: acaso(10, 34), estrela: Math.random() < 0.3 };
    });
    let antes = performance.now(), quadro = 0;
    const passo = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, w, h);
      let vivos = 0;
      for (const l of luzes) {
        l.vida += dt;
        if (l.vida >= l.dura) continue;
        vivos++;
        l.vx *= Math.pow(0.12, dt); l.vy *= Math.pow(0.12, dt);
        l.x += l.vx * dt; l.y += l.vy * dt;
        cx.globalAlpha = 1 - l.vida / l.dura;
        cx.drawImage(l.estrela ? estrela : brilho, l.x - l.tam / 2, l.y - l.tam / 2, l.tam, l.tam);
      }
      for (const p of papeis) {
        p.vida += dt;
        if (p.vida >= p.dura || p.y > h + 30) continue;
        vivos++;
        // O ar segura o papel: a queda fica mansa e ele balança de lado.
        p.vx *= Math.pow(0.35, dt);
        p.vy = p.vy * Math.pow(0.35, dt) + 520 * dt;
        p.balanco += dt * 5;
        p.x += (p.vx + Math.sin(p.balanco) * 40) * dt;
        p.y += p.vy * dt;
        p.giro += p.vgiro * dt;
        const resta = 1 - p.vida / p.dura;
        cx.globalAlpha = Math.min(1, resta * 3);
        // O papel virando: a largura encolhe e volta (é o giro em 3D, de mentira).
        const vira = Math.cos(p.balanco * 1.3);
        cx.setTransform(Math.cos(p.giro) * vira, Math.sin(p.giro) * vira, -Math.sin(p.giro), Math.cos(p.giro), p.x, p.y);
        cx.fillStyle = p.cor;
        if (p.redondo) { cx.beginPath(); cx.arc(0, 0, p.altura * 0.7, 0, Math.PI * 2); cx.fill(); }
        else cx.fillRect(-p.largura / 2, -p.altura / 2, p.largura, p.altura);
        cx.setTransform(1, 0, 0, 1, 0, 0);
      }
      cx.globalAlpha = 1;
      if (vivos) quadro = requestAnimationFrame(passo);
      else cx.clearRect(0, 0, w, h);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [origem, cores, quantidade, forca]);
  return <canvas ref={tela} className={className} aria-hidden />;
}
