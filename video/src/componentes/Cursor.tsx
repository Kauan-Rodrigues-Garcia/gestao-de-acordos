// O cursor: anda entre pontos numa curva (gente não move o mouse em linha
// reta), acelera e freia, chega um tiquinho antes do clique, aperta e solta
// uma onda suave na cor do sistema. Desfoca de leve quando corre.

import { useCurrentFrame } from 'remotion';
import { desfoque, entre, ms, SUAVE } from '../movimento';

export type PontoCursor = {
  /** Frame em que o cursor CHEGA neste ponto. */
  f: number;
  x: number;
  y: number;
  /** Quanto tempo leva a viagem até aqui (ms). Padrão 650. */
  viagemMs?: number;
};

function curva(t: number) {
  // cubic-bezier(0.45, 0, 0.2, 1) aproximada: partida suave, chegada longa
  const p1 = 0.45;
  const p2 = 0.2;
  // resolve x(u) = t por Newton
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = 3 * (1 - u) * (1 - u) * u * p1 + 3 * (1 - u) * u * u * p2 + u * u * u;
    const dx = 3 * (1 - u) * (1 - u) * p1 + 6 * (1 - u) * u * (p2 - p1) + 3 * u * u * (1 - p2);
    if (Math.abs(dx) < 1e-6) break;
    u -= (x - t) / dx;
    u = Math.min(1, Math.max(0, u));
  }
  return 3 * (1 - u) * u * u + u * u * u;
}

export function posicaoCursor(frame: number, pontos: PontoCursor[]) {
  if (pontos.length === 0) return { x: 0, y: 0 };
  if (frame <= pontos[0].f) return { x: pontos[0].x, y: pontos[0].y };
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const saida = Math.max(a.f, b.f - ms(b.viagemMs ?? 650));
    if (frame <= b.f) {
      if (frame <= saida) return { x: a.x, y: a.y };
      const k = curva((frame - saida) / (b.f - saida));
      // arco: desvia para o lado, proporcional à distância
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const lado = i % 2 === 0 ? 1 : -1;
      const arco = Math.sin(k * Math.PI) * Math.min(46, dist * 0.09) * lado;
      return { x: a.x + dx * k + (-dy / dist) * arco, y: a.y + dy * k + (dx / dist) * arco };
    }
  }
  const u = pontos[pontos.length - 1];
  return { x: u.x, y: u.y };
}

type Props = {
  pontos: PontoCursor[];
  cliques: number[];
  /** O cursor vive dentro da câmera; isto desfaz o zoom só no tamanho dele. */
  escalaInversa?: number;
  visivelDe?: number;
  visivelAte?: number;
};

export const Cursor: React.FC<Props> = ({ pontos, cliques, escalaInversa = 1, visivelDe = -Infinity, visivelAte = Infinity }) => {
  const frame = useCurrentFrame();
  const { x, y } = posicaoCursor(frame, pontos);
  const antes = posicaoCursor(frame - 1, pontos);
  const vel = Math.hypot(x - antes.x, y - antes.y) / escalaInversa;
  const blur = desfoque(vel, 9, 2.5);

  const opac = Math.min(entre(frame, visivelDe, visivelDe + ms(300), 0, 1), entre(frame, visivelAte - ms(300), visivelAte, 1, 0));
  if (opac <= 0) return null;

  // aperto: encolhe no clique e volta com uma sobra mínima
  const ultimo = [...cliques].reverse().find((c) => c <= frame);
  const desde = ultimo === undefined ? Infinity : ((frame - ultimo) / 60) * 1000;
  const aperto = desde < 90 ? 1 - 0.16 * (desde / 90) : desde < 260 ? 0.84 + 0.18 * entre(desde, 90, 200, 0, 1, SUAVE) - 0.02 * entre(desde, 200, 260, 0, 1) : 1;

  return (
    <>
      {cliques.map((c) => {
        const t = frame - c;
        if (t < 0 || t > ms(650)) return null;
        const p = entre(frame, c, c + ms(650), 0, 1, SUAVE);
        const pos = posicaoCursor(c, pontos);
        const r = 34 * escalaInversa * (0.35 + 0.65 * p);
        return (
          <div key={c} style={{ position: 'absolute', left: pos.x, top: pos.y, width: 0, height: 0, pointerEvents: 'none', zIndex: 99 }}>
            <div
              style={{
                position: 'absolute',
                left: -r,
                top: -r,
                width: r * 2,
                height: r * 2,
                borderRadius: '50%',
                background: `radial-gradient(circle, color-mix(in oklch, var(--primary) ${Math.round(28 * (1 - p))}%, transparent) 0%, transparent 70%)`,
                border: `${1.6 * escalaInversa}px solid color-mix(in oklch, var(--primary) ${Math.round(70 * (1 - p))}%, transparent)`,
              }}
            />
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: `scale(${escalaInversa * aperto})`,
          transformOrigin: '0 0',
          opacity: opac,
          filter: `drop-shadow(0 3px 6px rgba(15,27,38,0.28))${blur ? ` blur(${blur}px)` : ''}`,
          pointerEvents: 'none',
          zIndex: 100,
        }}
      >
        <svg width={30} height={36} viewBox="0 0 30 36" style={{ display: 'block', marginLeft: -3, marginTop: -2 }}>
          <path d="M3.2 2.2 L3.2 27.6 L9.6 21.6 L14 31.8 L18.6 29.8 L14.3 19.9 L23 19.9 Z" fill="#111418" stroke="#ffffff" strokeWidth={2} strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );
};
