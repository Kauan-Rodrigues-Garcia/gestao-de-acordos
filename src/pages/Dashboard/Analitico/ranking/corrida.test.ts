import { describe, it, expect } from 'vitest';
import { distancia, fracaoNaPista, maiorBase, nomeCurto, resumoDaCorrida, type Corredor } from './corrida';

const c = (id: string, base: number | null): Corredor => ({ id, nome: `Pessoa ${id}`, sub: null, base });

describe('pista', () => {
  it('a fração vai de 0 ao líder e não passa de 1', () => {
    expect(fracaoNaPista(50, 200)).toBe(0.25);
    expect(fracaoNaPista(300, 200)).toBe(1);
    expect(fracaoNaPista(null, 200)).toBe(0);
    expect(fracaoNaPista(10, 0)).toBe(0);
  });

  it('o maior ignora quem está sem régua', () => {
    expect(maiorBase([c('a', null), c('b', 80), c('c', 40)])).toBe(80);
  });
});

describe('distância', () => {
  it('é a diferença para quem está à frente, nunca negativa', () => {
    expect(distancia(c('a', 100), c('b', 60))).toBe(40);
    expect(distancia(c('a', 60), c('b', 60))).toBe(0);
  });

  it('sem régua de um dos lados não há distância', () => {
    expect(distancia(c('a', null), c('b', 60))).toBeNull();
    expect(distancia(c('a', 100), c('b', null))).toBeNull();
    expect(distancia(null, c('b', 60))).toBeNull();
  });
});

describe('a corrida de um corredor', () => {
  const lista = [c('a', 300), c('b', 200), c('c', 150)];

  it('no meio: alvo à frente e folga atrás', () => {
    expect(resumoDaCorrida(lista, 'b')).toEqual({
      posicao: 2, de: 3,
      alvo: { nome: 'Pessoa a', posicao: 1, falta: 100 },
      folga: { nome: 'Pessoa c', posicao: 3, valor: 50 },
    });
  });

  it('o líder não tem alvo; o último não tem folga', () => {
    expect(resumoDaCorrida(lista, 'a')?.alvo).toBeNull();
    expect(resumoDaCorrida(lista, 'c')?.folga).toBeNull();
  });

  it('fora da lista não há corrida', () => {
    expect(resumoDaCorrida(lista, 'z')).toBeNull();
  });
});

it('nome curto fica com os dois primeiros nomes', () => {
  expect(nomeCurto('  Ana Clara Ferreira Souza ')).toBe('Ana Clara');
  expect(nomeCurto('Bruno')).toBe('Bruno');
});
