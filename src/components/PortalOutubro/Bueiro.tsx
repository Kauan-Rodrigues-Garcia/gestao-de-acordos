/**
 * Bueiro.tsx — a semana antes do mural (pedidos de 27/10/2026, no lugar do
 * vidro rachando): um bueiro no alto da tela, no meio, com a Coisa lá dentro.
 * Até sexta, 16h (`fases.ts`).
 *
 *   - só os olhos dela no escuro, bem no meio da boca (pedido de 28/10: «não
 *     quero o rosto do It no bueiro, quero apenas os olhos bem
 *     centralizados»): os mesmos olhos do busto (`olhosDaCabecona`), que
 *     seguem o mouse e piscam. Na abertura, acendem;
 *   - de quarta em diante o bueiro brilha por dentro, mais a cada dia (`luz`);
 *     quinta e sexta ele treme de vez em quando (`tremor`);
 *   - balões vermelhos sobem de baixo da tela, em lugares e horas ao acaso
 *     (pedido de 28/10: «os balões subindo aleatoriamente»), mais vezes a cada
 *     dia; às vezes dois juntos. Não estouram: nada aqui pega clique;
 *   - de tempos em tempos um barquinho de papel vem boiando num filete de
 *     água pela borda de cima, passa por baixo da borda do bueiro e afunda
 *     lá dentro, no escuro (o barquinho do Georgie; pedido de 28/10/2026:
 *     «uma animação minimalista do barquinho indo para o bueiro»).
 *
 * O barquinho sai pela hora (`barcoACadaMs`): todo mundo vê no mesmo minuto.
 * Os balões, não: cada tela sorteia os seus. Fica abaixo dos diálogos do
 * app (z 45). No modo leve (máquina sem placa de vídeo) os olhos não seguem o
 * mouse e o balão sobe reto.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EstadoDoPortal } from './fases';
import { agoraDoPortal } from './relogio';
import { BALAO, BARCO, PALETA_DO_BALAO, PALETA_DO_BARCO } from './coisa/arte';
import { PALETA_DA_CABECONA, olhosDaCabecona } from './coisa/cabecona';

/** O bueiro em pixel, visto de frente no alto da tela: a moldura de concreto e a boca escura. */
const GRADE = [
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'ssssssssssssssssssssssssssssssssssssssss',
  'SSkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkSS',
  'SkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkS',
  'SkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkS',
  'SkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkS',
  'SkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkS',
  'SkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkS',
  'SkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkS',
  'SkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkS',
  'SkxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxkS',
  'SSkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkSS',
  'sSsSSSSsSSSSSSSSsSSSSSSSSSSsSSSSSSsSSSSs',
  '.SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.',
];
const CORES: Readonly<Record<string, string>> = { s: '#6b7376', S: '#4a5154', k: '#121416', x: '#020203' };
const PX = 5;
const L = GRADE[0].length, A = GRADE.length;

export function Pixel({ linhas, paleta, tam }: { linhas: readonly string[]; paleta: Readonly<Record<string, string>>; tam: number }) {
  const l = linhas[0].length, a = linhas.length;
  return (
    <svg viewBox={`0 0 ${l} ${a}`} width={l * tam} height={a * tam} shapeRendering="crispEdges" aria-hidden>
      {linhas.flatMap((linha, y) => [...linha].map((ch, x) => paleta[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={paleta[ch]} /> : null))}
    </svg>
  );
}

/** O pixel dos olhos no bueiro, e a piscada: a cada `PISCA_A_CADA_MS`, por `PISCA_MS`. */
const PX_DOS_OLHOS = 4;
const PISCA_A_CADA_MS = 5200, PISCA_MS = 160;
/** A boca do bueiro, em pixels da grade: onde os olhos ficam no meio. */
const BOCA = { x: 2, y: 3, l: 36, a: 8 } as const;

/**
 * O bueiro com os olhos dela. `luz` (0 a 1) acende o fundo; `seguir` faz os
 * olhos acompanharem o mouse; `acesos` é a abertura (acesos, sem piscar).
 */
export function Bueiro({ luz = 0, seguir = true, acesos = false, tremendo = false, barco = null }: {
  luz?: number; seguir?: boolean; acesos?: boolean; tremendo?: boolean;
  /** O barquinho que está chegando (a vez dele): dentro da boca, ele afunda. */
  barco?: number | null;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [olhar, setOlhar] = useState<readonly [number, number]>([0, 0.5]);
  const [pisca, setPisca] = useState(false);

  // Os olhos para onde o mouse está (em meios, para repintar pouco).
  useEffect(() => {
    if (!seguir) return;
    let id = 0, mx = 0, my = 0;
    const mover = (e: PointerEvent) => {
      mx = e.clientX; my = e.clientY;
      if (id) return;
      id = requestAnimationFrame(() => {
        id = 0;
        const r = raiz.current?.getBoundingClientRect();
        if (!r) return;
        const q = (n: number) => Math.round(Math.max(-1, Math.min(1, n)) * 2) / 2;
        const novo = [q((mx - (r.left + r.width / 2)) / 500), q((my - (r.top + r.height / 2)) / 400)] as const;
        setOlhar(o => (o[0] === novo[0] && o[1] === novo[1] ? o : novo));
      });
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => { window.removeEventListener('pointermove', mover); cancelAnimationFrame(id); };
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
  const olhos = olhosDaCabecona({ olhar, brilho: acesos, piscando: !acesos && pisca });

  return (
    <div
      ref={raiz}
      className={`portal-bueiro${acesos ? ' portal-bueiro-aceso' : ''}${tremendo ? ' portal-bueiro-treme' : ''}`}
      style={{ width: L * PX, height: A * PX, ['--luz' as string]: luz } as CSSProperties}
      aria-hidden
    >
      <Pixel linhas={GRADE} paleta={CORES} tam={PX} />
      <div className="portal-bueiro-olhos" style={{ left: BOCA.x * PX, top: BOCA.y * PX, width: BOCA.l * PX, height: BOCA.a * PX }}>
        <Pixel linhas={olhos} paleta={PALETA_DA_CABECONA} tam={PX_DOS_OLHOS} />
      </div>
      <span className="portal-bueiro-brilho" />
      {barco !== null && (
        <div key={barco} className="portal-bueiro-boca" style={{ left: 2 * PX, top: 3 * PX, width: 36 * PX, height: 8 * PX }}>
          <div className="portal-barco-afunda"><Pixel linhas={BARCO} paleta={PALETA_DO_BARCO} tam={PX} /></div>
          <span className="portal-bueiro-pingos" />
        </div>
      )}
    </div>
  );
}

interface Balao { id: number; x: number; desvio: number; tam: number; sobe: number; atraso: number }

/**
 * De quanto em quanto tempo sobe um balão, em média: o intervalo do dia
 * (`balaoACadaMs`, 40 min na segunda, 6 na sexta) era raro demais para ver;
 * aqui ele vira de 1 min (segunda) a 12 s (sexta, e no fim da contagem).
 */
function mediaDosBaloes(intervaloDoDia: number): number {
  return Math.max(12_000, Math.min(60_000, intervaloDoDia / 40));
}

/** Os balões sobem de baixo, cada um num lugar, num tamanho e numa velocidade; às vezes dois juntos. */
function useBaloes(intervaloDoDia: number | null) {
  const [baloes, setBaloes] = useState<Balao[]>([]);
  useEffect(() => {
    if (!intervaloDoDia) return;
    const media = mediaDosBaloes(intervaloDoDia);
    const ts: number[] = [];
    let id = 0;
    const soltar = () => {
      const quantos = Math.random() < 0.2 ? 2 : 1;
      const novos = Array.from({ length: quantos }, (_, i) => ({
        id: ++id,
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
  }, [intervaloDoDia]);
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

/** A camada da semana: o bueiro no alto, os balões subindo e o barquinho. */
export function CamadaDoBueiro({ estado, leve }: { estado: EstadoDoPortal; leve: boolean }) {
  const baloes = useBaloes(estado.balaoACadaMs);
  const [barco, setBarco] = useState<number | null>(null);

  useVezes(estado.barcoACadaMs, (_vez, agora) => {
    setBarco(agora);
    window.setTimeout(() => setBarco(b => (b === agora ? null : b)), 10_000);
  });

  return (
    <div className="portal-camada-bueiro" aria-hidden>
      {baloes.map(b => (
        <div
          key={b.id}
          className={`portal-balao-ao-acaso${leve ? ' portal-balao-reto' : ''}`}
          style={{ left: `${b.x}vw`, ['--desvio' as string]: `${b.desvio}px`, ['--sobe' as string]: `${b.sobe}s`, ['--atraso' as string]: `${b.atraso}s` } as CSSProperties}
        >
          <Pixel linhas={BALAO} paleta={PALETA_DO_BALAO} tam={b.tam} />
          <span className="portal-balao-fio" />
        </div>
      ))}
      {barco !== null && (
        <div key={barco} className={leve ? 'portal-leve' : undefined}>
          <span className="portal-agua" />
          <div className="portal-barco-desce"><Pixel linhas={BARCO} paleta={PALETA_DO_BARCO} tam={PX} /></div>
        </div>
      )}
      <div className="portal-alto-bueiro">
        <Bueiro luz={estado.luz} seguir={!leve} tremendo={estado.tremor && !leve} barco={barco} />
      </div>
    </div>
  );
}
