import { describe, it, expect } from 'vitest';
import { calcularParcelas, foiUsadoQuarentaPct } from '../money';

describe('calcularParcelas', () => {
  it('divide igualmente quando divisão é exata', () => {
    const result = calcularParcelas(300, 3, false);
    expect(result).toHaveLength(3);
    expect(result).toEqual([100, 100, 100]);
  });

  it('ajuste de centavos vai para a parcela 0', () => {
    // R$100 / 3 = 33.33... → parcela[0] = 33.34, demais = 33.33
    const result = calcularParcelas(100, 3, false);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeCloseTo(33.34, 2);
    expect(result[1]).toBeCloseTo(33.33, 2);
    expect(result[2]).toBeCloseTo(33.33, 2);
    const soma = result.reduce((a, b) => a + b, 0);
    expect(Math.round(soma * 100)).toBe(10000);
  });

  it('40% exato quando divisão é limpa', () => {
    // R$1000 / 4 parcelas com 40%: parcela[0] = 400, demais = 200 cada
    const result = calcularParcelas(1000, 4, true);
    expect(result[0]).toBeCloseTo(400, 2);
    expect(result[1]).toBeCloseTo(200, 2);
    expect(result[2]).toBeCloseTo(200, 2);
    expect(result[3]).toBeCloseTo(200, 2);
  });

  it('40% com centavo de sobra vai para parcela 0', () => {
    // R$100 / 3: 40% = 40.00, restante = 60.00 / 2 = 30.00 cada
    const result = calcularParcelas(100, 3, true);
    expect(result[0]).toBeCloseTo(40, 2);
    expect(result[1]).toBeCloseTo(30, 2);
    expect(result[2]).toBeCloseTo(30, 2);
    const soma = result.reduce((a, b) => a + b, 0);
    expect(Math.round(soma * 100)).toBe(10000);
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
