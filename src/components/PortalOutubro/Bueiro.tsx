/**
 * Bueiro.tsx — a semana antes do mural (pedidos de 27/10/2026, no lugar do
 * vidro rachando): um bueiro no alto da tela, no meio, com a Coisa lá dentro.
 * Até sexta, 16h (`fases.ts`).
 *
 *   - desde 29/10 ele é um pedaço da barra de cima que quebrou (pedido:
 *     «encaixar perfeitamente na barra, parecendo que é uma parte da barra
 *     superior que está quebrada, algo mais detalhado, mais realista»): o
 *     buraco de borda lascada na altura da barra (o `h-14`, 56 px), as
 *     rachaduras saindo dele, e lá dentro a guia de concreto com a boca de
 *     lobo; a guia passa um tico da barra, com dois cacos pendurados;
 *   - só os olhos dela no escuro, bem no meio da boca (pedido de 28/10), fundos
 *     e com a névoa preta passando na frente (29/10: «os olhos mais
 *     profundos, uma névoa preta no escuro»). Seguem o mouse e piscam; na
 *     abertura, acendem;
 *   - quando ele aparece, sai de dentro de uma névoa (29/10);
 *   - de quarta em diante a boca brilha em brasa por dentro, mais a cada dia
 *     (`luz`); quinta e sexta ele treme de vez em quando (`tremor`);
 *   - balões vermelhos sobem de baixo da tela, em lugares e horas ao acaso
 *     (pedido de 28/10), mais vezes a cada dia; às vezes dois juntos. Não
 *     estouram: nada aqui pega clique;
 *   - de tempos em tempos um barquinho de papel vem boiando num filete de
 *     água pela barra, POR CIMA da guia (29/10: «ele tem que passar pela
 *     frente»), cai pela boca e afunda no escuro; aí a mão dela sai do bueiro
 *     segurando o barco, oferecendo, com os olhos vermelhos, e volta com ele
 *     para dentro.
 *
 * O barquinho sai pela hora (`barcoACadaMs`): todo mundo vê no mesmo minuto.
 * Os balões, não: cada tela sorteia os seus. Fica abaixo dos diálogos do
 * app (z 45). Só `transform` e `opacity` se mexem (nada de filtro animado),
 * e anima também no modo leve (`data-portal-anima`, `index.css`): ali os
 * olhos não seguem o mouse, o balão sobe reto e a névoa tem menos nuvens.
 */
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { EstadoDoPortal } from './fases';
import { agoraDoPortal } from './relogio';
import { BALAO, PALETA_DO_BALAO } from './coisa/arte';

/** O pedaço da tela do bueiro, em px: a barra de cima (56) e o que sobra dela embaixo. */
const L = 260, A = 76;
/** A boca de lobo, dentro do buraco (o escuro, onde ficam os olhos). */
const BOCA = { x: 54, y: 17, l: 152, a: 26 } as const;

/** O buraco na barra: a borda lascada. Embaixo passa da barra (56) e a guia aparece. */
const BURACO = 'M28 31 L23 40 L28 48 L22 57 L40 60 L222 60 L237 57 L232 49 L236 40 L231 32 L234 23 L228 15 L223 9 L213 10 L203 5 L190 8 L178 4 L166 6 L153 2 L140 6 L128 3 L115 5 L101 2 L88 6 L75 3 L63 7 L52 4 L44 9 L34 12 L30 21 Z';
/** As rachaduras que saem do buraco pela barra. */
const RACHAS = [
  'M30 21 L18 18 L11 23 L2 21', 'M18 18 L15 10', 'M23 40 L12 42 L5 38', 'M22 57 L13 54',
  'M228 15 L241 12 L250 16 L259 13', 'M241 12 L244 5', 'M236 40 L247 43 L257 39', 'M237 57 L248 54',
  'M88 6 L84 1', 'M178 4 L183 0',
];
/** Os cacos da barra pendurados na borda de baixo. */
const CACOS = ['M22 56 L31 56 L27 63 Z', 'M229 56 L238 56 L236 61 Z'];

export function Pixel({ linhas, paleta, tam }: { linhas: readonly string[]; paleta: Readonly<Record<string, string>>; tam: number }) {
  const l = linhas[0].length, a = linhas.length;
  return (
    <svg viewBox={`0 0 ${l} ${a}`} width={l * tam} height={a * tam} shapeRendering="crispEdges" aria-hidden>
      {linhas.flatMap((linha, y) => [...linha].map((ch, x) => paleta[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={paleta[ch]} /> : null))}
    </svg>
  );
}

/** O barquinho do Georgie, de papel dobrado (o mesmo na água, caindo e na mão dela). */
export function BarcoDePapel({ l = 30 }: { l?: number }) {
  return (
    <svg viewBox="0 0 32 18" width={l} height={(l * 18) / 32} aria-hidden>
      <path d="M16 .6 L24.6 10 L7.4 10 Z" fill="#f4eed6" stroke="#5f5947" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M16 .6 L24.6 10 L16 10 Z" fill="#d9cfaa" />
      <path d="M16 .6 V10" stroke="#a89d78" strokeWidth=".6" />
      <path d="M.8 9.6 H31.2 L25.6 17.2 H6.4 Z" fill="#ebe3c1" stroke="#5f5947" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M6.4 17.2 L10 9.6 M25.6 17.2 L22 9.6" stroke="#b8ad86" strokeWidth=".7" />
      <path d="M3.4 13.4 H28.6" stroke="#bdb28d" strokeWidth=".6" opacity=".8" />
    </svg>
  );
}

/** A piscada: a cada `PISCA_A_CADA_MS`, por `PISCA_MS`. */
const PISCA_A_CADA_MS = 5200, PISCA_MS = 160;
/** Os dois olhos, no escuro da boca (x, y). */
const OLHOS = [[BOCA.l / 2 - 18, 13], [BOCA.l / 2 + 18, 13]] as const;

/** Um olho em amêndoa, o canto de dentro mais baixo (o lado `l`: −1 o da esquerda, 1 o da direita). */
function amendoa(x: number, y: number, l: number): string {
  return `M${x - 8 * l} ${y - 1} Q${x - l} ${y - 5.5} ${x + 7 * l} ${y + 1} Q${x} ${y + 4} ${x - 8 * l} ${y - 1} Z`;
}
/** A sobrancelha pesada, a sombra que afunda o olho. */
function sobrancelha(x: number, y: number, l: number): string {
  return `M${x - 11 * l} ${y - 9} L${x + 11 * l} ${y - 9} L${x + 9 * l} ${y - 0.2} Q${x} ${y - 4.4} ${x - 10 * l} ${y - 3.4} Z`;
}

/** Os olhos dela lá no fundo: a íris acesa, a pupila que segue o mouse e a sombra por cima. */
function OlhosNoBreu({ olhar, piscando }: { olhar: readonly [number, number]; piscando: boolean }) {
  const id = useId();
  const [ox, oy] = [olhar[0] * 2.6, olhar[1] * 1.3];
  return (
    <svg className={`portal-olhos${piscando ? ' portal-olhos-piscando' : ''}`} viewBox={`0 0 ${BOCA.l} ${BOCA.a}`} width={BOCA.l} height={BOCA.a} aria-hidden>
      <defs>
        <radialGradient id={`${id}h`}>
          <stop offset="0" className="portal-olho-halo" />
          <stop offset="1" className="portal-olho-halo" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}i`} cx="50%" cy="40%" r="62%">
          <stop offset="0" className="portal-olho-c1" />
          <stop offset=".55" className="portal-olho-c2" />
          <stop offset="1" className="portal-olho-c3" />
        </radialGradient>
        {OLHOS.map(([x, y], k) => <clipPath key={k} id={`${id}c${k}`}><path d={amendoa(x, y, k ? -1 : 1)} /></clipPath>)}
      </defs>
      {OLHOS.map(([x, y], k) => <ellipse key={`h${k}`} className="portal-olho-luz" cx={x} cy={y} rx={17} ry={8} fill={`url(#${id}h)`} />)}
      {OLHOS.map(([x, y], k) => {
        const l = k ? -1 : 1;
        return (
          <g key={k} className="portal-olho">
            <path d={amendoa(x, y, l)} fill={`url(#${id}i)`} />
            <g clipPath={`url(#${id}c${k})`}>
              <ellipse className="portal-pupila" cx={x} cy={y} rx={1.5} ry={2.8} fill="#140700" style={{ transform: `translate(${ox}px, ${oy}px)` }} />
            </g>
            <circle cx={x - 3 * l} cy={y - 1.5} r={0.7} fill="#fff6cf" opacity={0.85} />
          </g>
        );
      })}
      {OLHOS.map(([x, y], k) => <path key={`s${k}`} d={sobrancelha(x, y, k ? -1 : 1)} fill="#000" opacity={0.92} />)}
    </svg>
  );
}

/** As nuvens da névoa preta que passam na frente dos olhos (no modo leve, as duas primeiras). */
const BREU = [
  { x: -20, y: 2, l: 96, dura: 7.5, atraso: 0 },
  { x: 70, y: 6, l: 110, dura: 9.5, atraso: -3.2 },
  { x: 24, y: 10, l: 80, dura: 6.4, atraso: -1.6 },
  { x: 104, y: -2, l: 70, dura: 8.2, atraso: -5 },
];
/** As nuvens da névoa em que ele aparece (no modo leve, as três primeiras). */
const NEVOA = [
  { x: 130, y: 34, l: 230, atraso: 0 },
  { x: 40, y: 40, l: 160, atraso: 0.15 },
  { x: 220, y: 40, l: 160, atraso: 0.1 },
  { x: 90, y: 20, l: 140, atraso: 0.3 },
  { x: 175, y: 22, l: 140, atraso: 0.25 },
  { x: 130, y: 62, l: 200, atraso: 0.4 },
];

/** O braço dela saindo da boca: a manga, o babado do punho e a luva segurando o barco. */
function MaoComOBarco() {
  return (
    <svg className="portal-mao-arte" viewBox="0 0 90 140" width={90} height={140} aria-hidden>
      <path d="M28 -4 C27 36 30 62 44 86" stroke="#4a5b67" strokeWidth={17} strokeLinecap="round" fill="none" />
      <path d="M26 -4 C25 36 28 62 42 85" stroke="#93a5b3" strokeWidth={12} strokeLinecap="round" fill="none" />
      <path d="M22 -4 C21 36 24 60 37 82" stroke="#c0ced8" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.75} />
      <path d="M20 30 q7 3 14 0 M21 52 q8 3 15 -1 M28 72 q6 4 13 1" stroke="#3a4752" strokeWidth={1.4} fill="none" opacity={0.7} />
      {/* O babado do punho. */}
      <ellipse cx={46} cy={89} rx={12.5} ry={6} fill="#e3dbc6" stroke="#7a6f58" strokeWidth={1} />
      {[[35, 92], [40.5, 94.5], [46, 95.5], [51.5, 94.5], [57, 92]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={3.1} fill="#e3dbc6" stroke="#b2a68b" strokeWidth={0.9} />
      ))}
      {/* A palma para cima, e o barco em cima dela. */}
      <ellipse cx={55} cy={103} rx={14} ry={8} transform="rotate(-14 55 103)" fill="#f4f1ea" stroke="#8f897e" strokeWidth={1.2} />
      <path d="M44 106 q10 5 22 -2" stroke="#c9c3b8" strokeWidth={1.2} fill="none" />
      <g transform="translate(37 74) scale(1.1)"><BarcoDePapel l={32} /></g>
      {/* Os dedos fechando no casco, e o polegar por cima do outro lado. */}
      {[[66, 93, -24], [69.5, 97, -10], [70.5, 101.5, 6], [68.5, 106, 20]].map(([x, y, g]) => (
        <rect key={y} x={x - 3} y={y - 5.5} width={6} height={11} rx={3} transform={`rotate(${g} ${x} ${y})`} fill="#f4f1ea" stroke="#8f897e" strokeWidth={1.1} />
      ))}
      <rect x={39} y={88} width={6} height={13} rx={3} transform="rotate(18 42 94)" fill="#f4f1ea" stroke="#8f897e" strokeWidth={1.1} />
    </svg>
  );
}

/** A mão: sai do escuro com o barco, fica oferecendo e volta. */
export type FaseDaMao = 'sai' | 'volta';

/**
 * O bueiro com os olhos dela. `luz` (0 a 1) acende a brasa lá dentro;
 * `seguir` faz os olhos acompanharem o mouse; `acesos` é a abertura (acesos,
 * sem piscar); `barco` é a vez do barquinho que está caindo e `mao`, a mão
 * dela com ele (os olhos ficam vermelhos).
 */
export function Bueiro({ luz = 0, seguir = true, acesos = false, tremendo = false, barco = null, mao = null, leve = false }: {
  luz?: number; seguir?: boolean; acesos?: boolean; tremendo?: boolean;
  barco?: number | null;
  mao?: FaseDaMao | null;
  leve?: boolean;
}) {
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const [olhar, setOlhar] = useState<readonly [number, number]>([0, 0.5]);
  const [pisca, setPisca] = useState(false);

  // Os olhos para onde o mouse está (em meios, para repintar pouco).
  useEffect(() => {
    if (!seguir) return;
    let quadro = 0, mx = 0, my = 0;
    const mover = (e: PointerEvent) => {
      mx = e.clientX; my = e.clientY;
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        const r = raiz.current?.getBoundingClientRect();
        if (!r) return;
        const q = (n: number) => Math.round(Math.max(-1, Math.min(1, n)) * 2) / 2;
        const novo = [q((mx - (r.left + r.width / 2)) / 500), q((my - (r.top + r.height / 2)) / 400)] as const;
        setOlhar(o => (o[0] === novo[0] && o[1] === novo[1] ? o : novo));
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

  const breu = leve ? BREU.slice(0, 2) : BREU;
  const nevoa = leve ? NEVOA.slice(0, 3) : NEVOA;

  return (
    <div
      ref={raiz}
      className={`portal-bueiro${acesos ? ' portal-bueiro-aceso' : ''}${tremendo ? ' portal-bueiro-treme' : ''}${mao ? ' portal-bueiro-vermelho' : ''}`}
      style={{ width: L, height: A, ['--luz' as string]: luz } as CSSProperties}
      aria-hidden
    >
      <div className="portal-bueiro-surge">
        <svg className="portal-bueiro-arte" viewBox={`0 0 ${L} ${A}`} width={L} height={A}>
          <defs>
            <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6c7376" />
              <stop offset=".55" stopColor="#555c5f" />
              <stop offset="1" stopColor="#454b4e" />
            </linearGradient>
            <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#000" stopOpacity=".6" />
              <stop offset=".3" stopColor="#000" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6a7174" />
              <stop offset="1" stopColor="#373d40" />
            </linearGradient>
            <radialGradient id={`${id}d`}>
              <stop offset="0" stopColor="#000" stopOpacity=".5" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <pattern id={`${id}p`} width="9" height="7" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r=".6" fill="#2f3436" />
              <circle cx="6.5" cy="5" r=".5" fill="#8e9598" />
              <circle cx="7.5" cy="1.5" r=".4" fill="#2f3436" />
            </pattern>
          </defs>
          {/* A sombra da guia por baixo da barra. */}
          <ellipse cx={130} cy={61} rx={118} ry={8} fill={`url(#${id}d)`} />
          {/* As rachaduras e a borda quebrada da barra (na cor da barra, no tema que estiver). */}
          <g className="portal-bueiro-rachas">{RACHAS.map(d => <path key={d} d={d} />)}</g>
          {CACOS.map(d => <path key={d} d={d} className="portal-bueiro-caco" />)}
          <path d={BURACO} className="portal-bueiro-borda" />
          {/* A guia de concreto lá dentro, com a sombra da barra em cima. */}
          <path d={BURACO} fill={`url(#${id}c)`} />
          <path d={BURACO} fill={`url(#${id}p)`} opacity={0.55} />
          <path d={BURACO} fill={`url(#${id}s)`} />
          {/* O rebaixo em volta da boca, e a boca. */}
          <rect x={BOCA.x - 5} y={BOCA.y - 4} width={BOCA.l + 10} height={BOCA.a + 4} rx={2} fill="#30363a" />
          <path d={`M${BOCA.x - 5} ${BOCA.y - 4.5} H${BOCA.x + BOCA.l + 5}`} stroke="#899094" strokeWidth={1} opacity={0.7} />
          <rect x={BOCA.x} y={BOCA.y} width={BOCA.l} height={BOCA.a} fill="#000" />
          {/* A beira da guia: o alto (na luz), a frente e as manchas da água. */}
          <path d={`M44 43 H216 L220 47.5 H40 Z`} fill="#9aa1a4" />
          <path d={`M40 47.5 H220 V60 H40 Z`} fill={`url(#${id}g)`} />
          <path d="M40 47.6 H220" stroke="#272c2e" strokeWidth={0.9} />
          <path d="M66 48 V58 M71 48 V55 M118 48 V59 M163 48 V56 M190 48 V58" stroke="#000" strokeWidth={1.2} opacity={0.22} />
          <path d="M58 43 l3 0 l-1 1.6 Z M150 43 l4 0 l-2 2 Z M199 43 l2.5 0 l-1.2 1.4 Z" fill="#3c4245" />
        </svg>

        {/* O escuro lá dentro: a brasa, os olhos, a névoa preta e o barco caindo. */}
        <div className="portal-bueiro-boca" style={{ left: BOCA.x, top: BOCA.y, width: BOCA.l, height: BOCA.a }}>
          <span className="portal-bueiro-brasa" />
          <OlhosNoBreu olhar={mao ? [0.5, 1] : olhar} piscando={!acesos && pisca} />
          {breu.map((b, i) => (
            <span
              key={i}
              className="portal-bueiro-breu"
              style={{ left: b.x, top: b.y, width: b.l, ['--dura' as string]: `${b.dura}s`, ['--atraso' as string]: `${b.atraso}s` } as CSSProperties}
            />
          ))}
          <span className="portal-bueiro-fundo" />
          {barco !== null && (
            <div key={barco}>
              <span className="portal-bueiro-agua-entra" />
              <div className="portal-barco-cai"><BarcoDePapel /></div>
            </div>
          )}
        </div>
        {!leve && <span className="portal-bueiro-bafo" />}

        {/* A mão dela com o barco: sai pela boca, por cima da guia. */}
        {mao && (
          <div className={`portal-bueiro-mao portal-bueiro-mao-${mao}`}>
            <div className="portal-mao"><MaoComOBarco /></div>
            <span className="portal-bueiro-mao-breu" />
          </div>
        )}
      </div>

      <div className="portal-bueiro-nevoa">
        {nevoa.map((n, i) => (
          <span key={i} style={{ left: n.x, top: n.y, width: n.l, ['--atraso' as string]: `${n.atraso}s` } as CSSProperties} />
        ))}
      </div>
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

/**
 * O barquinho, em ms desde que ele aparece: boia até a boca e afunda em 9 s
 * (`portal-barco-desce` e `portal-barco-cai`, em `portal.css`); um respiro, a
 * mão sai com ele e fica oferecendo, volta para o escuro e acabou.
 */
const MAO_SAI_MS = 9_600, MAO_VOLTA_MS = 17_600, BARCO_ACABA_MS = 19_000;

/** A camada da semana: o bueiro no alto, os balões subindo e o barquinho. */
export function CamadaDoBueiro({ estado, leve }: { estado: EstadoDoPortal; leve: boolean }) {
  const baloes = useBaloes(estado.balaoACadaMs);
  const [barco, setBarco] = useState<number | null>(null);
  const [mao, setMao] = useState<FaseDaMao | null>(null);
  const tempos = useRef<number[]>([]);
  useEffect(() => () => tempos.current.forEach(t => window.clearTimeout(t)), []);

  useVezes(estado.barcoACadaMs, (_vez, agora) => {
    tempos.current.forEach(t => window.clearTimeout(t));
    setBarco(agora);
    setMao(null);
    tempos.current = [
      window.setTimeout(() => setMao('sai'), MAO_SAI_MS),
      window.setTimeout(() => setMao('volta'), MAO_VOLTA_MS),
      window.setTimeout(() => { setMao(null); setBarco(b => (b === agora ? null : b)); }, BARCO_ACABA_MS),
    ];
  });

  return (
    <div className="portal-camada-bueiro" data-portal-anima aria-hidden>
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
      <div className="portal-alto-bueiro">
        <Bueiro luz={estado.luz} seguir={!leve} tremendo={estado.tremor && !leve} barco={barco} mao={mao} leve={leve} />
      </div>
      {barco !== null && (
        <div key={barco} className={`portal-barco-na-agua${leve ? ' portal-leve' : ''}`}>
          <span className="portal-agua" />
          <div className="portal-barco-desce"><BarcoDePapel /></div>
        </div>
      )}
    </div>
  );
}
