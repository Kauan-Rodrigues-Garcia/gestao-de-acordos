/**
 * cacheCurto.test.ts — as três garantias do cache curto, e as duas armadilhas.
 *
 *   1. busca em curso compartilhada
 *   2. validade
 *   3. invalidação na hora — inclusive DURANTE a busca: a resposta que chega
 *      depois de uma gravação pode ser de antes dela, e não pode ser guardada
 *
 * Armadilhas: erro não é guardado; `guardarSe` recusa a resposta vazia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  espiarCache, invalidarCache, lerComCache, limparCacheCurto,
} from '../cacheCurto';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { limparCacheCurto(); vi.useRealTimers(); });

function adiado<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
}

describe('lerComCache', () => {
  it('quem pede junto espera a MESMA busca', async () => {
    const d = adiado<number>();
    const buscar = vi.fn(() => d.promessa);

    const a = lerComCache('k', 1_000, buscar);
    const b = lerComCache('k', 1_000, buscar);
    d.resolver(7);

    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('dentro da validade não busca; depois dela, busca de novo', async () => {
    const buscar = vi.fn(async () => 'x');
    await lerComCache('k', 1_000, buscar);
    vi.advanceTimersByTime(999);
    await lerComCache('k', 1_000, buscar);
    expect(buscar).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2);
    await lerComCache('k', 1_000, buscar);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('invalidar por prefixo descarta só o que começa com ele', async () => {
    const buscar = vi.fn(async () => 1);
    await lerComCache('composicao:e1:hoje', 60_000, buscar);
    await lerComCache('metas:e1', 60_000, buscar);

    invalidarCache('composicao:');
    await lerComCache('composicao:e1:hoje', 60_000, buscar);
    await lerComCache('metas:e1', 60_000, buscar);

    expect(buscar).toHaveBeenCalledTimes(3);
  });

  it('resposta de uma busca invalidada no meio é entregue, mas NÃO guardada', async () => {
    const d = adiado<string>();
    const pedido = lerComCache('k', 60_000, () => d.promessa);

    invalidarCache('k');          // alguém gravou enquanto a busca corria
    d.resolver('de antes da gravação');
    expect(await pedido).toBe('de antes da gravação');

    expect(espiarCache('k', 60_000)).toBeUndefined();
    const nova = vi.fn(async () => 'de depois');
    expect(await lerComCache('k', 60_000, nova)).toBe('de depois');
    expect(nova).toHaveBeenCalledTimes(1);
  });

  it('erro não é guardado: rejeita para quem esperava e a próxima tenta de novo', async () => {
    const falha = vi.fn(async () => { throw new Error('rede'); });
    await expect(lerComCache('k', 60_000, falha)).rejects.toThrow('rede');

    const ok = vi.fn(async () => 'voltou');
    expect(await lerComCache('k', 60_000, ok)).toBe('voltou');
  });

  it('guardarSe recusa a resposta vazia (a busca que engole erro)', async () => {
    const vazia = vi.fn(async () => [] as number[]);
    await lerComCache('k', 60_000, vazia, { guardarSe: l => l.length > 0 });
    await lerComCache('k', 60_000, vazia, { guardarSe: l => l.length > 0 });
    expect(vazia).toHaveBeenCalledTimes(2);
  });

  it('espiarCache devolve o guardado válido sem buscar', async () => {
    expect(espiarCache('k', 1_000)).toBeUndefined();
    await lerComCache('k', 1_000, async () => ({ pronto: true }));
    expect(espiarCache('k', 1_000)).toEqual({ pronto: true });
    vi.advanceTimersByTime(1_001);
    expect(espiarCache('k', 1_000)).toBeUndefined();
  });
});
