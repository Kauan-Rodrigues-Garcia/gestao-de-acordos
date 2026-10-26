import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { cn } from '@/lib/utils';
import { EVENTO_ACORDO_SALVO } from '@/components/Halloween/tema';
import { EVENTO_FESTA, EVENTO_TRENO, type CenaNatal } from './tema';
import './natal.css';

/*
 * As camadas do Natal, no mesmo lugar das do Halloween (`Layout`, coluna da
 * direita, que fica `relative` com o tema ligado):
 *
 *   FundoNatal       — atrás do `<main>` transparente: neve caindo e os
 *                      montes de neve no pé da tela. Só aparece nos vãos.
 *   CamadaNatal      — dentro do `<main>`, no alto do conteúdo, e rola junto:
 *                      o varal de luzinhas, a guirlanda e as bolas penduradas.
 *   SobreposicaoNatal — parada por cima do conteúdo: a festa do acordo salvo.
 *   RevoadaNatal     — a tela toda: o trenó do Papai Noel cruzando o céu.
 *
 * Tudo com `pointer-events: none`, menos as bolas (clicar balança). Nenhuma
 * camada lê nem grava dado.
 */

const acaso = (min: number, max: number) => min + Math.random() * (max - min);

function useClaro() {
  const { resolvedTheme } = useTheme();
  return !ehTemaEscuro(resolvedTheme);
}

function useLargura() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const ouvir = () => setW(window.innerWidth);
    window.addEventListener('resize', ouvir);
    return () => window.removeEventListener('resize', ouvir);
  }, []);
  return w;
}

// ── Fundo ─────────────────────────────────────────────────────────────────────

export function FundoNatal({ cena }: { cena: CenaNatal }) {
  const claro = useClaro();
  return (
    <div className={cn('nt-fundo', claro && 'nt-claro')} aria-hidden="true">
      {cena.montes && <Montes />}
      {cena.neve && <Neve cheia={cena.neve === 'cheia'} />}
    </div>
  );
}

const PLANOS_DA_NEVE = 3;

/**
 * Neve em canvas, no molde da chuva do Halloween: meia resolução, 30 quadros
 * por segundo, um preenchimento por plano. Longe = floco menor, mais lento e
 * mais apagado. Cada floco ondula de lado, cada um no seu ritmo.
 */
function Neve({ cheia }: { cheia: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cx = cv.getContext('2d'); if (!cx) return;
    type Floco = { x: number; y: number; v: number; r: number; fase: number; onda: number; plano: number };
    let flocos: Floco[] = [], cor = '#fff', quadro = 0, rodando = true, w = 0, h = 0, t = 0;
    const novo = (qualquerAltura: boolean): Floco => {
      const plano = Math.floor(Math.random() * PLANOS_DA_NEVE), z = (plano + Math.random()) / PLANOS_DA_NEVE;
      return {
        x: Math.random() * w, y: qualquerAltura ? Math.random() * h : -6 - Math.random() * 40,
        v: 0.35 + z * 0.9, r: 0.8 + z * (cheia ? 2.4 : 1.8), fase: Math.random() * Math.PI * 2, onda: 0.4 + Math.random() * 0.8, plano,
      };
    };
    const ajustar = () => {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.max(1, Math.round(w / 2)); cv.height = Math.max(1, Math.round(h / 2));
      cx.setTransform(cv.width / Math.max(1, w), 0, 0, cv.height / Math.max(1, h), 0, 0);
      flocos = Array.from({ length: Math.round(w * h / (cheia ? 9000 : 16000)) }, () => novo(true));
    };
    let ultimo = 0;
    const desenhar = (agora: number) => {
      if (!rodando) return;
      if (agora - ultimo < 32) { requestAnimationFrame(desenhar); return; }
      ultimo = agora; t += 0.033;
      if (quadro++ % 15 === 0) cor = getComputedStyle(cv).color;
      cx.clearRect(0, 0, w, h);
      cx.fillStyle = cor;
      for (const f of flocos) {
        f.y += f.v * 2;
        f.x += Math.sin(t * f.onda + f.fase) * 0.5;
        if (f.y > h + 6) Object.assign(f, novo(false));
      }
      for (let p = 0; p < PLANOS_DA_NEVE; p++) {
        cx.globalAlpha = 0.35 + (p / PLANOS_DA_NEVE) * 0.6;
        cx.beginPath();
        for (const f of flocos) {
          if (f.plano !== p) continue;
          cx.moveTo(f.x + f.r, f.y);
          cx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        }
        cx.fill();
      }
      requestAnimationFrame(desenhar);
    };
    ajustar();
    const obs = new ResizeObserver(ajustar); obs.observe(cv);
    requestAnimationFrame(desenhar);
    return () => { rodando = false; obs.disconnect(); };
  }, [cheia]);
  return <canvas ref={ref} className="nt-neve" />;
}

function Montes() {
  return (
    <svg className="nt-montes" viewBox="0 0 1200 120" preserveAspectRatio="none">
      <path className="longe" d="M0 70 C120 40 220 58 330 50 C460 40 540 72 660 60 C780 48 880 30 1000 46 C1090 58 1150 50 1200 44 L1200 120 L0 120 Z" />
      <path className="perto" d="M0 92 C140 74 260 96 400 86 C540 76 640 98 780 90 C920 82 1040 70 1200 84 L1200 120 L0 120 Z" />
    </svg>
  );
}

// ── Camada (alto do conteúdo) ─────────────────────────────────────────────────

/**
 * O varal fica por cima do respiro do conteúdo (o `p-6` da página, 24 px) e
 * de um espaço a mais que a camada abre — senão as lâmpadas caem em cima do
 * título. O espaço é do tamanho do que pende: lâmpadas, ou lâmpadas e bolas.
 */
export function CamadaNatal({ cena }: { cena: CenaNatal }) {
  const respiro = !cena.luzes ? 0 : cena.enfeites ? 28 : cena.guirlanda ? 18 : 14;
  return (
    <>
      <div className="nt-camada" aria-hidden="true">
        {cena.luzes && <Varal guirlanda={cena.guirlanda} bolas={cena.enfeites} />}
      </div>
      {respiro > 0 && <div aria-hidden="true" style={{ height: respiro }} />}
    </>
  );
}

/** Largura de um vão do varal, de um prego ao outro. */
const VAO = 150;
const CORES_LUZ = ['#FF3B3B', '#FFC531', '#2FD16B', '#3AA0FF', '#FF5FC0'];
/** Posição ao longo do vão (0 a 1) de cada lâmpada. */
const LAMPADAS = [0.17, 0.39, 0.61, 0.83];
/** Ponto da curva do fio: começa e termina em y = 4, desce 10 px no meio. */
const naCurva = (t: number) => ({ x: VAO * t, y: 4 + 40 * t * (1 - t) });
const inclinacao = (t: number) => Math.atan((40 * (1 - 2 * t)) / VAO) * 180 / Math.PI;

/**
 * O varal de luzinhas. O fio e as lâmpadas são SVG parado; o que pisca é HTML
 * (o halo atrás e o miolo na frente), só opacidade — fica na placa de vídeo e
 * não redesenha a página.
 */
function Varal({ guirlanda, bolas }: { guirlanda: boolean; bolas: boolean }) {
  const largura = useLargura();
  const vaos = Math.ceil(largura / VAO) + 1;
  return (
    <div className={cn('nt-varal', guirlanda && 'com-guirlanda')}>
      {Array.from({ length: vaos }, (_, v) => (
        <div key={v} className="nt-vao" style={{ width: VAO }}>
          {LAMPADAS.map((t, i) => {
            const { x, y } = naCurva(t), n = v * LAMPADAS.length + i, cor = CORES_LUZ[n % CORES_LUZ.length];
            const atraso = `${-((n * 0.73) % 3.4).toFixed(2)}s`;
            return (
              <span key={i} className="nt-halo" style={{ left: x - 15, top: y + (guirlanda ? 16 : 12) - 15, ['--cor' as string]: cor, ['--d' as string]: atraso }} />
            );
          })}
          <svg viewBox={`0 0 ${VAO} 44`} width={VAO} height={44}>
            {guirlanda && <Guirlanda />}
            <path d={`M0 4 Q${VAO / 2} 24 ${VAO} 4`} className="fio" />
            {LAMPADAS.map((t, i) => {
              const { x, y } = naCurva(t), n = v * LAMPADAS.length + i;
              return <Lampada key={i} x={x} y={guirlanda ? y + 4 : y} giro={inclinacao(t)} cor={CORES_LUZ[n % CORES_LUZ.length]} />;
            })}
            {guirlanda && <Laco />}
          </svg>
          {LAMPADAS.map((t, i) => {
            const { x, y } = naCurva(t), n = v * LAMPADAS.length + i;
            const atraso = `${-((n * 0.73) % 3.4).toFixed(2)}s`;
            return <span key={i} className="nt-miolo" style={{ left: x - 3, top: y + (guirlanda ? 16 : 12) - 4, ['--d' as string]: atraso }} />;
          })}
          {bolas && v % 2 === 1 && <Bola indice={v} />}
        </div>
      ))}
    </div>
  );
}

function Lampada({ x, y, giro, cor }: { x: number; y: number; giro: number; cor: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${giro.toFixed(1)})`}>
      <rect x="-2.3" y="0" width="4.6" height="4.4" rx=".9" className="soquete" />
      <path d="M0 3.6 C4.6 4.6 5.6 10 4.1 14 C3.1 17 1.6 19 0 19.6 C-1.6 19 -3.1 17 -4.1 14 C-5.6 10 -4.6 4.6 0 3.6 Z" fill={cor} />
      <ellipse cx="-1.7" cy="9.5" rx=".9" ry="2.7" fill="#FFFFFF" opacity=".55" />
    </g>
  );
}

/** Pinheiro em corda: três traços tracejados um sobre o outro fazem as agulhas. */
function Guirlanda() {
  const d = `M-2 3 Q${VAO / 2} 26 ${VAO + 2} 3`;
  return (
    <g className="guirlanda">
      <path d={d} className="g1" />
      <path d={d} className="g2" />
      <path d={d} className="g3" />
      {[0.12, 0.3, 0.52, 0.72, 0.9].map((t, i) => {
        const { x, y } = naCurva(t);
        return <circle key={i} cx={x + (i % 2 ? 3 : -3)} cy={y + (i % 2 ? -2.5 : 3)} r="1.7" className={i % 3 === 0 ? 'baga-ouro' : 'baga'} />;
      })}
    </g>
  );
}

/** O laço vermelho em cada prego (x = 0 do vão). */
function Laco() {
  return (
    <g className="laco" transform="translate(0 4)">
      <path d="M-1 2 L-5 14 L-2.5 12.5 L-1.2 15.5 Z" />
      <path d="M1 2 L5 14 L2.5 12.5 L1.2 15.5 Z" />
      <path d="M0 0 C-4 -6 -12 -5 -10 1 C-9 4 -4 3 0 0 Z" />
      <path d="M0 0 C4 -6 12 -5 10 1 C9 4 4 3 0 0 Z" />
      <circle r="2.2" className="no" />
    </g>
  );
}

const TONS_BOLA: Record<string, [string, string, string]> = {
  vermelha: ['#FF6B6B', '#D62828', '#8E1414'],
  dourada: ['#FFE48A', '#E2A82A', '#9C6A0E'],
  azul: ['#8FD0FF', '#2E7FD6', '#164B8A'],
  verde: ['#8BE3A4', '#21995A', '#0F5C33'],
};

const CORES_BOLA = ['vermelha', 'dourada', 'azul', 'verde'] as const;

/**
 * Bola de Natal pendurada na guirlanda, no meio de um vão sim, outro não —
 * entre as lâmpadas do meio. Balança sozinha; o clique dá um empurrão.
 */
function Bola({ indice }: { indice: number }) {
  const [empurrao, setEmpurrao] = useState(0);
  const n = indice >> 1, tam = n % 2 ? 17 : 21, fio = n % 3 === 1 ? 11 : 5;
  const [claro, base, escuro] = TONS_BOLA[CORES_BOLA[n % CORES_BOLA.length]];
  const id = `nt-bola-${indice}`;
  return (
    <div
      className={cn('nt-bola', empurrao > 0 && 'empurrada')}
      key={empurrao}
      style={{ left: VAO / 2 - tam / 2, top: 18, ['--fio' as string]: `${fio}px`, ['--d' as string]: `${-indice * 0.9}s`, ['--t' as string]: `${3.2 + (indice % 3) * 0.5}s` }}
    >
      <span className="linha" />
      <svg viewBox="0 0 40 46" style={{ width: tam, height: tam * 46 / 40 }} onClick={() => setEmpurrao(e => e + 1)}>
        <defs>
          <radialGradient id={id} cx="36%" cy="34%" r="70%">
            <stop offset="0" stopColor={claro} />
            <stop offset=".55" stopColor={base} />
            <stop offset="1" stopColor={escuro} />
          </radialGradient>
        </defs>
        <circle cx="20" cy="3" r="2.4" fill="none" stroke="#C9A23A" strokeWidth="1.2" />
        <rect x="14.5" y="4.5" width="11" height="6" rx="1.4" fill="#D9B24A" />
        <path d="M15 7 H25" stroke="#A8801E" strokeWidth=".8" />
        <circle cx="20" cy="27" r="17.5" fill={`url(#${id})`} />
        <path d="M3.5 25 Q11.5 20 20 25 T36.5 25" fill="none" stroke="#FFFFFF" strokeOpacity=".6" strokeWidth="1.4" />
        <path d="M4.6 31 Q12 36 20 31 T35.4 31" fill="none" stroke="#FFFFFF" strokeOpacity=".35" strokeWidth="1" strokeDasharray="1 2.4" strokeLinecap="round" />
        <ellipse cx="13.5" cy="19" rx="3.4" ry="5.5" transform="rotate(30 13.5 19)" fill="#FFFFFF" opacity=".45" />
      </svg>
    </div>
  );
}

// ── Sobreposição: a festa do acordo salvo ─────────────────────────────────────

/**
 * Como a chuva de doces do Halloween: a cada 3 a 6 acordos salvos (sorteado
 * de novo a cada vez), caem estrelas, presentes e flocos por um segundo e
 * meio. Todo acordo seria ruído no terceiro.
 */
export function SobreposicaoNatal({ cena }: { cena: CenaNatal }) {
  return (
    <div className="nt-sobre" aria-hidden="true">
      {cena.festa && <Festa />}
    </div>
  );
}

function Festa() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cx = cv.getContext('2d'); if (!cx) return;
    const CORES_PRESENTE = [['#D62828', '#FFD45E'], ['#21995A', '#FF5A5A'], ['#2E7FD6', '#FFFFFF'], ['#E2A82A', '#D62828']];
    type Peca = { x: number; y: number; vx: number; vy: number; r: number; vr: number; a: number; tipo: 0 | 1 | 2; cor: number; tam: number };
    let pecas: Peca[] = [], rodando = false, faltam = Math.floor(acaso(3, 7));
    const estrela = (r: number) => {
      cx.beginPath();
      for (let i = 0; i < 10; i++) {
        const raio = i % 2 ? r * 0.45 : r, ang = -Math.PI / 2 + i * Math.PI / 5;
        cx.lineTo(Math.cos(ang) * raio, Math.sin(ang) * raio);
      }
      cx.closePath();
    };
    const desenhar = (p: Peca) => {
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = p.a;
      if (p.tipo === 0) {
        cx.fillStyle = '#FFD23F'; estrela(p.tam); cx.fill();
        cx.fillStyle = '#FFF4C2'; estrela(p.tam * 0.45); cx.fill();
      } else if (p.tipo === 1) {
        const [caixa, fita] = CORES_PRESENTE[p.cor], s = p.tam;
        cx.fillStyle = caixa; cx.fillRect(-s, -s * 0.8, s * 2, s * 1.8);
        cx.fillStyle = fita; cx.fillRect(-s * 0.18, -s * 0.8, s * 0.36, s * 1.8); cx.fillRect(-s, -s * 0.05, s * 2, s * 0.32);
        cx.beginPath(); cx.ellipse(-s * 0.35, -s, s * 0.38, s * 0.22, -0.5, 0, Math.PI * 2); cx.ellipse(s * 0.35, -s, s * 0.38, s * 0.22, 0.5, 0, Math.PI * 2); cx.fill();
      } else {
        cx.strokeStyle = '#FFFFFF'; cx.lineWidth = 1.6; cx.lineCap = 'round';
        cx.beginPath();
        for (let i = 0; i < 3; i++) { const ang = i * Math.PI / 3; cx.moveTo(-Math.cos(ang) * p.tam, -Math.sin(ang) * p.tam); cx.lineTo(Math.cos(ang) * p.tam, Math.sin(ang) * p.tam); }
        cx.stroke();
      }
      cx.restore();
    };
    const quadro = () => {
      const w = cv.clientWidth, h = cv.clientHeight;
      cx.clearRect(0, 0, w, h);
      pecas = pecas.filter(p => p.a > 0.02 && p.y < h + 30);
      for (const p of pecas) { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.995; p.r += p.vr; if (p.y > h * 0.62) p.a *= 0.95; desenhar(p); }
      if (pecas.length) requestAnimationFrame(quadro); else rodando = false;
    };
    const soltar = () => {
      const w = cv.clientWidth, h = cv.clientHeight, dpr = devicePixelRatio || 1;
      cv.width = w * dpr; cv.height = h * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < 46; i++) {
        const tipo = (i % 5 === 0 ? 1 : i % 3 === 0 ? 2 : 0) as 0 | 1 | 2;
        pecas.push({ x: acaso(0, w), y: acaso(-h * 0.25, -10), vx: acaso(-0.6, 0.6), vy: acaso(1.6, 3.4), r: acaso(0, 6), vr: acaso(-0.06, 0.06), a: 1, tipo, cor: Math.floor(acaso(0, 4)), tam: tipo === 1 ? acaso(7, 10) : tipo === 0 ? acaso(6, 10) : acaso(4, 7) });
      }
      if (!rodando) { rodando = true; requestAnimationFrame(quadro); }
    };
    const aoSalvar = () => { if (--faltam > 0) return; faltam = Math.floor(acaso(3, 7)); soltar(); };
    window.addEventListener(EVENTO_ACORDO_SALVO, aoSalvar);
    window.addEventListener(EVENTO_FESTA, soltar);
    return () => { window.removeEventListener(EVENTO_ACORDO_SALVO, aoSalvar); window.removeEventListener(EVENTO_FESTA, soltar); pecas = []; };
  }, []);
  return <canvas ref={ref} className="nt-festa" />;
}

// ── Revoada: o trenó ──────────────────────────────────────────────────────────

/**
 * De tempos em tempos (2 a 4 min; o primeiro logo depois de entrar), o Papai
 * Noel cruza o alto da tela da direita para a esquerda, com as renas, e deixa
 * um rastro de brilho. Só no estilo detalhado.
 */
export function RevoadaNatal({ cena }: { cena: CenaNatal }) {
  const [voo, setVoo] = useState<{ id: number; altura: number } | null>(null);
  useEffect(() => {
    if (!cena.treno) return;
    let t: number | undefined;
    const voar = () => {
      setVoo({ id: Date.now(), altura: acaso(56, 150) });
      window.clearTimeout(t);
      t = window.setTimeout(voar, acaso(120_000, 240_000));
    };
    t = window.setTimeout(voar, 7000);
    window.addEventListener(EVENTO_TRENO, voar);
    return () => { window.clearTimeout(t); window.removeEventListener(EVENTO_TRENO, voar); };
  }, [cena.treno]);
  if (!cena.treno || !voo) return null;
  return (
    <div className="nt-revoada" aria-hidden="true">
      <div key={voo.id} className="nt-treno" style={{ top: voo.altura }} onAnimationEnd={() => setVoo(null)}>
        <span className="rastro" />
        <Treno />
      </div>
    </div>
  );
}

function Rena({ x, rudolph }: { x: number; rudolph?: boolean }) {
  return (
    <g transform={`translate(${x} 0)`} className="rena">
      <g className="patas-tras"><path d="M30 34 L36 45 M33 34 L40 43" /></g>
      <g className="patas-frente"><path d="M14 34 L6 42 M17 34 L11 45" /></g>
      <ellipse cx="23" cy="30" rx="13" ry="6.2" fill="#8B5A3C" />
      <ellipse cx="23" cy="32.5" rx="9" ry="3" fill="#B98560" />
      <path d="M33 27 C37 25 39 27 37 29" fill="#F2E6D8" />
      <path d="M13 28 C10 22 8 18 6 15 L10 13 C12 17 15 22 18 26 Z" fill="#7C4F33" />
      <ellipse cx="5.5" cy="14" rx="5.2" ry="3.6" fill="#8B5A3C" />
      <path d="M8 11 L10 4 M9.2 7 L13 5 M7 11 L5 4 M6 7 L2.6 5" className="galho" />
      <circle cx="4.4" cy="12.8" r=".9" fill="#1D120B" />
      <circle cx="0.6" cy="15" r={rudolph ? 2.3 : 1.5} fill={rudolph ? '#FF2B2B' : '#3B2316'} className={rudolph ? 'nariz' : undefined} />
      <path d="M14 26 Q20 24 26 26" fill="none" stroke="#C9302C" strokeWidth="2.2" />
      <circle cx="20" cy="25.4" r="1.2" fill="#FFD23F" />
    </g>
  );
}

function Treno() {
  return (
    <svg viewBox="0 0 270 64" className="nt-treno-svg">
      <path d="M38 27 L70 27 M86 27 L118 27 M134 27 L178 34" className="arreio" />
      <Rena x={0} rudolph />
      <Rena x={48} />
      <Rena x={96} />
      <g transform="translate(166 0)">
        <path d="M30 12 C26 8 34 4 40 7 C46 3 54 6 52 12 C58 14 56 24 50 24 L28 24 C22 22 24 14 30 12 Z" fill="#8C6239" />
        <rect x="30" y="7" width="7" height="7" rx="1" fill="#2E7FD6" /><path d="M33.5 7 V14" stroke="#FFD23F" strokeWidth="1.2" />
        <rect x="42" y="4" width="8" height="8" rx="1" fill="#21995A" /><path d="M46 4 V12" stroke="#FF5A5A" strokeWidth="1.2" />
        <circle cx="68" cy="14" r="5.2" fill="#F5D0B5" />
        <path d="M63 12 C64 4 72 3 76 7 C80 9 84 13 86 18 L81 17 C78 13 74 11 72 12 Z" fill="#D62828" />
        <circle cx="86.5" cy="18.5" r="2.4" fill="#FFFFFF" />
        <rect x="61.5" y="10.4" width="13" height="3" rx="1.5" fill="#FFFFFF" />
        <path d="M62 16 C61 24 67 27 71 24 C74 22 74 18 73 16 Z" fill="#FFFFFF" />
        <path d="M58 22 C58 18 62 17 70 17 C78 18 80 22 80 28 L58 28 Z" fill="#D62828" />
        <path d="M14 22 L92 22 C94 22 95 24 94 27 L88 38 C86 41 83 42 80 42 L24 42 C18 42 14 38 14 32 Z" fill="#B71C1C" />
        <path d="M14 22 L92 22 C94 22 95 24 94 26 L16 26 Z" fill="#E53935" />
        <path d="M22 33 C34 30 48 36 62 32 C72 29 80 33 86 31" fill="none" stroke="#FFD23F" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M8 48 L92 48 C100 48 104 42 100 38" fill="none" stroke="#D9B24A" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M8 48 C2 48 0 42 5 40" fill="none" stroke="#D9B24A" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M28 42 L26 48 M74 42 L76 48" stroke="#D9B24A" strokeWidth="2" />
      </g>
    </svg>
  );
}
