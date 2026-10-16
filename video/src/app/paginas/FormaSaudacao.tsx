// O sólido que fica ao lado da saudação no Dashboard (o `FormaSaudacao` do
// app, que usa o `NucleoHolografico` do CreatorsLab): um icosaedro aramado
// girando, arestas da frente na cor primária e as de trás apagadas.

import { useCurrentFrame } from 'remotion';

const FI = (1 + Math.sqrt(5)) / 2;
const VERTICES: [number, number, number][] = [
  [-1, FI, 0], [1, FI, 0], [-1, -FI, 0], [1, -FI, 0],
  [0, -1, FI], [0, 1, FI], [0, -1, -FI], [0, 1, -FI],
  [FI, 0, -1], [FI, 0, 1], [-FI, 0, -1], [-FI, 0, 1],
];
// arestas: pares de vértices à distância 2
const ARESTAS: [number, number][] = [];
for (let i = 0; i < VERTICES.length; i++) {
  for (let j = i + 1; j < VERTICES.length; j++) {
    const d = Math.hypot(...VERTICES[i].map((v, k) => v - VERTICES[j][k]));
    if (Math.abs(d - 2) < 0.01) ARESTAS.push([i, j]);
  }
}

export const FormaSaudacao: React.FC<{ tamanho?: number }> = ({ tamanho = 52 }) => {
  const f = useCurrentFrame();
  const a = f * 0.012;
  const b = 0.45 + Math.sin(f * 0.01) * 0.15;
  const pts = VERTICES.map(([x, y, z]) => {
    // gira no eixo Y e inclina no X
    const x1 = x * Math.cos(a) + z * Math.sin(a);
    const z1 = -x * Math.sin(a) + z * Math.cos(a);
    const y2 = y * Math.cos(b) - z1 * Math.sin(b);
    const z2 = y * Math.sin(b) + z1 * Math.cos(b);
    const esc = tamanho * 0.22 * (3.2 / (3.2 + z2 * 0.35));
    return { x: tamanho / 2 + x1 * esc, y: tamanho / 2 + y2 * esc, z: z2 };
  });
  const ordenadas = [...ARESTAS].sort((p, q) => pts[p[0]].z + pts[p[1]].z - (pts[q[0]].z + pts[q[1]].z));
  return (
    <span className="inline-block align-middle -my-2" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho}>
        {ordenadas.map(([i, j]) => {
          const frente = (pts[i].z + pts[j].z) / 2 > 0;
          return (
            <line
              key={`${i}-${j}`}
              x1={pts[i].x}
              y1={pts[i].y}
              x2={pts[j].x}
              y2={pts[j].y}
              stroke={frente ? 'var(--primary)' : 'var(--muted-foreground)'}
              strokeOpacity={frente ? 0.95 : 0.35}
              strokeWidth={frente ? 1.4 : 1}
            />
          );
        })}
        {pts.map((p, i) => (p.z > 0 ? <circle key={i} cx={p.x} cy={p.y} r={1.6} fill="var(--primary)" /> : null))}
      </svg>
    </span>
  );
};
