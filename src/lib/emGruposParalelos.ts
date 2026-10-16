/**
 * Processa itens em paralelo, com teto — mas em SEQUÊNCIA dentro do grupo.
 *
 * Nasceu para a exclusão em lote dos Acordos (16/10/2026). Cada acordo custa
 * de 3 a 4 idas ao banco (par Direto/Extra, lixeira, exclusão, NR), e o laço
 * esperava cada um terminar antes de começar o próximo: 100 selecionados eram
 * ~400 pedidos em fila indiana.
 *
 * Paralelizar tudo não serve: o Direto e o Extra do mesmo NR mexem um no
 * outro (`tratarExclusaoVinculo` promove o Extra quando o Direto sai), e os
 * dois ao mesmo tempo correriam um sobre o outro. Por isso o GRUPO — o mesmo
 * NR — anda em fila, e grupos diferentes andam juntos, até `limite` por vez.
 *
 * Erros não param os outros grupos: cada `fn` trata o próprio, como o laço
 * antigo fazia.
 */
export async function emGruposParalelos<T>(
  itens: readonly T[],
  chaveDoGrupo: (item: T) => string,
  limite: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDoGrupo(item);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(item); else grupos.set(chave, [item]);
  }

  const fila = [...grupos.values()];
  let proximo = 0;
  async function trabalhador(): Promise<void> {
    while (proximo < fila.length) {
      const grupo = fila[proximo++];
      for (const item of grupo) await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, fila.length)) }, trabalhador));
}
