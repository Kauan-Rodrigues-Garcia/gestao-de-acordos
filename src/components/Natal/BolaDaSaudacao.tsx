/**
 * BolaDaSaudacao — no Natal, o sólido da saudação (`FormaSaudacao`) vira uma
 * bola de árvore pendurada no varal de luzes do alto (Cleber, 29/10/2026).
 *
 * A bola gira de verdade: é um globo em Canvas 2D, com as faixas douradas e os
 * flocos presos na superfície. Eles somem atrás da curva e encurtam perto da
 * borda, como num enfeite girando no fio. O brilho e a sombra ficam parados,
 * porque é a luz da sala, não a bola. O clique dá um giro forte, que vai
 * perdendo força, e um empurrão no balanço.
 *
 * O fio sobe até o varal: a bola mede onde o fio do varal passa em cima dela
 * (`varal.ts`, a mesma curva que o desenha) e estica a linha até lá. As bolas
 * de enfeite do varal que caírem em cima dela ficam escondidas enquanto ela
 * está na tela, para não penduradas duas no mesmo lugar.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { VAO, naCurva } from './varal';
import './saudacao.css';

/** A bola tem o diâmetro da linha da saudação (`text-2xl`, 32 px). */
const RAIO = 16;
const LARGURA = 40;
const ALTURA = 48;
const CX = LARGURA / 2;
const CY = 29;
/** Onde o fio prende: o meio da argola, no alto do canvas. */
const ARGOLA_Y = 5;
/*
 * O alinhamento com o texto: o título centraliza a caixa de margem de cada
 * item, e o centro da bola não é o meio do canvas (a argola fica em cima).
 * As margens negativas fazem o meio da caixa de margem cair em `CY`, e o
 * canvas não aumenta a altura da linha.
 */
const MARGEM_BAIXO = 6;
const MARGEM_CIMA = 2 * CY - ALTURA + MARGEM_BAIXO;

/** Giro de repouso e o do clique (rad/s), e quanto o clique perde por segundo. */
const GIRO_BASE = 0.85;
const GIRO_CLIQUE = 11;
const FREIO = 1.1;
/** A bola é vista um pouco de cima: o eixo inclina para quem olha. */
const INCLINACAO = 0.28;

/** A mesma escolha de movimento do CreatorsLab que a `FormaSaudacao` respeita. */
function movimentoReduzido(): boolean {
  try { return localStorage.getItem('creatorsLab:movimento') === 'reduzido'; }
  catch { return false; }
}

/** Projeta um ponto da superfície (latitude, longitude já girada). */
function projetar(lat: number, lon: number) {
  const X = Math.cos(lat) * Math.sin(lon);
  const Y = Math.sin(lat);
  const Z = Math.cos(lat) * Math.cos(lon);
  const y = Y * Math.cos(INCLINACAO) - Z * Math.sin(INCLINACAO);
  const z = Z * Math.cos(INCLINACAO) + Y * Math.sin(INCLINACAO);
  return { x: CX + RAIO * X, y: CY - RAIO * y, z, X };
}

function desenhar(cx: CanvasRenderingContext2D, giro: number) {
  cx.clearRect(0, 0, LARGURA, ALTURA);

  // ── A esfera ──
  const base = cx.createRadialGradient(CX - RAIO * 0.38, CY - RAIO * 0.42, 1, CX, CY, RAIO * 1.15);
  base.addColorStop(0, '#ff7f86');
  base.addColorStop(0.3, '#e0283a');
  base.addColorStop(0.75, '#9a0f20');
  base.addColorStop(1, '#5a0611');
  cx.beginPath();
  cx.arc(CX, CY, RAIO, 0, Math.PI * 2);
  cx.fillStyle = base;
  cx.fill();

  cx.save();
  cx.beginPath();
  cx.arc(CX, CY, RAIO, 0, Math.PI * 2);
  cx.clip();

  // Faixas douradas: dois paralelos perto do equador, em pedacinhos (some atrás).
  cx.lineCap = 'round';
  for (const lat of [-0.24, 0.24]) {
    for (let i = 0; i < 72; i++) {
      const a = projetar(lat, (i / 72) * Math.PI * 2 + giro);
      const b = projetar(lat, ((i + 1) / 72) * Math.PI * 2 + giro);
      if (a.z <= 0 && b.z <= 0) continue;
      cx.globalAlpha = 0.35 + 0.65 * Math.max(0, (a.z + b.z) / 2);
      cx.strokeStyle = '#f6cf5c';
      cx.lineWidth = 1.5;
      cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
    }
  }
  // Entre as faixas, contas de purpurina.
  for (let i = 0; i < 18; i++) {
    const p = projetar(0, (i / 18) * Math.PI * 2 + giro);
    if (p.z <= 0) continue;
    cx.globalAlpha = 0.4 + 0.6 * p.z;
    cx.fillStyle = i % 2 ? '#fff3c4' : '#f4c542';
    cx.beginPath(); cx.arc(p.x, p.y, 0.7 + 0.8 * p.z, 0, Math.PI * 2); cx.fill();
  }
  // Flocos: uma fileira em cima, outra embaixo, desencontradas.
  cx.strokeStyle = '#ffffff';
  cx.lineWidth = 0.9;
  for (let fileira = 0; fileira < 2; fileira++) {
    const lat = fileira ? -0.68 : 0.62;
    for (let i = 0; i < 6; i++) {
      const lon = (i / 6) * Math.PI * 2 + (fileira ? Math.PI / 6 : 0) + giro;
      const p = projetar(lat, lon);
      if (p.z <= 0.05) continue;
      const s = RAIO * 0.18;
      cx.save();
      cx.translate(p.x, p.y);
      // Encurta de lado conforme vira para a borda (e um pouco de cima a baixo, pelo alto da bola).
      cx.scale(0.2 + 0.8 * Math.sqrt(1 - p.X * p.X), 0.78 + 0.22 * p.z);
      cx.globalAlpha = 0.95 * p.z;
      cx.beginPath();
      for (let k = 0; k < 3; k++) {
        const ang = (k * Math.PI) / 3;
        const dx = Math.cos(ang) * s, dy = Math.sin(ang) * s;
        cx.moveTo(-dx, -dy); cx.lineTo(dx, dy);
        // As farpas da ponta.
        for (const lado of [1, -1]) {
          const px = dx * 0.62 * lado, py = dy * 0.62 * lado;
          const ang2 = ang + (lado > 0 ? 0 : Math.PI);
          cx.moveTo(px, py); cx.lineTo(px + Math.cos(ang2 + 0.7) * 1.3, py + Math.sin(ang2 + 0.7) * 1.3);
          cx.moveTo(px, py); cx.lineTo(px + Math.cos(ang2 - 0.7) * 1.3, py + Math.sin(ang2 - 0.7) * 1.3);
        }
      }
      cx.stroke();
      cx.restore();
    }
  }
  cx.restore();
  cx.globalAlpha = 1;

  // ── A luz da sala (parada) ──
  const borda = cx.createRadialGradient(CX, CY, RAIO * 0.55, CX, CY, RAIO);
  borda.addColorStop(0, 'rgba(40, 0, 6, 0)');
  borda.addColorStop(1, 'rgba(40, 0, 6, .42)');
  cx.fillStyle = borda;
  cx.beginPath(); cx.arc(CX, CY, RAIO, 0, Math.PI * 2); cx.fill();

  // O reflexo da janela: uma mancha larga e um ponto.
  cx.save();
  cx.translate(CX - RAIO * 0.4, CY - RAIO * 0.44);
  cx.rotate(-0.65);
  const reflexo = cx.createRadialGradient(0, 0, 0, 0, 0, RAIO * 0.36);
  reflexo.addColorStop(0, 'rgba(255,255,255,.85)');
  reflexo.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = reflexo;
  cx.scale(1, 0.6);
  cx.beginPath(); cx.arc(0, 0, RAIO * 0.36, 0, Math.PI * 2); cx.fill();
  cx.restore();
  cx.fillStyle = 'rgba(255,255,255,.9)';
  cx.beginPath(); cx.arc(CX - RAIO * 0.5, CY - RAIO * 0.5, 1.3, 0, Math.PI * 2); cx.fill();
  // A luz que volta da parede, embaixo e à direita.
  cx.strokeStyle = 'rgba(255, 170, 170, .35)';
  cx.lineWidth = 1.2;
  cx.beginPath(); cx.arc(CX, CY, RAIO - 1.2, 0.15, 1.35); cx.stroke();

  // ── O pino e a argola ──
  const topo = CY - RAIO;
  const metal = cx.createLinearGradient(CX - 6, 0, CX + 6, 0);
  metal.addColorStop(0, '#7a5410');
  metal.addColorStop(0.35, '#ffe9a6');
  metal.addColorStop(0.6, '#d4a63a');
  metal.addColorStop(1, '#6e4a0c');
  cx.fillStyle = metal;
  cx.beginPath();
  cx.moveTo(CX - 5.5, topo - 5.5);
  cx.lineTo(CX + 5.5, topo - 5.5);
  cx.lineTo(CX + 5.5, topo + 0.5);
  cx.quadraticCurveTo(CX, topo + 2.6, CX - 5.5, topo + 0.5);
  cx.closePath();
  cx.fill();
  cx.strokeStyle = 'rgba(90, 60, 10, .55)';
  cx.lineWidth = 0.6;
  for (let i = -3; i <= 3; i += 2) {
    cx.beginPath(); cx.moveTo(CX + i, topo - 5); cx.lineTo(CX + i, topo + 0.8); cx.stroke();
  }
  cx.strokeStyle = '#d9b24a';
  cx.lineWidth = 1.3;
  cx.beginPath(); cx.arc(CX, ARGOLA_Y, 2.6, 0, Math.PI * 2); cx.stroke();
}

export function BolaDaSaudacao() {
  const caixa = useRef<HTMLSpanElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  /** Do fio do varal até a argola, em px. Zero: sem varal, só a bola. */
  const [fio, setFio] = useState(0);
  const empurrao = useRef<HTMLSpanElement>(null);
  const velocidade = useRef(GIRO_BASE);
  const [parada] = useState(movimentoReduzido);

  // O giro.
  useEffect(() => {
    const cv = tela.current;
    const cx = cv?.getContext('2d');
    if (!cv || !cx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = LARGURA * dpr;
    cv.height = ALTURA * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let giro = 0.4, antes = performance.now(), quadro = 0, visivel = true;
    const passo = (agora: number) => {
      const dt = Math.min(0.1, (agora - antes) / 1000);
      antes = agora;
      const v = velocidade.current;
      velocidade.current = GIRO_BASE + (v - GIRO_BASE) * Math.exp(-FREIO * dt);
      giro += velocidade.current * dt;
      desenhar(cx, giro);
      if (visivel && !parada) quadro = requestAnimationFrame(passo);
    };
    desenhar(cx, giro);
    // Fora da tela (rolou para baixo), para de desenhar.
    const obs = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      cancelAnimationFrame(quadro);
      if (visivel && !parada) { antes = performance.now(); quadro = requestAnimationFrame(passo); }
    });
    obs.observe(cv);
    return () => { cancelAnimationFrame(quadro); obs.disconnect(); };
  }, [parada]);

  // O fio até o varal.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let escondidas: HTMLElement[] = [];
    const mostrar = () => { escondidas.forEach(b => { b.style.visibility = ''; }); escondidas = []; };
    const medir = () => {
      const varal = document.querySelector<HTMLElement>('.nt-varal');
      mostrar();
      if (!varal) { setFio(0); return false; }
      const v = varal.getBoundingClientRect(), b = el.getBoundingClientRect();
      const meio = b.left + b.width / 2;
      const t = ((((meio - v.left) % VAO) + VAO) % VAO) / VAO;
      setFio(Math.max(0, Math.round(b.top + ARGOLA_Y - (v.top + naCurva(t).y))));
      document.querySelectorAll<HTMLElement>('.nt-bola').forEach(bola => {
        const r = bola.getBoundingClientRect();
        if (Math.abs(r.left + r.width / 2 - meio) < 40) { bola.style.visibility = 'hidden'; escondidas.push(bola); }
      });
      return true;
    };
    // O varal desce num pedaço à parte (lazy): tenta de novo até ele chegar.
    let tentativas = 0;
    const procurar = window.setInterval(() => { if (medir() || ++tentativas > 20) window.clearInterval(procurar); }, 250);
    medir();
    const obs = new ResizeObserver(() => { medir(); });
    obs.observe(el.closest('main') ?? document.body);
    window.addEventListener('resize', medir);
    return () => {
      window.clearInterval(procurar);
      obs.disconnect();
      window.removeEventListener('resize', medir);
      mostrar();
    };
  }, []);

  /*
   * Duas camadas que balançam do mesmo ponto (o laço no varal) e se somam: o
   * balanço de sempre (CSS) e, por cima, o empurrão do clique (uma animação
   * avulsa, que pode recomeçar sem remontar o canvas).
   */
  const empurrar = () => {
    velocidade.current = GIRO_CLIQUE;
    if (parada) return;
    empurrao.current?.animate(
      [{ rotate: '0deg' }, { rotate: '14deg' }, { rotate: '-10deg' }, { rotate: '6deg' }, { rotate: '-3deg' }, { rotate: '1deg' }, { rotate: '0deg' }],
      { duration: 2600, easing: 'ease-out' },
    );
  };

  return (
    <span
      ref={caixa}
      className={cn('nt-saud-bola', parada && 'parada')}
      style={{ width: LARGURA, height: ALTURA, marginTop: -MARGEM_CIMA, marginBottom: -MARGEM_BAIXO, ['--fio' as string]: `${fio}px`, ['--argola' as string]: `${ARGOLA_Y}px` }}
      aria-hidden="true"
    >
      <span className="nt-saud-balanco">
        <span ref={empurrao} className="nt-saud-empurrao">
          {fio > 0 && (
            <>
              <span className="nt-saud-fio" />
              <svg className="nt-saud-laco" viewBox="0 0 20 12" width="16" height="10">
                <path d="M10 6 C6 0 0 1 1.5 6 C3 10 7 8 10 6 Z" />
                <path d="M10 6 C14 0 20 1 18.5 6 C17 10 13 8 10 6 Z" />
                <circle cx="10" cy="6" r="2" className="no" />
              </svg>
            </>
          )}
          <canvas ref={tela} style={{ width: LARGURA, height: ALTURA }} onClick={empurrar} />
        </span>
      </span>
    </span>
  );
}
