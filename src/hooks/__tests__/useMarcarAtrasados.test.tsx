/**
 * useMarcarAtrasados — a varredura espera as permissões.
 *
 * O hook roda UMA vez por sessão e grava `nao_pago` no banco. Rodava assim que
 * perfil e empresa existiam, com as permissões ainda carregando — e, nesse
 * intervalo, `temPermissao` responde `false` para todo cargo que não é de
 * acesso total. Quem enxerga a empresa inteira varria só a própria fila, e a
 * trava de "já rodou" impedia a segunda chance.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  permissoesCarregando: true,
  /** Chaves que `temPermissao` libera depois de carregar. */
  liberadas: new Set<string>(),
  consultas: 0,
  filtros: [] as [string, unknown][],
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: { id: 'lider-1', perfil: 'lider' } }),
}));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'empresa-1' } }),
}));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({
    loading: mock.permissoesCarregando,
    // Enquanto carrega, o hook real responde `false` para tudo — é o defeito.
    temPermissao: (chave: string) => !mock.permissoesCarregando && mock.liberadas.has(chave),
  }),
}));
vi.mock('@/lib/permissoes-escopo', () => ({
  veAlemDeSi: (_aba: string, temPermissao: (c: string) => boolean) =>
    temPermissao('dashboard_escopo_setor'),
}));
vi.mock('@/lib/index', () => ({
  getTodayISO: () => '2026-09-13',
  formatCurrency: (v: number) => String(v),
  formatDate: (v: string) => v,
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('@/services/notificacoes.service', () => ({ criarNotificacao: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      mock.consultas++;
      const cadeia = {
        select: () => cadeia,
        eq: (coluna: string, valor: unknown) => { mock.filtros.push([coluna, valor]); return cadeia; },
        lt: () => cadeia,
        then: (ok: (r: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(ok),
      };
      return cadeia;
    },
  },
}));

import { useMarcarAtrasados } from '../useMarcarAtrasados';

beforeEach(() => {
  mock.permissoesCarregando = true;
  mock.liberadas = new Set(['dashboard_escopo_setor']);
  mock.consultas = 0;
  mock.filtros = [];
});

describe('useMarcarAtrasados', () => {
  it('não varre nada enquanto as permissões carregam', async () => {
    renderHook(() => useMarcarAtrasados());
    await new Promise(r => setTimeout(r, 20));
    expect(mock.consultas).toBe(0);
  });

  it('quando as permissões chegam, quem vê além de si varre a empresa, sem recorte por operador', async () => {
    const { rerender } = renderHook(() => useMarcarAtrasados());
    mock.permissoesCarregando = false;
    rerender();

    await waitFor(() => expect(mock.consultas).toBe(1));
    expect(mock.filtros).toContainEqual(['empresa_id', 'empresa-1']);
    expect(mock.filtros.find(([coluna]) => coluna === 'operador_id')).toBeUndefined();
  });

  it('quem só vê a si varre só a própria fila', async () => {
    mock.liberadas = new Set();
    const { rerender } = renderHook(() => useMarcarAtrasados());
    mock.permissoesCarregando = false;
    rerender();

    await waitFor(() => expect(mock.consultas).toBe(1));
    expect(mock.filtros).toContainEqual(['operador_id', 'lider-1']);
  });

  it('roda uma vez só, mesmo que as permissões se releiam', async () => {
    mock.permissoesCarregando = false;
    const { rerender } = renderHook(() => useMarcarAtrasados());
    await waitFor(() => expect(mock.consultas).toBe(1));

    mock.liberadas = new Set(['dashboard_escopo_setor', 'outra_chave']);
    rerender();
    await new Promise(r => setTimeout(r, 20));
    expect(mock.consultas).toBe(1);
  });
});
