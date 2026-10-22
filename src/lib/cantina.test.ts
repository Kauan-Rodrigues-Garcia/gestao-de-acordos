import { describe, expect, it } from 'vitest';
import {
  agruparPorFaixa, carrinhoReducer, faixasDeRetirada, janelaDoItem, linhasForaDaJanela,
  podeCancelar, quantidadeDoItem, relogioSP, resumoDeProducao, totalDoCarrinho, totalDoDia,
  type ConfigCantina, type ItemCantina, type PedidoCantina,
} from './cantina';

const CFG: ConfigCantina = {
  aberta: true, aviso_titulo: null, aviso_texto: null,
  preparo_min: 15, cancelamento_min: 15, faixa_min: 15, abre_as: '07:00', fecha_as: '17:00',
};

const item = (id: string, preco: number, extra: Partial<ItemCantina> = {}): ItemCantina => ({
  id, codigo: 1, nome: id, descricao: null, ingredientes: [], preco, foto_url: null,
  categoria: 'lanches', opcoes: [], pedido_de: null, pedido_ate: null, ...extra,
});

const pedido = (extra: Partial<PedidoCantina>): PedidoCantina => ({
  id: 'p', dia: '2026-10-22', numero: 1, perfil_id: 'u', nome: 'Ana', empresa_nome: null, setor_nome: null,
  retirada_em: '2026-10-22T13:30:00Z', status: 'novo', total: 10, observacao: null, criado_em: '',
  preparando_em: null, pronto_em: null, encerrado_em: null, motivo_cancelamento: null,
  cancelado_pela_cantina: false, itens: [], nao_lidas: 0, ...extra,
});

describe('relógio de Brasília', () => {
  it('converte o instante para a hora local, sem depender do fuso do computador', () => {
    expect(relogioSP(Date.parse('2026-10-22T14:48:00Z'))).toEqual({ minutos: 11 * 60 + 48, dia: '2026-10-22' });
    expect(relogioSP(Date.parse('2026-10-23T02:10:00Z'))).toEqual({ minutos: 23 * 60 + 10, dia: '2026-10-22' });
  });
});

describe('faixas de retirada', () => {
  it('começa em agora + preparo, arredondado para a faixa, e vai até o fechamento', () => {
    const f = faixasDeRetirada(10 * 60 + 2, CFG);
    expect(f[0]).toBe('10:30');
    expect(f.at(-1)).toBe('17:00');
  });

  it('em cima da faixa, ela vale', () => {
    expect(faixasDeRetirada(10 * 60 + 15, CFG)[0]).toBe('10:30');
  });

  it('antes de abrir, começa na abertura; depois de fechar, não há faixa', () => {
    expect(faixasDeRetirada(5 * 60, CFG)[0]).toBe('07:00');
    expect(faixasDeRetirada(16 * 60 + 50, CFG)).toEqual([]);
  });
});

describe('janela do item', () => {
  const lata = { pedido_de: '13:30', pedido_ate: '15:30' };
  it('antes, dentro (fim inclusive) e depois', () => {
    expect(janelaDoItem(lata, 13 * 60)).toEqual({ estado: 'antes', abre: '13:30' });
    expect(janelaDoItem(lata, 15 * 60 + 30)).toEqual({ estado: 'aberta' });
    expect(janelaDoItem(lata, 15 * 60 + 31)).toEqual({ estado: 'encerrada', fechou: '15:30' });
    expect(janelaDoItem({ pedido_de: null, pedido_ate: null }, 0)).toEqual({ estado: 'aberta' });
  });
});

describe('carrinho', () => {
  const x = item('x', 18);
  const lata = item('lata', 6, { opcoes: ['Coca-Cola', 'Fanta Uva'], pedido_de: '13:30', pedido_ate: '15:30' });

  it('soma, separa por opção, respeita o teto e some quando zera', () => {
    let c = carrinhoReducer([], { tipo: 'somar', item: x, opcao: null, delta: 1 });
    c = carrinhoReducer(c, { tipo: 'somar', item: x, opcao: null, delta: 1 });
    c = carrinhoReducer(c, { tipo: 'somar', item: lata, opcao: 'Coca-Cola', delta: 1 });
    c = carrinhoReducer(c, { tipo: 'somar', item: lata, opcao: 'Fanta Uva', delta: 2 });
    expect(c).toHaveLength(3);
    expect(quantidadeDoItem(c, 'lata')).toBe(3);
    expect(totalDoCarrinho(c)).toEqual({ itens: 5, valor: 18 * 2 + 6 * 3 });

    c = carrinhoReducer(c, { tipo: 'somar', item: x, opcao: null, delta: 50 });
    expect(c.find(l => l.item.id === 'x')!.quantidade).toBe(20);

    c = carrinhoReducer(c, { tipo: 'somar', item: x, opcao: null, delta: -20 });
    expect(quantidadeDoItem(c, 'x')).toBe(0);
  });

  it('aponta o que saiu da janela enquanto a pessoa montava', () => {
    const c = carrinhoReducer([], { tipo: 'somar', item: lata, opcao: 'Coca-Cola', delta: 1 });
    expect(linhasForaDaJanela(c, 15 * 60 + 40)).toHaveLength(1);
    expect(linhasForaDaJanela(c, 14 * 60)).toHaveLength(0);
  });
});

describe('pedido', () => {
  const retirada = Date.parse('2026-10-22T13:30:00Z');

  it('cancela até 15 min antes, só enquanto novo ou preparando', () => {
    expect(podeCancelar(pedido({}), retirada - 15 * 60_000, 15)).toBe(true);
    expect(podeCancelar(pedido({}), retirada - 14 * 60_000, 15)).toBe(false);
    expect(podeCancelar(pedido({ status: 'pronto' }), retirada - 60 * 60_000, 15)).toBe(false);
  });

  it('agrupa a fila por faixa e resume a produção dos próximos 30 min', () => {
    const ps = [
      pedido({ id: 'a', numero: 2, retirada_em: '2026-10-22T13:30:00Z', itens: [{ codigo: 50, nome: 'X-Salada', preco: 18, quantidade: 2, opcao: null, observacao: null }] }),
      pedido({ id: 'b', numero: 1, retirada_em: '2026-10-22T13:30:00Z', status: 'preparando', itens: [{ codigo: 50, nome: 'X-Salada', preco: 18, quantidade: 1, opcao: null, observacao: null }] }),
      pedido({ id: 'c', numero: 3, retirada_em: '2026-10-22T15:00:00Z', itens: [{ codigo: 52, nome: 'Hot-Dog', preco: 14, quantidade: 1, opcao: null, observacao: null }] }),
      pedido({ id: 'd', numero: 4, status: 'cancelado', total: 99 }),
    ];
    expect(agruparPorFaixa(ps).map(g => [g.faixa, g.pedidos.map(p => p.id)])).toEqual([
      ['10:30', ['b', 'a', 'd']],
      ['12:00', ['c']],
    ]);
    expect(resumoDeProducao(ps, retirada - 10 * 60_000)).toEqual([{ nome: 'X-Salada', quantidade: 3 }]);
    expect(totalDoDia(ps)).toEqual({ pedidos: 3, valor: 30 });
  });
});
