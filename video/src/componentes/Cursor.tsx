// O cursor: anda entre pontos com aceleração e freio, aperta no clique e
// solta uma onda de luz do ponto clicado. Desfoca de leve quando corre.

import { useCurrentFrame } from 'remotion';
import { desfoque, entre, ms, SUAVE, SUAVE_IDA_VOLTA } from '../movimento';

export type PontoCursor = {
  /** Frame em que o cursor CHEGA neste ponto. */
  f: number;
  x: number;
  y: number;
  /** Quanto tempo leva a viagem até aqui (ms). Padrão 650. */
  viagemMs?: number;
};

export function posicaoCursor(frame: number, pontos: PontoCursor[]) {
  if (pontos.length === 0) return { x: 0, y: 0 };
  if (frame <= pontos[0].f) return { x: pontos[0].x, y: pontos[0].y };
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const saida = Math.max(a.f, b.f - ms(b.viagemMs ?? 650));
    if (frame <= b.f) {
      if (frame <= saida) return { x: a.x, y: a.y };
      const k = SUAVE_IDA_VOLTA((frame - saida) / (b.f - saida));
      // arco leve: cursor de gente não anda em linha reta
      const arco = Math.sin(k * Math.PI) * Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - arco };
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
  const blur = desfoque(vel, 8, 3);

  const opac = Math.min(entre(frame, visivelDe, visivelDe + ms(250), 0, 1), entre(frame, visivelAte - ms(250), visivelAte, 1, 0));
  if (opac <= 0) return null;

  // aperto: o cursor encolhe um tiquinho no clique
  const ultimo = [...cliques].reverse().find((c) => c <= frame);
  const desdeClique = ultimo === undefined ? Infinity : frame - ultimo;
  const aperto = desdeClique < ms(160) ? 1 - 0.14 * Math.sin((desdeClique / ms(160)) * Math.PI) : 1;

  return (
    <>
      {cliques.map((c) => {
        const t = frame - c;
        if (t < 0 || t > ms(600)) return null;
        const p = entre(frame, c, c + ms(600), 0, 1, SUAVE);
        const pos = posicaoCursor(c, pontos);
        return (
          <div
            key={c}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: -60 * escalaInversa * p,
                top: -60 * escalaInversa * p,
                width: 120 * escalaInversa * p,
                height: 120 * escalaInversa * p,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(92,200,245,${0.35 * (1 - p)}) 0%, rgba(92,200,245,${0.12 * (1 - p)}) 55%, transparent 70%)`,
                border: `${2 * escalaInversa}px solid rgba(160,225,255,${0.7 * (1 - p)})`,
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
          filter: `drop-shadow(0 4px 8px rgba(0,0,0,0.45))${blur ? ` blur(${blur}px)` : ''}`,
          pointerEvents: 'none',
          zIndex: 50,
        }}
      >
        <svg width={34} height={40} viewBox="0 0 34 40" style={{ display: 'block', marginLeft: -4, marginTop: -3 }}>
          <path d="M4 3 L4 31 L11.5 24.5 L16.5 36 L21.5 33.8 L16.5 22.5 L26.5 22.5 Z" fill="#ffffff" stroke="#0b131b" strokeWidth={2.2} strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );
};
