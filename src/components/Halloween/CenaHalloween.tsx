import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { cn } from '@/lib/utils';
import type { CenaHalloween } from './tema';
import './halloween.css';

/*
 * As três camadas do tema, montadas pelo `Layout` dentro da coluna da direita
 * (barra de cima + conteúdo), que fica `relative` enquanto o tema está ligado:
 *
 *   FundoHalloween   — atrás do `<main>` (que fica transparente): chuva,
 *                      nuvens, névoa, olhos. Só aparece nos vãos entre cards.
 *   CamadaHalloween  — por cima do conteúdo, a partir da borda de baixo da
 *                      barra: teias, aranha, fantasmas, lanterna, clarão.
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
      {cena.olhos && <Olhos />}
      {(cena.nevoa || cena.olhos) && <Nevoa densa={cena.olhos} />}
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

function Chuva() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cx = cv.getContext('2d'); if (!cx) return;
    type Gota = { x: number; y: number; v: number; c: number; a: number; w: number };
    let gotas: Gota[] = [], raio: { pts: [number, number][]; vida: number } | null = null, cor = '#888', quadro = 0, rodando = true;
    const nova = (qualquerAltura: boolean): Gota => {
      const z = Math.random(); // longe = menor, mais lenta e mais apagada
      return { x: Math.random() * (cv.width + 120) - 60, y: qualquerAltura ? Math.random() * cv.height : -20 - Math.random() * 60, v: 7 + z * 9, c: 10 + z * 16, a: 0.12 + z * 0.3, w: 0.6 + z * 0.8 };
    };
    const ajustar = () => {
      cv.width = cv.clientWidth; cv.height = cv.clientHeight;
      gotas = Array.from({ length: Math.round(cv.width * cv.height / 9000) }, () => nova(true));
    };
    const trovao = () => {
      const x0 = cv.width * acaso(0.3, 0.9), pts: [number, number][] = [[x0, 0]];
      let x = x0, y = 0;
      while (y < cv.height * acaso(0.6, 0.9)) { y += acaso(14, 36); x += acaso(-17, 17); pts.push([x, y]); }
      raio = { pts, vida: 16 };
      window.dispatchEvent(new CustomEvent(TROVAO, { detail: { x: x0 / cv.width } }));
    };
    const quadroDaChuva = () => {
      if (!rodando) return;
      if (quadro++ % 30 === 0) cor = getComputedStyle(cv).color; // acompanha a troca de tema
      cx.clearRect(0, 0, cv.width, cv.height);
      cx.strokeStyle = cor; cx.lineCap = 'round';
      for (const g of gotas) {
        g.y += g.v; g.x -= g.v * 0.18;
        if (g.y > cv.height + 20) Object.assign(g, nova(false));
        cx.globalAlpha = g.a; cx.lineWidth = g.w;
        cx.beginPath(); cx.moveTo(g.x, g.y); cx.lineTo(g.x + g.c * 0.18, g.y - g.c); cx.stroke();
      }
      if (raio && raio.vida-- > 0) {
        cx.globalAlpha = raio.vida > 12 || (raio.vida > 5 && raio.vida < 9) ? 0.7 : 0.25;
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

/** Olhos que aparecem na névoa, olham, piscam de vez em quando e somem. */
function Olhos() {
  type Par = { id: number; x: number; y: number; w: number; gap: number; t: number; visivel: boolean; pisca: boolean };
  const [pares, setPares] = useState<Par[]>([]);
  useEffect(() => {
    let id = 0; const timers: number[] = [];
    const novo = (): Par => {
      const w = acaso(14, 26);
      return { id: id++, x: acaso(4, 92), y: acaso(8, 88), w, gap: w * acaso(0.7, 1.1), t: acaso(5, 9), visivel: false, pisca: false };
    };
    setPares(Array.from({ length: 5 }, novo));
    const mostrar = () => setPares(ps => ps.map(p => ({ ...p, visivel: true })));
    timers.push(window.setTimeout(mostrar, 80));
    // Um par some e outro aparece em outro lugar, devagar
    timers.push(window.setInterval(() => {
      setPares(ps => { const i = Math.floor(Math.random() * ps.length); return ps.map((p, j) => (j === i ? { ...p, visivel: false } : p)); });
      timers.push(window.setTimeout(() => {
        setPares(ps => { const i = ps.findIndex(p => !p.visivel); if (i < 0) return ps; const c = [...ps]; c[i] = novo(); return c; });
        timers.push(window.setTimeout(mostrar, 60));
      }, 2800));
    }, 9000));
    // Piscadas
    timers.push(window.setInterval(() => {
      setPares(ps => { const i = Math.floor(Math.random() * ps.length); return ps.map((p, j) => (j === i ? { ...p, pisca: true } : p)); });
      timers.push(window.setTimeout(() => setPares(ps => ps.map(p => ({ ...p, pisca: false }))), 260));
    }, 2300));
    return () => timers.forEach(t => { window.clearTimeout(t); window.clearInterval(t); });
  }, []);
  return (
    <>
      {pares.map(p => (
        <div key={p.id} className={cn('hw-olhos', p.pisca && 'pisca')}
          style={{ left: `${p.x}%`, top: `${p.y}%`, opacity: p.visivel ? 0.85 : 0, ['--w' as string]: `${p.w}px`, ['--gap' as string]: `${p.gap}px`, ['--t' as string]: `${p.t}s` }}>
          <span className="hw-olho" /><span className="hw-olho" />
        </div>
      ))}
    </>
  );
}

// ── Camada de cima ────────────────────────────────────────────────────────────

export function CamadaHalloween({ cena }: { cena: CenaHalloween }) {
  const claro = useClaro();
  return (
    <div className={cn('hw-camada text-foreground', claro && 'hw-claro')} aria-hidden="true">
      {(cena.teias === 'ambas' || cena.teias === 'esquerda') && <Teia lado="esq" />}
      {(cena.teias === 'ambas' || cena.teias === 'direita') && <Teia lado="dir" />}
      {cena.aranha && <Aranha />}
      {cena.fantasmas && <FantasmasDasTabelas />}
      {cena.lanterna !== null && <Lanterna posicao={cena.lanterna} />}
      {cena.chuva && <Relampago />}
    </div>
  );
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

/** Pendurada na teia da direita. Passou o mouse: sobe o fio e some por 0 a 3 minutos. */
function Aranha() {
  const caixa = useRef<HTMLDivElement>(null);
  const fio = useRef<HTMLDivElement>(null);
  const ocupada = useRef(false);
  useEffect(() => () => { ocupada.current = false; }, []);
  const foge = () => {
    const el = caixa.current, f = fio.current;
    if (!el || !f || ocupada.current) return;
    ocupada.current = true;
    const h = f.getBoundingClientRect().height;
    f.style.animation = 'none'; f.style.height = `${h}px`;
    el.classList.add('escalando');
    const sobe = f.animate([{ height: `${h}px` }, { height: '4px' }], { duration: Math.max(1600, h * 20), easing: 'cubic-bezier(.4, .1, .6, .95)', fill: 'forwards' });
    sobe.onfinish = () => {
      f.style.height = '4px'; sobe.cancel(); el.classList.remove('escalando');
      window.setTimeout(() => {
        if (!fio.current) return;
        el.classList.add('descendo');
        const desce = f.animate([{ height: '4px' }, { height: `${110 * 0.45}px` }], { duration: 3200, easing: 'ease-in-out', fill: 'forwards' });
        desce.onfinish = () => { desce.cancel(); f.style.height = ''; f.style.animation = ''; el.classList.remove('descendo'); ocupada.current = false; };
      }, Math.random() * 180000);
    };
  };
  return (
    <div ref={caixa} className="hw-aranha">
      <div ref={fio} className="fio" style={{ ['--h' as string]: '110px' }} />
      <svg viewBox="-13 -13 26 26" onMouseEnter={foge}>
        <g className="pernas">
          <path d="M-3 -2 L-9 -8 L-12 -4" /><path d="M-3 0 L-10 -3 L-13 1" /><path d="M-3 2 L-10 3 L-12 8" /><path d="M-2 3 L-7 8 L-8 12" />
          <path d="M3 -2 L9 -8 L12 -4" /><path d="M3 0 L10 -3 L13 1" /><path d="M3 2 L10 3 L12 8" /><path d="M2 3 L7 8 L8 12" />
        </g>
        <ellipse className="corpo" cx="0" cy="3" rx="5" ry="6" />
        <circle className="corpo" cx="0" cy="-4" r="3.4" />
        <circle className="olho" cx="-1.3" cy="-4.3" r=".9" /><circle className="olho" cx="1.3" cy="-4.3" r=".9" />
      </svg>
    </div>
  );
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
  return <div ref={ref} className="hw-relampago" />;
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
 * De tempos em tempos um fantasma sobe de trás de uma tabela visível, olha
 * para os lados e volta a se esconder. O «atrás» é um recorte: a caixa termina
 * na borda de cima da tabela, então só aparece o que passou dela.
 */
function FantasmasDasTabelas() {
  const camada = useRef<HTMLDivElement>(null);
  const [aparicao, setAparicao] = useState<{ id: number; left: number; top: number } | null>(null);
  const [some, setSome] = useState(false);
  useEffect(() => {
    let t: number, id = 0;
    const tentar = () => {
      const base = camada.current?.parentElement?.getBoundingClientRect();
      const main = document.querySelector('main');
      if (base && main) {
        const visiveis = [...main.querySelectorAll('table')].map(tb => tb.getBoundingClientRect())
          .filter(r => r.width > 120 && r.top > base.top + 70 && r.top < base.bottom - 80);
        const r = visiveis[Math.floor(Math.random() * visiveis.length)];
        if (r) {
          setSome(false);
          setAparicao({ id: id++, left: r.left - base.left + acaso(0.08, 0.85) * (r.width - 48), top: r.top - base.top - 64 });
        }
      }
      t = window.setTimeout(tentar, acaso(15000, 40000));
    };
    t = window.setTimeout(tentar, acaso(4000, 9000));
    return () => window.clearTimeout(t);
  }, []);
  return (
    <div ref={camada} className="absolute inset-0">
      {aparicao && (
        <div key={aparicao.id} className="hw-esconderijo" style={{ left: aparicao.left, top: aparicao.top }}>
          <div className={cn('hw-fantasma', some && 'some')} onMouseEnter={() => setSome(true)}
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
          <div className="cone" /><div className="foco" />
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

const ASA = (
  <>
    <path d="M45 17 C39 8 29 3.5 19.5 5.5 C15 8.5 12.5 13 13 18.5 C16.5 17 19.8 18.6 20.6 22.6 C24 20.6 27.8 22.6 28 26.8 C31.4 25 35.2 27 35.8 31 C39 29.4 42.6 30 45 32 Z" fill="#1B1A1F" />
    <path d="M45 19.5 C39 12.5 31 9 22.5 9.5 C27.5 15.5 31.5 22 34.5 28.6 C38.4 27.8 42 28.6 45 30 Z" fill="#2B2930" />
  </>
);

function MorcegoSvg() {
  return (
    <svg viewBox="0 0 100 50">
      <g className="asa-e">{ASA}</g>
      <g className="asa-d"><g transform="translate(100 0) scale(-1 1)">{ASA}</g></g>
      <g className="corpo-m">
        <path d="M44 20 L43 6 L48 13 Z M56 20 L57 6 L52 13 Z" fill="#1B1A1F" />
        <ellipse cx="50" cy="31" rx="6.5" ry="10" fill="#1B1A1F" />
        <circle cx="50" cy="20" r="8" fill="#1F1E24" />
        <g className="olhos-m">
          <path d="M44.5 18.5 L48.6 20.4 L45.4 21.8 Z M55.5 18.5 L51.4 20.4 L54.6 21.8 Z" fill="#F4A51C" />
          <circle cx="46.6" cy="20.6" r=".7" fill="#1B1A1F" /><circle cx="53.4" cy="20.6" r=".7" fill="#1B1A1F" />
        </g>
        <path className="olhos-x" d="M44.6 18.4 L48.2 22 M48.2 18.4 L44.6 22 M51.8 18.4 L55.4 22 M55.4 18.4 L51.8 22" stroke="#F4A51C" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

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
      setBandos(bs => [...bs.slice(-2), { id: id++, morcegos: Array.from({ length: Math.round(acaso(3, 5)) }, (_, i) => ({
        top: acaso(40, Math.max(80, alt * 0.45)), d: acaso(4.6, 6.6), atraso: i * 0.22, s: acaso(0.7, 1.3), bater: acaso(0.28, 0.4),
      })) }]);
      t = window.setTimeout(soltar, acaso(60000, 180000));
    };
    t = window.setTimeout(soltar, acaso(15000, 30000));
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
