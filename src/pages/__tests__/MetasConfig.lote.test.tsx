/**
 * MetasConfig.lote.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A meta em lote (pedido de 16/09/2026): marcar vários operadores, preencher a
 * meta uma vez e confirmar para todos.
 *
 *   • o formulário do lote só aparece com alguém marcado;
 *   • nada grava enquanto se digita — só o «Confirmar»;
 *   • confirmar manda UM upsert com a linha de cada marcado, e só dos marcados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    perfil: { id: 'u1', nome: 'Admin', perfil: 'administrador', empresa_id: 'e1', equipe_id: null, setor_id: null },
    loading: false,
  }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'e1', nome: 'Empresa', tenant_slug: 'bookplay' }, loading: false, tenantSlug: 'bookplay' }),
}));

vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({
    permissoes: {}, excecoes: {}, todasPermissoes: [], todasExcecoes: [], loading: false,
    // Sem a aba Comissão: o teste é da aba Metas.
    temPermissao: (k: string) => k !== 'metas_comissao_ver', temPermissaoExplicita: () => true, isAdmin: true,
    resolverParaUsuario: () => true, valorDoCargo: () => true, estadoExcecao: () => 'herda',
    refresh: vi.fn(),
  }),
}));

vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => ({ isPaguePlay: false, slug: 'bookplay' }),
  getTenantCapabilities: (slug: string) => ({ slug }),
}));

const TABELAS: Record<string, unknown[]> = {
  setores: [{ id: 's1', nome: 'Setor A' }],
  equipes: [],
  perfis: [
    { id: 'op1', nome: 'Ana Paula', equipe_id: null, setor_id: 's1', situacao: 'ativo', ferias_ate: null },
    { id: 'op2', nome: 'Bruno Lima', equipe_id: null, setor_id: 's1', situacao: 'ativo', ferias_ate: null },
    { id: 'op3', nome: 'Carla Dias', equipe_id: null, setor_id: 's1', situacao: 'ativo', ferias_ate: null },
  ],
  metas: [],
};

function query(tabela: string) {
  const resultado = { data: TABELAS[tabela] ?? [], error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'neq', 'is', 'gte', 'lte', 'filter']) {
    chain[m] = () => chain;
  }
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(resultado).then(res);
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (t: string) => query(t),
    rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => Promise.resolve('ok'),
  },
}));

vi.mock('@/services/metas/metasConfig.service', () => ({
  getMetasConfig: async () => ({ data: { feriados: [], quartis: [], contar_dia_atual: false }, dbAtiva: true }),
  upsertMetasConfig: async () => ({ error: null }),
}));

const upsertMetas = vi.fn(async (p: unknown[]) => ({ salvos: p.length, bloqueados: [], error: null }));
vi.mock('@/services/metas/metasValidacao.service', () => ({
  getMetaValidacaoStatus: async () => null,
  upsertMetas: (...args: unknown[]) => upsertMetas(...(args as [unknown[]])),
  validarMetaSetor: async () => ({ ok: true }),
  reabrirMetaSetor: async () => ({ ok: true }),
}));

vi.mock('@/services/equipes/equipesClones.service', () => ({ listarClonesEquipes: async () => [] }));
vi.mock('@/services/situacaoUsuario.service', () => ({ limparAvisoDeFerias: async () => undefined }));
vi.mock('@/services/direto_extra.service', () => ({
  fetchDiretoExtraConfigs: async () => [],
  resolverDiretoExtraAtivo: () => false,
}));

import MetasConfig from '../MetasConfig';

async function marcar(nome: string) {
  fireEvent.click(await screen.findByRole('checkbox', { name: `Selecionar ${nome} para a meta em lote` }));
}

function painelDoLote(): HTMLElement {
  const titulo = screen.getByText(/^Meta para \d+ operador/);
  return titulo.closest('div.rounded-lg') as HTMLElement;
}

describe('MetasConfig — meta em lote', () => {
  beforeEach(() => { upsertMetas.mockClear(); });

  it('sem ninguém marcado, não há formulário de lote', async () => {
    render(<MetasConfig />);
    await screen.findByRole('checkbox', { name: /Selecionar Ana Paula/ });
    expect(screen.queryByText(/^Meta para \d+ operador/)).toBeNull();
  });

  it('confirma a mesma meta, com metas extras, para os marcados — e só para eles', async () => {
    render(<MetasConfig />);
    await marcar('Ana Paula');
    await marcar('Carla Dias');

    const painel = painelDoLote();
    expect(within(painel).getByText('Meta para 2 operadores selecionados')).toBeTruthy();

    const [meta] = within(painel).getAllByPlaceholderText('0,00');
    fireEvent.change(meta, { target: { value: '4000000' } });
    fireEvent.blur(meta);
    fireEvent.click(within(painel).getByRole('button', { name: /Adicionar 2ª meta/ }));
    const extra = within(painelDoLote()).getAllByPlaceholderText('0,00')[1];
    fireEvent.change(extra, { target: { value: '4500000' } });
    fireEvent.blur(extra);

    // Digitar e sair do campo não grava nada.
    expect(upsertMetas).not.toHaveBeenCalled();

    fireEvent.click(within(painelDoLote()).getByRole('button', { name: 'Confirmar para 2 operadores' }));

    await waitFor(() => expect(upsertMetas).toHaveBeenCalledTimes(1));
    const payloads = upsertMetas.mock.calls[0][0] as { referencia_id: string; meta_valor: number; metas_extras: number[] }[];
    expect(payloads.map(p => p.referencia_id).sort()).toEqual(['op1', 'op3']);
    for (const p of payloads) {
      expect(p).toMatchObject({ tipo: 'operador', meta_valor: 40_000, metas_extras: [45_000] });
    }

    // A seleção some e as linhas passam a mostrar a meta aplicada.
    await waitFor(() => expect(screen.queryByText(/^Meta para \d+ operador/)).toBeNull());
  });

  it('«Selecionar todos» marca todos os operadores da lista', async () => {
    render(<MetasConfig />);
    await screen.findByRole('checkbox', { name: /Selecionar Ana Paula/ });
    fireEvent.click(screen.getByRole('checkbox', { name: /Selecionar todos/ }));
    expect(screen.getByText('Meta para 3 operadores selecionados')).toBeTruthy();
  });

  it('sem a meta preenchida, o botão de confirmar fica desligado', async () => {
    render(<MetasConfig />);
    await marcar('Bruno Lima');
    expect(within(painelDoLote()).getByRole('button', { name: 'Confirmar para 1 operador' })).toBeDisabled();
  });
});
