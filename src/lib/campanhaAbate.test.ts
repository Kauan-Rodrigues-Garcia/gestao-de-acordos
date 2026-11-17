import { describe, it, expect } from 'vitest';
import { totalAbatido, pctAbatido } from './campanhaAbate';

describe('campanhaAbate — «Não deu» sai do total', () => {
  it('100 contatos, 90 enviadas, 10 não deu = 90 de 90, 100%', () => {
    expect(totalAbatido(100, 10)).toBe(90);
    expect(pctAbatido(90, 100, 10)).toBe(100);
  });

  it('sem «Não deu» nada muda', () => {
    expect(totalAbatido(100, 0)).toBe(100);
    expect(pctAbatido(45, 100, 0)).toBe(45);
  });

  it('meio do caminho conta sobre o abatido', () => {
    expect(pctAbatido(40, 100, 20)).toBe(50);
  });

  it('todos «Não deu» = concluída; campanha vazia = 0', () => {
    expect(pctAbatido(0, 5, 5)).toBe(100);
    expect(pctAbatido(0, 0, 0)).toBe(0);
  });

  it('nunca passa de 100 nem fica negativo', () => {
    expect(pctAbatido(10, 5, 3)).toBe(100);
    expect(totalAbatido(3, 10)).toBe(0);
  });

  it('aceita arredondamento para baixo (placar do dia usa floor)', () => {
    expect(pctAbatido(996, 1000, 0, Math.floor)).toBe(99);
  });
});
