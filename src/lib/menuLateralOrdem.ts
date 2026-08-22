/**
 * Ordenação das abas do menu lateral.
 *
 * A ordem salva é uma lista de ROTAS, não de índices — é o que permite a
 * tabela envelhecer sem manutenção:
 *
 *   • aba nova no código, ausente da ordem salva → vai para o FIM, mantendo a
 *     posição relativa que tem no `NAV_ITEMS`. Ninguém precisa reeditar o menu
 *     depois de um deploy, e a aba não some por não estar na lista;
 *   • rota salva que não existe mais no código → ignorada, sem buraco.
 *
 * A função é pura e não conhece React: é ela que os testes cobrem, e não a
 * montagem do menu.
 */

export interface ItemOrdenavel {
  /** A rota, chave estável do item entre deploys. */
  to: string;
}

export function ordenarMenu<T extends ItemOrdenavel>(itens: T[], ordem: string[]): T[] {
  if (!ordem.length) return itens;

  const posicao = new Map<string, number>();
  ordem.forEach((rota, i) => {
    // `has` porque uma ordem salva com rota repetida não pode fazer a primeira
    // ocorrência perder para a segunda.
    if (!posicao.has(rota)) posicao.set(rota, i);
  });

  // `map` com o índice original antes de ordenar: `Array.prototype.sort` só
  // garante estabilidade dentro do mesmo motor, e aqui a posição relativa das
  // abas novas é comportamento, não detalhe.
  return itens
    .map((item, indiceOriginal) => ({ item, indiceOriginal }))
    .sort((a, b) => {
      const pa = posicao.get(a.item.to);
      const pb = posicao.get(b.item.to);
      const temA = pa !== undefined;
      const temB = pb !== undefined;
      // Quem está na ordem salva vem antes de quem não está.
      if (temA && !temB) return -1;
      if (!temA && temB) return 1;
      if (temA && temB) return pa! - pb!;
      return a.indiceOriginal - b.indiceOriginal;
    })
    .map(({ item }) => item);
}
