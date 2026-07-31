/**
 * frases.ts — o que se diz ao parabenizar.
 *
 * Frases prontas em vez de campo livre, de propósito: o clique é para ser
 * imediato, no meio do expediente, e um campo de texto no meio da comemoração
 * transformaria um gesto de dois segundos numa tarefa. Também evita que a
 * comemoração de alguém vire mural de piada interna.
 *
 * A frase é sorteada NO CLIENTE que clicou e gravada na linha — assim todo
 * mundo vê a mesma coisa. Sortear na hora de exibir faria cada tela mostrar
 * uma frase diferente para o mesmo parabéns.
 */

export const FRASES = [
  'Parabéns pela meta!',
  'Você conseguiu!',
  'Que orgulho!',
  'Merecido demais!',
  'Arrasou!',
  'É isso aí!',
  'Show de bola!',
  'Tá voando!',
  'Sucesso!',
  'Mandou muito bem!',
] as const;

export type Frase = typeof FRASES[number];

/**
 * Sorteia uma frase.
 *
 * `aleatorio` é injetável para o teste poder fixar o resultado — sem isso, um
 * teste de sorteio ou é frouxo ou é instável.
 */
export function sortearFrase(aleatorio: () => number = Math.random): Frase {
  const indice = Math.floor(aleatorio() * FRASES.length);
  // `Math.random()` devolve [0,1), mas um mock pode devolver 1 e estourar o
  // fim do array — o clamp evita `undefined` chegando ao banco.
  return FRASES[Math.min(Math.max(0, indice), FRASES.length - 1)];
}

/**
 * A frase que veio do banco, ou uma padrão.
 *
 * A coluna é texto livre do ponto de vista do Postgres; se um dia chegar vazia
 * ou com lixo, o balão ainda precisa dizer alguma coisa.
 */
export function fraseValida(valor: string | null | undefined): string {
  const limpa = (valor ?? '').trim();
  return limpa || FRASES[0];
}
