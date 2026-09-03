/**
 * MetasConfig.feriados.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * O feriado adicionado na aba Usuários → Metas tem de chegar ao banco.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), message: vi.fn(),
  },
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
    temPermissao: () => true, temPermissaoExplicita: () => true, isAdmin: true,
    resolverParaUsuario: () => true, valorDoCargo: () => true, estadoExcecao: () => 'herda',
    refresh: vi.fn(),
  }),
}));

vi.mock('@/lib/tenant-config', () => ({
  useTenant: () => ({ isPaguePlay: false, slug: 'bookplay' }),
  getTenantCapabilities: (slug: string) => ({ slug }),
}));

// ── supabase encadeável ─────────────────────────────────────────────────────
const TABELAS: Record<string, unknown[]> = {
  setores: [{ id: 's1', nome: 'Setor A' }],
  equipes: [],
  perfis: [],
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
  supabase: { from: (t: string) => query(t) },
}));

const upsertMetasConfig = vi.fn(async () => ({ error: null }));
vi.mock('@/services/metas/metasConfig.service', () => ({
  getMetasConfig: async () => ({
    data: { feriados: [], quartis: [], contar_dia_atual: false },
    dbAtiva: true,
  }),
  upsertMetasConfig: (...args: unknown[]) => upsertMetasConfig(...(args as [])),
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

describe('MetasConfig — feriados', () => {
  beforeEach(() => { upsertMetasConfig.mockClear(); });

  it('o feriado adicionado viaja no salvamento', async () => {
    render(<MetasConfig />);

    await waitFor(() => expect(screen.getByText(/Nenhum feriado neste mês/)).toBeTruthy());

    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-15`;

    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: iso } });

    fireEvent.click(input.parentElement!.querySelector("button")!);

    // O chip do feriado apareceu?
    await waitFor(() => expect(screen.queryByText(/Nenhum feriado neste mês/)).toBeNull());

    // Não há mais botão: o calendário do mês grava sozinho 800 ms depois da
    // última mexida. O `timeout` cobre a espera do debounce.
    await waitFor(
      () => expect(upsertMetasConfig).toHaveBeenCalled(),
      { timeout: 3000 },
    );
    expect(upsertMetasConfig.mock.calls[0][0]).toMatchObject({ feriados: [iso] });
  });
});

describe('MetasConfig — feriados com a tela cheia', () => {
  beforeEach(() => {
    upsertMetasConfig.mockClear();
    TABELAS.equipes = [{ id: 'eq1', nome: 'Equipe 1', setor_id: 's1', treinamento: false, treinamento_inicio: null }];
    TABELAS.perfis  = [{ id: 'op1', nome: 'Op 1', equipe_id: 'eq1', setor_id: 's1', situacao: null, ferias_ate: null }];
    TABELAS.metas   = [{ id: 'm1', tipo: 'setor', referencia_id: 's1', empresa_id: 'e1', meta_valor: 1000, meta_acordos: 0, mes: 9, ano: 2026 }];
  });

  it('feriado viaja mesmo com metas já preenchidas', async () => {
    render(<MetasConfig />);
    await waitFor(() => expect(screen.getByText(/Nenhum feriado neste mês/)).toBeTruthy());

    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-15`;
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: iso } });
    fireEvent.click(input.parentElement!.querySelector('button')!);
    await waitFor(() => expect(screen.queryByText(/Nenhum feriado neste mês/)).toBeNull());

    await waitFor(
      () => expect(upsertMetasConfig).toHaveBeenCalled(),
      { timeout: 3000 },
    );
    expect(upsertMetasConfig.mock.calls[0][0]).toMatchObject({ feriados: [iso] });
  });
});

describe('MetasConfig — salvar meta não reescreve o calendário do mês', () => {
  beforeEach(() => {
    upsertMetasConfig.mockClear();
    upsertMetas.mockClear();
    TABELAS.equipes = [];
    TABELAS.perfis  = [];
    TABELAS.metas   = [];
  });

  it('quem só salvou meta não manda config nenhuma', async () => {
    render(<MetasConfig />);
    await waitFor(() => expect(screen.getByText(/Nenhum feriado neste mês/)).toBeTruthy());

    // Uma meta de setor preenchida, e nada tocado no card de dias úteis.
    const metaInput = screen.getAllByPlaceholderText(/0,00/)[0] as HTMLInputElement;
    fireEvent.change(metaInput, { target: { value: '1.000,00' } });
    // Sair do campo é o que grava agora.
    fireEvent.blur(metaInput);

    // A meta foi salva de verdade — e mesmo assim a config do mês não viajou.
    // É o incidente de agosto: doze pessoas salvando meta reescreviam o
    // feriado que uma delas tinha acabado de cadastrar.
    await waitFor(() => expect(upsertMetas).toHaveBeenCalled());
    expect(upsertMetas.mock.calls[0][0]).toHaveLength(1);
    expect(upsertMetasConfig).not.toHaveBeenCalled();
  });

  it('sair de um campo que não mudou não escreve nada', async () => {
    render(<MetasConfig />);
    await waitFor(() => expect(screen.getByText(/Nenhum feriado neste mês/)).toBeTruthy());

    // Passar o cursor pelo campo e sair, sem digitar. Navegar de Tab pela tela
    // não pode virar uma escrita por parada.
    const metaInput = screen.getAllByPlaceholderText(/0,00/)[0] as HTMLInputElement;
    fireEvent.focus(metaInput);
    fireEvent.blur(metaInput);

    await new Promise(r => setTimeout(r, 50));
    expect(upsertMetas).not.toHaveBeenCalled();
  });
});
