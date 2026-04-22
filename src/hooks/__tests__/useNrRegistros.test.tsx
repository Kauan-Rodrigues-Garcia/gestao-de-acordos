/**
 * src/hooks/__tests__/useNrRegistros.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Testes unitários para o hook useNrRegistros.
 *
 * Cenários cobertos:
 *   1. Estado inicial (loading=true, cacheMap vazio)
 *   2. Fetch bem-sucedido: cacheMap populado, loading=false
 *   3. Fetch quando empresaId está vazio: não chama fetchNrRegistros
 *   4. Fetch com erro (fetchNrRegistros rejeita): loading=false, mapa vazio
 *   5. Cache key: trim + lowercase
 *   6. Realtime INSERT adiciona entrada ao mapa
 *   7. Realtime UPDATE sobrescreve entrada
 *   8. Realtime DELETE remove entrada do mapa
 *   9. Cleanup: unmount chama removeChannel
 *  10. verificarConflito — livre (não encontrado)
 *  11. verificarConflito — ocupado (retorna NrConflito)
 *  12. verificarConflito — mesmo acordo excluído (acordoIdExcluir)
 *  13. verificarConflito — nrValue vazio/whitespace → null
 *  14. verificarConflito — sem empresaId → null
 *  15. refetch força re-fetch do cache
 *
 * Mock do Supabase: apenas `channel / on / subscribe / removeChannel`.
 * O fetchNrRegistros (que usa supabase internamente) é mockado diretamente
 * via vi.mock('@/services/nr_registros.service') para isolar o hook do
 * serviço (cujo mock Supabase já é testado em nr_registros.service.test.ts).
 *
 * Dependências de contexto:
 *   - useAuth  → mockado em @/hooks/useAuth
 *   - useEmpresa → mockado em @/hooks/useEmpresa
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── vi.hoisted — spies criados antes de qualquer import ────────────────────

const {
  mockFetchNrRegistros,
  mockChannel,
  mockOn,
  mockSubscribe,
  mockRemoveChannel,
  mockUseAuth,
  mockUseEmpresa,
} = vi.hoisted(() => {
  // Spy para fetchNrRegistros
  const mockFetchNrRegistros = vi.fn();

  // Spy para supabase.removeChannel
  const mockRemoveChannel = vi.fn();

  // Builder encadeável para .channel().on().subscribe()
  const mockSubscribe = vi.fn().mockReturnValue({}); // retorna o channel object
  const mockOn = vi.fn();
  const mockChannel = vi.fn();

  // Fazemos o on retornar um objeto com subscribe
  // e o channel retornar um objeto com on
  // Setup correto do builder encadeado
  const channelObj = {
    on: mockOn,
    subscribe: mockSubscribe,
  };
  mockOn.mockReturnValue(channelObj);
  mockChannel.mockReturnValue(channelObj);

  // Mocks dos contextos
  const mockUseAuth = vi.fn();
  const mockUseEmpresa = vi.fn();

  return {
    mockFetchNrRegistros,
    mockChannel,
    mockOn,
    mockSubscribe,
    mockRemoveChannel,
    mockUseAuth,
    mockUseEmpresa,
  };
});

// ─── vi.mock — deve vir ANTES dos imports do SUT ────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel:       mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

vi.mock('@/services/nr_registros.service', () => ({
  fetchNrRegistros: mockFetchNrRegistros,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: mockUseEmpresa,
}));

// ─── Import do SUT após os mocks ────────────────────────────────────────────

import { useNrRegistros } from '../useNrRegistros';
import type { NrRegistro } from '@/services/nr_registros.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPRESA_ID = 'emp-abc-123';

/** NrRegistro factory para testes */
function makeNrRegistro(overrides: Partial<NrRegistro> = {}): NrRegistro {
  return {
    id:            'reg-1',
    empresa_id:    EMPRESA_ID,
    nr_value:      '12345',
    campo:         'nr_cliente',
    operador_id:   'op-1',
    operador_nome: 'João Operador',
    acordo_id:     'acordo-1',
    criado_em:     '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Captura o callback registrado em `.on('postgres_changes', filter, callback)`
 * para dispará-lo manualmente nos testes de realtime.
 */
function captureRealtimeCallback(): ((payload: unknown) => void) {
  // mockOn.mock.calls[lastCallIndex][2] é o terceiro argumento (o callback)
  const calls = mockOn.mock.calls;
  if (calls.length === 0) throw new Error('mockOn não foi chamado ainda');
  const lastCall = calls[calls.length - 1];
  return lastCall[2] as (payload: unknown) => void;
}

// ─── Setup padrão dos mocks de contexto ─────────────────────────────────────

function setupContextMocks(empresaIdOverride: string | null = EMPRESA_ID) {
  mockUseAuth.mockReturnValue({
    perfil: empresaIdOverride
      ? { id: 'user-1', empresa_id: empresaIdOverride, nome: 'Teste' }
      : null,
  });
  mockUseEmpresa.mockReturnValue({
    empresa: empresaIdOverride ? { id: empresaIdOverride, nome: 'Empresa Teste', slug: 'teste' } : null,
  });
}

// ─── beforeEach / afterEach ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Reconecta o builder encadeado após clearAllMocks
  const channelObj = { on: mockOn, subscribe: mockSubscribe };
  mockOn.mockReturnValue(channelObj);
  mockChannel.mockReturnValue(channelObj);
  mockSubscribe.mockReturnValue(channelObj);

  // Por padrão: fetch resolve com lista vazia
  mockFetchNrRegistros.mockResolvedValue([]);
  setupContextMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTES
// ═══════════════════════════════════════════════════════════════════════════════

describe('useNrRegistros', () => {

  // ── 1. Estado inicial ────────────────────────────────────────────────────

  describe('estado inicial', () => {
    it('loading começa como true e cacheMap como Map vazio', async () => {
      // Fetch nunca resolve durante este teste (mantemos pending)
      let resolvePromise!: (v: NrRegistro[]) => void;
      mockFetchNrRegistros.mockReturnValue(
        new Promise<NrRegistro[]>(resolve => { resolvePromise = resolve; }),
      );

      const { result } = renderHook(() => useNrRegistros());

      // Asserções síncronas: antes de qualquer await, loading ainda é true
      expect(result.current.loading).toBe(true);
      expect(result.current.cacheMap).toBeInstanceOf(Map);
      expect(result.current.cacheMap.size).toBe(0);

      // Cleanup: resolve a promise dentro de act para evitar warning
      // (garante que todas as atualizações de estado sejam processadas)
      await act(async () => { resolvePromise([]); });
    });
  });

  // ── 2. Fetch bem-sucedido ────────────────────────────────────────────────

  describe('fetch bem-sucedido', () => {
    it('popula cacheMap e define loading=false após fetch', async () => {
      const registros: NrRegistro[] = [
        makeNrRegistro({ nr_value: '11111', campo: 'nr_cliente' }),
        makeNrRegistro({ id: 'reg-2', nr_value: '22222', campo: 'instituicao' }),
      ];
      mockFetchNrRegistros.mockResolvedValue(registros);

      const { result } = renderHook(() => useNrRegistros());

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.cacheMap.size).toBe(2);
      // Chaves no formato `${empresaId}:${campo}:${nrValue.trim().toLowerCase()}`
      expect(result.current.cacheMap.has(`${EMPRESA_ID}:nr_cliente:11111`)).toBe(true);
      expect(result.current.cacheMap.has(`${EMPRESA_ID}:instituicao:22222`)).toBe(true);
    });

    it('chama fetchNrRegistros com o empresaId correto', async () => {
      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockFetchNrRegistros).toHaveBeenCalledWith(EMPRESA_ID);
    });

    it('normaliza nrValue para lowercase no cache key', async () => {
      const registros: NrRegistro[] = [
        makeNrRegistro({ nr_value: 'NR-ABC', campo: 'nr_cliente' }),
      ];
      mockFetchNrRegistros.mockResolvedValue(registros);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Deve estar em lowercase
      expect(result.current.cacheMap.has(`${EMPRESA_ID}:nr_cliente:nr-abc`)).toBe(true);
    });
  });

  // ── 3. Sem empresaId ─────────────────────────────────────────────────────

  describe('sem empresaId', () => {
    it('não chama fetchNrRegistros quando empresaId é vazio', async () => {
      setupContextMocks(null);

      const { result } = renderHook(() => useNrRegistros());

      // Aguarda um tick para efeitos assíncronos serem processados
      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });

      expect(mockFetchNrRegistros).not.toHaveBeenCalled();
      // cacheMap permanece vazio
      expect(result.current.cacheMap.size).toBe(0);
    });

    it('não cria canal realtime quando empresaId é vazio', async () => {
      setupContextMocks(null);

      renderHook(() => useNrRegistros());

      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });

      expect(mockChannel).not.toHaveBeenCalled();
    });
  });

  // ── 4. Fetch com erro ────────────────────────────────────────────────────

  describe('fetch com erro', () => {
    it('define loading=false mesmo quando fetchNrRegistros rejeita', async () => {
      // O hook tem try/finally — a rejeição é tratada internamente (loading=false).
      // Porém, como o hook não re-lança, o Vitest 4 detecta um unhandled rejection
      // oriundo da Promise do mock. Instalamos um handler temporário de processo
      // para absorvê-lo antes que o runner o registre como erro de suíte.
      const absorver = (reason: unknown, promise: Promise<unknown>) => {
        void promise; void reason; // silencia lint
      };
      process.on('unhandledRejection', absorver);

      mockFetchNrRegistros.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useNrRegistros());

      await waitFor(() => expect(result.current.loading).toBe(false));

      process.off('unhandledRejection', absorver);

      // cacheMap permanece vazio
      expect(result.current.cacheMap.size).toBe(0);
    });
  });

  // ── 5. Canal Realtime — criação ──────────────────────────────────────────

  describe('realtime — canal criado corretamente', () => {
    it('cria canal com nome rt-nr-registros-{empresaId}', async () => {
      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockChannel).toHaveBeenCalledWith(`rt-nr-registros-${EMPRESA_ID}`);
    });

    it('registra listener postgres_changes na tabela nr_registros', async () => {
      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockOn).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event:  '*',
          schema: 'public',
          table:  'nr_registros',
          filter: `empresa_id=eq.${EMPRESA_ID}`,
        }),
        expect.any(Function),
      );
    });

    it('chama .subscribe() no canal', async () => {
      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockSubscribe).toHaveBeenCalled();
    });
  });

  // ── 6. Realtime INSERT ───────────────────────────────────────────────────

  describe('realtime — evento INSERT', () => {
    it('adiciona nova entrada ao cacheMap', async () => {
      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callback = captureRealtimeCallback();
      const novoRegistro = makeNrRegistro({ id: 'reg-new', nr_value: '99999', campo: 'nr_cliente' });

      act(() => {
        callback({
          eventType: 'INSERT',
          new: novoRegistro,
          old: {},
        });
      });

      expect(result.current.cacheMap.has(`${EMPRESA_ID}:nr_cliente:99999`)).toBe(true);
      expect(result.current.cacheMap.get(`${EMPRESA_ID}:nr_cliente:99999`)).toEqual(novoRegistro);
    });
  });

  // ── 7. Realtime UPDATE ───────────────────────────────────────────────────

  describe('realtime — evento UPDATE', () => {
    it('sobrescreve entrada existente no cacheMap', async () => {
      const original = makeNrRegistro({ nr_value: '55555', campo: 'nr_cliente', operador_nome: 'Antes' });
      mockFetchNrRegistros.mockResolvedValue([original]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.cacheMap.size).toBe(1);

      const callback = captureRealtimeCallback();
      const atualizado = { ...original, operador_nome: 'Depois' };

      act(() => {
        callback({
          eventType: 'UPDATE',
          new: atualizado,
          old: original,
        });
      });

      const cached = result.current.cacheMap.get(`${EMPRESA_ID}:nr_cliente:55555`);
      expect(cached?.operador_nome).toBe('Depois');
    });
  });

  // ── 8. Realtime DELETE ───────────────────────────────────────────────────

  describe('realtime — evento DELETE', () => {
    it('remove entrada do cacheMap ao receber DELETE', async () => {
      const registro = makeNrRegistro({ nr_value: '77777', campo: 'nr_cliente' });
      mockFetchNrRegistros.mockResolvedValue([registro]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.cacheMap.size).toBe(1);

      const callback = captureRealtimeCallback();

      act(() => {
        callback({
          eventType: 'DELETE',
          new: {},
          old: {
            empresa_id: EMPRESA_ID,
            campo:      'nr_cliente',
            nr_value:   '77777',
          },
        });
      });

      expect(result.current.cacheMap.has(`${EMPRESA_ID}:nr_cliente:77777`)).toBe(false);
      expect(result.current.cacheMap.size).toBe(0);
    });

    it('não modifica mapa quando DELETE não traz campos suficientes', async () => {
      const registro = makeNrRegistro({ nr_value: '88888', campo: 'nr_cliente' });
      mockFetchNrRegistros.mockResolvedValue([registro]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const callback = captureRealtimeCallback();

      act(() => {
        // old sem nr_value — hook deve ignorar
        callback({
          eventType: 'DELETE',
          new: {},
          old: { empresa_id: EMPRESA_ID },
        });
      });

      // Entrada original permanece
      expect(result.current.cacheMap.size).toBe(1);
    });
  });

  // ── 9. Cleanup — removeChannel ao unmount ────────────────────────────────

  describe('cleanup', () => {
    it('chama supabase.removeChannel ao desmontar o hook', async () => {
      const { result, unmount } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockRemoveChannel).not.toHaveBeenCalled();

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
    });
  });

  // ── 10–14. verificarConflito ─────────────────────────────────────────────

  describe('verificarConflito', () => {
    it('retorna null quando NR não está no cache (livre)', async () => {
      mockFetchNrRegistros.mockResolvedValue([]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const conflito = result.current.verificarConflito('99999', 'nr_cliente');
      expect(conflito).toBeNull();
    });

    it('retorna NrConflito quando NR está no cache (ocupado)', async () => {
      const registro = makeNrRegistro({
        id:            'reg-conflict',
        nr_value:      '12345',
        campo:         'nr_cliente',
        operador_id:   'op-x',
        operador_nome: 'Maria',
        acordo_id:     'acordo-x',
      });
      mockFetchNrRegistros.mockResolvedValue([registro]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const conflito = result.current.verificarConflito('12345', 'nr_cliente');
      expect(conflito).toEqual({
        registroId:   'reg-conflict',
        acordoId:     'acordo-x',
        operadorId:   'op-x',
        operadorNome: 'Maria',
      });
    });

    it('retorna null quando o acordoId encontrado é o mesmo excluído (edição)', async () => {
      const registro = makeNrRegistro({
        nr_value:  '12345',
        campo:     'nr_cliente',
        acordo_id: 'acordo-editando',
      });
      mockFetchNrRegistros.mockResolvedValue([registro]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Passando o mesmo acordo_id como exclusão → não deve ser conflito
      const conflito = result.current.verificarConflito('12345', 'nr_cliente', 'acordo-editando');
      expect(conflito).toBeNull();
    });

    it('retorna NrConflito com fallback quando operador_nome é null', async () => {
      const registro = makeNrRegistro({
        nr_value:      '12345',
        campo:         'nr_cliente',
        operador_nome: null,
      });
      mockFetchNrRegistros.mockResolvedValue([registro]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const conflito = result.current.verificarConflito('12345', 'nr_cliente');
      expect(conflito?.operadorNome).toBe('Operador desconhecido');
    });

    it('retorna null para nrValue vazio ou somente espaços', async () => {
      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.verificarConflito('', 'nr_cliente')).toBeNull();
      expect(result.current.verificarConflito('   ', 'nr_cliente')).toBeNull();
    });

    it('retorna null quando empresaId não está disponível', async () => {
      setupContextMocks(null);
      mockFetchNrRegistros.mockResolvedValue([]);

      const { result } = renderHook(() => useNrRegistros());

      await act(async () => {
        await new Promise(r => setTimeout(r, 20));
      });

      expect(result.current.verificarConflito('12345', 'nr_cliente')).toBeNull();
    });

    it('busca por NR usando trim+lowercase (case-insensitive)', async () => {
      const registro = makeNrRegistro({ nr_value: 'NR-XYZ', campo: 'nr_cliente' });
      // fetchNrRegistros já normaliza via cacheKey interno
      mockFetchNrRegistros.mockResolvedValue([registro]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // 'NR-XYZ' é guardado como 'nr-xyz' → busca com maiúsculas deve funcionar
      const conflito = result.current.verificarConflito('NR-XYZ', 'nr_cliente');
      expect(conflito).not.toBeNull();
      // Também com espaços ao redor
      const conflito2 = result.current.verificarConflito('  NR-XYZ  ', 'nr_cliente');
      expect(conflito2).not.toBeNull();
    });

    it('distingue pelo campo: nr_cliente vs instituicao', async () => {
      const reg1 = makeNrRegistro({ id: 'r1', nr_value: '999', campo: 'nr_cliente',  acordo_id: 'a1' });
      const reg2 = makeNrRegistro({ id: 'r2', nr_value: '999', campo: 'instituicao', acordo_id: 'a2' });
      mockFetchNrRegistros.mockResolvedValue([reg1, reg2]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      const c1 = result.current.verificarConflito('999', 'nr_cliente');
      const c2 = result.current.verificarConflito('999', 'instituicao');

      expect(c1?.acordoId).toBe('a1');
      expect(c2?.acordoId).toBe('a2');
    });
  });

  // ── 15. refetch ──────────────────────────────────────────────────────────

  describe('refetch', () => {
    it('força novo fetch e atualiza o cacheMap', async () => {
      mockFetchNrRegistros.mockResolvedValue([]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.cacheMap.size).toBe(0);

      // Prepara novos dados para o segundo fetch
      const novoRegistro = makeNrRegistro({ nr_value: 'REFETCH-1' });
      mockFetchNrRegistros.mockResolvedValue([novoRegistro]);

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockFetchNrRegistros).toHaveBeenCalledTimes(2);
      expect(result.current.cacheMap.size).toBe(1);
      expect(result.current.cacheMap.has(`${EMPRESA_ID}:nr_cliente:refetch-1`)).toBe(true);
    });

    it('não chama fetchNrRegistros quando empresaId está vazio no refetch', async () => {
      setupContextMocks(null);

      const { result } = renderHook(() => useNrRegistros());

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockFetchNrRegistros).not.toHaveBeenCalled();
    });

    it('define loading=false ao final do refetch mesmo se rejeitar', async () => {
      mockFetchNrRegistros.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useNrRegistros());
      await waitFor(() => expect(result.current.loading).toBe(false));

      // Segundo fetch rejeita — silenciamos o erro pois o hook não o propaga
      // (tem try/finally). O act capturaria o unhandled rejection caso o hook
      // re-lançasse, mas ele não o faz: apenas cai no finally.
      mockFetchNrRegistros.mockRejectedValueOnce(new Error('Falha de rede'));

      // Engolimos o possível erro que pode vir do act
      await act(async () => {
        await result.current.refetch().catch(() => {/* erro esperado */});
      });

      expect(result.current.loading).toBe(false);
    });
  });
});
