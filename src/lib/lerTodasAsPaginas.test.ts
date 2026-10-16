import { describe, it, expect, vi } from 'vitest';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';

/** Uma "tabela" de `n` linhas servida em páginas, como o PostgREST faz. */
function tabela(n: number) {
  const linhas = Array.from({ length: n }, (_, i) => ({ id: i }));
  return vi.fn(async (de: number, ate: number) => ({
    data: linhas.slice(de, ate + 1), error: null,
  }));
}

describe('lerTodasAsPaginas', () => {
  it('passa do teto de 1000 linhas do PostgREST', async () => {
    const montar = tabela(2_345);
    const linhas = await lerTodasAsPaginas<{ id: number }>(montar);
    expect(linhas).toHaveLength(2_345);
    expect(linhas[2_344].id).toBe(2_344);
    expect(montar).toHaveBeenCalledTimes(3);
  });

  it('página exatamente cheia pede mais uma, que volta vazia', async () => {
    const montar = tabela(1_000);
    expect(await lerTodasAsPaginas(montar)).toHaveLength(1_000);
    expect(montar).toHaveBeenCalledTimes(2);
  });

  it('erro numa página LANÇA — nunca devolve meia lista', async () => {
    let chamada = 0;
    const montar = async (de: number, ate: number) => {
      chamada++;
      if (chamada === 2) return { data: null, error: { message: 'timeout' } };
      return { data: Array.from({ length: ate - de + 1 }, (_, i) => ({ id: de + i })), error: null };
    };
    await expect(lerTodasAsPaginas(montar)).rejects.toThrow('timeout');
  });

  it('chegar ao teto de páginas com mais por vir também lança', async () => {
    await expect(lerTodasAsPaginas(tabela(50), { tamanho: 10, maxPaginas: 3 }))
      .rejects.toThrow(/passou de 30 linhas/);
  });
});
