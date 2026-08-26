import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: (...args: unknown[]) => mockRpc(...args),
}));

import { listarDestinosDisparo, PAGINA_DESTINOS_DISPARO } from './chat.service';

describe('listarDestinosDisparo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('carrega 50, normaliza as relações e sinaliza a próxima página', async () => {
    const linhas = Array.from({ length: PAGINA_DESTINOS_DISPARO + 1 }, (_, i) => ({
      perfil_id: `p-${i + 1}`,
      conversa_id: `c-${i + 1}`,
      nome: i === 0 ? '  Ana  ' : `Pessoa ${i + 1}`,
      usuario: i === 0 ? 'ana' : null,
      foto_url: null,
      empresa_slug: 'bookplay',
    }));
    mockRpc.mockResolvedValue({ data: linhas, error: null });

    const resultado = await listarDestinosDisparo('d-1', 50);

    expect(mockRpc).toHaveBeenCalledWith('fn_chat_destinos_disparo', {
      p_disparo: 'd-1',
      p_inicio: 50,
      p_limite: 51,
    });
    expect(resultado.temMais).toBe(true);
    expect(resultado.destinos).toHaveLength(50);
    expect(resultado.destinos[0]).toMatchObject({
      nome: 'Ana', usuario: 'ana', empresa_slug: 'bookplay', conversa_id: 'c-1',
    });
  });

  it('mantém a linha se um perfil histórico não tiver mais nome disponível', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        perfil_id: 'p-1', conversa_id: 'c-1', nome: null,
        usuario: null, foto_url: null, empresa_slug: null,
      }],
      error: null,
    });

    const resultado = await listarDestinosDisparo('d-1');

    expect(resultado.destinos).toEqual([{
      perfil_id: 'p-1',
      conversa_id: 'c-1',
      nome: 'Pessoa indisponível',
      usuario: null,
      foto_url: null,
      empresa_slug: null,
    }]);
  });

  it('transforma erro de leitura em mensagem segura para a interface', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const resultado = await listarDestinosDisparo('d-1');

    expect(resultado).toEqual({
      destinos: [], temMais: false, erro: 'Não foi possível carregar os destinatários.',
    });
  });
});
