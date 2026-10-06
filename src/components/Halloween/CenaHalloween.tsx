import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { cn } from '@/lib/utils';
import { EVENTO_ACORDO_SALVO, type CenaHalloween } from './tema';
import { FANTASMA, sortearEsconderijo, type Esconderijo } from './esconderijo';
import { Fumaca } from './Fumaca';
import { VultoNoVidro } from './VultoNoVidro';
import { Aranha } from './Aranha';
import { MorcegoSvg } from './Desenhos';
import './halloween.css';


/*
 * As três camadas do tema, montadas pelo `Layout` dentro da coluna da direita
 * (barra de cima + conteúdo), que fica `relative` enquanto o tema está ligado:
 *
 *   FundoHalloween   — atrás do `<main>` (que fica transparente): chuva,
 *                      nuvens, névoa, o vulto atrás do vidro (`VultoNoVidro`). Só
 *                      aparece nos vãos entre cards.
 *   CamadaHalloween  — DENTRO do `<main>`, no alto do conteúdo: teias,
 *                      aranha, fantasmas, lanterna. Rola junto com a página.
 *                      A aranha solta sai dela para um palco fixo (`Aranha.tsx`).
 *   SobreposicaoHalloween — parada por cima do conteúdo: clarão do trovão e
 *                      chuva de doces.
 *   RevoadaHalloween — a tela toda, barra incluída: os morcegos.
 *
 * Tudo com `pointer-events: none`, menos o que é para clicar (aranha, mão da
 * lanterna, fantasma, morcego). Nenhuma camada lê nem grava dado.
 */

const TROVAO = 'hw-trovao';
const acaso = (min: number, max: number) => min + Math.random() * (max - min);

function useClaro() {
  const { resolvedTheme } = useTheme();
  return !ehTemaEscuro(resolvedTheme);
}

// ── Fundo ─────────────────────────────────────────────────────────────────────

export function FundoHalloween({ cena }: { cena: CenaHalloween }) {
  const claro = useClaro();
  return (
    <div className={cn('hw-fundo text-foreground', claro && 'hw-claro')} aria-hidden="true">
      {cena.nuvens && <Nuvens />}
      {cena.chuva && <Chuva />}
      {cena.vulto && <VultoNoVidro claro={claro} />}
      {cena.vulto && <Fumaca claro={claro} />}
      {cena.nevoa && !cena.vulto && <Nevoa densa={false} />}
    </div>
  );
}

function Nuvens() {
  const [clarao, setClarao] = useState(false);
  useEffect(() => {
    let t: number | undefined;
    const ouvir = () => { setClarao(true); window.clearTimeout(t); t = window.setTimeout(() => setClarao(false), 380); };
    window.addEventListener(TROVAO, ouvir);
    return () => { window.removeEventListener(TROVAO, ouvir); window.clearTimeout(t); };
  }, []);
  const blocos = useMemo(() => Array.from({ length: 7 }, (_, i) => ({
    left: `${i * 15 - 5 + acaso(-4, 4)}%`, top: acaso(0, 70), width: `${acaso(18, 30)}%`, height: acaso(90, 150), t: `${acaso(45, 80)}s`,
  })), []);
  return (
    <div className={cn('hw-nuvens', clarao && 'clarao')}>
      {blocos.map((b, i) => <i key={i} style={{ left: b.left, top: b.top, width: b.width, height: b.height, ['--t' as string]: b.t }} />)}
    </div>
  );
}

/** Camadas de profundidade da chuva: cada uma é um traço só por quadro. */
const PLANOS_DA_CHUVA = 4;

function Chuva() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cx = cv.getContext('2d'); if (!cx) return;
    type Gota = { x: number; y: number; v: number; c: number; plano: number };
    let gotas: Gota[] = [], raio: { pts: [number, number][]; vida: number } | null = null, cor = '#888', quadro = 0, rodando = true;
    // A conta é em px da tela; o canvas tem meia resolução e o CSS estica. A
    // ampliação já amacia a gota — antes era um `filter: blur` de CSS sobre a
    // tela inteira, refeito a cada quadro.
    let w = 0, h = 0;
    const nova = (qualquerAltura: boolean): Gota => {
      // Longe = menor, mais lenta e mais apagada. Sorteada em planos, para
      // desenhar cada plano de uma vez (mesma espessura e transparência).
      const plano = Math.floor(Math.random() * PLANOS_DA_CHUVA), z = (plano + Math.random()) / PLANOS_DA_CHUVA;
      return { x: Math.random() * (w + 120) - 60, y: qualquerAltura ? Math.random() * h : -20 - Math.random() * 60, v: 7 + z * 9, c: 10 + z * 16, plano };
    };
    const ajustar = () => {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.max(1, Math.round(w / 2)); cv.height = Math.max(1, Math.round(h / 2));
      cx.setTransform(cv.width / Math.max(1, w), 0, 0, cv.height / Math.max(1, h), 0, 0);
      gotas = Array.from({ length: Math.round(w * h / 9000) }, () => nova(true));
    };
    const trovao = () => {
      const x0 = w * acaso(0.3, 0.9), pts: [number, number][] = [[x0, 0]];
      let x = x0, y = 0;
      while (y < h * acaso(0.6, 0.9)) { y += acaso(14, 36); x += acaso(-17, 17); pts.push([x, y]); }
      raio = { pts, vida: 8 }; // quadros, a 30 por segundo
      window.dispatchEvent(new CustomEvent(TROVAO, { detail: { x: x0 / Math.max(1, w) } }));
    };
    let ultimo = 0;
    const quadroDaChuva = (agora: number) => {
      if (!rodando) return;
      // 30 quadros por segundo, com passo dobrado: a mesma chuva, metade do trabalho.
      if (agora - ultimo < 32) { requestAnimationFrame(quadroDaChuva); return; }
      ultimo = agora;
      if (quadro++ % 15 === 0) cor = getComputedStyle(cv).color; // acompanha a troca de tema
      cx.clearRect(0, 0, w, h);
      cx.strokeStyle = cor; cx.lineCap = 'round';
      for (const g of gotas) {
        g.y += g.v * 2; g.x -= g.v * 0.36;
        if (g.y > h + 20) Object.assign(g, nova(false));
      }
      for (let p = 0; p < PLANOS_DA_CHUVA; p++) {
        const z = (p + 0.5) / PLANOS_DA_CHUVA;
        cx.globalAlpha = 0.12 + z * 0.3; cx.lineWidth = 0.6 + z * 0.8;
        cx.beginPath();
        for (const g of gotas) if (g.plano === p) { cx.moveTo(g.x, g.y); cx.lineTo(g.x + g.c * 0.18, g.y - g.c); }
        cx.stroke();
      }
      if (raio && raio.vida-- > 0) {
        cx.globalAlpha = raio.vida > 6 || (raio.vida > 2 && raio.vida < 5) ? 0.7 : 0.25;
        cx.lineWidth = 2; cx.beginPath();
        raio.pts.forEach(([px, py], i) => (i ? cx.lineTo(px, py) : cx.moveTo(px, py)));
        cx.stroke();
      }
      cx.globalAlpha = 1;
      requestAnimationFrame(quadroDaChuva);
    };
    ajustar(); requestAnimationFrame(quadroDaChuva);
    const obs = new ResizeObserver(ajustar); obs.observe(cv);
    let t: number;
    const agenda = () => { t = window.setTimeout(() => { trovao(); agenda(); }, acaso(12000, 30000)); };
    agenda();
    return () => { rodando = false; obs.disconnect(); window.clearTimeout(t); };
  }, []);
  return <canvas ref={ref} className="hw-chuva" />;
}

function Nevoa({ densa }: { densa: boolean }) {
  const manchas = useMemo(() => Array.from({ length: densa ? 9 : 6 }, (_, i) => {
    const embaixo = !densa && i < 4;
    return { left: `${acaso(-15, 75)}%`, top: embaixo ? `${acaso(62, 88)}%` : `${acaso(0, 85)}%`, width: `${acaso(30, 55)}%`, height: `${acaso(18, 34)}%`, t: `${acaso(30, 60)}s`, d: `${-acaso(0, 30)}s` };
  }), [densa]);
  return (
    <div className="hw-nevoa">
      {manchas.map((m, i) => <i key={i} style={{ left: m.left, top: m.top, width: m.width, height: m.height, ['--t' as string]: m.t, animationDelay: m.d }} />)}
    </div>
  );
}

// ── Camada de cima ────────────────────────────────────────────────────────────

export function CamadaHalloween({ cena }: { cena: CenaHalloween }) {
  const claro = useClaro();
  return (
    <div className={cn('hw-camada text-foreground', claro && 'hw-claro')} aria-hidden="true">
      {(cena.teias === 'ambas' || cena.teias === 'esquerda') && <Teia lado="esq" />}
      {(cena.teias === 'ambas' || cena.teias === 'direita') && <Teia lado="dir" />}
      {cena.aranha && <Aranha claro={claro} />}
      {cena.fantasmas && <FantasmasDasTabelas />}
      {cena.lanterna !== null && <Lanterna posicao={cena.lanterna} />}
    </div>
  );
}

export function SobreposicaoHalloween({ cena }: { cena: CenaHalloween }) {
  const claro = useClaro();
  return (
    <div className={cn('hw-sobre', claro && 'hw-claro')} aria-hidden="true">
      {cena.chuva && <Relampago />}
      <ChuvaDeDoces />
    </div>
  );
}

/**
 * A cada 3 a 6 acordos salvos (sorteado de novo a cada vez), caem balas e
 * abobrinhas por um segundo e meio. Aleatório de propósito: se fosse todo
 * acordo, virava ruído no terceiro.
 */
function ChuvaDeDoces() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cx = cv.getContext('2d'); if (!cx) return;
    const CORES = ['#ff8a1f', '#8a4fff', '#43c46b', '#ff4f8b', '#ffd23f'];
    type Doce = { x: number; y: number; vx: number; vy: number; r: number; vr: number; vida: number; a: number; abobora: boolean; cor: string };
    let doces: Doce[] = [], rodando = false, faltam = Math.floor(acaso(3, 7));
    const desenhar = (d: Doce) => {
      cx.save(); cx.translate(d.x, d.y); cx.rotate(d.r); cx.globalAlpha = d.a;
      if (d.abobora) {
        cx.fillStyle = '#f07b17';
        for (const dx of [-4, 4, 0]) { cx.beginPath(); cx.ellipse(dx, 0, 6, 8, 0, 0, Math.PI * 2); cx.fill(); }
        cx.fillStyle = '#4d6b2a'; cx.fillRect(-1, -11, 2.5, 4);
      } else {
        cx.fillStyle = d.cor;
        cx.beginPath(); cx.arc(0, 0, 6, 0, Math.PI * 2); cx.fill();
        cx.beginPath(); cx.moveTo(-5, 0); cx.lineTo(-12, -5); cx.lineTo(-12, 5); cx.closePath(); cx.fill();
        cx.beginPath(); cx.moveTo(5, 0); cx.lineTo(12, -5); cx.lineTo(12, 5); cx.closePath(); cx.fill();
        cx.fillStyle = 'rgba(255,255,255,.45)'; cx.fillRect(-2, -5, 2, 10);
      }
      cx.restore();
    };
    const passo = () => {
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const d of doces) { d.vy += 0.22; d.x += d.vx; d.y += d.vy; d.r += d.vr; d.vida--; if (d.vida < 30) d.a = Math.max(0, d.vida / 30); desenhar(d); }
      doces = doces.filter(d => d.vida > 0 && d.y < cv.height + 30);
      if (doces.length) requestAnimationFrame(passo); else { rodando = false; cx.clearRect(0, 0, cv.width, cv.height); }
    };
    const chover = () => {
      cv.width = cv.clientWidth; cv.height = cv.clientHeight;
      for (let i = 0; i < 80; i++) {
        doces.push({ x: cv.width * acaso(0.15, 0.85), y: -20 - Math.random() * 90, vx: acaso(-2.5, 2.5), vy: Math.random() * 3, r: Math.random() * 6,
          vr: acaso(-0.12, 0.12), vida: acaso(110, 150), a: 1, abobora: Math.random() < 0.25, cor: CORES[i % CORES.length] });
      }
      if (!rodando) { rodando = true; requestAnimationFrame(passo); }
    };
    const salvo = () => { if (--faltam > 0) return; faltam = Math.floor(acaso(3, 7)); chover(); };
    window.addEventListener(EVENTO_ACORDO_SALVO, salvo);
    return () => window.removeEventListener(EVENTO_ACORDO_SALVO, salvo);
  }, []);
  return <canvas ref={ref} className="hw-doces" />;
}

function desenharTeia(tam: number) {
  const raios = 7, voltas = 7, d: string[] = [];
  const ang = (i: number) => (Math.PI / 2) * (i / (raios - 1));
  const p = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  for (let i = 0; i < raios; i++) d.push(`M0 0 L${p(ang(i), tam * (0.92 + 0.08 * Math.sin(i * 2.3)))}`);
  for (let k = 1; k <= voltas; k++) {
    const r = tam * (k / voltas) * 0.9;
    for (let i = 0; i < raios - 1; i++) {
      if (k === 5 && i === 3) continue; // um fio arrebentado
      const a1 = ang(i), a2 = ang(i + 1);
      d.push(`M${p(a1, r)} Q${p((a1 + a2) / 2, r * 0.86)} ${p(a2, r)}`);
    }
  }
  return d.join(' ');
}
const TEIA = desenharTeia(100);

function Teia({ lado }: { lado: 'esq' | 'dir' }) {
  return <div className={cn('hw-teia', lado)}><svg viewBox="0 0 100 100"><path d={TEIA} /></svg></div>;
}

function Relampago() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ouvir = (e: Event) => {
      const el = ref.current; if (!el) return;
      const x = (e as CustomEvent<{ x: number }>).detail?.x ?? 0.7;
      el.style.setProperty('--rx', `${Math.round(x * 100)}%`);
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    };
    window.addEventListener(TROVAO, ouvir);
    return () => window.removeEventListener(TROVAO, ouvir);
  }, []);
  // A casca cobre a tela; o clarão em si anima a opacidade de dentro.
  return <div className="hw-relampago-casca"><div ref={ref} className="hw-relampago" /></div>;
}

function FantasmaSvg() {
  return (
    <svg viewBox="0 0 38 44">
      <path className="lencol" d="M3 42 V18 A16 16 0 0 1 35 18 V42 L30 38 L25 42 L19 38 L13 42 L8 38 Z" />
      <ellipse className="olhos" cx="13.5" cy="18" rx="2.6" ry="3.6" /><ellipse className="olhos" cx="24.5" cy="18" rx="2.6" ry="3.6" />
      <ellipse className="olhos" cx="19" cy="27" rx="2.4" ry="2" opacity=".55" />
    </svg>
  );
}

/**
 * De tempos em tempos um fantasma espia de trás de uma tabela visível — por
 * cima, por baixo (de cabeça para baixo) ou por um dos lados —, com tamanho,
 * ponto, tempo e direção do olhar sorteados. O «atrás» é um recorte encostado
 * na borda: só aparece o que passou dela. Ver `esconderijo.ts`.
 */
function FantasmasDasTabelas() {
  const camada = useRef<HTMLDivElement>(null);
  const [aparicao, setAparicao] = useState<(Esconderijo & { id: number; escala: number; dur: number; espelho: boolean }) | null>(null);
  const [some, setSome] = useState(false);
  useEffect(() => {
    let t: number, id = 0;
    const tentar = () => {
      // A camada rola com o conteúdo: a posição é gravada em relação a ela,
      // então o fantasma fica preso à tabela quando a página rola.
      const base = camada.current?.getBoundingClientRect();
      const main = camada.current?.closest('main');
      if (base && main) {
        const escala = acaso(0.8, 1.25);
        const e = sortearEsconderijo([...main.querySelectorAll('table')].map(tb => tb.getBoundingClientRect()), main.getBoundingClientRect(), escala);
        if (e) {
          setSome(false);
          setAparicao({ ...e, left: e.left - base.left, top: e.top - base.top, id: id++, escala, dur: acaso(4.5, 7), espelho: Math.random() < 0.5 });
        }
      }
      t = window.setTimeout(tentar, acaso(15000, 40000));
    };
    t = window.setTimeout(tentar, acaso(4000, 9000));
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div ref={camada} className="absolute left-0 top-0 h-0 w-full">
      {aparicao && (
        <div key={aparicao.id} className={cn('hw-esconderijo', aparicao.lado)}
          style={{ left: aparicao.left, top: aparicao.top, width: aparicao.largura, height: aparicao.altura }}>
          <div className={cn('hw-fantasma', some && 'some', aparicao.espelho && 'espelho')} onMouseEnter={() => setSome(true)}
            style={{ ['--gw' as string]: `${FANTASMA.largura * aparicao.escala}px`, ['--gh' as string]: `${FANTASMA.altura * aparicao.escala}px`, ['--dur' as string]: `${aparicao.dur}s` }}
            onAnimationEnd={() => setAparicao(null)}><FantasmaSvg /></div>
        </div>
      )}
    </div>
  );
}

/**
 * A mão com a lanterna, saindo de baixo da barra de cima. Clique nela liga e
 * desliga. De vez em quando a luz pisca e um rosto aparece no fim do feixe.
 */
function Lanterna({ posicao }: { posicao: number }) {
  const [desligada, setDesligada] = useState(false);
  const [fase, setFase] = useState<'' | 'pisca' | 'aparece' | 'apaga'>('');
  const [aperto, setAperto] = useState(0);
  const desligadaRef = useRef(desligada);
  desligadaRef.current = desligada;
  useEffect(() => {
    const timers: number[] = [];
    const susto = () => {
      if (!desligadaRef.current) {
        setFase('pisca');
        timers.push(window.setTimeout(() => setFase('aparece'), 700));
        timers.push(window.setTimeout(() => setFase('apaga'), 2450));
        timers.push(window.setTimeout(() => setFase(''), 3050));
      }
      timers.push(window.setTimeout(susto, acaso(45000, 100000)));
    };
    timers.push(window.setTimeout(susto, acaso(8000, 15000)));
    return () => timers.forEach(t => window.clearTimeout(t));
  }, []);
  const clicar = () => { if (fase) return; setDesligada(d => !d); setAperto(a => a + 1); };
  const aperta = aperto ? `aperto-${aperto % 2}` : '';
  return (
    <div className={cn('hw-lanterna', desligada && 'desligada', fase && 'susto', fase)} style={{ left: `${posicao}%` }}>
      <div className="giro">
        <div className="feixe">
          {/* O cone vem borrado de dentro do SVG (pintado uma vez): `filter` de CSS na camada que
              estica era refeito pela placa de vídeo a cada quadro. */}
          <div className="cone">
            <svg viewBox="0 0 420 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="hw-cone-luz" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" style={{ stopColor: 'var(--luz)' }} />
                  <stop offset=".62" style={{ stopColor: 'color-mix(in oklch, var(--luz) 38%, var(--luz-fim))' }} />
                  <stop offset="1" style={{ stopColor: 'var(--luz-fim)', stopOpacity: 0 }} />
                </linearGradient>
                <filter id="hw-cone-borrao" filterUnits="userSpaceOnUse" x="-10" y="-10" width="440" height="120">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
              </defs>
              <polygon points="0,45 420,0 420,100 0,55" fill="url(#hw-cone-luz)" filter="url(#hw-cone-borrao)" />
            </svg>
          </div>
          <div className="foco" />
          {/* O trilho anda junto com o foco: o rosto aparece onde a luz está, e não no alcance máximo. */}
          <div className="trilho">
          <div className="hw-assombracao">
            <svg viewBox="0 0 80 110">
              <defs>
                <linearGradient id="hw-alma" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="oklch(0.97 0.01 250)" /><stop offset=".55" stopColor="oklch(0.86 0.02 250)" stopOpacity=".9" /><stop offset="1" stopColor="oklch(0.8 0.02 250)" stopOpacity="0" /></linearGradient>
                <radialGradient id="hw-oco" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#000" /><stop offset="1" stopColor="oklch(0.15 0.02 260)" /></radialGradient>
              </defs>
              <path fill="url(#hw-alma)" d="M40 4 C18 4 8 22 9 44 C10 62 6 80 2 106 C10 97 14 105 20 96 C24 107 30 98 34 109 C38 98 44 107 48 97 C54 107 58 96 64 103 C66 90 70 70 71 46 C73 22 62 4 40 4 Z" />
              <path d="M22 30 Q29 25 35 31 M45 31 Q51 25 58 30" stroke="oklch(0.35 0.02 260 / .5)" strokeWidth="1.5" fill="none" />
              <ellipse cx="29" cy="40" rx="6" ry="10.5" transform="rotate(12 29 40)" fill="url(#hw-oco)" />
              <ellipse cx="51" cy="40" rx="6" ry="10.5" transform="rotate(-12 51 40)" fill="url(#hw-oco)" />
              <circle cx="29.6" cy="42" r="1.3" fill="oklch(0.68 0.22 25)" /><circle cx="50.4" cy="42" r="1.3" fill="oklch(0.68 0.22 25)" />
              <path d="M27 50 Q26 58 28 66 M53 50 Q54 58 52 66" stroke="oklch(0.25 0.02 260 / .35)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <path d="M34 58 C34 51 46 51 46 58 C47 73 43 85 40 88 C37 85 33 73 34 58 Z" fill="url(#hw-oco)" />
            </svg>
          </div>
          </div>
        </div>
        <svg key={`c${aperta}`} className={cn('corpo', aperto > 0 && 'aperto')} viewBox="0 0 46 22" onClick={clicar}>
          <rect x="1" y="6.5" width="26" height="9" rx="2.5" fill="oklch(0.32 0.01 250)" stroke="oklch(0.5 0.01 250)" strokeWidth=".7" />
          <path d="M6 7 V15 M9 7 V15 M12 7 V15 M15 7 V15" stroke="oklch(0.22 0.01 250)" strokeWidth="1" />
          <rect className="botao" x="18" y="4.8" width="4" height="3" rx=".8" />
          <path d="M27 6.5 L37 2 H40 V20 H37 L27 15.5 Z" fill="oklch(0.4 0.01 250)" stroke="oklch(0.55 0.01 250)" strokeWidth=".7" />
          <ellipse className="lente" cx="41.5" cy="11" rx="2.6" ry="9" />
        </svg>
        <svg key={`m${aperta}`} className={cn('mao', aperto > 0 && 'aperto')} viewBox="0 0 60 50" onClick={clicar}>
          {/* braço: o corte reto (y=0) fica na borda de baixo da barra de cima */}
          <path className="manga" d="M31 0 H47.5 L47 18 Q39 19.5 31.5 18 Z" />
          <path className="punho" d="M31.2 16.5 Q39 18 47.2 16.5 L47 22 Q39 23.5 31.4 22 Z" />
          <path className="pele" d="M32.2 21.8 Q39 23 46.2 21.8 Q49.5 24.5 50.5 29 L50.5 30.2 Q40 31.6 29.8 30.4 Q30.2 25.5 32.2 21.8 Z" />
          <rect className="pele" x="30.5" y="28" width="4.6" height="12" rx="2.3" transform="rotate(-6 32.8 34)" />
          <rect className="pele" x="35.3" y="28.2" width="4.6" height="12.3" rx="2.3" transform="rotate(-4 37.6 34)" />
          <rect className="pele" x="40.1" y="28.4" width="4.6" height="12" rx="2.3" transform="rotate(-2 42.4 34)" />
          <rect className="pele" x="44.9" y="28.8" width="4.3" height="11" rx="2.15" />
          <path className="dobra" d="M31.6 36 h3 M36.4 36.2 h3 M41.2 36.2 h3 M45.9 35.8 h2.6" />
          <path className="pele" d="M44 27.5 Q50 25.2 56 26.6 Q58 27.6 56.6 29 Q51 29.6 46 30 Z" />
        </svg>
      </div>
    </div>
  );
}

// ── Morcegos, em qualquer tela ────────────────────────────────────────────────
// O desenho mora em `Desenhos.tsx`: o carteiro do cartaz é o mesmo morcego.

/**
 * Um bando pequeno cruza a tela de vez em quando. Clicou num morcego, ele
 * perde o controle e cai rodopiando. Feito à mão no DOM (e não em estado do
 * React) porque são poucos elementos que vivem segundos e se movem por quadro.
 */
export function RevoadaHalloween() {
  const ref = useRef<HTMLDivElement>(null);
  const [bandos, setBandos] = useState<{ id: number; morcegos: { top: number; d: number; atraso: number; s: number; bater: number }[] }[]>([]);
  useEffect(() => {
    let t: number, id = 0;
    const soltar = () => {
      const alt = ref.current?.clientHeight ?? 600;
      setBandos(bs => [...bs.slice(-2), { id: id++, morcegos: Array.from({ length: Math.floor(acaso(3, 8)) }, (_, i) => ({
        top: acaso(40, Math.max(80, alt * 0.45)), d: acaso(4.6, 6.6), atraso: i * 0.22, s: acaso(0.7, 1.3), bater: acaso(0.28, 0.4),
      })) }]);
      t = window.setTimeout(soltar, acaso(3 * 60000, 5 * 60000));
    };
    // De 3 a 7 morcegos, a cada 3 a 5 minutos — o primeiro bando também.
    t = window.setTimeout(soltar, acaso(3 * 60000, 5 * 60000));
    return () => window.clearTimeout(t);
  }, []);

  const derrubar = (m: HTMLDivElement, e: React.PointerEvent) => {
    const camada = ref.current;
    if (!camada || m.classList.contains('caindo')) return;
    const caixa = camada.getBoundingClientRect();
    const mat = new DOMMatrix(getComputedStyle(m).transform);
    let x = mat.m41, y = mat.m42, rot = 0, vx = acaso(1.2, 2.7), vy = -3.2, n = 0;
    const vr = (Math.random() < 0.5 ? -1 : 1) * acaso(7, 13);
    m.classList.add('caindo');
    m.style.transform = `translate(${x}px, ${y}px)`;
    const pof = document.createElement('div');
    pof.className = 'hw-pof';
    pof.style.left = `${e.clientX - caixa.left}px`; pof.style.top = `${e.clientY - caixa.top}px`;
    pof.innerHTML = Array.from({ length: 7 }, (_, i) => `<i style="--a:${i * 51}deg"></i>`).join('');
    camada.appendChild(pof); window.setTimeout(() => pof.remove(), 600);
    const topo = m.offsetTop;
    const cai = () => {
      n++; vy += 0.32; vx *= 0.99;
      x += vx + Math.sin(n / 4) * 1.6; y += vy; rot += vr * (1 - Math.min(n, 40) / 120);
      m.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
      if (topo + y < camada.clientHeight + 40) requestAnimationFrame(cai); else m.style.display = 'none';
    };
    requestAnimationFrame(cai);
  };

  const largura = ref.current?.clientWidth ?? 1200;
  return (
    <div ref={ref} className="hw-revoada" aria-hidden="true">
      {bandos.map(b => b.morcegos.map((m, i) => (
        <div key={`${b.id}-${i}`} className="hw-morcego"
          style={{ top: m.top, width: 50 * m.s, height: 25 * m.s, animationDelay: `${m.atraso}s`, ['--w' as string]: `${largura}px`, ['--d' as string]: `${m.d}s`, ['--bater' as string]: `${m.bater}s` }}
          onPointerDown={e => derrubar(e.currentTarget, e)}
          onAnimationEnd={e => { if (e.animationName === 'hw-voa') e.currentTarget.style.display = 'none'; }}>
          <MorcegoSvg />
        </div>
      )))}
    </div>
  );
}
