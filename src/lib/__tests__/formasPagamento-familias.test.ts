/**
 * As famílias de forma de pagamento.
 *
 * O que se testa aqui é a ORDEM das regras. Cada caso abaixo é um rótulo real
 * do ERP que, com os testes na ordem errada, cai na família errada e produz um
 * painel plausível: o recorrente somado dentro de «Cartão», ou o cartão parcial
 * contado como boleto. Nenhum dos dois dá erro — só um número torto.
 */
import { describe, it, expect } from 'vitest';
import { familiaDaForma, agruparFormas, type LinhaDeForma } from '../formasPagamento';

const linha = (forma: string, valor: number, qtd = 1, valorAnterior = 0): LinhaDeForma =>
  ({ forma, valor, qtd, valorAnterior });

describe('familiaDaForma', () => {
  it('junta as variações de boleto', () => {
    expect(familiaDaForma('BOLETO BANCÁRIO')?.chave).toBe('boleto');
    expect(familiaDaForma('Boleto Negociação')?.chave).toBe('boleto');
  });

  it('recorrente é família própria, mesmo escrito sem a palavra cartão', () => {
    // O 59 da BookPlay escreve só «RECORRENTE». É cartão recorrente do mesmo
    // jeito, e tem que sair do grupo «Cartão» — foi o pedido explícito.
    expect(familiaDaForma('RECORRENTE')).toEqual({ chave: 'cartao_recorrente', rotulo: 'Cartão recorrente' });
    expect(familiaDaForma('CARTÃO RECORRENTE')?.chave).toBe('cartao_recorrente');
  });

  it('cartão + boleto no mesmo rótulo é CARTÃO', () => {
    // «CARTÃO SITE PARCIAL + BOLETO»: o dinheiro entrou por cartão. Se o teste
    // de boleto viesse antes, esta linha migraria de família sem aviso.
    expect(familiaDaForma('CARTÃO SITE PARCIAL + BOLETO')?.chave).toBe('cartao');
  });

  it('casa sem acento e sem caixa', () => {
    expect(familiaDaForma('cartao de credito')?.chave).toBe('cartao');
    expect(familiaDaForma('boleto')?.chave).toBe('boleto');
  });

  it('forma fora das famílias devolve null e continua sozinha', () => {
    // Pix e uma forma inédita do ERP não podem virar «Outros»: um grupo genérico
    // esconderia a novidade justamente no mês em que ela apareceu.
    expect(familiaDaForma('PIX')).toBeNull();
    expect(familiaDaForma('PIX AUTOMÁTICO')).toBeNull();
    expect(familiaDaForma('CRIPTO XYZ')).toBeNull();
  });
});

describe('agruparFormas', () => {
  const entrada = [
    linha('PIX', 500, 5, 400),
    linha('BOLETO BANCÁRIO', 300, 3, 100),
    linha('CARTÃO DE CRÉDITO', 200, 2, 50),
    linha('BOLETO NEGOCIAÇÃO', 100, 1, 20),
    linha('RECORRENTE', 90, 9, 10),
    linha('CARTÃO SITE PARCIAL + BOLETO', 80, 4, 0),
  ];

  it('soma valor, quantidade e mês anterior dentro do grupo', () => {
    const g = agruparFormas(entrada);
    const boleto = g.find(x => x.chave === 'boleto')!;
    expect(boleto.rotulo).toBe('Boleto');
    expect(boleto.valor).toBe(400);
    expect(boleto.qtd).toBe(4);
    expect(boleto.valorAnterior).toBe(120);
    expect(boleto.itens).toHaveLength(2);
  });

  it('recorrente não entra no cartão', () => {
    const g = agruparFormas(entrada);
    expect(g.find(x => x.chave === 'cartao')!.valor).toBe(280);   // 200 + 80
    expect(g.find(x => x.chave === 'cartao_recorrente')!.valor).toBe(90);
  });

  it('ordena grupos e itens do maior para o menor', () => {
    const g = agruparFormas(entrada);
    expect(g.map(x => x.chave)).toEqual(['cru:PIX', 'boleto', 'cartao', 'cartao_recorrente']);
    expect(g.find(x => x.chave === 'boleto')!.itens.map(i => i.valor)).toEqual([300, 100]);
  });

  it('forma solta vira grupo de um item, com o rótulo do ERP', () => {
    const g = agruparFormas([linha('PIX AUTOMÁTICO', 10)]);
    expect(g).toHaveLength(1);
    expect(g[0].rotulo).toBe('PIX AUTOMÁTICO');
    expect(g[0].itens).toHaveLength(1);
  });

  it('não muta a lista nem as linhas recebidas', () => {
    const original = [linha('BOLETO BANCÁRIO', 300), linha('PIX', 500)];
    const copia = original.map(l => ({ ...l }));
    agruparFormas(original);
    expect(original).toEqual(copia);
  });

  it('lista vazia devolve vazia', () => {
    expect(agruparFormas([])).toEqual([]);
  });
});
