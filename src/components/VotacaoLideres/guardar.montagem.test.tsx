/**
 * Guardar sem liberar (12/11/2026), com o banco simulado:
 *   - encerrada tem «Guardar sem liberar» e «Reabrir para votar»;
 *   - guardada vai para «Guardadas sem liberar», só com «Tirar da gaveta» e
 *     «Ver a apuração» (nada de liberar nem cancelar);
 *   - o card «Apurar» da diretoria não aparece para a guardada;
 *   - a votação dos gerentes conta os eleitores no «votaram X de N».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { VotacaoNaLista } from './banco';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag: string) => ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...p }: Record<string, unknown> & { children?: React.ReactNode }) => {
      const Tag = tag as unknown as React.ElementType;
      return <Tag {...p}>{children}</Tag>;
    },
  }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'dir', perfil: 'diretoria' } }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

const banco = vi.hoisted(() => ({ listar: vi.fn(), guardar: vi.fn(), desguardar: vi.fn(), reabrir: vi.fn(), minhas: vi.fn(), resultados: vi.fn() }));
vi.mock('./banco', async importOriginal => ({
  ...(await importOriginal<typeof import('./banco')>()),
  listarVotacoes: banco.listar,
  guardarVotacao: banco.guardar,
  tirarDaGaveta: banco.desguardar,
  reabrirVotacao: banco.reabrir,
  lerMinhasVotacoes: banco.minhas,
  lerMeusResultados: banco.resultados,
}));

const item = (id: string, extra: Partial<VotacaoNaLista> = {}): VotacaoNaLista => ({
  id, titulo: `Votação ${id}`, produto: 'cobranca', estado: 'encerrada', perguntas: 15, participantes: 4, votaram: 2,
  criada_em: '2026-11-09T12:00:00Z', aberta_em: '2026-11-09T12:00:00Z', encerrada_em: '2026-11-10T12:00:00Z', liberada_em: null, cancelada_em: null,
  ...extra,
});

const { PainelVotacoes } = await import('./PainelVotacoes');
const { AvisoVotacao } = await import('./AvisoVotacao');

describe('guardar sem liberar', () => {
  beforeEach(() => {
    for (const f of Object.values(banco)) f.mockReset().mockResolvedValue(undefined);
    banco.minhas.mockResolvedValue([]);
    banco.resultados.mockResolvedValue([]);
    window.confirm = vi.fn(() => true);
  });

  it('encerrada guarda; guardada só tira da gaveta', async () => {
    banco.listar.mockResolvedValue([item('lid'), item('gav', { guardada_em: '2026-11-12T10:00:00Z' })]);
    render(<PainelVotacoes versao={0} />);
    const atual = (await screen.findByText('Votação lid')).closest('li')!;
    expect(within(atual).getByRole('button', { name: /Reabrir para votar/ })).toBeTruthy();
    fireEvent.click(within(atual).getByRole('button', { name: /Guardar sem liberar/ }));
    await waitFor(() => expect(banco.guardar).toHaveBeenCalledWith('lid'));

    expect(screen.getByText(/Guardadas sem liberar \(1\)/)).toBeTruthy();
    const gav = screen.getByText('Votação gav').closest('li')!;
    expect(within(gav).getByText(/Guardada · sem liberar/)).toBeTruthy();
    expect(within(gav).queryByRole('button', { name: /Apurar e liberar/ })).toBeNull();
    expect(within(gav).queryByRole('button', { name: /Cancelar/ })).toBeNull();
    expect(within(gav).getByRole('button', { name: /Ver a apuração/ })).toBeTruthy();
    fireEvent.click(within(gav).getByRole('button', { name: /Tirar da gaveta/ }));
    await waitFor(() => expect(banco.desguardar).toHaveBeenCalledWith('gav'));
  });

  it('gerentes: etiqueta e «votaram X de eleitores»', async () => {
    banco.listar.mockResolvedValue([item('ger', { tipo: 'gerentes', estado: 'aberta', participantes: 3, eleitores: 120, votaram: 40 })]);
    render(<PainelVotacoes versao={0} />);
    const li = (await screen.findByText('Votação ger')).closest('li')!;
    expect(within(li).getByText('Gerentes')).toBeTruthy();
    expect(within(li).getByText('40 de 120')).toBeTruthy();
  });

  it('a diretoria não recebe o card «Apurar» da guardada', async () => {
    banco.listar.mockResolvedValue([item('gav', { guardada_em: '2026-11-12T10:00:00Z' })]);
    render(<AvisoVotacao recuoEsquerda={16} />);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => expect(banco.listar).toHaveBeenCalled());
    expect(screen.queryByText(/Falta liberar o resultado/)).toBeNull();
  });

  it('sem guardar, a diretoria recebe o card', async () => {
    banco.listar.mockResolvedValue([item('lid')]);
    render(<AvisoVotacao recuoEsquerda={16} />);
    expect(await screen.findByText(/Falta liberar o resultado/)).toBeTruthy();
  });
});
