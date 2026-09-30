import { describe, it, expect } from 'vitest';
import { posicaoNoRanking } from './posicaoNoRanking';

const r = (id: string, v: number) => ({ operador_id: id, total_recebido: v });

describe('posicaoNoRanking', () => {
  it('posição, total e quanto falta para o de cima', () => {
    expect(posicaoNoRanking([r('a', 500), r('b', 800), r('c', 300)], new Set(), 'a'))
      .toEqual({ posicao: 2, de: 3, faltam: 300 });
  });
  it('primeiro lugar não tem «faltam»', () => {
    expect(posicaoNoRanking([r('a', 900), r('b', 800)], new Set(), 'a'))
      .toEqual({ posicao: 1, de: 2, faltam: null });
  });
  it('férias e desligado saem da conta', () => {
    expect(posicaoNoRanking([r('a', 500), r('b', 800), r('c', 700)], new Set(['b']), 'a'))
      .toEqual({ posicao: 2, de: 2, faltam: 200 });
  });
  it('quem não está no ranking recebe null', () => {
    expect(posicaoNoRanking([r('b', 800)], new Set(), 'a')).toBeNull();
  });
  it('não reordena a lista de quem chamou', () => {
    const lista = [r('a', 1), r('b', 2)];
    posicaoNoRanking(lista, new Set(), 'a');
    expect(lista.map(x => x.operador_id)).toEqual(['a', 'b']);
  });
});
