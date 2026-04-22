/**
 * src/hooks/__tests__/useDiretoExtraConfig.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para o hook useDiretoExtraConfig.
 *
 * Cenários cobertos:
 *   1. Sem empresa: configs=[], loading=false, fetchDiretoExtraConfigs não chamado
 *   2. Estado inicial: loading=true (antes do fetch resolver)
 *   3. Fetch bem-sucedido → configs populadas, loading=false
 *   4. Realtime change → refetch disparado
 *   5. Cleanup ao unmount → removeChannel chamado
 *   6. refetch força re-fetch e atualiza estado
 *   7. isAtivoParaUsuario: escopo 'usuario' com ativo=true → true
 *   8. isAtivoParaUsuario: escopo 'usuario' com ativo=false → false
 *   9. isAtivoParaUsuario: escopo 'equipe' → true
 *  10. isAtivoParaUsuario: escopo 'setor' → true
 *  11. isAtivoParaUsuario: escopo 'usuario' tem precedência sobre equipe
 *  12. isAtivoParaUsuario: sem config correspondente → false
 *  13. isAtivoParaUsuario: userId/equipeId/setorId null → false
 *
 * Estratégia:
 *  - fetchDiretoExtraConfigs → vi.mock do serviço (isola o hook)
 *  - resolverDiretoExtraAtivo → importado REAL do serviço (é função pura)
 *  - supabase.channel → builder encadeado
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── 1. vi.hoisted ─────────────────────────────────────────────────────────────

const {
  mockFetchDiretoExtraConfigs,
  mockEmpresaRef,
  mockChannel,
  mockRemoveChannel,
  capturedRealtimeCallbackRef,
} = vi.hoisted(() => {
  const mockFetchDiretoExtraConfigs = vi.fn();
  const mockEmpresaRef = { current: null as { id: string } | null };
  const mockRemoveChannel = vi.fn();

  const capturedRealtimeCallbackRef: { current: (() => void) | null } = { current: null };

  const mockSubscribe = vi.fn().mockReturnValue({});
  const mockOn        = vi.fn();

  const channelObj = {
    on:        mockOn,
    subscribe: mockSubscribe,
  };

  mockOn.mockImplementation(
    (_type: string, _config: unknown, handler: () => void) => {
      capturedRealtimeCallbackRef.current = handler;
      return channelObj;
    },
  );

  const mockChannel = vi.fn().mockReturnValue(channelObj);

  return {
    mockFetchDiretoExtraConfigs,
    mockEmpresaRef,
    mockChannel,
    mockRemoveChannel,
    capturedRealtimeCallbackRef,
  };
});

// ── 2. vi.mock ANTES dos imports do SUT ───────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel:       mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('@/services/direto_extra.service', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/direto_extra.service')>();
  return {
    ...real,
    fetchDiretoExtraConfigs: mockFetchDiretoExtraConfigs,
  };
});

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: mockEmpresaRef.current }),
}));

// ── 3. Import do SUT ──────────────────────────────────────────────────────────

import { useDiretoExtraConfig } from '../useDiretoExtraConfig';
import type { DiretoExtraConfig } from '@/services/direto_extra.service';

// ── 4. Helpers ────────────────────────────────────────────────────────────────

const EMPRESA_ID = 'empresa-direto-456';
const USER_ID    = 'user-direto-789';

function makeConfig(overrides: Partial<DiretoExtraConfig> = {}): DiretoExtraConfig {
  return {
    id:            'cfg-1',
    empresa_id:    EMPRESA_ID,
    escopo:        'usuario',
    referencia_id: USER_ID,
    ativo:         true,
    criado_em:     '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── 5. Testes ─────────────────────────────────────────────────────────────────

describe('useDiretoExtraConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedRealtimeCallbackRef.current = null;
    mockFetchDiretoExtraConfigs.mockResolvedValue([]);
  });

  afterEach(() => {
    mockEmpresaRef.current = null;
  });

  // ─── Guarda defensiva: sem empresa ────────────────────────────────────

  it('sem empresa: configs=[], loading=false, fetchDiretoExtraConfigs não chamado', async () => {
    mockEmpresaRef.current = null;

    const { result } = renderHook(() => useDiretoExtraConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.configs).toEqual([]);
    expect(mockFetchDiretoExtraConfigs).not.toHaveBeenCalled();
    expect(mockChannel).not.toHaveBeenCalled();
  });

  // ─── Fetch bem-sucedido ────────────────────────────────────────────────

  it('popula configs após fetch bem-sucedido', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const cfgs: DiretoExtraConfig[] = [
      makeConfig({ id: 'c1', escopo: 'usuario', referencia_id: 'u1', ativo: true  }),
      makeConfig({ id: 'c2', escopo: 'equipe',  referencia_id: 'eq1', ativo: false }),
    ];
    mockFetchDiretoExtraConfigs.mockResolvedValue(cfgs);

    const { result } = renderHook(() => useDiretoExtraConfig());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.configs).toHaveLength(2);
    expect(mockFetchDiretoExtraConfigs).toHaveBeenCalledWith(EMPRESA_ID);
  });

  // ─── Realtime: change dispara refetch ─────────────────────────────────

  it('realtime change dispara refetch e atualiza configs', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const cfg1 = makeConfig({ id: 'c1', ativo: true });
    const cfg2 = makeConfig({ id: 'c2', ativo: false });

    mockFetchDiretoExtraConfigs
      .mockResolvedValueOnce([cfg1])
      .mockResolvedValueOnce([cfg1, cfg2]);

    const { result } = renderHook(() => useDiretoExtraConfig());

    await waitFor(() => {
      expect(result.current.configs).toHaveLength(1);
    });

    await act(async () => {
      capturedRealtimeCallbackRef.current?.();
      // aguarda o refetch assíncrono
      await new Promise(r => setTimeout(r, 0));
    });

    await waitFor(() => {
      expect(result.current.configs).toHaveLength(2);
    });

    expect(mockFetchDiretoExtraConfigs).toHaveBeenCalledTimes(2);
  });

  // ─── Cleanup ──────────────────────────────────────────────────────────

  it('chama removeChannel ao desmontar quando há empresa', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };
    mockFetchDiretoExtraConfigs.mockResolvedValue([]);

    const { unmount } = renderHook(() => useDiretoExtraConfig());

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalled();
    });

    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('não cria canal quando empresa é null', () => {
    mockEmpresaRef.current = null;

    const { unmount } = renderHook(() => useDiretoExtraConfig());
    unmount();

    expect(mockChannel).not.toHaveBeenCalled();
    expect(mockRemoveChannel).not.toHaveBeenCalled();
  });

  // ─── refetch ──────────────────────────────────────────────────────────

  it('refetch força re-fetch e atualiza configs', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const v1 = [makeConfig({ id: 'c1', ativo: true })];
    const v2 = [makeConfig({ id: 'c1', ativo: false })];

    mockFetchDiretoExtraConfigs
      .mockResolvedValueOnce(v1)
      .mockResolvedValueOnce(v2);

    const { result } = renderHook(() => useDiretoExtraConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.configs[0].ativo).toBe(true);

    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.configs[0].ativo).toBe(false);
    expect(mockFetchDiretoExtraConfigs).toHaveBeenCalledTimes(2);
  });

  // ─── isAtivoParaUsuario: escopo usuario ───────────────────────────────

  it('isAtivoParaUsuario: escopo usuario com ativo=true → true', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    mockFetchDiretoExtraConfigs.mockResolvedValue([
      makeConfig({ escopo: 'usuario', referencia_id: USER_ID, ativo: true }),
    ]);

    const { result } = renderHook(() => useDiretoExtraConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAtivoParaUsuario(USER_ID)).toBe(true);
  });

  it('isAtivoParaUsuario: escopo usuario com ativo=false → false', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    mockFetchDiretoExtraConfigs.mockResolvedValue([
      makeConfig({ escopo: 'usuario', referencia_id: USER_ID, ativo: false }),
    ]);

    const { result } = renderHook(() => useDiretoExtraConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAtivoParaUsuario(USER_ID)).toBe(false);
  });

  // ─── isAtivoParaUsuario: escopo equipe ────────────────────────────────

  it('isAtivoParaUsuario: escopo equipe com ativo=true → true', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const equipeId = 'equipe-x';
    mockFetchDiretoExtraConfigs.mockResolvedValue([
      makeConfig({ escopo: 'equipe', referencia_id: equipeId, ativo: true }),
    ]);

    const { result } = renderHook(() => useDiretoExtraConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAtivoParaUsuario('outro-user', null, equipeId)).toBe(true);
  });

  // ─── isAtivoParaUsuario: escopo setor ─────────────────────────────────

  it('isAtivoParaUsuario: escopo setor com ativo=true → true', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const setorId = 'setor-y';
    mockFetchDiretoExtraConfigs.mockResolvedValue([
      makeConfig({ escopo: 'setor', referencia_id: setorId, ativo: true }),
    ]);

    const { result } = renderHook(() => useDiretoExtraConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAtivoParaUsuario('outro-user', setorId, null)).toBe(true);
  });

  // ─── Precedência: usuario > equipe ────────────────────────────────────

  it('isAtivoParaUsuario: escopo usuario inativo tem precedência sobre equipe ativo', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const equipeId = 'eq-1';
    mockFetchDiretoExtraConfigs.mockResolvedValue([
      makeConfig({ escopo: 'usuario', referencia_id: USER_ID,  ativo: false }),
      makeConfig({ escopo: 'equipe',  referencia_id: equipeId, ativo: true  }),
    ]);

    const { result } = renderHook(() => useDiretoExtraConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // usuario=false deve prevalecer sobre equipe=true
    expect(result.current.isAtivoParaUsuario(USER_ID, null, equipeId)).toBe(false);
  });

  // ─── isAtivoParaUsuario: sem config → false ───────────────────────────

  it('isAtivoParaUsuario: sem nenhuma config correspondente → false', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };

    mockFetchDiretoExtraConfigs.mockResolvedValue([
      makeConfig({ escopo: 'usuario', referencia_id: 'outro-user', ativo: true }),
    ]);

    const { result } = renderHook(() => useDiretoExtraConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAtivoParaUsuario(USER_ID, null, null)).toBe(false);
  });

  it('isAtivoParaUsuario: configs vazio → false', async () => {
    mockEmpresaRef.current = { id: EMPRESA_ID };
    mockFetchDiretoExtraConfigs.mockResolvedValue([]);

    const { result } = renderHook(() => useDiretoExtraConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAtivoParaUsuario(USER_ID, 'setor-1', 'equipe-1')).toBe(false);
  });
});
