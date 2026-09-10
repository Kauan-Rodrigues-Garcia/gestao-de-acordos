import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  perfilId: 'eu' as string | null,
  /** O que a consulta a `equipe_lideres` devolve. */
  resposta: { data: [] as unknown[], error: null as { message: string } | null },
  /** Se `true`, o construtor de consulta estoura antes de virar promessa. */
  estourar: false,
  eqRecebido: null as [string, string] | null,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: mock.perfilId ? { id: mock.perfilId } : null }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (coluna: string, valor: string) => {
          mock.eqRecebido = [coluna, valor];
          if (mock.estourar) return {};        // sem `.limit`, como um dublê incompleto
          return { limit: () => mock.resposta };
        },
      }),
    }),
  },
}));

import { useLideroEquipe } from '../useLideroEquipe';

describe('useLideroEquipe', () => {
  beforeEach(() => {
    mock.perfilId = 'eu';
    mock.resposta = { data: [], error: null };
    mock.estourar = false;
    mock.eqRecebido = null;
  });

  it('sem vínculo em equipe_lideres, não lidero', async () => {
    const { result } = renderHook(() => useLideroEquipe());
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.lidero).toBe(false);
    // A pergunta é pelo vínculo explícito, não pela equipe do cadastro.
    expect(mock.eqRecebido).toEqual(['lider_id', 'eu']);
  });

  it('com uma equipe liderada, lidero — basta uma', async () => {
    mock.resposta = { data: [{ equipe_id: 'e1' }], error: null };
    const { result } = renderHook(() => useLideroEquipe());
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.lidero).toBe(true);
  });

  /*
   * Falhar para `false` mantém o Dashboard abrindo onde abria antes. Trocar em
   * que altura a tela abre por causa de uma queda de rede seria pior que o
   * defeito que este hook veio corrigir.
   */
  it('erro do banco não vira exceção: cai em false e destrava a tela', async () => {
    mock.resposta = { data: [], error: { message: 'permission denied' } };
    const { result } = renderHook(() => useLideroEquipe());
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.lidero).toBe(false);
  });

  it('construtor de consulta que estoura também destrava a tela', async () => {
    mock.estourar = true;
    const { result } = renderHook(() => useLideroEquipe());
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.lidero).toBe(false);
  });

  it('sem sessão resolvida não trava em carregando', async () => {
    mock.perfilId = null;
    const { result } = renderHook(() => useLideroEquipe());
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.lidero).toBe(false);
    expect(mock.eqRecebido).toBeNull();
  });
});
