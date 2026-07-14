/**
 * PizzaQuartis3D — distribuição dos operadores por quartil.
 *
 * SVG próprio em vez de recharts: o efeito 3D é uma elipse (rx > ry) com uma
 * parede lateral extrudada, e recharts só desenha setores circulares. Achatar
 * um PieChart via CSS `rotateX` funcionaria visualmente, mas deslocaria o
 * hit-test do tooltip do próprio recharts.
 */

import { COR_QUARTIL } from '@/lib/diasUteis';

export interface FatiaQuartil {
  quartil: number;
  qtd: number;
}

interface PizzaQuartis3DProps {
  fatias: FatiaQuartil[];
  /** Operadores com meta definida — base do 100% das porcentagens. */
  total: number;
  largura?: number;
}

const RX = 96;   // raio horizontal
const RY = 46;   // raio vertical (achatamento = perspectiva)
const DEPTH = 18; // espessura da parede

/** Ponto na elipse. ang em radianos, 0 = direita, cresce no sentido horário. */
function ponto(cx: number, cy: number, ang: number, rx = RX, ry = RY): [number, number] {
  return [cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)];
}

/** Escurece um hex #rrggbb por um fator (0..1) — cor da parede lateral. */
function escurecer(hex: string, fator: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * fator);
  const g = Math.round(((n >> 8) & 255) * fator);
  const b = Math.round((n & 255) * fator);
  return `rgb(${r},${g},${b})`;
}

export function PizzaQuartis3D({ fatias, total, largura = 240 }: PizzaQuartis3DProps) {
  const comDados = fatias.filter(f => f.qtd > 0);
  const cx = largura / 2;
  const cy = RY + 14;
  const altura = cy + RY + DEPTH + 14;

  if (total === 0 || comDados.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground italic"
        style={{ height: altura }}>
        Sem operadores com meta.
      </div>
    );
  }

  // Uma fatia só: arco de 360° degenera (início = fim), então desenha a elipse
  // inteira em vez de um path vazio.
  const unica = comDados.length === 1 ? comDados[0] : null;

  let ang = -Math.PI / 2;   // começa no topo
  const setores = comDados.map(f => {
    const varredura = (f.qtd / total) * Math.PI * 2;
    const a0 = ang;
    const a1 = ang + varredura;
    ang = a1;
    return { ...f, a0, a1, varredura };
  });

  return (
    <svg width={largura} height={altura} className="overflow-visible">
      {/* Paredes: só a metade frontal da elipse (sin > 0) é visível. Desenhadas
          antes do topo para o topo cobrir a emenda. */}
      {!unica && setores.map(s => {
        // Recorta a fatia contra o arco frontal [0, PI] (onde sin > 0). Fora
        // dele a parede fica atrás do topo e não se desenha.
        const ini = Math.max(s.a0, 0);
        const fim = Math.min(s.a1, Math.PI);
        if (fim <= ini) return null;
        const [x0, y0] = ponto(cx, cy, ini);
        const [x1, y1] = ponto(cx, cy, fim);
        return (
          <path
            key={`parede-${s.quartil}`}
            d={`M ${x0} ${y0}
                A ${RX} ${RY} 0 0 1 ${x1} ${y1}
                L ${x1} ${y1 + DEPTH}
                A ${RX} ${RY} 0 0 0 ${x0} ${y0 + DEPTH} Z`}
            fill={escurecer(COR_QUARTIL[s.quartil] ?? '#6366f1', 0.62)}
          />
        );
      })}
      {unica && (
        <>
          <path
            d={`M ${cx - RX} ${cy}
                A ${RX} ${RY} 0 0 0 ${cx + RX} ${cy}
                L ${cx + RX} ${cy + DEPTH}
                A ${RX} ${RY} 0 0 1 ${cx - RX} ${cy + DEPTH} Z`}
            fill={escurecer(COR_QUARTIL[unica.quartil] ?? '#6366f1', 0.62)}
          />
          <ellipse cx={cx} cy={cy} rx={RX} ry={RY}
            fill={COR_QUARTIL[unica.quartil] ?? '#6366f1'}
            stroke="rgba(0,0,0,0.18)" strokeWidth={0.75} />
        </>
      )}

      {/* Topo */}
      {!unica && setores.map(s => {
        const [x0, y0] = ponto(cx, cy, s.a0);
        const [x1, y1] = ponto(cx, cy, s.a1);
        const largo = s.varredura > Math.PI ? 1 : 0;
        return (
          <path
            key={`topo-${s.quartil}`}
            d={`M ${cx} ${cy} L ${x0} ${y0} A ${RX} ${RY} 0 ${largo} 1 ${x1} ${y1} Z`}
            fill={COR_QUARTIL[s.quartil] ?? '#6366f1'}
            stroke="rgba(0,0,0,0.18)"
            strokeWidth={0.75}
          />
        );
      })}
    </svg>
  );
}
