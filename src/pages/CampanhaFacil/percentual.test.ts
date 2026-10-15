import { describe, expect, it } from 'vitest';
import { lerPercentual, textoAceito, textoDoPercentual } from './percentual';

describe('lerPercentual', () => {
  it('aceita vírgula, ponto e o % junto', () => {
    expect(lerPercentual('12,5')).toBe(12.5);
    expect(lerPercentual('12.5')).toBe(12.5);
    expect(lerPercentual('7 %')).toBe(7);
  });

  it('número pela metade já vale (a vírgula não some no meio da digitação)', () => {
    expect(lerPercentual('12,')).toBe(12);
  });

  it('o que ainda não é número devolve null, não 0', () => {
    expect(lerPercentual('')).toBeNull();
    expect(lerPercentual(',')).toBeNull();
    expect(lerPercentual('abc')).toBeNull();
  });

  it('fica entre 0 e 100, com duas casas', () => {
    expect(lerPercentual('150')).toBe(100);
    expect(lerPercentual('3,14159')).toBe(3.14);
  });
});

describe('textoDoPercentual', () => {
  it('escreve com vírgula', () => {
    expect(textoDoPercentual(12.5)).toBe('12,5');
    expect(textoDoPercentual(7)).toBe('7');
  });
});

describe('textoAceito', () => {
  it('deixa digitar número com uma vírgula e recusa letras', () => {
    expect(textoAceito('')).toBe(true);
    expect(textoAceito('12,')).toBe(true);
    expect(textoAceito('12,5%')).toBe(true);
    expect(textoAceito('12,5,1')).toBe(false);
    expect(textoAceito('1a')).toBe(false);
  });
});
