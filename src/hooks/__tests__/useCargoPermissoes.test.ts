/**
 * src/hooks/__tests__/useCargoPermissoes.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para o hook useCargoPermissoes.
 * SEGURANÇA CRÍTICA — cobertura completa de todas as branches de permissão.
 *
 * Cenários cobertos:
 *   1. Estado inicial: loading=true
 *   2. Guarda defensiva: sem empresa → loading=false, permissoes={}
 *   3. Guarda defensiva: sem cargo (perfil=null) → loading=false
 *   4. Fetch bem-sucedido → todasPermissoes populadas, permissoes do cargo atual
 *   5. Fetch com erro → loading=false, permissoes={}
 *   6. temPermissao: cargo normal com permissão concedida → true
 *   7. temPermissao: cargo normal com permissão negada → false
 *   8. temPermissao: cargo normal sem a chave → false
 *   9. isAdmin: cargo 'administrador' → isAdmin=true, temPermissao sempre true
 *  10. isAdmin: cargo 'super_admin' → isAdmin=true, temPermissao sempre true
 *  11. isAdmin: cargo 'operador' → isAdmin=false
 *  12. isAdmin: cargo 'lider' → isAdmin=false
 *  13. isAdmin: cargo 'gerencia' → isAdmin=false
 *  14. Cargo sem linha de permissão na empresa → permissoes={}
 *  15. refresh força re-fetch
 *  16. Múltiplas linhas de permissão: retorna apenas do cargo do usuário atual
 *
 * Mock do Supabase: builder thenable com fila por tabela.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── 1. vi.hoisted ─────────────────────────────────────────────────────────────

const {
  mockPerfilRef,
  mockEmpresaRef,
  mockSupabaseFrom,
} = vi.hoisted(() => {
  const mockPerfilRef  = { current: null as { perfil: string; id?: string } | null };
  const mockEmpresaRef = { current: null as { id: string } | null };
  const mockSupabaseFrom = vi.fn();

  return { mockPerfilRef, mockEmpresaRef, mockSupabaseFrom };
});

// ── 2. vi.mock ANTES dos imports do SUT ───────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockSupabaseFrom,
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: mockPerfilRef.current }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: mockEmpresaRef.current }),
}));

// ── 3. Import do SUT ──────────────────────────────────────────────────────────

import { useCargoPermissoes, type CargoPermissaoRow } from '../useCargoPermissoes';

// ── 4. Builder thenable helper ────────────────────────────────────────────────

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

const resultsByTable: Record<string, MockResult[]> = {};
let defaultResult: MockResult = { data: null, error: null };

function nextResultFor(table: string): MockResult {
  const q = resultsByTable[table];
  if (q && q.length > 0) return q.shift()!;
  return defaultResult;
}

function queueResultFor(table: string, ...results: MockResult[]) {
  resultsByTable[table] = [...(resultsByTable[table] ?? []), ...results];
}

function setDefaultResult(r: MockResult) { defaultResult = r; }

function createBuilder(table: string) {
  const builder: Record<string, unknown> = {};

  const makeThenable = () =>
    Object.assign(builder, {
      then: vi.fn((resolve: (v: MockResult) => void) => {
        const r = nextResultFor(table);
        resolve(r);
        return Promise.resolve(r);
      }),
    });

  builder.select = vi.fn(() => { makeThenable(); return builder; });
  builder.eq     = vi.fn(() => { makeThenable(); return builder; });
  builder.order  = vi.fn(() => { makeThenable(); return builder; });

  makeThenable();
  return builder;
}

const EMPRESA_ID = 'empresa-test-99';

function makeCargoRow(overrides: Partial<CargoPermissaoRow> = {}): CargoPermissaoRow {
  return {
    id:           'row-1',
    empresa_id:   EMPRESA_ID,
    cargo:        'operador',
    permissoes:   {},
    atualizado_em: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── 5. Testes ─────────────────────────────────────────────────────────────────

describe('useCargoPermissoes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resultsByTable['cargos_permissoes'] = [];
    defaultResult = { data: null, error: null };

    mockSupabaseFrom.mockImplementation((table: string) => createBuilder(table));
  });

  afterEach(() => {
    mockPerfilRef.current  = null;
    mockEmpresaRef.current = null;
  });

  // ─── Estado inicial ────────────────────────────────────────────────────

  it('começa com loading=true', () => {
    mockPerfilRef.current  = { perfil: 'operador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };
    // Não resolve ainda
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      then:   vi.fn(), // não chama resolve → loading permanece true
    });

    const { result } = renderHook(() => useCargoPermissoes());
    expect(result.current.loading).toBe(true);
  });

  // ─── Guardas defensivas ────────────────────────────────────────────────

  it('faz early return quando não há empresa: loading=false, permissoes={}', async () => {
    mockPerfilRef.current  = { perfil: 'operador' };
    mockEmpresaRef.current = null;

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissoes).toEqual({});
    expect(result.current.todasPermissoes).toEqual([]);
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('faz early return quando perfil é null: loading=false', async () => {
    mockPerfilRef.current  = null;
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissoes).toEqual({});
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  it('faz early return quando cargo é string vazia', async () => {
    mockPerfilRef.current  = { perfil: '' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockSupabaseFrom).not.toHaveBeenCalled();
  });

  // ─── Fetch bem-sucedido ────────────────────────────────────────────────

  it('carrega todasPermissoes e as permissões do cargo atual', async () => {
    mockPerfilRef.current  = { perfil: 'lider' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const rows: CargoPermissaoRow[] = [
      makeCargoRow({ cargo: 'operador', permissoes: { ver_lixeira: false } }),
      makeCargoRow({ cargo: 'lider',    permissoes: { ver_lixeira: true, editar_acordo: true } }),
    ];

    queueResultFor('cargos_permissoes', { data: rows, error: null });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.todasPermissoes).toHaveLength(2);
    expect(result.current.permissoes).toEqual({ ver_lixeira: true, editar_acordo: true });
  });

  it('quando o cargo do usuário não tem linha na empresa: permissoes={}', async () => {
    mockPerfilRef.current  = { perfil: 'elite' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const rows: CargoPermissaoRow[] = [
      makeCargoRow({ cargo: 'operador', permissoes: { ver_lixeira: false } }),
    ];

    queueResultFor('cargos_permissoes', { data: rows, error: null });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissoes).toEqual({});
    expect(result.current.todasPermissoes).toHaveLength(1);
  });

  // ─── Fetch com erro ────────────────────────────────────────────────────

  it('trata erro do banco: loading=false, permissoes={}', async () => {
    mockPerfilRef.current  = { perfil: 'operador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    queueResultFor('cargos_permissoes', {
      data: null,
      error: { message: 'DB Connection refused' },
    });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.permissoes).toEqual({});
    expect(result.current.todasPermissoes).toEqual([]);
  });

  // ─── temPermissao: cargo normal ───────────────────────────────────────

  it('temPermissao retorna true quando chave existe e é true', async () => {
    mockPerfilRef.current  = { perfil: 'lider' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    queueResultFor('cargos_permissoes', {
      data: [makeCargoRow({ cargo: 'lider', permissoes: { ver_lixeira: true } })],
      error: null,
    });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.temPermissao('ver_lixeira')).toBe(true);
  });

  it('temPermissao retorna false quando chave existe e é false', async () => {
    mockPerfilRef.current  = { perfil: 'operador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    queueResultFor('cargos_permissoes', {
      data: [makeCargoRow({ cargo: 'operador', permissoes: { ver_lixeira: false } })],
      error: null,
    });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.temPermissao('ver_lixeira')).toBe(false);
  });

  it('temPermissao retorna false quando chave não existe no mapa', async () => {
    mockPerfilRef.current  = { perfil: 'operador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    queueResultFor('cargos_permissoes', {
      data: [makeCargoRow({ cargo: 'operador', permissoes: { ver_lixeira: true } })],
      error: null,
    });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.temPermissao('chave_inexistente')).toBe(false);
  });

  // ─── isAdmin e temPermissao para administrador ─────────────────────────

  it('cargo administrador: isAdmin=true, temPermissao sempre true', async () => {
    mockPerfilRef.current  = { perfil: 'administrador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    queueResultFor('cargos_permissoes', {
      data: [makeCargoRow({ cargo: 'administrador', permissoes: {} })],
      error: null,
    });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.temPermissao('qualquer_permissao')).toBe(true);
    expect(result.current.temPermissao('ver_lixeira')).toBe(true);
    expect(result.current.temPermissao('editar_acordo')).toBe(true);
  });

  it('cargo super_admin: isAdmin=true, temPermissao sempre true', async () => {
    mockPerfilRef.current  = { perfil: 'super_admin' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    queueResultFor('cargos_permissoes', {
      data: [makeCargoRow({ cargo: 'super_admin', permissoes: {} })],
      error: null,
    });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.temPermissao('nenhuma_permissao_configurada')).toBe(true);
  });

  // ─── isAdmin=false para cargos não-admin ──────────────────────────────

  it.each([
    ['operador'],
    ['lider'],
    ['gerencia'],
    ['elite'],
    ['diretoria'],
  ])('cargo %s: isAdmin=false', async (cargo) => {
    mockPerfilRef.current  = { perfil: cargo };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    queueResultFor('cargos_permissoes', {
      data: [makeCargoRow({ cargo, permissoes: {} })],
      error: null,
    });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAdmin).toBe(false);
  });

  // ─── Múltiplas linhas: retorna só do cargo do usuário ─────────────────

  it('com múltiplas linhas usa somente a do cargo atual', async () => {
    mockPerfilRef.current  = { perfil: 'lider' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const rows: CargoPermissaoRow[] = [
      makeCargoRow({ cargo: 'operador',      permissoes: { ver_lixeira: false, editar: false } }),
      makeCargoRow({ cargo: 'lider',         permissoes: { ver_lixeira: true,  editar: true  } }),
      makeCargoRow({ cargo: 'administrador', permissoes: { ver_lixeira: true,  editar: true,  excluir: true } }),
    ];

    queueResultFor('cargos_permissoes', { data: rows, error: null });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.permissoes).toEqual({ ver_lixeira: true, editar: true });
    expect(result.current.permissoes).not.toHaveProperty('excluir');
  });

  // ─── refresh ──────────────────────────────────────────────────────────

  it('refresh força re-fetch e atualiza estado', async () => {
    mockPerfilRef.current  = { perfil: 'operador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };

    const rowsV1 = [makeCargoRow({ cargo: 'operador', permissoes: { ver_lixeira: false } })];
    const rowsV2 = [makeCargoRow({ cargo: 'operador', permissoes: { ver_lixeira: true  } })];

    queueResultFor('cargos_permissoes', { data: rowsV1, error: null });
    queueResultFor('cargos_permissoes', { data: rowsV2, error: null });

    const { result } = renderHook(() => useCargoPermissoes());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.temPermissao('ver_lixeira')).toBe(false);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.temPermissao('ver_lixeira')).toBe(true);
    expect(mockSupabaseFrom).toHaveBeenCalledTimes(2);
  });
});
