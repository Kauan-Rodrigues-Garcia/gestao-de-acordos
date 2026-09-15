/**
 * «Alguém saiu do grupo» — pedido de 14/09/2026.
 *
 * `fn_chat_grupo_membros` só devolve quem ESTÁ no grupo. Quem saiu some do mapa
 * de autores, e o aviso dele virava «Alguém saiu do grupo». Estes testes fixam
 * de onde o nome passa a vir: da RPC que conhece todo mundo que já participou e,
 * enquanto ela não existir no banco, da leitura direta de `perfis`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc, mockFrom } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: (...args: unknown[]) => mockRpc(...args),
}));

import { nomesDeQuemParticipou } from './grupos.service';

describe('nomesDeQuemParticipou', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('usa a RPC, que conhece também quem já saiu', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { perfil_id: 'p-1', nome: 'Beatriz' },
        { perfil_id: 'p-2', nome: 'Kleber' },
        { perfil_id: 'p-3', nome: null },
      ],
      error: null,
    });

    const nomes = await nomesDeQuemParticipou('c-1', ['p-2']);

    expect(mockRpc).toHaveBeenCalledWith('fn_chat_participantes_nomes', { p_conversa: 'c-1' });
    expect(nomes.get('p-2')).toBe('Kleber');
    expect(nomes.get('p-1')).toBe('Beatriz');
    expect(nomes.has('p-3')).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sem a RPC no banco, cai na leitura de perfis só dos ids que faltam', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function' } });
    const inFn = vi.fn().mockResolvedValue({ data: [{ id: 'p-2', nome: 'Kleber' }], error: null });
    const select = vi.fn(() => ({ in: inFn }));
    mockFrom.mockReturnValue({ select });

    const nomes = await nomesDeQuemParticipou('c-1', ['p-2']);

    expect(mockFrom).toHaveBeenCalledWith('perfis');
    expect(select).toHaveBeenCalledWith('id, nome');
    expect(inFn).toHaveBeenCalledWith('id', ['p-2']);
    expect(nomes.get('p-2')).toBe('Kleber');
  });

  it('nada a procurar, nenhuma ida ao banco', async () => {
    const nomes = await nomesDeQuemParticipou('c-1', []);
    expect(nomes.size).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
