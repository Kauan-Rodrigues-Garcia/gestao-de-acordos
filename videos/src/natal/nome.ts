// O nome de quem aparece no vídeo, em destaque (08/11/2026): o mesmo dourado
// aceso em todo canto — a faixa e o placar dos zumbis, as lápides, o top do
// Rei do Pop, as bruxas, as corridas. Num fundo cheio de branco, o nome é o
// que salta.

import type { CSSProperties } from 'react';

export const COR_NOME = '#ffe27a';

/** Sobre o escuro (faixas, placares, listas): dourado com brilho em volta. */
export const NOME: CSSProperties = {
  color: COR_NOME,
  textShadow: '0 0 14px rgba(255, 196, 64, .7), 0 2px 0 rgba(70, 40, 0, .55)',
};

/** Na pedra cinza da lápide: o mesmo dourado, com contorno escuro para ler. */
export const NOME_NA_PEDRA: CSSProperties = {
  color: COR_NOME,
  textShadow: '-1px -1px 0 #2a1f05, 1px -1px 0 #2a1f05, -1px 1px 0 #2a1f05, 1px 1px 0 #2a1f05, 0 2px 0 #2a1f05, 0 0 12px rgba(255, 196, 64, .65)',
};
