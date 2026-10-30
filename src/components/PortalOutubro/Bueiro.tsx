/**
 * Bueiro.tsx — os 5 minutos antes do mural (pedidos de 27 a 29/10/2026): um
 * bueiro no alto da tela, no meio, com a Coisa lá dentro (`fases.ts`).
 *
 *   - é um pedaço quebrado da barra de cima, em pixel art (29/10: «todos os
 *     desenhos vão ser pixel art»): o desenho é de `pixelDoBueiro.ts`, pintado
 *     num canvas com as cores da barra no tema que estiver;
 *   - só os olhos dela no escuro, fundos, com a névoa preta passando na frente
 *     (um canvas pontilhado que anda a ~10 quadros por segundo). Seguem o
 *     mouse e piscam; na abertura, acendem;
 *   - quando ele aparece, sai de dentro de uma névoa, também em pixel;
 *   - a boca brilha em brasa por dentro, mais a cada minuto (`luz`), e no
 *     final ele treme de vez em quando (`tremor`);
 *   - balões vermelhos sobem de baixo da tela, em lugares e horas ao acaso,
 *     com o fio balançando junto. Não estouram: nada aqui pega clique;
 *   - faltando 2 min 45 s, a água escorre devagar pela barra até a boca; o
 *     barquinho vem boiando nela, por cima da guia, cai na boca, e a mão dela
 *     sai com ele, oferecendo, os olhos vermelhos — inteira para fora
 *     exatamente nos 2 minutos, e fica até a abertura (o «Participar» é do
 *     `Avisos.tsx`). Quem chega no meio vê do ponto em que está. Na prévia do
 *     super_admin isso vem a cada minuto, e a mão volta.
 *
 * Fica abaixo dos diálogos do app (z 45). Só `transform` e `opacity` se
 * mexem pelo CSS; os canvas repintam pouco. Anima também no modo leve
 * (`data-portal-anima`, `index.css`): ali os olhos não seguem o mouse, o
 * balão sobe reto e as névoas têm menos nuvens e menos quadros.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AGUA_MS, BARCO_ANTES_DA_ABERTURA_MS, MAO_SAI_MS, type EstadoDoPortal } from './fases';
import { agoraDoPortal } from './relogio';
import { BALAO, BARCO, PALETA_DO_BALAO, PALETA_DO_BARCO } from './coisa/arte';
import { pintarGrade } from './coisa/derry';
import {
  ALTURA_DA_MAO, ALTURA_DO_BUEIRO, BOCA, LARGURA_DA_MAO, LARGURA_DO_BUEIRO, PALETA_DA_MAO, PALETA_DO_BUEIRO, PX,
  montarBueiro, montarMao, montarOlhos, paletaDosOlhos,
} from './pixelDoBueiro';
import { prepararSonsDaCoisa } from './coisa/trilha';

export function Pixel({ linhas, paleta, tam }: { linhas: readonly string[]; paleta: Readonly<Record<string, string>>; tam: number }) {
  const l = linhas[0].length, a = linhas.length;
  return (
    <svg viewBox={`0 0 ${l} ${a}`} width={l * tam} height={a * tam} shapeRendering="crispEdges" aria-hidden>
      {linhas.flatMap((linha, y) => [...linha].map((ch, x) => paleta[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={paleta[ch]} /> : null))}
    </svg>
  );
}

/** Uma grade de letras num canvas, em pixel grande; repinta só quando a grade ou a paleta mudam. */
function Grade({ linhas, paleta, className, style }: {
  linhas: readonly string[]; paleta: Readonly<Record<string, string>>; className?: string; style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const l = linhas[0].length, a = linhas.length;
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.clearRect(0, 0, l, a);
    pintarGrade(c, linhas, paleta, 0, 0);
  }, [linhas, paleta, l, a]);
  return <canvas ref={ref} width={l} height={a} className={`portal-px${className ? ` ${className}` : ''}`} style={{ width: l * PX, height: a * PX, ...style }} aria-hidden />;
}

// ── As cores da barra, do tema ──────────────────────────────────────────────

/** Uma variável de cor do tema, em rgb (o canvas lê `oklch`; o pixel converte). */
function corDoTema(nome: string, alfa = 1, reserva = '#808080'): string {
  try {
    const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const c = cv.getContext('2d', { willReadFrequently: true });
    if (!c || !valor) return reserva;
    c.fillStyle = reserva;
    c.fillStyle = valor;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${alfa})`;
  } catch {
    return reserva;
  }
}

/** A paleta do bueiro com a barra na cor do tema; relê quando o tema muda. */
function usePaletaDoBueiro(): Readonly<Record<string, string>> {
  const ler = () => ({
    ...PALETA_DO_BUEIRO,
    B: corDoTema('--card', 1, '#f8fafb'),
    R: corDoTema('--border', 1, '#d6dce0'),
    r: corDoTema('--foreground', 0.3, 'rgba(20, 30, 40, 0.3)'),
  });
  const [paleta, setPaleta] = useState(ler);
  useEffect(() => {
    const vigia = new MutationObserver(() => setPaleta(ler()));
    vigia.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-tenant'] });
    return () => vigia.disconnect();
  }, []);
  return paleta;
}

// ── As névoas, pontilhadas ──────────────────────────────────────────────────

/** O pontilhado ordenado (Bayer 4 × 4) da névoa. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

interface Nuvem { x: number; y: number; rx: number; ry: number; amp: number; vel: number; fase: number }

/** A névoa preta na frente dos olhos (em pixels da boca; no modo leve, as duas primeiras). */
const BREU: readonly Nuvem[] = [
  { x: 14, y: 4, rx: 13, ry: 4, amp: 9, vel: 0.5, fase: 0 },
  { x: 38, y: 5, rx: 15, ry: 4.5, amp: 10, vel: 0.38, fase: 2.1 },
  { x: 26, y: 7, rx: 10, ry: 3, amp: 12, vel: 0.62, fase: 4 },
  { x: 46, y: 2, rx: 9, ry: 3, amp: 7, vel: 0.45, fase: 1.2 },
];

/**
 * Um canvas de névoa pontilhada: a cada quadro (de `passoMs` em `passoMs`),
 * `densidade(x, y, s)` diz o quanto de névoa tem em cada pixel e o
 * pontilhado decide quais acendem. `cor(d)` dá o rgba de cada um.
 */
function Nevoa({ l, a, passoMs, densidade, cor, duraS, className, style }: {
  l: number; a: number; passoMs: number;
  densidade: (x: number, y: number, s: number) => number;
  cor: (d: number) => readonly [number, number, number, number];
  /** Acaba sozinha depois disso (a névoa da chegada). */
  duraS?: number;
  className?: string; style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dens = useRef(densidade);
  dens.current = densidade;
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    const img = c.createImageData(l, a);
    const d = img.data;
    let id = 0, ultimo = -Infinity;
    const t0 = performance.now();
    const quadro = (agora: number) => {
      const s = (agora - t0) / 1000;
      if (duraS !== undefined && s > duraS) { c.clearRect(0, 0, l, a); return; }
      id = requestAnimationFrame(quadro);
      if (agora - ultimo < passoMs) return;
      ultimo = agora;
      d.fill(0);
      for (let y = 0; y < a; y++) {
        for (let x = 0; x < l; x++) {
          const k = Math.min(1, dens.current(x, y, s));
          if (k <= 0 || k * 16 <= BAYER[(y % 4) * 4 + (x % 4)] + 0.5) continue;
          const [r, g, b, al] = cor(k);
          const o = (y * l + x) * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = al;
        }
      }
      c.putImageData(img, 0, 0);
    };
    id = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(id);
    // `cor` e `duraS` são fixos por névoa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l, a, passoMs]);
  return <canvas ref={ref} width={l} height={a} className={`portal-px${className ? ` ${className}` : ''}`} style={{ width: l * PX, height: a * PX, ...style }} aria-hidden />;
}

function nuvem(n: Nuvem, x: number, y: number, s: number): number {
  const cx = n.x + Math.sin(s * n.vel + n.fase) * n.amp;
  const v = 1 - ((x + 0.5 - cx) / n.rx) ** 2 - ((y + 0.5 - n.y) / n.ry) ** 2;
  return v <= 0 ? 0 : v * (0.75 + 0.25 * Math.sin(s * 0.9 + n.fase * 1.7));
}

const corDoBreu = () => [0, 0, 0, 225] as const;

/** A névoa da chegada (em pixels do bueiro, com 10 de folga dos lados): nuvens que incham e se desfazem. */
const FOLGA = 10;
const CHEGADA = [
  { x: 44, y: 12, r: 26, atraso: 0 },
  { x: 16, y: 14, r: 16, atraso: 0.15 },
  { x: 74, y: 14, r: 16, atraso: 0.1 },
  { x: 30, y: 6, r: 14, atraso: 0.3 },
  { x: 60, y: 7, r: 14, atraso: 0.25 },
  { x: 44, y: 22, r: 20, atraso: 0.4 },
];
const CHEGADA_DURA_S = 2.8;

function densidadeDaChegada(leve: boolean) {
  const nuvens = leve ? CHEGADA.slice(0, 3) : CHEGADA;
  return (x: number, y: number, s: number) => {
    let soma = 0;
    for (const n of nuvens) {
      const t = (s - n.atraso) / (CHEGADA_DURA_S - n.atraso);
      if (t <= 0 || t >= 1) continue;
      const r = n.r * (0.45 + t * 1.1);
      const d = Math.hypot(x - FOLGA - n.x, (y - n.y) * 1.6) / r;
      if (d >= 1) continue;
      const vida = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
      soma += (1 - d) * vida * 1.6;
    }
    return soma;
  };
}
const corDaChegada = (k: number) => (k > 0.8 ? [14, 15, 18, 235] as const : [38, 40, 46, 200] as const);

/** A brasa no fundo da boca: pontilhada, mais forte embaixo e no meio. */
function montarBrasa(): string[] {
  const linhas: string[] = [];
  for (let y = 0; y < BOCA.a; y++) {
    let l = '';
    for (let x = 0; x < BOCA.l; x++) {
      const k = Math.max(0, (y / (BOCA.a - 1)) ** 1.6 * (1 - Math.abs(x - BOCA.l / 2) / (BOCA.l * 0.6)));
      l += k * 16 > BAYER[(y % 4) * 4 + (x % 4)] + 0.5 ? (k > 0.6 ? 'Q' : 'q') : '.';
    }
    linhas.push(l);
  }
  return linhas;
}
const BRASA = montarBrasa();
const PALETA_DA_BRASA = { q: '#7a080d', Q: '#b8121a' };

// ── O bueiro ────────────────────────────────────────────────────────────────

/** A piscada: a cada `PISCA_A_CADA_MS`, por `PISCA_MS`. */
const PISCA_A_CADA_MS = 5200, PISCA_MS = 160;
const DESENHO = montarBueiro();
const MAO = montarMao();

/** A mão: sai do escuro com o barco e fica oferecendo; na prévia, volta. */
export type FaseDaMao = 'sai' | 'volta';

/**
 * O bueiro com os olhos dela. `luz` (0 a 1) acende a brasa lá dentro;
 * `seguir` faz os olhos acompanharem o mouse; `acesos` é a abertura (acesos,
 * sem piscar); `barco` é a vez do barquinho caindo (com `jaMs`, quanto dele já
 * passou) e `mao`, a mão dela com ele (os olhos ficam vermelhos).
 */
export function Bueiro({ luz = 0, seguir = true, acesos = false, tremendo = false, barco = null, jaMs = 0, mao = null, leve = false }: {
  luz?: number; seguir?: boolean; acesos?: boolean; tremendo?: boolean;
  barco?: number | null;
  /** Quanto do barquinho (e da mão) já passou quando ele montou: quem chega no meio vê dali. */
  jaMs?: number;
  mao?: FaseDaMao | null;
  leve?: boolean;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [olhar, setOlhar] = useState(0);
  const [pisca, setPisca] = useState(false);
  const paleta = usePaletaDoBueiro();

  // Os olhos para onde o mouse está (em pixels inteiros, para repintar pouco).
  useEffect(() => {
    if (!seguir) return;
    let quadro = 0, mx = 0;
    const mover = (e: PointerEvent) => {
      mx = e.clientX;
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        const r = raiz.current?.getBoundingClientRect();
        if (!r) return;
        const novo = Math.max(-1, Math.min(1, Math.round((mx - (r.left + r.width / 2)) / 300)));
        setOlhar(o => (o === novo ? o : novo));
      });
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => { window.removeEventListener('pointermove', mover); cancelAnimationFrame(quadro); };
  }, [seguir]);

  // A piscada (na abertura, não pisca).
  useEffect(() => {
    if (acesos) return;
    const ts: number[] = [];
    const piscada = window.setInterval(() => {
      setPisca(true);
      ts.push(window.setTimeout(() => setPisca(false), PISCA_MS));
    }, PISCA_A_CADA_MS);
    return () => { window.clearInterval(piscada); ts.forEach(t => window.clearTimeout(t)); };
  }, [acesos]);

  const olhos = useMemo(() => montarOlhos(mao ? 0 : olhar, !acesos && !mao && pisca), [olhar, pisca, acesos, mao]);
  const corDosOlhos = useMemo(() => paletaDosOlhos(!!mao, acesos), [mao, acesos]);
  const breu = useMemo(() => {
    const nuvens = leve ? BREU.slice(0, 2) : BREU;
    return (x: number, y: number, s: number) => nuvens.reduce((t, n) => t + nuvem(n, x, y, s), 0);
  }, [leve]);
  const chegada = useMemo(() => densidadeDaChegada(leve), [leve]);
  const atraso = (ms: number) => ({ animationDelay: `${-Math.max(0, ms)}ms` });

  return (
    <div
      ref={raiz}
      className={`portal-bueiro${acesos ? ' portal-bueiro-aceso' : ''}${tremendo ? ' portal-bueiro-treme' : ''}${mao ? ' portal-bueiro-vermelho' : ''}${leve ? ' portal-bueiro-leve' : ''}`}
      style={{ width: LARGURA_DO_BUEIRO * PX, height: ALTURA_DO_BUEIRO * PX, ['--luz' as string]: luz } as CSSProperties}
      aria-hidden
    >
      <div className="portal-bueiro-surge">
        <Grade linhas={DESENHO} paleta={paleta} className="portal-bueiro-arte" />

        {/* O escuro lá dentro: a brasa, os olhos, a névoa preta e o barco caindo. */}
        <div className="portal-bueiro-boca" style={{ left: BOCA.x * PX, top: BOCA.y * PX, width: BOCA.l * PX, height: BOCA.a * PX }}>
          <Grade linhas={BRASA} paleta={PALETA_DA_BRASA} className="portal-bueiro-brasa" />
          <Grade linhas={olhos} paleta={corDosOlhos} className="portal-bueiro-olhos" />
          <Nevoa l={BOCA.l} a={BOCA.a} passoMs={leve ? 200 : 100} densidade={breu} cor={corDoBreu} className="portal-bueiro-breu" />
          {barco !== null && (
            <div key={barco}>
              <span className="portal-bueiro-agua-entra" style={atraso(jaMs)} />
              <div className="portal-barco-cai" style={atraso(jaMs)}><Pixel linhas={BARCO} paleta={PALETA_DO_BARCO} tam={PX} /></div>
            </div>
          )}
        </div>

        {/* A mão dela com o barco: sai pela boca, por cima da guia. */}
        {mao && (
          <div
            className={`portal-mao portal-mao-${mao}`}
            style={{ left: (BOCA.x + 3) * PX, top: (BOCA.y - 1) * PX, width: LARGURA_DA_MAO * PX, height: ALTURA_DA_MAO * PX, ...(mao === 'sai' ? atraso(jaMs - MAO_SAI_MS) : {}) }}
          >
            <Grade linhas={MAO} paleta={PALETA_DA_MAO} className="portal-mao-arte" />
          </div>
        )}
      </div>

      {jaMs < CHEGADA_DURA_S * 1000 && (
        <Nevoa
          l={LARGURA_DO_BUEIRO + 2 * FOLGA} a={ALTURA_DO_BUEIRO + 12} passoMs={leve ? 125 : 80}
          densidade={chegada} cor={corDaChegada} duraS={CHEGADA_DURA_S}
          className="portal-bueiro-chegada" style={{ left: -FOLGA * PX }}
        />
      )}
    </div>
  );
}

interface Balao { id: number; x: number; desvio: number; tam: number; sobe: number; atraso: number }

/** Os balões sobem de baixo, cada um num lugar, num tamanho e numa velocidade; às vezes dois juntos. */
function useBaloes(media: number | null) {
  const [baloes, setBaloes] = useState<Balao[]>([]);
  // Fora do efeito: quando o ritmo muda (o final), os que já sobem não repetem o número.
  const proximo = useRef(0);
  useEffect(() => {
    if (!media) return;
    const ts: number[] = [];
    const soltar = () => {
      const quantos = Math.random() < 0.2 ? 2 : 1;
      const novos = Array.from({ length: quantos }, (_, i) => ({
        id: ++proximo.current,
        x: 4 + Math.random() * 92,
        desvio: Math.round((Math.random() - 0.5) * 320),
        tam: 4 + Math.floor(Math.random() * 3),
        sobe: 13 + Math.random() * 8,
        atraso: i * (0.6 + Math.random() * 1.2),
      }));
      setBaloes(b => [...b.slice(-4), ...novos]);
      const dura = Math.max(...novos.map(n => n.sobe + n.atraso)) * 1000;
      ts.push(window.setTimeout(() => setBaloes(b => b.filter(x => !novos.includes(x))), dura + 500));
      ts.push(window.setTimeout(soltar, media * (0.4 + Math.random() * 1.2)));
    };
    ts.push(window.setTimeout(soltar, media * (0.2 + Math.random() * 0.6)));
    return () => ts.forEach(t => window.clearTimeout(t));
  }, [media]);
  return baloes;
}

/** Chama `aoVirar(vez)` toda vez que começa uma nova vez de `intervalo` (pela hora do portal). */
function useVezes(intervalo: number | null, aoVirar: (vez: number, agora: number) => void) {
  const ultimo = useRef<number | null>(null);
  const cb = useRef(aoVirar);
  cb.current = aoVirar;
  useEffect(() => {
    if (!intervalo) return;
    ultimo.current = null;
    const ver = () => {
      const agora = agoraDoPortal();
      const vez = Math.floor(agora / intervalo);
      if (ultimo.current === null) { ultimo.current = vez; return; }
      if (vez === ultimo.current) return;
      ultimo.current = vez;
      cb.current(vez, agora);
    };
    const id = window.setInterval(ver, 1000);
    return () => window.clearInterval(id);
  }, [intervalo]);
}

/** Na prévia: a mão fica uns segundos, volta para o escuro e acabou. */
const MAO_VOLTA_NA_PREVIA_MS = AGUA_MS + 8_000, BARCO_ACABA_NA_PREVIA_MS = AGUA_MS + 9_400;

/**
 * O barquinho do final: monta quando a fase `final` começa (ou no meio dela,
 * para quem chega depois) e a mão sai em `MAO_SAI_MS`. Na prévia, vem a cada
 * `barcoNaPreviaMs` e a mão volta.
 */
function useBarco(abertura: number, final: boolean, barcoNaPreviaMs: number | null) {
  const inicio = abertura - BARCO_ANTES_DA_ABERTURA_MS;
  const [previa, setPrevia] = useState<{ vez: number; mao: FaseDaMao | null } | null>(null);
  const [maoNoFinal, setMaoNoFinal] = useState(false);
  // Quanto do final já tinha passado quando esta tela o viu começar.
  const jaNoFinal = useMemo(() => (final ? Math.max(0, agoraDoPortal() - inicio) : 0), [final, inicio]);

  useEffect(() => {
    if (!final) { setMaoNoFinal(false); return; }
    // O barco chegou: os sons já começam a baixar para a abertura.
    void prepararSonsDaCoisa();
    const falta = MAO_SAI_MS - jaNoFinal;
    if (falta <= 0) { setMaoNoFinal(true); return; }
    const t = window.setTimeout(() => setMaoNoFinal(true), falta);
    return () => window.clearTimeout(t);
  }, [final, jaNoFinal]);

  const tempos = useRef<number[]>([]);
  useEffect(() => () => tempos.current.forEach(t => window.clearTimeout(t)), []);
  useVezes(barcoNaPreviaMs, (_vez, agora) => {
    tempos.current.forEach(t => window.clearTimeout(t));
    setPrevia({ vez: agora, mao: null });
    tempos.current = [
      window.setTimeout(() => setPrevia(p => p && { ...p, mao: 'sai' }), MAO_SAI_MS),
      window.setTimeout(() => setPrevia(p => p && { ...p, mao: 'volta' }), MAO_VOLTA_NA_PREVIA_MS),
      window.setTimeout(() => setPrevia(p => (p?.vez === agora ? null : p)), BARCO_ACABA_NA_PREVIA_MS),
    ];
  });

  if (final) return { barco: inicio, jaMs: jaNoFinal, mao: maoNoFinal ? 'sai' as const : null };
  if (previa) return { barco: previa.vez, jaMs: 0, mao: previa.mao };
  return { barco: null, jaMs: 0, mao: null };
}

/** A camada da semana: o bueiro no alto, os balões subindo e o barquinho. */
export function CamadaDoBueiro({ estado, abertura, leve, barcoNaPreviaMs = null }: {
  estado: EstadoDoPortal;
  /** A hora da abertura (o barco do final cai antes dela). */
  abertura: number;
  leve: boolean;
  /** Na prévia do super_admin: o barco de tanto em tanto. */
  barcoNaPreviaMs?: number | null;
}) {
  const baloes = useBaloes(estado.balaoACadaMs);
  const { barco, jaMs, mao } = useBarco(abertura, estado.fase === 'final', barcoNaPreviaMs);

  return (
    <div className="portal-camada-bueiro" data-portal-anima data-portal-fora aria-hidden>
      {baloes.map(b => (
        <div
          key={b.id}
          className={`portal-balao-ao-acaso${leve ? ' portal-balao-reto' : ''}`}
          style={{ left: `${b.x}vw`, ['--desvio' as string]: `${b.desvio}px`, ['--sobe' as string]: `${b.sobe}s`, ['--atraso' as string]: `${b.atraso}s` } as CSSProperties}
        >
          <div className="portal-balao-corpo">
            <Pixel linhas={BALAO} paleta={PALETA_DO_BALAO} tam={b.tam} />
            <span className="portal-balao-fio" />
          </div>
        </div>
      ))}
      <div className="portal-alto-bueiro">
        <Bueiro luz={estado.luz} seguir={!leve} tremendo={estado.tremor && !leve} barco={barco} jaMs={jaMs} mao={mao} leve={leve} />
      </div>
      {barco !== null && (
        <div key={barco} className={`portal-barco-na-agua${leve ? ' portal-leve' : ''}`}>
          <span className="portal-agua" style={{ animationDelay: `${-jaMs}ms` }} />
          <div className="portal-barco-desce" style={{ animationDelay: `${-jaMs}ms` }}><Pixel linhas={BARCO} paleta={PALETA_DO_BARCO} tam={PX} /></div>
        </div>
      )}
    </div>
  );
}
