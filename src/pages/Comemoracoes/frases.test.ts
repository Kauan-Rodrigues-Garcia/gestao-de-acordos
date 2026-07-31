/**
 * frases.test.ts — o que sai no balão de parabéns.
 *
 * A frase é sorteada no cliente que clicou e GRAVADA na linha. Se o sorteio
 * devolver `undefined`, é isso que vai para o banco e aparece na tela de todo
 * mundo.
 */
import { describe, it, expect } from 'vitest';
import { sortearFrase, fraseValida, FRASES } from './frases';

describe('sortearFrase', () => {
  it('devolve sempre uma frase do catálogo', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(FRASES).toContain(sortearFrase());
    }
  });

  it('o sorteio cobre a lista inteira', () => {
    // Cada valor de `aleatorio` mapeia para uma frase distinta.
    const sorteadas = FRASES.map((_, i) => sortearFrase(() => i / FRASES.length));
    expect(new Set(sorteadas).size).toBe(FRASES.length);
  });

  it('aleatorio no piso devolve a primeira', () => {
    expect(sortearFrase(() => 0)).toBe(FRASES[0]);
  });

  it('aleatorio em 1 não estoura o fim do array', () => {
    // `Math.random()` nunca devolve 1, mas um mock pode — e `FRASES[10]` seria
    // `undefined` indo para o banco.
    expect(sortearFrase(() => 1)).toBe(FRASES[FRASES.length - 1]);
    expect(sortearFrase(() => 1.5)).toBe(FRASES[FRASES.length - 1]);
  });

  it('aleatorio negativo também não estoura', () => {
    expect(sortearFrase(() => -1)).toBe(FRASES[0]);
  });
});

describe('fraseValida', () => {
  it('preserva a frase que veio do banco', () => {
    expect(fraseValida('Que orgulho!')).toBe('Que orgulho!');
  });

  it('vazio, nulo ou só espaço vira uma frase de verdade', () => {
    // O balão precisa dizer alguma coisa; nome seguido de nada fica estranho.
    for (const entrada of ['', '   ', null, undefined]) {
      expect(fraseValida(entrada)).toBe(FRASES[0]);
    }
  });

  it('tira o espaço das bordas', () => {
    expect(fraseValida('  Arrasou!  ')).toBe('Arrasou!');
  });
});
