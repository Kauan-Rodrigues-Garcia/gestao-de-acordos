/**
 * `buscarPessoasDoRanking`: a foto e o «fica fora» de quem está no ranking do
 * operador (20261023120000). O operador não lê `perfis` dos colegas, então isto
 * vem de uma RPC; sem a migration, a tela cai na leitura direta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockIn } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockIn: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({ select: () => ({ in: (...args: unknown[]) => mockIn(...args) }) }),
  },
}));

import { buscarPessoasDoRanking } from './analitico.service';

beforeEach(() => { mockRpc.mockReset(); mockIn.mockReset(); });

describe('buscarPessoasDoRanking', () => {
  it('lista vazia não vai ao banco', async () => {
    const r = await buscarPessoasDoRanking('emp', []);
    expect(r.fotos).toEqual({});
    expect(r.fora.size).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a RPC dá a foto de todos e quem fica fora', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: 'ana',   foto_url: 'ana.jpg', fora_do_ranking: false },
        { id: 'lider', foto_url: null,      fora_do_ranking: true },
      ],
      error: null,
    });
    const r = await buscarPessoasDoRanking('emp', ['ana', 'lider']);
    expect(mockRpc).toHaveBeenCalledWith('fn_analitico_ranking_pessoas', { p_empresa_id: 'emp', p_ids: ['ana', 'lider'] });
    expect(r.fotos).toEqual({ ana: 'ana.jpg', lider: null });
    expect([...r.fora]).toEqual(['lider']);
    expect(mockIn).not.toHaveBeenCalled();
  });

  it('sem a migration, as fotos que a RLS deixar e ninguém fora', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.fn_analitico_ranking_pessoas' } });
    mockIn.mockResolvedValue({ data: [{ id: 'eu', foto_url: 'eu.jpg' }], error: null });
    const r = await buscarPessoasDoRanking('emp', ['eu', 'colega']);
    expect(mockIn).toHaveBeenCalledWith('id', ['eu', 'colega']);
    expect(r.fotos).toEqual({ eu: 'eu.jpg' });
    expect(r.fora.size).toBe(0);
  });
});
