/**
 * campanhaAbate.ts — o «Não deu» sai do total da campanha.
 *
 * Sugestão da operação, aprovada pelo Cleber em 17/11/2026: o contato marcado
 * como «Não deu» (sem WhatsApp, número errado…) não é mensagem que o operador
 * deixou de mandar — é mensagem que não existia para mandar. Antes ele contava
 * no total, e quem tinha 100 contatos, enviou 90 e marcou 10 como «Não deu»
 * ficava em «90 de 100 · 90%» para sempre, com a barra que nunca enchia.
 *
 * Agora: 90 de 90 · 100%. O «Não deu» continua aparecendo à parte em todas as
 * telas, e «Voltar» num contato devolve ele ao total.
 *
 * Vale em todas as visões (operador, placar do líder, setor, dia) para o
 * operador e a gestão verem o mesmo número.
 */

/** O total que conta: contatos menos os «Não deu». */
export function totalAbatido(total: number, naoDeu: number): number {
  return Math.max(total - Math.max(naoDeu, 0), 0);
}

/**
 * Percentual enviado sobre o total abatido, de 0 a 100.
 *
 * Campanha em que TODOS deram «Não deu» não tem o que enviar: está concluída,
 * 100%. Campanha vazia (total 0) é 0%.
 */
export function pctAbatido(
  enviados: number, total: number, naoDeu: number,
  arredondar: (x: number) => number = Math.round,
): number {
  if (total <= 0) return 0;
  const base = totalAbatido(total, naoDeu);
  if (base === 0) return 100;
  return Math.min(100, Math.max(0, arredondar((enviados / base) * 100)));
}
