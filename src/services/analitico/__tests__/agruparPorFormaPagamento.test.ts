import { describe, it, expect } from 'vitest';
import { agruparPorFormaPagamento } from '../analitico.service';

type Linha = Parameters<typeof agruparPorFormaPagamento>[0][number];

function linha(
  forma_pagamento: 'boleto_pix' | 'cartao',
  forma_detalhe: string | null,
  valor_recebido: number,
): Linha {
  return { forma_pagamento, forma_detalhe, valor_recebido };
}

describe('agruparPorFormaPagamento', () => {
  it('agrupa por forma_detalhe (BookPlay) com total e percentuais coerentes', () => {
    const r = agruparPorFormaPagamento([
      linha('boleto_pix', 'PIX', 600),
      linha('boleto_pix', 'PIX', 400),
      linha('cartao', 'Cartão de Crédito', 800),
      linha('boleto_pix', 'Boleto Negociação', 200),
    ]);

    expect(r.totalValor).toBe(2000);
    expect(r.totalQtd).toBe(4);
    expect(r.formas.map(f => f.rotulo)).toEqual(['PIX', 'Cartão de Crédito', 'Boleto Negociação']);
    const pix = r.formas.find(f => f.rotulo === 'PIX')!;
    expect(pix.valor).toBe(1000);
    expect(pix.qtd).toBe(2);
    expect(pix.perc).toBe(50);
    const somaPerc = r.formas.reduce((s, f) => s + f.perc, 0);
    expect(Math.abs(somaPerc - 100)).toBeLessThanOrEqual(1);
    expect(r.formas.reduce((s, f) => s + f.valor, 0)).toBe(r.totalValor);
  });

  it('agrupa em dois rótulos binários sem forma_detalhe (PaguePlay)', () => {
    const r = agruparPorFormaPagamento([
      linha('cartao', null, 300),
      linha('boleto_pix', null, 700),
    ]);
    expect(r.formas.map(f => f.rotulo)).toEqual(['Boleto/Pix', 'Cartão']);
    expect(r.formas.find(f => f.rotulo === 'Boleto/Pix')!.perc).toBe(70);
  });

  it('retorna vazio para lista vazia sem dividir por zero', () => {
    const r = agruparPorFormaPagamento([]);
    expect(r.formas).toEqual([]);
    expect(r.totalValor).toBe(0);
    expect(r.totalQtd).toBe(0);
  });
});
