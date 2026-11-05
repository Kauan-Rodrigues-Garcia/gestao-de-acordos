/**
 * As medidas dos carros do trem (o desenho está em `Trem.tsx`).
 *
 * Cada carro é desenhado no seu próprio quadro: x de 0 ao comprimento dele, a
 * frente para a direita, as rodas encostando no trilho em y = `TRILHO_Y`.
 */

/** Onde as rodas encostam no trilho, em todos os carros. */
export const TRILHO_Y = 104;
/** O ponto mais alto do desenho (o gorro dos passageiros). */
export const TOPO_TREM = -28;
/** Altura do desenho, do alto dos gorros às rodas. */
export const ALTURA_TREM = TRILHO_Y - TOPO_TREM;
/** O raio da foto de cada passageiro: bem maior que o trem, de propósito (é a foto que importa). */
export const RAIO_PASSAGEIRO = 40;
/** Vão entre um carro e outro (o engate). */
export const VAO_ENTRE_CARROS = 8;

export interface PassageiroDoTrem {
  id: string;
  nome: string;
  setor: string | null;
  /** URL já resolvida da foto; sem ela, as iniciais. */
  foto: string | null;
}

export type IdCarro = 'locomotiva' | 'passageiros' | 'arvore' | 'presentes';

/** Os carros da frente para trás. Os cinco assentos: três no vagão de passageiros, dois no dos presentes. */
export const CARROS: readonly { id: IdCarro; comprimento: number }[] = [
  { id: 'locomotiva', comprimento: 120 },
  { id: 'passageiros', comprimento: 262 },
  { id: 'arvore', comprimento: 76 },
  { id: 'presentes', comprimento: 216 },
];

export const COMPRIMENTO_TREM =
  CARROS.reduce((s, c) => s + c.comprimento, 0) + VAO_ENTRE_CARROS * (CARROS.length - 1);

/**
 * Onde fica o meio de cada carro, medido do CENTRO do trem para a frente
 * (positivo = mais para a frente).
 */
export const MEIO_DOS_CARROS: readonly number[] = (() => {
  const meios: number[] = [];
  let frente = COMPRIMENTO_TREM / 2;
  for (const c of CARROS) {
    meios.push(frente - c.comprimento / 2);
    frente -= c.comprimento + VAO_ENTRE_CARROS;
  }
  return meios;
})();
