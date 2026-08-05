import { describe, it, expect } from 'vitest';
import {
  calcularParcelas, foiUsadoQuarentaPct, parseBRL, calcularTotalAnalitico,
  temEntrada, totalComEntrada, calcularParcelasComEntrada, valorDemaisParcelas,
} from '../money';

describe('calcularParcelas', () => {
  it('divide igualmente quando divisão é exata', () => {
    const result = calcularParcelas(300, 3, false);
    expect(result).toHaveLength(3);
    expect(result).toEqual([100, 100, 100]);
  });

  it('fração < 0.5: round arredonda para baixo, parcela[0] fica maior', () => {
    // 10000/3 = 3333.33 → round = 3333 → p1 = 10000-2*3333 = 3334 = 33.34
    const result = calcularParcelas(100, 3, false);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(33.34, 2);
    expect(result[1]).toBeCloseTo(33.33, 2);
    expect(result[2]).toBeCloseTo(33.33, 2);
    expect(Math.round(result.reduce((a, b) => a + b, 0) * 100)).toBe(10000);
  });

  it('fração >= 0.5: round arredonda para cima, parcela[0] fica menor (caso do print)', () => {
    // 195883/5 = 39176.6 → round = 39177 → p1 = 195883-4*39177 = 39175 = 391.75
    const result = calcularParcelas(1958.83, 5, false);
    expect(result).toHaveLength(5);
    expect(result[0]).toBeCloseTo(391.75, 2);
    expect(result[1]).toBeCloseTo(391.77, 2);
    expect(result[2]).toBeCloseTo(391.77, 2);
    expect(result[3]).toBeCloseTo(391.77, 2);
    expect(result[4]).toBeCloseTo(391.77, 2);
    expect(Math.round(result.reduce((a, b) => a + b, 0) * 100)).toBe(195883);
  });

  it('40% exato quando divisão é limpa', () => {
    // R$1000 / 4 parcelas com 40%: parcela[0] = 400, demais = 200 cada
    const result = calcularParcelas(1000, 4, true);
    expect(result[0]).toBeCloseTo(400, 2);
    expect(result[1]).toBeCloseTo(200, 2);
    expect(result[2]).toBeCloseTo(200, 2);
    expect(result[3]).toBeCloseTo(200, 2);
  });

  it('40% com divisão exata do restante', () => {
    // R$100 / 3: 40% = 40.00, restante = 60.00 / 2 = 30.00 cada
    const result = calcularParcelas(100, 3, true);
    expect(result[0]).toBeCloseTo(40, 2);
    expect(result[1]).toBeCloseTo(30, 2);
    expect(result[2]).toBeCloseTo(30, 2);
    expect(Math.round(result.reduce((a, b) => a + b, 0) * 100)).toBe(10000);
  });

  it('1 parcela retorna o valor inteiro independente de quarentaPct', () => {
    expect(calcularParcelas(250.75, 1, false)).toEqual([250.75]);
    expect(calcularParcelas(250.75, 1, true)).toEqual([250.75]);
  });

  it('soma das parcelas sempre iguala o total (sem perda de centavo)', () => {
    const casos = [
      [199.99, 7, false],
      [1234.56, 5, true],
      [0.01, 3, false],
      [999.99, 4, true],
    ] as const;
    for (const [total, n, pct] of casos) {
      const result = calcularParcelas(total, n, pct);
      const somaCents = result.reduce((a, b) => a + Math.round(b * 100), 0);
      expect(somaCents).toBe(Math.round(total * 100));
    }
  });
});

describe('parseBRL', () => {
  it('parseia formato BR com ponto de milhar e vírgula decimal', () => {
    expect(parseBRL('1.200,00')).toBe(1200);
    expect(parseBRL('1.234,56')).toBe(1234.56);
    expect(parseBRL('10.000,50')).toBe(10000.5);
  });

  it('parseia sem ponto de milhar', () => {
    expect(parseBRL('1200,00')).toBe(1200);
    expect(parseBRL('99,99')).toBe(99.99);
  });

  it('parseia número sem separador decimal', () => {
    expect(parseBRL('1200')).toBe(1200);
    expect(parseBRL('1.200')).toBe(1200);
  });

  it('remove símbolo R$ e espaços', () => {
    expect(parseBRL('R$ 1.200,00')).toBe(1200);
    expect(parseBRL('R$500,00')).toBe(500);
  });

  it('retorna 0 para entrada vazia ou inválida', () => {
    expect(parseBRL('')).toBe(0);
    expect(parseBRL('abc')).toBe(0);
  });
});

describe('foiUsadoQuarentaPct', () => {
  it('retorna true quando valor é 40% do total', () => {
    expect(foiUsadoQuarentaPct({ valor: 400, valor_total: 1000, parcelas: 4 })).toBe(true);
  });

  it('retorna false quando valor não é 40% do total', () => {
    expect(foiUsadoQuarentaPct({ valor: 250, valor_total: 1000, parcelas: 4 })).toBe(false);
  });

  it('retorna false quando valor_total é null', () => {
    expect(foiUsadoQuarentaPct({ valor: 400, valor_total: null, parcelas: 4 })).toBe(false);
  });

  it('retorna false quando parcelas é 1 (sem sentido usar 40%)', () => {
    expect(foiUsadoQuarentaPct({ valor: 400, valor_total: 1000, parcelas: 1 })).toBe(false);
  });
});

describe('calcularTotalAnalitico', () => {
  it('à vista: total = valor da parcela', () => {
    expect(calcularTotalAnalitico(500, 1, 1, false)).toBe(500);
  });

  it('sem 40%: total = parcela × N (249 × 12 = 2988)', () => {
    expect(calcularTotalAnalitico(249, 12, 4, false)).toBe(2988);
  });

  it('40% na 1ª parcela: total = parcela ÷ 0,4 (400 → 1000)', () => {
    expect(calcularTotalAnalitico(400, 3, 1, true)).toBe(1000);
  });

  it('40% mas parcela paga é 2ª+: parcela é uma das demais (60% ÷ (N−1))', () => {
    // total 1000, 3x com 40%: demais = 300 → 300 × 2 / 0,6 = 1000
    expect(calcularTotalAnalitico(300, 3, 2, true)).toBe(1000);
  });

  it('40% ignorado quando N ≤ 2 (mesma regra do formulário)', () => {
    expect(calcularTotalAnalitico(500, 2, 1, true)).toBe(1000);
  });

  it('coerência: parcela derivada de calcularParcelas devolve o mesmo total', () => {
    const total = 2988;
    const parcelas = calcularParcelas(total, 12, false);
    expect(calcularTotalAnalitico(parcelas[3], 12, 4, false)).toBe(total);
  });
});

// ── Entrada + demais parcelas (BookPlay) ────────────────────────────────────
// A entrada é a parcela 1 de N: "4 parcelas com entrada" = 4 pagamentos, o
// primeiro com valor próprio. Ver a decisão em 05/08/2026.

describe('temEntrada', () => {
  it('reconhece o acordo com entrada', () => {
    expect(temEntrada({ valor_entrada: 500, parcelas: 4 })).toBe(true);
  });

  it('acordo comum não tem entrada', () => {
    expect(temEntrada({ valor_entrada: null, parcelas: 4 })).toBe(false);
    expect(temEntrada({ parcelas: 4 })).toBe(false);
  });

  it('parcela única não é entrada — não há "demais" para diferir', () => {
    expect(temEntrada({ valor_entrada: 500, parcelas: 1 })).toBe(false);
  });

  it('entrada zerada não conta', () => {
    expect(temEntrada({ valor_entrada: 0, parcelas: 4 })).toBe(false);
  });
});

describe('totalComEntrada', () => {
  it('soma entrada + demais × (N−1)', () => {
    expect(totalComEntrada(500, 200, 4)).toBe(1100);
  });

  it('parcela única: o total é a própria entrada', () => {
    expect(totalComEntrada(500, 200, 1)).toBe(500);
  });

  it('centavos não acumulam erro de float', () => {
    // 0.1 + 0.2 × 3 dá 0.7000000000000001 somando em float.
    expect(totalComEntrada(0.1, 0.2, 4)).toBe(0.7);
    expect(totalComEntrada(333.33, 111.11, 3)).toBe(555.55);
  });
});

describe('calcularParcelasComEntrada', () => {
  it('primeira é a entrada, as outras são iguais', () => {
    expect(calcularParcelasComEntrada(500, 200, 4)).toEqual([500, 200, 200, 200]);
  });

  it('a soma bate com totalComEntrada', () => {
    const p = calcularParcelasComEntrada(1234.56, 78.9, 5);
    const soma = Math.round(p.reduce((a, b) => a + b, 0) * 100);
    expect(soma).toBe(Math.round(totalComEntrada(1234.56, 78.9, 5) * 100));
  });

  it('N = 1 devolve só a entrada', () => {
    expect(calcularParcelasComEntrada(500, 200, 1)).toEqual([500]);
  });

  it('N = 0 devolve vazio', () => {
    expect(calcularParcelasComEntrada(500, 200, 0)).toEqual([]);
  });
});

describe('valorDemaisParcelas', () => {
  it('volta o valor das demais a partir do que foi gravado', () => {
    const total = totalComEntrada(500, 200, 4);
    expect(valorDemaisParcelas({ valor_total: total, valor_entrada: 500, parcelas: 4 })).toBe(200);
  });

  it('ida e volta preserva o valor em casos com centavo quebrado', () => {
    for (const [entrada, demais, n] of [[500, 183.33, 4], [1000, 77.77, 7], [0.01, 0.02, 3]] as const) {
      const total = totalComEntrada(entrada, demais, n);
      expect(valorDemaisParcelas({ valor_total: total, valor_entrada: entrada, parcelas: n })).toBe(demais);
    }
  });

  it('acordo sem entrada devolve null — quem chama cai no valor da parcela atual', () => {
    expect(valorDemaisParcelas({ valor_total: 1100, valor_entrada: null, parcelas: 4 })).toBeNull();
  });

  it('sem valor_total não dá para derivar', () => {
    expect(valorDemaisParcelas({ valor_total: null, valor_entrada: 500, parcelas: 4 })).toBeNull();
  });

  it('entrada cobrindo o total inteiro devolve null em vez de zero ou negativo', () => {
    expect(valorDemaisParcelas({ valor_total: 500, valor_entrada: 500, parcelas: 4 })).toBeNull();
    expect(valorDemaisParcelas({ valor_total: 400, valor_entrada: 500, parcelas: 4 })).toBeNull();
  });
});
