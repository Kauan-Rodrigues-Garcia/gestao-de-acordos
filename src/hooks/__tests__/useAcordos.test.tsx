/**
 * src/hooks/__tests__/useAcordos.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para o hook useAcordos (e useDashboardMetricas).
 *
 * Estratégia de mock:
 *  • useAuth / useEmpresa / useRealtimeAcordos  → vi.mock + vi.hoisted
 *  • fetchAcordosService                        → vi.mock('@/services/acordos.service')
 *  • supabase.from('perfis')                    → builder thenable para o
 *    ramo equipe_id do useEffect de resolução de operadores
 *  • supabase.from('acordos')                   → builder thenable para
 *    useDashboardMetricas
 *
 * Não testamos:
 *  • matchesFiltros isoladamente — é privado; seu comportamento é coberto
 *    nos testes de evento INSERT com/sem filtro.
 *  • useDashboardMetricas.subscribe-loop — o provider é mockado com no-ops;
 *    cobrir o loop exigiria simular vários eventos, o que seria teste do
 *    provider, não do hook de métricas.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook as renderHookBase, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ── 1. vi.hoisted: cria todos os spies ANTES de qualquer import ───────────────

const {
  mockFetchAcordos,
  mockPerfilValue,
  mockEmpresaValue,
  mockRealtimeSubscribe,
  mockRealtimeUnsubscribe,
  mockRealtimeStatus,
  mockSupabaseFromSpy,
} = vi.hoisted(() => {
  const mockFetchAcordos       = vi.fn();
  const mockPerfilValue        = { current: null as unknown };
  const mockEmpresaValue       = { current: null as unknown };
  const mockRealtimeStatus     = { current: 'off' as string };
  const mockRealtimeSubscribe  = vi.fn();
  const mockRealtimeUnsubscribe = vi.fn();
  const mockSupabaseFromSpy    = vi.fn();

  return {
    mockFetchAcordos,
    mockPerfilValue,
    mockEmpresaValue,
    mockRealtimeSubscribe,
    mockRealtimeUnsubscribe,
    mockRealtimeStatus,
    mockSupabaseFromSpy,
  };
});

// ── 2. vi.mock declarados ANTES dos imports do SUT ────────────────────────────

vi.mock('@/services/acordos.service', () => ({
  fetchAcordos: mockFetchAcordos,
  calcularMetricasDashboard: vi.fn((data: unknown[]) => ({
    acordos_hoje:        data.length,
    pagos_hoje:          0,
    pendentes_hoje:      0,
    vencidos:            0,
    valor_previsto_hoje: 0,
    valor_recebido_hoje: 0,
    em_acompanhamento:   0,
    total_geral:         data.length,
  })),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: mockPerfilValue.current }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: mockEmpresaValue.current }),
}));

vi.mock('@/providers/RealtimeAcordosProvider', () => ({
  useRealtimeAcordos: () => ({
    status:      mockRealtimeStatus.current,
    subscribe:   mockRealtimeSubscribe,
    unsubscribe: mockRealtimeUnsubscribe,
  }),
}));

// Builder thenable para supabase (cobre perfis + acordos queries)
type MockResult<T = unknown> = { data: T; error: { message: string } | null; count?: number | null };

interface BuilderCall {
  table: string;
  operation: string | null;
  filters: Array<[string, string, unknown]>;
  selectArg?: unknown;
}

const supabaseCalls: BuilderCall[] = [];
let supabaseNextResult: MockResult = { data: null, error: null, count: 0 };
const supabaseResultsByTable: Record<string, MockResult[]> = {};

function nextResultFor(table: string): MockResult {
  const q = supabaseResultsByTable[table];
  if (q && q.length > 0) return q.shift()!;
  return supabaseNextResult;
}

function createSupabaseBuilder(table: string) {
  const call: BuilderCall = { table, operation: null, filters: [] };
  supabaseCalls.push(call);

  const builder = {
    select: vi.fn((arg?: unknown) => {
      call.operation = 'select';
      call.selectArg = arg;
      return builder;
    }),
    insert: vi.fn(() => { call.operation = 'insert'; return builder; }),
    update: vi.fn(() => { call.operation = 'update'; return builder; }),
    delete: vi.fn(() => { call.operation = 'delete'; return builder; }),
    eq:    vi.fn((col: string, val: unknown) => { call.filters.push(['eq', col, val]); return builder; }),
    neq:   vi.fn((col: string, val: unknown) => { call.filters.push(['neq', col, val]); return builder; }),
    gte:   vi.fn((col: string, val: unknown) => { call.filters.push(['gte', col, val]); return builder; }),
    lte:   vi.fn((col: string, val: unknown) => { call.filters.push(['lte', col, val]); return builder; }),
    in:    vi.fn((_col: string, _vals: unknown[]) => builder),
    or:    vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    range: vi.fn(() => builder),
    then: (
      resolve: (v: MockResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      try {
        return Promise.resolve(nextResultFor(table)).then(resolve, reject);
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e);
      }
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockSupabaseFromSpy,
  },
  // Acordo type re-export não precisa de valor
}));

// ── 3. Importa SUT APÓS os mocks ─────────────────────────────────────────────

import { useAcordos, useDashboardMetricas, MS_AGRUPAMENTO_METRICAS } from '../useAcordos';
import type { Acordo } from '@/lib/supabase';

// ── 4. Factories ──────────────────────────────────────────────────────────────

function fakePerfil(overrides?: Partial<{ id: string; empresa_id: string }>) {
  return {
    id:         overrides?.id         ?? 'perfil-1',
    empresa_id: overrides?.empresa_id ?? 'emp-1',
    nome:       'Operador Teste',
    email:      'op@test.com',
    perfil:     'operador' as const,
    ativo:      true,
    lider_id:   null,
    setor_id:   null,
    criado_em:  '2024-01-01',
    atualizado_em: '2024-01-01',
  };
}

function fakeEmpresa(id = 'emp-1') {
  return {
    id,
    nome:  'Empresa Teste',
    slug:  'empresa-teste',
    ativo: true,
    config: {},
    criado_em:     '2024-01-01',
    atualizado_em: '2024-01-01',
  };
}

function fakeAcordo(overrides?: Partial<Acordo>): Acordo {
  return {
    id:            overrides?.id            ?? 'acordo-1',
    nome_cliente:  overrides?.nome_cliente  ?? 'Cliente A',
    nr_cliente:    overrides?.nr_cliente    ?? '12345',
    data_cadastro: overrides?.data_cadastro ?? '2024-01-01',
    vencimento:    overrides?.vencimento    ?? '2024-06-01',
    valor:         overrides?.valor         ?? 1000,
    tipo:          overrides?.tipo          ?? 'pix',
    parcelas:      overrides?.parcelas      ?? 1,
    whatsapp:      overrides?.whatsapp      ?? null,
    status:        overrides?.status        ?? 'verificar_pendente',
    operador_id:   overrides?.operador_id   ?? 'perfil-1',
    setor_id:      overrides?.setor_id      ?? null,
    empresa_id:    overrides?.empresa_id    ?? 'emp-1',
    observacoes:   overrides?.observacoes   ?? null,
    instituicao:   overrides?.instituicao   ?? null,
    criado_em:     overrides?.criado_em     ?? '2024-01-01',
    atualizado_em: overrides?.atualizado_em ?? '2024-01-01',
    ...overrides,
  };
}

// ── 4b. renderHook com QueryClientProvider ───────────────────────────────────
// `useAcordos` e `useDashboardMetricas` usam React Query (useQuery /
// useQueryClient). Sem um QueryClientProvider acima deles, o primeiro render
// lança "No QueryClient set" — era a causa das 37 falhas deste arquivo. No app
// real o provider vem de `App.tsx`.
//
// Em vez de repetir `{ wrapper }` em ~20 chamadas, `renderHook` é sombreado por
// uma versão que injeta o provider. Cada render ganha um client novo (nada de
// cache vazando entre casos) e `retry: false` evita que uma query com erro
// proposital fique tentando de novo e estoure o timeout do teste.
function renderHook<Resultado, Props>(
  callback: (props: Props) => Resultado,
  options?: Parameters<typeof renderHookBase<Resultado, Props>>[1],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHookBase<Resultado, Props>(callback, { wrapper: Wrapper, ...options });
}

/**
 * Espera o fetch inicial ASSENTAR no cache do React Query.
 *
 * `waitFor(() => expect(result.current.loading).toBe(false))` não serve: no
 * primeiro tick a query enabled ainda está com fetchStatus 'idle', então
 * `isLoading` é false por um instante e o waitFor resolvia ANTES dos dados
 * entrarem no cache. As mutações otimistas (`patchAcordo`, `removeAcordo`,
 * `addAcordo` e os handlers de realtime) usam `setQueryData` com
 * `if (!old) return old` — em cache vazio elas eram descartadas em silêncio, e
 * o teste falhava como se o hook estivesse errado.
 *
 * Aqui esperamos o fetch ter sido chamado, o loading baixar, e então drenamos
 * as microtasks pendentes para garantir que o setState do React Query já rodou.
 */
async function esperarFetchInicial(result: { current: { loading: boolean } }) {
  await waitFor(() => {
    expect(mockFetchAcordos).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
  await act(async () => { await Promise.resolve(); });
}

/**
 * Equivalente para `useDashboardMetricas`, que NÃO passa por `fetchAcordos` —
 * ele consulta `supabase.from('acordos')` direto. Esperar por `mockFetchAcordos`
 * aqui nunca resolveria.
 */
async function esperarMetricas(result: { current: { loading: boolean } }) {
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await Promise.resolve(); });
}

// ── 5. Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  // Reset estado global
  mockPerfilValue.current  = null;
  mockEmpresaValue.current = null;
  mockRealtimeStatus.current = 'off';
  mockRealtimeSubscribe.mockReset();
  mockRealtimeUnsubscribe.mockReset();
  mockFetchAcordos.mockReset();

  // Reset supabase builder state
  supabaseCalls.length = 0;
  supabaseNextResult   = { data: null, error: null, count: 0 };
  for (const k of Object.keys(supabaseResultsByTable)) delete supabaseResultsByTable[k];
  (mockSupabaseFromSpy as Mock).mockImplementation((table: string) =>
    createSupabaseBuilder(table),
  );
});

afterEach(() => {
  vi.clearAllTimers();
});

// ═══════════════════════════════════════════════════════════════════════════════
//  useAcordos
// ═══════════════════════════════════════════════════════════════════════════════

describe('useAcordos', () => {
  // ── Estado inicial ──────────────────────────────────────────────────────────
  describe('estado inicial', () => {
    it('retorna loading=true, acordos=[], totalCount=0, error=null antes do perfil carregar', () => {
      // Sem perfil → fetchAcordos interno nunca é chamado
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });

      const { result } = renderHook(() => useAcordos());

      expect(result.current.loading).toBe(true);
      expect(result.current.acordos).toEqual([]);
      expect(result.current.totalCount).toBe(0);
      expect(result.current.error).toBeNull();
    });

    it('expõe realtimeStatus do provider (off por padrão)', () => {
      const { result } = renderHook(() => useAcordos());
      expect(result.current.realtimeStatus).toBe('off');
    });

    it('não chama fetchAcordos quando perfil e empresa_id são nulos', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      renderHook(() => useAcordos());
      // Dar um tick para qualquer efeito rodar
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect(mockFetchAcordos).not.toHaveBeenCalled();
    });
  });

  // ── Fetch bem-sucedido ──────────────────────────────────────────────────────
  describe('fetch bem-sucedido', () => {
    it('popula acordos e totalCount após fetch, seta loading=false', async () => {
      const acordos = [fakeAcordo(), fakeAcordo({ id: 'acordo-2', nome_cliente: 'Cliente B' })];
      mockFetchAcordos.mockResolvedValue({ data: acordos, count: 2 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());

      await esperarFetchInicial(result);

      expect(result.current.acordos).toEqual(acordos);
      expect(result.current.totalCount).toBe(2);
      expect(result.current.error).toBeNull();
    });

    it('chama fetchAcordosService com empresa_id do contexto', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil({ empresa_id: 'emp-2' });
      mockEmpresaValue.current = fakeEmpresa('emp-2');

      renderHook(() => useAcordos());

      await waitFor(() => expect(mockFetchAcordos).toHaveBeenCalled());
      const [args] = mockFetchAcordos.mock.calls[0];
      expect(args.empresa_id).toBe('emp-2');
    });

    it('usa perfil.empresa_id quando empresa do contexto não está disponível', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil({ empresa_id: 'emp-perfil' });
      mockEmpresaValue.current = null; // sem empresa no contexto

      renderHook(() => useAcordos());

      await waitFor(() => expect(mockFetchAcordos).toHaveBeenCalled());
      const [args] = mockFetchAcordos.mock.calls[0];
      expect(args.empresa_id).toBe('emp-perfil');
    });

    it('passa filtros adicionais ao service', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      renderHook(() => useAcordos({ status: 'pago', tipo: 'pix', page: 2, perPage: 10 }));

      await waitFor(() => expect(mockFetchAcordos).toHaveBeenCalled());
      const [args] = mockFetchAcordos.mock.calls[0];
      expect(args.status).toBe('pago');
      expect(args.tipo).toBe('pix');
      expect(args.page).toBe(2);
      expect(args.perPage).toBe(10);
    });
  });

  // ── Fetch com erro ──────────────────────────────────────────────────────────
  describe('fetch com erro', () => {
    it('popula error e zera loading quando fetchAcordosService rejeita', async () => {
      mockFetchAcordos.mockRejectedValue(new Error('Falha na rede'));
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());

      await esperarFetchInicial(result);

      expect(result.current.error).toBe('Falha na rede');
      expect(result.current.acordos).toEqual([]);
    });

    it('usa mensagem genérica quando erro não é instância de Error', async () => {
      mockFetchAcordos.mockRejectedValue('string-error');
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());

      await esperarFetchInicial(result);
      expect(result.current.error).toBe('Erro ao carregar acordos');
    });
  });

  // ── refetch manual ──────────────────────────────────────────────────────────
  describe('refetch', () => {
    it('reexecuta o fetch e atualiza os acordos', async () => {
      const initial  = [fakeAcordo()];
      const updated  = [fakeAcordo(), fakeAcordo({ id: 'acordo-2' })];

      mockFetchAcordos
        .mockResolvedValueOnce({ data: initial, count: 1 })
        .mockResolvedValueOnce({ data: updated, count: 2 });

      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);
      expect(result.current.acordos).toEqual(initial);

      await act(async () => { await result.current.refetch(); });

      await waitFor(() => {
        expect(result.current.acordos).toEqual(updated);
        expect(result.current.totalCount).toBe(2);
      });
      expect(mockFetchAcordos).toHaveBeenCalledTimes(2);
    });

    // Refetch com dados já em tela NÃO liga `loading`.
    //
    // A tela de Acordos renderiza `{loading ? <TableSkeleton/> : tabela}`. Se um
    // refetch manual ligasse `loading`, a lista inteira sumiria e voltaria a cada
    // atualização — pior que mostrar o dado anterior por um instante. O React
    // Query separa exatamente isso: `isLoading` é só a primeira carga (sem dado
    // em cache); refetch em cima de dado existente é `isFetching`, que o hook
    // não expõe justamente para a tabela não piscar.
    it('refetch não liga loading quando já existem dados (lista não pisca)', async () => {
      let resolveSecond!: (v: { data: Acordo[]; count: number }) => void;
      const secondFetch = new Promise<{ data: Acordo[]; count: number }>(r => { resolveSecond = r; });

      const inicial = [fakeAcordo({ id: 'a1' })];
      mockFetchAcordos
        .mockResolvedValueOnce({ data: inicial, count: 1 })
        .mockReturnValueOnce(secondFetch);

      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      act(() => { void result.current.refetch(); });

      // Em voo: sem skeleton e ainda com o dado anterior na tela.
      expect(result.current.loading).toBe(false);
      expect(result.current.acordos).toEqual(inicial);

      const atualizado = [fakeAcordo({ id: 'a1' }), fakeAcordo({ id: 'a2' })];
      await act(async () => { resolveSecond({ data: atualizado, count: 2 }); });

      await waitFor(() => expect(result.current.acordos).toEqual(atualizado));
      expect(result.current.loading).toBe(false);
    });
  });

  // ── patchAcordo ─────────────────────────────────────────────────────────────
  describe('patchAcordo', () => {
    it('atualiza campos do acordo localmente (happy path)', async () => {
      const a1 = fakeAcordo({ id: 'a1', status: 'verificar_pendente' });
      const a2 = fakeAcordo({ id: 'a2', status: 'verificar_pendente' });
      mockFetchAcordos.mockResolvedValue({ data: [a1, a2], count: 2 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      act(() => { result.current.patchAcordo('a1', { status: 'pago', valor: 9999 }); });

      await waitFor(() => {
        const patched = result.current.acordos.find(a => a.id === 'a1')!;
        expect(patched.status).toBe('pago');
        expect(patched.valor).toBe(9999);
      });
      // a2 não foi alterado
      expect(result.current.acordos.find(a => a.id === 'a2')?.status).toBe('verificar_pendente');
    });

    it('não altera a lista quando o id não existe', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 1 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      act(() => { result.current.patchAcordo('nao-existe', { status: 'pago' }); });
      expect(result.current.acordos).toEqual([a1]);
    });
  });

  // ── removeAcordo ────────────────────────────────────────────────────────────
  describe('removeAcordo', () => {
    it('remove o acordo da lista e decrementa totalCount', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      const a2 = fakeAcordo({ id: 'a2' });
      mockFetchAcordos.mockResolvedValue({ data: [a1, a2], count: 2 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      act(() => { result.current.removeAcordo('a1'); });

      await waitFor(() => {
        expect(result.current.acordos.map(a => a.id)).toEqual(['a2']);
        expect(result.current.totalCount).toBe(1);
      });
    });

    it('não decrementa totalCount se o id não existia na lista', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 1 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      act(() => { result.current.removeAcordo('nao-existe'); });
      expect(result.current.totalCount).toBe(1);
    });

    it('totalCount nunca vai abaixo de 0', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 0 }); // count já 0
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      act(() => { result.current.removeAcordo('a1'); });
      expect(result.current.totalCount).toBe(0);
    });
  });

  // ── addAcordo ───────────────────────────────────────────────────────────────
  describe('addAcordo', () => {
    it('insere o acordo no início da lista e incrementa totalCount', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      const novo = fakeAcordo({ id: 'novo' });
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 1 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      act(() => { result.current.addAcordo(novo); });

      await waitFor(() => {
        expect(result.current.acordos[0].id).toBe('novo');
        expect(result.current.acordos).toHaveLength(2);
        expect(result.current.totalCount).toBe(2);
      });
    });

    it('dedup: não adiciona se id já existe', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 1 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      act(() => { result.current.addAcordo(a1); }); // mesmo id
      expect(result.current.acordos).toHaveLength(1);
      expect(result.current.totalCount).toBe(1);
    });
  });

  // ── Realtime subscribe/unsubscribe ──────────────────────────────────────────
  describe('realtime', () => {
    it('chama subscribe no mount quando enableRealtime=true (padrão)', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { unmount } = renderHook(() => useAcordos());
      await waitFor(() => expect(mockRealtimeSubscribe).toHaveBeenCalled());
      expect(mockRealtimeSubscribe).toHaveBeenCalledWith(
        expect.stringContaining('useAcordos-'),
        expect.any(Function),
      );
      unmount();
    });

    it('chama unsubscribe no unmount', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { unmount } = renderHook(() => useAcordos());
      await waitFor(() => expect(mockRealtimeSubscribe).toHaveBeenCalled());

      const [instanceId] = mockRealtimeSubscribe.mock.calls[0];
      unmount();
      expect(mockRealtimeUnsubscribe).toHaveBeenCalledWith(instanceId);
    });

    it('NÃO chama subscribe quando enableRealtime=false', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      renderHook(() => useAcordos({ enableRealtime: false }));
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      expect(mockRealtimeSubscribe).not.toHaveBeenCalled();
    });

    it('reflete realtimeStatus do provider', async () => {
      mockRealtimeStatus.current = 'connected';
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });

      const { result } = renderHook(() => useAcordos());
      expect(result.current.realtimeStatus).toBe('connected');
    });

    // ── Eventos Realtime ──────────────────────────────────────────────────────

    it('evento UPDATE: merge cirúrgico no acordo correto', async () => {
      const a1 = fakeAcordo({ id: 'a1', status: 'verificar_pendente', valor: 100 });
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 1 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      // Captura o handler registrado
      const [, handler] = mockRealtimeSubscribe.mock.calls[0];

      act(() => {
        handler({
          eventType: 'UPDATE',
          newRecord: { ...a1, status: 'pago', valor: 200 },
        });
      });

      await waitFor(() => {
        const updated = result.current.acordos.find(a => a.id === 'a1')!;
        expect(updated.status).toBe('pago');
        expect(updated.valor).toBe(200);
      });
    });

    it('evento UPDATE: preserva joins locais quando payload não os inclui', async () => {
      const perfisJoin = { id: 'perfil-1', nome: 'Op', email: 'op@t.com', perfil: 'operador' as const, ativo: true, lider_id: null, setor_id: null, criado_em: '', atualizado_em: '' };
      const a1 = { ...fakeAcordo({ id: 'a1' }), perfis: perfisJoin };
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 1 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      const [, handler] = mockRealtimeSubscribe.mock.calls[0];

      act(() => {
        handler({
          eventType: 'UPDATE',
          // payload sem `perfis`
          newRecord: { ...fakeAcordo({ id: 'a1' }), status: 'pago' },
        });
      });

      await waitFor(() => {
        const updated = result.current.acordos.find(a => a.id === 'a1')!;
        expect(updated.perfis).toEqual(perfisJoin); // join preservado
        expect(updated.status).toBe('pago');
      });
    });

    it('evento DELETE: remove o acordo da lista e decrementa totalCount', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      const a2 = fakeAcordo({ id: 'a2' });
      mockFetchAcordos.mockResolvedValue({ data: [a1, a2], count: 2 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      const [, handler] = mockRealtimeSubscribe.mock.calls[0];

      act(() => {
        handler({ eventType: 'DELETE', oldRecord: { id: 'a1' } });
      });

      await waitFor(() => {
        expect(result.current.acordos.map(a => a.id)).toEqual(['a2']);
        expect(result.current.totalCount).toBe(1);
      });
    });

    it('evento DELETE sem id: não modifica a lista', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 1 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      const [, handler] = mockRealtimeSubscribe.mock.calls[0];

      act(() => { handler({ eventType: 'DELETE', oldRecord: undefined }); });
      expect(result.current.acordos).toHaveLength(1);
    });

    it('evento INSERT: adiciona o acordo ao início quando passa no matchesFiltros', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      // Sem filtros → matchesFiltros sempre retorna true
      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      const [, handler] = mockRealtimeSubscribe.mock.calls[0];
      const novo = fakeAcordo({ id: 'novo-rt' });

      await act(async () => {
        await handler({ eventType: 'INSERT', newRecord: novo });
      });

      await waitFor(() => {
        expect(result.current.acordos[0]?.id).toBe('novo-rt');
        expect(result.current.totalCount).toBe(1);
      });
    });

    it('evento INSERT: ignora acordo que não passa no filtro de status', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos({ status: 'pago' }));
      await esperarFetchInicial(result);

      const [, handler] = mockRealtimeSubscribe.mock.calls[0];
      const novo = fakeAcordo({ id: 'novo-rt', status: 'nao_pago' }); // não passa no filtro

      act(() => {
        handler({ eventType: 'INSERT', newRecord: novo });
      });

      expect(result.current.acordos).toHaveLength(0);
    });

    it('evento INSERT: dedup (não adiciona se id já está na lista)', async () => {
      const a1 = fakeAcordo({ id: 'a1' });
      mockFetchAcordos.mockResolvedValue({ data: [a1], count: 1 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      const { result } = renderHook(() => useAcordos());
      await esperarFetchInicial(result);

      const [, handler] = mockRealtimeSubscribe.mock.calls[0];

      act(() => {
        handler({ eventType: 'INSERT', newRecord: a1 }); // mesmo id
      });

      expect(result.current.acordos).toHaveLength(1);
      expect(result.current.totalCount).toBe(1);
    });
  });

  // ── equipe_id: resolução de operadores ─────────────────────────────────────
  describe('equipe_id', () => {
    it('consulta perfis para resolver operadores da equipe quando equipe_id é fornecido', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      // Resultado para a query de perfis (resolução de operadores da equipe)
      supabaseResultsByTable['perfis'] = [
        { data: [{ id: 'op-1' }, { id: 'op-2' }], error: null },
      ];

      renderHook(() => useAcordos({ equipe_id: 'equipe-x' }));

      await waitFor(() => {
        const perfisCall = supabaseCalls.find(c => c.table === 'perfis');
        expect(perfisCall).toBeDefined();
      });

      const perfisCall = supabaseCalls.find(c => c.table === 'perfis')!;
      expect(perfisCall.filters).toContainEqual(['eq', 'equipe_id', 'equipe-x']);
    });

    it('limpa operadoresEquipeIds quando equipe_id é removido dos filtros', async () => {
      mockFetchAcordos.mockResolvedValue({ data: [], count: 0 });
      mockPerfilValue.current  = fakePerfil();
      mockEmpresaValue.current = fakeEmpresa();

      supabaseResultsByTable['perfis'] = [
        { data: [{ id: 'op-1' }], error: null },
      ];

      const { rerender } = renderHook(
        (props: { equipe_id?: string }) => useAcordos(props),
        { initialProps: { equipe_id: 'equipe-x' } },
      );

      // Remove equipe_id
      act(() => { rerender({}); });

      // A lista de operadores é limpa — o hook não deve travar
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  useDashboardMetricas
// ═══════════════════════════════════════════════════════════════════════════════

describe('useDashboardMetricas', () => {
  it('estado inicial: loading=true, metricas zeradas', () => {
    const { result } = renderHook(() => useDashboardMetricas());
    expect(result.current.loading).toBe(true);
    expect(result.current.metricas.total_geral).toBe(0);
    expect(result.current.metricas.acordos_hoje).toBe(0);
  });

  it('não faz fetch quando perfil/empresa são nulos', async () => {
    // Reset explícito do spy para contar apenas chamadas DESTE teste
    (mockSupabaseFromSpy as Mock).mockClear();

    renderHook(() => useDashboardMetricas());
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });

    // Sem perfil/empresa nenhuma query à tabela 'acordos' deve ter ocorrido
    const acordosCalls = supabaseCalls.filter(c => c.table === 'acordos');
    expect(acordosCalls).toHaveLength(0);
  });

  it('fetch bem-sucedido: seta loading=false e chama calcularMetricasDashboard', async () => {
    mockPerfilValue.current  = fakePerfil();
    mockEmpresaValue.current = fakeEmpresa();

    const rows = [
      { status: 'pago', valor: 100, vencimento: '2024-06-01' },
      { status: 'nao_pago', valor: 200, vencimento: '2024-06-02' },
    ];
    supabaseResultsByTable['acordos'] = [{ data: rows, error: null, count: 2 }];

    const { result } = renderHook(() => useDashboardMetricas());

    await esperarMetricas(result);
    // calcularMetricasDashboard mockado retorna { total_geral: data.length }
    expect(result.current.metricas.total_geral).toBe(2);
  });

  it('fetch com erro: seta loading=false sem alterar metricas', async () => {
    mockPerfilValue.current  = fakePerfil();
    mockEmpresaValue.current = fakeEmpresa();

    supabaseResultsByTable['acordos'] = [
      { data: null, error: { message: 'DB error' }, count: null },
    ];

    const { result } = renderHook(() => useDashboardMetricas());

    await esperarMetricas(result);
    // metricas permanecem zeradas (o handler de erro faz return antes de setMetricas)
    expect(result.current.metricas.total_geral).toBe(0);
  });

  it('chama subscribe no mount e unsubscribe no unmount', async () => {
    mockPerfilValue.current  = fakePerfil();
    mockEmpresaValue.current = fakeEmpresa();

    supabaseResultsByTable['acordos'] = [{ data: [], error: null, count: 0 }];

    const { unmount } = renderHook(() => useDashboardMetricas());

    await waitFor(() => expect(mockRealtimeSubscribe).toHaveBeenCalled());
    expect(mockRealtimeSubscribe).toHaveBeenCalledWith(
      expect.stringContaining('useDashboardMetricas-'),
      expect.any(Function),
    );

    const [instanceId] = mockRealtimeSubscribe.mock.calls[0];
    unmount();
    expect(mockRealtimeUnsubscribe).toHaveBeenCalledWith(instanceId);
  });

  it('re-fetch é disparado quando o subscriber de realtime é chamado', async () => {
    mockPerfilValue.current  = fakePerfil();
    mockEmpresaValue.current = fakeEmpresa();

    const rows1 = [{ status: 'pago', valor: 100, vencimento: '2024-06-01' }];
    const rows2 = [
      { status: 'pago',     valor: 100, vencimento: '2024-06-01' },
      { status: 'nao_pago', valor: 200, vencimento: '2024-06-02' },
    ];

    supabaseResultsByTable['acordos'] = [
      { data: rows1, error: null, count: 1 },
      { data: rows2, error: null, count: 2 },
    ];

    const { result } = renderHook(() => useDashboardMetricas());
    await esperarMetricas(result);
    expect(result.current.metricas.total_geral).toBe(1);

    // Captura o subscriber e simula um evento
    const [, realtimeCallback] = mockRealtimeSubscribe.mock.calls[0];
    await act(async () => {
      realtimeCallback({ eventType: 'INSERT', newRecord: rows2[1] });
      // A releitura e AGRUPADA: uma importacao de 300 acordos dispara 300
      // eventos, e sem a janela cada um custaria uma varredura da empresa
      // inteira. Esperar a janela e parte do contrato.
      await new Promise(r => setTimeout(r, MS_AGRUPAMENTO_METRICAS + 80));
    });

    expect(result.current.metricas.total_geral).toBe(2);
  });

  it('uma rajada de eventos vira UMA releitura, nao uma por evento', async () => {
    mockPerfilValue.current  = fakePerfil();
    mockEmpresaValue.current = fakeEmpresa();

    const linha = { status: 'pago', valor: 100, vencimento: '2024-06-01' };
    supabaseResultsByTable['acordos'] = [
      { data: [linha], error: null, count: 1 },
      { data: [linha], error: null, count: 1 },
      { data: [linha], error: null, count: 1 },
    ];

    const { result } = renderHook(() => useDashboardMetricas());
    await esperarMetricas(result);
    const consultasDepoisDaCarga = supabaseCalls.filter(c => c.table === 'acordos').length;

    const [, realtimeCallback] = mockRealtimeSubscribe.mock.calls[0];
    await act(async () => {
      for (let i = 0; i < 10; i++) realtimeCallback({ eventType: 'INSERT', newRecord: linha });
      await new Promise(r => setTimeout(r, MS_AGRUPAMENTO_METRICAS + 80));
    });

    const novas = supabaseCalls.filter(c => c.table === 'acordos').length - consultasDepoisDaCarga;
    expect(novas).toBe(1);
  });
});
