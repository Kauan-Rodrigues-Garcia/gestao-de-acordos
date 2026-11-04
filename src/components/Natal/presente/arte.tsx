/**
 * arte.tsx — o presente da abertura do Natal: o papel, a fita e o laço.
 *
 * Um desenho só para dois lugares: o presente no alto da tela (`Presente.tsx`)
 * e o fim do vídeo (`videos/src/natal/Montagem.tsx`), em que o mural é
 * embrulhado nesse mesmo papel, com essa fita e esse laço — e aí volta para
 * dentro do presente. Mudou aqui, muda nos dois (o vídeo precisa ser gravado
 * de novo).
 */
import type { CSSProperties } from 'react';

export const COR_PAPEL = '#c1121f';
export const COR_PAPEL_SOMBRA = '#8f0b17';
export const COR_FITA = '#f4c542';
export const COR_FITA_SOMBRA = '#c98f17';

/**
 * O papel: vermelho com bolinhas brancas e douradas. `passo` é o tamanho da
 * estampa (o presente pequeno usa uma estampa miúda; o embrulho da tela, uma
 * graúda).
 */
export function estiloDoPapel(passo: number): CSSProperties {
  const b = Math.max(1.5, passo * 0.07), d = Math.max(1, passo * 0.045);
  return {
    backgroundColor: COR_PAPEL,
    backgroundImage: [
      `radial-gradient(circle, rgba(255,255,255,.92) 0 ${b}px, transparent ${b + 0.8}px)`,
      `radial-gradient(circle, ${COR_FITA} 0 ${d}px, transparent ${d + 0.8}px)`,
      `linear-gradient(135deg, rgba(255,255,255,.06) 25%, transparent 25% 50%, rgba(255,255,255,.06) 50% 75%, transparent 75%)`,
    ].join(', '),
    backgroundSize: `${passo}px ${passo}px, ${passo}px ${passo}px, ${passo * 2}px ${passo * 2}px`,
    backgroundPosition: `0 0, ${passo / 2}px ${passo / 2}px, 0 0`,
  };
}

/** A fita: dourada, com o brilho no meio. `vertical` deita o degradê. */
export function estiloDaFita(vertical: boolean): CSSProperties {
  const dir = vertical ? '90deg' : '180deg';
  return {
    background: `linear-gradient(${dir}, ${COR_FITA_SOMBRA} 0%, ${COR_FITA} 22%, #fff1b8 50%, ${COR_FITA} 78%, ${COR_FITA_SOMBRA} 100%)`,
    boxShadow: '0 0 0 1px rgba(120, 70, 0, .25)',
  };
}

/** O laço: duas alças, as pontas caídas e o nó. Desenhado em 120 × 80. */
export function Laco({ largura = 120, className, style }: { largura?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 120 80" width={largura} height={(largura * 80) / 120} className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="laco-ouro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset=".45" stopColor={COR_FITA} />
          <stop offset="1" stopColor={COR_FITA_SOMBRA} />
        </linearGradient>
      </defs>
      {/* As pontas caídas */}
      <path d="M56 44 L40 76 L48 72 L52 79 L60 48 Z" fill={COR_FITA_SOMBRA} />
      <path d="M64 44 L80 76 L72 72 L68 79 L60 48 Z" fill={COR_FITA_SOMBRA} />
      {/* As alças */}
      <path d="M60 40 C44 10, 8 12, 10 32 C12 50, 42 50, 60 40 Z" fill="url(#laco-ouro)" stroke={COR_FITA_SOMBRA} strokeWidth="1.5" />
      <path d="M60 40 C76 10, 112 12, 110 32 C108 50, 78 50, 60 40 Z" fill="url(#laco-ouro)" stroke={COR_FITA_SOMBRA} strokeWidth="1.5" />
      <path d="M58 38 C46 24, 24 22, 22 32 C26 30, 44 32, 58 40 Z" fill="rgba(140,80,0,.28)" />
      <path d="M62 38 C74 24, 96 22, 98 32 C94 30, 76 32, 62 40 Z" fill="rgba(140,80,0,.28)" />
      {/* O nó */}
      <rect x="51" y="31" width="18" height="16" rx="6" fill="url(#laco-ouro)" stroke={COR_FITA_SOMBRA} strokeWidth="1.5" />
    </svg>
  );
}
