/**
 * Os duendes do Papai Noel que arrumam a bagunça do Grinch (06/11/2026).
 * O roteiro (para onde cada um vai, o que conserta, o que fala) está em
 * `roteiro.ts`; as falas, em `falasDosDuendes.ts`.
 *
 * Três, cada um com a sua ferramenta e o seu gorro:
 *   0 — o do MARTELO (gorro verde): o resmungão, reclama do Grinch;
 *   1 — o da VASSOURA (gorro vermelho): o otimista, fala do Natal;
 *   2 — o da PRANCHETA (gorro dourado): anota tudo e cagueta pro Urso.
 *
 * Mesmo traço do Grinch (contorno escuro), mas pequenos e redondinhos. O
 * duende anda por `transform` com transição (a duração vem do roteiro); as
 * pernas, os braços e o corpo mexem em CSS (`grinch.css`). O balão fica fora
 * do grupo que vira de lado, para o texto nunca sair espelhado.
 */
import { cn } from '@/lib/utils';
import type { Duende } from './roteiro';
import { quebrarFala } from './falasDosDuendes';

const TRACO = '#2A2320';
const PELE = '#F4C9A1';
const ROUPA = ['#2F8F4E', '#2B8A6A', '#3A9A52'] as const;
const GORRO = [['#2F8F4E', '#1F6B38'], ['#C8353A', '#8E2329'], ['#E2B04A', '#B98A2C']] as const;

/** O desenho do duende tem 40 de altura; aqui ele fica com ~52. */
const ESCALA = 1.3;

function Ferramenta({ id }: { id: 0 | 1 | 2 }) {
  if (id === 0) {
    // martelo
    return (
      <g>
        <path d="M0 0 L0 -9" stroke="#8B5A35" strokeWidth={1.6} strokeLinecap="round" />
        <rect x={-3.2} y={-12} width={6.4} height={3.4} rx={0.8} fill="#9AA3AD" stroke={TRACO} strokeWidth={0.6} />
      </g>
    );
  }
  if (id === 1) {
    // vassoura
    return (
      <g>
        <path d="M0 3 L0 -12" stroke="#A9774F" strokeWidth={1.3} strokeLinecap="round" />
        <path d="M-3 3 L3 3 L4 9 L-4 9 Z" fill="#E2B04A" stroke={TRACO} strokeWidth={0.5} />
        <path d="M-2 4 L-2.6 8.6 M0 4 L0 8.6 M2 4 L2.6 8.6" stroke="#B98A2C" strokeWidth={0.5} />
      </g>
    );
  }
  // prancheta com lápis
  return (
    <g>
      <rect x={-4} y={-9} width={8} height={10} rx={1} fill="#A9774F" stroke={TRACO} strokeWidth={0.5} />
      <rect x={-3} y={-7.6} width={6} height={7.6} fill="#FFFFFF" />
      <path d="M-2 -5.6 H2 M-2 -3.6 H2 M-2 -1.6 H1" stroke="#9AA3AD" strokeWidth={0.5} />
      <rect x={-1.6} y={-9.8} width={3.2} height={1.6} rx={0.4} fill="#9AA3AD" />
    </g>
  );
}

function CorpoDoDuende({ id }: { id: 0 | 1 | 2 }) {
  const [gorro, gorroSombra] = GORRO[id];
  return (
    <g className="nt-duende-corpo">
      {/* pernas listradas e os sapatos de bico enrolado */}
      {(['a', 'b'] as const).map((lado, i) => (
        <g key={lado} className={cn('nt-duende-perna', lado)}>
          <path d={`M${i ? 2.2 : -2.2} -9 L${i ? 2.6 : -2.6} -2`} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
          <path d={`M${i ? 2.2 : -2.2} -9 L${i ? 2.6 : -2.6} -2`} stroke="#C8353A" strokeWidth={2.4} strokeDasharray="1.2 1.2" />
          <path d={`M${i ? 0.6 : -4.2} -2.4 Q${i ? 4 : -0.8} -3.6 ${i ? 6.6 : 1.8} -1.6 Q${i ? 7.8 : 3} -3.4 ${i ? 6.6 : 1.8} -4.4 L${i ? 7.6 : 2.8} -3`}
            fill="#2E5B3A" stroke={TRACO} strokeWidth={0.6} strokeLinejoin="round" />
        </g>
      ))}
      {/* o braço de trás */}
      <path className="nt-duende-braco-tras" d="M-4.6 -16.6 Q-7.6 -13 -7 -10.4" stroke={ROUPA[id]} strokeWidth={2.6} strokeLinecap="round" fill="none" />
      {/* a túnica de bico, o cinto e a gola */}
      <path d="M-6 -18 C-8 -14.6 -9 -11.6 -9 -9.4 L-7 -7 L-5 -9.4 L-3 -7 L-1 -9.4 L1 -7 L3 -9.4 L5 -7 L7 -9.4 L9 -9.4 C9 -11.6 8 -14.6 6 -18 Z"
        fill={ROUPA[id]} stroke={TRACO} strokeWidth={0.7} strokeLinejoin="round" />
      <rect x={-8.4} y={-12.6} width={16.8} height={2} fill={TRACO} />
      <rect x={-1.6} y={-13.1} width={3.2} height={3} rx={0.4} fill="none" stroke="#E2B04A" strokeWidth={0.8} />
      <path d="M-6.4 -18.4 L-4.2 -15.6 L-2.1 -18.4 L0 -15.6 L2.1 -18.4 L4.2 -15.6 L6.4 -18.4 Z" fill="#C8353A" stroke={TRACO} strokeWidth={0.5} strokeLinejoin="round" />
      {/* a cabeça: orelhas de bico, bochechas, olhos e sorriso */}
      <path d="M-4.6 -24 L-9.4 -27 L-5 -21.6 Z M4.6 -24 L9.4 -27 L5 -21.6 Z" fill={PELE} stroke={TRACO} strokeWidth={0.6} strokeLinejoin="round" />
      <circle cx={0} cy={-23.4} r={5.4} fill={PELE} stroke={TRACO} strokeWidth={0.7} />
      <circle cx={-3} cy={-21.6} r={1.2} fill="#F29C9C" opacity={0.8} />
      <circle cx={3.4} cy={-21.6} r={1.2} fill="#F29C9C" opacity={0.8} />
      <g className="nt-duende-olhos">
        <circle cx={-1.6} cy={-23.8} r={0.7} fill={TRACO} />
        <circle cx={2.2} cy={-23.8} r={0.7} fill={TRACO} />
      </g>
      <path d="M-1 -21 Q0.6 -19.6 2 -21" stroke={TRACO} strokeWidth={0.6} fill="none" strokeLinecap="round" />
      <circle cx={0.6} cy={-22.4} r={0.8} fill="#E8A97F" />
      {/* o gorro comprido, caído para trás, com guizo */}
      <path d="M-5.8 -26 Q-4 -33 1 -36 Q7 -39 12 -33 Q8 -35 5 -32 Q3 -29 5.8 -26 Z" fill={gorro} stroke={TRACO} strokeWidth={0.7} strokeLinejoin="round" />
      <path d="M1 -36 Q7 -39 12 -33 Q8 -35 5 -32 Z" fill={gorroSombra} />
      <circle cx={12.2} cy={-32.6} r={1.6} fill="#E2B04A" stroke={TRACO} strokeWidth={0.5} />
      <rect x={-6.6} y={-27.6} width={13.2} height={3} rx={1.5} fill="#FFFFFF" stroke={TRACO} strokeWidth={0.6} />
      {/* o braço da frente, com a ferramenta: é ele que trabalha */}
      <g className="nt-duende-braco">
        <path d="M4.6 -16.6 Q8 -14 9 -11" stroke={ROUPA[id]} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        <circle cx={9.2} cy={-10.6} r={1.5} fill={PELE} stroke={TRACO} strokeWidth={0.5} />
        <g transform="translate(9.4 -10.4)"><Ferramenta id={id} /></g>
      </g>
      {/* faíscas de trabalho, perto da ferramenta */}
      <g className="nt-duende-faiscas">
        {[[16, -16], [19, -8], [13, -22]].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y - 2.4} L${x + 0.7} ${y - 0.7} L${x + 2.4} ${y} L${x + 0.7} ${y + 0.7} L${x} ${y + 2.4} L${x - 0.7} ${y + 0.7} L${x - 2.4} ${y} L${x - 0.7} ${y - 0.7} Z`}
            fill="#FFE07A" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </g>
    </g>
  );
}

/** O balão de fala, acima do gorro: HTML, para o texto sair nítido. Três linhas no máximo. */
function Balao({ texto }: { texto: string }) {
  return <div className="nt-duende-balao" key={texto}>{quebrarFala(texto).slice(0, 3).join('\n')}</div>;
}

/**
 * Cada duende é uma caixa HTML que anda por `transform` (11/11/2026: antes
 * eram grupos dentro do SVG do chalé, e cada passo redesenhava o chalé todo).
 * As pernas e o braço mexem dentro do SVG pequeno do próprio duende.
 */
export function Duendes({ duendes }: { duendes: Duende[] }) {
  if (!duendes.length) return null;
  return (
    <>
      {duendes.map(d => (
        <div key={d.id} className={cn('nt-duende', d.acao)}
          style={{ transform: `translateX(${d.x}px)`, transitionDuration: `${d.dur}s`, ['--passo' as string]: `${0.34 + d.id * 0.03}s` }}>
          <svg className="nt-duende-svg" width={1} height={1}>
            <ellipse cx={0} cy={0} rx={10.4} ry={2} fill="#000" opacity={0.14} />
            <g className="nt-duende-vira" style={{ transform: `scaleX(${d.olha})` }}>
              <g className="nt-duende-pula">
                {/* A escala fica num grupo próprio: o CSS anima o `transform` do «pula». */}
                <g transform={`scale(${ESCALA})`}><CorpoDoDuende id={d.id} /></g>
              </g>
            </g>
          </svg>
          {d.fala && <Balao texto={d.fala} />}
        </div>
      ))}
    </>
  );
}
