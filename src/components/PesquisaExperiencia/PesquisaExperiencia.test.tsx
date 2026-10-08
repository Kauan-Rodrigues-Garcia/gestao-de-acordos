/**
 * Quando a pergunta aparece (08/10/2026): pesquisa ligada, pessoa que ainda
 * não respondeu, 3 min de uso e o caminho livre (termo/tutorial/carta). Quem
 * já respondeu — em qualquer computador — não vê de novo, nem o super_admin.
 */
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { estado, perfil } = vi.hoisted(() => ({
  estado: { ligada: true, respondeu: false },
  perfil: { id: 'p1', nome: 'Ana Souza', perfil: 'operador' },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil }) }));
vi.mock('@/services/impersonacao.service', () => ({ getImpersonacaoAtiva: () => null }));
vi.mock('./pesquisa', async importOriginal => ({
  ...(await importOriginal<typeof import('./pesquisa')>()),
  lerEstadoPesquisa: async () => ({ ...estado }),
}));
vi.mock('./CartaoPesquisa', () => ({
  CartaoPesquisa: ({ previa }: { previa?: boolean }) => <div>{previa ? 'cartão (prévia)' : 'cartão'}</div>,
}));

import { PesquisaExperiencia } from './index';
import { abrirPreviaPesquisa } from './pesquisa';

function montar(liberado = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><PesquisaExperiencia liberado={liberado} esquerda={240} /></QueryClientProvider>);
}
const passar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.assign(estado, { ligada: true, respondeu: false });
  perfil.perfil = 'operador';
});
afterEach(() => { vi.useRealTimers(); });

describe('PesquisaExperiencia', () => {
  it('aparece depois de 3 min de uso para quem ainda não respondeu', async () => {
    montar();
    await passar(1000);
    expect(screen.queryByText('cartão')).toBeNull();
    await passar(3 * 60_000);
    expect(await screen.findByText('cartão')).toBeTruthy();
  });

  it('quem já respondeu não vê de novo (recarregar ou outro computador)', async () => {
    estado.respondeu = true;
    montar();
    await passar(4 * 60_000);
    expect(screen.queryByText('cartão')).toBeNull();
  });

  it('desligada, ninguém vê', async () => {
    estado.ligada = false;
    montar();
    await passar(4 * 60_000);
    expect(screen.queryByText('cartão')).toBeNull();
  });

  it('espera o termo, o tutorial e a carta saírem da frente', async () => {
    const { rerender } = montar(false);
    await passar(4 * 60_000);
    expect(screen.queryByText('cartão')).toBeNull();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(<QueryClientProvider client={qc}><PesquisaExperiencia liberado esquerda={240} /></QueryClientProvider>);
    expect(await screen.findByText('cartão')).toBeTruthy();
  });

  it('o super_admin não responde, mas abre a prévia', async () => {
    perfil.perfil = 'super_admin';
    montar();
    await passar(4 * 60_000);
    expect(screen.queryByText('cartão')).toBeNull();
    act(() => abrirPreviaPesquisa());
    expect(screen.getByText('cartão (prévia)')).toBeTruthy();
  });
});
