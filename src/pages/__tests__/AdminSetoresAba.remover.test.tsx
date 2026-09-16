/**
 * AdminSetoresAba.remover.test.tsx — o botão de remover setor (16/09/2026).
 *
 * «Não é permitido excluir setores com equipes criadas, usuários naquele
 * setor, só os zerados.» A tela prende três coisas:
 *
 *   1. com gente ou equipe, a lixeira nasce desabilitada;
 *   2. zerado, ela abre a confirmação — e só oferece «Remover» se o banco
 *      também disser que não há histórico;
 *   3. sem `setores_criar_editar`, a lixeira não existe.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'empresa-1' } }),
}));

const temPermissao = vi.fn((_chave: string) => true);
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao, permissoes: {}, loading: false }),
}));

vi.mock('@/hooks/useClonesCross', () => ({ useClonesCross: () => [] }));

const TABELAS: Record<string, unknown[]> = {
  setores: [
    { id: 's-cheio', nome: 'Play 1', ativo: true, alternativo: false, empresa_id: 'empresa-1' },
    { id: 's-equipe', nome: 'Só equipe', ativo: true, alternativo: false, empresa_id: 'empresa-1' },
    { id: 's-zerado', nome: 'teste', ativo: true, alternativo: false, empresa_id: 'empresa-1' },
  ],
  perfis: [{ id: 'p1', setor_id: 's-cheio', arquivado: false }],
  equipes: [{ id: 'e1', setor_id: 's-equipe' }],
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabela: string) => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.order = () => b;
      b.then = (ok: (r: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(ok({ data: TABELAS[tabela] ?? [], error: null }));
      return b;
    },
  },
}));

const buscarImpedimentos = vi.fn();
const excluirSetor = vi.fn();
vi.mock('@/services/setores/excluirSetor.service', async () => {
  const real = await vi.importActual<typeof import('@/services/setores/excluirSetor.service')>(
    '@/services/setores/excluirSetor.service',
  );
  return {
    ...real,
    buscarImpedimentosDeExclusao: (...a: unknown[]) => buscarImpedimentos(...a),
    excluirSetor: (...a: unknown[]) => excluirSetor(...a),
  };
});

vi.mock('framer-motion', () => {
  const componente = (props: Record<string, unknown>) => {
    const { children, initial: _i, animate: _a, exit: _e, transition: _t, layout: _l, ...rest } = props ?? {};
    return React.createElement('div', rest as React.HTMLAttributes<HTMLDivElement>, children as React.ReactNode);
  };
  return {
    motion: new Proxy({}, { get: () => componente }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

import AdminSetoresAba from '../AdminSetoresAba';

function montar() {
  return render(React.createElement(MemoryRouter, null, React.createElement(AdminSetoresAba)));
}

const lixeira = (nome: string) => screen.findByRole('button', { name: `Remover setor ${nome}` });

beforeEach(() => {
  temPermissao.mockImplementation(() => true);
  buscarImpedimentos.mockReset();
  excluirSetor.mockReset();
});

describe('AdminSetoresAba — remover setor', () => {
  it('com usuário ou com equipe, a lixeira nasce desabilitada', async () => {
    montar();
    await waitFor(async () => expect(await lixeira('Play 1')).toBeDisabled());
    await waitFor(async () => expect(await lixeira('Só equipe')).toBeDisabled());
    expect(await lixeira('teste')).toBeEnabled();
  });

  it('zerado e sem histórico: confirma e remove', async () => {
    buscarImpedimentos.mockResolvedValue({ status: 'ok', impedimentos: [] });
    excluirSetor.mockResolvedValue({ status: 'ok' });
    montar();
    fireEvent.click(await lixeira('teste'));
    const confirmar = await screen.findByRole('button', { name: /^Remover setor$/ });
    fireEvent.click(confirmar);
    await waitFor(() => expect(excluirSetor).toHaveBeenCalledWith('s-zerado'));
  });

  it('zerado na tela, mas com histórico no banco: explica e não oferece remover', async () => {
    buscarImpedimentos.mockResolvedValue({
      status: 'ok', impedimentos: [{ motivo: 'acordos', quantidade: 1000 }],
    });
    montar();
    fireEvent.click(await lixeira('teste'));
    expect(await screen.findByText('1.000+ acordos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remover setor$/ })).not.toBeInTheDocument();
    expect(excluirSetor).not.toHaveBeenCalled();
  });

  it('sem setores_criar_editar, não há lixeira', async () => {
    temPermissao.mockImplementation((chave: string) => chave !== 'setores_criar_editar');
    montar();
    expect(await screen.findByText('teste')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover setor/ })).not.toBeInTheDocument();
  });
});
