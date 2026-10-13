// Peças pequenas de interface, no visual do app (tema escuro).

import { COR, FONTE_MONO, SELO } from '../tema';

export const brl = (n: number, centavos = true) =>
  'R$ ' +
  n.toLocaleString('pt-BR', { minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 });

export const Card: React.FC<{ style?: React.CSSProperties; children: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      background: COR.card,
      border: `1px solid ${COR.borda}`,
      borderRadius: 14,
      padding: 22,
      boxSizing: 'border-box',
      ...style,
    }}
  >
    {children}
  </div>
);

export type TipoSelo = keyof typeof SELO;

export const Selo: React.FC<{ tipo: TipoSelo; children: React.ReactNode; style?: React.CSSProperties }> = ({ tipo, children, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 13,
      fontWeight: 600,
      padding: '4px 11px',
      borderRadius: 999,
      color: SELO[tipo].cor,
      background: SELO[tipo].fundo,
      border: `1px solid ${SELO[tipo].borda}`,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </span>
);

const CORES_AVATAR = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#ca8a04'];

export const Avatar: React.FC<{ nome: string; tamanho?: number; style?: React.CSSProperties }> = ({ nome, tamanho = 32, style }) => {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  const cor = CORES_AVATAR[[...nome].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES_AVATAR.length];
  return (
    <div
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${cor}, ${cor}aa)`,
        color: '#fff',
        fontSize: tamanho * 0.38,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {iniciais}
    </div>
  );
};

export const Rotulo: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: COR.textoSuave, letterSpacing: 0.6, textTransform: 'uppercase', ...style }}>{children}</div>
);

export const Numero: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{ fontFamily: FONTE_MONO, fontWeight: 600, fontVariantNumeric: 'tabular-nums', ...style }}>{children}</span>
);

/** Anel de luz que pulsa em volta do que a narração está apontando. */
export const Destaque: React.FC<{ ativo: number; raio?: number; style?: React.CSSProperties }> = ({ ativo, raio = 14, style }) => {
  if (ativo <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: -6,
        borderRadius: raio + 6,
        border: `2px solid rgba(92,200,245,${0.9 * ativo})`,
        boxShadow: `0 0 ${24 * ativo}px rgba(92,200,245,${0.45 * ativo}), inset 0 0 ${16 * ativo}px rgba(92,200,245,${0.15 * ativo})`,
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
};
