import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { useModoLeve } from '@/lib/modoLeve';
import { cn } from '@/lib/utils';
import './boneco.css';

/*
 * A neve no alto do card do recorte do Dashboard (`FiltroEscopo`) e o boneco de
 * neve que passeia em cima dela.
 *
 * A camada é desenhada para a largura do card: montinhos irregulares, as duas
 * quinas cobertas e pinguinhos que escorrem por cima da borda. O desenho sai de
 * um sorteio com semente fixa, então a neve não muda de forma ao redimensionar —
 * só estica ou encolhe na ponta direita.
 *
 * O boneco não tem pés: desliza num montinho de neve de um ponto sorteado a
 * outro, inclinado para a frente, levantando um pouco de neve e deixando um
 * sulco que some. Para, às vezes acena ou olha para trás. A posição é um
 * `requestAnimationFrame` que escreve o `transform` direto no elemento — nenhum
 * render do React por quadro; o resto é CSS (`boneco.css`).
 *
 * Clicar nele faz pular e acenar. No modo leve ele fica parado, sem animação.
 */

/** Quanto da camada fica acima da borda do card (a neve empilhada). */
const ACIMA = 22;
/** Altura total da camada: acima + quina arredondada + pingos. */
const ALTURA = 46;
/** O `rounded-xl` do card. */
const RAIO = 12;

/** O boneco na tela, em px (o SVG é 72×76). */
const LARG_BONECO = 54;
const ALT_BONECO = 57;
/** Onde o montinho encosta na neve, medido do alto do boneco. */
const BASE = 55.2;
/** O boneco não chega às quinas: lá a neve desce pela lateral. */
const MARGEM = 36;
/** Abaixo disso o card é estreito demais para passear. */
const LARGURA_MINIMA = 180;

const VELOCIDADE = 24;      // px/s deslizando
const MAX_SULCOS = 40;      // marcas do deslize na neve ao mesmo tempo

function sorteador(semente: number) {
  let a = semente;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const suave = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const f = (n: number) => n.toFixed(2);

/** Catmull-Rom → Bézier: a curva passa por todos os pontos, sem quina. */
function curva(p: [number, number][], fechada: boolean) {
  const n = p.length;
  const em = (i: number) => fechada ? p[(i + n) % n] : p[Math.min(n - 1, Math.max(0, i))];
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < (fechada ? n : n - 1); i++) {
    const [a, b, c, e] = [em(i - 1), em(i), em(i + 1), em(i + 2)];
    d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`;
  }
  return fechada ? `${d}Z` : d;
}

export interface Geometria {
  largura: number;
  /** A altura da superfície da neve em `x` — onde o boneco pisa. */
  topo: (x: number) => number;
  massa: string;
  faiscas: { x: number; y: number; d: number; s: number }[];
}

function geometria(L: number): Geometria {
  // O contorno de cima do card, com as quinas arredondadas.
  const borda = (x: number) => {
    const c = Math.min(Math.max(x, 0), L);
    const d = c < RAIO ? RAIO - c : c > L - RAIO ? c - (L - RAIO) : 0;
    return ACIMA + RAIO - Math.sqrt(RAIO * RAIO - d * d);
  };
  const sorte = sorteador(11);
  // Montes fofos sorteados por cima de três ondas de períodos desencontrados;
  // nas quinas a camada afina para a neve "escorrer" pela lateral.
  const montes: { x: number; alt: number; s: number }[] = [];
  for (let x = 30 + sorte() * 80; x < L; x += 110 + sorte() * 170) {
    montes.push({ x, alt: 2.5 + sorte() * 3.5, s: 16 + sorte() * 18 });
  }
  const espessura = (x: number) => {
    const ondas = 7.4 + 1.9 * Math.sin(x / 47 + 1.3) + 1.3 * Math.sin(x / 21 + 0.4) + 0.7 * Math.sin(x / 9.1 + 2.1);
    const h = montes.reduce((s, m) => s + m.alt * Math.exp(-(((x - m.x) / m.s) ** 2)), ondas);
    return Math.min(ACIMA - 3, Math.max(4, h)) * (0.4 + 0.6 * suave(Math.min(x, L - x) / 28));
  };
  const topo = (x: number) => borda(x) - espessura(x);

  const gotas: { x: number; len: number; s: number }[] = [];
  for (let x = 26 + sorte() * 30; x < L - 26; x += 36 + sorte() * 72) {
    gotas.push({ x, len: 2 + sorte() * 3.8, s: 2.1 + sorte() * 1.9 });
  }
  const pingo = (x: number) => gotas.reduce((s, g) => s + g.len * Math.exp(-(((x - g.x) / g.s) ** 2)), 0);

  const cima: [number, number][] = [];
  for (let x = -1; x < L + 1; x += 4) cima.push([x, topo(x)]);
  cima.push([L + 1, topo(L + 1)]);
  const baixo: [number, number][] = [];
  for (let x = L + 1; x > -1; x -= 2) baixo.push([x, borda(x) + 1.6 + pingo(x)]);
  baixo.push([-1, borda(-1) + 1.6]);

  const faiscas: Geometria['faiscas'] = [];
  for (let x = 40 + sorte() * 40; x < L - 30; x += 55 + sorte() * 90) {
    faiscas.push({ x, y: topo(x) + 1.8 + sorte() * 2.2, d: -sorte() * 6, s: 0.7 + sorte() * 0.5 });
  }

  return { largura: L, topo, massa: curva([...cima, ...baixo], true), faiscas };
}

function useClaro() {
  const { resolvedTheme } = useTheme();
  return !ehTemaEscuro(resolvedTheme);
}

// ── A camada ──────────────────────────────────────────────────────────────────

/** Vai dentro de um card `relative` com `rounded-xl`. */
export function TopoNevado() {
  const leve = useModoLeve();
  const claro = useClaro();
  const caixa = useRef<HTMLDivElement>(null);
  const rastro = useRef<SVGGElement>(null);
  const [largura, setLargura] = useState(0);
  const id = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(Math.round(el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => (largura > 0 ? geometria(largura) : null), [largura]);

  return (
    <div ref={caixa} className={cn('nt-nevado', claro && 'nt-claro', leve && 'quieto')} aria-hidden="true">
      {geo && (
        <>
          <svg className="nt-neve-topo" width={largura} height={ALTURA} viewBox={`0 0 ${largura} ${ALTURA}`}>
            <defs>
              <linearGradient id={`${id}-neve`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={ACIMA - 14} y2={ACIMA + 6}>
                {/* No claro a neve precisa de mais azul na sombra: o fundo já é branco. */}
                <stop offset="0" stopColor="#FFFFFF" />
                <stop offset=".45" stopColor={claro ? '#F3F8FC' : '#F7FBFE'} />
                <stop offset=".8" stopColor={claro ? '#DAE7F2' : '#E4EEF7'} />
                <stop offset="1" stopColor={claro ? '#B9CFE2' : '#C9DBEA'} />
              </linearGradient>
            </defs>
            <path className="massa" d={geo.massa} fill={`url(#${id}-neve)`} />
            <g ref={rastro} />
            {geo.faiscas.map(({ x, y, d, s }) => (
              <g key={x} transform={`translate(${f(x)} ${f(y)}) scale(${f(s)})`}>
                <path className="faisca" style={{ '--d': `${d}s` } as CSSProperties}
                  d="M0-2.6L.55-.55 2.6 0 .55.55 0 2.6-.55.55-2.6 0-.55-.55Z" />
              </g>
            ))}
          </svg>
          {largura >= LARGURA_MINIMA && <BonecoDeNeve geo={geo} parado={leve} rastro={rastro} />}
        </>
      )}
    </div>
  );
}


// ── O boneco ──────────────────────────────────────────────────────────────────

const SVG = 'http://www.w3.org/2000/svg';
const acaso = (min: number, max: number) => min + Math.random() * (max - min);

function BonecoDeNeve({ geo, parado, rastro }: {
  geo: Geometria;
  parado: boolean;
  rastro: MutableRefObject<SVGGElement | null>;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const geoAtual = useRef(geo);
  geoAtual.current = geo;
  // O clique precisa falar com o laço que está rodando.
  const cutucar = useRef<() => void>(() => {});

  const limites = () => [MARGEM, geoAtual.current.largura - MARGEM] as const;
  const posicionar = (x: number) => {
    const el = raiz.current;
    if (el) el.style.transform = `translate3d(${f(x - LARG_BONECO / 2)}px, ${f(geoAtual.current.topo(x) - BASE)}px, 0)`;
  };
  // Virar não gira o boneco: o rosto, o nariz e a ponta do cachecol trocam de
  // lado com transição (`boneco.css`), como quem só olha para o outro lado.
  const virar = (dir: number) => {
    raiz.current?.classList.toggle('dir', dir > 0);
    raiz.current?.classList.toggle('esq', dir < 0);
  };

  // Parado (modo leve): fica num ponto só, e acompanha a largura do card.
  useEffect(() => {
    if (!parado) return;
    const [, max] = limites();
    posicionar(max - 20);
    virar(-1);
  }, [parado, geo]);

  useEffect(() => {
    if (parado) return;
    const el = raiz.current;
    if (!el) return;
    const relogios: number[] = [];
    const depois = (ms: number, fn: () => void) => { relogios.push(window.setTimeout(fn, ms)); };

    const [min0, max0] = limites();
    const e = {
      x: acaso(min0, max0), alvo: 0, v: 0, dir: Math.random() < 0.5 ? 1 : -1,
      movendo: false, ate: performance.now() + 900, sulco: 0, nevoa: 0,
    };
    virar(e.dir);
    posicionar(e.x);

    // O sulco do deslize na neve. A névoa que ele levanta é do desenho (CSS).
    const sulco = (x: number) => {
      const g = rastro.current;
      if (!g) return;
      const m = document.createElementNS(SVG, 'ellipse');
      m.setAttribute('cx', f(x));
      m.setAttribute('cy', f(geoAtual.current.topo(x) + 2.2));
      m.setAttribute('rx', '4.2');
      m.setAttribute('ry', '.75');
      m.setAttribute('class', 'sulco');
      m.addEventListener('animationend', () => m.remove());
      g.appendChild(m);
      while (g.childNodes.length > MAX_SULCOS) g.firstChild?.remove();
    };

    const parar = (agora: number) => {
      e.movendo = false;
      e.v = 0;
      el.classList.remove('deslizando');
      const r = Math.random();
      let pausa = acaso(1800, 5200);
      if (r < 0.3) {
        // Acena para quem está na tela.
        depois(450, () => el.classList.add('acenando'));
        depois(2200, () => el.classList.remove('acenando'));
        pausa = Math.max(pausa, 2700);
      } else if (r < 0.55) {
        // Olha para trás e volta.
        depois(700, () => virar(-e.dir));
        depois(2000, () => virar(e.dir));
        pausa = Math.max(pausa, 2700);
      }
      e.ate = agora + pausa;
    };

    const partir = () => {
      const [min, max] = limites();
      if (max - min < 40) return;
      let alvo = acaso(min, max);
      for (let i = 0; i < 6 && Math.abs(alvo - e.x) < 70; i++) alvo = acaso(min, max);
      e.alvo = alvo;
      e.dir = alvo > e.x ? 1 : -1;
      virar(e.dir);
      e.ate = Infinity;
      // Primeiro olha para onde vai, depois sai deslizando.
      depois(420, () => {
        e.movendo = true;
        e.sulco = 0;
        el.classList.add('deslizando');
      });
    };

    cutucar.current = () => {
      el.classList.remove('pulando');
      void el.offsetWidth; // reinicia o pulo se clicarem de novo
      el.classList.add('pulando');
      relogios.forEach(t => window.clearTimeout(t));
      relogios.length = 0;
      depois(720, () => el.classList.remove('pulando'));
      virar(e.dir);
      e.movendo = false;
      e.v = 0;
      el.classList.remove('deslizando');
      el.classList.add('acenando');
      depois(1900, () => el.classList.remove('acenando'));
      e.ate = performance.now() + 2600;
    };

    let antes = performance.now();
    let quadro = requestAnimationFrame(function laco(agora) {
      const dt = Math.min(0.05, (agora - antes) / 1000);
      antes = agora;
      const [min, max] = limites();
      e.x = Math.min(max, Math.max(min, e.x));
      if (e.movendo) {
        e.alvo = Math.min(max, Math.max(min, e.alvo));
        const falta = e.alvo - e.x;
        // Desliza: ganha velocidade devagar e freia de longe, sem parar seco.
        const vAlvo = VELOCIDADE * Math.min(1, Math.abs(falta) / 40);
        e.v += (vAlvo - e.v) * Math.min(1, dt * 2.4);
        const anda = Math.min(Math.abs(falta), Math.max(e.v, 1.5) * dt);
        e.x += Math.sign(falta) * anda;
        e.sulco += anda;
        if (e.sulco >= 6) { e.sulco = 0; sulco(e.x); }
        if (Math.abs(e.alvo - e.x) < 0.4) parar(agora);
      } else if (agora >= e.ate) {
        partir();
      }
      // A névoa segue a velocidade de verdade: cresce no arranque e assenta
      // devagar depois que ele para (`--vel`, de 0 a 1, em `boneco.css`).
      const alvoNevoa = e.movendo ? e.v / VELOCIDADE : 0;
      const nevoa = e.nevoa + (alvoNevoa - e.nevoa) * Math.min(1, dt * 2.2);
      if (Math.abs(nevoa - e.nevoa) > 0.002 || (nevoa === 0) !== (e.nevoa === 0)) {
        el.style.setProperty('--vel', nevoa.toFixed(3));
      }
      e.nevoa = nevoa;
      posicionar(e.x);
      quadro = requestAnimationFrame(laco);
    });

    return () => {
      cancelAnimationFrame(quadro);
      relogios.forEach(t => window.clearTimeout(t));
      el.classList.remove('deslizando', 'acenando', 'pulando');
      cutucar.current = () => {};
    };
  }, [parado]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={raiz} className="nt-bn dir" onClick={() => cutucar.current()}>
      <DesenhoBoneco />
    </div>
  );
}

/** De frente, o rosto um pouco puxado para o lado da classe `dir`/`esq` do pai. */
function DesenhoBoneco() {
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `url(#${id}-${n})`;
  return (
    <svg viewBox="0 0 72 76" width={LARG_BONECO} height={ALT_BONECO}>
      <defs>
        <radialGradient id={`${id}-bola`} cx="36%" cy="30%" r="78%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".58" stopColor="#F1F7FC" />
          <stop offset="1" stopColor="#C8D9E8" />
        </radialGradient>
        <radialGradient id={`${id}-pompom`} cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E2E7EE" />
        </radialGradient>
        {/* A névoa: branco no miolo sumindo na borda — macia sem precisar de blur. */}
        <radialGradient id={`${id}-nevoa`}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset=".45" stopColor="#FFFFFF" stopOpacity=".9" />
          <stop offset=".78" stopColor="#FFFFFF" stopOpacity=".35" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        {/* A bruma de baixo e o rastro: no tema claro puxam para o azul (`boneco.css`). */}
        <radialGradient id={`${id}-bruma`}>
          <stop className="nv-tinta" offset="0" stopColor="#FFFFFF" stopOpacity=".95" />
          <stop className="nv-tinta" offset=".55" stopColor="#FFFFFF" stopOpacity=".6" />
          <stop className="nv-tinta" offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-gorro`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#EC5A50" />
          <stop offset="1" stopColor="#B5272B" />
        </linearGradient>
        <linearGradient id={`${id}-cachecol`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#43A56E" />
          <stop offset="1" stopColor="#26784B" />
        </linearGradient>
        <linearGradient id={`${id}-cenoura`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#FFA24A" />
          <stop offset="1" stopColor="#EA6E19" />
        </linearGradient>
      </defs>

      <ellipse className="sombra" cx="36" cy="73.6" rx="21" ry="2.4" />

      <g className="bn-salto">
        <g className="bn-inclina">
          <g className="bn-corpo">
            {/* Braços de graveto com luvinha, atrás do corpo */}
            <g className="bn-braco bn-braco-e">
              <path d="M21 50 L8 40.6" stroke="#6B4A2F" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M12.2 43.6 L11 38.9" stroke="#6B4A2F" strokeWidth="1.35" strokeLinecap="round" fill="none" />
              <circle cx="6.2" cy="39.1" r="3.5" fill="#D6403A" />
              <circle cx="8.7" cy="36.3" r="1.55" fill="#D6403A" />
              <ellipse cx="8.9" cy="41.7" rx="2.5" ry="1.35" fill="#F6F0E7" transform="rotate(-38 8.9 41.7)" />
              <ellipse cx="5.2" cy="38.2" rx="1.2" ry=".7" fill="#FFFFFF" opacity=".35" />
            </g>
            <g className="bn-braco bn-braco-d">
              <path d="M51 50 L64 40.6" stroke="#6B4A2F" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M59.8 43.6 L61 38.9" stroke="#6B4A2F" strokeWidth="1.35" strokeLinecap="round" fill="none" />
              <circle cx="65.8" cy="39.1" r="3.5" fill="#D6403A" />
              <circle cx="63.3" cy="36.3" r="1.55" fill="#D6403A" />
              <ellipse cx="63.1" cy="41.7" rx="2.5" ry="1.35" fill="#F6F0E7" transform="rotate(38 63.1 41.7)" />
              <ellipse cx="64.8" cy="38.2" rx="1.2" ry=".7" fill="#FFFFFF" opacity=".35" />
            </g>

            {/* Corpo gordinho */}
            <ellipse className="bola" cx="36" cy="55.4" rx="19.6" ry="17.3" fill={u('bola')} />
            <ellipse cx="28.4" cy="47.2" rx="6.2" ry="3.7" fill="#FFFFFF" opacity=".75" transform="rotate(-28 28.4 47.2)" />
            <circle cx="24.6" cy="52.4" r=".8" fill="#FFFFFF" />
            <g className="bn-frente">
              {[51.4, 58.6].map(y => (
                <g key={y}>
                  <circle cx="36" cy={y} r="1.8" fill="#2A2730" />
                  <circle cx="35.4" cy={y - 0.6} r=".55" fill="#FFFFFF" opacity=".5" />
                </g>
              ))}
            </g>

            {/* Cabeça */}
            <g className="bn-cabeca">
              <circle className="bola" cx="36" cy="27.4" r="13.6" fill={u('bola')} />
              <ellipse cx="30.2" cy="21.2" rx="4.1" ry="2.4" fill="#FFFFFF" opacity=".78" transform="rotate(-30 30.2 21.2)" />
              <g className="bn-rosto">
                <ellipse cx="28" cy="31.8" rx="3.1" ry="1.85" fill="#FF94AA" opacity=".6" />
                <ellipse cx="44" cy="31.8" rx="3.1" ry="1.85" fill="#FF94AA" opacity=".6" />
                <circle cx="27.2" cy="31.2" r=".55" fill="#FFFFFF" opacity=".85" />
                <circle cx="43.2" cy="31.2" r=".55" fill="#FFFFFF" opacity=".85" />
                <g className="bn-olhos">
                  <ellipse cx="31.2" cy="26.2" rx="2.25" ry="2.75" fill="#2A2530" />
                  <ellipse cx="40.8" cy="26.2" rx="2.25" ry="2.75" fill="#2A2530" />
                  <circle cx="32" cy="25.1" r="1" fill="#FFFFFF" />
                  <circle cx="41.6" cy="25.1" r="1" fill="#FFFFFF" />
                  <circle cx="30.6" cy="27.5" r=".45" fill="#FFFFFF" opacity=".8" />
                  <circle cx="40.2" cy="27.5" r=".45" fill="#FFFFFF" opacity=".8" />
                </g>
                <path d="M33.6 34.6 Q36 36.8 38.4 34.6" stroke="#3A3440" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                {/* Cenourinha curta: troca de lado quando ele muda de direção */}
                <g className="bn-nariz">
                  <path d="M35 30 Q35.6 29 36.8 29.3 L42.2 30.9 Q43 31.3 42.2 31.7 L36.8 32.9 Q35.4 33 35 31.8Z" fill={u('cenoura')} />
                  <path d="M38.3 29.9 l-.3 2.4 M40.3 30.5 l-.2 1.4" stroke="#C25A14" strokeWidth=".5" strokeLinecap="round" fill="none" />
                </g>
              </g>
              {/* Gorro de lã com pompom e raminho de azevinho */}
              <g className="bn-gorro" transform="rotate(-8 36 18)">
                <path d="M23 20 Q22.4 6.6 36 6 Q49.6 6.6 49 20Z" fill={u('gorro')} />
                <path d="M28 9 Q26 13 26.3 18" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity=".28" fill="none" />
                <path d="M36 6.6V19 M30.4 8.2 Q29.6 13 30 19 M41.6 8.2 Q42.4 13 42 19" stroke="#9E1F24" strokeWidth=".6" opacity=".45" fill="none" />
                <rect x="21.4" y="17.2" width="29.2" height="5.8" rx="2.9" fill="#F6F0E7" />
                <path d="M24.2 17.6v5M27 17.3v5.4M29.8 17.3v5.4M32.6 17.3v5.4M35.4 17.3v5.4M38.2 17.3v5.4M41 17.3v5.4M43.8 17.3v5.4M46.6 17.3v5.4M49.2 17.7v4.8"
                  stroke="#DDD2C2" strokeWidth=".6" />
                <path d="M43.6 18.4 Q46.6 14.6 50.2 16.6 Q47.2 19.8 43.6 18.4Z" fill="#2F8F57" />
                <path d="M43.6 18.4 Q42.4 14 45.8 12.4 Q46.8 16.4 43.6 18.4Z" fill="#3DA367" />
                <circle cx="43.4" cy="18.6" r="1.35" fill="#D62828" />
                <circle cx="45" cy="19.7" r="1.2" fill="#E03A3A" />
                <circle cx="42" cy="19.8" r="1.1" fill="#C91F1F" />
                <circle cx="43" cy="18.1" r=".4" fill="#FFFFFF" opacity=".7" />
                <g className="bn-pompom">
                  <circle cx="36" cy="5.4" r="4.9" fill={u('pompom')} />
                  <path d="M33.2 3.6 q.8-.9 1.8-.6 M37.4 3 q1-.2 1.6.6 M34.4 7.4 q.9.6 1.9.3" stroke="#D5DCE5" strokeWidth=".6" strokeLinecap="round" fill="none" />
                </g>
              </g>
            </g>

            {/* Cachecol: a volta no pescoço e a ponta, sempre do lado de trás */}
            <path d="M23.6 38.6 Q36 44.6 48.4 38.6 Q49.8 41 48.6 43.2 Q36 49.4 23.4 43.2 Q22.2 41 23.6 38.6Z" fill={u('cachecol')} />
            <path d="M26.4 41.2 Q36 45.8 45.6 41.2" stroke="#FFFFFF" strokeWidth="1.2" strokeDasharray="2.4 2.6" opacity=".55" fill="none" />
            <g className="bn-ponta bn-ponta-e">
              <path d="M26 42.4 L31.6 43.4 L30.2 56 L24.2 54.8Z" fill={u('cachecol')} />
              <path d="M25.4 46.6 L31 47.6 M24.9 50.6 L30.6 51.6" stroke="#EC5A50" strokeWidth="1.4" />
              <path d="M24.4 55v2.4M26.1 55.3v2.5M27.8 55.6v2.5M29.5 55.9v2.2" stroke="#26784B" strokeWidth=".95" strokeLinecap="round" />
            </g>
            <g className="bn-ponta bn-ponta-d">
              <path d="M46 42.4 L40.4 43.4 L41.8 56 L47.8 54.8Z" fill={u('cachecol')} />
              <path d="M46.6 46.6 L41 47.6 M47.1 50.6 L41.4 51.6" stroke="#EC5A50" strokeWidth="1.4" />
              <path d="M47.6 55v2.4M45.9 55.3v2.5M44.2 55.6v2.5M42.5 55.9v2.2" stroke="#26784B" strokeWidth=".95" strokeLinecap="round" />
            </g>
          </g>
        </g>
      </g>

      {/* A névoa de neve em que ele desliza, no lugar dos pés. Parado, ela
          assenta numa almofada redonda que respira; deslizando, estica para
          trás, revolve e solta um rastro que se desfaz. */}
      <g className="nv-vira">
        <g className="nv-rastro">
          <ellipse cx="8" cy="71.6" rx="20" ry="4.4" fill={u('bruma')} opacity=".85" />
          {[[17, 70, 6.6, 0], [9, 70.8, 5.6, -0.45], [2, 71.4, 4.6, -0.9]].map(([x, y, r, d]) => (
            <circle key={x} className="nv-fio" cx={x} cy={y} r={r} fill={u('bruma')} style={{ '--d': `${d}s` } as CSSProperties} />
          ))}
        </g>
        <g className="nv-nuvem">
          <ellipse cx="36" cy="71.6" rx="26" ry="6" fill={u('bruma')} />
          {[[21, 69.4, 7.2, 0], [29, 67.4, 7.6, -0.9], [43, 67.4, 7.6, -1.8], [51, 69.4, 7.2, -2.7], [36, 68.2, 8.4, -1.3]].map(([x, y, r, d]) => (
            <circle key={x} className="nv-tufo" cx={x} cy={y} r={r} fill={u('nevoa')} style={{ '--d': `${d}s` } as CSSProperties} />
          ))}
          <ellipse cx="36" cy="70.8" rx="17" ry="4.6" fill={u('nevoa')} />
        </g>
        <g className="nv-brilho">
          <g transform="translate(24 66.6) scale(.7)"><path d="M0-2.6L.55-.55 2.6 0 .55.55 0 2.6-.55.55-2.6 0-.55-.55Z" /></g>
          <g transform="translate(49.4 65.4) scale(.55)"><path d="M0-2.6L.55-.55 2.6 0 .55.55 0 2.6-.55.55-2.6 0-.55-.55Z" /></g>
        </g>
      </g>
    </svg>
  );
}
