/**
 * arte.tsx — o laço do presente da abertura do Natal (o papel e a fita estão
 * em `papel.ts`).
 *
 * Um desenho só para dois lugares: o presente da abertura (`PresenteDetalhado.tsx`)
 * e o fim do vídeo (`videos/src/natal/Montagem.tsx`), em que o mural é
 * embrulhado nesse mesmo papel, com essa fita e esse laço — e aí volta para
 * dentro do presente. Mudou aqui, muda nos dois (o vídeo precisa ser gravado
 * de novo).
 */
import type { CSSProperties } from 'react';
import { COR_FITA, COR_FITA_SOMBRA } from './papel';

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
