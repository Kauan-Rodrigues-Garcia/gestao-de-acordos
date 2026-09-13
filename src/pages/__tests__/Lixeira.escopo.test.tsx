/**
 * Lixeira — a lista espera as permissões antes de buscar.
 *
 * `escopo` sai de `temPermissao`, que responde `false` enquanto as chaves
 * carregam: `soOsProprios` nascia `true`. Com a busca presa só a
 * `empresa?.id`, a lista saía recortada pela pessoa e não voltava a buscar
 * quando o escopo real chegava — a gerência abria a Lixeira e via só os
 * próprios itens até clicar em recarregar.
 */
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  permissoesCarregando: true,
  liberadas: new Set<string>(),
  fetchLixeira: vi.fn(async (_empresaId: string, _filtro?: { operadorId: string }) => [] as unknown[]),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: { id: 'gerente-1', perfil: 'gerencia' } }),
}));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'empresa-1' } }),
}));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({
    loading: mock.permissoesCarregando,
    // Enquanto carrega, o hook real nega tudo a quem não tem acesso total.
    temPermissao: (chave: string) => !mock.permissoesCarregando && mock.liberadas.has(chave),
  }),
}));
vi.mock('@/lib/permissoes-escopo', () => ({
  escopoEfetivo: (_aba: string, temPermissao: (c: string) => boolean) =>
    temPermissao('lixeira_escopo_setor') ? 'setor'
      : temPermissao('lixeira_escopo_individual') ? 'individual'
      : null,
}));
vi.mock('@/services/lixeira.service', () => ({
  fetchLixeira: mock.fetchLixeira,
  purgarExpirados: vi.fn(async () => undefined),
  esvaziarLixeira: vi.fn(),
  restaurarItemLixeira: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('framer-motion', () => {
  const handler = {
    get: () => (props: Record<string, unknown>) => {
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

import Lixeira from '../Lixeira';

beforeEach(() => {
  mock.permissoesCarregando = true;
  mock.liberadas = new Set(['lixeira_escopo_setor']);
  mock.fetchLixeira.mockClear();
});

describe('Lixeira — escopo da busca', () => {
  it('não busca nada enquanto as permissões carregam', async () => {
    render(<Lixeira />);
    await new Promise(r => setTimeout(r, 30));
    expect(mock.fetchLixeira).not.toHaveBeenCalled();
  });

  it('quando as permissões chegam, a gerência busca SEM recorte por pessoa', async () => {
    const { rerender } = render(<Lixeira />);
    mock.permissoesCarregando = false;
    rerender(<Lixeira />);

    await waitFor(() => expect(mock.fetchLixeira).toHaveBeenCalled());
    // Toda chamada, não só a última: uma busca recortada seguida de outra
    // completa ainda pintaria a lista errada por um instante.
    for (const chamada of mock.fetchLixeira.mock.calls) {
      expect(chamada).toEqual(['empresa-1', undefined]);
    }
  });

  it('escopo individual recorta pela própria pessoa', async () => {
    mock.liberadas = new Set(['lixeira_escopo_individual']);
    const { rerender } = render(<Lixeira />);
    mock.permissoesCarregando = false;
    rerender(<Lixeira />);

    await waitFor(() => expect(mock.fetchLixeira).toHaveBeenCalled());
    expect(mock.fetchLixeira).toHaveBeenLastCalledWith('empresa-1', { operadorId: 'gerente-1' });
  });
});
