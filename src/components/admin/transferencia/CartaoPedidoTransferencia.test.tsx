/**
 * CartaoPedidoTransferencia — as duas visões do pedido no canal do chat.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ItemPedido, PedidoTransferencia } from '@/lib/transferenciaPedidos';

const { mockAprovar, mockRecusar, mockCancelar } = vi.hoisted(() => ({
  mockAprovar: vi.fn(), mockRecusar: vi.fn(), mockCancelar: vi.fn(),
}));

vi.mock('@/services/admin/transferenciaPedidos.service', async () => {
  const real = await vi.importActual<typeof import('@/services/admin/transferenciaPedidos.service')>(
    '@/services/admin/transferenciaPedidos.service',
  );
  return { ...real, aprovarItens: mockAprovar, recusarItens: mockRecusar, cancelarPedido: mockCancelar };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() }) }));

import { CartaoPedidoTransferencia } from './CartaoPedidoTransferencia';

const item = (id: string, nome: string, status: ItemPedido['status'] = 'pendente'): ItemPedido => ({
  id, perfil_id: `p-${id}`, perfil_nome: nome, perfil_cargo: 'operador', status,
  reservado_em: null, decidido_por_nome: null, decidido_em: null, motivo_recusa: null,
  erro: null, levou_acordos: null, atual: null,
});

const PEDIDO: PedidoTransferencia = {
  id: 'ped-1', empresa_id: 'bp', solicitante_id: 'lider-joao', solicitante_nome: 'João Pedro',
  solicitante_cargo: 'lider', solicitante_setor: 'Play 2', solicitante_foto: null, direcao: 'tirar',
  origem: { id: 's2', nome: 'Play 2', empresa_id: 'bp', cidade: 'Birigui', regra: 'nosso_produto' },
  destino: { id: 'sc', nome: 'Conecta Play', empresa_id: 'pp', cidade: 'Marília', regra: 'cofen' },
  levar_acordos: false, motivo: 'Reforço', status: 'pendente', criado_em: '2026-11-03T12:00:00Z',
  concluido_em: null, itens: [item('a', 'Ana'), item('b', 'Bia'), item('c', 'Caio')],
};

beforeEach(() => {
  mockAprovar.mockReset().mockResolvedValue([]);
  mockRecusar.mockReset().mockResolvedValue({ ok: true });
  mockCancelar.mockReset().mockResolvedValue({ ok: true });
});

describe('CartaoPedidoTransferencia — super admin', () => {
  it('mostra etiquetas e aprova as marcadas, recusando as desmarcadas', async () => {
    const onMudou = vi.fn();
    render(<CartaoPedidoTransferencia pedido={PEDIDO} souSuperAdmin meuId="super-1" onMudou={onMudou} />);

    expect(screen.getByText('BookPlay')).toBeTruthy();
    expect(screen.getByText('PaguePlay')).toBeTruthy();
    expect(screen.getByText('Cofen')).toBeTruthy();
    // Outra empresa: levar as tabulações fica travado.
    expect((screen.getByRole('checkbox', { name: /Levar as tabulações/ }) as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Aprovar Bia' }));
    fireEvent.click(screen.getByRole('button', { name: /Aprovar marcadas \(2\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }));

    await waitFor(() => expect(onMudou).toHaveBeenCalled());
    expect(mockAprovar).toHaveBeenCalledWith(expect.objectContaining({ itemIds: ['a', 'c'], levarAcordos: false }));
    expect(mockRecusar).toHaveBeenCalledWith(['b'], '');
  });

  it('recusar todas não transfere ninguém', async () => {
    render(<CartaoPedidoTransferencia pedido={PEDIDO} souSuperAdmin meuId="super-1" onMudou={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Recusar todas/ }));
    await waitFor(() => expect(mockRecusar).toHaveBeenCalledWith(['a', 'b', 'c'], ''));
    expect(mockAprovar).not.toHaveBeenCalled();
  });
});

describe('CartaoPedidoTransferencia — quem pediu', () => {
  it('vê a situação de cada um e pode cancelar, sem caixinhas', async () => {
    const pedido = { ...PEDIDO, itens: [item('a', 'Ana', 'transferida'), item('b', 'Bia')] };
    render(<CartaoPedidoTransferencia pedido={pedido} souSuperAdmin={false} meuId="lider-joao" onMudou={vi.fn()} />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText('Transferida')).toBeTruthy();
    expect(screen.getByText('Aguardando')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cancelar pedido/ }));
    await waitFor(() => expect(mockCancelar).toHaveBeenCalledWith('ped-1'));
  });
});
