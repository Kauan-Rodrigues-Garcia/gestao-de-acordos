/**
 * Dashboard.smoke.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Smoke tests for the Dashboard page.
 * Goal: verify the page mounts without throwing and shows a known element
 * under each major loading/empty state.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Subject under test ──────────────────────────────────────────────────────
import Dashboard from '../Dashboard';

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

const mockAcordosResult = {
  acordos: [],
  totalCount: 0,
  loading: false,
  error: null,
  realtimeStatus: 'connected' as const,
  refetch: vi.fn().mockResolvedValue(undefined),
  patchAcordo: vi.fn(),
  removeAcordo: vi.fn(),
  addAcordo: vi.fn(),
};

vi.mock('@/hooks/useAcordos', () => ({
  useAcordos: () => mockAcordosResult,
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

vi.mock('@/hooks/useEmpresaTags', () => ({
  useEmpresaTags: () => ({ tags: [], loading: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({
    meta: 0, loading: false, refetch: vi.fn(),
    setores: [], setorFiltro: null, setSetorFiltro: vi.fn(),
    equipeFiltro: null, setEquipeFiltro: vi.fn(),
    equipesDoSetor: [], operadorFiltro: null, setOperadorFiltro: vi.fn(),
    totalAcordosMes: 0, totalAcordosHoje: 0, totalPagosMes: 0,
    totalNaoPagos: 0, totalPendentes: 0, percMeta: 0, percMetaAcordos: 0,
    porStatus: [], porDia: [], porEquipe: [], porOperador: [], acordosMes: [],
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
vi.mock('@/components/AnalyticsPanel', () => ({
  AnalyticsPanel: () => React.createElement('div', { 'data-testid': 'analytics-panel' }),
}));
vi.mock('@/components/ModalReagendar', () => ({
  ModalReagendar: () => null,
}));
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
    Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [k: string]: unknown }) =>
      React.createElement('a', { href: to as string, ...rest }, children),
    Navigate: () => null,
  };
});

// ── Tests ───────────────────────────────────────────────────────────────────

/**
 * O Dashboard monta `MetaProgressoHeader`, que consome `useAnaliticoDashboard` —
 * e esse hook usa React Query para compartilhar uma única busca do mês entre os
 * seus dois consumidores. O `QueryClientProvider` existe no App real (`App.tsx`);
 * aqui ele precisa ser fornecido, senão o hook lança "No QueryClient set".
 *
 * `retry: false` para o teste não ficar esperando retentativa quando uma query
 * falha, e um client novo por render para não vazar cache entre casos.
 */
function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard (smoke)', () => {
  it('renders without crashing and shows greeting', async () => {
    renderDashboard();
    // Page shows a greeting ("Bom dia / Boa tarde / Boa noite")
    await waitFor(() => {
      expect(
        screen.getByText(/bom dia|boa tarde|boa noite/i)
      ).toBeInTheDocument();
    });
  });

  it('shows analytics panel stub', async () => {
    renderDashboard();
    // AnalyticsPanel is mocked with data-testid="analytics-panel"
    await waitFor(() => {
      expect(screen.getByTestId('analytics-panel')).toBeInTheDocument();
    });
  });

  it('shows link to acordos for Bookplay tenant', async () => {
    renderDashboard();
    await waitFor(() => {
      // For non-PaguePLAY tenants Dashboard renders a "Ver todos os acordos" link
      expect(screen.getByText(/ver todos os acordos/i)).toBeInTheDocument();
    });
  });
});
