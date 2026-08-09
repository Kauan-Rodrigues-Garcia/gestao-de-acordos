/**
 * pix_automatico.expurgo.test.ts
 *
 * O expurgo dos desaprovados é ACESSÓRIO: ele roda ao abrir a aba, antes da
 * listagem. Enquanto ele estourava, a exceção abortava o carregamento inteiro e
 * a aba Pix aparecia VAZIA — com 73 pendentes e 148 aprovados intactos no
 * banco. Estes testes protegem as duas travas contra isso voltar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();

/**
 * O mock imita a FORMA do SupabaseClient real, que faz
 * `rpc(fn, args) { return this.rest.rpc(...) }`.
 *
 * Uma arrow property (`rpc: (...a) => rpcMock(...a)`) funcionaria mesmo
 * desanexada do objeto e deixaria passar exatamente o bug que este arquivo
 * existe para pegar: guardar o método numa variável perde o `this` e estoura
 * "Cannot read properties of undefined (reading 'rest')". Mesmo motivo do
 * mock de `exclusaoUsuario.service.test.ts`.
 */
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rest: { rpc: (...a: unknown[]) => rpcMock(...a) },
    rpc(this: { rest: { rpc: (...a: unknown[]) => unknown } }, nome: string, args: unknown) {
      return this.rest.rpc(nome, args);
    },
    from: vi.fn(),
  },
}));

import { expurgarDesaprovadosVencidos } from './pix_automatico.service';

beforeEach(() => { rpcMock.mockReset(); });

describe('expurgarDesaprovadosVencidos', () => {
  it('chama a RPC com a empresa e devolve quantos saíram', async () => {
    rpcMock.mockResolvedValue({ data: 3, error: null });
    await expect(expurgarDesaprovadosVencidos('emp-1')).resolves.toBe(3);
    expect(rpcMock).toHaveBeenCalledWith('fn_pix_expurga_desaprovados', { p_empresa_id: 'emp-1' });
  });

  it('migration ainda não aplicada devolve 0, não erro', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Could not find the function public.fn_pix_expurga_desaprovados' },
    });
    await expect(expurgarDesaprovadosVencidos('emp-1')).resolves.toBe(0);
  });

  it('RPC que ESTOURA também devolve 0 — foi assim que a aba ficou vazia', async () => {
    rpcMock.mockImplementation(() => { throw new TypeError("Cannot read properties of undefined (reading 'rest')"); });
    await expect(expurgarDesaprovadosVencidos('emp-1')).resolves.toBe(0);
  });

  it('promessa rejeitada (rede caiu) não vira exceção para quem chamou', async () => {
    rpcMock.mockRejectedValue(new Error('Failed to fetch'));
    await expect(expurgarDesaprovadosVencidos('emp-1')).resolves.toBe(0);
  });

  it('data em formato inesperado vira 0 em vez de NaN', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(expurgarDesaprovadosVencidos('emp-1')).resolves.toBe(0);
  });
});
