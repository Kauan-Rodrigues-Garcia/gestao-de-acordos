import { describe, it, expect, beforeEach } from 'vitest';
import { chaveAlvoProjecao, gravarAlvoProjecao, lerAlvoProjecao } from './alvoProjecao';

describe('alvoProjecao', () => {
  beforeEach(() => localStorage.clear());

  it('sem escolha gravada vale a 1ª meta', () => {
    expect(lerAlvoProjecao('u1')).toBe(1);
  });

  it('lembra a meta escolhida e volta ao padrão apagando a chave', () => {
    gravarAlvoProjecao('u1', 3);
    expect(lerAlvoProjecao('u1')).toBe(3);

    gravarAlvoProjecao('u1', 1);
    expect(lerAlvoProjecao('u1')).toBe(1);
    expect(localStorage.getItem(chaveAlvoProjecao('u1'))).toBeNull();
  });

  it('a escolha é por pessoa: quem divide o computador não herda', () => {
    gravarAlvoProjecao('u1', 4);
    expect(lerAlvoProjecao('u2')).toBe(1);
  });

  it('valor estranho ou fora de 1..4 na chave vira 1ª meta', () => {
    for (const cru of ['qualquer', '0', '5', '2.5', '']) {
      localStorage.setItem(chaveAlvoProjecao('u1'), cru);
      expect(lerAlvoProjecao('u1')).toBe(1);
    }
  });
});
