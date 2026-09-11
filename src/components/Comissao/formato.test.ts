/**
 * formato.test.ts — percentual como a tela escreve e como a pessoa digita.
 */
import { describe, it, expect } from 'vitest';
import { formatarPct, lerPct, paraCampo } from './formato';

describe('formatarPct', () => {
  it('vírgula decimal e duas casas no mínimo', () => {
    expect(formatarPct(2.11)).toBe('2,11%');
    expect(formatarPct(2)).toBe('2,00%');
  });

  it('esconde o ruído de ponto flutuante do multiplicador', () => {
    expect(formatarPct(2 * 1.12)).toBe('2,24%');
  });

  it('mostra até três casas quando o percentual tem', () => {
    expect(formatarPct(4.035)).toBe('4,035%');
  });

  it('sem percentual vira travessão', () => {
    expect(formatarPct(null)).toBe('—');
  });
});

describe('lerPct', () => {
  it('aceita vírgula ou ponto', () => {
    expect(lerPct('2,11')).toBe(2.11);
    expect(lerPct('2.11')).toBe(2.11);
  });

  it('ignora espaços e o símbolo de percentual', () => {
    expect(lerPct(' 1,5% ')).toBe(1.5);
  });

  it('zero é um percentual válido', () => {
    expect(lerPct('0')).toBe(0);
  });

  it('vazio, texto e negativo não são percentual', () => {
    expect(lerPct('')).toBeNull();
    expect(lerPct('abc')).toBeNull();
    expect(lerPct('-1')).toBeNull();
  });
});

describe('paraCampo', () => {
  it('escreve o número como a pessoa digitaria', () => {
    expect(paraCampo(2.11)).toBe('2,11');
    expect(paraCampo(2)).toBe('2');
    expect(paraCampo(null)).toBe('');
  });
});
