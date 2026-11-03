/**
 * pontuacao.ts — a pontuação das medalhas, para o ranking do portal de 30/10.
 *
 * ## O pedido (26/10/2026)
 *
 * «Um ranking do pessoal que teve maior pontuação de medalhas.» Contar só as
 * insígnias empata demais (são cinco, e muita gente tem todas), então a conta
 * usa o que o álbum já guarda de cada uma — nada novo no banco:
 *
 *   100  por insígnia que tem
 *     5  por zumbi pego / bruxa derrubada (`vezes` da caça)
 *    10  a mais por tiro na cabeça (`headshots`)
 *    20  por chefe derrotado com dano seu (`vezes` do chefe: cada rodada)
 *    50  por chefe em que deu o golpe final (o álbum guarda sim/não por chefe)
 *
 * O maior dano não entra: cada chefe tem uma escala de vida diferente, e a
 * conta ficaria injusta entre eles. No empate de pontos vale a ordem do álbum
 * (quem completou antes, depois o nome).
 *
 * Os pesos estão todos em `PESOS`: para ajustar, é só ali.
 */
import { INSIGNIAS, ordenarAlbuns, quantas, type Album, type IdInsignia } from './insignias';

export const PESOS = {
  insignia: 100,
  pego: 5,
  naCabeca: 10,
  chefeDerrotado: 20,
  golpeFinal: 50,
} as const;

const DA_CACA: readonly IdInsignia[] = ['zumbi', 'bruxas'];
const CHEFES: readonly IdInsignia[] = ['reiDoPop', 'pantano', 'guerra'];

/** De onde vieram os pontos (as quantidades, não os pontos). */
export interface Detalhe {
  insignias: number;
  pegos: number;
  naCabeca: number;
  chefesDerrotados: number;
  golpesFinais: number;
}

export function detalhar(a: Pick<Album, 'conquistas'>): Detalhe {
  const d: Detalhe = { insignias: quantas(a), pegos: 0, naCabeca: 0, chefesDerrotados: 0, golpesFinais: 0 };
  for (const id of DA_CACA) {
    const c = a.conquistas[id];
    if (!c) continue;
    d.pegos += c.vezes;
    d.naCabeca += c.headshots;
  }
  for (const id of CHEFES) {
    const c = a.conquistas[id];
    if (!c) continue;
    d.chefesDerrotados += c.vezes;
    if (c.golpeFinal) d.golpesFinais += 1;
  }
  return d;
}

export function pontos(a: Pick<Album, 'conquistas'>): number {
  const d = detalhar(a);
  return d.insignias * PESOS.insignia
    + d.pegos * PESOS.pego
    + d.naCabeca * PESOS.naCabeca
    + d.chefesDerrotados * PESOS.chefeDerrotado
    + d.golpesFinais * PESOS.golpeFinal;
}

/** A conta por extenso, para conferir: «Insígnias 5 × 100 = 500 · …». */
export function explicar(a: Pick<Album, 'conquistas'>): string {
  const d = detalhar(a);
  const partes: [string, number, number][] = [
    ['Insígnias', d.insignias, PESOS.insignia],
    ['Zumbis e bruxas', d.pegos, PESOS.pego],
    ['Na cabeça', d.naCabeca, PESOS.naCabeca],
    ['Chefes derrotados', d.chefesDerrotados, PESOS.chefeDerrotado],
    ['Golpe final', d.golpesFinais, PESOS.golpeFinal],
  ];
  return partes
    .filter(([, n]) => n > 0)
    .map(([nome, n, peso]) => `${nome} ${n} × ${peso} = ${n * peso}`)
    .concat(`Total ${pontos(a)}`)
    .join(' · ');
}

/** Mais pontos primeiro; no empate, a ordem do álbum (`ordenarAlbuns`). */
export function ordenarPorPontos(albuns: Iterable<Album>): Album[] {
  const base = ordenarAlbuns(albuns);
  const posicao = new Map(base.map((a, i) => [a.usuario, i]));
  return base.sort((x, y) => pontos(y) - pontos(x) || posicao.get(x.usuario)! - posicao.get(y.usuario)!);
}

/** Confere que todo id de insígnia caiu num dos dois grupos acima. */
export const INSIGNIAS_SEM_GRUPO = INSIGNIAS.map(i => i.id).filter(id => !DA_CACA.includes(id) && !CHEFES.includes(id));
