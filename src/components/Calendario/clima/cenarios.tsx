/**
 * O cenário da caixa do tempo (06/11/2026): uma paisagem de gibi do interior
 * paulista, com o personagem do tempo no céu e o tempo acontecendo nela.
 *
 *   céu (cor pelo tempo e pela hora) · retícula de gibi · estrelas de noite
 *   nuvens passando · chuva caindo · neblina · clarão de temporal
 *   o chão: morro com ipê, rua de cidade pequena ou campo com cerca
 *
 * O chão muda com a estação, como muda por aqui: verão verde, outono
 * amarelando, inverno seco com o ipê-roxo florido, primavera com o
 * ipê-amarelo. Qual dos três chãos aparece é sorteado pelo dia
 * (`varianteDoDia`): todo mundo vê o mesmo, e no dia seguinte pode mudar.
 * De noite, o chão escurece e as janelas e o poste acendem.
 *
 * Quadro de 300×150. Movimento só por classe (`cl-…`, clima.css).
 */
import { useId, type ReactNode } from 'react';
import type { CondicaoClima, Estacao } from '@/lib/clima';
import { DesenhoDoTempo, Nuvem, type CoresClima } from './personagens';

export type Chao = 'morro' | 'cidade' | 'campo';
export const CHAOS: readonly Chao[] = ['morro', 'cidade', 'campo'];

const CEU_DIA: Record<CondicaoClima, string> = {
  limpo: '#7DD3FC',
  poucas_nuvens: '#93D2F5',
  nublado: '#B6C3D1',
  neblina: '#D5DCE4',
  garoa: '#A9B8C9',
  chuva: '#94A3B8',
  chuva_forte: '#7C8BA1',
  tempestade: '#5B6577',
};
const CEU_NOITE: Record<CondicaoClima, string> = {
  limpo: '#1E2A4A',
  poucas_nuvens: '#22305A',
  nublado: '#2B3448',
  neblina: '#3A4356',
  garoa: '#283042',
  chuva: '#232A3A',
  chuva_forte: '#1F2533',
  tempestade: '#1A1F2B',
};

interface CoresDoChao { frente: string; fundo: string; copa: string; copa2: string }

const CHAO: Record<Estacao, CoresDoChao> = {
  verao: { frente: '#4ADE80', fundo: '#22C55E', copa: '#16A34A', copa2: '#4ADE80' },
  outono: { frente: '#A3C25B', fundo: '#7FA23A', copa: '#F59E0B', copa2: '#EA580C' },
  // Inverno seco do interior: o pasto amarela e o ipê-roxo floresce.
  inverno: { frente: '#D9C27A', fundo: '#BFA556', copa: '#C084FC', copa2: '#A855F7' },
  // Primavera: o ipê-amarelo e o verde voltando.
  primavera: { frente: '#86EFAC', fundo: '#4ADE80', copa: '#FACC15', copa2: '#EAB308' },
};

const TRONCO = '#92400E';
const MADEIRA = '#B45309';
const MADEIRA_CLARA = '#D97706';
const LUZ = '#FDE047';

// ── Peças do chão ────────────────────────────────────────────────────────────

function Arvore({ x, y, s = 1, cores, ol }: { x: number; y: number; s?: number; cores: CoresDoChao; ol: string }) {
  const copa = (
    <>
      <circle cx={0} cy={-42} r={16} />
      <circle cx={-13} cy={-33} r={11} />
      <circle cx={13} cy={-33} r={11} />
    </>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-4} y={-32} width={8} height={32} rx={2} fill={TRONCO} stroke={ol} strokeWidth={2.5} />
      <path d="M0 -20 l-7 -8 M0 -16 l6 -7" stroke={ol} strokeWidth={2.5} strokeLinecap="round" />
      <g fill={ol} stroke={ol} strokeWidth={5}>{copa}</g>
      <g fill={cores.copa}>{copa}</g>
      <g fill={cores.copa2} stroke={ol} strokeWidth={1}>
        <circle cx={-6} cy={-46} r={2.6} /><circle cx={7} cy={-40} r={2.2} /><circle cx={-14} cy={-32} r={2.2} />
        <circle cx={12} cy={-30} r={2.6} /><circle cx={1} cy={-31} r={1.8} /><circle cx={4} cy={-52} r={1.8} />
      </g>
    </g>
  );
}

function Casa({ x, w, h, parede, telhado, ol, noite }: {
  x: number; w: number; h: number; parede: string; telhado: string; ol: string; noite: boolean;
}) {
  const base = 128;
  const topo = base - h;
  return (
    <g strokeLinejoin="round">
      <rect x={x} y={topo} width={w} height={h} fill={parede} stroke={ol} strokeWidth={2.5} />
      <path d={`M${x - 5} ${topo} L${x + w / 2} ${topo - 17} L${x + w + 5} ${topo} Z`} fill={telhado} stroke={ol} strokeWidth={2.5} />
      <rect x={x + w / 2 - 5} y={base - 15} width={10} height={15} fill={TRONCO} stroke={ol} strokeWidth={2} />
      <rect x={x + 5} y={topo + 7} width={10} height={9} fill={noite ? LUZ : '#E0F2FE'} stroke={ol} strokeWidth={2} />
      {w > 36 && <rect x={x + w - 15} y={topo + 7} width={10} height={9} fill={noite ? LUZ : '#E0F2FE'} stroke={ol} strokeWidth={2} />}
    </g>
  );
}

function Tufo({ x, y, cor, ol }: { x: number; y: number; cor: string; ol: string }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={`M${x - 4} ${y} l-2 -7 M${x} ${y} v-9 M${x + 4} ${y} l2 -7`} stroke={ol} strokeWidth={4} />
      <path d={`M${x - 4} ${y} l-2 -7 M${x} ${y} v-9 M${x + 4} ${y} l2 -7`} stroke={cor} strokeWidth={2} />
    </g>
  );
}

function Girassol({ x, y, ol }: { x: number; y: number; ol: string }) {
  return (
    <g>
      <path d={`M${x} ${y} v-22`} stroke={ol} strokeWidth={4.5} strokeLinecap="round" />
      <path d={`M${x} ${y} v-22`} stroke="#16A34A" strokeWidth={2.4} strokeLinecap="round" />
      <g transform={`translate(${x} ${y - 25})`} stroke={ol} strokeWidth={1.5}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <ellipse key={i} cx={(5.5 * Math.cos(a)).toFixed(2)} cy={(5.5 * Math.sin(a)).toFixed(2)} rx={3.4} ry={2.2}
            transform={`rotate(${i * 45} ${(5.5 * Math.cos(a)).toFixed(2)} ${(5.5 * Math.sin(a)).toFixed(2)})`} fill="#FACC15" />;
        })}
        <circle r={4} fill={TRONCO} />
      </g>
    </g>
  );
}

function Florzinhas({ pontos, cor, ol }: { pontos: readonly (readonly [number, number])[]; cor: string; ol: string }) {
  return (
    <g stroke={ol} strokeWidth={1.2}>
      {pontos.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={2.6} fill={cor} />
          <circle cx={x} cy={y} r={1} fill={LUZ} stroke="none" />
        </g>
      ))}
    </g>
  );
}

/** O chão do dia. Devolve a base e, de noite, o escuro por cima e as luzes. */
function ChaoDoDia({ chao, estacao, noite, c }: { chao: Chao; estacao: Estacao; noite: boolean; c: CoresClima }) {
  const cores = CHAO[estacao];
  const ol = c.ol;
  const escuro = noite && <rect x={0} y={78} width={300} height={72} fill="#0B1220" opacity={0.42} />;
  let base: ReactNode;
  let luzes: ReactNode = null;

  if (chao === 'morro') {
    base = (
      <>
        <path d="M-5 108 Q60 82 140 100 T305 92 V155 H-5Z" fill={cores.fundo} stroke={ol} strokeWidth={3} strokeLinejoin="round" />
        <Arvore x={78} y={112} cores={cores} ol={ol} />
        <Arvore x={34} y={106} s={0.62} cores={cores} ol={ol} />
        <path d="M-5 128 Q100 104 200 124 T305 118 V155 H-5Z" fill={cores.frente} stroke={ol} strokeWidth={3} strokeLinejoin="round" />
        <path d="M150 155 Q168 136 214 125" fill="none" stroke={ol} strokeWidth={11} strokeLinecap="round" />
        <path d="M150 155 Q168 136 214 125" fill="none" stroke="#E7B977" strokeWidth={6.5} strokeLinecap="round" />
        {estacao === 'primavera' && <Florzinhas pontos={[[40, 134], [70, 140], [110, 130], [250, 132], [280, 140]]} cor={c.ac2} ol={ol} />}
        {estacao === 'inverno' && <><Tufo x={40} y={140} cor="#A16207" ol={ol} /><Tufo x={250} y={136} cor="#A16207" ol={ol} /></>}
        {estacao === 'outono' && (
          <g fill="#EA580C" stroke={ol} strokeWidth={1.2}>
            <ellipse cx={64} cy={118} rx={4} ry={2} /><ellipse cx={92} cy={116} rx={3.5} ry={1.8} /><ellipse cx={80} cy={121} rx={3} ry={1.6} />
          </g>
        )}
        {estacao === 'verao' && <><Tufo x={46} y={140} cor="#15803D" ol={ol} /><Tufo x={262} y={136} cor="#15803D" ol={ol} /></>}
      </>
    );
  } else if (chao === 'cidade') {
    base = (
      <>
        <path d="M-5 128 H305 V155 H-5Z" fill={cores.frente} stroke={ol} strokeWidth={3} />
        <Casa x={12} w={40} h={32} parede="#FDE68A" telhado="#DC2626" ol={ol} noite={noite} />
        <Casa x={64} w={32} h={25} parede="#A5F3FC" telhado={MADEIRA} ol={ol} noite={noite} />
        <Arvore x={120} y={128} s={0.8} cores={cores} ol={ol} />
        <Casa x={146} w={42} h={36} parede="#FCA5A5" telhado="#7C2D12" ol={ol} noite={noite} />
        <Casa x={256} w={34} h={26} parede="#FDBA74" telhado="#B91C1C" ol={ol} noite={noite} />
        <path d="M-5 138 H305" stroke={ol} strokeWidth={3} />
        <rect x={-5} y={138} width={310} height={17} fill="#CBD5E1" />
        <path d="M20 146 h18 M70 146 h18 M120 146 h18 M170 146 h18 M220 146 h18 M270 146 h18" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
        <path d="M226 128 V100 q0 -6 8 -6" fill="none" stroke={ol} strokeWidth={4} strokeLinecap="round" />
      </>
    );
    luzes = (
      <>
        {noite && <circle cx={236} cy={98} r={12} fill={LUZ} opacity={0.28} />}
        <path d="M230 94 h12 l-2 6 h-8z" fill={noite ? LUZ : '#F1F5F9'} stroke={ol} strokeWidth={2} strokeLinejoin="round" />
        {noite && (
          <g fill={LUZ} stroke={ol} strokeWidth={2}>
            <rect x={17} y={103} width={10} height={9} />
            <rect x={69} y={110} width={10} height={9} />
            <rect x={151} y={99} width={10} height={9} /><rect x={173} y={99} width={10} height={9} />
            <rect x={261} y={109} width={10} height={9} />
          </g>
        )}
      </>
    );
  } else {
    const postes = [14, 54, 94, 134, 174, 214, 254, 294];
    base = (
      <>
        <path d="M-5 112 Q150 98 305 112 V155 H-5Z" fill={cores.fundo} stroke={ol} strokeWidth={3} strokeLinejoin="round" />
        {estacao === 'verao' && <><Girassol x={36} y={116} ol={ol} /><Girassol x={70} y={113} ol={ol} /><Girassol x={112} y={112} ol={ol} /></>}
        {(estacao === 'outono' || estacao === 'inverno') && (
          // A cana: verde no outono, palha no inverno seco.
          [20, 44, 68, 92, 116, 140, 164].map(x => (
            <Tufo key={x} x={x} y={114 - ((x / 24) % 2) * 2} cor={estacao === 'outono' ? '#65A30D' : '#CA8A04'} ol={ol} />
          ))
        )}
        {estacao === 'primavera' && <Florzinhas pontos={[[24, 110], [48, 106], [76, 108], [104, 104], [130, 108], [160, 106]]} cor={c.ac2} ol={ol} />}
        <g>
          <path d="M-5 120 H305 M-5 129 H305" stroke={ol} strokeWidth={5.5} />
          <path d="M-5 120 H305 M-5 129 H305" stroke={MADEIRA_CLARA} strokeWidth={3} />
          {postes.map(x => <rect key={x} x={x} y={113} width={6} height={24} rx={1.5} fill={MADEIRA} stroke={ol} strokeWidth={2} />)}
        </g>
        <path d="M-5 134 Q150 126 305 134 V155 H-5Z" fill={cores.frente} stroke={ol} strokeWidth={3} strokeLinejoin="round" />
        {estacao !== 'primavera' && <><Tufo x={30} y={146} cor={estacao === 'inverno' ? '#A16207' : '#15803D'} ol={ol} /><Tufo x={240} y={144} cor={estacao === 'inverno' ? '#A16207' : '#15803D'} ol={ol} /></>}
      </>
    );
  }

  return <>{base}{escuro}{luzes}</>;
}

// ── O tempo no céu ───────────────────────────────────────────────────────────

/** As nuvens que passam ao fundo, por condição: [x, y, escala, cor]. */
const NUVENS_DE_FUNDO: Partial<Record<CondicaoClima, readonly (readonly [number, number, number, string])[]>> = {
  poucas_nuvens: [[18, 4, 1.25, '#FFFFFF']],
  nublado: [[-10, 2, 1.5, '#E2E8F0'], [70, 22, 1.2, '#CBD5E1'], [130, -4, 1.1, '#F1F5F9']],
  neblina: [[10, 6, 1.3, '#E2E8F0']],
  garoa: [[4, 6, 1.35, '#CBD5E1'], [100, 20, 1.1, '#E2E8F0']],
  chuva: [[0, 4, 1.45, '#B6C3D1'], [96, 18, 1.2, '#CBD5E1']],
  chuva_forte: [[-12, 0, 1.6, '#94A3B8'], [70, 16, 1.3, '#A3B1C4'], [134, -6, 1.2, '#94A3B8']],
  tempestade: [[-12, -2, 1.6, '#64748B'], [72, 14, 1.35, '#748197'], [136, -8, 1.2, '#64748B']],
};

const ESTRELAS: readonly (readonly [number, number, number])[] = [
  [22, 18, 1], [58, 44, 0.8], [104, 14, 1.1], [146, 36, 0.8], [178, 12, 0.9], [88, 62, 0.7], [30, 70, 0.7], [126, 74, 0.6],
];

function Estrela({ x, y, s, atraso }: { x: number; y: number; s: number; atraso: number }) {
  return (
    <path
      className="cl-estrela"
      style={{ animationDelay: `${atraso}s` }}
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6Z"
      fill="#FDE68A"
    />
  );
}

/** Quantos riscos de chuva cruzam o cenário, e de que jeito. */
const CHUVA: Partial<Record<CondicaoClima, { n: number; comp: number; larg: number }>> = {
  garoa: { n: 12, comp: 6, larg: 1.6 },
  chuva: { n: 18, comp: 11, larg: 2.2 },
  chuva_forte: { n: 26, comp: 14, larg: 2.4 },
  tempestade: { n: 22, comp: 14, larg: 2.4 },
};

export interface PropsCenario {
  condicao: CondicaoClima;
  noite: boolean;
  estacao: Estacao;
  chao: Chao;
  /** O acessório do sol (de `varianteDoDia`). */
  variante: number;
  temp?: number | null;
  cores: CoresClima;
  className?: string;
}

export function CenarioDoTempo({ condicao, noite, estacao, chao, variante, temp, cores, className }: PropsCenario) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ceu = (noite ? CEU_NOITE : CEU_DIA)[condicao];
  const chuva = CHUVA[condicao];
  const estrelas = noite && (condicao === 'limpo' || condicao === 'poucas_nuvens');

  return (
    <svg viewBox="0 0 300 150" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id={`ret-${id}`} width={10} height={10} patternUnits="userSpaceOnUse">
          <circle cx={5} cy={5} r={1.1} fill="#fff" opacity={noite ? 0.12 : 0.28} />
        </pattern>
      </defs>
      <rect width={300} height={150} fill={ceu} />
      <rect width={300} height={150} fill={`url(#ret-${id})`} />

      {estrelas && ESTRELAS.map(([x, y, s], i) => <Estrela key={i} x={x} y={y} s={s} atraso={-i * 0.4} />)}

      {(NUVENS_DE_FUNDO[condicao] ?? []).map(([x, y, s, cor], i) => (
        <Nuvem key={i} x={x} y={y} s={s} cor={noite ? '#475569' : cor} ol={cores.ol} className={i % 2 ? 'cl-deriva cl-deriva-2' : 'cl-deriva'} brilho={!noite} />
      ))}

      <ChaoDoDia chao={chao} estacao={estacao} noite={noite} c={cores} />

      {chuva && (
        <g stroke={noite ? '#94A3B8' : '#EFF6FF'} strokeWidth={chuva.larg} strokeLinecap="round" opacity={0.9}>
          {Array.from({ length: chuva.n }, (_, i) => {
            const x = (i * 37 + 13) % 300;
            const y = 20 + ((i * 53 + 7) % 115);
            return (
              <path
                key={i}
                className="cl-chuva"
                style={{ animationDelay: `${-((i * 0.137) % 0.8)}s` }}
                d={`M${x} ${y} l-3 ${chuva.comp}`}
              />
            );
          })}
        </g>
      )}

      {/* O personagem do tempo, grande, no alto à direita. */}
      <svg x={200} y={-4} width={92} height={92} viewBox="0 0 64 64" overflow="visible">
        <DesenhoDoTempo condicao={condicao} noite={noite} estacao={estacao} variante={variante} temp={temp} cores={cores} />
      </svg>

      {condicao === 'neblina' && (
        <g className="cl-nevoa" fill="#fff" opacity={0.72}>
          <rect x={-30} y={62} width={230} height={12} rx={6} />
          <rect x={70} y={92} width={260} height={14} rx={7} />
          <rect x={-20} y={120} width={240} height={12} rx={6} />
        </g>
      )}

      {condicao === 'tempestade' && <rect className="cl-flash" width={300} height={150} fill="#fff" opacity={0} />}
    </svg>
  );
}
