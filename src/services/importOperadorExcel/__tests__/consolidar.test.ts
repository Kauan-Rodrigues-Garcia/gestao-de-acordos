import { describe, it, expect } from 'vitest';
import { paraEscala5, somarEscala5, arredondarHalfUp, arredondar2HalfUp } from '../consolidar';

describe('paraEscala5 (escala interna 10)', () => {
  it('lê ponto e vírgula decimal', () => {
    expect(paraEscala5('128.55715')).toBe(1285571500000n);
    expect(paraEscala5('128,55715')).toBe(1285571500000n);
  });
  it('ignora milhar e símbolo R$', () => {
    expect(paraEscala5(' R$ 1.234,50 ')).toBe(12345000000000n);
    expect(paraEscala5('1,234.5')).toBe(12345000000000n);
  });
  it('arredonda (half-up) na 11ª casa — remove ruído de float', () => {
    expect(paraEscala5('3.1500499999999998')).toBe(31500500000n); // → 3.15005
    expect(paraEscala5('0.00000000004')).toBe(0n);
  });
  it('lança em valor não numérico', () => {
    expect(() => paraEscala5('abc')).toThrow();
    expect(() => paraEscala5('')).toThrow();
  });
});

describe('somar + arredondar', () => {
  it('soma com precisão total (sem float)', () => {
    expect(arredondarHalfUp(somarEscala5(['128.55715', '333.4995', '81.03855']), 5)).toBe('543.09520');
  });
  it('0.1 + 0.2 exato', () => {
    expect(arredondarHalfUp(somarEscala5(['0.1', '0.2']), 5)).toBe('0.30000');
  });
});

describe('arredondar2HalfUp', () => {
  it('meio sempre sobe', () => {
    expect(arredondar2HalfUp(paraEscala5('0.125'))).toBe('0.13');
    expect(arredondar2HalfUp(paraEscala5('0.135'))).toBe('0.14');
    expect(arredondar2HalfUp(paraEscala5('2.005'))).toBe('2.01');
  });
  it('abaixo do meio desce', () => {
    expect(arredondar2HalfUp(paraEscala5('0.124'))).toBe('0.12');
    expect(arredondar2HalfUp(paraEscala5('0.12499'))).toBe('0.12');
  });
  it('total bruto isolado 543.0952 → 543.10 (≠ soma por operador 543.12)', () => {
    expect(arredondar2HalfUp(paraEscala5('543.0952'))).toBe('543.10');
  });
});
