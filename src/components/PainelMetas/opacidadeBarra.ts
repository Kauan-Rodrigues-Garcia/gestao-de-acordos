/**
 * O peso de cada barra da `EvolucaoDiaria`.
 *
 * Mora fora do componente por dois motivos. O teste precisa alcançar a regra:
 * o `ResponsiveContainer` mede 0×0 em jsdom e não desenha `Cell` nenhuma, então
 * verificá-la pelo DOM seria verificar o vazio. E um arquivo de componente que
 * exporta funções perde o Fast Refresh inteiro no desenvolvimento.
 */

/** Dia que alcançou a meta diária: barra cheia. */
const OPACIDADE_ACIMA = 1;
/** Dia abaixo da meta: mesma cor, menos peso. */
const OPACIDADE_ABAIXO = 0.32;
/** Sem meta cadastrada não há o que comparar — todos os dias pesam igual. */
const OPACIDADE_NEUTRA = 0.7;

export const OPACIDADES = {
  acima: OPACIDADE_ACIMA,
  abaixo: OPACIDADE_ABAIXO,
  neutra: OPACIDADE_NEUTRA,
} as const;

/**
 * Peso da barra de um dia.
 *
 * A fronteira é `>=`: bater a meta exata conta como alcançada.
 */
export function opacidadeDaBarra(recebido: number, metaDiaria: number | null): number {
  if (metaDiaria === null) return OPACIDADE_NEUTRA;
  return recebido >= metaDiaria ? OPACIDADE_ACIMA : OPACIDADE_ABAIXO;
}
