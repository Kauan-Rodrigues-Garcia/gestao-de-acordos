/**
 * recharts-tooltip.ts — a forma que os tooltips deste projeto realmente leem.
 *
 * ## Por que não usar `TooltipProps` do próprio Recharts
 *
 * O tipo da biblioteca é genérico em dois parâmetros (`ValueType`, `NameType`),
 * muda de forma entre versões maiores e traz dezenas de campos que nenhum
 * tooltip daqui toca. Encaixá-lo renderia mais asserção do que tipo — que é
 * exatamente o que o `any` fazia, só que com nome comprido.
 *
 * Declarar o CONSUMIDO é mais honesto e quebra na hora certa: se um campo
 * mudar de nome no Recharts, o typecheck aponta o tooltip que o lia, e não uma
 * incompatibilidade genérica a três níveis de profundidade.
 *
 * Tudo é opcional porque o Recharts monta o tooltip antes de haver dado — o
 * `if (!active || !payload?.length) return null;` de cada componente é a
 * guarda que transforma isso em valores presentes dali para baixo.
 */

/** Uma série dentro do tooltip: a linha «nome: valor», com a cor da série. */
export interface ItemTooltipGrafico {
  name?:  string;
  value?: number;
  color?: string;
  /** A linha de dado original. `fill` e `qtd` são o que a pizza do Painel Diretoria usa. */
  payload?: { fill?: string; qtd?: number };
}

/** O que o Recharts entrega ao componente de tooltip. */
export interface PropsTooltipGrafico {
  active?:  boolean;
  payload?: ItemTooltipGrafico[];
  /** O eixo X do ponto — aqui sempre o dia. */
  label?:   string | number;
}
