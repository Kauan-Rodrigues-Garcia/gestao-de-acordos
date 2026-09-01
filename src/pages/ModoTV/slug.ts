/**
 * slug.ts — o endereço da tela.
 *
 * O slug vira `/tv/<slug>`, e esse endereço é DIGITADO À MÃO no PC ligado à TV,
 * uma vez, por alguém agachado atrás de um monitor. Isso decide tudo aqui:
 * minúsculas (não há como ver se o Caps Lock está ligado num teclado que fica
 * atrás da TV), sem acento (teclado da máquina pode não ser ABNT) e sem espaço.
 *
 * O CHECK da tabela recusa o que não obedecer. Normalizar antes é o que evita
 * responder "violação de restrição" a quem só digitou "Recepção".
 */

/** O mesmo limite do CHECK em `tv_telas`. */
const MAX = 40;

export function normalizarSlug(bruto: string): string {
  return (bruto ?? '')
    .normalize('NFD')
    // Tira o acento, mantém a letra: "Recepção" → "Recepcao".
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // Hífen no começo ou no fim não passa no CHECK.
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX)
    // O corte acima pode ter deixado um hífen na ponta.
    .replace(/-+$/, '');
}
