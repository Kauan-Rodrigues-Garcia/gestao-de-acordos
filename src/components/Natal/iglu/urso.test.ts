import { describe, expect, it } from 'vitest';
import { EPOCA } from '../musica';
import {
  BELISCADA_S, CICLO_BELISCADA_S, DURACAO_VISITA_S, FISGOU_S, JANELA_MS, PESCANDO_S, SAINDO_S, VISITA_A_CADA,
  beliscada, oUrsoAgora, tremPassaPeloIglu, visitaDaJanela,
} from './urso';

describe('as visitas do urso', () => {
  it('acontecem em perto de uma janela em cada VISITA_A_CADA', () => {
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

describe('o urso pescando', () => {
  it('sai mais vezes: duas por hora (umas dezoito no expediente), 4 min pescando', () => {
    expect(JANELA_MS * VISITA_A_CADA).toBe(30 * 60_000);
    expect(PESCANDO_S).toBe(240);
  });

  it('de tempos em tempos um peixe belisca: dois ciclos em cada três, e cabe no ciclo', () => {
    let com = 0;
    const ciclos = 300;
    for (let k = 0; k < ciclos; k++) {
      let achou = false;
      for (let t = k * CICLO_BELISCADA_S; t < (k + 1) * CICLO_BELISCADA_S; t += 0.1) if (beliscada(t) !== null) achou = true;
      if (achou) com++;
    }
    expect(com / ciclos).toBeGreaterThan(0.55);
    expect(com / ciclos).toBeLessThan(0.78);
  });

  it('a beliscada vai de 0 a 1 e dura BELISCADA_S', () => {
    let t = 0;
    while (beliscada(t) === null) t += 0.05;
    const inicio = t;
    while (beliscada(t) !== null) { expect(beliscada(t)).toBeGreaterThanOrEqual(0); expect(beliscada(t)).toBeLessThan(1); t += 0.05; }
    expect(t - inicio).toBeCloseTo(BELISCADA_S, 0);
  });

  it('acena para o trem só quando ele passa pela ponta direita da pista do alto do Analítico', () => {
    const base = { fechado: null, aba: 'analitico', fase: 'ida', progresso: 0.4 };
    expect(tremPassaPeloIglu(base)).toBe(true);
    expect(tremPassaPeloIglu({ ...base, fase: 'volta' })).toBe(true);
    expect(tremPassaPeloIglu({ ...base, progresso: 0.1 })).toBe(false);
    expect(tremPassaPeloIglu({ ...base, progresso: 0.8 })).toBe(false);
    expect(tremPassaPeloIglu({ ...base, aba: 'acordos' })).toBe(false);
    expect(tremPassaPeloIglu({ ...base, fase: 'fim' })).toBe(false);
    expect(tremPassaPeloIglu({ ...base, fechado: { motivo: 'fechado' } })).toBe(false);
  });
});
