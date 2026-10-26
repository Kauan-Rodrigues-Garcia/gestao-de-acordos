/**
 * NR e Código só com números (26/10/2026). Os exemplos são os achados na
 * conferência do banco de 26/10.
 */
import { describe, expect, it } from 'vitest';
import { ehSoNumeros, gruposDeNumeros, soNumeros } from '../soNumeros';

describe('soNumeros', () => {
  it('tira a sujeira em volta do NR', () => {
    expect(soNumeros('12748027_')).toBe('12748027');
    expect(soNumeros(': 12823879')).toBe('12823879');
    expect(soNumeros('*12813340*')).toBe('12813340');
    expect(soNumeros('1867804 .')).toBe('1867804');
  });

  it('nome não vira número', () => {
    expect(soNumeros('LARISSA TAYNA BARRIOS DOS SANTOS')).toBe('');
  });
});

describe('ehSoNumeros', () => {
  it('aceita só dígito, sem vazio', () => {
    expect(ehSoNumeros('12748027')).toBe(true);
    expect(ehSoNumeros(' 12748027 ')).toBe(true);
    expect(ehSoNumeros('')).toBe(false);
    expect(ehSoNumeros('12748027_')).toBe(false);
    expect(ehSoNumeros('R$ 297,75')).toBe(false);
  });
});

describe('gruposDeNumeros', () => {
  it('um número dá para aproveitar; mais de um, não', () => {
    expect(gruposDeNumeros('NR: 12823879')).toBe(1);
    expect(gruposDeNumeros('12991505 Valor: R$ 140,00')).toBe(3);
    expect(gruposDeNumeros('(79)99860-9316')).toBe(3);
    expect(gruposDeNumeros('SDFAFDEFWAE')).toBe(0);
  });
});
