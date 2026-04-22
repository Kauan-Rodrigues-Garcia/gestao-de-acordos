/**
 * src/hooks/__tests__/useNotificacoes.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para o hook useNotificacoes.
 *
 * Cenários cobertos:
 *   1. Sem usuário logado → não chama fetch, não cria canal
 *   2. Estado inicial: loading=false, notificacoes=[]
 *   3. Fetch bem-sucedido → notificacoes populadas, naoLidas correto
 *   4. Fetch com erro → notificacoes=[], loading=false
 *   5. Realtime INSERT → adiciona notificação (sem duplicar)
 *   6. Realtime UPDATE → atualiza notificação existente
 *   7. Realtime DELETE → remove notificação
 *   8. Cleanup ao unmount → removeChannel chamado
 *   9. marcarLida → service chamado + estado atualizado localmente
 *  10. marcarTodasLidas → service chamado + todos marcados como lidos
 *  11. marcarTodasLidas sem user → early return
 *  12. limparTodas → service chamado + estado zerado
 *  13. limparTodas sem user → early return
 *  14. refresh → re-executa fetch
 *
 * Estratégia:
 *  - Services de notificacoes → vi.mock para isolar o hook
 *  - supabase.channel → builder encadeado com captura de handlers
 *  - useAuth → vi.mock com ref mutável
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── 1. vi.hoisted: spies criados ANTES de qualquer import ─────────────────────

const {
  mockFetchNotificacoes,
  mockMarcarComoLida,
  mockMarcarTodasLidas,
  mockLimparTodasNotificacoes,
  mockUserRef,
  mockChannel,
  mockRemoveChannel,
  capturedHandlersRef,
} = vi.hoisted(() => {
  const mockFetchNotificacoes      = vi.fn();
  const mockMarcarComoLida         = vi.fn();
  const mockMarcarTodasLidas       = vi.fn();
  const mockLimparTodasNotificacoes = vi.fn();

  const mockUserRef = { current: null as { id: string } | null };

  const mockRemoveChannel = vi.fn();

  // Captura handlers registrados via .on(event, filter, handler)
  const capturedHandlersRef: {
    current: Record<string, (payload: unknown) => void>;
  } = { current: {} };

  // Builder de canal encadeável
  const mockSubscribe = vi.fn().mockReturnValue({});
  const mockOn        = vi.fn();

  const channelObj = {
    on:        mockOn,
    subscribe: mockSubscribe,
  };

  mockOn.mockImplementation(
    (_type: string, config: { event: string }, handler: (p: unknown) => void) => {
      capturedHandlersRef.current[config.event] = handler;
      return channelObj;
    },
  );

  const mockChannel = vi.fn().mockReturnValue(channelObj);

  return {
    mockFetchNotificacoes,
    mockMarcarComoLida,
    mockMarcarTodasLidas,
    mockLimparTodasNotificacoes,
    mockUserRef,
    mockChannel,
    mockRemoveChannel,
    capturedHandlersRef,
  };
});

// ── 2. vi.mock ANTES dos imports do SUT ───────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel:       mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('@/services/notificacoes.service', () => ({
  fetchNotificacoes:        mockFetchNotificacoes,
  marcarComoLida:           mockMarcarComoLida,
  marcarTodasLidas:         mockMarcarTodasLidas,
  limparTodasNotificacoes:  mockLimparTodasNotificacoes,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserRef.current }),
}));

// ── 3. Import do SUT ──────────────────────────────────────────────────────────

import { useNotificacoes } from '../useNotificacoes';
import type { Notificacao } from '@/lib/supabase';

// ── 4. Helpers ────────────────────────────────────────────────────────────────

const USER_ID = 'user-test-123';

function makeNotificacao(overrides: Partial<Notificacao> = {}): Notificacao {
  return {
    id:        'notif-1',
    usuario_id: USER_ID,
    titulo:    'Teste',
    mensagem:  'Mensagem de teste',
    lida:      false,
    criado_em: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── 5. Testes ─────────────────────────────────────────────────────────────────

describe('useNotificacoes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandlersRef.current = {};
    mockFetchNotificacoes.mockResolvedValue([]);
    mockMarcarComoLida.mockResolvedValue(undefined);
    mockMarcarTodasLidas.mockResolvedValue(undefined);
    mockLimparTodasNotificacoes.mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockUserRef.current = null;
  });

  // ─── Guarda defensiva ────────────────────────────────────────────────────

  it('não chama fetchNotificacoes quando não há usuário logado', async () => {
    mockUserRef.current = null;

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetchNotificacoes).not.toHaveBeenCalled();
    expect(result.current.notificacoes).toEqual([]);
    expect(result.current.naoLidas).toBe(0);
  });

  // ─── Fetch bem-sucedido ──────────────────────────────────────────────────

  it('popula notificacoes e calcula naoLidas após fetch bem-sucedido', async () => {
    mockUserRef.current = { id: USER_ID };

    const dados: Notificacao[] = [
      makeNotificacao({ id: 'n1', lida: false }),
      makeNotificacao({ id: 'n2', lida: true }),
      makeNotificacao({ id: 'n3', lida: false }),
    ];
    mockFetchNotificacoes.mockResolvedValue(dados);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(3);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.naoLidas).toBe(2);
    expect(mockFetchNotificacoes).toHaveBeenCalledWith(USER_ID);
  });

  // ─── Fetch com erro ──────────────────────────────────────────────────────

  it('mantém notificacoes=[] quando fetch lança exceção', async () => {
    mockUserRef.current = { id: USER_ID };
    mockFetchNotificacoes.mockRejectedValue(new Error('DB error'));

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notificacoes).toEqual([]);
    expect(result.current.naoLidas).toBe(0);
  });

  // ─── Realtime: INSERT ────────────────────────────────────────────────────

  it('realtime INSERT adiciona nova notificação ao estado', async () => {
    mockUserRef.current = { id: USER_ID };
    const notif1 = makeNotificacao({ id: 'n1' });
    mockFetchNotificacoes.mockResolvedValue([notif1]);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(1);
    });

    const notif2 = makeNotificacao({ id: 'n2', titulo: 'Nova' });

    act(() => {
      capturedHandlersRef.current['INSERT']?.({ new: notif2 });
    });

    expect(result.current.notificacoes).toHaveLength(2);
    expect(result.current.notificacoes[0].id).toBe('n2');
  });

  it('realtime INSERT ignora duplicata (mesmo id)', async () => {
    mockUserRef.current = { id: USER_ID };
    const notif1 = makeNotificacao({ id: 'n1' });
    mockFetchNotificacoes.mockResolvedValue([notif1]);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(1);
    });

    act(() => {
      capturedHandlersRef.current['INSERT']?.({ new: notif1 });
    });

    expect(result.current.notificacoes).toHaveLength(1);
  });

  // ─── Realtime: UPDATE ────────────────────────────────────────────────────

  it('realtime UPDATE atualiza notificação existente', async () => {
    mockUserRef.current = { id: USER_ID };
    const notif = makeNotificacao({ id: 'n1', lida: false });
    mockFetchNotificacoes.mockResolvedValue([notif]);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(1);
    });

    const atualizada = { ...notif, lida: true };

    act(() => {
      capturedHandlersRef.current['UPDATE']?.({ new: atualizada });
    });

    expect(result.current.notificacoes[0].lida).toBe(true);
    expect(result.current.naoLidas).toBe(0);
  });

  // ─── Realtime: DELETE ────────────────────────────────────────────────────

  it('realtime DELETE remove notificação do estado', async () => {
    mockUserRef.current = { id: USER_ID };
    const n1 = makeNotificacao({ id: 'n1' });
    const n2 = makeNotificacao({ id: 'n2' });
    mockFetchNotificacoes.mockResolvedValue([n1, n2]);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(2);
    });

    act(() => {
      capturedHandlersRef.current['DELETE']?.({ old: { id: 'n1' } });
    });

    expect(result.current.notificacoes).toHaveLength(1);
    expect(result.current.notificacoes[0].id).toBe('n2');
  });

  it('realtime DELETE sem id no payload não altera estado', async () => {
    mockUserRef.current = { id: USER_ID };
    const n1 = makeNotificacao({ id: 'n1' });
    mockFetchNotificacoes.mockResolvedValue([n1]);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(1);
    });

    act(() => {
      capturedHandlersRef.current['DELETE']?.({ old: {} });
    });

    expect(result.current.notificacoes).toHaveLength(1);
  });

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  it('chama removeChannel ao desmontar quando há usuário', async () => {
    mockUserRef.current = { id: USER_ID };
    mockFetchNotificacoes.mockResolvedValue([]);

    const { unmount } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalled();
    });

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('não cria canal quando não há usuário (sem erro no unmount)', () => {
    mockUserRef.current = null;

    const { unmount } = renderHook(() => useNotificacoes());
    unmount();

    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });

  // ─── marcarLida ──────────────────────────────────────────────────────────

  it('marcarLida chama service e atualiza estado local', async () => {
    mockUserRef.current = { id: USER_ID };
    const n1 = makeNotificacao({ id: 'n1', lida: false });
    const n2 = makeNotificacao({ id: 'n2', lida: false });
    mockFetchNotificacoes.mockResolvedValue([n1, n2]);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(2);
    });

    await act(async () => {
      await result.current.marcarLida('n1');
    });

    expect(mockMarcarComoLida).toHaveBeenCalledWith('n1');
    const n1Updated = result.current.notificacoes.find(n => n.id === 'n1');
    expect(n1Updated?.lida).toBe(true);
    // n2 inalterada
    const n2Updated = result.current.notificacoes.find(n => n.id === 'n2');
    expect(n2Updated?.lida).toBe(false);
    expect(result.current.naoLidas).toBe(1);
  });

  // ─── marcarTodasLidas ────────────────────────────────────────────────────

  it('marcarTodasLidas chama service e marca todas como lidas', async () => {
    mockUserRef.current = { id: USER_ID };
    const notifs = [
      makeNotificacao({ id: 'n1', lida: false }),
      makeNotificacao({ id: 'n2', lida: false }),
    ];
    mockFetchNotificacoes.mockResolvedValue(notifs);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(2);
    });

    await act(async () => {
      await result.current.marcarTodasLidas();
    });

    expect(mockMarcarTodasLidas).toHaveBeenCalledWith(USER_ID);
    expect(result.current.naoLidas).toBe(0);
    result.current.notificacoes.forEach(n => {
      expect(n.lida).toBe(true);
    });
  });

  it('marcarTodasLidas faz early return quando não há usuário', async () => {
    mockUserRef.current = null;

    const { result } = renderHook(() => useNotificacoes());

    await act(async () => {
      await result.current.marcarTodasLidas();
    });

    expect(mockMarcarTodasLidas).not.toHaveBeenCalled();
  });

  // ─── limparTodas ─────────────────────────────────────────────────────────

  it('limparTodas chama service e esvazia o estado', async () => {
    mockUserRef.current = { id: USER_ID };
    const notifs = [
      makeNotificacao({ id: 'n1' }),
      makeNotificacao({ id: 'n2' }),
    ];
    mockFetchNotificacoes.mockResolvedValue(notifs);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(2);
    });

    await act(async () => {
      await result.current.limparTodas();
    });

    expect(mockLimparTodasNotificacoes).toHaveBeenCalledWith(USER_ID);
    expect(result.current.notificacoes).toEqual([]);
  });

  it('limparTodas faz early return quando não há usuário', async () => {
    mockUserRef.current = null;

    const { result } = renderHook(() => useNotificacoes());

    await act(async () => {
      await result.current.limparTodas();
    });

    expect(mockLimparTodasNotificacoes).not.toHaveBeenCalled();
  });

  // ─── refresh ─────────────────────────────────────────────────────────────

  it('refresh re-executa o fetch e atualiza estado', async () => {
    mockUserRef.current = { id: USER_ID };
    mockFetchNotificacoes.mockResolvedValueOnce([makeNotificacao({ id: 'n1' })]);
    mockFetchNotificacoes.mockResolvedValueOnce([
      makeNotificacao({ id: 'n1' }),
      makeNotificacao({ id: 'n2' }),
    ]);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(1);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.notificacoes).toHaveLength(2);
    expect(mockFetchNotificacoes).toHaveBeenCalledTimes(2);
  });

  // ─── naoLidas ────────────────────────────────────────────────────────────

  it('naoLidas conta corretamente apenas as não lidas', async () => {
    mockUserRef.current = { id: USER_ID };
    mockFetchNotificacoes.mockResolvedValue([
      makeNotificacao({ id: 'n1', lida: false }),
      makeNotificacao({ id: 'n2', lida: true }),
      makeNotificacao({ id: 'n3', lida: false }),
      makeNotificacao({ id: 'n4', lida: true }),
    ]);

    const { result } = renderHook(() => useNotificacoes());

    await waitFor(() => {
      expect(result.current.notificacoes).toHaveLength(4);
    });

    expect(result.current.naoLidas).toBe(2);
  });
});
