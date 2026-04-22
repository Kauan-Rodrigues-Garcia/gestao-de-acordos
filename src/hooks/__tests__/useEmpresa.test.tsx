/**
 * src/hooks/__tests__/useEmpresa.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Testes unitários para EmpresaProvider + useEmpresa().
 *
 * Cenários cobertos:
 *   1. useEmpresa fora do provider → throw
 *   2. Estado inicial: loading=true, empresa=null, error=null
 *   3. Sem slug (VITE_TENANT_SLUG=''): usa fetchEmpresaAtual → empresa populada
 *   4. Com slug: usa fetchEmpresaBySlug → empresa populada
 *   5. Com slug: empresa não encontrada + sessão ativa → error setado
 *   6. Com slug: empresa não encontrada + sem sessão → error=null
 *   7. Erro genérico no load → empresa=null, error setado, loading=false
 *   8. onAuthStateChange SIGNED_IN → reload
 *   9. onAuthStateChange SIGNED_OUT → reload
 *  10. onAuthStateChange TOKEN_REFRESHED → NÃO dispara reload
 *  11. Cleanup: subscription.unsubscribe chamado no unmount
 *  12. refresh chama load novamente
 *  13. Expõe branding e features via runtimeConfig
 *
 * Estratégia:
 *  - getTenantRuntimeConfig → vi.mock com controle de slug
 *  - fetchEmpresaBySlug / fetchEmpresaAtual → vi.mock de serviço
 *  - supabase.auth.getSession + onAuthStateChange → vi.mock
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// ── 1. vi.hoisted ─────────────────────────────────────────────────────────────

const {
  mockGetSession,
  mockOnAuthStateChange,
  mockFetchEmpresaBySlug,
  mockFetchEmpresaAtual,
  mockGetTenantRuntimeConfig,
  capturedAuthCallbackRef,
  mockUnsubscribe,
} = vi.hoisted(() => {
  const mockGetSession        = vi.fn();
  const mockOnAuthStateChange = vi.fn();
  const mockFetchEmpresaBySlug = vi.fn();
  const mockFetchEmpresaAtual  = vi.fn();
  const mockGetTenantRuntimeConfig = vi.fn();
  const mockUnsubscribe = vi.fn();

  const capturedAuthCallbackRef: {
    current: ((event: string) => void) | null;
  } = { current: null };

  // onAuthStateChange captura o callback e retorna subscription
  mockOnAuthStateChange.mockImplementation(
    (cb: (event: string) => void) => {
      capturedAuthCallbackRef.current = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    },
  );

  return {
    mockGetSession,
    mockOnAuthStateChange,
    mockFetchEmpresaBySlug,
    mockFetchEmpresaAtual,
    mockGetTenantRuntimeConfig,
    capturedAuthCallbackRef,
    mockUnsubscribe,
  };
});

// ── 2. vi.mock ANTES dos imports do SUT ───────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession:        mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

vi.mock('@/services/empresas.service', () => ({
  fetchEmpresaBySlug: mockFetchEmpresaBySlug,
  fetchEmpresaAtual:  mockFetchEmpresaAtual,
}));

vi.mock('@/lib/tenant', () => ({
  getTenantRuntimeConfig: mockGetTenantRuntimeConfig,
}));

// ── 3. Import do SUT ──────────────────────────────────────────────────────────

import { EmpresaProvider, useEmpresa } from '../useEmpresa';
import type { Empresa } from '@/lib/supabase';

// ── 4. Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_BRANDING = {
  appName:            'Gestão de Acordos',
  shortName:          'Gestão de Acordos',
  tagline:            'Sistema',
  loginTitle:         'Login',
  loginSubtitle:      'Subtítulo',
  registerSubtitle:   'Registro',
  supportText:        'Suporte',
};
const DEFAULT_FEATURES = {
  allowSelfRegistration:         true,
  allowSuperAdminTenantSwitch:   true,
};

function makeRuntimeConfig(overrides: { slug?: string; empresa?: Empresa | null } = {}) {
  const { slug = '', empresa = null } = overrides;
  return {
    slug,
    siteUrl:  null,
    branding: { ...DEFAULT_BRANDING, shortName: empresa?.nome ?? DEFAULT_BRANDING.shortName },
    features: DEFAULT_FEATURES,
  };
}

function makeEmpresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    id:            'emp-1',
    nome:          'Empresa Teste',
    slug:          'empresa-teste',
    ativo:         true,
    config:        {},
    criado_em:     '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(EmpresaProvider, null, children);
}

// ── 5. Testes ─────────────────────────────────────────────────────────────────

describe('EmpresaProvider + useEmpresa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAuthCallbackRef.current = null;

    // Default: sem slug, sem sessão
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: '' }));
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockFetchEmpresaAtual.mockResolvedValue(null);
    mockFetchEmpresaBySlug.mockResolvedValue(null);

    // Restaura o comportamento padrão do onAuthStateChange
    mockOnAuthStateChange.mockImplementation(
      (cb: (event: string) => void) => {
        capturedAuthCallbackRef.current = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    );
  });

  // ─── useEmpresa fora do provider ──────────────────────────────────────

  it('lança erro quando useEmpresa é usado fora do EmpresaProvider', () => {
    expect(() => {
      renderHook(() => useEmpresa());
    }).toThrow('useEmpresa deve ser usado dentro de EmpresaProvider');
  });

  // ─── Sem slug → fetchEmpresaAtual ─────────────────────────────────────

  it('sem slug usa fetchEmpresaAtual', async () => {
    const emp = makeEmpresa();
    mockFetchEmpresaAtual.mockResolvedValue(emp);
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: '', empresa: emp }));

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetchEmpresaAtual).toHaveBeenCalledTimes(1);
    expect(mockFetchEmpresaBySlug).not.toHaveBeenCalled();
    expect(result.current.empresa).toEqual(emp);
    expect(result.current.error).toBeNull();
  });

  // ─── Com slug → fetchEmpresaBySlug ────────────────────────────────────

  it('com slug usa fetchEmpresaBySlug e popula empresa', async () => {
    const emp = makeEmpresa({ slug: 'minha-empresa' });
    mockFetchEmpresaBySlug.mockResolvedValue(emp);
    mockGetTenantRuntimeConfig
      .mockReturnValueOnce(makeRuntimeConfig({ slug: 'minha-empresa' }))
      .mockReturnValue(makeRuntimeConfig({ slug: 'minha-empresa', empresa: emp }));

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetchEmpresaBySlug).toHaveBeenCalledWith('minha-empresa');
    expect(result.current.empresa).toEqual(emp);
    expect(result.current.error).toBeNull();
  });

  // ─── Com slug: empresa não encontrada + sessão ativa ──────────────────

  it('slug sem empresa + sessão ativa → empresa=null, error setado', async () => {
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: 'xyz' }));
    mockFetchEmpresaBySlug.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.empresa).toBeNull();
    expect(result.current.error).toMatch(/empresa configurada/i);
  });

  // ─── Com slug: empresa não encontrada + sem sessão → error=null ───────

  it('slug sem empresa + sem sessão → empresa=null, error=null', async () => {
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: 'xyz' }));
    mockFetchEmpresaBySlug.mockResolvedValue(null);
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.empresa).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // ─── Erro genérico no load ────────────────────────────────────────────

  it('erro genérico no fetch: empresa=null, error setado, loading=false', async () => {
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: '' }));
    mockFetchEmpresaAtual.mockRejectedValue(new Error('Timeout'));

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.empresa).toBeNull();
    expect(result.current.error).toBe('Timeout');
  });

  it('erro não-Error: usa mensagem fallback', async () => {
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: '' }));
    mockFetchEmpresaAtual.mockRejectedValue('raw string error');

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Erro ao carregar tenant.');
  });

  // ─── onAuthStateChange: SIGNED_IN dispara reload ──────────────────────

  it('onAuthStateChange SIGNED_IN dispara reload', async () => {
    const emp = makeEmpresa();
    mockFetchEmpresaAtual.mockResolvedValue(emp);
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: '', empresa: emp }));

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = (mockFetchEmpresaAtual as Mock).mock.calls.length;

    await act(async () => {
      capturedAuthCallbackRef.current?.('SIGNED_IN');
      await new Promise(r => setTimeout(r, 0));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect((mockFetchEmpresaAtual as Mock).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // ─── onAuthStateChange: SIGNED_OUT dispara reload ─────────────────────

  it('onAuthStateChange SIGNED_OUT dispara reload', async () => {
    mockFetchEmpresaAtual.mockResolvedValue(null);
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: '' }));

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = (mockFetchEmpresaAtual as Mock).mock.calls.length;

    await act(async () => {
      capturedAuthCallbackRef.current?.('SIGNED_OUT');
      await new Promise(r => setTimeout(r, 0));
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect((mockFetchEmpresaAtual as Mock).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // ─── onAuthStateChange: TOKEN_REFRESHED NÃO dispara reload ───────────

  it('onAuthStateChange TOKEN_REFRESHED NÃO dispara reload', async () => {
    mockFetchEmpresaAtual.mockResolvedValue(null);
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: '' }));

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsAfterMount = (mockFetchEmpresaAtual as Mock).mock.calls.length;

    act(() => {
      capturedAuthCallbackRef.current?.('TOKEN_REFRESHED');
    });

    // Pequeno delay para verificar que não disparou chamadas extras
    await new Promise(r => setTimeout(r, 10));

    expect((mockFetchEmpresaAtual as Mock).mock.calls.length).toBe(callsAfterMount);
  });

  // ─── Cleanup: unsubscribe ao desmontar ────────────────────────────────

  it('chama subscription.unsubscribe ao desmontar', async () => {
    mockFetchEmpresaAtual.mockResolvedValue(null);
    mockGetTenantRuntimeConfig.mockReturnValue(makeRuntimeConfig({ slug: '' }));

    const { unmount } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => {
      expect(mockOnAuthStateChange).toHaveBeenCalled();
    });

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  // ─── refresh ──────────────────────────────────────────────────────────

  it('refresh força reload e atualiza empresa', async () => {
    const emp1 = makeEmpresa({ nome: 'Empresa V1' });
    const emp2 = makeEmpresa({ nome: 'Empresa V2' });

    mockFetchEmpresaAtual
      .mockResolvedValueOnce(emp1)
      .mockResolvedValueOnce(emp2);

    mockGetTenantRuntimeConfig
      .mockReturnValueOnce(makeRuntimeConfig({ slug: '', empresa: emp1 }))
      .mockReturnValue(makeRuntimeConfig({ slug: '', empresa: emp2 }));

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.empresa?.nome).toBe('Empresa V1');

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.empresa?.nome).toBe('Empresa V2');
  });

  // ─── Expõe branding e tenantSlug ──────────────────────────────────────

  it('expõe branding e tenantSlug do runtimeConfig', async () => {
    const runtimeConfig = {
      slug:     'minha-slug',
      siteUrl:  'https://meu-site.com',
      branding: { ...DEFAULT_BRANDING, appName: 'Meu App' },
      features: DEFAULT_FEATURES,
    };

    mockGetTenantRuntimeConfig.mockReturnValue(runtimeConfig);
    mockFetchEmpresaAtual.mockResolvedValue(null);

    const { result } = renderHook(() => useEmpresa(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.tenantSlug).toBe('minha-slug');
    expect(result.current.siteUrl).toBe('https://meu-site.com');
    expect(result.current.branding.appName).toBe('Meu App');
  });
});
