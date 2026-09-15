/**
 * A altura dos cards que ficam lado a lado no fim do painel de metas.
 *
 * «Progresso da meta» alterna entre o anel e as formas de pagamento, e o card
 * de Comissão fica ao lado dele. Cada um com a altura do próprio conteúdo fazia
 * o card crescer e encolher a cada clique, e a grade inteira pular junto
 * (pedido de 14/09/2026: «o card não precisa mudar de tamanho»).
 *
 * Uma altura só, FIXA, usada pelos dois — é por isso que mora num arquivo
 * próprio, e não dentro de um deles. O valor cabe a vista mais alta de hoje (as
 * formas de pagamento com seis famílias; a comissão com cinco faixas e a
 * indireta). Conteúdo além disso rola por dentro do card, nunca o estica.
 *
 * Classe literal de propósito: o Tailwind só gera o que encontra escrito.
 */
export const ALTURA_CARD_PROGRESSO = 'h-[26rem]';
