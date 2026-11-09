/**
 * Os personagens do tempo, no traço do gibi do Calendário (06/11/2026): o sol,
 * a lua e as nuvens com carinha. Cada condição tem o seu, e a expressão diz o
 * tempo antes do número — o sol de óculos no calor, a nuvem emburrada na
 * chuva, a nuvem brava no temporal, a lua dormindo de gorro.
 *
 * O sol de céu limpo muda de acessório com a estação, em duas variações
 * sorteadas pelo dia (`varianteDoDia`): chapéu de palha ou óculos no verão,
 * folha ou boné no outono, cachecol ou gorro no inverno, flor na primavera.
 *
 * Tudo num quadro de 64×64. Contorno e acessórios nas cores da paleta do tema
 * do mês (`ol`, `ac`, `ac2`); o resto (amarelo do sol, azul da gota) é fixo,
 * para o tempo se ler igual em qualquer tema.
 *
 * O movimento é só classe (`cl-…`, em clima.css), e só existe com «reduzir
 * movimento» desligado. Parado, o desenho já está inteiro: a chuva tem as gotas
 * no lugar, o raio está aceso.
 */
import type { ReactNode } from 'react';
import type { PaletaGibi } from '@/lib/calendarioSetor';
import type { CondicaoClima, Estacao } from '@/lib/clima';
import './clima.css';

export type CoresClima = Pick<PaletaGibi, 'ac' | 'ac2' | 'ol'>;

const AMARELO = '#FACC15';
const AMARELO_CLARO = '#FEF9C3';
const GOTA = '#38BDF8';
const BOCHECHA = '#FB7185';

/** As nuvens por condição: a cor fica mais pesada conforme o tempo fecha. */
const COR_NUVEM: Record<CondicaoClima, string> = {
  limpo: '#FFFFFF',
  poucas_nuvens: '#FFFFFF',
  nublado: '#F1F5F9',
  neblina: '#E2E8F0',
  garoa: '#E2E8F0',
  chuva: '#CBD5E1',
  chuva_forte: '#94A3B8',
  tempestade: '#64748B',
};

/** Quantas variações de acessório o sol tem por estação. */
export const VARIACOES_DO_SOL = 2;

// ── Peças ────────────────────────────────────────────────────────────────────

type Humor = 'feliz' | 'calor' | 'sono' | 'serio' | 'triste' | 'bravo' | 'aperta';

function Rosto({ cx, cy, humor, ol, oculos = false }: { cx: number; cy: number; humor: Humor; ol: string; oculos?: boolean }) {
  const traco = { stroke: ol, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const olhosPonto = (
    <g fill={ol}>
      <circle cx={cx - 5} cy={cy - 2} r={1.8} />
      <circle cx={cx + 5} cy={cy - 2} r={1.8} />
    </g>
  );
  const bochechas = (
    <g fill={BOCHECHA} opacity={0.45}>
      <circle cx={cx - 9} cy={cy + 3} r={2.3} />
      <circle cx={cx + 9} cy={cy + 3} r={2.3} />
    </g>
  );
  let olhos: ReactNode = olhosPonto;
  let boca: ReactNode = null;
  switch (humor) {
    case 'feliz':
      olhos = (
        <g fill={ol}>
          <ellipse cx={cx - 5} cy={cy - 2} rx={1.7} ry={2.3} />
          <ellipse cx={cx + 5} cy={cy - 2} rx={1.7} ry={2.3} />
        </g>
      );
      boca = <path d={`M${cx - 4} ${cy + 3} Q${cx} ${cy + 7} ${cx + 4} ${cy + 3}`} {...traco} />;
      break;
    case 'calor':
      // Olhos de «ufa» (^ ^) e a boca aberta: feliz, mas derretendo.
      olhos = <path d={`M${cx - 7} ${cy - 1} q2 -3.5 4 0 M${cx + 3} ${cy - 1} q2 -3.5 4 0`} {...traco} />;
      boca = <ellipse cx={cx} cy={cy + 4.5} rx={2.8} ry={2.4} fill={ol} />;
      break;
    case 'sono':
      olhos = <path d={`M${cx - 7} ${cy - 2} q2 2 4 0 M${cx + 3} ${cy - 2} q2 2 4 0`} {...traco} />;
      boca = <circle cx={cx} cy={cy + 4} r={1.3} fill={ol} />;
      break;
    case 'serio':
      boca = <path d={`M${cx - 3} ${cy + 4} h6`} {...traco} />;
      break;
    case 'triste':
      boca = (
        <>
          <path d={`M${cx - 8} ${cy - 5} L${cx - 3} ${cy - 7} M${cx + 3} ${cy - 7} L${cx + 8} ${cy - 5}`} {...traco} />
          <path d={`M${cx - 4} ${cy + 6} Q${cx} ${cy + 2} ${cx + 4} ${cy + 6}`} {...traco} />
        </>
      );
      break;
    case 'bravo':
      boca = (
        <>
          <path d={`M${cx - 8} ${cy - 7} L${cx - 3} ${cy - 4} M${cx + 3} ${cy - 4} L${cx + 8} ${cy - 7}`} {...traco} strokeWidth={2.4} />
          <rect x={cx - 4} y={cy + 2.5} width={8} height={4} rx={1.2} fill="#fff" stroke={ol} strokeWidth={1.6} />
          <path d={`M${cx} ${cy + 2.5} v4`} stroke={ol} strokeWidth={1.2} />
        </>
      );
      break;
    case 'aperta':
      olhos = <path d={`M${cx - 7} ${cy - 3.5} l3 1.5 l-3 1.5 M${cx + 7} ${cy - 3.5} l-3 1.5 l3 1.5`} {...traco} />;
      boca = <path d={`M${cx - 3} ${cy + 4} q1.5 -1.5 3 0 t3 0`} {...traco} />;
      break;
  }
  return (
    <g>
      {humor !== 'bravo' && bochechas}
      {!oculos && olhos}
      {boca}
    </g>
  );
}

/**
 * Uma nuvem de gibi: a união de três círculos e uma base, com o contorno por
 * fora (o mesmo desenho, primeiro grosso na cor do contorno, depois cheio por
 * cima). Ocupa x 8–54, y 13–44 do quadro de 64, antes do `translate`/`scale`.
 */
export function Nuvem({ x = 0, y = 0, s = 1, cor, ol, className, brilho = true }: {
  x?: number; y?: number; s?: number; cor: string; ol: string; className?: string; brilho?: boolean;
}) {
  const formas = (
    <>
      <circle cx={18} cy={33} r={10} />
      <circle cx={31} cy={25} r={13} />
      <circle cx={44} cy={31} r={10} />
      <rect x={8} y={31} width={46} height={13} rx={6.5} />
    </>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={className}>
        <g fill={ol} stroke={ol} strokeWidth={5} strokeLinejoin="round">{formas}</g>
        <g fill={cor}>{formas}</g>
        {brilho && <path d="M22 21 q5 -6 13 -4" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.75} />}
      </g>
    </g>
  );
}

function Gota({ x, y, s = 1, ol, atraso }: { x: number; y: number; s?: number; ol: string; atraso: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        className="cl-gota"
        style={{ animationDelay: `${atraso}s` }}
        d="M0 -5 C2.5 -1.5 4 .5 4 2.2 A4 4 0 0 1 -4 2.2 C-4 .5 -2.5 -1.5 0 -5Z"
        fill={GOTA}
        stroke={ol}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </g>
  );
}

function Raios({ ol }: { ol: string }) {
  const pontas = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const p = (r: number, d: number) => `${(32 + r * Math.cos(a + d)).toFixed(1)} ${(32 + r * Math.sin(a + d)).toFixed(1)}`;
    return `M${p(17, -0.2)} L${p(28, 0)} L${p(17, 0.2)}Z`;
  }).join(' ');
  return (
    <g className="cl-raios">
      <path d={pontas} fill={AMARELO} stroke={ol} strokeWidth={2.5} strokeLinejoin="round" />
    </g>
  );
}

type Acessorio = 'oculos' | 'chapeu' | 'folha' | 'bone' | 'cachecol' | 'gorro' | 'flor' | 'flores' | null;

const ACESSORIOS: Record<Estacao, Acessorio[]> = {
  verao: ['oculos', 'chapeu'],
  outono: ['folha', 'bone'],
  inverno: ['cachecol', 'gorro'],
  primavera: ['flor', 'flores'],
};

function Flor({ x, y, s = 1, petala, ol }: { x: number; y: number; s?: number; petala: string; ol: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke={ol} strokeWidth={1.6}>
      {[0, 72, 144, 216, 288].map(g => {
        const a = (g * Math.PI) / 180;
        return <circle key={g} cx={(3.4 * Math.cos(a)).toFixed(2)} cy={(3.4 * Math.sin(a)).toFixed(2)} r={3} fill={petala} />;
      })}
      <circle r={2.4} fill={AMARELO} />
    </g>
  );
}

function PecaDoSol({ peca, c }: { peca: Acessorio; c: CoresClima }) {
  const borda = { stroke: c.ol, strokeWidth: 2.5, strokeLinejoin: 'round' as const };
  switch (peca) {
    case 'oculos':
      return (
        <g>
          <rect x={20.5} y={26} width={10} height={7.5} rx={3} fill="#111" stroke={c.ol} strokeWidth={2} />
          <rect x={33.5} y={26} width={10} height={7.5} rx={3} fill="#111" stroke={c.ol} strokeWidth={2} />
          <path d="M30.5 28.5 h3" stroke={c.ol} strokeWidth={2} />
          <path d="M23 28 l2.5 -1 M36 28 l2.5 -1" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" />
        </g>
      );
    case 'chapeu':
      return (
        <g>
          <ellipse cx={32} cy={20} rx={20} ry={5} fill="#FDE68A" {...borda} />
          <path d="M22 20 Q23 8 32 8 Q41 8 42 20 Z" fill="#FCD34D" {...borda} />
          <path d="M22.8 16.5 h18.4" stroke={c.ac} strokeWidth={3} />
        </g>
      );
    case 'folha':
      return (
        <g transform="translate(36 13) rotate(-25)">
          <path d="M0 0 q8 -8 16 0 q-8 8 -16 0z" fill="#EA580C" stroke={c.ol} strokeWidth={2} strokeLinejoin="round" />
          <path d="M1 0 h13" stroke={c.ol} strokeWidth={1.2} />
        </g>
      );
    case 'bone':
      return (
        <g>
          <path d="M19 22 Q20 10 32 10 Q44 10 45 22 Z" fill={c.ac} {...borda} />
          <path d="M40 21 q10 0 15 4 q-8 2.5 -17 0z" fill={c.ac2} stroke={c.ol} strokeWidth={2} strokeLinejoin="round" />
          <circle cx={32} cy={10} r={2} fill={c.ac2} stroke={c.ol} strokeWidth={1.5} />
        </g>
      );
    case 'cachecol':
      return (
        <g>
          <path d="M18 40 Q32 50 46 40 L47 45.5 Q32 56 17 45.5 Z" fill={c.ac} {...borda} />
          <path d="M37 47 l3 12 l5.5 -1.5 l-2.5 -11.5" fill={c.ac2} stroke={c.ol} strokeWidth={2} strokeLinejoin="round" />
        </g>
      );
    case 'gorro':
      return (
        <g>
          <path d="M18 24 Q19 9 32 9 Q45 9 46 24 Z" fill={c.ac} {...borda} />
          <rect x={16.5} y={20.5} width={31} height={6.5} rx={3.2} fill={c.ac2} stroke={c.ol} strokeWidth={2} />
          <circle cx={32} cy={8} r={4} fill="#fff" stroke={c.ol} strokeWidth={2} />
        </g>
      );
    case 'flor':
      return <Flor x={44} y={16} s={1.1} petala={c.ac2} ol={c.ol} />;
    case 'flores':
      return (
        <>
          <Flor x={21} y={17} s={0.85} petala={c.ac} ol={c.ol} />
          <Flor x={43} y={16} s={1} petala={c.ac2} ol={c.ol} />
        </>
      );
    default:
      return null;
  }
}

/** O sol, de 64×64, com rosto e (opcional) o acessório da estação. */
function Sol({ c, humor, peca }: { c: CoresClima; humor: Humor; peca: Acessorio }) {
  const oculos = peca === 'oculos';
  return (
    <g>
      <Raios ol={c.ol} />
      <g className="cl-respira">
        <circle cx={32} cy={32} r={14.5} fill={AMARELO} stroke={c.ol} strokeWidth={3} />
        <path d="M22.5 26 a11 11 0 0 1 7.5 -6.8" fill="none" stroke={AMARELO_CLARO} strokeWidth={2.6} strokeLinecap="round" />
        <Rosto cx={32} cy={33} humor={oculos ? 'feliz' : humor} ol={c.ol} oculos={oculos} />
        {humor === 'calor' && <Gota x={47} y={22} s={0.75} ol={c.ol} atraso={-0.4} />}
        <PecaDoSol peca={peca} c={c} />
      </g>
    </g>
  );
}

/** A lua cheia dormindo, de gorro de dormir. */
function Lua({ c }: { c: CoresClima }) {
  return (
    <g>
      <g className="cl-zz" style={{ animationDelay: '-1.2s' }} fill="none" stroke={c.ol} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 13 h5 l-5 6 h5" />
        <path d="M11 4 h3.5 l-3.5 4 h3.5" strokeWidth={1.6} />
      </g>
      <g className="cl-respira">
        <circle cx={32} cy={35} r={18} fill="#FEF3C7" stroke={c.ol} strokeWidth={3} />
        <g fill="#FDE68A" stroke={c.ol} strokeWidth={1.4}>
          <circle cx={24} cy={44} r={2.6} />
          <circle cx={42} cy={42} r={1.9} />
        </g>
        <Rosto cx={32} cy={36} humor="sono" ol={c.ol} />
        <path d="M14 28 Q16 13 32 12 Q46 12 52 23 Q56 29 56 35 Q50 27 44 25 Q32 21 14 28 Z" fill={c.ac} stroke={c.ol} strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M13 29 Q30 20 47 26" fill="none" stroke={c.ol} strokeWidth={6.5} strokeLinecap="round" />
        <path d="M13 29 Q30 20 47 26" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" />
        <circle cx={56} cy={36} r={4} fill="#fff" stroke={c.ol} strokeWidth={2} />
      </g>
    </g>
  );
}

// ── O personagem ─────────────────────────────────────────────────────────────

export interface PropsPersonagem {
  condicao: CondicaoClima;
  noite: boolean;
  estacao: Estacao;
  /** Qual acessório do sol (0 ou 1), de `varianteDoDia`. */
  variante: number;
  /** A temperatura: o sol sua a partir de 32°. */
  temp?: number | null;
  cores: CoresClima;
}

/** O conteúdo do quadro de 64×64 (sem o `<svg>`), para entrar no cenário também. */
export function DesenhoDoTempo({ condicao, noite, estacao, variante, temp, cores: c }: PropsPersonagem) {
  const quente = typeof temp === 'number' && temp >= 32;
  const peca = ACESSORIOS[estacao][variante % VARIACOES_DO_SOL] ?? null;
  const nuvem = COR_NUVEM[condicao];

  switch (condicao) {
    case 'limpo':
      return noite ? <Lua c={c} /> : <Sol c={c} humor={quente ? 'calor' : 'feliz'} peca={peca} />;

    case 'poucas_nuvens':
      return (
        <g>
          <g transform="translate(20 -8) scale(.72)">
            {noite ? <Lua c={c} /> : <Sol c={c} humor={quente ? 'calor' : 'feliz'} peca={null} />}
          </g>
          <Nuvem x={-3} y={14} s={0.92} cor={nuvem} ol={c.ol} className="cl-deriva" />
        </g>
      );

    case 'nublado':
      return (
        <g>
          <Nuvem x={20} y={-4} s={0.68} cor="#CBD5E1" ol={c.ol} className="cl-deriva" brilho={false} />
          <g className="cl-respira">
            <Nuvem x={-1} y={8} cor={nuvem} ol={c.ol} />
            <Rosto cx={30} cy={40} humor="sono" ol={c.ol} />
          </g>
        </g>
      );

    case 'neblina':
      return (
        <g>
          <g className="cl-respira">
            <Nuvem x={0} y={-4} cor={nuvem} ol={c.ol} />
            <Rosto cx={31} cy={29} humor="aperta" ol={c.ol} />
          </g>
          <g className="cl-nevoa" fill="none" strokeLinecap="round">
            <path d="M10 47 h36 M18 54 h38 M6 61 h30" stroke={c.ol} strokeWidth={6.5} />
            <path d="M10 47 h36 M18 54 h38 M6 61 h30" stroke="#fff" strokeWidth={3.5} />
          </g>
        </g>
      );

    case 'garoa':
    case 'chuva': {
      const gotas = condicao === 'garoa'
        ? [[21, 51], [32, 56], [43, 51]]
        : [[17, 51], [27, 57], [38, 51], [48, 57]];
      return (
        <g>
          {gotas.map(([x, y], i) => <Gota key={i} x={x} y={y} s={condicao === 'garoa' ? 0.75 : 0.95} ol={c.ol} atraso={-0.35 - i * 0.27} />)}
          <g className="cl-respira">
            <Nuvem x={0} y={-6} cor={nuvem} ol={c.ol} />
            <Rosto cx={31} cy={28} humor={condicao === 'garoa' ? 'serio' : 'triste'} ol={c.ol} />
          </g>
        </g>
      );
    }

    case 'chuva_forte':
      return (
        <g>
          <g fill="none" strokeLinecap="round">
            {[12, 20, 28, 36, 44, 52].map((x, i) => (
              <g key={x} className="cl-gota" style={{ animationDelay: `${-0.3 - i * 0.17}s` }}>
                <path d={`M${x} ${46 + (i % 2) * 3} l-3 11`} stroke={c.ol} strokeWidth={4.5} />
                <path d={`M${x} ${46 + (i % 2) * 3} l-3 11`} stroke={GOTA} strokeWidth={2.4} />
              </g>
            ))}
          </g>
          <g className="cl-respira">
            <Nuvem x={0} y={-7} cor={nuvem} ol={c.ol} brilho={false} />
            <Rosto cx={31} cy={27} humor="triste" ol={c.ol} />
          </g>
        </g>
      );

    case 'tempestade':
      return (
        <g>
          <Gota x={15} y={52} s={0.85} ol={c.ol} atraso={-0.35} />
          <Gota x={50} y={54} s={0.85} ol={c.ol} atraso={-0.85} />
          <path
            className="cl-raio"
            d="M34 35 L24 52 H32 L27 64 L43 45 H35 L40 35 Z"
            fill="#FDE047"
            stroke={c.ol}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <g className="cl-respira">
            <Nuvem x={0} y={-8} cor={nuvem} ol={c.ol} brilho={false} />
            <Rosto cx={31} cy={26} humor="bravo" ol={c.ol} />
          </g>
        </g>
      );
  }
}

/** O personagem num `<svg>` próprio (o botão do topo, os próximos dias). */
export function PersonagemDoTempo(p: PropsPersonagem & { className?: string; titulo?: string }) {
  const { className, titulo, ...resto } = p;
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      overflow="visible"
    >
      <DesenhoDoTempo {...resto} />
    </svg>
  );
}
