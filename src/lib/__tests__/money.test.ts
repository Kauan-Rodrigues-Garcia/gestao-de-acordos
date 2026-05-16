import { describe, it, expect } from 'vitest';
import { calcularParcelas, foiUsadoQuarentaPct, parseBRL } from '../money';

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
