/**
 * A paleta do relatório é uma CÓPIA da do app, e este teste é o contrato que
 * impede as duas de divergirem em silêncio. Se `lib/diasUteis` mudar uma cor,
 * aqui quebra e alguém decide conscientemente.
 */

import { describe, it, expect } from 'vitest';
import { COR_QUARTIL as COR_APP, corProjecao } from '@/lib/diasUteis';
import { COR_QUARTIL, corDaProjecao, corDaVariacao, COR_NEUTRA } from './paleta';

describe('paleta do relatório × paleta do app', () => {
  it('as cores de quartil são as mesmas', () => {
    expect(COR_QUARTIL).toEqual(COR_APP);
  });

  it('a cor de projeção concorda com a do app em toda faixa', () => {
    for (const pctValor of [0, 25, 49, 50, 79, 80, 99, 100, 150, 999]) {
      expect(corDaProjecao(pctValor), `pct ${pctValor}`).toBe(corProjecao(pctValor));
    }
  });
});

describe('corDaProjecao', () => {
  it('sem meta é cinza, não vermelho — ausência de alvo não é desempenho ruim', () => {
    expect(corDaProjecao(null)).toBe(COR_NEUTRA);
    expect(corDaProjecao(undefined)).toBe(COR_NEUTRA);
  });

  it('zero por cento é vermelho, e é diferente de "sem meta"', () => {
    expect(corDaProjecao(0)).toBe(COR_QUARTIL[4]);
    expect(corDaProjecao(0)).not.toBe(corDaProjecao(null));
  });
});

describe('corDaVariacao', () => {
  it('positivo verde, negativo vermelho, zero conta como positivo', () => {
    expect(corDaVariacao(10)).toBe(COR_QUARTIL[1]);
    expect(corDaVariacao(0)).toBe(COR_QUARTIL[1]);
    expect(corDaVariacao(-1)).toBe(COR_QUARTIL[4]);
  });
});
