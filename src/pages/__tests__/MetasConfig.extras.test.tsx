/**
 * MetasConfig.extras.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * As metas extras (2ª, 3ª…) valem nas duas empresas.
 *
 * Eram só da BookPlay. A comissão por meta usa esses degraus como faixas, e ela
 * existe na PaguePlay também — lá cada degrau precisa do mesmo par H.O./bruto
 * que a meta principal já tem, porque a meta da PaguePlay é pensada em H.O.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const { tenantRef } = vi.hoisted(() => ({
  tenantRef: { current: { isPaguePlay: true, slug: 'pagueplay' } },
}));

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
  useEmpresa: () => ({
    empresa: { id: 'e1', nome: 'Empresa', tenant_slug: tenantRef.current.slug },
    loading: false,
    tenantSlug: tenantRef.current.slug,
  }),
}));

vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({
    permissoes: {}, excecoes: {}, todasPermissoes: [], todasExcecoes: [], loading: false,
    temPermissao: () => true, temPermissaoExplicita: () => true, isAdmin: true,
    resolverParaUsuario: () => true, valorDoCargo: () => true, estadoExcecao: () => 'herda',
    refresh: vi.fn(),
  }),
}));

vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => tenantRef.current,
  getTenantCapabilities: (slug: string) => ({ slug }),
}));

const hoje = new Date();
const TABELAS: Record<string, unknown[]> = {
  setores: [{ id: 's1', nome: 'Setor A' }],
  equipes: [],
  perfis: [{ id: 'op1', nome: 'Ana Paula', equipe_id: null, setor_id: 's1', situacao: 'ativo', ferias_ate: null }],
  metas: [{
    tipo: 'operador', referencia_id: 'op1', empresa_id: 'e1',
    meta_valor: 100_000, meta_acordos: 0, metas_extras: [], meta_proporcional: false,
    mes: hoje.getMonth() + 1, ano: hoje.getFullYear(),
  }],
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

/** O campo logo abaixo do rótulo — os `Label` da tela não usam `htmlFor`. */
function campoDoRotulo(texto: string): HTMLInputElement {
  const rotulo = screen.getByText(texto);
  const campo = rotulo.parentElement?.querySelector('input');
  expect(campo, `campo de «${texto}»`).toBeTruthy();
  return campo as HTMLInputElement;
}

async function abrirSegundaMeta() {
  const botao = await screen.findByRole('button', { name: /Adicionar 2ª meta \(todos os operadores\)/ });
  fireEvent.click(botao);
}

describe('MetasConfig — metas extras', () => {
  beforeEach(() => {
    upsertMetas.mockClear();
    tenantRef.current = { isPaguePlay: true, slug: 'pagueplay' };
  });

  it('na PaguePlay, a 2ª meta aparece com o par bruto e H.O.', async () => {
    render(<MetasConfig />);
    await abrirSegundaMeta();

    expect(screen.getByText('2ª meta (opcional)')).toBeTruthy();
    expect(screen.getByText('2ª meta H.O. (24,96%)')).toBeTruthy();
  });

  it('digitar a H.O. preenche o bruto, pela mesma conversão da meta principal', async () => {
    render(<MetasConfig />);
    await abrirSegundaMeta();

    fireEvent.change(campoDoRotulo('2ª meta H.O. (24,96%)'), { target: { value: '1000000' } });

    await waitFor(() => expect(campoDoRotulo('2ª meta (opcional)').value).toBe('40.064,10'));
  });

  it('a meta extra da PaguePlay viaja no salvamento', async () => {
    render(<MetasConfig />);
    await abrirSegundaMeta();

    const ho = campoDoRotulo('2ª meta H.O. (24,96%)');
    fireEvent.change(ho, { target: { value: '1000000' } });
    fireEvent.blur(ho);

    await waitFor(() => expect(upsertMetas).toHaveBeenCalled());
    expect(upsertMetas.mock.calls[0][0][0]).toMatchObject({
      referencia_id: 'op1',
      metas_extras: [40_064.1],
    });
  });

  it('na BookPlay, a 2ª meta continua sem campo H.O.', async () => {
    tenantRef.current = { isPaguePlay: false, slug: 'bookplay' };
    render(<MetasConfig />);
    await abrirSegundaMeta();

    expect(screen.getByText('2ª meta (opcional)')).toBeTruthy();
    expect(screen.queryByText('2ª meta H.O. (24,96%)')).toBeNull();
  });
});
