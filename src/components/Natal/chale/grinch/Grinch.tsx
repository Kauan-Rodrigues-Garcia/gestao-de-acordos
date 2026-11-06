/**
 * O Grinch no chalé de Acordos — o desenho. O roteiro (quando ele entra, o
 * que bagunça, quando vêm os duendes) está em `roteiro.ts`.
 *
 * Por que em Acordos, e não no Analítico: na história (Dr. Seuss, e os filmes
 * de 2000 e 2018) o Grinch desce pela CHAMINÉ disfarçado de Papai Noel e leva
 * os presentes, a árvore e os enfeites da casa dos Quem; no fim ouve o povo
 * cantando mesmo assim e devolve tudo. O chalé de Acordos é essa casa. O
 * Analítico tem o iglu do Urso — que fica sabendo de tudo pelos duendes.
 *
 * O rosto é o recorte das figuras que o Kauan mandou (`grinch-*.webp`); o
 * corpo foi desenhado aqui no mesmo traço — contorno preto grosso, verde
 * vivo, o casaco vermelho de Papai Noel com a barra branca, como a manga da
 * figura da mão. Tudo anda por `transform` e `opacity` (`chale.css`): nada de
 * filtro nem de desfoque se mexendo, para não pesar em computador fraco.
 */
import { cn } from '@/lib/utils';
import type { EstadoGrinch } from './roteiro';
import espia from './grinch-espia.webp';
import sorri from './grinch-sorri.webp';

const TRACO = '#1B1B1B';
const VERDE = '#8CC63F';
const VERDE_ESCURO = '#6FA52C';
const VERMELHO = '#D62B2B';

// ── Na janela (coordenadas da janela, antes da escala de 80%) ───────────────

/** O rosto espiando atrás do vidro (x 76–160, y 30–94). Vai dentro do recorte do vidro. */
export function GrinchEspiando({ e }: { e: EstadoGrinch }) {
  return (
    <g className={cn('nt-grinch-espia', e.espiando && 'aparece')}>
      <image href={espia} x={87} y={56} width={62} height={38.3} />
    </g>
  );
}

/** As trincas, saindo do ponto do impacto. */
const TRINCAS = 'M118 72 L96 58 L80 52 M118 72 L104 40 L100 30 M118 72 L130 44 L136 30 M118 72 L148 60 L160 54 M118 72 L150 86 L160 90 M118 72 L124 94 M118 72 L92 88 L78 94 M104 40 L92 36 M148 60 L154 70 M96 58 L92 70';
/** O buraco: recortado, em volta do impacto. */
const BURACO = 'M106 62 L112 54 L116 60 L124 52 L127 61 L136 58 L132 68 L140 74 L131 79 L134 88 L124 84 L118 92 L113 84 L103 87 L106 78 L97 73 L105 69 Z';

/**
 * O vidro trincando (fase «quebra») e, depois, quebrado: o resto do vidro
 * com reflexo, o buraco, as trincas e os cacos no parapeito. Na hora da
 * quebra, cacos voam para dentro da sala.
 */
export function JanelaQuebrada({ e }: { e: EstadoGrinch }) {
  const quebrada = !!e.bagunca.janela;
  const trincando = e.fase === 'quebra';
  if (!quebrada && !trincando) return null;
  return (
    <g className="nt-janela-quebrada">
      {quebrada && (
        <>
          {/* o que sobrou do vidro: um véu claro, com o buraco vazado */}
          <path d={`M76 30 H160 V94 H76 Z ${BURACO}`} fillRule="evenodd" fill="#DCEBFA" opacity={0.32} />
          <path d={BURACO} fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinejoin="round" />
          <path d={BURACO} fill="none" stroke="#7FA3D0" strokeWidth={0.6} strokeLinejoin="round" />
        </>
      )}
      <path d={TRINCAS} className={cn('nt-trincas', trincando && 'trincando')} pathLength={100}
        fill="none" stroke="#F4FAFF" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
      {quebrada && (
        <g className="nt-cacos-parapeito">
          <path d="M84 98 L88 94.6 L90 98 Z M96 98 L98.6 95.4 L101 98 Z M131 98 L134 94 L136.4 98 Z M146 98 L148 96 L150.6 98 Z" fill="#CFE3F7" stroke="#8FB3D9" strokeWidth={0.4} />
        </g>
      )}
      {/* os cacos voando para dentro, só na hora */}
      {quebrada && e.fase === 'entra' && e.via === 'janela' && (
        <g className="nt-cacos-voando">
          {[[-30, 40], [-14, 70], [6, 80], [22, 60], [36, 30], [-40, 10], [44, 70]].map(([dx, dy], i) => (
            <path key={i} d="M118 72 l3 -4 l3 5 Z" fill="#DCEBFA" stroke="#8FB3D9" strokeWidth={0.4}
              style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${i * 0.03}s` }} />
          ))}
        </g>
      )}
    </g>
  );
}

// ── O Grinch de corpo inteiro (coordenadas do chalé: pés no 0,0) ─────────────

/** Um traço com contorno: o preto por baixo, a cor por cima. */
function Tubo({ d, cor, w }: { d: string; cor: string; w: number }) {
  return (
    <>
      <path d={d} stroke={TRACO} strokeWidth={w + 2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={d} stroke={cor} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

/** Um braço: manga vermelha, punho branco e a mão verde de dedos compridos. `lado` 1 = direito. */
function Braco({ lado }: { lado: 1 | -1 }) {
  const s = lado;
  return (
    <g className={cn('nt-grinch-braco', s === 1 ? 'dir' : 'esq')}>
      <Tubo d={`M${11 * s} -44 C${18 * s} -40 ${22 * s} -34 ${24 * s} -28`} cor={VERMELHO} w={6.4} />
      <ellipse cx={24.6 * s} cy={-27} rx={4.4} ry={3.2} fill="#FFFFFF" stroke={TRACO} strokeWidth={1.2} transform={`rotate(${-30 * s} ${24.6 * s} -27)`} />
      <Tubo d={`M${25 * s} -24.6 C${28 * s} -21 ${31 * s} -18.6 ${34.6 * s} -18`} cor={VERDE} w={2.2} />
      <Tubo d={`M${25.4 * s} -24 C${27.6 * s} -19.6 ${27.6 * s} -15.6 ${29.6 * s} -13.4`} cor={VERDE} w={2.2} />
      <Tubo d={`M${24 * s} -24 C${24 * s} -19 ${22.4 * s} -16 ${23.4 * s} -12.6`} cor={VERDE} w={2.2} />
    </g>
  );
}

function CorpoDoGrinch() {
  return (
    <g className="nt-grinch-corpo">
      {/* as pernas finas e peludas, os pés compridos */}
      <g className="nt-grinch-pernas">
        <Tubo d="M-6 -20 Q-8 -10 -9 -2.4 Q-13 -1 -17.4 -2.6" cor={VERDE} w={3.6} />
        <Tubo d="M6 -20 Q8 -10 9 -2.4 Q13 -1 17.4 -2.6" cor={VERDE} w={3.6} />
        <path d="M-8.6 -12 l-2 -1.4 M8.6 -12 l2 -1.4" stroke={VERDE_ESCURO} strokeWidth={1} strokeLinecap="round" />
      </g>
      <Braco lado={-1} />
      {/* o casaco de Papai Noel */}
      <path d="M-11 -46 C-16 -40 -19.4 -30 -19.6 -20 L19.6 -20 C19.4 -30 16 -40 11 -46 Z" fill={VERMELHO} stroke={TRACO} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M-8 -42 C-12 -36 -14 -30 -15 -24" stroke="#F0585A" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.7} />
      <rect x={-2.2} y={-45} width={4.4} height={23} rx={1.4} fill="#FFFFFF" stroke={TRACO} strokeWidth={1.1} />
      <rect x={-18.4} y={-33.4} width={36.8} height={4.6} fill={TRACO} />
      <rect x={-4.2} y={-34.4} width={8.4} height={6.6} rx={1} fill="none" stroke="#E2B04A" strokeWidth={1.6} />
      <path d="M-20.6 -21.6 Q-16.6 -25 -12.4 -21.6 Q-8.4 -25 -4.2 -21.6 Q0 -25 4.2 -21.6 Q8.4 -25 12.4 -21.6 Q16.6 -25 20.6 -21.6 L20.6 -16.6 Q16.6 -13.6 12.4 -16.6 Q8.4 -13.6 4.2 -16.6 Q0 -13.6 -4.2 -16.6 Q-8.4 -13.6 -12.4 -16.6 Q-16.6 -13.6 -20.6 -16.6 Z"
        fill="#FFFFFF" stroke={TRACO} strokeWidth={1.3} strokeLinejoin="round" />
      <Braco lado={1} />
      {/* a cabeça: o rosto sorrindo de lado, do recorte */}
      <g className="nt-grinch-cabeca">
        <image href={sorri} x={-18.5} y={-85} width={37} height={41.8} />
      </g>
    </g>
  );
}

/**
 * O Grinch inteiro, nas fases em que ele está à vista: entrando (pela janela
 * ou pela chaminé), na pose no meio da bagunça e saindo.
 */
export function GrinchInteiro({ e }: { e: EstadoGrinch }) {
  const fase = e.fase === 'entra' ? `entra-${e.via}` : e.fase === 'pose' ? `pose-${e.via}` : e.fase === 'sai' ? `sai-${e.via}` : null;
  if (!fase) return null;
  return (
    <g className={cn('nt-grinch-inteiro', fase)}>
      <ellipse className="nt-grinch-sombra" cx={0} cy={0} rx={20} ry={2.6} fill="#000" opacity={0.18} />
      <CorpoDoGrinch />
    </g>
  );
}

// ── A briga: a nuvem de poeira de desenho animado ───────────────────────────

/** As bolotas da nuvem: [x, y, raio]. */
const BOLOTAS = [[-30, 6, 15], [-15, -10, 17], [4, -16, 16], [22, -8, 16], [33, 7, 13], [16, 11, 17], [-4, 12, 17], [-21, 15, 12], [0, -1, 19]] as const;
/** As estrelas que saltam: [direção x, direção y, tamanho]. */
const ESTRELAS = [[-44, -30, 1], [40, -34, 0.9], [52, 4, 0.8], [-52, 2, 0.85], [-20, -46, 0.75], [26, -48, 0.95], [6, -54, 0.7]] as const;
const ESTRELA = 'M0 -5 L1.5 -1.6 L5 -1.5 L2.3 0.8 L3.2 4.4 L0 2.4 L-3.2 4.4 L-2.3 0.8 L-5 -1.5 L-1.5 -1.6 Z';

/**
 * A nuvem roda pela sala; de dentro saem estrelas, um braço verde, um pé, o
 * gorro e o «#@!» de quem está brigando. Sem som. O desenho tem contorno só
 * por fora: as bolotas são desenhadas primeiro com o traço, depois só cheias.
 */
export function NuvemDeBriga({ e, compacto }: { e: EstadoGrinch; compacto: boolean }) {
  if (e.fase !== 'briga') return null;
  return (
    <g className={cn('nt-briga', compacto ? 'compacto' : 'inteiro')}>
      <g className="nt-briga-sacode">
        {/* riscos de movimento girando em volta */}
        <g className="nt-briga-riscos">
          <path d="M-44 -18 A46 30 0 0 1 -10 -36 M30 -34 A46 30 0 0 1 48 -6 M44 22 A46 30 0 0 1 10 32 M-28 30 A46 30 0 0 1 -48 10"
            stroke={TRACO} strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.55} />
        </g>
        {/* o que escapa da nuvem: braço, pé, gorro */}
        <g className="nt-briga-escapa braco"><Tubo d="M18 -8 L44 -22" cor={VERDE} w={3} /><Tubo d="M44 -22 l6 -3 M44 -22 l5 1 M44 -22 l3 -6" cor={VERDE} w={1.6} /></g>
        <g className="nt-briga-escapa pe"><Tubo d="M-12 10 L-36 26 Q-42 28 -46 25" cor={VERDE} w={3} /></g>
        <g className="nt-briga-escapa gorro">
          <path d="M8 -20 L20 -46 L30 -20 Z" fill={VERMELHO} stroke={TRACO} strokeWidth={1.2} />
          <circle cx={20} cy={-47} r={3.4} fill="#FFFFFF" stroke={TRACO} strokeWidth={1} />
        </g>
        {BOLOTAS.map(([x, y, r], i) => <circle key={`c${i}`} cx={x} cy={y} r={r} fill="none" stroke={TRACO} strokeWidth={3.2} />)}
        {BOLOTAS.map(([x, y, r], i) => (
          <circle key={`f${i}`} className="nt-briga-bolota" cx={x} cy={y} r={r} fill="#F5F2EC" style={{ animationDelay: `${-i * 0.11}s` }} />
        ))}
        {[[-14, 4, 6], [12, -6, 6.5], [20, 9, 5], [-24, 12, 4]].map(([x, y, r], i) => (
          <circle key={`s${i}`} cx={x} cy={y} r={r} fill="#EAE5DC" />
        ))}
        {/* o «#@!» */}
        <g className="nt-briga-xinga">
          <text x={-10} y={-2} fontSize={11} fontWeight={800} fill={TRACO}>#@!</text>
        </g>
        {ESTRELAS.map(([dx, dy, s], i) => (
          <g key={`e${i}`} className="nt-briga-estrela" style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${-i * 0.13}s` }}>
            <path d={ESTRELA} transform={`scale(${s * 1.3})`} fill="#FFD54F" stroke={TRACO} strokeWidth={0.8} strokeLinejoin="round" />
          </g>
        ))}
      </g>
    </g>
  );
}

/** A nuvem de fuligem na boca da lareira, quando ele entra ou sai pela chaminé. */
export function Fuligem({ e }: { e: EstadoGrinch }) {
  if (e.via !== 'chamine' || (e.fase !== 'entra' && e.fase !== 'sai')) return null;
  return (
    <g className="nt-fuligem" key={e.fase}>
      {[[300, 140, 16], [286, 150, 12], [314, 150, 13], [300, 156, 14], [292, 130, 9], [310, 132, 10]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#3B3533" style={{ animationDelay: `${i * 0.04}s` }} />
      ))}
    </g>
  );
}
