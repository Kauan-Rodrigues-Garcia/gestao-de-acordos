/**
 * Acordos — uma troca de filtro, UMA entrada no histórico.
 *
 * A tela escreve os filtros na URL 400 ms depois de a pessoa mexer. O efeito
 * tinha `setSearchParams` nas dependências, e o react-router recria essa
 * função toda vez que a URL muda: a própria escrita reagendava o efeito, que
 * gravava a MESMA URL de novo. Duas entradas por troca, e o «voltar» do
 * navegador precisava de dois cliques para desfazer um filtro.
 *
 * Aqui o router é o de verdade (`MemoryRouter`), sem o dublê de
 * `useSearchParams` que o smoke usa — é o router que produz o defeito.
 */
import React, { useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';

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
    // As chaves que o acesso total não concede sozinho (`ignorar_fechamento_mes`)
    // passam por aqui; sem a função, `useFechamentoMes` estoura.
    temPermissaoExplicita: vi.fn(() => false),
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

/** Conta navegações PUSH distintas — cada uma é uma entrada no histórico. */
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

/**
 * Folga para o debounce de 400 ms e para uma eventual segunda escrita.
 *
 * Em FATIAS, e não num `act` só: dentro de um mesmo `act` o React enfileira as
 * renderizações e só as processa quando ele termina. Com uma espera única, a
 * navegação dos 400 ms não re-renderizava a tela a tempo, o efeito não se
 * reagendava, e a escrita duplicada ficava fora da janela — o teste passava
 * contra o código com defeito.
 */
async function esperarEscritas() {
  for (let i = 0; i < 8; i++) {
    await act(() => new Promise(r => setTimeout(r, 200)));
  }
}

describe('Acordos — filtros na URL', () => {
  it('digitar na busca grava a URL uma vez só', async () => {
    historico.pushes = 0;
    render(
      <MemoryRouter initialEntries={['/acordos']}>
        <Acordos />
        <Sonda />
      </MemoryRouter>,
    );
    // A montagem também escreve (`page=1`); o que se mede é a troca.
    await esperarEscritas();
    const antes = historico.pushes;

    fireEvent.change(screen.getByPlaceholderText('Buscar NR, nome, WhatsApp...'), {
      target: { value: 'maria' },
    });
    await esperarEscritas();

    expect(historico.ultimaUrl).toContain('busca=maria');
    expect(historico.pushes - antes).toBe(1);
  }, 20_000);
});
