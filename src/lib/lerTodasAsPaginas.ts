/**
 * Lê uma consulta do PostgREST até o fim — ou falha, nunca pela metade.
 *
 * O PostgREST devolve no máximo `max_rows` linhas por pedido (1000, em
 * `supabase/config.toml`), e corta EM SILÊNCIO: a resposta vem sem erro, só
 * mais curta. Cada serviço que precisava do conjunto inteiro escreveu o próprio
 * laço (`paginarTudo` no Pix, `paginarParalelo` no Analítico); este é o laço
 * comum para quem não pode aceitar meia lista.
 *
 * A diferença para os laços que já existiam é a regra de erro: aqui não há
 * "devolve o que já veio". Uma página que falha LANÇA, e quem chama decide
 * — porque há consultas, como a cópia das tabulações antes de excluir um
 * usuário, em que meia lista é pior que nenhuma.
 *
 * `montar(de, ate)` devolve a consulta já com o `range` aplicado e com ordem
 * TOTAL (termine em `.order('id')`): sem ordem estável, duas páginas podem
 * repetir ou pular uma linha.
 */
export const PAGINA_POSTGREST = 1000;

/** Teto de páginas: 200 mil linhas. Passar disso é engano de filtro, não dado. */
const MAX_PAGINAS = 200;

export async function lerTodasAsPaginas<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  opcoes: { tamanho?: number; maxPaginas?: number } = {},
): Promise<T[]> {
  const tamanho = opcoes.tamanho ?? PAGINA_POSTGREST;
  const maxPaginas = opcoes.maxPaginas ?? MAX_PAGINAS;
  const tudo: T[] = [];
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const de = pagina * tamanho;
    const { data, error } = await montar(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    const lote = (data as T[] | null) ?? [];
    tudo.push(...lote);
    if (lote.length < tamanho) return tudo;
  }
  // Chegou ao teto com a última página cheia: há mais, e devolver o que veio
  // seria exatamente o corte silencioso que esta função existe para evitar.
  throw new Error(`a consulta passou de ${maxPaginas * tamanho} linhas`);
}
