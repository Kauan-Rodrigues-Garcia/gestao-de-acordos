import type { Atracao, Enfeite, PiscaPisca } from './trilho';

/*
 * O cenário ao longo do trilho, no mesmo SVG da camada do trem
 * (`CamadaDoTrem.tsx`). Tudo em px da página, no estilo do trem (vetor chapado,
 * sem contorno).
 *
 *   Atracao       — nas faixas: o sinal de passagem (pisca e balança o sino
 *                   com o trem perto), o vilarejo de gengibre, o boneco de neve
 *                   (acena com o trem perto) e os pinheiros. Ficam atrás do
 *                   trilho, com o pé na altura dele.
 *
 * A classe `perto` é a camada que põe, quadro a quadro, conforme a distância do
 * trem até o `data-atracao-s` (o ponto do trilho em frente à atração).
 */

function SinalDePassagem() {
  return (
    <g className="nt-pn">
      <rect x={-1.6} y={-58} width={3.2} height={58} rx={1.4} fill="#6E6A72" />
      {/* a cruz de santo André */}
      <g transform="translate(0 -50)">
        <rect x={-15} y={-2.6} width={30} height={5.2} rx={1} fill="#FFFFFF" stroke="#D6403A" strokeWidth={1.4} transform="rotate(32)" />
        <rect x={-15} y={-2.6} width={30} height={5.2} rx={1} fill="#FFFFFF" stroke="#D6403A" strokeWidth={1.4} transform="rotate(-32)" />
      </g>
      {/* as duas luzes que piscam alternadas */}
      <rect x={-13} y={-34} width={26} height={4} rx={2} fill="#3A2F3B" />
      <circle className="nt-pn-luz nt-pn-luz-a" cx={-9} cy={-27} r={4.2} />
      <circle className="nt-pn-luz nt-pn-luz-b" cx={9} cy={-27} r={4.2} />
      {/* o sino, em cima */}
      <g transform="translate(0 -61)">
        <g className="nt-pn-sino">
          <path d="M-4.5 2 Q-4.5 -5 0 -5 Q4.5 -5 4.5 2 L5.5 3.5 H-5.5 Z" fill="#F2B544" />
          <circle cy={4.4} r={1.3} fill="#D9952B" />
        </g>
      </g>
      {/* neve na base */}
      <ellipse cx={0} cy={0} rx={9} ry={2.6} fill="#FFFFFF" opacity={0.9} />
    </g>
  );
}

function Vilarejo() {
  return (
    <g>
      {/* pinheirinho atrás */}
      <path d="M44 -6 L54 -44 L64 -6 Z" fill="#2E7A47" />
      <path d="M47 -22 L54 -46 L61 -22 Z" fill="#3F9A5B" />
      {/* a casinha de gengibre */}
      <rect x={-30} y={-34} width={52} height={34} rx={3} fill="#C9844A" />
      <rect x={12} y={-32} width={10} height={32} fill="#000000" opacity={0.1} />
      <rect x={-30} y={-34} width={52} height={5} fill="#000000" opacity={0.14} />
      <path d="M-36 -32 L-4 -58 L28 -32 Z" fill="#A9683A" />
      <path d="M-37 -31 Q-30 -27 -24 -32 Q-17 -27 -11 -33 Q-4 -27 3 -33 Q10 -27 16 -32 Q22 -27 29 -31 L28 -35 L-4 -60 L-36 -35 Z" fill="#FFFFFF" />
      {/* balas de goma no telhado */}
      {([[-20, -41, '#D6403A'], [-4, -50, '#3F9A5B'], [12, -41, '#6BA6E0']] as const).map(([cx, cy, c]) => (
        <circle key={cx} cx={cx} cy={cy} r={2.6} fill={c} />
      ))}
      {/* janela acesa e a porta de bengala */}
      <rect x={-23} y={-25} width={12} height={10} rx={2} fill="#FFD98A" />
      <path d="M-17 -25 V-15 M-23 -20 H-11" stroke="#FFFFFF" strokeWidth={1.3} />
      <rect x={1} y={-21} width={12} height={21} rx={6} fill="#F6F0E7" />
      <path d="M2 -12 L12 -18 M2 -5 L12 -11 M3 1 L12 -4" stroke="#D6403A" strokeWidth={2} />
      {/* fumacinha da chaminé */}
      <rect x={10} y={-56} width={7} height={12} fill="#7A5236" />
      <circle className="nt-vila-fumaca" cx={13.5} cy={-62} r={3} />
      <circle className="nt-vila-fumaca nt-vila-fumaca-2" cx={13.5} cy={-62} r={3} />
      {/* neve na frente */}
      <ellipse cx={-4} cy={0} rx={40} ry={3.2} fill="#FFFFFF" opacity={0.9} />
    </g>
  );
}

function Boneco() {
  return (
    <g className="nt-boneco-trilho">
      <circle cx={0} cy={-13} r={13} fill="#FFFFFF" />
      <circle cx={0} cy={-34} r={9.5} fill="#FFFFFF" />
      <path d="M6 -24.5 A13 13 0 0 1 6 -1.5 A16 16 0 0 0 6 -24.5 Z M4 -42.6 A9.5 9.5 0 0 1 4 -25.4 A12 12 0 0 0 4 -42.6 Z" fill="#C9D6E3" opacity={0.75} />
      <circle cx={-3.2} cy={-36} r={1.3} fill="#2A2530" />
      <circle cx={3.2} cy={-36} r={1.3} fill="#2A2530" />
      <path d="M0 -33.5 L7 -32 L0 -31.5 Z" fill="#E8862F" />
      <ellipse cx={-5.5} cy={-31.5} rx={1.8} ry={1.1} fill="#FF94AA" opacity={0.7} />
      <ellipse cx={5.5} cy={-31.5} rx={1.8} ry={1.1} fill="#FF94AA" opacity={0.7} />
      <path d="M-9 -26 Q0 -22 9 -26 L9 -23 Q0 -19 -9 -23 Z" fill="#D6403A" />
      <rect x={3} y={-24} width={4} height={10} rx={1.5} fill="#D6403A" />
      <path d="M-5 -24.4 v2.6 M0 -23.4 v2.6 M3.6 -18.4 h2.8 M3.6 -16 h2.8" stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" opacity={0.85} />
      <rect x={-7} y={-52} width={14} height={11} rx={1.5} fill="#2A2530" />
      <rect x={-7} y={-45.4} width={14} height={2.6} fill="#D6403A" />
      <rect x={-5.6} y={-51} width={1.2} height={5} rx={0.6} fill="#FFFFFF" opacity={0.25} />
      <rect x={-10} y={-42.5} width={20} height={3} rx={1.5} fill="#2A2530" />
      <circle cx={0} cy={-14} r={1.2} fill="#2A2530" />
      <circle cx={0} cy={-8} r={1.2} fill="#2A2530" />
      {/* o braço que acena com o trem passando */}
      <g className="nt-boneco-braco">
        <path d="M10 -22 L22 -32" stroke="#6B4A2F" strokeWidth={2} strokeLinecap="round" />
        <path d="M18.5 -29 L20.5 -34" stroke="#6B4A2F" strokeWidth={1.4} strokeLinecap="round" />
      </g>
      <path d="M-10 -22 L-20 -16" stroke="#6B4A2F" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

function Pinheiros() {
  return (
    <g>
      {([[-22, 0.8], [0, 1.1], [24, 0.9]] as const).map(([x, k], i) => (
        <g key={x} transform={`translate(${x} 0) scale(${k})`}>
          <g className="nt-pinheiro" style={{ animationDelay: `${-i * 0.7}s` }}>
            <rect x={-2.5} y={-8} width={5} height={8} fill="#7A5236" />
            <path d="M-16 -8 L0 -40 L16 -8 Z" fill="#2E7A47" />
            <path d="M-12 -24 L0 -50 L12 -24 Z" fill="#3F9A5B" />
            <path d="M0 -50 L12 -24 H0 Z M0 -24 H8 L16 -8 H0 Z" fill="#14402A" opacity={0.22} />
            <path d="M-12 -24 Q-6 -27 0 -24 Q6 -27 12 -24 L10 -28 Q0 -31 -10 -28 Z" fill="#FFFFFF" />
            <path d="M-4 -46 L0 -50 L4 -46 Q0 -44 -4 -46 Z" fill="#FFFFFF" />
          </g>
        </g>
      ))}
    </g>
  );
}

/** Uma atração: o pé dela fica um tico acima do eixo do trilho (atrás dele). */
export function AtracaoDoTrilho({ a }: { a: Atracao }) {
  return (
    <g transform={`translate(${a.x.toFixed(1)} ${(a.y - 7).toFixed(1)})`} data-atracao-s={a.s} className="nt-atracao">
      {a.tipo === 'sinal' ? <SinalDePassagem />
        : a.tipo === 'vilarejo' ? <Vilarejo />
        : a.tipo === 'boneco' ? <Boneco />
        : <Pinheiros />}
    </g>
  );
}

/** Os enfeites baixinhos da beira do trilho, com o pé atrás dele (no máximo ~18 px de altura). */
export function EnfeiteDoTrilho({ e }: { e: Enfeite }) {
  return (
    <g transform={`translate(${e.x.toFixed(1)} ${(e.y - 5).toFixed(1)})`}>
      {e.tipo === 'bengala' ? (
        <g>
          <path d="M0 0 V-12 Q0 -17.5 4.5 -17.5 Q9 -17.5 9 -13" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" fill="none" />
          <path d="M0 0 V-12 Q0 -17.5 4.5 -17.5 Q9 -17.5 9 -13" stroke="#D6403A" strokeWidth={3.2} strokeDasharray="2.6 2.6" fill="none" />
          <ellipse cx={0} cy={0.5} rx={5} ry={1.6} fill="#FFFFFF" opacity={0.9} />
        </g>
      ) : e.tipo === 'presentinho' ? (
        <g>
          <rect x={-5.5} y={-10} width={11} height={10} rx={1.5} fill={Math.round(e.x / 150) % 2 ? '#3F9A5B' : '#6BA6E0'} />
          <rect x={-1} y={-10} width={2} height={10} fill="#F2B544" />
          <path d="M0 -10 C-4 -15 -7 -12 -3 -10 Z M0 -10 C4 -15 7 -12 3 -10 Z" fill="#D6403A" />
        </g>
      ) : (
        <g>
          <path d="M-11 0 Q-9 -7 -3 -6 Q0 -10 5 -6 Q10 -6 11 0 Z" fill="#B8C4D1" opacity={0.85} transform="translate(1.2 1.4)" />
          <path d="M-11 0 Q-9 -7 -3 -6 Q0 -10 5 -6 Q10 -6 11 0 Z" fill="#FFFFFF" />
          <path className="nt-brilho-neve" d="M2 -12 v3.4 M0.3 -10.3 h3.4" stroke="#F2B544" strokeWidth={1} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

const CORES_PISCA = ['#FF4D4D', '#F2B544', '#49C26E', '#6BA6E0', '#FF94AA'];
const PASSO_PISCA = 32;

/** O pisca-pisca ao longo da pista: o fio caindo em curvinhas e as lampadinhas, logo abaixo do trilho. */
export function PiscaPiscaDoTrilho({ p }: { p: PiscaPisca }) {
  const n = Math.max(0, Math.floor((p.x1 - p.x0) / PASSO_PISCA));
  const y = p.y + 9;
  const fio = Array.from({ length: n }, (_, i) =>
    `Q${p.x0 + i * PASSO_PISCA + PASSO_PISCA / 2} ${y + 4} ${p.x0 + (i + 1) * PASSO_PISCA} ${y}`).join(' ');
  return (
    <g>
      <path d={`M${p.x0} ${y} ${fio}`} stroke="#2E5E3B" strokeWidth={0.9} fill="none" opacity={0.8} />
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} className={`nt-pisca nt-pisca-${i % 3}`} cx={p.x0 + i * PASSO_PISCA + PASSO_PISCA / 2} cy={y + 3.4} r={2.3}
          fill={CORES_PISCA[i % CORES_PISCA.length]} />
      ))}
    </g>
  );
}
