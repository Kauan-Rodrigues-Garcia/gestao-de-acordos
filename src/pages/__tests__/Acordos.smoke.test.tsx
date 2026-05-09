/**
 * Acordos.smoke.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Smoke tests for the Acordos page (planilha de acordos do operador).
 * Goal: verify the page mounts without throwing and shows key UI landmarks.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Subject under test ──────────────────────────────────────────────────────
import Acordos from '../Acordos';

// ── Hook / lib mocks ────────────────────────────────────────────────────────

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    perfil: {
      id: 'u1', nome: 'Operador Teste', perfil: 'operador',
      empresa_id: 'e1', equipe_id: null, setor_id: null, cargo: null,
    },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({
    empresa: { id: 'e1', nome: 'Empresa Teste', tenant_slug: 'bookplay' },
    loading: false,
    tenantSlug: 'bookplay',
  }),
}));

vi.mock('@/hooks/useAcordos', () => ({
  useAcordos: () => ({
    acordos: [],
    totalCount: 0,
    loading: false,
    error: null,
    realtimeStatus: 'connected' as const,
    refetch: vi.fn().mockResolvedValue(undefined),
    patchAcordo: vi.fn(),
    removeAcordo: vi.fn(),
    addAcordo: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({
    permissoes: {},
    todasPermissoes: [],
    loading: false,
    temPermissao: vi.fn(() => false),
    isAdmin: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => ({
    isPaguePlay: false,
    useInstituicaoAsCodigo: false,
    limitedTipos: false,
    hasEstadoUF: false,
    showRevenueDistribution: false,
    maxParcelas: 12,
    tipoOptions: ['pix', 'boleto', 'cartao'],
    statusLabels: { verificar_pendente: 'Verificar', pago: 'Pago', nao_pago: 'Não Pago' },
    tipoLabels: { pix: 'PIX', boleto: 'Boleto', cartao: 'Cartão' },
    slug: 'bookplay',
  }),
  getTenantCapabilities: (slug: string) => ({ slug }),
}));

vi.mock('@/hooks/useDiretoExtraConfig', () => ({
  useDiretoExtraConfig: () => ({
    configs: [],
    loading: false,
    isAtivoParaUsuario: vi.fn(() => false),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ data: [], error: null }) }) }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
    }),
    channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
    removeChannel: vi.fn(),
  },
  Acordo: undefined,
  AcordoTag: undefined,
}));

vi.mock('@/providers/RealtimeAcordosProvider', () => ({
  RealtimeAcordosProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useRealtimeAcordos: () => ({
    status: 'connected',
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

// Services
vi.mock('@/services/notificacoes.service',   () => ({ criarNotificacao: vi.fn() }));
vi.mock('@/services/nr_registros.service',   () => ({ liberarNrPorAcordoId: vi.fn() }));
vi.mock('@/services/lixeira.service',        () => ({ enviarParaLixeira: vi.fn() }));
vi.mock('@/services/tratarExclusaoVinculo',  () => ({ tratarExclusaoVinculo: vi.fn() }));

// Heavy child components
vi.mock('@/components/ModalFilaWhatsApp', () => ({
  ModalFilaWhatsApp: () => null,
}));
vi.mock('@/components/AcordoEditInline', () => ({
  AcordoEditInline: () => null,
}));
vi.mock('@/components/AcordoDetalheInline', () => ({
  AcordoDetalheInline: () => null,
}));
vi.mock('@/components/AcordoNovoInline', () => ({
  AcordoNovoInline: () => null,
}));
vi.mock('@/components/VinculoTag', () => ({
  VinculoTag: () => null,
}));
vi.mock('@/components/OperadorCell', () => ({
  OperadorCell: () => null,
}));

// framer-motion stub
vi.mock('framer-motion', () => {
  const handler = {
    get: (_: unknown, tag: string) =>
      (props: Record<string, unknown>) => {
        const { children, layout, initial, animate, exit, transition, ...rest } = props ?? {};
        return React.createElement('div', rest as React.HTMLAttributes<HTMLDivElement>, children as React.ReactNode);
      },
  };
  return {
    motion: new Proxy({}, handler),
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// sonner
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Navigate: () => null,
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Acordos (smoke)', () => {
  it('renders without crashing', async () => {
    render(<Acordos />);
    // Page always renders a container — just check it doesn't throw
    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });
  });

  it('shows empty state when there are no acordos', async () => {
    render(<Acordos />);
    await waitFor(() => {
      expect(
        screen.getByText(/nenhum acordo encontrado/i)
      ).toBeInTheDocument();
    });
  });

  it('shows "+ Novo Acordo" button', async () => {
    render(<Acordos />);
    await waitFor(() => {
      // Multiple "Novo Acordo" elements may exist (header CTA + empty-state CTA)
      const buttons = screen.getAllByText(/novo acordo/i);
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows month navigation with current month', async () => {
    render(<Acordos />);
    await waitFor(() => {
      // Month navigator renders a span with the current month + year (pt-BR)
      const monthSpan = screen.getByText(/de 20\d{2}/i);
      expect(monthSpan).toBeInTheDocument();
    });
  });
});
