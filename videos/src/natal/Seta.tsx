// O mouse comum do Windows (a seta), andando em curva como gente. Serve ao
// sistema (nas coordenadas do app) e à montagem (nas da tela).

import { useCurrentFrame } from 'remotion';
import { posicaoCursor, type PontoCursor } from '../componentes/Cursor';
import { entre, ms } from '../movimento';

/** Aperta no clique; `segura` são os trechos com o botão apertado (arrastando a aranha). */
export const Seta: React.FC<{ pontos: PontoCursor[]; cliques: number[]; segura?: [number, number][]; tamanho?: number }> = ({ pontos, cliques, segura = [], tamanho = 1 }) => {
  const f = useCurrentFrame();
  const ini = pontos[0].f, fim = pontos[pontos.length - 1].f;
  if (f < ini - ms(400) || f > fim + ms(300)) return null;
  const { x, y } = posicaoCursor(f, pontos);
  const apertado = cliques.some(c => f >= c && f < c + ms(120)) || segura.some(([a, b]) => f >= a && f < b);
  const op = entre(f, ini - ms(400), ini, 0, 1) * (1 - entre(f, fim, fim + ms(300), 0, 1));
  return (
    <svg width={20 * tamanho} height={28 * tamanho} viewBox="0 0 20 28" style={{ position: 'absolute', left: x, top: y, opacity: op, transform: `scale(${apertado ? 0.88 : 1})`, transformOrigin: '0 0', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.35))', zIndex: 50 }}>
      <path d="M1 1 L1 22 L6.2 17.2 L9.6 25.4 L13 24 L9.6 15.9 L16.6 15.9 Z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
};
