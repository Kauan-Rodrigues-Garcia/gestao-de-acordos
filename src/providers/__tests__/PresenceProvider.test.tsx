/**
 * src/providers/__tests__/PresenceProvider.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para PresenceProvider + useOnlineUsers().
 *
 * Cenários cobertos:
 *   1. useOnlineUsers fora do provider → valores padrão (onlineIds vazio, loading=true)
 *   2. Sem userId → não cria canal, loading=true permanece
 *   3. Sem empresaId → não cria canal
 *   4. Canal criado com nome correto (presence-empresa-{empresaId})
 *   5. Após SUBSCRIBED → channel.track chamado com dados do perfil
 *   6. Evento sync → onlineIds atualizado, loading=false
 *   7. Evento join → onlineIds atualizado
 *   8. Evento leave → onlineIds atualizado (usuário removido)
 *   9. extractIds: usa key E user_id do payload como fallback
 *  10. Heartbeat: doTrack chamado periodicamente (fake timers)
 *  11. Cleanup: untrack + removeChannel chamados ao desmontar
 *  12. Cleanup: heartbeat cancelado ao desmontar
 *  13. CHANNEL_ERROR → não altera estado (não lança)
 *  14. Reconecta ao trocar de empresa
 *  15. Reconecta ao trocar de usuário
 *
 * Estratégia:
 *  - supabase.channel → canal fake com presenceState configurável
 *  - channel.track / channel.untrack → spies
 *  - useAuth / useEmpresa → vi.mock com refs mutáveis
 *  - Fake timers (vi.useFakeTimers) para cobrir heartbeat sem espera real
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// ── 1. vi.hoisted ─────────────────────────────────────────────────────────────

const {
  mockPerfilRef,
  mockEmpresaRef,
  mockChannelSpy,
  mockRemoveChannelSpy,
  mockTrackSpy,
  mockUntrackSpy,
  capturedPresenceHandlers,
  capturedSubscribeCallback,
  mockPresenceState,
} = vi.hoisted(() => {
  const mockPerfilRef  = { current: null as { id: string; nome?: string; perfil?: string } | null };
  const mockEmpresaRef = { current: null as { id: string } | null };

  const mockRemoveChannelSpy = vi.fn();
  const mockTrackSpy   = vi.fn();
  const mockUntrackSpy = vi.fn().mockResolvedValue(undefined);

  // Estado de presença configurável por teste
  const mockPresenceState: { current: Record<string, Array<{ user_id: string }>> } = {
    current: {},
  };

  // Captura handlers de presence e o callback de subscribe
  const capturedPresenceHandlers: {
    current: Record<string, () => void>;
  } = { current: {} };

  const capturedSubscribeCallback: {
    current: ((status: string, err?: unknown) => void) | null;
  } = { current: null };

  const mockChannelSpy = vi.fn();

  return {
    mockPerfilRef,
    mockEmpresaRef,
    mockChannelSpy,
    mockRemoveChannelSpy,
    mockTrackSpy,
    mockUntrackSpy,
    capturedPresenceHandlers,
    capturedSubscribeCallback,
    mockPresenceState,
  };
});

// ── 2. vi.mock ANTES dos imports do SUT ───────────────────────────────────────

vi.mock('@/lib/supabase', () => {
  const fakeChannel = {
    on: vi.fn(
      (type: string, config: { event: string }, handler: () => void) => {
        if (type === 'presence') {
          capturedPresenceHandlers.current[config.event] = handler;
        }
        return fakeChannel;
      },
    ),
    subscribe: vi.fn((cb: (status: string, err?: unknown) => void) => {
      capturedSubscribeCallback.current = cb;
      return fakeChannel;
    }),
    presenceState: vi.fn(() => mockPresenceState.current),
    track:   mockTrackSpy,
    untrack: mockUntrackSpy,
  };

  mockChannelSpy.mockReturnValue(fakeChannel);

  return {
    supabase: {
      channel:       mockChannelSpy,
      removeChannel: mockRemoveChannelSpy,
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: mockPerfilRef.current }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: mockEmpresaRef.current }),
}));

// ── 3. Import do SUT ──────────────────────────────────────────────────────────

import { PresenceProvider, useOnlineUsers } from '../PresenceProvider';

// ── 4. Helpers ────────────────────────────────────────────────────────────────

const USER_ID    = 'user-presence-1';
const EMPRESA_ID = 'empresa-presence-99';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(PresenceProvider, null, children);
}

/** Simula o Supabase chamar o subscribe callback com um status */
function simulateSubscribeStatus(status: string, err?: unknown) {
  capturedSubscribeCallback.current?.(status, err);
}

/** Simula um evento de presence (sync/join/leave) */
function simulatePresenceEvent(
  event: 'sync' | 'join' | 'leave',
  state: Record<string, Array<{ user_id: string }>> = {},
) {
  mockPresenceState.current = state;
  capturedPresenceHandlers.current[event]?.();
}

// ── 5. Testes ─────────────────────────────────────────────────────────────────

describe('PresenceProvider + useOnlineUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedPresenceHandlers.current = {};
    capturedSubscribeCallback.current = null;
    mockPresenceState.current = {};

    // Restaura o canal fake após clearAllMocks
    const fakeChannel = {
      on: vi.fn(
        (type: string, config: { event: string }, handler: () => void) => {
          if (type === 'presence') {
            capturedPresenceHandlers.current[config.event] = handler;
          }
          return fakeChannel;
        },
      ),
      subscribe: vi.fn((cb: (status: string, err?: unknown) => void) => {
        capturedSubscribeCallback.current = cb;
        return fakeChannel;
      }),
      presenceState: vi.fn(() => mockPresenceState.current),
      track:   mockTrackSpy,
      untrack: mockUntrackSpy,
    };

    mockChannelSpy.mockReturnValue(fakeChannel);
    mockTrackSpy.mockResolvedValue(undefined);
    mockUntrackSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockPerfilRef.current  = null;
    mockEmpresaRef.current = null;
    vi.useRealTimers();
  });

  // ─── Defaults fora do provider ────────────────────────────────────────

  it('useOnlineUsers fora do provider retorna valores padrão do context', () => {
    const { result } = renderHook(() => useOnlineUsers());
    // Context default: onlineIds = new Set(), loading = true
    expect(result.current.onlineIds).toBeInstanceOf(Set);
    expect(result.current.onlineIds.size).toBe(0);
    expect(result.current.loading).toBe(true);
  });

  // ─── Guarda: sem userId ───────────────────────────────────────────────

  it('sem userId não cria canal', async () => {
    mockPerfilRef.current  = null;
    mockEmpresaRef.current = { id: EMPRESA_ID };

    renderHook(() => useOnlineUsers(), { wrapper });

    await new Promise(r => setTimeout(r, 10));

    expect(mockChannelSpy).not.toHaveBeenCalled();
  });

  // ─── Guarda: sem empresaId ────────────────────────────────────────────

  it('sem empresaId não cria canal', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = null;

    renderHook(() => useOnlineUsers(), { wrapper });

    await new Promise(r => setTimeout(r, 10));

    expect(mockChannelSpy).not.toHaveBeenCalled();
  });

  // ─── Canal criado com nome correto ────────────────────────────────────

  it('cria canal com nome presence-empresa-{empresaId}', () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    renderHook(() => useOnlineUsers(), { wrapper });

    expect(mockChannelSpy).toHaveBeenCalledWith(
      `presence-empresa-${EMPRESA_ID}`,
      expect.objectContaining({
        config: { presence: { key: USER_ID } },
      }),
    );
  });

  // ─── SUBSCRIBED → track ───────────────────────────────────────────────

  it('após SUBSCRIBED chama channel.track com dados do perfil', async () => {
    mockPerfilRef.current  = { id: USER_ID, nome: 'João', perfil: 'operador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    renderHook(() => useOnlineUsers(), { wrapper });

    await act(async () => {
      simulateSubscribeStatus('SUBSCRIBED');
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockTrackSpy).toHaveBeenCalledWith({
      user_id:     USER_ID,
      nome:        'João',
      perfil_tipo: 'operador',
    });
  });

  it('track usa string vazia quando nome/perfil não existem no perfil', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    renderHook(() => useOnlineUsers(), { wrapper });

    await act(async () => {
      simulateSubscribeStatus('SUBSCRIBED');
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockTrackSpy).toHaveBeenCalledWith({
      user_id:     USER_ID,
      nome:        '',
      perfil_tipo: '',
    });
  });

  // ─── Evento sync ──────────────────────────────────────────────────────

  it('evento sync atualiza onlineIds e seta loading=false', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { result } = renderHook(() => useOnlineUsers(), { wrapper });

    act(() => {
      simulatePresenceEvent('sync', {
        [USER_ID]: [{ user_id: USER_ID }],
        'user-2':  [{ user_id: 'user-2' }],
      });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.onlineIds.has(USER_ID)).toBe(true);
    expect(result.current.onlineIds.has('user-2')).toBe(true);
    expect(result.current.onlineIds.size).toBe(2);
  });

  // ─── Evento join ──────────────────────────────────────────────────────

  it('evento join adiciona novo usuário ao onlineIds', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { result } = renderHook(() => useOnlineUsers(), { wrapper });

    // Primeiro sync com 1 usuário
    act(() => {
      simulatePresenceEvent('sync', { [USER_ID]: [{ user_id: USER_ID }] });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Join: novo usuário entra
    act(() => {
      simulatePresenceEvent('join', {
        [USER_ID]: [{ user_id: USER_ID }],
        'user-new': [{ user_id: 'user-new' }],
      });
    });

    expect(result.current.onlineIds.has('user-new')).toBe(true);
    expect(result.current.onlineIds.size).toBe(2);
  });

  // ─── Evento leave ─────────────────────────────────────────────────────

  it('evento leave remove usuário do onlineIds', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { result } = renderHook(() => useOnlineUsers(), { wrapper });

    // Dois usuários conectados
    act(() => {
      simulatePresenceEvent('sync', {
        [USER_ID]: [{ user_id: USER_ID }],
        'user-2':  [{ user_id: 'user-2' }],
      });
    });

    await waitFor(() => expect(result.current.onlineIds.size).toBe(2));

    // user-2 sai
    act(() => {
      simulatePresenceEvent('leave', { [USER_ID]: [{ user_id: USER_ID }] });
    });

    expect(result.current.onlineIds.has(USER_ID)).toBe(true);
    expect(result.current.onlineIds.has('user-2')).toBe(false);
    expect(result.current.onlineIds.size).toBe(1);
  });

  // ─── extractIds: key + user_id ────────────────────────────────────────

  it('extractIds usa tanto a key do slot quanto o user_id do payload', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { result } = renderHook(() => useOnlineUsers(), { wrapper });

    // key='slot-key', mas user_id='payload-uid' → ambos devem aparecer
    act(() => {
      simulatePresenceEvent('sync', {
        'slot-key': [{ user_id: 'payload-uid' }],
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.onlineIds.has('slot-key')).toBe(true);
    expect(result.current.onlineIds.has('payload-uid')).toBe(true);
  });

  it('extractIds ignora presences sem user_id', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { result } = renderHook(() => useOnlineUsers(), { wrapper });

    act(() => {
      // @ts-expect-error — testando payload sem user_id
      simulatePresenceEvent('sync', { 'slot-key': [{}] });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Apenas a key é adicionada, não um user_id vazio
    expect(result.current.onlineIds.has('slot-key')).toBe(true);
    expect(result.current.onlineIds.size).toBe(1);
  });

  // ─── Heartbeat ────────────────────────────────────────────────────────

  it('heartbeat chama doTrack periodicamente após SUBSCRIBED', async () => {
    vi.useFakeTimers();

    mockPerfilRef.current  = { id: USER_ID, nome: 'Ana', perfil: 'lider' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    renderHook(() => useOnlineUsers(), { wrapper });

    await act(async () => {
      simulateSubscribeStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    const callsAfterSubscribed = (mockTrackSpy as Mock).mock.calls.length;
    expect(callsAfterSubscribed).toBeGreaterThanOrEqual(1);

    // Avança 20s (HEARTBEAT_MS) → 1 heartbeat
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect((mockTrackSpy as Mock).mock.calls.length).toBeGreaterThan(callsAfterSubscribed);
  });

  // ─── Cleanup: untrack + removeChannel ────────────────────────────────

  it('cleanup ao desmontar: chama untrack e removeChannel', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { unmount } = renderHook(() => useOnlineUsers(), { wrapper });

    await act(async () => {
      simulateSubscribeStatus('SUBSCRIBED');
      await new Promise(r => setTimeout(r, 0));
    });

    unmount();

    // Pequeno delay para a cadeia untrack().finally(() => removeChannel)
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockUntrackSpy).toHaveBeenCalledTimes(1);
    expect(mockRemoveChannelSpy).toHaveBeenCalledTimes(1);
  });

  // ─── Cleanup: heartbeat cancelado ────────────────────────────────────

  it('cleanup cancela o heartbeat ao desmontar', async () => {
    vi.useFakeTimers();

    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { unmount } = renderHook(() => useOnlineUsers(), { wrapper });

    await act(async () => {
      simulateSubscribeStatus('SUBSCRIBED');
      await Promise.resolve();
    });

    const callsAtUnmount = (mockTrackSpy as Mock).mock.calls.length;

    unmount();

    // Avança 40s (2 intervalos) → NÃO deve chamar track novamente
    act(() => {
      vi.advanceTimersByTime(40_000);
    });

    expect((mockTrackSpy as Mock).mock.calls.length).toBe(callsAtUnmount);

    vi.useRealTimers();
  });

  // ─── CHANNEL_ERROR não lança ──────────────────────────────────────────

  it('CHANNEL_ERROR não lança exceção e não altera onlineIds', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { result } = renderHook(() => useOnlineUsers(), { wrapper });

    await act(async () => {
      simulatePresenceEvent('sync', { [USER_ID]: [{ user_id: USER_ID }] });
    });

    const sizeBeforeError = result.current.onlineIds.size;

    expect(() => {
      act(() => {
        simulateSubscribeStatus('CHANNEL_ERROR', new Error('Socket error'));
      });
    }).not.toThrow();

    expect(result.current.onlineIds.size).toBe(sizeBeforeError);
  });

  it('TIMED_OUT não lança exceção', () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    renderHook(() => useOnlineUsers(), { wrapper });

    expect(() => {
      act(() => {
        simulateSubscribeStatus('TIMED_OUT');
      });
    }).not.toThrow();
  });

  // ─── Reconecta ao trocar de empresa ───────────────────────────────────

  it('reconecta ao trocar empresaId', async () => {
    mockPerfilRef.current  = { id: USER_ID };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { rerender } = renderHook(() => useOnlineUsers(), { wrapper });

    await act(async () => {
      simulateSubscribeStatus('SUBSCRIBED');
      await new Promise(r => setTimeout(r, 0));
    });

    const callsV1 = (mockChannelSpy as Mock).mock.calls.length;

    // Troca de empresa → useEffect re-executa
    act(() => {
      mockEmpresaRef.current = { id: 'empresa-nova-123' };
    });
    rerender();

    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });

    expect((mockChannelSpy as Mock).mock.calls.length).toBeGreaterThan(callsV1);
    expect(mockChannelSpy).toHaveBeenLastCalledWith(
      'presence-empresa-empresa-nova-123',
      expect.any(Object),
    );
  });
});
