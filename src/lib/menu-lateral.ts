/** Remove IDs desconhecidos/duplicados e acrescenta novas abas no final. */
export function normalizarOrdemMenu(ordem: string[], idsValidos: string[]): string[] {
  const validos = new Set(idsValidos);
  const vistos = new Set<string>();
  const saida: string[] = [];

  for (const id of ordem) {
    if (!validos.has(id) || vistos.has(id)) continue;
    vistos.add(id);
    saida.push(id);
  }
  for (const id of idsValidos) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    saida.push(id);
  }
  return saida;
}

export function ordenarMenu<T extends { to: string }>(itens: T[], ordem: string[]): T[] {
  const posicao = new Map(ordem.map((id, indice) => [id, indice]));
  return [...itens].sort((a, b) =>
    (posicao.get(a.to) ?? Number.MAX_SAFE_INTEGER)
    - (posicao.get(b.to) ?? Number.MAX_SAFE_INTEGER));
}

/**
 * Substitui apenas a subsequência visível, preservando abas de outro tenant ou
 * ocultas por permissão nas posições relativas que já ocupavam.
 */
export function mesclarOrdemVisivel(ordemGlobal: string[], ordemVisivel: string[]): string[] {
  const visiveis = new Set(ordemVisivel);
  let indiceVisivel = 0;
  const saida = ordemGlobal.map(id => {
    if (!visiveis.has(id)) return id;
    return ordemVisivel[indiceVisivel++] ?? id;
  });
  for (; indiceVisivel < ordemVisivel.length; indiceVisivel++) {
    const id = ordemVisivel[indiceVisivel];
    if (!saida.includes(id)) saida.push(id);
  }
  return saida;
}
