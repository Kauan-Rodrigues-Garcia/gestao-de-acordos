/**
 * O quebra-nozes — o desenho do boneco.
 *
 * Pedido do Cleber (12/11/2026): o diretor e os heads viram quebra-nozes, com
 * a foto do perfil no lugar do rosto, e aparecem para a cidade inteira ao
 * mesmo tempo. «Animações muito detalhadas, naturais», e cada aparição com
 * cara de coisa viva.
 *
 * Por que quebra-nozes: a cabeça dele já é uma peça separada, então a foto
 * entra sem parecer montagem; e é um soldado de desfile, digno, que combina
 * com quem comanda.
 *
 * ## Como é montado
 *
 * Boneco articulado, no molde do Grinch (`chale/grinch/Grinch.tsx`), só que de
 * frente (a foto olha para a frente). Cada junta é uma caixa HTML de tamanho
 * zero no ponto do encaixe; a peça é desenhada a partir dali. Uma pose é um
 * conjunto de ângulos em variáveis CSS (`quebraNozes.css`), e trocar de pose é
 * transição de `transform` — a placa de vídeo faz sozinha.
 *
 * O que dá vida são as peças soltas, cada uma com a sua mola: o chapéu segue a
 * cabeça com atraso, a pluma segue o chapéu com mais atraso ainda, a medalha
 * fica na vertical quando o tronco inclina e balança até parar, as franjas das
 * dragonas acompanham os braços. Ninguém calcula isso por quadro: é a mesma
 * transição, mais lenta e com sobra.
 *
 * Dentro de cada junta há uma caixa «-m» para o movimento que se repete
 * (marcha, fala, aceno): a pose gira a junta, o laço mexe a caixa de dentro, e
 * um não apaga o outro. Uma animação da família `transform` por elemento, e
 * nenhuma dentro de SVG (`natal-desempenho-medido-1011`).
 *
 * O 0,0 são os pés.
 */
import { forwardRef, memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { FARDAS, type Artista, type Emblema, type NomeFarda } from './elenco';
import './quebraNozes.css';

const TRACO = '#2B1B12';
const OURO = '#F2C04E';
const OURO_ESCURO = '#B98522';
const BRANCO = '#F8F4EC';
const MADEIRA = '#E7BE93';
const BOTA = '#1C1C22';

/** Os degradês, uma vez só por página. Vão num SVG de tamanho zero dentro do palco. */
export const DefsDoQuebraNozes = memo(function DefsDoQuebraNozes() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {(Object.keys(FARDAS) as NomeFarda[]).map(nome => (
          <linearGradient key={nome} id={`qn-g-casaco-${nome}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={FARDAS[nome].claro} />
            <stop offset=".34" stopColor={FARDAS[nome].casaco} />
            <stop offset="1" stopColor={FARDAS[nome].escuro} />
          </linearGradient>
        ))}
        <linearGradient id="qn-g-chapeu" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4A4A5E" /><stop offset=".3" stopColor="#262633" /><stop offset="1" stopColor="#111118" />
        </linearGradient>
        <linearGradient id="qn-g-ouro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE596" /><stop offset=".5" stopColor={OURO} /><stop offset="1" stopColor={OURO_ESCURO} />
        </linearGradient>
        <radialGradient id="qn-g-madeira" cx=".38" cy=".32" r=".8">
          <stop offset="0" stopColor="#F6D9B4" /><stop offset="1" stopColor="#D9A877" />
        </radialGradient>
        <linearGradient id="qn-g-branco" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#DAD5CB" />
        </linearGradient>
        <linearGradient id="qn-g-bota" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4B4B58" /><stop offset=".35" stopColor={BOTA} /><stop offset="1" stopColor="#0B0B0F" />
        </linearGradient>
      </defs>
    </svg>
  );
});

/** Uma junta: caixa de tamanho zero no ponto do encaixe. O que vai dentro gira em volta dele. */
function J({ c, x, y, children }: { c: string; x: number; y: number; children: React.ReactNode }) {
  return <div className={cn('qn-j', c)} style={{ left: x, top: y }}>{children}</div>;
}
/** A caixa do movimento que se repete, dentro da junta. */
function M({ c, children }: { c: string; children: React.ReactNode }) {
  return <div className={cn('qn-m', c)}>{children}</div>;
}
/** O desenho de uma peça, a partir do encaixe dela. */
function S({ children, c }: { children: React.ReactNode; c?: string }) {
  return <svg className={cn('qn-s', c)} width={1} height={1}>{children}</svg>;
}
/** Um traço com contorno: o escuro por baixo, a cor por cima. */
function Tubo({ d, cor, w }: { d: string; cor: string; w: number }) {
  return (
    <>
      <path d={d} stroke={TRACO} strokeWidth={w + 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={d} stroke={cor} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}
/** Uma coisa que ele segura ou veste: nasce escondida, e a deixa mostra (`trocarItem`). */
function Item({ onde, item, c, children }: { onde: 'd' | 'e' | 'peito' | 'chapeu'; item: string; c?: string; children: React.ReactNode }) {
  return <div className={cn('qn-item', c)} data-onde={onde} data-item={item}>{children}</div>;
}

// ── O que ele leva na mão (o 0,0 é a mão; o braço continua para +y) ─────────

function ItensDeMao({ lado }: { lado: 'd' | 'e' }) {
  return (
    <>
      <Item onde={lado} item="bastao">
        <S>
          <Tubo d="M0 15 V-41" cor="#7A4A22" w={2.4} />
          <path d="M-2.4 -40 q-3 5 -1 10 M2.4 -40 q3 5 1 10" stroke="#D42C30" strokeWidth={1.3} fill="none" strokeLinecap="round" />
          <circle cx={0} cy={-44} r={4.8} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1} />
          <circle cx={-1.4} cy={-45.6} r={1.2} fill="#FFF6CF" />
          <rect x={-2.1} y={12} width={4.2} height={4.6} rx={1} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.8} />
        </S>
      </Item>
      <Item onde={lado} item="sino">
        <S>
          <rect x={-1.6} y={-8} width={3.2} height={10} rx={1.4} fill="#8A5A2B" stroke={TRACO} strokeWidth={0.9} />
          <path d="M-8.4 14 Q-8 2.4 0 1.6 Q8 2.4 8.4 14 Q0 16.6 -8.4 14 Z" fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M-5.4 11 Q-5 5 -1.6 3.6" stroke="#FFF6CF" strokeWidth={1.2} fill="none" strokeLinecap="round" />
          <circle cx={0} cy={17} r={2.2} fill={OURO_ESCURO} stroke={TRACO} strokeWidth={0.9} />
        </S>
      </Item>
      <Item onde={lado} item="corneta">
        <S>
          <path d="M3 2 V12 L6.6 9.4 L10.2 12 V2 Z" fill="#D42C30" stroke={TRACO} strokeWidth={0.8} strokeLinejoin="round" />
          <ellipse cx={7} cy={2.4} rx={5.4} ry={2.6} fill="none" stroke={TRACO} strokeWidth={3.4} />
          <ellipse cx={7} cy={2.4} rx={5.4} ry={2.6} fill="none" stroke={OURO} strokeWidth={1.8} />
          <Tubo d="M-4 0 H15" cor={OURO} w={2.2} />
          <path d="M14 -2 Q21 -3.4 24.6 -9 V9 Q21 3.4 14 2 Z" fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
          <rect x={-6} y={-1.8} width={3} height={3.6} rx={1} fill={OURO_ESCURO} stroke={TRACO} strokeWidth={0.8} />
        </S>
      </Item>
      <Item onde={lado} item="luneta">
        <S>
          <rect x={-6} y={-3} width={13} height={6} rx={1} fill="#5B3A1C" stroke={TRACO} strokeWidth={1} />
          <rect x={6.4} y={-3.7} width={9.6} height={7.4} rx={1} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1} />
          <rect x={15.4} y={-4.4} width={7} height={8.8} rx={1.2} fill="#5B3A1C" stroke={TRACO} strokeWidth={1} />
          <path d="M22.4 -3.4 V3.4" stroke="#BFE6FF" strokeWidth={1.4} strokeLinecap="round" />
        </S>
      </Item>
      <Item onde={lado} item="xicara">
        <S>
          <path d="M-2.4 -17 q-2.4 -3 0 -5.6 q2.4 -2.6 0 -5.6 M3 -17.6 q-2 -2.6 0 -5" stroke="#FFFFFF" strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.85} />
          <path d="M6 -11.4 q5.4 0 5.4 4 q0 4 -5.4 4" fill="none" stroke={TRACO} strokeWidth={3.2} />
          <path d="M6 -11.4 q5.4 0 5.4 4 q0 4 -5.4 4" fill="none" stroke="#D42C30" strokeWidth={1.6} />
          <path d="M-7 -14 H7 L6 -3.4 Q6 -1.6 4 -1.6 H-4 Q-6 -1.6 -6 -3.4 Z" fill="#D42C30" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M-6.6 -10.6 H6.6" stroke="#FFFFFF" strokeWidth={1.6} />
          <ellipse cx={0} cy={-14} rx={7} ry={2.1} fill="#6B3E20" stroke={TRACO} strokeWidth={1} />
          <circle cx={-2} cy={-14.4} r={1.5} fill="#FFFFFF" /><circle cx={2.2} cy={-13.8} r={1.3} fill="#FFFFFF" />
        </S>
      </Item>
      <Item onde={lado} item="noz">
        <S>
          <ellipse cx={0} cy={-6} rx={5.6} ry={6.4} fill="#A9773F" stroke={TRACO} strokeWidth={1.1} />
          <path d="M0 -12.2 V0.2 M-3.4 -9 q1.6 3 0 6 M3.4 -9 q-1.6 3 0 6" stroke="#6E4A22" strokeWidth={0.8} fill="none" strokeLinecap="round" />
          <path d="M-3.4 -9.6 q1 -1.6 2.4 -1.8" stroke="#D9AE77" strokeWidth={1} fill="none" strokeLinecap="round" />
        </S>
      </Item>
      <Item onde={lado} item="relogio">
        <S>
          <path d="M0 0 Q-3 -3 0 -4" stroke={OURO_ESCURO} strokeWidth={1} fill="none" />
          <rect x={-1.2} y={-15.6} width={2.4} height={2.6} rx={0.8} fill={OURO_ESCURO} stroke={TRACO} strokeWidth={0.7} />
          <circle cx={0} cy={-7.6} r={6} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1.1} />
          <circle cx={0} cy={-7.6} r={4.3} fill="#FFFDF4" stroke={OURO_ESCURO} strokeWidth={0.6} />
          <path d="M0 -7.6 V-10.6 M0 -7.6 L2.2 -6.4" stroke={TRACO} strokeWidth={0.9} strokeLinecap="round" />
        </S>
      </Item>
      <Item onde={lado} item="baqueta">
        <S>
          <Tubo d="M0 -2 V17" cor="#EBCB9E" w={1.7} />
          <circle cx={0} cy={18.4} r={2.3} fill="#F4DDB8" stroke={TRACO} strokeWidth={0.9} />
        </S>
      </Item>
    </>
  );
}

// ── Os membros ──────────────────────────────────────────────────────────────

/** Um braço: a manga da farda, o punho dourado e a luva branca. `e` é o da esquerda da tela. */
function Braco({ lado, farda }: { lado: 'e' | 'd'; farda: NomeFarda }) {
  const s = lado === 'e' ? -1 : 1;
  const manga = FARDAS[farda].casaco;
  return (
    <J c={`braco ${lado}`} x={18.5 * s} y={-36}>
      <M c={`qn-bal ${lado}`}>
        <S><Tubo d="M0 0 V17" cor={manga} w={8.2} /></S>
        <J c={`ante ${lado}`} x={0} y={17}>
          <M c={`qn-ante-m ${lado}`}>
            <S>
              <Tubo d="M0 0 V12" cor={manga} w={7.6} />
              <path d={`M${-2.6 * s} 1 V10`} stroke={FARDAS[farda].claro} strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
              <rect x={-5} y={8.6} width={10} height={4.8} rx={1.4} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1} />
              <circle cx={3.9 * s} cy={16.4} r={2.1} fill={BRANCO} stroke={TRACO} strokeWidth={0.9} />
              <circle cx={0} cy={18} r={4.9} fill="url(#qn-g-branco)" stroke={TRACO} strokeWidth={1.1} />
              <path d="M-1.8 20.4 v2 M0.4 20.8 v2 M2.4 20.2 v1.8" stroke="#BEB8AB" strokeWidth={0.6} strokeLinecap="round" />
            </S>
            <J c={`mao ${lado}`} x={0} y={18}>
              <M c={`qn-mao-m ${lado}`}><ItensDeMao lado={lado} /></M>
            </J>
          </M>
        </J>
      </M>
    </J>
  );
}

/** Uma perna: a calça clara de listra dourada e a bota. De frente, o passo é a perna que encolhe. */
function Perna({ lado }: { lado: 'e' | 'd' }) {
  const s = lado === 'e' ? -1 : 1;
  return (
    <J c={`perna ${lado}`} x={6.6 * s} y={-40}>
      <M c={`qn-perna-m ${lado}`}>
        <S>
          <Tubo d="M0 1 V24" cor="#F3EDE0" w={9.2} />
          <path d={`M${3 * s} 3 V23`} stroke={OURO} strokeWidth={1.3} strokeLinecap="round" />
          <ellipse cx={1.2 * s} cy={37} rx={7.8} ry={3.6} fill={BOTA} stroke={TRACO} strokeWidth={1} />
          <path d="M-5.8 22 H5.8 V35 Q5.8 38.6 0 38.6 Q-5.8 38.6 -5.8 35 Z" fill="url(#qn-g-bota)" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M-5.8 23.4 H5.8" stroke={OURO} strokeWidth={1.5} />
          <path d="M-3.4 26 V33" stroke="#7B7B8C" strokeWidth={1.1} strokeLinecap="round" />
        </S>
      </M>
    </J>
  );
}

/** O tronco: a farda de frente, com os alamares, o cinto e a gola. O 0,0 é o quadril. */
const Tronco = memo(function Tronco({ farda }: { farda: NomeFarda }) {
  const f = FARDAS[farda];
  return (
    <S>
      {/* a barra do casaco, por cima do alto das pernas */}
      <path d="M-14 -11 L-17.6 6.4 Q0 10.4 17.6 6.4 L14 -11 Z" fill={`url(#qn-g-casaco-${farda})`} stroke={TRACO} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M0 -10 V8.4" stroke={f.escuro} strokeWidth={1.2} />
      <path d="M-17 5 Q0 9 17 5" stroke={OURO} strokeWidth={1.4} fill="none" />
      {/* o peito */}
      <path d="M-17.6 -35 Q-18 -40.6 -12.6 -40.6 H12.6 Q18 -40.6 17.6 -35 L14.4 -10 H-14.4 Z" fill={`url(#qn-g-casaco-${farda})`} stroke={TRACO} strokeWidth={1.2} strokeLinejoin="round" />
      {/* os alamares: o pano escuro do meio, os cordões e os botões */}
      <path d="M-7 -39.6 H7 L6 -13.4 H-6 Z" fill={f.escuro} />
      {[-34.6, -28.6, -22.6, -16.6].map(y => (
        <g key={y}>
          <path d={`M-10.6 ${y} H10.6`} stroke={OURO_ESCURO} strokeWidth={2.4} strokeLinecap="round" />
          <path d={`M-10.6 ${y} H10.6`} stroke={OURO} strokeWidth={1.3} strokeLinecap="round" />
          <circle cx={0} cy={y} r={1.9} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.6} />
        </g>
      ))}
      {/* o cinto */}
      <path d="M-14.7 -13.4 H14.7 L14.2 -8.4 H-14.2 Z" fill="#17171C" stroke={TRACO} strokeWidth={0.9} strokeLinejoin="round" />
      <rect x={-4} y={-14.4} width={8} height={7} rx={1.2} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.9} />
      <rect x={-1.7} y={-12.4} width={3.4} height={3} rx={0.6} fill="#17171C" />
      {/* a gola */}
      <path d="M-9.4 -41 Q0 -35 9.4 -41 L9.4 -44 Q0 -39.4 -9.4 -44 Z" fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1} strokeLinejoin="round" />
    </S>
  );
});

function Dragona({ lado }: { lado: 'e' | 'd' }) {
  const s = lado === 'e' ? -1 : 1;
  return (
    <div className="qn-m" style={{ left: 18.4 * s, top: -39 }}>
      <J c={`franja ${lado}`} x={0} y={0}>
        <S>
          <path d={`M${-5 * s} 1 v6 M${-2.4 * s} 1.6 v6.4 M${0.2 * s} 1.8 v6.6 M${2.8 * s} 1.6 v6.4 M${5.4 * s} 1 v6`} stroke={TRACO} strokeWidth={2.6} strokeLinecap="round" />
          <path d={`M${-5 * s} 1 v6 M${-2.4 * s} 1.6 v6.4 M${0.2 * s} 1.8 v6.6 M${2.8 * s} 1.6 v6.4 M${5.4 * s} 1 v6`} stroke={OURO} strokeWidth={1.5} strokeLinecap="round" />
        </S>
      </J>
      <S><ellipse cx={0.6 * s} cy={0} rx={8} ry={3.7} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1.1} /></S>
    </div>
  );
}

// ── A cabeça (o 0,0 é o pescoço) ────────────────────────────────────────────

const EMBLEMAS: Record<Emblema, React.ReactNode> = {
  estrela: <path d="M0 -20.4 L1.7 -15.6 L6.7 -15.6 L2.7 -12.6 L4.2 -7.8 L0 -10.7 L-4.2 -7.8 L-2.7 -12.6 L-6.7 -15.6 L-1.7 -15.6 Z" fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.8} strokeLinejoin="round" />,
  floco: (
    <g stroke={TRACO} strokeLinecap="round">
      <path d="M0 -20 V-8 M-5.2 -17 L5.2 -11 M5.2 -17 L-5.2 -11" strokeWidth={3} />
      <path d="M0 -20 V-8 M-5.2 -17 L5.2 -11 M5.2 -17 L-5.2 -11" strokeWidth={1.6} stroke="#EAF5FF" />
      <circle cx={0} cy={-14} r={1.6} fill="#EAF5FF" strokeWidth={0.7} />
    </g>
  ),
  pinheiro: (
    <g strokeLinejoin="round">
      <rect x={-1.1} y={-9.6} width={2.2} height={2.6} fill="#7A4A22" stroke={TRACO} strokeWidth={0.7} />
      <path d="M0 -21 L4 -15.8 H2.2 L5.6 -11.4 H3.4 L6.6 -8.6 H-6.6 L-3.4 -11.4 H-5.6 L-2.2 -15.8 H-4 Z" fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.8} />
    </g>
  ),
};

/** O rosto de madeira: fica por baixo da foto, e é ele que aparece em quem ainda não tem foto. */
const RostoDeMadeira = memo(function RostoDeMadeira() {
  return (
    <S>
      <circle cx={-15.4} cy={-20} r={4.8} fill="#E8756B" opacity={0.5} />
      <circle cx={15.4} cy={-20} r={4.8} fill="#E8756B" opacity={0.5} />
      <ellipse cx={-9} cy={-30} rx={4.6} ry={5.4} fill="#FFFFFF" stroke={TRACO} strokeWidth={1} />
      <ellipse cx={9} cy={-30} rx={4.6} ry={5.4} fill="#FFFFFF" stroke={TRACO} strokeWidth={1} />
      <circle cx={-8.4} cy={-29.4} r={2.8} fill="#3F7FC4" /><circle cx={9.6} cy={-29.4} r={2.8} fill="#3F7FC4" />
      <circle cx={-8.4} cy={-29.4} r={1.3} fill="#10131A" /><circle cx={9.6} cy={-29.4} r={1.3} fill="#10131A" />
      <circle cx={-9.4} cy={-30.6} r={0.8} fill="#FFFFFF" /><circle cx={8.6} cy={-30.6} r={0.8} fill="#FFFFFF" />
      <path d="M-15.4 -37.6 Q-9.4 -41.4 -3.6 -37.4 M15.4 -37.6 Q9.4 -41.4 3.6 -37.4" stroke="#1E1A1A" strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <ellipse cx={0} cy={-22.6} rx={3.1} ry={3.7} fill="#D29C6B" stroke={TRACO} strokeWidth={0.8} />
      <path d="M0 -16.4 C-5 -20.6 -13 -19 -17.4 -13.6 C-12 -16 -6 -13.6 0 -14.6 C6 -13.6 12 -16 17.4 -13.6 C13 -19 5 -20.6 0 -16.4 Z" fill="#1E1A1A" stroke={TRACO} strokeWidth={0.6} strokeLinejoin="round" />
    </S>
  );
});

function Cabeca({ artista }: { artista: Artista }) {
  const f = FARDAS[artista.farda];
  // Foto que não carrega (apagada, sem rede): fica o rosto de madeira.
  const [quebrada, setQuebrada] = useState<string | null>(null);
  const foto = artista.foto && artista.foto !== quebrada ? artista.foto : null;
  return (
    <M c="qn-gesto">
      <M c="qn-nod">
        {/* o cabelo branco, atrás, e a cabeça de madeira */}
        <S>
          <path d="M-24 -26 q-7.6 0.6 -6.4 7.4 q-3.6 4.4 0.6 8.6 q-1 6.4 5.6 7 q4 3.4 8.2 -0.4 Z M24 -26 q7.6 0.6 6.4 7.4 q3.6 4.4 -0.6 8.6 q1 6.4 -5.6 7 q-4 3.4 -8.2 -0.4 Z"
            fill="url(#qn-g-branco)" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
          <circle cx={0} cy={-28} r={26.6} fill="url(#qn-g-madeira)" stroke={TRACO} strokeWidth={1.3} />
        </S>
        <RostoDeMadeira />
        {foto && (
          <div className="qn-foto">
            <img src={foto} alt="" draggable={false} decoding="async" onError={() => setQuebrada(foto)} />
          </div>
        )}
        {/* o aro por cima da borda da foto */}
        <S><circle cx={0} cy={-28} r={25.6} fill="none" stroke="#C99866" strokeWidth={1.6} /></S>
        {/* a boca: o vão escuro, e a mandíbula que desce na frente dele */}
        <S><rect x={-9.6} y={-9} width={19.2} height={10.4} rx={2} fill="#2A0C10" /></S>
        <M c="qn-queixo">
          <M c="qn-queixo-m">
            <S>
              <path d="M-8.4 2 Q-10 9 0 14.6 Q10 9 8.4 2 Q0 5.6 -8.4 2 Z" fill="url(#qn-g-branco)" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
              <path d="M-3.4 6 q0.6 3 3.4 5 M3.4 6 q-0.6 3 -3.4 5" stroke="#BEB8AB" strokeWidth={0.7} fill="none" strokeLinecap="round" />
              <path d="M-11.6 -9.4 H11.6 Q12.8 -9.4 12.8 -8.2 V-1 Q12.8 3 8.4 3 H-8.4 Q-12.8 3 -12.8 -1 V-8.2 Q-12.8 -9.4 -11.6 -9.4 Z" fill={MADEIRA} stroke={TRACO} strokeWidth={1.2} strokeLinejoin="round" />
              <rect x={-8.8} y={-8.2} width={17.6} height={4.4} rx={1.1} fill="#FFFFFF" stroke="#8D7A66" strokeWidth={0.7} />
              <path d="M-4.4 -8.2 v4.4 M0 -8.2 v4.4 M4.4 -8.2 v4.4" stroke="#B9A894" strokeWidth={0.6} />
              <path d="M-9.6 -1.4 Q0 1.6 9.6 -1.4" stroke="#C99866" strokeWidth={0.9} fill="none" strokeLinecap="round" />
            </S>
          </M>
        </M>
        {/* o chapéu, que segue a cabeça com atraso; e a pluma, que segue o chapéu */}
        <J c="chapeu" x={0} y={-45}>
          <M c="qn-chapeu-m">
            <J c="pluma" x={0} y={-34}>
              <M c="qn-pluma-m">
                <S>
                  <path d="M0 1 C-9.6 -3 -10.4 -17 0 -24 C10.4 -17 9.6 -3 0 1 Z" fill={f.pluma} stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
                  <path d="M0 -1 V-20 M0 -6 l-4.6 -3.4 M0 -6 l4.6 -3.4 M0 -11.6 l-4.4 -3.2 M0 -11.6 l4.4 -3.2" stroke={f.plumaSombra} strokeWidth={0.9} fill="none" strokeLinecap="round" />
                  <circle cx={0} cy={1} r={2.7} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.9} />
                </S>
              </M>
            </J>
            <S>
              <path d="M-21.6 0 L-24.4 -31 Q0 -37.4 24.4 -31 L21.6 0 Q0 5.6 -21.6 0 Z" fill="url(#qn-g-chapeu)" stroke={TRACO} strokeWidth={1.3} strokeLinejoin="round" />
              <ellipse cx={0} cy={-32.4} rx={24.4} ry={4.3} fill="#3D3D4F" stroke={TRACO} strokeWidth={1.1} />
              <path d="M-19.6 -6 L-21.4 -27" stroke="#7C7C92" strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
              <path d="M-23.6 -24 Q0 -13 23.6 -24" stroke={OURO_ESCURO} strokeWidth={2.4} fill="none" strokeLinecap="round" />
              <path d="M-23.6 -24 Q0 -13 23.6 -24" stroke={OURO} strokeWidth={1.2} fill="none" strokeLinecap="round" />
              {EMBLEMAS[artista.emblema]}
              <path d="M-21.7 -0.4 Q0 5.2 21.7 -0.4 L22.3 -6.6 Q0 -1 -22.3 -6.6 Z" fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={1} strokeLinejoin="round" />
              <path d="M-19.4 1.4 Q0 10.4 19.4 1.4 Q0 5.8 -19.4 1.4 Z" fill="#101016" stroke={TRACO} strokeWidth={1} strokeLinejoin="round" />
              <path d="M-12 4.6 Q0 8 12 4.6" stroke="#6C6C80" strokeWidth={0.9} fill="none" strokeLinecap="round" />
            </S>
            {/* o enfeite do dia, no chapéu */}
            <Item onde="chapeu" item="azevinho">
              <S>
                <path d="M-15 -5 q-7 -4.4 -11 1 q5.4 4.4 11 -1 Z M-15 -5 q-2.4 -7.6 4 -10.4 q3.4 6.4 -4 10.4 Z" fill="#1F8F5A" stroke={TRACO} strokeWidth={0.9} strokeLinejoin="round" />
                <circle cx={-15.6} cy={-3.4} r={2.3} fill="#E5403A" stroke={TRACO} strokeWidth={0.8} />
                <circle cx={-12} cy={-5.4} r={2.1} fill="#E5403A" stroke={TRACO} strokeWidth={0.8} />
                <circle cx={-14.6} cy={-7.2} r={1.9} fill="#F36A5E" stroke={TRACO} strokeWidth={0.8} />
              </S>
            </Item>
            <Item onde="chapeu" item="estrela">
              <S>
                <path d="M16 -13 L17.6 -8.8 L22 -8.6 L18.6 -5.8 L19.8 -1.6 L16 -4 L12.2 -1.6 L13.4 -5.8 L10 -8.6 L14.4 -8.8 Z" fill="#FFE596" stroke={TRACO} strokeWidth={0.9} strokeLinejoin="round" />
                <path d="M24 -14 v3 M22.5 -12.5 h3" stroke="#FFF6CF" strokeWidth={1} strokeLinecap="round" />
              </S>
            </Item>
            <Item onde="chapeu" item="floco">
              <S>
                <g stroke={TRACO} strokeLinecap="round"><path d="M15 -13 V-1 M9.8 -10 L20.2 -4 M20.2 -10 L9.8 -4" strokeWidth={3} /></g>
                <path d="M15 -13 V-1 M9.8 -10 L20.2 -4 M20.2 -10 L9.8 -4" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" />
              </S>
            </Item>
            <Item onde="chapeu" item="sininho">
              <S>
                <path d="M20.6 -3 q3.4 1.6 2.4 5" stroke={TRACO} strokeWidth={1} fill="none" />
                <path d="M19 7.6 Q19.2 2 23 1.6 Q26.8 2 27 7.6 Q23 9 19 7.6 Z" fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.9} strokeLinejoin="round" />
                <circle cx={23} cy={9.2} r={1.2} fill={OURO_ESCURO} stroke={TRACO} strokeWidth={0.7} />
              </S>
            </Item>
          </M>
        </J>
      </M>
    </M>
  );
}

// ── O que ele leva na frente do corpo (o 0,0 é o quadril) ───────────────────

function ItensDePeito() {
  return (
    <>
      <Item onde="peito" item="pergaminho" c="qn-pergaminho">
        <S>
          <path d="M-15.4 -30 H15.4 V3 Q8 5.6 0 3 Q-8 0.4 -15.4 3 Z" fill="#FBF3D9" stroke={TRACO} strokeWidth={1.1} strokeLinejoin="round" />
          <path d="M-11 -24 H11 M-11 -19.6 H8 M-11 -15.2 H11 M-11 -10.8 H6 M-11 -6.4 H9" stroke="#B9A57A" strokeWidth={1.1} strokeLinecap="round" />
          <circle cx={10} cy={-2.4} r={3} fill="#D42C30" stroke={TRACO} strokeWidth={0.8} />
          <rect x={-18.4} y={-34.4} width={36.8} height={6} rx={3} fill="#EFDDAE" stroke={TRACO} strokeWidth={1.1} />
          <circle cx={-19.4} cy={-31.4} r={2.5} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.8} />
          <circle cx={19.4} cy={-31.4} r={2.5} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.8} />
        </S>
      </Item>
      <Item onde="peito" item="tambor">
        <S>
          <Tubo d="M-15 -38 L12 -15" cor="#F3EDE0" w={2.6} />
          <path d="M-16 -15 V2 Q0 8.6 16 2 V-15 Z" fill="#C8332F" stroke={TRACO} strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M-16 -9 L-10 2.6 L-4 -8 L2 4 L8 -8 L14 2.6 L16 -3" stroke="#F8F4EC" strokeWidth={1.1} fill="none" strokeLinejoin="round" />
          <path d="M-16 1.4 Q0 8 16 1.4" stroke={TRACO} strokeWidth={4} fill="none" />
          <path d="M-16 1.4 Q0 8 16 1.4" stroke={OURO} strokeWidth={2.2} fill="none" />
          <ellipse cx={0} cy={-15} rx={16} ry={5} fill="#FBF6E9" stroke={TRACO} strokeWidth={3.6} />
          <ellipse cx={0} cy={-15} rx={16} ry={5} fill="#FBF6E9" stroke={OURO} strokeWidth={2} />
        </S>
      </Item>
      <Item onde="peito" item="presente">
        <S>
          <rect x={-12.4} y={-27} width={24.8} height={20} rx={1.6} fill="#1F8F5A" stroke={TRACO} strokeWidth={1.1} />
          <rect x={-2.6} y={-27} width={5.2} height={20} fill="url(#qn-g-ouro)" />
          <rect x={-14} y={-31} width={28} height={6.4} rx={1.6} fill="#27A56A" stroke={TRACO} strokeWidth={1.1} />
          <rect x={-2.6} y={-31} width={5.2} height={6.4} fill="url(#qn-g-ouro)" />
          <path d="M0 -31 q-9 -9 -11 -2.4 q0 3.6 11 2.4 Z M0 -31 q9 -9 11 -2.4 q0 3.6 -11 2.4 Z" fill={OURO} stroke={TRACO} strokeWidth={1} strokeLinejoin="round" />
        </S>
      </Item>
    </>
  );
}

/**
 * O quebra-nozes de corpo inteiro. Nasce escondido; quem mostra, move e muda a
 * pose é o espetáculo, direto no elemento (`aplicarNoBoneco`, em `deixas.ts`).
 * O React não toca nesses atributos, então nada é redesenhado no meio.
 *
 * `data-nao-pausa`: ele anda junto com um relógio, não pode congelar no meio
 * (`lib/atencao.ts`). `semente` dá a cada boneco o seu ritmo de respiração e
 * de brisa na pluma — dois lado a lado nunca balançam juntos.
 */
export const QuebraNozes = memo(forwardRef<HTMLDivElement, { artista: Artista; semente?: number; aoClicar?: () => void }>(
  function QuebraNozes({ artista, semente = 0, aoClicar }, ref) {
    const ritmo = {
      ['--qn-resp' as string]: `${3.1 + (semente % 9) * 0.17}s`,
      ['--qn-brisa' as string]: `${3.7 + (semente % 7) * 0.31}s`,
    };
    return (
      <div ref={ref} className="qn" data-quem={artista.q} data-pose="sentido" data-nao-pausa style={ritmo}>
        <svg className="qn-s" width={1} height={1}><ellipse cx={0} cy={0.6} rx={24} ry={3.4} fill="#000" opacity={0.22} /></svg>
        <div className="qn-m qn-y">
          <M c="qn-reage">
            <M c="qn-bob">
              <M c="qn-rock">
                <Perna lado="e" />
                <Perna lado="d" />
                <J c="tronco" x={0} y={-40}>
                  <M c="qn-curva">
                    <M c="qn-resp">
                      {/* a chave de corda, nas costas */}
                      <div className="qn-m" style={{ left: 15, top: -27 }}>
                        <M c="qn-chave-m">
                          <S>
                            <Tubo d="M0 0 H13" cor={OURO_ESCURO} w={2} />
                            <ellipse cx={17.4} cy={-4.8} rx={4.2} ry={4.6} fill="none" stroke={TRACO} strokeWidth={4} />
                            <ellipse cx={17.4} cy={4.8} rx={4.2} ry={4.6} fill="none" stroke={TRACO} strokeWidth={4} />
                            <ellipse cx={17.4} cy={-4.8} rx={4.2} ry={4.6} fill="none" stroke={OURO} strokeWidth={2.2} />
                            <ellipse cx={17.4} cy={4.8} rx={4.2} ry={4.6} fill="none" stroke={OURO} strokeWidth={2.2} />
                          </S>
                        </M>
                      </div>
                      <Tronco farda={artista.farda} />
                      <J c="medalha" x={-10.4} y={-30}>
                        <S>
                          <path d="M-2.2 0 H2.2 V6 L0 4.6 L-2.2 6 Z" fill="#2B66C0" stroke={TRACO} strokeWidth={0.7} strokeLinejoin="round" />
                          <circle cx={0} cy={9} r={3.3} fill="url(#qn-g-ouro)" stroke={TRACO} strokeWidth={0.8} />
                          <circle cx={0} cy={9} r={1.3} fill={OURO_ESCURO} />
                        </S>
                      </J>
                      <J c="cab" x={0} y={-41}><Cabeca artista={artista} /></J>
                      <ItensDePeito />
                      <Dragona lado="e" />
                      <Dragona lado="d" />
                      <Braco lado="e" farda={artista.farda} />
                      <Braco lado="d" farda={artista.farda} />
                    </M>
                  </M>
                </J>
              </M>
            </M>
          </M>
          {/* o paraquedas: só aparece no salto dele */}
          <div className="qn-paraquedas">
            <S>
              <path d="M-18 -78 L-52 -214 M18 -78 L52 -214 M-6 -124 L-18 -216 M6 -124 L18 -216" stroke={TRACO} strokeWidth={0.9} fill="none" />
              <path d="M-56 -212 Q-56 -262 0 -264 Q56 -262 56 -212 Q42 -220 28 -212 Q14 -220 0 -212 Q-14 -220 -28 -212 Q-42 -220 -56 -212 Z" fill="#E4393D" stroke={TRACO} strokeWidth={1.3} strokeLinejoin="round" />
              <path d="M-28 -212 Q-30 -250 0 -264 Q30 -250 28 -212 Q14 -220 0 -212 Q-14 -220 -28 -212 Z" fill="#F8F4EC" stroke={TRACO} strokeWidth={1} strokeLinejoin="round" />
              <path d="M0 -212 V-264" stroke={TRACO} strokeWidth={0.8} />
            </S>
          </div>
          <div className="qn-emote" />
          {/* para o clique: as caixas do boneco têm tamanho zero */}
          <button type="button" className="qn-toque" tabIndex={-1} aria-label={artista.nome} onClick={aoClicar} />
        </div>
        <div className="qn-balao"><div className="qn-balao-p"><div className="qn-balao-c" /></div></div>
      </div>
    );
  },
));
