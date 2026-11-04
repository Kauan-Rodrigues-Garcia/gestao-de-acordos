/**
 * varal.ts — a geometria do varal de luzinhas (`CenaNatal.tsx`), num módulo à
 * parte para quem pendura coisa nele sem carregar a cena inteira: a bola da
 * saudação (`BolaDaSaudacao.tsx`) mede onde o fio passa por cima dela.
 */

/** Largura de um vão do varal, de um prego ao outro. */
export const VAO = 150;

/** Ponto da curva do fio: começa e termina em y = 4, desce 10 px no meio. */
export const naCurva = (t: number) => ({ x: VAO * t, y: 4 + 40 * t * (1 - t) });
