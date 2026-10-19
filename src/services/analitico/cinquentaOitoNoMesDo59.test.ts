/**
 * O 58 num mês que já é do 59 (19/10/2026).
 *
 * A sincronização do 59 só preserva, das linhas do 58, as de HOJE e de ONTEM
 * cujo NR+dia ela ainda não trouxe (20260928200000). Gravar o resto era
 * trabalho jogado fora e criava linha que a reconciliação zerava: no Play 1, em
 * 19/10, 94 inseridas e 64 zeradas na hora, com ~4.700 linhas relidas.
 *
 * Fixa a regra do recorte e o dia de referência em São Paulo.
 */
import { describe, expect, it } from 'vitest';
import { linhasDo58NoMesDo59, diaLocalSP } from './analitico.service';

const l = (codigo: string, data: string, mes = '2026-10-01') =>
  ({ codigo, data_pagamento: data, mes_referencia: mes });

const OUT = new Set(['2026-10-01']);
const ONTEM = '2026-10-18';

describe('linhasDo58NoMesDo59', () => {
  it('mês do 59: fica só ontem em diante', () => {
    const r = linhasDo58NoMesDo59(
      [l('1', '2026-10-01'), l('2', '2026-10-17'), l('3', '2026-10-18'), l('4', '2026-10-19')],
      OUT, ONTEM, new Set(),
    );
    expect(r.map(x => x.codigo)).toEqual(['3', '4']);
  });

  it('mês do 59: NR+dia que o 59 já tem não entra', () => {
    const r = linhasDo58NoMesDo59(
      [l('10', '2026-10-19'), l('11', '2026-10-19'), l('10', '2026-10-18')],
      OUT, ONTEM, new Set(['10::2026-10-19']),
    );
    // O mesmo NR em OUTRO dia continua: a chave é NR+dia, como na sincronização.
    expect(r).toEqual([l('11', '2026-10-19'), l('10', '2026-10-18')]);
  });

  it('mês do 58 (ex.: setembro fechado no mesmo arquivo) entra inteiro', () => {
    const set = l('9', '2026-09-03', '2026-09-01');
    expect(linhasDo58NoMesDo59([set], OUT, ONTEM, new Set(['9::2026-09-03']))).toEqual([set]);
  });

  it('sem mês do 59, nada muda', () => {
    const linhas = [l('1', '2026-10-01'), l('2', '2026-10-19')];
    expect(linhasDo58NoMesDo59(linhas, new Set(), ONTEM, new Set())).toEqual(linhas);
  });
});

describe('diaLocalSP', () => {
  it('usa o dia de São Paulo, não o UTC', () => {
    // 02:30 UTC de 20/10 ainda é 23:30 de 19/10 em São Paulo.
    const agora = new Date('2026-10-20T02:30:00Z');
    expect(diaLocalSP(0, agora)).toBe('2026-10-19');
    expect(diaLocalSP(-1, agora)).toBe('2026-10-18');
  });

  it('atravessa a virada do mês', () => {
    expect(diaLocalSP(-1, new Date('2026-11-01T15:00:00Z'))).toBe('2026-10-31');
  });
});
