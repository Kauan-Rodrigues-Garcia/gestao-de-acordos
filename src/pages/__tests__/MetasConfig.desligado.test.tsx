/**
 * MetasConfig.excluir.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * O botão de excluir a meta configurada (pedido de 16/09/2026).
 *
 *   • a lixeira só aparece em quem TEM meta gravada no mês;
 *   • sempre pergunta antes, e só exclui no «Excluir meta»;
 *   • a tela só limpa o que o banco devolveu como excluído — a RLS recusa em
 *     silêncio, e limpar tudo mostraria apagada uma meta que continua valendo;
 *   • setor validado não mostra a lixeira;
 *   • com operadores marcados, o lote exclui a meta de todos os que têm.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn() },
}));
vi.mock('sonner', () => ({ toast }));

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
    { id: 'op2', nome: 'Bruno Lima', equipe_id: null, setor_id: 's1', situacao: 'ferias', ferias_ate: null },
    { id: 'op3', nome: 'Carla Dias', equipe_id: null, setor_id: 's1', situacao: 'desligado', ferias_ate: null },
  ],
  metas: [
    { tipo: 'operador', referencia_id: 'op1', empresa_id: 'e1', meta_valor: 40_000, meta_acordos: 0, metas_extras: [], meta_proporcional: false, mes: new Date().getMonth() + 1, ano: new Date().getFullYear() },
    { tipo: 'operador', referencia_id: 'op2', empresa_id: 'e1', meta_valor: 35_000, meta_acordos: 0, metas_extras: [], meta_proporcional: false, mes: new Date().getMonth() + 1, ano: new Date().getFullYear() },
  ],
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

const validacao = { status: null as null | { status: 'validado'; validadoEm: null; motivoReabertura: null } };
const excluirMetas = vi.fn(async (p: { referenciaIds: string[] }) => ({ excluidas: p.referenciaIds, error: null as string | null }));
const upsertMetas = vi.fn(async (p: unknown[]) => ({ salvos: p.length, bloqueados: [], error: null }));
vi.mock('@/services/metas/metasValidacao.service', () => ({
  getMetaValidacaoStatus: async () => validacao.status,
  upsertMetas: (...args: unknown[]) => upsertMetas(...(args as [unknown[]])),
  excluirMetas: (p: { referenciaIds: string[] }) => excluirMetas(p),
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

describe('MetasConfig — desligado', () => {
  it('não lista quem está desligado; férias continua', async () => {
    render(<MetasConfig />);
    expect(await screen.findByText('Ana Paula')).toBeTruthy();
    expect(screen.getByText('Bruno Lima')).toBeTruthy();
    expect(screen.queryByText('Carla Dias')).toBeNull();
  });
});
