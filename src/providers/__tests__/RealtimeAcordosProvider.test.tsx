/**
 * src/providers/__tests__/RealtimeAcordosProvider.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para RealtimeAcordosProvider e useRealtimeAcordos.
 *
 * Estratégia:
 *  • useAuth    → vi.mock retornando perfil/empresa configuráveis via refs
 *  • useEmpresa → vi.mock retornando empresa configurável via ref
 *  • supabase   → builder thenable com canal fake que captura o handler postgres
 *  • Canal fake → expõe `simulateEvent(payload)` para disparar eventos inline
 *
 * O handler assíncrono do INSERT é aguardado via `waitFor` do Testing Library.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// ── 1. vi.hoisted: spies criados ANTES de qualquer import ────────────────────

const {
  mockPerfilRef,
  mockEmpresaRef,
  mockChannelOnSpy,
  mockChannelSubscribeSpy,
  mockChannelSpy,
  mockRemoveChannelSpy,
  mockSupabaseFromSpy,
  capturedHandlerRef,
  capturedStatusCallbackRef,
} = vi.hoisted(() => {
  // Refs mutáveis para controlar o valor retornado pelos mocks em cada teste
  const mockPerfilRef  = { current: null as unknown };
  const mockEmpresaRef = { current: null as unknown };

  // Referências para capturar o handler de postgres_changes e o status callback
  const capturedHandlerRef:        { current: ((payload: unknown) => void) | null } = { current: null };
  const capturedStatusCallbackRef: { current: ((status: string, err?: unknown) => void) | null } = { current: null };

  // Spies do canal fake
  const mockChannelOnSpy        = vi.fn();
  const mockChannelSubscribeSpy = vi.fn();
  const mockChannelSpy          = vi.fn();
  const mockRemoveChannelSpy    = vi.fn();
  const mockSupabaseFromSpy     = vi.fn();

  return {
    mockPerfilRef,
    mockEmpresaRef,
    mockChannelOnSpy,
    mockChannelSubscribeSpy,
    mockChannelSpy,
    mockRemoveChannelSpy,
    mockSupabaseFromSpy,
    capturedHandlerRef,
    capturedStatusCallbackRef,
  };
});

// ── 2. vi.mock ANTES dos imports do SUT ──────────────────────────────────────

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: mockPerfilRef.current }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: mockEmpresaRef.current }),
}));

// Builder thenable para supabase.from('acordos').select(...).eq(...).single()
type MockResult<T = unknown> = { data: T; error: { message: string } | null };

let acordosQueryResult: MockResult = { data: null, error: null };

function createAcordosBuilder() {
  const builder: Record<string, Mock> = {} as Record<string, Mock>;

  const makeThenable = () =>
    Object.assign(builder, {
      then: vi.fn((resolve: (v: MockResult) => void) => {
        resolve(acordosQueryResult);
        return Promise.resolve(acordosQueryResult);
      }),
    });

  builder.select = vi.fn(() => {
    mockSupabaseFromSpy('select');
    return makeThenable();
  });
  builder.eq = vi.fn(() => makeThenable());
  builder.single = vi.fn(() => Promise.resolve(acordosQueryResult));

  // Encadeamento: select → eq → single resolve com Promise
  (builder.select as Mock).mockImplementation(() => {
    mockSupabaseFromSpy('select');
    return builder;
  });
  (builder.eq as Mock).mockImplementation(() => builder);
  (builder.single as Mock).mockImplementation(() => Promise.resolve(acordosQueryResult));

  return builder;
}

vi.mock('@/lib/supabase', () => {
  // Canal fake — captura o handler de postgres_changes e o status callback
  const fakeChannel = {
    on: vi.fn((_type: string, _config: unknown, handler: (payload: unknown) => void) => {
      mockChannelOnSpy(_type, _config, handler);
      capturedHandlerRef.current = handler;
      return fakeChannel;
    }),
    subscribe: vi.fn((cb: (status: string, err?: unknown) => void) => {
      mockChannelSubscribeSpy(cb);
      capturedStatusCallbackRef.current = cb;
      // Simula conexão bem-sucedida imediatamente
      cb('SUBSCRIBED');
      return fakeChannel;
    }),
  };

  return {
    supabase: {
      channel: vi.fn((...args: unknown[]) => {
        mockChannelSpy(...args);
        return fakeChannel;
      }),
      removeChannel: vi.fn((...args: unknown[]) => {
        mockRemoveChannelSpy(...args);
      }),
      from: vi.fn((_table: string) => {
        return createAcordosBuilder();
      }),
    },
    // Re-exporta tipos como valores vazios — apenas para satisfazer imports de tipo
    type: undefined,
  };
});

// ── 3. Imports do SUT (APÓS os vi.mock) ──────────────────────────────────────

import { RealtimeAcordosProvider, useRealtimeAcordos, type AcordoRealtimeEvent } from '@/providers/RealtimeAcordosProvider';
import { supabase } from '@/lib/supabase';

// ── 4. Helpers ────────────────────────────────────────────────────────────────

const EMPRESA_ID = 'emp-test-123';

const mockEmpresa = {
  id:            EMPRESA_ID,
  nome:          'Empresa Teste',
  slug:          'empresa-teste',
  ativo:         true,
  config:        {},
  criado_em:     '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

const mockPerfil = {
  id:            'perfil-1',
  nome:          'Operador Teste',
  email:         'op@teste.com',
  perfil:        'operador' as const,
  ativo:         true,
  lider_id:      null,
  setor_id:      null,
  empresa_id:    EMPRESA_ID,
  criado_em:     '2024-01-01T00:00:00Z',
  atualizado_em: '2024-01-01T00:00:00Z',
};

const mockAcordo = {
  id:             'acordo-1',
  nome_cliente:   'João Silva',
  nr_cliente:     '12345',
  data_cadastro:  '2024-06-01',
  vencimento:     '2024-07-01',
  valor:          1500,
  tipo:           'pix' as const,
  parcelas:       1,
  whatsapp:       null,
  status:         'verificar_pendente' as const,
  operador_id:    'perfil-1',
  setor_id:       null,
  empresa_id:     EMPRESA_ID,
  observacoes:    null,
  instituicao:    null,
  criado_em:      '2024-06-01T00:00:00Z',
  atualizado_em:  '2024-06-01T00:00:00Z',
};

/** Wrapper padrão que monta o provider */
function makeWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <RealtimeAcordosProvider>{children}</RealtimeAcordosProvider>;
  };
}

/** Dispara um evento de postgres_changes no handler capturado */
async function simulateEvent(payload: unknown) {
  const handler = capturedHandlerRef.current;
  if (!handler) throw new Error('Handler de postgres_changes não foi capturado');
  await act(async () => {
    await handler(payload);
  });
}

// ── 5. Suíte de testes ────────────────────────────────────────────────────────

describe('RealtimeAcordosProvider', () => {
  beforeEach(() => {
    // Reseta todos os spies
    vi.clearAllMocks();
    capturedHandlerRef.current        = null;
    capturedStatusCallbackRef.current = null;
    // Empresa e perfil válidos por padrão
    mockEmpresaRef.current = mockEmpresa;
    mockPerfilRef.current  = mockPerfil;
    // Query padrão de INSERT retorna dado completo
    acordosQueryResult = { data: mockAcordo, error: null };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Lifecycle do canal ─────────────────────────────────────────────────────

  describe('lifecycle do canal', () => {
    it('cria canal com nome correto baseado no empresa_id', () => {
      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      expect(mockChannelSpy).toHaveBeenCalledTimes(1);
      expect(mockChannelSpy).toHaveBeenCalledWith(`rt-acordos-central-${EMPRESA_ID}`);
    });

    it('registra listener postgres_changes com filtro empresa_id correto', () => {
      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      expect(mockChannelOnSpy).toHaveBeenCalledTimes(1);
      const [type, config] = mockChannelOnSpy.mock.calls[0];
      expect(type).toBe('postgres_changes');
      expect(config).toMatchObject({
        event:  '*',
        schema: 'public',
        table:  'acordos',
        filter: `empresa_id=eq.${EMPRESA_ID}`,
      });
    });

    it('chama subscribe no canal após configurar o listener', () => {
      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      expect(mockChannelSubscribeSpy).toHaveBeenCalledTimes(1);
    });

    it('status inicia como "off" e vai para "connected" após SUBSCRIBED', async () => {
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });
    });

    it('status vai para "error" quando channelStatus é CHANNEL_ERROR', async () => {
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      act(() => {
        capturedStatusCallbackRef.current?.('CHANNEL_ERROR', new Error('falha'));
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });

    it('status vai para "error" quando channelStatus é TIMED_OUT', async () => {
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      act(() => {
        capturedStatusCallbackRef.current?.('TIMED_OUT');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });
    });

    it('status vai para "off" quando channelStatus é CLOSED', async () => {
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      // Primeiro garante "connected"
      await waitFor(() => expect(result.current.status).toBe('connected'));

      act(() => {
        capturedStatusCallbackRef.current?.('CLOSED');
      });

      await waitFor(() => {
        expect(result.current.status).toBe('off');
      });
    });

    it('chama removeChannel no unmount (cleanup)', () => {
      const { unmount } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      unmount();

      expect(mockRemoveChannelSpy).toHaveBeenCalledTimes(1);
    });

    it('NÃO cria canal quando empresa é null e perfil não tem empresa_id', () => {
      mockEmpresaRef.current = null;
      mockPerfilRef.current  = { ...mockPerfil, empresa_id: undefined };

      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      expect(mockChannelSpy).not.toHaveBeenCalled();
    });

    it('usa perfil.empresa_id como fallback quando empresa é null', () => {
      mockEmpresaRef.current = null;
      mockPerfilRef.current  = { ...mockPerfil, empresa_id: 'fallback-emp-99' };

      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      expect(mockChannelSpy).toHaveBeenCalledWith('rt-acordos-central-fallback-emp-99');
    });

    it('NÃO cria canal quando empresa e perfil são ambos null', () => {
      mockEmpresaRef.current = null;
      mockPerfilRef.current  = null;

      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      expect(mockChannelSpy).not.toHaveBeenCalled();
    });
  });

  // ── Subscribe / Unsubscribe ────────────────────────────────────────────────

  describe('subscribe e unsubscribe', () => {
    it('subscribe registra handler e unsubscribe o remove (sem crash)', async () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      act(() => {
        result.current.subscribe('sub-1', handler);
      });

      // Dispara UPDATE — handler deve ser chamado
      await simulateEvent({
        eventType: 'UPDATE',
        new: { ...mockAcordo, valor: 9999 },
        old: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);

      // Faz unsubscribe e dispara novamente — handler NÃO deve ser chamado de novo
      act(() => {
        result.current.unsubscribe('sub-1');
      });

      await simulateEvent({
        eventType: 'UPDATE',
        new: { ...mockAcordo, valor: 1111 },
        old: {},
      });

      expect(handler).toHaveBeenCalledTimes(1); // continua 1 — não recebeu o segundo evento
    });

    it('múltiplos subscribers recebem o mesmo evento UPDATE', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      act(() => {
        result.current.subscribe('sub-A', handler1);
        result.current.subscribe('sub-B', handler2);
      });

      await simulateEvent({
        eventType: 'UPDATE',
        new: { ...mockAcordo, valor: 500 },
        old: {},
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('subscriber que não fez subscribe não recebe eventos', async () => {
      const handler = vi.fn();
      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      // Não chama subscribe — dispara evento diretamente

      await simulateEvent({
        eventType: 'UPDATE',
        new: mockAcordo,
        old: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('unsubscribe de id inexistente não lança erro', () => {
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      expect(() => {
        act(() => {
          result.current.unsubscribe('id-que-nao-existe');
        });
      }).not.toThrow();
    });
  });

  // ── Evento UPDATE ──────────────────────────────────────────────────────────

  describe('evento UPDATE', () => {
    it('notifica subscribers com eventType UPDATE e newRecord do payload', async () => {
      const handler = vi.fn();
      const updatedAcordo = { ...mockAcordo, valor: 7777 };
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'UPDATE',
        new: updatedAcordo,
        old: mockAcordo,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const event: AcordoRealtimeEvent = handler.mock.calls[0][0];
      expect(event.eventType).toBe('UPDATE');
      expect(event.newRecord).toMatchObject({ valor: 7777 });
      expect(event.oldRecord).toBeUndefined();
    });

    it('NÃO faz query no banco para evento UPDATE', async () => {
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', vi.fn()); });

      // Resetamos o spy de `from` após o mount para medir só o que acontece no evento
      (supabase.from as Mock).mockClear();

      await simulateEvent({ eventType: 'UPDATE', new: mockAcordo, old: {} });

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // ── Evento DELETE ──────────────────────────────────────────────────────────

  describe('evento DELETE', () => {
    it('notifica subscribers com eventType DELETE e oldRecord.id', async () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'DELETE',
        old: { id: 'acordo-deletado-42' },
        new: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const event: AcordoRealtimeEvent = handler.mock.calls[0][0];
      expect(event.eventType).toBe('DELETE');
      expect(event.oldRecord).toEqual({ id: 'acordo-deletado-42' });
      expect(event.newRecord).toBeUndefined();
    });

    it('NÃO notifica quando DELETE não tem id em payload.old', async () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'DELETE',
        old: {},   // sem id
        new: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('NÃO notifica quando DELETE payload.old é null', async () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'DELETE',
        old: null,
        new: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('múltiplos subscribers recebem o mesmo evento DELETE', async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => {
        result.current.subscribe('sub-1', h1);
        result.current.subscribe('sub-2', h2);
      });

      await simulateEvent({ eventType: 'DELETE', old: { id: 'del-99' }, new: {} });

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  // ── Evento INSERT ──────────────────────────────────────────────────────────

  describe('evento INSERT', () => {
    it('busca registro completo no banco e notifica subscribers', async () => {
      const handler = vi.fn();
      acordosQueryResult = { data: mockAcordo, error: null };
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'INSERT',
        new: { id: 'acordo-1' },
        old: {},
      });

      await waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });

      const event: AcordoRealtimeEvent = handler.mock.calls[0][0];
      expect(event.eventType).toBe('INSERT');
      expect(event.newRecord).toMatchObject({ id: 'acordo-1', nome_cliente: 'João Silva' });
    });

    it('chama supabase.from("acordos") com select e eq corretos no INSERT', async () => {
      acordosQueryResult = { data: mockAcordo, error: null };
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', vi.fn()); });

      // Limpa chamadas anteriores do mount
      (supabase.from as Mock).mockClear();

      await simulateEvent({
        eventType: 'INSERT',
        new: { id: 'novo-acordo-77' },
        old: {},
      });

      await waitFor(() => {
        expect(supabase.from).toHaveBeenCalledWith('acordos');
      });
    });

    it('NÃO notifica quando INSERT não tem id em payload.new', async () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'INSERT',
        new: {},   // sem id
        old: {},
      });

      // Aguarda um tick para garantir que o handler assíncrono não foi chamado
      await new Promise(r => setTimeout(r, 10));
      expect(handler).not.toHaveBeenCalled();
    });

    it('NÃO notifica quando INSERT payload.new é null', async () => {
      const handler = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'INSERT',
        new: null,
        old: {},
      });

      await new Promise(r => setTimeout(r, 10));
      expect(handler).not.toHaveBeenCalled();
    });

    it('NÃO notifica quando a query pós-INSERT retorna erro', async () => {
      const handler = vi.fn();
      acordosQueryResult = { data: null, error: { message: 'Falha na query' } };
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'INSERT',
        new: { id: 'acordo-com-erro' },
        old: {},
      });

      await new Promise(r => setTimeout(r, 30));
      expect(handler).not.toHaveBeenCalled();
    });

    it('NÃO notifica quando a query pós-INSERT retorna data null (sem erro)', async () => {
      const handler = vi.fn();
      acordosQueryResult = { data: null, error: null };
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => { result.current.subscribe('sub-1', handler); });

      await simulateEvent({
        eventType: 'INSERT',
        new: { id: 'acordo-sem-data' },
        old: {},
      });

      await new Promise(r => setTimeout(r, 30));
      expect(handler).not.toHaveBeenCalled();
    });

    it('erro na query INSERT de UM subscriber não quebra os demais', async () => {
      // Dois subscribers: primeiro recebe INSERT normal, segundo também
      // A ideia é: mesmo com erro na query, o provider não crasheia
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      // Primeiro retorna erro
      acordosQueryResult = { data: null, error: { message: 'DB error' } };

      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => {
        result.current.subscribe('sub-1', handler1);
        result.current.subscribe('sub-2', handler2);
      });

      // Evento com erro — nenhum deve ser notificado
      await simulateEvent({ eventType: 'INSERT', new: { id: 'err-id' }, old: {} });
      await new Promise(r => setTimeout(r, 30));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();

      // Agora com dado válido — ambos devem ser notificados
      acordosQueryResult = { data: mockAcordo, error: null };
      await simulateEvent({ eventType: 'INSERT', new: { id: 'acordo-1' }, old: {} });

      await waitFor(() => {
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
      });
    });

    it('múltiplos subscribers recebem o mesmo evento INSERT enriquecido', async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      acordosQueryResult = { data: mockAcordo, error: null };
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      act(() => {
        result.current.subscribe('sub-A', h1);
        result.current.subscribe('sub-B', h2);
      });

      await simulateEvent({ eventType: 'INSERT', new: { id: 'acordo-1' }, old: {} });

      await waitFor(() => {
        expect(h1).toHaveBeenCalledTimes(1);
        expect(h2).toHaveBeenCalledTimes(1);
      });

      expect(h1.mock.calls[0][0].newRecord).toMatchObject({ id: 'acordo-1' });
      expect(h2.mock.calls[0][0].newRecord).toMatchObject({ id: 'acordo-1' });
    });
  });

  // ── Contexto fora do provider ──────────────────────────────────────────────

  describe('useRealtimeAcordos fora do provider', () => {
    it('retorna valor padrão seguro (status off, funções no-op) fora do provider', () => {
      const { result } = renderHook(() => useRealtimeAcordos());

      expect(result.current.status).toBe('off');
      expect(typeof result.current.subscribe).toBe('function');
      expect(typeof result.current.unsubscribe).toBe('function');
      // Não deve lançar ao chamar as funções no-op
      expect(() => result.current.subscribe('x', vi.fn())).not.toThrow();
      expect(() => result.current.unsubscribe('x')).not.toThrow();
    });
  });

  // ── Evento desconhecido / edge-cases ──────────────────────────────────────

  describe('edge cases', () => {
    it('0 subscribers registrados: evento UPDATE não lança erro', async () => {
      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });
      // Nenhum subscribe — apenas dispara evento

      await expect(
        simulateEvent({ eventType: 'UPDATE', new: mockAcordo, old: {} })
      ).resolves.not.toThrow();
    });

    it('0 subscribers registrados: evento DELETE não lança erro', async () => {
      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      await expect(
        simulateEvent({ eventType: 'DELETE', old: { id: 'x' }, new: {} })
      ).resolves.not.toThrow();
    });

    it('0 subscribers registrados: evento INSERT não lança erro', async () => {
      acordosQueryResult = { data: mockAcordo, error: null };
      renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      await expect(
        simulateEvent({ eventType: 'INSERT', new: { id: 'abc' }, old: {} })
      ).resolves.not.toThrow();
    });

    it('subscribe sobrescreve handler existente com mesmo id', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const { result } = renderHook(() => useRealtimeAcordos(), { wrapper: makeWrapper() });

      act(() => {
        result.current.subscribe('sub-dup', handler1);
        result.current.subscribe('sub-dup', handler2); // mesmo id → sobrescreve
      });

      await simulateEvent({ eventType: 'UPDATE', new: mockAcordo, old: {} });

      // Somente o último handler registrado deve ter sido chamado
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });
});
