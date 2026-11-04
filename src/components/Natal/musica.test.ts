import { describe, expect, it } from 'vitest';
import { EPOCA, FIM_S, INICIO_S, PERIODO, SOBREPOSICAO, oQueSoa, posicaoNaRadio, volumeDoElemento } from './musica';

const em = (segundos: number) => EPOCA + segundos * 1000;

describe('a rádio do Natal', () => {
  it('começa do começo na época', () => {
    expect(posicaoNaRadio(EPOCA)).toEqual({ volta: 0, fase: 0 });
  });

  it('conta as voltas pelo período, não pela duração do arquivo', () => {
    const { volta, fase } = posicaoNaRadio(em(PERIODO * 3 + 10));
    expect(volta).toBe(3);
    expect(fase).toBeCloseTo(10, 6);
  });

  it('antes da época a volta é negativa, mas a fase continua de 0 ao período', () => {
    const { volta, fase } = posicaoNaRadio(em(-5));
    expect(volta).toBe(-1);
    expect(fase).toBeCloseTo(PERIODO - 5, 6);
  });

  it('o mesmo instante dá o mesmo ponto para qualquer um', () => {
    const instante = Date.UTC(2026, 11, 15, 14, 37, 12, 345);
    expect(oQueSoa(instante)).toEqual(oQueSoa(instante));
  });

  it('no meio da volta, só ela soa', () => {
    const soando = oQueSoa(em(PERIODO * 2 + 30));
    expect(soando).toHaveLength(1);
    expect(soando[0].volta).toBe(2);
    expect(soando[0].tempo).toBeCloseTo(INICIO_S + 30, 6);
  });

  it('no começo da volta, o fim da anterior ainda soa por cima (a emenda)', () => {
    const soando = oQueSoa(em(PERIODO * 2 + 1));
    expect(soando.map(s => s.volta)).toEqual([2, 1]);
    // A anterior está dentro do fade-out, antes do fim do som do arquivo.
    expect(soando[1].tempo).toBeCloseTo(INICIO_S + PERIODO + 1, 6);
    expect(soando[1].tempo).toBeLessThan(FIM_S);
  });

  it('a emenda dura exatamente a sobreposição', () => {
    expect(oQueSoa(em(PERIODO + SOBREPOSICAO - 0.01))).toHaveLength(2);
    expect(oQueSoa(em(PERIODO + SOBREPOSICAO + 0.01))).toHaveLength(1);
  });

  it('volume: zero é mudo, cem é cheio, e o meio é mais baixo que a metade', () => {
    expect(volumeDoElemento(0)).toBe(0);
    expect(volumeDoElemento(100)).toBe(1);
    expect(volumeDoElemento(50)).toBeLessThan(0.5);
    expect(volumeDoElemento(150)).toBe(1);
  });
});
