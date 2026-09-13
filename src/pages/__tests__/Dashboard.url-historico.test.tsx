/**
 * Dashboard (PaguePlay) — uma troca de filtro, UMA entrada no histórico.
 *
 * Aqui o defeito NUNCA existiu, e o teste é uma guarda. O efeito que escreve
 * os filtros na URL deixava `setSearchParams` fora das dependências — o lint
 * acusava. O conserto óbvio, pôr a função na lista, é exatamente o que
 * duplicava o histórico em `Acordos` (ver `Acordos.url-historico.test.tsx`):
 * o react-router recria `setSearchParams` a cada mudança de URL, e a própria
 * escrita reagendaria o efeito. Conferido: com a função nas dependências, este
 * teste falha com 2 entradas.
 *
 * A sincronia só existe na PaguePlay — por isso o tenant difere do smoke.
 */
import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';

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
    isPaguePlay: true,
    useInstituicaoAsCodigo: false,
    limitedTipos: false,
    hasEstadoUF: false,
    showRevenueDistribution: false,
    maxParcelas: 12,
    tipoOptions: ['pix', 'boleto', 'cartao'],
    statusLabels: { verificar_pendente: 'Verificar', pago: 'Pago', nao_pago: 'Não Pago' },
    tipoLabels: { pix: 'PIX', boleto: 'Boleto', cartao: 'Cartão' },
    slug: 'pagueplay',
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

// O Dashboard não usa mais `useAnalytics` — as listas de setor/equipe saíram
// para `useSetoresEquipes`, que não lê acordo nenhum. O painel de métricas, que
// continua usando `useAnalytics`, já é mockado inteiro logo abaixo.
const LISTAS_VAZIAS: { id: string; nome: string }[] = [];
vi.mock('@/hooks/useSetoresEquipes', () => ({
  useSetoresEquipes: () => ({
    setores: LISTAS_VAZIAS, setorFiltro: null, setSetorFiltro: vi.fn(),
    equipesDoSetor: LISTAS_VAZIAS, loading: false,
    // Sem niveis o <FiltroEscopo /> nao tem o que oferecer e nao desenha nada,
    // que e o certo para um smoke de renderizacao.
    niveis: [],
  }),
}));

vi.mock('@/lib/supabase', () => {
  /*
   * Construtor de consulta que aceita QUALQUER encadeamento e resolve vazio.
   *
   * O dublê anterior desenhava a forma de cada consulta à mão — `eq().eq()`,
   * `eq().limit()` — e cada consulta nova que não coubesse no desenho
   * estourava. `useLideroEquipe` pergunta pelas metas com três `eq` e um
   * `gte`: o construtor lançava, o hook caía no `catch` e devolvia o valor de
   * segurança. Os três testes passavam sem nunca executar o caminho real, e
   * só um `console.warn` no meio da suíte denunciava.
   *
   * Todo método devolve a própria cadeia; `await` resolve `{ data: [], error:
   * null }`. Símbolos ficam de fora para o Proxy não se passar por matcher
   * assimétrico nem por iterável quando o vitest o inspeciona.
   */
  function consultaVazia(): object {
    const resultado = { data: [], error: null };
    const cadeia: object = new Proxy({}, {
      get(_alvo, prop) {
        if (typeof prop === 'symbol') return undefined;
        if (prop === 'then') {
          return (ok: (r: typeof resultado) => unknown, falha?: (e: unknown) => unknown) =>
            Promise.resolve(resultado).then(ok, falha);
        }
        return () => cadeia;
      },
    });
    return cadeia;
  }

  return {
    supabase: {
      from: () => consultaVazia(),
      channel: () => ({ on: () => ({ subscribe: vi.fn() }) }),
      removeChannel: vi.fn(),
    },
    Acordo: undefined,
    AcordoTag: undefined,
  };
});

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
    get: (_: unknown, _tag: string) =>
      (props: Record<string, unknown>) => {
        const { children, layout: _l, initial: _i, animate: _a, exit: _e, transition: _t, ...rest } = props ?? {};
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


beforeEach(() => {
  vi.clearAllMocks();
});

const historico = { pushes: 0, ultimaUrl: '' };
function Sonda() {
  const local = useLocation();
  const tipo = useNavigationType();
  const vistas = useRef(new Set<string>());
  if (tipo === 'PUSH' && !vistas.current.has(local.key)) {
    vistas.current.add(local.key);
    historico.pushes++;
  }
  historico.ultimaUrl = local.search;
  return null;
}

/** Em fatias — ver o comentário em `Acordos.url-historico.test.tsx`. */
async function esperarEscritas() {
  for (let i = 0; i < 8; i++) {
    await act(() => new Promise(r => setTimeout(r, 200)));
  }
}

describe('Dashboard PaguePlay — filtros na URL', () => {
  it('digitar na busca grava a URL uma vez só', async () => {
    historico.pushes = 0;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Dashboard />
          <Sonda />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await esperarEscritas();
    const antes = historico.pushes;

    fireEvent.change(await screen.findByPlaceholderText('Buscar Código ou nome...'), {
      target: { value: 'maria' },
    });
    await esperarEscritas();

    expect(historico.ultimaUrl).toContain('busca=maria');
    expect(historico.pushes - antes).toBe(1);
  }, 20_000);
});
