import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { cn } from '@/lib/utils';
import { usePiscaPisca, varsDaLampada } from './piscaPisca';
import { EVENTO_ACORDO_SALVO, EVENTO_FESTA, EVENTO_TRENO, type CenaNatal } from './tema';
import { Chale } from './chale/Chale';
import { VAO, naCurva } from './varal';
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
 *   RevoadaNatal     — a tela toda: o trenó do Papai Noel cruzando o céu, de
 *                      vez em quando, em QUALQUER aba (não depende da cena).
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

export function FundoNatal({ cena, leve = false }: { cena: CenaNatal; leve?: boolean }) {
  const claro = useClaro();
  return (
    <div className={cn('nt-fundo', claro && 'nt-claro')} aria-hidden="true">
      {cena.montes && <Montes />}
      {cena.neve && (leve ? <NeveLeve /> : <Neve cheia={cena.neve === 'cheia'} />)}
    </div>
  );
}

/** Os flocos da neve do modo leve: posição, tamanho, tempo e atraso, fixos (iguais em toda tela). */
const FLOCOS_LEVES = Array.from({ length: 22 }, (_, i) => {
  const r = (k: number) => ((Math.sin((i + 1) * 12.9898 * k) * 43758.5453) % 1 + 1) % 1;
  return { x: r(1) * 100, tam: 3 + r(2) * 4, dura: 11 + r(3) * 9, atraso: -r(4) * 20, op: 0.5 + r(6) * 0.45 };
});

/**
 * A neve do modo leve (09/11/2026): 22 flocos de CSS, cada um só com
 * `transform` — a placa de vídeo anima sozinha, sem JavaScript nem pintura
 * por quadro. `data-anima-sempre`: o modo leve não a para (`index.css`).
 */
function NeveLeve() {
  return (
    <div className="nt-neve-leve" data-anima-sempre="">
      {FLOCOS_LEVES.map((f, i) => (
        <span key={i} style={{ left: `${f.x.toFixed(2)}%`, width: f.tam, height: f.tam, opacity: f.op, animationDuration: `${f.dura.toFixed(1)}s`, animationDelay: `${f.atraso.toFixed(1)}s` }} />
      ))}
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
      // (09/11/2026) Um floco a cada 11 mil px² na cheia (eram 9 mil): os PCs da operação são fracos.
      flocos = Array.from({ length: Math.round(w * h / (cheia ? 11000 : 16000)) }, () => novo(true));
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
export function CamadaNatal({ cena, leve = false }: { cena: CenaNatal; leve?: boolean }) {
  const respiro = !cena.luzes ? 0 : cena.enfeites ? 28 : cena.guirlanda ? 18 : 14;
  return (
    <>
      <div className="nt-camada" aria-hidden="true">
        {cena.luzes && <Varal guirlanda={cena.guirlanda} bolas={cena.enfeites} leve={leve} />}
        {cena.chale && <Chale />}
      </div>
      {respiro > 0 && <div aria-hidden="true" style={{ height: respiro }} />}
    </>
  );
}

const CORES_LUZ = ['#FF3B3B', '#FFC531', '#2FD16B', '#3AA0FF', '#FF5FC0'];
/** Posição ao longo do vão (0 a 1) de cada lâmpada. */
const LAMPADAS = [0.17, 0.39, 0.61, 0.83];
const inclinacao = (t: number) => Math.atan((40 * (1 - 2 * t)) / VAO) * 180 / Math.PI;

/**
 * O varal de luzinhas. O fio e as lâmpadas são SVG parado; o que pisca é HTML
 * (o halo atrás e o miolo na frente), só opacidade — fica na placa de vídeo e
 * não redesenha a página.
 */
/*
 * O pisca vem do controlador (`piscaPisca.ts`, 06/11/2026): a função muda
 * sozinha — alterna, onda, corre, frenético, estrelas… — como a caixinha do
 * pisca-pisca de loja. Antes era um piscar suave, sempre igual.
 */
function Varal({ guirlanda, bolas, leve }: { guirlanda: boolean; bolas: boolean; leve: boolean }) {
  const largura = useLargura();
  const vaos = Math.ceil(largura / VAO) + 1;
  const modo = usePiscaPisca();
  // No modo leve, o pisca-pisca respira devagar (só opacidade; ver `natal.css`).
  return (
    <div className={cn('nt-varal', guirlanda && 'com-guirlanda', leve && 'nt-varal-leve')} data-pisca={leve ? 'devagar' : modo}>
      {Array.from({ length: vaos }, (_, v) => (
        <div key={v} className="nt-vao" style={{ width: VAO }}>
          {LAMPADAS.map((t, i) => {
            const { x, y } = naCurva(t), n = v * LAMPADAS.length + i, cor = CORES_LUZ[n % CORES_LUZ.length];
            return (
              <span key={i} className={cn('nt-halo pp-luz', n % 2 ? 'pp-b' : 'pp-a')}
                style={{ left: x - 15, top: y + (guirlanda ? 16 : 12) - 15, ['--cor' as string]: cor, ...varsDaLampada(n) }} />
            );
          })}
          <svg viewBox={`0 0 ${VAO} 44`} width={VAO} height={44}>
            {guirlanda && <Guirlanda />}
            <path d={`M0 4 Q${VAO / 2} 24 ${VAO} 4`} className="fio" />
            {LAMPADAS.map((t, i) => {
              const { x, y } = naCurva(t);
              return <Soquete key={i} x={x} y={guirlanda ? y + 4 : y} giro={inclinacao(t)} />;
            })}
            {guirlanda && <Laco />}
          </svg>
          {LAMPADAS.map((t, i) => {
            const { x, y } = naCurva(t), n = v * LAMPADAS.length + i;
            return <Vidro key={i} x={x} y={guirlanda ? y + 4 : y} giro={inclinacao(t)} cor={CORES_LUZ[n % CORES_LUZ.length]} n={n} />;
          })}
          {LAMPADAS.map((t, i) => {
            const { x, y } = naCurva(t), n = v * LAMPADAS.length + i;
            return <span key={i} className={cn('nt-miolo pp-luz', n % 2 ? 'pp-b' : 'pp-a')} style={{ left: x - 3, top: y + (guirlanda ? 16 : 12) - 4, ...varsDaLampada(n) }} />;
          })}
          {bolas && v % 2 === 1 && <Bola indice={v} />}
        </div>
      ))}
    </div>
  );
}

/** O soquete de cada lâmpada, no SVG do fio (parado). */
function Soquete({ x, y, giro }: { x: number; y: number; giro: number }) {
  return <rect x="-2.3" y="0" width="4.6" height="4.4" rx=".9" className="soquete" transform={`translate(${x} ${y}) rotate(${giro.toFixed(1)})`} />;
}

/**
 * O vidro da lâmpada, fora do SVG do fio (09/11/2026): cada um num `span`
 * próprio, para o piscar ser só opacidade de um elemento HTML, que a placa de
 * vídeo anima sozinha. Dentro do SVG, as 48 lâmpadas do Dashboard refaziam o
 * estilo e repintavam a página inteira a cada quadro. `n` liga o vidro ao
 * controlador do pisca: apagada, a lâmpada fica no tom da cor.
 */
function Vidro({ x, y, giro, cor, n }: { x: number; y: number; giro: number; cor: string; n: number }) {
  return (
    <span className={cn('nt-vidro pp-luz', n % 2 ? 'pp-b' : 'pp-a')}
      style={{ left: x, top: y, transform: `rotate(${giro.toFixed(1)}deg)`, ...varsDaLampada(n) }}>
      <svg viewBox="-6 3 12 17" width={12} height={17}>
        <path d="M0 3.6 C4.6 4.6 5.6 10 4.1 14 C3.1 17 1.6 19 0 19.6 C-1.6 19 -3.1 17 -4.1 14 C-5.6 10 -4.6 4.6 0 3.6 Z" fill={cor} />
        <ellipse cx="-1.7" cy="9.5" rx=".9" ry="2.7" fill="#FFFFFF" opacity=".55" />
      </svg>
    </span>
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
      for (let i = 0; i < 38; i++) {
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
 * De tempos em tempos o Papai Noel cruza o alto da tela com as renas, deixando
 * um rastro de brilho e faíscas caindo. Só no estilo detalhado.
 *
 * Tudo sorteado a cada voo (Cleber, 04/11/2026: «melhorar a aleatoriedade»):
 *   quando — um intervalo «sem memória» (exponencial, média de ~3 min, entre
 *            40 s e 7 min): não dá para adivinhar a próxima;
 *   lado   — da direita para a esquerda ou o contrário;
 *   altura, velocidade e tamanho — mais longe = menor, mais lento e mais
 *            apagado;
 *   arco   — sobe ou desce um pouco no meio do caminho, e chega mais alto ou
 *            mais baixo do que saiu.
 */
interface Voo {
  id: number;
  paraDireita: boolean;
  altura: number;
  duracao: number;
  escala: number;
  curva: number;
  desvio: number;
  largura: number;
}

function sortearVoo(largura: number): Voo {
  const escala = acaso(0.72, 1.12);
  return {
    id: Date.now(),
    paraDireita: Math.random() < 0.5,
    altura: acaso(40, 170),
    // Mais longe (menor) também é mais lento.
    duracao: acaso(12, 17) / (0.55 + escala * 0.45),
    escala,
    curva: acaso(-34, 26),
    desvio: acaso(-40, 40),
    largura,
  };
}

/** Onde fica a traseira do trenó no desenho (fração da largura, voando para a esquerda). */
const TRASEIRA_DO_TRENO = 0.97;

interface Faisca { x: number; y: number; vx: number; vy: number; vida: number; dura: number; tam: number; cor: number; fase: number }

/** Um brilho redondo pronto (desenhado uma vez): cada faísca é só um `drawImage` dele. */
function criarBrilho(cor: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(12, 12, 0, 12, 12, 12);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.25, cor);
  grad.addColorStop(1, 'rgba(255, 233, 166, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 24, 24);
  return c;
}

/** O próximo voo: exponencial em torno de 3 min, nunca antes de 40 s nem depois de 7 min. */
const proximoVooEm = () => Math.min(420_000, Math.max(40_000, -Math.log(1 - Math.random()) * 180_000));

/**
 * O trenó é um evento à parte, como os morcegos do Halloween (Cleber,
 * 05/11/2026: «independente da aba que a pessoa estiver»): o `Layout` monta a
 * revoada uma vez, fora da cena da rota, e o relógio do próximo voo continua
 * correndo quando a pessoa troca de aba. `ativo`: estilo detalhado, fora do
 * modo leve.
 */
export function RevoadaNatal({ ativo }: { ativo: boolean }) {
  const [voo, setVoo] = useState<Voo | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ativo) return;
    let t: number | undefined;
    const voar = () => {
      setVoo(sortearVoo(caixa.current?.clientWidth ?? window.innerWidth));
      window.clearTimeout(t);
      t = window.setTimeout(voar, proximoVooEm());
    };
    t = window.setTimeout(voar, acaso(6_000, 50_000));
    window.addEventListener(EVENTO_TRENO, voar);
    return () => { window.clearTimeout(t); window.removeEventListener(EVENTO_TRENO, voar); };
  }, [ativo]);
  // O rastro: faíscas que saem da traseira do trenó e ficam no céu onde nasceram.
  const rastro = useRef<HTMLCanvasElement>(null);
  const vira = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!voo) return;
    const cv = rastro.current, caixaEl = caixa.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !caixaEl || !ctx) return;
    cv.width = caixaEl.clientWidth;
    cv.height = caixaEl.clientHeight;
    const brilhos = [criarBrilho('#FFE9A6'), criarBrilho('#FFFFFF'), criarBrilho('#FFD54F')];
    const faiscas: Faisca[] = [];
    let antes = performance.now(), quadro = 0;
    const passo = (agora: number) => {
      const dt = Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      // Onde está a traseira do trenó agora (o trenó fica na ponta direita do desenho).
      const svg = vira.current?.querySelector('svg');
      if (svg) {
        const r = svg.getBoundingClientRect(), c = caixaEl.getBoundingClientRect();
        const fracao = voo.paraDireita ? 1 - TRASEIRA_DO_TRENO : TRASEIRA_DO_TRENO;
        const x = r.left - c.left + r.width * fracao;
        const y = r.top - c.top + r.height * 0.66;
        const recua = voo.paraDireita ? -1 : 1;     // as faíscas saem para trás
        for (let i = 0; i < 2; i++) {
          faiscas.push({
            x: x + acaso(-6, 6), y: y + acaso(-5, 5),
            vx: recua * acaso(10, 50), vy: acaso(-10, 25),
            vida: 0, dura: acaso(0.8, 1.7), tam: acaso(3, 7.5) * voo.escala,
            cor: Math.floor(acaso(0, brilhos.length)), fase: acaso(0, Math.PI * 2),
          });
        }
      }
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = faiscas.length - 1; i >= 0; i--) {
        const f = faiscas[i];
        f.vida += dt;
        if (f.vida >= f.dura) { faiscas.splice(i, 1); continue; }
        f.vy += 45 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const resta = 1 - f.vida / f.dura;
        // Cintila enquanto apaga.
        ctx.globalAlpha = resta * (0.65 + 0.35 * Math.sin(f.fase + f.vida * 18));
        const t = f.tam * (0.5 + resta * 0.5);
        ctx.drawImage(brilhos[f.cor], f.x - t, f.y - t, t * 2, t * 2);
      }
      ctx.globalAlpha = 1;
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(quadro); ctx.clearRect(0, 0, cv.width, cv.height); };
  }, [voo]);

  if (!ativo) return null;
  const fora = 340;
  return (
    <div ref={caixa} className="nt-revoada" aria-hidden="true">
      {voo && <canvas ref={rastro} className="nt-revoada-rastro" />}
      {voo && (
        <div
          key={voo.id}
          className="nt-treno"
          style={{
            top: voo.altura,
            ['--x0' as string]: `${voo.paraDireita ? -fora : voo.largura + 20}px`,
            ['--x1' as string]: `${voo.paraDireita ? voo.largura + 20 : -fora}px`,
            ['--dur' as string]: `${voo.duracao.toFixed(1)}s`,
            ['--curva' as string]: `${voo.curva.toFixed(0)}px`,
            ['--desvio' as string]: `${voo.desvio.toFixed(0)}px`,
            opacity: 0.75 + (voo.escala - 0.72) * 0.6,
          }}
          onAnimationEnd={e => { if (e.target === e.currentTarget) setVoo(null); }}
        >
          <div className="nt-treno-arco">
            <div ref={vira} className="nt-treno-vira" style={{ transform: `scale(${voo.escala.toFixed(2)}) scaleX(${voo.paraDireita ? -1 : 1})` }}>
              <Treno />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Uma pata: sai do quadril (0, 0) para baixo, gordinha, com o casco escuro. */
function Pata({ x, y, lado, longe }: { x: number; y: number; lado: 'frente' | 'tras'; longe?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={cn('pata', lado, longe && 'longe')}>
        <path d="M-2.4 -1 C-2.6 4 -2.4 7 -2.2 9.5 L2.2 9.5 C2.4 7 2.6 4 2.4 -1 Z" fill={longe ? '#6E4129' : '#8B5A3C'} />
        <rect x="-2.6" y="8.6" width="5.2" height="3.2" rx="1.4" fill="#3B2316" />
      </g>
    </g>
  );
}

/**
 * Rena fofinha, olhando para a esquerda (o trenó voa para lá): cabeça grande
 * e redonda, olhos brilhando, bochecha rosada, chifre macio e corpo gordinho.
 * Galopa no ar: o corpo sobe e inclina a cada passada, as patas da frente e de
 * trás vão em fases opostas, a cabeça acompanha e as orelhas, o rabo e o
 * sininho balançam. `ordem` atrasa a passada de cada uma, em onda.
 */
function Rena({ x, ordem, rudolph }: { x: number; ordem: number; rudolph?: boolean }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <g className="rena" style={{ ['--d' as string]: `${-ordem * 0.16}s` }}>
        {/* Patas de lá, atrás do corpo */}
        <Pata x={18.5} y={33} lado="frente" longe />
        <Pata x={33} y={33} lado="tras" longe />
        {/* O rabinho */}
        <g transform="translate(37.5 27)">
          <g className="rabo">
            <ellipse cx="2.6" cy="-1" rx="3.4" ry="2.6" fill="#8B5A3C" />
            <ellipse cx="3.4" cy="0" rx="2.4" ry="1.8" fill="#FBEBD6" />
          </g>
        </g>
        {/* Patas de cá */}
        <Pata x={16} y={34} lado="frente" />
        <Pata x={31} y={34} lado="tras" />
        {/* O corpo gordinho, a barriga e a coleira com o sininho */}
        <ellipse cx="25" cy="30" rx="13.5" ry="8.6" fill="url(#nt-rena-pelo)" />
        <ellipse cx="23" cy="34" rx="9" ry="4.4" fill="#F3DCC2" />
        <path d="M26 22.5 C29 21.8 33 22.6 35.5 25" fill="none" stroke="#FFFFFF" strokeOpacity=".25" strokeWidth="1.6" strokeLinecap="round" />
        {/* A cabeça, presa no pescoço: acompanha a passada */}
        <g transform="translate(15 25)">
          <g className="cabeca">
            <path d="M1 1.5 C0 -2.5 -2 -6 -4.5 -9" fill="none" stroke="#8E5C3B" strokeWidth="9.5" strokeLinecap="round" />
            <path d="M-4.5 1.5 C-6.5 -2 -7.5 -5 -7.5 -8" fill="none" stroke="#F3DCC2" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round" />
            {/* A coleira, na base do pescoço */}
            <path d="M-4.6 -1.2 C-2.4 1.6 2.2 2.6 5.8 0.6" fill="none" stroke="#D62828" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M-4 -1.6 C-2 0.6 2 1.6 5.2 0" fill="none" stroke="#FF6B6B" strokeOpacity=".6" strokeWidth=".7" strokeLinecap="round" />
            {/* O sininho, pendurado na coleira */}
            <g transform="translate(0.4 2.4)">
              <g className="sino">
                <path d="M-2.4 2.8 C-2.4 0 -1.4 -0.6 0 -0.6 C1.4 -0.6 2.4 0 2.4 2.8 Z" fill="#F4C542" stroke="#B8860B" strokeWidth=".5" />
                <circle cx="0" cy="3" r=".8" fill="#8A5A00" />
              </g>
            </g>
            {/* Chifres macios (o de lá mais escuro) */}
            <path d="M-2 -18.5 C-1 -22 0 -24 2.5 -25.5 M0 -22.3 C2 -22.4 3.4 -21.6 4.4 -20.4" fill="none" stroke="#A8784A" strokeWidth="1.9" strokeLinecap="round" />
            <path d="M-6.5 -19.5 C-7.5 -23 -7.2 -25.5 -5.5 -27.5 M-7.1 -23.4 C-9.2 -24.2 -10.4 -25.6 -10.8 -27.2" fill="none" stroke="#C9935F" strokeWidth="2.1" strokeLinecap="round" />
            {/* Orelha de lá */}
            <g transform="translate(-1 -18)"><g className="orelha longe">
              <ellipse cx="3.6" cy="-0.8" rx="3.8" ry="1.9" transform="rotate(-25 3.6 -0.8)" fill="#6E4129" />
            </g></g>
            <circle cx="-6" cy="-13" r="8" fill="url(#nt-rena-pelo)" />
            {/* Topete */}
            <path d="M-8.5 -20.5 C-7 -22.5 -5 -22.6 -4 -20.6 C-3.4 -22 -1.6 -22 -1 -20.2" fill="#7E4A2C" />
            {/* Orelha de cá */}
            <g transform="translate(-2 -16.5)"><g className="orelha">
              <ellipse cx="4.2" cy="-0.6" rx="4.4" ry="2.2" transform="rotate(-18 4.2 -0.6)" fill="#8B5A3C" />
              <ellipse cx="4.4" cy="-0.6" rx="2.6" ry="1.1" transform="rotate(-18 4.4 -0.6)" fill="#F2A8B4" />
            </g></g>
            {/* Focinho, bochecha, olho e sorriso */}
            <ellipse cx="-12.2" cy="-10.6" rx="5" ry="3.9" fill="#F3DCC2" />
            <ellipse cx="-5.2" cy="-9.6" rx="2.1" ry="1.3" fill="#FF8FA3" opacity=".75" />
            <g className="olho">
              <ellipse cx="-8.4" cy="-14.6" rx="2" ry="2.5" fill="#1D120B" />
              <circle cx="-9" cy="-15.6" r=".85" fill="#FFFFFF" />
              <circle cx="-7.8" cy="-13.6" r=".4" fill="#FFFFFF" />
            </g>
            <path d="M-13.6 -8.2 C-12.6 -7.1 -11 -7.1 -10.2 -8.1" fill="none" stroke="#5A3420" strokeWidth=".8" strokeLinecap="round" />
            {rudolph && <circle cx="-16.4" cy="-11.6" r="5" fill="#FF3B3B" opacity=".22" className="nariz-halo" />}
            <circle cx="-16.4" cy="-11.6" r={rudolph ? 2.9 : 2.2} fill={rudolph ? '#FF2B2B' : '#3B2316'} className={rudolph ? 'nariz' : undefined} />
            <circle cx="-17.1" cy="-12.4" r=".8" fill="#FFFFFF" opacity=".7" />
          </g>
        </g>
      </g>
    </g>
  );
}

function Treno() {
  return (
    <svg viewBox="0 0 270 64" className="nt-treno-svg">
      <defs>
        <radialGradient id="nt-rena-pelo" cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#C38653" />
          <stop offset=".55" stopColor="#94603D" />
          <stop offset="1" stopColor="#6E4129" />
        </radialGradient>
      </defs>
      {/* As rédeas, com folga, de uma coleira à outra e da última ao trenó */}
      <path d="M33 26 Q47 33 61 26 M81 26 Q95 33 109 26 M129 26 Q156 36 182 30" className="arreio" />
      <Rena x={0} ordem={0} rudolph />
      <Rena x={48} ordem={1} />
      <Rena x={96} ordem={2} />
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
