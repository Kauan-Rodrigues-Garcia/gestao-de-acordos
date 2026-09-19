/**
 * busca.ts — o mesmo «procurar» em todas as caixas de busca do chat.
 *
 * Eram cinco filtros escritos à mão, todos com `toLowerCase().includes()`: quem
 * digitava «joao» não achava «João», e «ana silva» não achava «Ana Paula
 * Silva». É exatamente assim que alguém com pressa digita um nome.
 *
 * Agora: sem acento, sem caixa, e cada palavra do termo precisa aparecer em
 * algum lugar — nome, login, setor, equipe —, em qualquer ordem.
 */

const ACENTOS = /[̀-ͯ]/g;

/** Sem acento, minúsculo e sem espaço nas pontas. */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(ACENTOS, '').toLowerCase().trim();
}

/** O termo em palavras — vazio quando não há o que procurar. */
export function palavrasDaBusca(termo: string): string[] {
  return normalizarBusca(termo).split(/\s+/).filter(Boolean);
}

/**
 * O texto onde a busca procura, já normalizado.
 *
 * Existe à parte para a lista montar isto UMA vez por pessoa, e não a cada
 * tecla: com a empresa inteira na tela, normalizar centenas de nomes por
 * caractere digitado é o que fazia a digitação engasgar.
 */
export function chaveDeBusca(...campos: (string | null | undefined)[]): string {
  return normalizarBusca(campos.filter(Boolean).join(' '));
}

/** Toda palavra do termo aparece na chave? Termo vazio casa com tudo. */
export function casaBusca(chave: string, palavras: string[]): boolean {
  return palavras.every(p => chave.includes(p));
}
