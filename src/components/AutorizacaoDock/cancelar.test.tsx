/**
 * cancelar.test.tsx — quem pode retirar o próprio pedido da fila.
 *
 * ## Por que este arquivo existe
 *
 * O botão de cancelar entrou em 08/09/2026, e ele fechou uma lacuna curiosa: a
 * função `cancelarAutorizacao` e a RPC `fn_autorizacao_cancelar` existiam
 * havia tempo, completas — e NÃO HAVIA BOTÃO. O handler estava no componente,
 * sem chamador, até o ESLint apontar que ninguém o usava.
 *
 * A regra que ele obedece tem duas metades, e as duas somem fácil numa
 * refatoração:
 *
 *   1. só o SOLICITANTE cancela — decidir o próprio pedido continua proibido;
 *   2. só enquanto PENDENTE — depois de decidido não há o que retirar.
 *
 * A tela esconder é conveniência. A garantia é da RPC, que filtra por
 * `solicitante_id = auth.uid() AND status = 'pendente'`. Este teste guarda a
 * conveniência; o banco guarda o resto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PedidoAutorizacao } from '@/services/autorizacaoPedidos.service';

const { perfilRef, pedidosRef, mockCancelar, mockRecarregar } = vi.hoisted(() => ({
  perfilRef:      { current: { id: 'eu', nome: 'Eu Mesmo', perfil: 'lider' } as unknown },
  pedidosRef:     { current: [] as PedidoAutorizacao[] },
  mockCancelar:   vi.fn(),
  mockRecarregar: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: perfilRef.current }) }));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'emp-1', nome: 'Empresa' } }),
}));
// O dock só monta para quem autoriza — sem isto ele devolve `null` e não há o
// que testar. A permissão real vem do painel; aqui ela é premissa do cenário.
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => true, loading: false }),
}));
vi.mock('@/hooks/useEstadoLembrado', () => ({
  // Gaveta ABERTA: fechada, os cartões nem chegam ao DOM.
  useEstadoLembrado: () => [true, vi.fn()],
}));
vi.mock('@/hooks/useAutorizacaoPedidos', () => ({
  useAutorizacaoPedidos: () => ({
    pedidos:    pedidosRef.current,
    pendentes:  pedidosRef.current.filter(p => p.status === 'pendente'),
    carregando: false,
    recarregar: mockRecarregar,
  }),
}));
vi.mock('@/services/autorizacaoPedidos.service', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('@/services/autorizacaoPedidos.service')>();
  return { ...real, cancelarAutorizacao: (...a: unknown[]) => mockCancelar(...a) };
});

import { AutorizacaoDock } from './index';

function pedido(over: Partial<PedidoAutorizacao> = {}): PedidoAutorizacao {
  const agora = new Date();
  return {
    id: 'ped-1', empresa_id: 'emp-1',
    solicitante_id: 'eu', solicitante_nome: 'Eu Mesmo',
    setor_id: 'setor-1', modo: 'transferencia',
    nr_label: 'NR', nr_valor: '12345',
    acordo_alvo_id: null, dono_id: 'outro', dono_nome: 'Outro Operador',
    extra_atual_id: null, extra_atual_op_id: null, extra_atual_op_nome: null,
    resumo: { cliente: 'Cliente X', valor: 100 },
    status: 'pendente',
    decidido_por_id: null, decidido_por_nome: null, decidido_em: null,
    motivo_recusa: null, erro: null, acordo_criado_id: null,
    criado_em: agora.toISOString(),
    expira_em: new Date(agora.getTime() + 3_600_000).toISOString(),
    ...over,
  } as PedidoAutorizacao;
}

const botaoCancelar = () => screen.queryByRole('button', { name: /cancelar pedido/i });

describe('cancelar o próprio pedido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCancelar.mockResolvedValue(true);
    perfilRef.current = { id: 'eu', nome: 'Eu Mesmo', perfil: 'lider' };
  });

  it('o solicitante vê o botão enquanto o pedido está pendente', () => {
    pedidosRef.current = [pedido()];
    render(<AutorizacaoDock />);
    expect(botaoCancelar()).toBeInTheDocument();
  });

  it('cancelar chama a RPC com o id do pedido e manda recarregar a lista', async () => {
    pedidosRef.current = [pedido({ id: 'ped-42' })];
    render(<AutorizacaoDock />);

    await userEvent.click(botaoCancelar()!);

    expect(mockCancelar).toHaveBeenCalledWith('ped-42');
    // Sem o recarregar, o cartão continuaria "pendente" na tela depois de
    // cancelado — e a pessoa clicaria de novo.
    expect(mockRecarregar).toHaveBeenCalled();
  });

  it('pedido JÁ DECIDIDO não oferece cancelar', () => {
    pedidosRef.current = [pedido({ status: 'aprovado', decidido_em: new Date().toISOString() })];
    render(<AutorizacaoDock />);
    expect(botaoCancelar()).not.toBeInTheDocument();
  });

  it('pedido de OUTRA pessoa não oferece cancelar — nem para quem autoriza', () => {
    pedidosRef.current = [pedido({ solicitante_id: 'outra-pessoa', solicitante_nome: 'Fulano' })];
    render(<AutorizacaoDock />);
    expect(botaoCancelar()).not.toBeInTheDocument();
  });

  it('no pedido de outra pessoa quem autoriza continua vendo Aprovar e Recusar', () => {
    // A contraprova do caso acima: esconder o cancelar não pode ter escondido
    // a decisão junto.
    pedidosRef.current = [pedido({ solicitante_id: 'outra-pessoa', solicitante_nome: 'Fulano' })];
    render(<AutorizacaoDock />);
    expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recusar/i })).toBeInTheDocument();
  });

  it('no PRÓPRIO pedido não aparece Aprovar nem Recusar', () => {
    // Ninguém decide o próprio pedido — cancelar não abriu essa porta.
    pedidosRef.current = [pedido()];
    render(<AutorizacaoDock />);
    expect(screen.queryByRole('button', { name: /aprovar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /recusar/i })).not.toBeInTheDocument();
  });
});
