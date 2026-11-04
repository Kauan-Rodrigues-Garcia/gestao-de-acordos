/**
 * transferenciaPedidos — etiquetas, resumo do canal e mensagens do banco.
 */
import { describe, it, expect } from 'vitest';
import {
  decididosDesde, etiquetasDoSetor, mensagemDoPedido, pedidoAberto, pedidosNovos,
  resumoDasTransferencias, setoresPorMarca, type ItemPedido, type PedidoTransferencia,
} from './transferenciaPedidos';

const PLAY2 = { id: 's-play2', nome: 'Play 2', empresa_id: 'bp', cidade: 'Birigui', regra: 'nosso_produto' };
const PLAY3 = { id: 's-play3', nome: 'Play 3', empresa_id: 'bp', cidade: 'Birigui', regra: 'nosso_produto' };
const CONECTA = { id: 's-conecta', nome: 'Conecta Play', empresa_id: 'pp', cidade: 'Marília', regra: 'cofen' };

function item(status: ItemPedido['status'], extra: Partial<ItemPedido> = {}): ItemPedido {
  return {
    id: `i-${Math.random()}`, perfil_id: 'p', perfil_nome: 'Ana Souza', perfil_cargo: 'operador',
    status, reservado_em: null, decidido_por_nome: null, decidido_em: null, motivo_recusa: null,
    erro: null, levou_acordos: null, atual: null, ...extra,
  };
}

function pedido(extra: Partial<PedidoTransferencia> = {}): PedidoTransferencia {
  return {
    id: 'ped-1', empresa_id: 'bp', solicitante_id: 'lider-joao', solicitante_nome: 'João Pedro',
    solicitante_cargo: 'lider', solicitante_setor: 'Play 2', solicitante_foto: null,
    direcao: 'tirar', origem: PLAY2, destino: PLAY3, levar_acordos: false, motivo: null,
    status: 'pendente', criado_em: '2026-11-03T12:00:00Z', concluido_em: null,
    itens: [item('pendente'), item('pendente')], ...extra,
  };
}

describe('etiquetasDoSetor', () => {
  it('marca pela cidade e regra pelo setor', () => {
    expect(etiquetasDoSetor(PLAY2)).toEqual({ marca: 'BookPlay', regra: 'nosso_produto' });
    expect(etiquetasDoSetor(CONECTA)).toEqual({ marca: 'PaguePlay', regra: 'cofen' });
    expect(etiquetasDoSetor({ cidade: null, regra: null })).toEqual({ marca: null, regra: null });
  });

  it('agrupa BookPlay, PaguePlay e os sem marca por último', () => {
    const grupos = setoresPorMarca([CONECTA, PLAY3, { ...PLAY2, cidade: null }, PLAY2]);
    expect(grupos.map(g => g.marca)).toEqual(['BookPlay', 'PaguePlay', null]);
    expect(grupos[0].setores.map(s => s.nome)).toEqual(['Play 2', 'Play 3']);
  });
});

describe('resumoDasTransferencias', () => {
  it('super admin com pedido aberto: quem pede e o quê', () => {
    const r = resumoDasTransferencias([pedido()], true);
    expect(r.pendentes).toBe(1);
    expect(r.previa).toBe('João pede 2 pessoas do Play 2 para o Play 3');
  });

  it('quem pediu, decidido: o resultado', () => {
    const p = pedido({
      status: 'concluido', concluido_em: '2026-11-03T14:00:00Z',
      itens: [item('transferida'), item('transferida'), item('recusada')],
    });
    const r = resumoDasTransferencias([p], false);
    expect(r.pendentes).toBe(0);
    expect(r.previa).toBe('2 transferidas · 1 recusada · Play 3');
    expect(r.ultimaEm).toBe('2026-11-03T14:00:00Z');
  });

  it('pedido com todos decididos não está aberto, mesmo antes de o status fechar', () => {
    expect(pedidoAberto(pedido({ itens: [item('transferida'), item('recusada')] }))).toBe(false);
    expect(pedidoAberto(pedido({ itens: [item('transferida'), item('executando')] }))).toBe(true);
  });
});

describe('avisos do canal', () => {
  it('decididos desde a última olhada contam para quem pediu', () => {
    const p = pedido({ status: 'concluido', concluido_em: '2026-11-03T14:00:00Z', itens: [item('transferida')] });
    expect(decididosDesde([p], null)).toBe(1);
    expect(decididosDesde([p], '2026-11-03T13:00:00Z')).toBe(1);
    expect(decididosDesde([p], '2026-11-03T15:00:00Z')).toBe(0);
    // Cancelado pela própria pessoa não acende.
    expect(decididosDesde([{ ...p, status: 'cancelado', itens: [item('cancelada')] }], null)).toBe(0);
  });

  it('pedido novo avisa o super admin, mas não o próprio autor', () => {
    expect(pedidosNovos(new Set(), [pedido()], 'super-1')).toHaveLength(1);
    expect(pedidosNovos(new Set(['ped-1']), [pedido()], 'super-1')).toHaveLength(0);
    expect(pedidosNovos(new Set(), [pedido()], 'lider-joao')).toHaveLength(0);
  });
});

describe('mensagemDoPedido', () => {
  it('traduz o código e cita os nomes', () => {
    expect(mensagemDoPedido({ erro: 'ja_em_pedido', nomes: ['Ana', 'Bia'] })).toBe('Já há um pedido aberto para: Ana, Bia.');
    expect(mensagemDoPedido({ erro: 'ja_decidido', por: 'Cleber' })).toBe('Essa pessoa já foi decidida por Cleber.');
    expect(mensagemDoPedido({ erro: 'xyz' })).toBe('Não foi possível concluir (xyz).');
  });
});
