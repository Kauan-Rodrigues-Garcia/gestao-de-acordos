/**
 * Excluir ticket — pedido de 14/09/2026, exclusão definitiva.
 *
 * O que se protege: a exclusão passa pela RPC (que confere a chave e o recorte
 * de quem enxerga), os anexos só são apagados DEPOIS de ela aceitar, e a recusa
 * do banco chega traduzida.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc, mockList, mockRemove, mockLog } = vi.hoisted(() => ({
  mockRpc: vi.fn(), mockList: vi.fn(), mockRemove: vi.fn(), mockLog: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: (...args: unknown[]) => mockRpc(...args),
    storage: { from: () => ({ list: mockList, remove: mockRemove }) },
  },
}));

vi.mock('@/services/logs.service', () => ({
  registrarLog: (...args: unknown[]) => mockLog(...args),
}));

import { excluirTicket } from './tickets.service';

describe('excluirTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('exclui pela RPC, apaga a pasta de anexos e registra o log', async () => {
    mockRpc.mockResolvedValue({
      data: { id: 't-1', numero: 42, empresa_id: 'e-1', assunto: 'Erro na aba Pix' }, error: null,
    });
    mockList.mockResolvedValue({ data: [{ name: 'a.png' }, { name: 'b.pdf' }], error: null });
    mockRemove.mockResolvedValue({ data: [], error: null });

    const r = await excluirTicket('t-1');

    expect(r.erro).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('fn_ticket_excluir', { p_ticket: 't-1' });
    expect(mockList).toHaveBeenCalledWith('e-1/t-1', expect.anything());
    expect(mockRemove).toHaveBeenCalledWith(['e-1/t-1/a.png', 'e-1/t-1/b.pdf']);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      acao: 'ticket_excluido', empresaId: 'e-1', registroId: 't-1',
    }));
  });

  it('recusa do banco: nada é apagado do Storage, e a mensagem chega traduzida', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'TICKET_SEM_PERMISSAO: Excluir ticket depende da permissao «Tickets: excluir».' },
    });

    const r = await excluirTicket('t-1');

    expect(r.erro).toBe('Excluir ticket depende da permissao «Tickets: excluir».');
    expect(mockList).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('ticket sem anexo não chama remove', async () => {
    mockRpc.mockResolvedValue({ data: { id: 't-1', numero: 1, empresa_id: 'e-1', assunto: 'x' }, error: null });
    mockList.mockResolvedValue({ data: [], error: null });

    const r = await excluirTicket('t-1');

    expect(r.erro).toBeNull();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('falha ao apagar anexo não desfaz a exclusão — avisa e segue', async () => {
    mockRpc.mockResolvedValue({ data: { id: 't-1', numero: 1, empresa_id: 'e-1', assunto: 'x' }, error: null });
    mockList.mockResolvedValue({ data: [{ name: 'a.png' }], error: null });
    mockRemove.mockResolvedValue({ data: null, error: { message: 'denied' } });

    const r = await excluirTicket('t-1');

    expect(r.erro).toBeNull();
    expect(r.anexosPendentes).toBe(true);
  });

  it('sem a migration no banco, diz qual falta', async () => {
    mockRpc.mockResolvedValue({
      data: null, error: { message: 'Could not find the function public.fn_ticket_excluir(p_ticket) in the schema cache' },
    });
    const r = await excluirTicket('t-1');
    expect(r.erro).toMatch(/20260914200000/);
  });
});
