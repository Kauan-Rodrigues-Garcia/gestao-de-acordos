/**
 * O Grinch no chalé de Acordos — o desenho. O que ele faz e quando está na
 * gravação (`gravacao.ts`), tocada pelo roteiro (`roteiro.ts`).
 *
 * Por que em Acordos, e não no Analítico: na história (Dr. Seuss; o desenho de
 * 1966 e os filmes de 2000 e 2018) o Grinch entra na casa dos Quem disfarçado
 * de Papai Noel e leva os presentes, a árvore e os enfeites; no fim ouve o
 * povo cantando mesmo assim e devolve tudo. O chalé de Acordos é essa casa. O
 * Analítico tem o iglu do Urso — que fica sabendo de tudo pelos duendes.
 *
 * ## O boneco (redesenho de 11/11/2026, pedido do Cleber)
 *
 * Antes o rosto era uma figura recortada e o corpo, um desenho duro. Agora é
 * tudo desenhado aqui, com o que os filmes têm em comum: o corpo de pera, o
 * pescoço fino, as bochechas de pelo espetado, a testa franzida em cima dos
 * olhos amarelos de pupila vermelha, o sorriso que dá a volta no rosto, os
 * dedos compridos e o casaco de Papai Noel curto demais para ele.
 *
 * É um boneco articulado: cada junta (quadril, joelho, ombro, cotovelo,
 * pescoço) é uma caixa HTML de tamanho zero no ponto do encaixe, e a peça é
 * desenhada a partir dali. Uma pose é um conjunto de ângulos (as variáveis
 * `--tr`, `--bf`… em `grinch.css`); mudar de pose é uma transição de
 * `transform`, que a placa de vídeo faz sozinha. Nada de filtro, nada de
 * cálculo por quadro.
 */
import { forwardRef, memo } from 'react';
import { cn } from '@/lib/utils';
import { D } from '../pecas';
import { T_JANELA, VIDRO } from '../medidas';
import type { EstadoGrinch } from './roteiro';
import './grinch.css';

const TRACO = '#1F2B10';
const PELO = '#96C637';
const PELO_TRAS = '#7FAE2B';
const PELO_CLARO = '#C6E472';
const CASACO = '#D42C30';
const CASACO_TRAS = '#B02228';

/** Um traço com contorno: o escuro por baixo, a cor por cima. */
function Tubo({ d, cor, w }: { d: string; cor: string; w: number }) {
  return (
    <>
      <path d={d} stroke={TRACO} strokeWidth={w + 2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={d} stroke={cor} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

/**
 * A cabeça, com o gorro. O 0,0 é o encaixe do pescoço. As três bocas ficam
 * uma em cima da outra; `data-cara` (no boneco) escolhe qual aparece.
 */
export const CabecaDoGrinch = memo(function CabecaDoGrinch() {
  return (
    <g>
      {/* o gorro: o corpo, a ponta caída para trás e o pompom */}
      <path d="M3.6 -45.6 C-6 -49 -17.6 -43.4 -21 -33.6 C-15.4 -38.4 -8 -40.4 -2.4 -39.6 Z" fill={CASACO_TRAS} stroke={TRACO} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M-12.4 -26.6 C-12 -37 -5 -45.6 3.6 -45.6 C10.8 -45.6 15 -37 15.4 -27.6 Z" fill="url(#gr-casaco)" stroke={TRACO} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M-8.6 -30 C-8 -36 -4 -41.6 1 -43" stroke="#F58A7E" strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.7} />
      <circle cx={-21.4} cy={-31.6} r={3.9} fill="url(#gr-pele-branca)" stroke={TRACO} strokeWidth={1.1} />
      {/* a cabeça de pera: testa estreita, bochechas largas de pelo espetado */}
      <path d="M0 -31 C-8 -31 -12.5 -25 -12.6 -18.5 C-15.6 -18.4 -18.8 -14.6 -18.6 -10.4 L-15 -12 L-17 -6.2 L-12.6 -8.6 C-10.6 -2.4 -5 1.8 1.4 1.8 C8 1.8 13.4 -2.4 15.4 -8.6 L19.8 -6.2 L17.8 -12 L21.4 -10.4 C21.6 -14.6 18.4 -18.4 15.4 -18.5 C15.2 -25 10.8 -31 3 -31 Z"
        fill="url(#gr-pelo)" stroke={TRACO} strokeWidth={1.3} strokeLinejoin="round" />
      <ellipse cx={1.4} cy={-7.4} rx={9.6} ry={6.2} fill={PELO_CLARO} opacity={0.5} />
      <path d="M-11.4 -17 l-1.6 2.4 M14.2 -17 l1.6 2.4 M-13.4 -9.6 l-1.2 2 M16.2 -9.6 l1.2 2" stroke="#5F8C1E" strokeWidth={0.8} strokeLinecap="round" />
      {/* a barra branca do gorro, por cima da testa */}
      <rect x={-14} y={-30} width={31} height={6.6} rx={3.3} fill="url(#gr-pele-branca)" stroke={TRACO} strokeWidth={1.1} transform="rotate(-3 1.4 -27)" />
      <path d="M-10 -27 q2 -1.6 4 0 q2 -1.6 4 0 q2 -1.6 4 0 q2 -1.6 4 0 q2 -1.6 4 0" stroke="#C9C4BA" strokeWidth={0.6} fill="none" transform="rotate(-3 1.4 -27)" />
      {/* os olhos: amarelos, a pupila vermelha, a pálpebra pesada */}
      <path d="M-8.4 -14.4 Q-4.6 -19.4 -0.6 -15.4 Q-4.4 -12 -8.4 -14.4 Z M11.6 -14.4 Q7.8 -19.4 3.8 -15.4 Q7.6 -12 11.6 -14.4 Z" fill="#F6E24C" stroke={TRACO} strokeWidth={0.8} strokeLinejoin="round" />
      <g className="gr-pupilas">
        <circle cx={-3.6} cy={-15.2} r={1.5} fill="#C2261C" /><circle cx={7.6} cy={-15.2} r={1.5} fill="#C2261C" />
        <circle cx={-3.4} cy={-15.2} r={0.65} fill="#160808" /><circle cx={7.8} cy={-15.2} r={0.65} fill="#160808" />
      </g>
      <path d="M-8.4 -14.6 Q-4.6 -19.6 -0.6 -15.6 Q-4.4 -17 -8.4 -14.6 Z M11.6 -14.6 Q7.8 -19.6 3.8 -15.6 Q7.6 -17 11.6 -14.6 Z" fill="#7FAE2B" />
      {/* as sobrancelhas franzidas */}
      <path className="gr-sob e" d="M-10 -21 L-0.4 -16.6" stroke="#33520F" strokeWidth={2.3} strokeLinecap="round" />
      <path className="gr-sob d" d="M13 -21 L3.6 -16.6" stroke="#33520F" strokeWidth={2.3} strokeLinecap="round" />
      {/* o nariz arrebitado e o lábio comprido */}
      <path d="M-0.2 -11.2 Q1.6 -13.4 3.4 -11.2" stroke={TRACO} strokeWidth={1} fill="none" strokeLinecap="round" />
      <path d="M1.6 -10.4 V-6.8" stroke={TRACO} strokeWidth={0.7} strokeLinecap="round" />
      {/* a boca: o sorriso que dá a volta no rosto */}
      <g className="gr-boca sorriso">
        <path d="M-11 -10 Q-10.4 -6.8 -7.6 -6.2 Q1.6 -1.2 10.8 -6.2 Q13.6 -6.8 14.2 -10" stroke={TRACO} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        <path d="M-12.4 -8.4 Q-13 -10.4 -11.2 -11.6 M15.6 -8.4 Q16.2 -10.4 14.4 -11.6" stroke={TRACO} strokeWidth={0.8} fill="none" strokeLinecap="round" />
      </g>
      {/* rindo: a boca aberta, os dentes amarelados */}
      <g className="gr-boca riso">
        <path d="M-10.4 -9.4 Q1.6 -6.4 13.6 -9.4 Q11.4 0.4 1.6 0.6 Q-8.2 0.4 -10.4 -9.4 Z" fill="#3A0F12" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
        <path d="M-9.2 -8.6 Q1.6 -6 12.4 -8.6 L11.4 -6.4 Q1.6 -3.8 -8.2 -6.4 Z" fill="#F3EBC4" />
        <path d="M-4 -7 v2.4 M1.6 -6.4 v2.6 M7.2 -7 v2.4" stroke="#C9BE8C" strokeWidth={0.5} />
        <ellipse cx={1.6} cy={-1.8} rx={4} ry={1.5} fill="#D2555A" />
        <path d="M-12.2 -8.2 Q-12.8 -10.4 -11 -11.6 M15.4 -8.2 Q16 -10.4 14.2 -11.6" stroke={TRACO} strokeWidth={0.8} fill="none" strokeLinecap="round" />
      </g>
      {/* o «shhh» */}
      <g className="gr-boca bico">
        <ellipse cx={3.4} cy={-5.4} rx={1.8} ry={2.2} fill="#3A0F12" stroke={TRACO} strokeWidth={0.9} />
      </g>
    </g>
  );
});

// ── Na janela ───────────────────────────────────────────────────────────────

/** O rosto espiando por trás do vidro. Vai dentro do recorte do vidro. */
export function GrinchEspiando({ e }: { e: EstadoGrinch }) {
  return (
    <D {...VIDRO} className={cn('gr-espia', e.espiando && 'aparece')}>
      <g transform="translate(116 62.6) scale(.9)"><CabecaDoGrinch /></g>
    </D>
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
    <D x={VIDRO.x} y={VIDRO.y} w={VIDRO.w} h={VIDRO.h + 6} className="gr-janela-quebrada">
      <g transform={T_JANELA}>
        {quebrada && (
          <>
            {/* o que sobrou do vidro: um véu claro, com o buraco vazado */}
            <path d={`M76 30 H160 V94 H76 Z ${BURACO}`} fillRule="evenodd" fill="#DCEBFA" opacity={0.32} />
            <path d={BURACO} fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinejoin="round" />
            <path d={BURACO} fill="none" stroke="#7FA3D0" strokeWidth={0.6} strokeLinejoin="round" />
          </>
        )}
        <path d={TRINCAS} className={cn('gr-trincas', trincando && 'trincando')} pathLength={100}
          fill="none" stroke="#F4FAFF" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
        {quebrada && (
          <path d="M84 98 L88 94.6 L90 98 Z M96 98 L98.6 95.4 L101 98 Z M131 98 L134 94 L136.4 98 Z M146 98 L148 96 L150.6 98 Z" fill="#CFE3F7" stroke="#8FB3D9" strokeWidth={0.4} />
        )}
        {/* os cacos voando para dentro, só na hora */}
        {quebrada && e.fase === 'entra' && (
          <g className="gr-cacos-voando">
            {[[-30, 40], [-14, 70], [6, 80], [22, 60], [36, 30], [-40, 10], [44, 70], [60, 50], [14, 96]].map(([dx, dy], i) => (
              <path key={i} d="M118 72 l3 -4 l3 5 Z" fill="#DCEBFA" stroke="#8FB3D9" strokeWidth={0.4}
                style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${i * 0.03}s` }} />
            ))}
          </g>
        )}
      </g>
    </D>
  );
}

// ── O boneco (os pés são o 0,0) ─────────────────────────────────────────────

/** Uma junta: caixa de tamanho zero no ponto do encaixe. O que vai dentro gira em volta dele. */
function Junta({ c, x, y, children }: { c: string; x: number; y: number; children: React.ReactNode }) {
  return <div className={cn('gr-j', c)} style={{ left: x, top: y }}>{children}</div>;
}

/** O desenho de uma peça, a partir do encaixe dela. */
function S({ children }: { children: React.ReactNode }) {
  return <svg className="gr-s" width={1} height={1}>{children}</svg>;
}

/** Um braço: a manga vermelha, o punho branco e a mão de dedos compridos. */
function Braco({ lado }: { lado: 'f' | 't' }) {
  const manga = lado === 'f' ? CASACO : CASACO_TRAS;
  const pelo = lado === 'f' ? PELO : PELO_TRAS;
  return (
    <Junta c={`braco ${lado}`} x={lado === 'f' ? 5 : -4} y={-24}>
      <S><Tubo d="M0 0 V12.6" cor={manga} w={6} /></S>
      <Junta c={`ante ${lado}`} x={0} y={12.6}>
        <S>
          {/* os dedos, a palma, a manga e o punho de pelo */}
          <Tubo d="M-1.4 14.6 C-2.6 17.6 -3.8 19.6 -3.4 22.6" cor={pelo} w={1.5} />
          <Tubo d="M-0.2 15.4 C-0.6 18.6 -1.4 21 -0.6 24.4" cor={pelo} w={1.5} />
          <Tubo d="M1 15.4 C1.4 18.6 1 21 2 24" cor={pelo} w={1.5} />
          <Tubo d="M2.2 14.6 C3.4 17.2 3.6 19.4 4.8 21.6" cor={pelo} w={1.5} />
          <Tubo d="M2.6 12.6 C4.4 13.4 5.4 14.6 6.2 16.6" cor={pelo} w={1.5} />
          <circle cx={0.4} cy={13.6} r={2.9} fill={pelo} stroke={TRACO} strokeWidth={1.1} />
          <Tubo d="M0 0 V8.6" cor={manga} w={5.6} />
          <ellipse cx={0} cy={10} rx={4.6} ry={2.9} fill="url(#gr-pele-branca)" stroke={TRACO} strokeWidth={1.1} />
        </S>
      </Junta>
    </Junta>
  );
}

/** Uma perna: fina e peluda, o pé comprido de bico virado. */
function Perna({ lado }: { lado: 'f' | 't' }) {
  const pelo = lado === 'f' ? PELO : PELO_TRAS;
  return (
    <Junta c={`coxa ${lado}`} x={lado === 'f' ? 2.6 : -2.6} y={-36}>
      <S>
        <Tubo d="M0 0 V17" cor={pelo} w={4.6} />
        <path d="M-2.3 6 l-1.6 1.4 M2.3 10 l1.6 1.4" stroke={TRACO} strokeWidth={0.8} strokeLinecap="round" />
      </S>
      <Junta c={`canela ${lado}`} x={0} y={17}>
        <S>
          <Tubo d="M0 0 V15.4 C3.6 15 8.4 16 12 17.2 C14.4 17.6 15.2 15.6 13.6 14" cor={pelo} w={3.8} />
          <circle cx={0} cy={0} r={2.7} fill={pelo} stroke={TRACO} strokeWidth={1.1} />
          <path d="M-1.9 7 l-1.6 1.4 M1.9 4.6 l1.6 1.4" stroke={TRACO} strokeWidth={0.8} strokeLinecap="round" />
        </S>
      </Junta>
    </Junta>
  );
}

/** O tronco: o quadril peludo, o casaco de Papai Noel curto, o cinto, a barra e a gola de pelo. O 0,0 é o quadril. */
const Tronco = memo(function Tronco() {
  return (
    <S>
      <ellipse cx={0.6} cy={-1.6} rx={9} ry={6.6} fill="url(#gr-pelo)" stroke={TRACO} strokeWidth={1.2} />
      {/* o pescoço fino */}
      <path d="M-1.8 -25 L-1 -32 H3.6 L4.4 -25 Z" fill={PELO} stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
      {/* o casaco: ombros estreitos, barriga de pera */}
      <path d="M-5.4 -27 C-10.4 -23 -13.6 -14.6 -12.6 -5.6 L14.6 -5.6 C16.2 -14 12.6 -23.6 8 -27 Z" fill="url(#gr-casaco)" stroke={TRACO} strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M-6 -23.6 C-9.4 -19.6 -10.6 -14.6 -10.2 -9.6" stroke="#F58A7E" strokeWidth={1.4} fill="none" strokeLinecap="round" opacity={0.7} />
      {/* a frente de pelo branco e o cinto com fivela */}
      <path d="M1.6 -26.4 Q5 -16 4 -6.4 L7.4 -6.4 Q8.4 -16 5.2 -26.4 Z" fill="url(#gr-pele-branca)" stroke={TRACO} strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M-13 -14.6 Q1 -11.4 15.4 -14.6 L15.2 -10.4 Q1 -7.2 -12.8 -10.4 Z" fill="#1B1B1B" />
      <rect x={2.4} y={-14.2} width={6.4} height={5.6} rx={0.9} fill="none" stroke="#E7B649" strokeWidth={1.5} />
      {/* a barra de pelo, recortada */}
      <path d="M-13.4 -7.6 Q-11.1 -10.2 -8.8 -7.6 Q-6.5 -10.2 -4.2 -7.6 Q-1.9 -10.2 0.4 -7.6 Q2.7 -10.2 5 -7.6 Q7.3 -10.2 9.6 -7.6 Q11.9 -10.2 14.2 -7.6 Q16.6 -5.4 14.4 -3.2 Q11.9 -0.8 9.6 -3 Q7.3 -0.8 5 -3 Q2.7 -0.8 0.4 -3 Q-1.9 -0.8 -4.2 -3 Q-6.5 -0.8 -8.8 -3 Q-11.1 -0.8 -13.4 -3.2 Q-15.4 -5.4 -13.4 -7.6 Z"
        fill="url(#gr-pele-branca)" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
      {/* a gola */}
      <path d="M-7 -27.4 Q-4.4 -31 -1.2 -28.6 Q1.6 -31.6 4.4 -28.6 Q7.6 -31 9.6 -27.2 Q6.6 -24 1.2 -24.6 Q-4.2 -24 -7 -27.4 Z" fill="url(#gr-pele-branca)" stroke={TRACO} strokeWidth={1} strokeLinejoin="round" />
    </S>
  );
});

/**
 * O Grinch de corpo inteiro. Nasce escondido; quem mostra, move e muda a pose
 * é a gravação, direto no elemento (`aplicarNoGrinch`, em `gravacao.ts`): os
 * atributos `data-pose`, `data-cara`, `data-anda`, `data-salto`, `data-olha`.
 * O React não toca nesses atributos, então nada aqui é redesenhado no meio.
 * `data-nao-pausa`: ele anda junto com um relógio, não pode congelar no meio.
 */
export const Grinch = memo(forwardRef<HTMLDivElement>(function Grinch(_, ref) {
  return (
    <div ref={ref} className="gr" data-nao-pausa>
      <svg className="gr-s gr-sombra" width={1} height={1}><ellipse cx={0} cy={0.6} rx={19} ry={2.6} fill="#000" opacity={0.2} /></svg>
      <div className="gr-y">
        <div className="gr-vira">
          <div className="gr-bob">
            <Perna lado="t" />
            <Perna lado="f" />
            <Junta c="tronco" x={0} y={-36}>
              <Braco lado="t" />
              <Tronco />
              <Junta c="cab" x={1.4} y={-30}>
                <S><CabecaDoGrinch /></S>
              </Junta>
              <Braco lado="f" />
            </Junta>
          </div>
        </div>
      </div>
    </div>
  );
}));

/** A nuvem de fuligem na boca da lareira, quando ele entra ou sai pela chaminé. */
export function Fuligem({ e }: { e: EstadoGrinch }) {
  if (e.via !== 'chamine' || (e.fase !== 'entra' && e.fase !== 'sai')) return null;
  return (
    <D x={266} y={112} w={68} h={62} className="gr-fuligem" key={e.fase}>
      {[[300, 140, 16], [286, 150, 12], [314, 150, 13], [300, 156, 14], [292, 130, 9], [310, 132, 10]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#3B3533" style={{ animationDelay: `${i * 0.04}s` }} />
      ))}
    </D>
  );
}
