import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { ehTemaEscuro } from '@/lib/temas';
import { useModoLeve } from '@/lib/modoLeve';
import { cn } from '@/lib/utils';
import { bolaNaPose, COLO, poseDoArremesso, T_FIM, type Lado, type Pose } from './cesta/arremesso';
import { registrarBoneco } from './cesta/boneco';
import { ninguemOlhando } from '@/lib/atencao';
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
 *
 * Leve para PC fraco (10/11/2026, medido): animação de CSS DENTRO de um SVG
 * (num `<g>`, num `<path>`) não vai para a placa de vídeo — cada uma refaz o
 * estilo e o leiaute da página a cada quadro. Ele parado tinha quatro sem fim
 * (respirar, piscar, pompom, brilho da névoa) e as faíscas da neve, e custava
 * mais que todo o resto do Natal do Dashboard. Agora, parado:
 *   - respira no `.bn-fole`, uma caixa HTML em volta do desenho (a placa faz);
 *   - pisca quando o relógio sorteia (às vezes duas vezes seguidas), e não num
 *     compasso fixo; entre uma piscada e outra, nada roda;
 *   - o pompom balança só em movimento, e assenta com um balanço que perde força
 *     quando ele para; o brilho da névoa pisca uma vez ao assentar;
 *   - as faíscas da neve são caixas HTML, não `<path>`;
 *   - a sombra da neve é uma cópia do contorno, não `drop-shadow` (o sulco do
 *     deslize, animando dentro, refazia a sombra do card inteiro);
 *   - não há laço por quadro: o deslize é uma animação só (ver «O deslize»).
 * E cada pedaço que mexe é uma caixa própria (ver «O desenho»): deslizando, acenando, nada anima dentro de SVG.
 *
 * O segredo da cesta (Cleber, 05/11/2026 — só para quem perceber): durante a
 * brincadeira da bola da saudação, levar a bola até ele faz o boneco notar
 * («!»), parar, virar para ela e esticar os bracinhos pedindo. Entregando, ele
 * abraça a bola, olha para a cesta, agacha, pula e arremessa — e comemora ou
 * fica tristinho. A pose do arremesso é `cesta/arremesso.ts` (a bola usa a
 * mesma conta para ficar nas mãos dele); a conversa com a bola é `cesta/boneco.ts`.
 */

/** Quanto da camada fica acima da borda do card (a neve empilhada). */
const ACIMA = 22;
/** Altura total da camada: acima + quina arredondada + pingos. */
const ALTURA = 46;
/** O `rounded-xl` do card. */
const RAIO = 12;

/** O boneco na tela, em px (o desenho é 72×76, escalado em `.bn-palco`). */
const LARG_BONECO = 54;
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
  // (09/11/2026, mais leve) Metade das faíscas: uma a cada 110–250 px (eram 55–145).
  for (let x = 40 + sorte() * 40; x < L - 30; x += 110 + sorte() * 140) {
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
  const rastro = useRef<HTMLDivElement>(null);
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
            {/* A sombra: o mesmo contorno, um tico abaixo (no lugar do `drop-shadow`). */}
            <path className="massa-sombra" d={geo.massa} transform="translate(0 1.3)" />
            <path className="massa" d={geo.massa} fill={`url(#${id}-neve)`} />
          </svg>
          {/* Os sulcos do deslize: caixas HTML (`.sulco`), cada uma acende na hora em que ele passa. */}
          <div ref={rastro} className="nt-sulcos" />
          {/* As faíscas: caixas HTML (a placa de vídeo anima), cada uma com a estrelinha parada dentro. */}
          <div className="nt-neve-faiscas">
            {geo.faiscas.map(({ x, y, d, s }) => (
              <span key={x} className="faisca"
                style={{ left: f(x - 2.6 * s) + 'px', top: f(y - 2.6 * s) + 'px', width: f(5.2 * s) + 'px', height: f(5.2 * s) + 'px', '--d': `${d}s` } as CSSProperties}>
                <svg viewBox="-2.6 -2.6 5.2 5.2"><path d={ESTRELINHA} /></svg>
              </span>
            ))}
          </div>
          {largura >= LARGURA_MINIMA && <BonecoDeNeve geo={geo} parado={leve} rastro={rastro} />}
        </>
      )}
    </div>
  );
}


// ── O boneco ──────────────────────────────────────────────────────────────────

const ESTRELINHA = 'M0-2.6L.55-.55 2.6 0 .55.55 0 2.6-.55.55-2.6 0-.55-.55Z';
const acaso = (min: number, max: number) => min + Math.random() * (max - min);
/** Quanto ele leva para pegar velocidade, e para frear (s). */
const RAMPA_S = 1.1;
/** Um sulco na neve a cada tantos px de deslize. */
const SULCO_A_CADA = 8;

/*
 * O deslize (10/11/2026, PCs fracos): uma animação só, de `transform`, no
 * elemento do boneco — a placa de vídeo toca sozinha, sem JavaScript por
 * quadro. Antes um laço escrevia a posição 30 vezes por segundo, e isso
 * obrigava a página inteira a se redesenhar junto (com todos os enfeites).
 *
 * O caminho é amostrado em pontos do perfil de velocidade (acelera em
 * `RAMPA_S`, cruza a `VELOCIDADE`, freia em `RAMPA_S`), seguindo a altura da
 * neve em cada ponto. Os sulcos nascem todos no início, cada um com o atraso
 * da hora em que ele passa por ali.
 */
interface Deslize { anim: Animation; xEm: (ms: number) => number; sulcos: { el: HTMLElement; ms: number }[] }

function perfilDoDeslize(distancia: number) {
  const V = VELOCIDADE;
  const R = Math.min(RAMPA_S, distancia / V);
  const cruzeiro = (distancia - V * R) / V;
  const T = 2 * R + cruzeiro;
  /** Quanto andou (px) em `t` segundos. */
  const andou = (t: number) => {
    const c = Math.min(T, Math.max(0, t));
    if (c < R) return (V * c * c) / (2 * R);
    if (c < R + cruzeiro) return (V * R) / 2 + V * (c - R);
    return distancia - (V * (T - c) ** 2) / (2 * R);
  };
  /** Em que segundo ele passa por `d` px. */
  const quando = (d: number) => {
    if (d < (V * R) / 2) return Math.sqrt((2 * R * d) / V);
    if (d < distancia - (V * R) / 2) return R + (d - (V * R) / 2) / V;
    return T - Math.sqrt((2 * R * Math.max(0, distancia - d)) / V);
  };
  return { T, andou, quando };
}

function BonecoDeNeve({ geo, parado, rastro }: {
  geo: Geometria;
  parado: boolean;
  rastro: MutableRefObject<HTMLDivElement | null>;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const geoAtual = useRef(geo);
  geoAtual.current = geo;
  // O clique precisa falar com o boneco que está rodando.
  const cutucar = useRef<() => void>(() => {});
  // O card mudou de largura: ele volta para dentro da neve.
  const reposicionar = useRef<() => void>(() => {});

  const limites = () => [MARGEM, geoAtual.current.largura - MARGEM] as const;
  const transformEm = (x: number) => `translate3d(${f(x - LARG_BONECO / 2)}px, ${f(geoAtual.current.topo(x) - BASE)}px, 0)`;
  const posicionar = (x: number) => {
    const el = raiz.current;
    if (el) el.style.transform = transformEm(x);
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
  }, [parado, geo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reposicionar.current(); }, [geo]);

  useEffect(() => {
    if (parado) return;
    const el = raiz.current;
    if (!el) return;
    const relogios: number[] = [];
    const depois = (ms: number, fn: () => void) => { relogios.push(window.setTimeout(fn, ms)); };

    const [min0, max0] = limites();
    const e = { x: acaso(min0, max0), dir: Math.random() < 0.5 ? 1 : -1 };
    virar(e.dir);
    posicionar(e.x);

    // Uma classe de efeito único que pode voltar antes de acabar: tira, e põe de novo no próximo quadro.
    const repetir = (classe: string, ms: number) => {
      el.classList.remove(classe);
      requestAnimationFrame(() => {
        el.classList.add(classe);
        depois(ms, () => el.classList.remove(classe));
      });
    };

    // A vez do próximo passeio.
    let vez = 0;
    const agendar = (ms: number) => { window.clearTimeout(vez); vez = window.setTimeout(partir, ms); };

    // ── O deslize ──
    let deslize: Deslize | null = null;
    /** Interrompe o deslize onde ele estiver (clique, a bola chegando). */
    const pararDeslize = () => {
      const d = deslize;
      if (!d) return;
      deslize = null;
      const ms = Number(d.anim.currentTime ?? 0);
      e.x = d.xEm(ms);
      posicionar(e.x);
      d.anim.cancel();
      // Os sulcos por onde ele ainda não passou somem.
      for (const s of d.sulcos) if (s.ms > ms) s.el.remove();
      el.classList.remove('deslizando');
    };

    const chegou = () => {
      el.classList.remove('deslizando');
      // O pompom assenta balançando, e a névoa solta um brilho ao baixar.
      repetir('assentou', 3400);
      const r = Math.random();
      // (10/11/2026) Fica mais tempo parado olhando a tela.
      let pausa = acaso(4500, 11000);
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
      agendar(pausa);
    };

    const deslizar = (alvo: number) => {
      if (cesta.ativo || el.classList.contains('esperando')) return;
      const x0 = e.x, sinal = Math.sign(alvo - x0), distancia = Math.abs(alvo - x0);
      const { T, andou, quando } = perfilDoDeslize(distancia);
      const quadros = Math.max(8, Math.ceil(T * 12));
      const frames = Array.from({ length: quadros + 1 }, (_, i) => ({ transform: transformEm(x0 + sinal * andou((T * i) / quadros)) }));
      const anim = el.animate(frames, { duration: T * 1000, easing: 'linear', fill: 'forwards' });
      // Os sulcos, cada um acendendo quando ele passa.
      const sulcos: Deslize['sulcos'] = [];
      const g = rastro.current;
      if (g) {
        while (g.childElementCount > MAX_SULCOS) g.firstElementChild?.remove();
        for (let d = SULCO_A_CADA; d < distancia; d += SULCO_A_CADA) {
          const x = x0 + sinal * d, ms = quando(d) * 1000;
          const s = document.createElement('span');
          s.className = 'sulco';
          s.style.left = `${f(x - 4.2)}px`;
          s.style.top = `${f(geoAtual.current.topo(x) + 2.2 - 0.75)}px`;
          s.style.animationDelay = `${Math.round(ms)}ms`;
          s.addEventListener('animationend', () => s.remove());
          g.appendChild(s);
          sulcos.push({ el: s, ms });
        }
      }
      deslize = { anim, xEm: ms => x0 + sinal * andou(ms / 1000), sulcos };
      el.classList.remove('assentou');
      el.classList.add('deslizando');
      anim.onfinish = () => {
        if (deslize?.anim !== anim) return;
        deslize = null;
        e.x = alvo;
        posicionar(alvo);
        anim.cancel();
        chegou();
      };
    };

    const partir = () => {
      if (cesta.ativo || el.classList.contains('esperando')) return;
      // Ninguém olhando: não sai, só confere de novo depois.
      if (ninguemOlhando()) { agendar(4000); return; }
      const [min, max] = limites();
      e.x = Math.min(max, Math.max(min, e.x));
      if (max - min < 40) { agendar(5000); return; }
      // (10/11/2026) Passeios curtos, de 90 a 320 px: antes sorteava um ponto
      // qualquer do card e cruzava a tela inteira, deslizando quase o tempo todo.
      let lado = Math.random() < 0.5 ? -1 : 1;
      const passo = acaso(90, 320);
      if (e.x + lado * passo > max || e.x + lado * passo < min) lado = -lado;
      const alvo = Math.min(max, Math.max(min, e.x + lado * passo));
      if (Math.abs(alvo - e.x) < 40) { agendar(acaso(1500, 3000)); return; }
      e.dir = alvo > e.x ? 1 : -1;
      virar(e.dir);
      // Primeiro olha para onde vai, depois sai deslizando.
      depois(420, () => deslizar(alvo));
    };

    reposicionar.current = () => {
      if (deslize || cesta.ativo) return;
      const [min, max] = limites();
      e.x = Math.min(max, Math.max(min, e.x));
      posicionar(e.x);
    };

    // A piscada: na hora que o sorteio quiser, às vezes duas seguidas — gente
    // não pisca no compasso. Entre uma e outra, nenhuma animação roda.
    let piscada = 0;
    const piscar = () => {
      if (!ninguemOlhando()) {
        repetir('piscando', 200);
        if (Math.random() < 0.25) window.setTimeout(() => repetir('piscando', 200), 330);
      }
      piscada = window.setTimeout(piscar, acaso(2600, 7000));
    };
    piscada = window.setTimeout(piscar, acaso(1200, 4000));

    // ── A cesta: esperar a bola, arremessar, reagir (só aqui roda um laço por quadro: é jogo) ──
    const cesta = { ativo: false, inicio: 0, lado: 1 as Lado, resultado: null as boolean | null, reagiu: false };
    const VARIAVEIS = ['--py', '--psx', '--psy', '--pr', '--pbe', '--pbd', '--pbs'];
    const aplicarPose = (p: Pose) => {
      const s = el.style;
      s.setProperty('--py', f(p.y));
      s.setProperty('--psx', p.sx.toFixed(3));
      s.setProperty('--psy', p.sy.toFixed(3));
      s.setProperty('--pr', f(p.inclina));
      s.setProperty('--pbe', f(p.bracoE));
      s.setProperty('--pbd', f(p.bracoD));
      s.setProperty('--pbs', p.estica.toFixed(3));
    };
    const limparPose = () => VARIAVEIS.forEach(v => el.style.removeProperty(v));
    let quadro = 0;
    const terminarCesta = () => {
      if (!cesta.ativo) return;
      cesta.ativo = false;
      cesta.reagiu = false;
      cancelAnimationFrame(quadro);
      el.classList.remove('na-cesta', 'focado', 'comemorando', 'triste');
      limparPose();
      agendar(acaso(900, 1800));
    };
    /** Onde o boneco está na tela, e quantos px valem uma unidade do desenho. */
    const naTela = () => { const r = el.getBoundingClientRect(); return { r, esc: r.width / 72 }; };

    /** Um quadro da cesta. */
    const animarCesta = (agora: number) => {
      if (!cesta.ativo) return;
      const t = agora - cesta.inicio;
      if (t < T_FIM) {
        const p = poseDoArremesso(t, cesta.lado);
        aplicarPose(p);
        el.classList.toggle('focado', p.fase === 'mirando' || p.fase === 'agachando' || p.fase === 'subindo');
      } else {
        if (el.classList.contains('na-cesta')) { el.classList.remove('na-cesta', 'focado'); limparPose(); }
        if (cesta.resultado !== null && !cesta.reagiu) {
          cesta.reagiu = true;
          const reacao = cesta.resultado ? 'comemorando' : 'triste';
          el.classList.add(reacao);
          const inicio = cesta.inicio;
          depois(cesta.resultado ? 1600 : 1450, () => { if (cesta.inicio === inicio) terminarCesta(); });
        } else if (cesta.resultado === null && t > T_FIM + 4000) {
          terminarCesta();
          return;
        }
        // Reagindo: o resto é CSS, o laço pode parar.
        if (cesta.reagiu) return;
      }
      quadro = requestAnimationFrame(animarCesta);
    };

    const desregistrar = registrarBoneco({
      colo() {
        const { r, esc } = naTela();
        return r.width ? { x: r.left + COLO.x * esc, y: r.top + COLO.y * esc } : null;
      },
      esperar(sim, bolaX) {
        if (cesta.ativo) {
          // Ainda com a bola ou no meio do arremesso: não dá. Comemorando ou triste: larga e pede de novo.
          if (performance.now() - cesta.inicio < T_FIM || !sim) return;
          terminarCesta();
        }
        if (!sim) {
          el.classList.remove('esperando');
          agendar(900);
          return;
        }
        if (!el.classList.contains('esperando')) {
          pararDeslize();
          window.clearTimeout(vez);
          el.classList.add('esperando');
          el.classList.remove('notou');
          void el.getBoundingClientRect(); // recomeça o «!»
          el.classList.add('notou');
          depois(1300, () => el.classList.remove('notou'));
          el.classList.remove('deslizando', 'acenando', 'pulando');
        }
        if (bolaX != null) {
          const { r } = naTela();
          const lado = bolaX >= r.left + r.width / 2 ? 1 : -1;
          if (lado !== e.dir) { e.dir = lado; virar(lado); }
        }
      },
      receber(lado) {
        pararDeslize();
        window.clearTimeout(vez);
        cesta.ativo = true;
        cesta.inicio = performance.now();
        cesta.lado = lado;
        cesta.resultado = null;
        cesta.reagiu = false;
        el.classList.remove('esperando', 'notou', 'acenando', 'deslizando', 'pulando', 'comemorando', 'triste');
        el.classList.add('na-cesta');
        e.dir = lado;
        virar(lado);
        aplicarPose(poseDoArremesso(0, lado));
        cancelAnimationFrame(quadro);
        quadro = requestAnimationFrame(animarCesta);
        return cesta.inicio;
      },
      bolaEm(t) {
        const p = bolaNaPose(poseDoArremesso(t, cesta.lado));
        const { r, esc } = naTela();
        return { x: r.left + p.x * esc, y: r.top + p.y * esc };
      },
      resultado(acertou) { if (cesta.ativo) cesta.resultado = acertou; },
      cancelar() { el.classList.remove('esperando', 'notou'); terminarCesta(); },
    });

    cutucar.current = () => {
      // Com a bola (ou esperando por ela), o clique não atrapalha.
      if (cesta.ativo || el.classList.contains('esperando')) return;
      pararDeslize();
      el.classList.remove('pulando');
      void el.offsetWidth; // reinicia o pulo se clicarem de novo
      el.classList.add('pulando');
      relogios.forEach(t => window.clearTimeout(t));
      relogios.length = 0;
      depois(720, () => el.classList.remove('pulando'));
      virar(e.dir);
      el.classList.add('acenando');
      depois(1900, () => el.classList.remove('acenando'));
      agendar(2600);
    };

    agendar(900);

    return () => {
      const d = deslize;
      deslize = null;
      d?.anim.cancel();
      cancelAnimationFrame(quadro);
      window.clearTimeout(vez);
      window.clearTimeout(piscada);
      relogios.forEach(t => window.clearTimeout(t));
      desregistrar();
      limparPose();
      el.classList.remove('deslizando', 'acenando', 'pulando', 'esperando', 'notou', 'na-cesta', 'focado', 'comemorando', 'triste', 'piscando', 'assentou');
      cutucar.current = () => {};
      reposicionar.current = () => {};
    };
  }, [parado]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={raiz} className="nt-bn dir" onClick={() => cutucar.current()}>
      {/* A chegada, a respiração (o fole) e o palco do desenho: três caixas, uma animação em cada. */}
      <div className="bn-chega"><div className="bn-fole"><DesenhoBoneco /></div></div>
      {/* Notou a bola chegando. */}
      <span className="nt-bn-nota" aria-hidden="true">!</span>
    </div>
  );
}

/** Um pedaço do boneco: um SVG do tamanho do desenho inteiro (72 × 76), com só aquele pedaço. */
function Camada({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return <svg viewBox="0 0 72 76" width={72} height={76} className={cn('bn-l', className)} style={style}>{children}</svg>;
}

/*
 * O desenho (10/11/2026, PCs fracos): cada pedaço que mexe é uma caixa HTML
 * própria — um SVG do tamanho do desenho com só aquele pedaço —, empilhadas
 * no `.bn-palco` (72 × 76, escalado para o tamanho do boneco). Assim braço,
 * pompom, ponta do cachecol e névoa balançam como caixas, e a placa de vídeo
 * anima sozinha. Era um SVG só, com tudo animando DENTRO dele — o que obriga
 * a página inteira a se redesenhar a cada quadro. Os pontos de giro do CSS
 * (`transform-origin`) continuam em unidades do desenho.
 *
 * De frente, o rosto um pouco puxado para o lado da classe `dir`/`esq` do pai.
 */
function DesenhoBoneco() {
  const id = useId().replace(/:/g, '');
  const u = (n: string) => `url(#${id}-${n})`;
  return (
    <div className="bn-palco">
      {/* Os degradês: um SVG só, sem tamanho, que todos os pedaços usam. */}
      <svg width="0" height="0" className="bn-defs" aria-hidden="true">
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
      </svg>

      <Camada><ellipse className="sombra" cx="36" cy="73.6" rx="21" ry="2.4" /></Camada>

      <div className="bn-l bn-salto">
        <div className="bn-l bn-inclina">
          <div className="bn-l bn-corpo">
            {/* Braços de graveto com luvinha, atrás do corpo */}
            <Camada className="bn-braco bn-braco-e">
              <path d="M21 50 L8 40.6" stroke="#6B4A2F" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M12.2 43.6 L11 38.9" stroke="#6B4A2F" strokeWidth="1.35" strokeLinecap="round" fill="none" />
              <circle cx="6.2" cy="39.1" r="3.5" fill="#D6403A" />
              <circle cx="8.7" cy="36.3" r="1.55" fill="#D6403A" />
              <ellipse cx="8.9" cy="41.7" rx="2.5" ry="1.35" fill="#F6F0E7" transform="rotate(-38 8.9 41.7)" />
              <ellipse cx="5.2" cy="38.2" rx="1.2" ry=".7" fill="#FFFFFF" opacity=".35" />
            </Camada>
            <Camada className="bn-braco bn-braco-d">
              <path d="M51 50 L64 40.6" stroke="#6B4A2F" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M59.8 43.6 L61 38.9" stroke="#6B4A2F" strokeWidth="1.35" strokeLinecap="round" fill="none" />
              <circle cx="65.8" cy="39.1" r="3.5" fill="#D6403A" />
              <circle cx="63.3" cy="36.3" r="1.55" fill="#D6403A" />
              <ellipse cx="63.1" cy="41.7" rx="2.5" ry="1.35" fill="#F6F0E7" transform="rotate(38 63.1 41.7)" />
              <ellipse cx="64.8" cy="38.2" rx="1.2" ry=".7" fill="#FFFFFF" opacity=".35" />
            </Camada>

            {/* Corpo gordinho */}
            <Camada>
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
            </Camada>

            {/* Cabeça (com o gorro), e o pompom numa caixa só dele */}
            <div className="bn-l bn-cabeca">
              <Camada>
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
                  {/* Olhinhos de alegria (^ ^), quando ele acerta a cesta. */}
                  <path className="bn-olhos-feliz" d="M29 27 Q31.2 23.4 33.4 27 M38.6 27 Q40.8 23.4 43 27"
                    stroke="#2A2530" strokeWidth="1.7" strokeLinecap="round" fill="none" />
                  <path className="bn-boca" d="M33.6 34.6 Q36 36.8 38.4 34.6" stroke="#3A3440" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                  {/* Boca aberta (esperando a bola, comemorando) e boquinha triste (errou). */}
                  <path className="bn-boca-aberta" d="M33.7 34.3 Q36 34.9 38.3 34.3 Q38 37.6 36 37.7 Q34 37.6 33.7 34.3Z" fill="#7A2E3A" />
                  <path className="bn-boca-triste" d="M33.9 36.2 Q36 34.4 38.1 36.2" stroke="#3A3440" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                  {/* Cenourinha curta: troca de lado quando ele muda de direção */}
                  <g className="bn-nariz">
                    <path d="M35 30 Q35.6 29 36.8 29.3 L42.2 30.9 Q43 31.3 42.2 31.7 L36.8 32.9 Q35.4 33 35 31.8Z" fill={u('cenoura')} />
                    <path d="M38.3 29.9 l-.3 2.4 M40.3 30.5 l-.2 1.4" stroke="#C25A14" strokeWidth=".5" strokeLinecap="round" fill="none" />
                  </g>
                </g>
                {/* Gorro de lã com raminho de azevinho */}
                <g transform="rotate(-8 36 18)">
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
                </g>
              </Camada>
              {/* O pompom: o gorro é girado −8°, então a caixa dele também. */}
              <div className="bn-l bn-gorro-giro">
                <Camada className="bn-pompom">
                  <circle cx="36" cy="5.4" r="4.9" fill={u('pompom')} />
                  <path d="M33.2 3.6 q.8-.9 1.8-.6 M37.4 3 q1-.2 1.6.6 M34.4 7.4 q.9.6 1.9.3" stroke="#D5DCE5" strokeWidth=".6" strokeLinecap="round" fill="none" />
                </Camada>
              </div>
            </div>

            {/* Cachecol: a volta no pescoço e as pontas, sempre do lado de trás */}
            <Camada>
              <path d="M23.6 38.6 Q36 44.6 48.4 38.6 Q49.8 41 48.6 43.2 Q36 49.4 23.4 43.2 Q22.2 41 23.6 38.6Z" fill={u('cachecol')} />
              <path d="M26.4 41.2 Q36 45.8 45.6 41.2" stroke="#FFFFFF" strokeWidth="1.2" strokeDasharray="2.4 2.6" opacity=".55" fill="none" />
            </Camada>
            <Camada className="bn-ponta bn-ponta-e">
              <path d="M26 42.4 L31.6 43.4 L30.2 56 L24.2 54.8Z" fill={u('cachecol')} />
              <path d="M25.4 46.6 L31 47.6 M24.9 50.6 L30.6 51.6" stroke="#EC5A50" strokeWidth="1.4" />
              <path d="M24.4 55v2.4M26.1 55.3v2.5M27.8 55.6v2.5M29.5 55.9v2.2" stroke="#26784B" strokeWidth=".95" strokeLinecap="round" />
            </Camada>
            <Camada className="bn-ponta bn-ponta-d">
              <path d="M46 42.4 L40.4 43.4 L41.8 56 L47.8 54.8Z" fill={u('cachecol')} />
              <path d="M46.6 46.6 L41 47.6 M47.1 50.6 L41.4 51.6" stroke="#EC5A50" strokeWidth="1.4" />
              <path d="M47.6 55v2.4M45.9 55.3v2.5M44.2 55.6v2.5M42.5 55.9v2.2" stroke="#26784B" strokeWidth=".95" strokeLinecap="round" />
            </Camada>
          </div>
        </div>
      </div>

      {/* A névoa de neve em que ele desliza, no lugar dos pés. Parado, ela
          assenta numa almofada redonda; deslizando, estica para trás, revolve e
          solta um rastro que se desfaz. Cada parte é uma caixa (a placa anima). */}
      <div className="bn-l nv-vira">
        <div className="bn-l nv-rastro">
          <Camada><ellipse cx="8" cy="71.6" rx="20" ry="4.4" fill={u('bruma')} opacity=".85" /></Camada>
          {[[17, 70, 6.6, 0], [9, 70.8, 5.6, -0.45], [2, 71.4, 4.6, -0.9]].map(([x, y, r, d]) => (
            <Camada key={x} className="nv-fio" style={{ transformOrigin: `${x}px ${y}px`, '--d': `${d}s` } as CSSProperties}>
              <circle cx={x} cy={y} r={r} fill={u('bruma')} />
            </Camada>
          ))}
        </div>
        <div className="bn-l nv-nuvem">
          <Camada className="nv-revolve">
            <ellipse cx="36" cy="71.6" rx="26" ry="6" fill={u('bruma')} />
            {[[21, 69.4, 7.2], [29, 67.4, 7.6], [43, 67.4, 7.6], [51, 69.4, 7.2], [36, 68.2, 8.4]].map(([x, y, r]) => (
              <circle key={x} cx={x} cy={y} r={r} fill={u('nevoa')} />
            ))}
            <ellipse cx="36" cy="70.8" rx="17" ry="4.6" fill={u('nevoa')} />
          </Camada>
        </div>
        <div className="bn-l nv-brilho">
          <Camada className="nv-faisca" style={{ transformOrigin: '24px 66.6px' }}>
            <g transform="translate(24 66.6) scale(.7)"><path d={ESTRELINHA} /></g>
          </Camada>
          <Camada className="nv-faisca outra" style={{ transformOrigin: '49.4px 65.4px' }}>
            <g transform="translate(49.4 65.4) scale(.55)"><path d={ESTRELINHA} /></g>
          </Camada>
        </div>
      </div>
    </div>
  );
}
