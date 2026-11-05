import { describe, expect, it } from 'vitest';
import { EPOCA } from '../musica';
import {
  DURACAO_VISITA_S, FISGOU_S, JANELA_MS, PESCANDO_S, SAINDO_S, VISITA_A_CADA, oUrsoAgora, visitaDaJanela,
} from './urso';

describe('as visitas do urso', () => {
  it('são raras: perto de uma janela em cada VISITA_A_CADA', () => {
    const n = 4000;
    let com = 0;
    for (let j = 0; j < n; j++) if (visitaDaJanela(j) !== null) com++;
    expect(com / n).toBeGreaterThan(1 / VISITA_A_CADA - 0.04);
    expect(com / n).toBeLessThan(1 / VISITA_A_CADA + 0.04);
  });

  it('cabem inteiras dentro da janela delas', () => {
    for (let j = 0; j < 500; j++) {
      const inicio = visitaDaJanela(j);
      if (inicio === null) continue;
      expect(inicio).toBeGreaterThanOrEqual(EPOCA + j * JANELA_MS);
      expect(inicio + DURACAO_VISITA_S * 1000).toBeLessThanOrEqual(EPOCA + (j + 1) * JANELA_MS);
    }
  });

  it('seguem a ordem: sai, pesca, fisga, entra — e fora disso ele está dentro', () => {
    let j = 0;
    while (visitaDaJanela(j) === null) j++;
    const inicio = visitaDaJanela(j)!;
    expect(oUrsoAgora(inicio - 1000).fase).toBe('dentro');
    expect(oUrsoAgora(inicio + 1000).fase).toBe('saindo');
    expect(oUrsoAgora(inicio + (SAINDO_S + 10) * 1000).fase).toBe('pescando');
    expect(oUrsoAgora(inicio + (SAINDO_S + PESCANDO_S + 1) * 1000).fase).toBe('fisgou');
    expect(oUrsoAgora(inicio + (SAINDO_S + PESCANDO_S + FISGOU_S + 1) * 1000).fase).toBe('entrando');
    expect(oUrsoAgora(inicio + (DURACAO_VISITA_S + 1) * 1000).fase).toBe('dentro');
  });

  it('é igual para todo mundo (o mesmo instante dá a mesma fase)', () => {
    const t = EPOCA + 123_456_789;
    expect(oUrsoAgora(t)).toEqual(oUrsoAgora(t));
  });
});
