/**
 * papel.ts — as cores e a estampa do presente da abertura do Natal: o papel e
 * a fita. O laço mora em `arte.tsx`. O fim do vídeo
 * (`videos/src/natal/Montagem.tsx`) embrulha o mural com este mesmo papel:
 * mudou aqui, o vídeo precisa ser gravado de novo.
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
