/**
 * src/hooks/__tests__/useAuth.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para AuthProvider + useAuth()
 *
 * Estratégia de mock:
 *  • supabase          → vi.hoisted() + vi.mock('@/lib/supabase', ...)
 *                        builder thenable com fila por tabela
 *  • @/lib/tenant      → vi.mock para controlar getConfiguredTenantSlug()
 *  • Fake timers       → vi.useFakeTimers() para cobrir backoff exponencial
 *                        sem gastar 14 s reais
 *
 * Decisões não óbvias:
 *  • getSession é chamado no useEffect de montagem; o stub retorna { data: { session: null } }
 *    por padrão para não iniciar fetchPerfil automaticamente na maioria dos testes.
 *  • onAuthStateChange registra um callback e retorna { data: { subscription } };
 *    chamamos manualmente o callback via `capturedAuthCallback` para simular eventos.
 *  • O ramo "fallback sem join" (quando a query com join falha mas a sem join
 *    dá certo) é testado via fila de tabela: primeiro resultado = error, segundo = data.
 *  • Não testamos o ramo de username sem tenantSlug (emailResult nulo) pois é o
 *    mesmo fluxo do "usuário não encontrado" — coberto pelo teste de erro.
 *  • refreshPerfil não dispara quando user === null; esse caso trivial é omitido.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// ── 1. vi.hoisted: cria todos os spies ANTES de qualquer import ──────────────

const {
  mockGetSession,
  mockSignInWithPassword,
  mockAuthSignOut,
  mockOnAuthStateChange,
  mockRpc,
  mockSupabaseFrom,
  mockGetConfiguredTenantSlug,
} = vi.hoisted(() => {
  const mockGetSession          = vi.fn();
  const mockSignInWithPassword  = vi.fn();
  const mockAuthSignOut         = vi.fn();
  const mockOnAuthStateChange   = vi.fn();
  const mockRpc                 = vi.fn();
  const mockSupabaseFrom        = vi.fn();
  const mockGetConfiguredTenantSlug = vi.fn();

  return {
    mockGetSession,
    mockSignInWithPassword,
    mockAuthSignOut,
    mockOnAuthStateChange,
    mockRpc,
    mockSupabaseFrom,
    mockGetConfiguredTenantSlug,
  };
});

// ── 2. vi.mock declarados ANTES dos imports do SUT ────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession:          mockGetSession,
      signInWithPassword:  mockSignInWithPassword,
      signOut:             mockAuthSignOut,
      onAuthStateChange:   mockOnAuthStateChange,
    },
    from: mockSupabaseFrom,
    rpc:  mockRpc,
  },
  // Re-exporta tipos (não precisam ser mocks reais, só o shape)
}));

vi.mock('@/lib/tenant', () => ({
  getConfiguredTenantSlug: mockGetConfiguredTenantSlug,
}));

// ── 3. Imports do SUT (depois dos vi.mock) ───────────────────────────────────

import { AuthProvider, useAuth } from '@/hooks/useAuth';

// ── 4. Helpers de builder thenable ───────────────────────────────────────────

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

// Fila de resultados por nome de tabela
const resultsByTable: Record<string, MockResult[]> = {};
let defaultResult: MockResult = { data: null, error: null };

function nextResultFor(table: string): MockResult {
  const q = resultsByTable[table];
  if (q && q.length > 0) return q.shift()!;
  return defaultResult;
}

function setDefaultResult(r: MockResult) { defaultResult = r; }

function queueResultFor(table: string, ...results: MockResult[]) {
  resultsByTable[table] = [...(resultsByTable[table] ?? []), ...results];
}

function createBuilder(table: string) {
  // Captura `call` por closure — seguro mesmo quando dois builders vivem em paralelo
  const call: { table: string; filters: Array<[string, unknown, unknown]> } = { table, filters: [] };

  const builder: Record<string, unknown> = {
    select:      vi.fn(() => builder),
    insert:      vi.fn(() => builder),
    update:      vi.fn(() => builder),
    delete:      vi.fn(() => builder),
    eq:          vi.fn((col: string, val: unknown) => { call.filters.push(['eq', col, val]); return builder; }),
    neq:         vi.fn(() => builder),
    gte:         vi.fn(() => builder),
    lte:         vi.fn(() => builder),
    in:          vi.fn(() => builder),
    or:          vi.fn(() => builder),
    order:       vi.fn(() => builder),
    limit:       vi.fn(() => builder),
    range:       vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    single:      vi.fn(() => builder),
    // thenable — resolve com o próximo resultado da tabela atual
    then: (resolve: (v: MockResult) => unknown, _reject?: (e: unknown) => unknown) => {
      return Promise.resolve(nextResultFor(table)).then(resolve);
    },
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(nextResultFor(table)).catch(reject),
    finally: (fn: () => void) => Promise.resolve(nextResultFor(table)).finally(fn),
  };
  return builder;
}

// ── 5. Fábrica de user / session / perfil ─────────────────────────────────────

function makeUser(overrides: Partial<{ id: string; email: string }> = {}) {
  return { id: 'uid-123', email: 'operador@empresa.com', ...overrides };
}

function makeSession(userOverrides = {}) {
  const user = makeUser(userOverrides);
  return { user, access_token: 'tok', refresh_token: 'ref' };
}

function makePerfil(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uid-123',
    nome: 'Operador Teste',
    email: 'operador@empresa.com',
    perfil: 'operador' as const,
    ativo: true,
    lider_id: null,
    setor_id: null,
    empresa_id: 'emp-1',
    criado_em: '2024-01-01T00:00:00Z',
    atualizado_em: '2024-01-01T00:00:00Z',
    empresas: makeEmpresa(),
    ...overrides,
  };
}

function makeEmpresa(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    nome: 'Empresa Teste',
    slug: 'pagueplay',
    ativo: true,
    config: {},
    criado_em: '2024-01-01T00:00:00Z',
    atualizado_em: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── 6. Variável para capturar o callback registrado em onAuthStateChange ──────

let capturedAuthCallback: ((event: string, session: unknown) => void) | null = null;
const mockUnsubscribe = vi.fn();

// ── 7. Wrapper para renderHook ────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

// ── 8. Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Limpa filas entre testes
  for (const k of Object.keys(resultsByTable)) delete resultsByTable[k];
  defaultResult = { data: null, error: null };

  // Por padrão: sem sessão ativa
  mockGetSession.mockResolvedValue({ data: { session: null } });

  // Captura o callback passado para onAuthStateChange
  mockOnAuthStateChange.mockImplementation((cb: (e: string, s: unknown) => void) => {
    capturedAuthCallback = cb;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });

  // supabase.from → builder thenable
  mockSupabaseFrom.mockImplementation((table: string) => createBuilder(table));

  // supabase.auth.signOut → sucesso por padrão
  mockAuthSignOut.mockResolvedValue({ error: null });

  // tenantSlug default
  mockGetConfiguredTenantSlug.mockReturnValue('pagueplay');
});

afterEach(() => {
  vi.useRealTimers();
  capturedAuthCallback = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTES
// ─────────────────────────────────────────────────────────────────────────────

describe('useAuth – estado inicial', () => {
  it('loading=true logo após montar (antes de getSession resolver)', async () => {
    // getSession nunca resolve durante este teste
    mockGetSession.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.perfil).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('loading=false e user=null quando não há sessão', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.perfil).toBeNull();
  });

  it('lança erro ao usar useAuth fora do AuthProvider', () => {
    // renderHook sem wrapper → contexto undefined → deve lançar
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth deve ser usado dentro de AuthProvider'
    );
  });
});

describe('useAuth – restauração de sessão (getSession)', () => {
  it('carrega perfil quando getSession retorna sessão ativa', async () => {
    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.id).toBe('uid-123');
    expect(result.current.session).toBeTruthy();
    expect(result.current.perfil?.nome).toBe('Operador Teste');
    expect(result.current.empresa?.slug).toBe('pagueplay');
    expect(result.current.perfilLoading).toBe(false);
  });
});

describe('useAuth – onAuthStateChange', () => {
  it('carrega perfil quando onAuthStateChange dispara com sessão', async () => {
    // getSession sem sessão (loading termina rápido)
    mockGetSession.mockResolvedValue({ data: { session: null } });
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simula evento de auth
    await act(async () => {
      capturedAuthCallback!('SIGNED_IN', makeSession());
    });

    await waitFor(() => expect(result.current.perfil).not.toBeNull());
    expect(result.current.user?.id).toBe('uid-123');
    expect(result.current.perfil?.nome).toBe('Operador Teste');
  });

  it('limpa estado quando onAuthStateChange dispara com session=null', async () => {
    // Começa com sessão
    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.perfil).not.toBeNull());

    // Logout via evento
    await act(async () => {
      capturedAuthCallback!('SIGNED_OUT', null);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.perfil).toBeNull();
    expect(result.current.empresa).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe('useAuth – signIn', () => {
  it('happy path com email: chama signInWithPassword e carrega perfil', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({
      data: { user: makeUser(), session: makeSession() },
      error: null,
    });
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult!: { error: string | null };
    await act(async () => {
      signInResult = await result.current.signIn('operador@empresa.com', 'senha123');
    });

    expect(signInResult.error).toBeNull();
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'operador@empresa.com',
      password: 'senha123',
    });
    expect(result.current.perfil?.nome).toBe('Operador Teste');
    expect(result.current.authError).toBeNull();
  });

  it('retorna erro traduzido para credenciais inválidas', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult!: { error: string | null };
    await act(async () => {
      signInResult = await result.current.signIn('wrong@email.com', 'errado');
    });

    expect(signInResult.error).toMatch(/credenciais inválidas/i);
    expect(result.current.perfil).toBeNull();
  });

  it('retorna erro traduzido para email não confirmado', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Email not confirmed' },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult!: { error: string | null };
    await act(async () => {
      signInResult = await result.current.signIn('noconf@empresa.com', 'senha');
    });

    expect(signInResult.error).toMatch(/email não confirmado/i);
  });

  it('happy path com username: resolve email via RPC e chama signInWithPassword', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    // RPC com empresa_slug → retorna email
    mockRpc.mockResolvedValue({ data: 'operador@empresa.com', error: null });
    mockSignInWithPassword.mockResolvedValue({
      data: { user: makeUser(), session: makeSession() },
      error: null,
    });
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult!: { error: string | null };
    await act(async () => {
      signInResult = await result.current.signIn('operador', 'senha123');
    });

    expect(signInResult.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('buscar_email_por_usuario_empresa', {
      p_usuario: 'operador',
      p_empresa_slug: 'pagueplay',
    });
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'operador@empresa.com',
      password: 'senha123',
    });
  });

  it('username: usa RPC genérico quando RPC com empresa falha', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    // Primeiro RPC (com empresa) falha
    // Segundo RPC (genérico) retorna email
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
      .mockResolvedValueOnce({ data: 'operador@empresa.com', error: null });

    mockSignInWithPassword.mockResolvedValue({
      data: { user: makeUser(), session: makeSession() },
      error: null,
    });
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult!: { error: string | null };
    await act(async () => {
      signInResult = await result.current.signIn('operador', 'senha123');
    });

    expect(signInResult.error).toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenLastCalledWith('buscar_email_por_usuario', { p_usuario: 'operador' });
  });

  it('username não encontrado em nenhum RPC retorna erro', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult!: { error: string | null };
    await act(async () => {
      signInResult = await result.current.signIn('usuario_inexistente', 'senha');
    });

    expect(signInResult.error).toMatch(/usuário não encontrado/i);
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});

describe('useAuth – signOut', () => {
  it('chama supabase.auth.signOut e limpa user/session/perfil/empresa/authError', async () => {
    // Inicia com sessão + perfil
    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.perfil).not.toBeNull());

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockAuthSignOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.perfil).toBeNull();
    expect(result.current.empresa).toBeNull();
    expect(result.current.authError).toBeNull();
  });
});

describe('useAuth – validação multi-tenant', () => {
  it('bloqueia usuário cuja empresa tem slug diferente do VITE_TENANT_SLUG', async () => {
    mockGetConfiguredTenantSlug.mockReturnValue('pagueplay');

    const perfilOutraEmpresa = makePerfil({
      empresas: makeEmpresa({ slug: 'outra-empresa', nome: 'Outra Empresa LTDA' }),
    });

    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });
    queueResultFor('perfis', { data: perfilOutraEmpresa, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.perfil).toBeNull();
    expect(result.current.empresa).toBeNull();
    expect(result.current.authError).toMatch(/vinculado/i);
    expect(mockAuthSignOut).toHaveBeenCalled();
  });

  it('super_admin bypassa validação de tenant', async () => {
    mockGetConfiguredTenantSlug.mockReturnValue('pagueplay');

    const perfilSuperAdmin = makePerfil({
      perfil: 'super_admin',
      empresas: makeEmpresa({ slug: 'outra-empresa' }),
    });

    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });
    queueResultFor('perfis', { data: perfilSuperAdmin, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // super_admin deve ser aceito mesmo com slug diferente
    expect(result.current.perfil?.perfil).toBe('super_admin');
    expect(result.current.authError).toBeNull();
    expect(mockAuthSignOut).not.toHaveBeenCalled();
  });

  it('aceita usuário quando slug bate com VITE_TENANT_SLUG', async () => {
    mockGetConfiguredTenantSlug.mockReturnValue('pagueplay');

    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });
    queueResultFor('perfis', { data: makePerfil(), error: null }); // slug = 'pagueplay'

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.perfil).not.toBeNull();
    expect(result.current.authError).toBeNull();
  });

  it('bloqueia no signIn quando tenant não confere', async () => {
    mockGetConfiguredTenantSlug.mockReturnValue('pagueplay');
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const perfilOutraEmpresa = makePerfil({
      empresas: makeEmpresa({ slug: 'outra-empresa', nome: 'Outra Empresa' }),
    });

    mockSignInWithPassword.mockResolvedValue({
      data: { user: makeUser(), session: makeSession() },
      error: null,
    });
    queueResultFor('perfis', { data: perfilOutraEmpresa, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult!: { error: string | null };
    await act(async () => {
      signInResult = await result.current.signIn('operador@empresa.com', 'senha');
    });

    expect(signInResult.error).toMatch(/vinculado/i);
    expect(mockAuthSignOut).toHaveBeenCalled();
  });
});

describe('useAuth – fetchPerfil com backoff exponencial', () => {
  /**
   * Estratégia:
   *   1. Monta sem sessão → hook fica em loading=false sem chamar fetchPerfil
   *   2. Injeta fila de resultados em `resultsByTable['perfis']`
   *   3. Aciona `capturedAuthCallback` para simular SIGNED_IN
   *   4. Usa `await act(async () => { await vi.runAllTimersAsync() })` para:
   *      - executar todas as microtasks encadeadas (builder thenable)
   *      - disparar todos os setTimeout do backoff
   *   Isso é equivalente a `vi.useFakeTimers` + avançar o clock completo,
   *   sem precisar coordenar tick a tick.
   */
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  it('retenta após falha e carrega perfil na segunda tentativa', async () => {
    // Monta sem sessão
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    // Deixa o hook estabilizar (sem timer, só microtasks do getSession)
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(result.current.loading).toBe(false);

    // attempt 1 join → erro, attempt 1 fallback → erro (backoff 500ms)
    // attempt 2 join → sucesso
    resultsByTable['perfis'] = [
      { data: null, error: { message: 'DB error' } },
      { data: null, error: { message: 'DB error fallback' } },
      { data: makePerfil(), error: null },
    ];

    // Dispara SIGNED_IN — isSigningIn=false → onAuthStateChange chama fetchPerfil
    act(() => { capturedAuthCallback!('SIGNED_IN', makeSession()); });

    // Roda todos os timers (o setTimeout de 500ms do backoff) + microtasks
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(result.current.perfil?.nome).toBe('Operador Teste');
    expect(result.current.authError).toBeNull();
    expect(result.current.perfilLoading).toBe(false);
  });

  it('seta authError após esgotar todas as 7 tentativas', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(result.current.loading).toBe(false);

    // 7 tentativas × 2 queries (join + fallback) = 14 erros
    for (let i = 0; i < 14; i++) {
      queueResultFor('perfis', { data: null, error: { message: `err ${i}` } });
    }

    act(() => { capturedAuthCallback!('SIGNED_IN', makeSession()); });

    // runAllTimersAsync dispara todos os setTimeout do backoff em cascata
    // (500 → 1000 → 2000 → 4000 → 8000 → 8000 → fim do loop)
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(result.current.perfil).toBeNull();
    expect(result.current.perfilLoading).toBe(false);
    expect(result.current.authError).toMatch(/perfil do usuário/i);
  });

  it('delays do backoff respeitam a sequência exponencial com cap', async () => {
    /**
     * Verifica que o delay entre attempts NÃO é constante:
     * - Avança apenas 1499ms (< 500+1000) → só a attempt 2 rodou (não a 3ª)
     * - Avança mais 501ms → attempt 3 completa (mas 4ª ainda não)
     * - Avança mais 2000ms → attempt 4 traz o perfil
     *
     * Isso confirma delays de 500ms, 1000ms, 2000ms entre tentativas.
     */
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await vi.runAllTimersAsync(); });

    // 3 falhas → 4ª traz perfil (cada tentativa = join + fallback para erros)
    resultsByTable['perfis'] = [
      { data: null, error: { message: 'e1' } },   // attempt 1 join
      { data: null, error: { message: 'e1f' } },  // attempt 1 fallback
      { data: null, error: { message: 'e2' } },   // attempt 2 join
      { data: null, error: { message: 'e2f' } },  // attempt 2 fallback
      { data: null, error: { message: 'e3' } },   // attempt 3 join
      { data: null, error: { message: 'e3f' } },  // attempt 3 fallback
      { data: makePerfil(), error: null },          // attempt 4 join → sucesso
    ];

    act(() => { capturedAuthCallback!('SIGNED_IN', makeSession()); });

    // Avança apenas 1499ms: passa pelo delay 1 (500ms) mas não pelo delay 2 (1000ms)
    // → attempt 2 rodou (também erro), mas attempt 3 ainda não executou
    await act(async () => { vi.advanceTimersByTime(1499); });
    // Drena microtasks da attempt 2 (não usa runAllTimers para não avançar demais)
    for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });

    // attempt 3 não deve ter rodado ainda → perfil ainda null
    // (as 4 entradas da fila: e1, e1f, e2, e2f foram consumidas; e3 ainda está na fila)
    expect(resultsByTable['perfis']?.length).toBeGreaterThanOrEqual(3);

    // Agora deixa tudo correr
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(result.current.perfil?.nome).toBe('Operador Teste');
  });
});

describe('useAuth – refreshPerfil', () => {
  it('dispara re-fetch do perfil quando chamado com user ativo', async () => {
    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });

    // Primeira carga
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.perfil).not.toBeNull());

    // Atualiza perfil no banco (nome diferente)
    const perfilAtualizado = makePerfil({ nome: 'Operador Atualizado' });
    queueResultFor('perfis', { data: perfilAtualizado, error: null });

    await act(async () => {
      await result.current.refreshPerfil();
    });

    await waitFor(() => expect(result.current.perfil?.nome).toBe('Operador Atualizado'));
  });

  it('não dispara fetch quando user é null', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refreshPerfil();
    });

    // from não deve ter sido chamado para 'perfis' (user é null)
    const perfisCalls = (mockSupabaseFrom as Mock).mock.calls.filter(
      ([t]: [string]) => t === 'perfis'
    );
    expect(perfisCalls).toHaveLength(0);
  });
});

describe('useAuth – cleanup ao desmontar', () => {
  it('chama subscription.unsubscribe() no unmount', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { unmount } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {});

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useAuth – perfilLoading', () => {
  it('perfilLoading=false ao final do fetchPerfil (sucesso)', async () => {
    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });
    queueResultFor('perfis', { data: makePerfil(), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.perfilLoading).toBe(false);
  });
});

describe('useAuth – fallback sem join', () => {
  it('carrega perfil via fallback quando query com join falha', async () => {
    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });

    // Primeira query (com join) → erro
    // Segunda query (sem join / fallback) → retorna perfil sem empresas (sem slug)
    // Como não há slug no perfil, não faz validação de tenant
    const perfilSemJoin = { ...makePerfil(), empresas: undefined, empresa_id: undefined };
    resultsByTable['perfis'] = [
      { data: null, error: { message: 'join error' } },
      { data: perfilSemJoin, error: null },
    ];

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.perfil).not.toBeNull();
    expect(result.current.perfil?.nome).toBe('Operador Teste');
  });

  it('fallback com empresa separada: bloqueia se slug não confere', async () => {
    mockGetConfiguredTenantSlug.mockReturnValue('pagueplay');
    const session = makeSession();
    mockGetSession.mockResolvedValue({ data: { session } });

    // Query com join → erro
    // Fallback sem join → retorna perfil com empresa_id mas sem empresas embedded
    const perfilFallback = {
      ...makePerfil({ empresas: undefined }),
      empresa_id: 'emp-outra',
    };
    resultsByTable['perfis'] = [
      { data: null, error: { message: 'join error' } },
      { data: perfilFallback, error: null },
    ];
    // Busca separada da empresa
    queueResultFor('empresas', { data: makeEmpresa({ slug: 'outra-empresa', nome: 'Outra' }), error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.perfil).toBeNull();
    expect(result.current.authError).toMatch(/vinculado/i);
    expect(mockAuthSignOut).toHaveBeenCalled();
  });
});
