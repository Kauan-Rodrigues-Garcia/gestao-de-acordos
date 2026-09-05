// src/pages/Analitico/recorte.test.ts
import { describe, it, expect } from 'vitest';
import {
  mesDoRecorte, intervaloDoRecorte, trocarModo, somarDias,
  recorteDaQuery, queryDoRecorte, type Recorte,
} from './recorte';

const HOJE = '2026-09-05';

describe('mesDoRecorte', () => {
  it('devolve o mês do modo mes', () => {
    expect(mesDoRecorte({ modo: 'mes', mes: '2026-09' })).toBe('2026-09');
  });
  it('deriva o mês a partir do dia', () => {
    expect(mesDoRecorte({ modo: 'dia', dia: '2026-08-31' })).toBe('2026-08');
  });
  it('devolve o mês do período', () => {
    expect(mesDoRecorte({ modo: 'periodo', mes: '2026-07', inicio: '2026-07-03', fim: '2026-07-09' }))
      .toBe('2026-07');
  });
});

describe('intervaloDoRecorte', () => {
  it('mês vira o mês inteiro', () => {
    expect(intervaloDoRecorte({ modo: 'mes', mes: '2026-02' }))
      .toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  });
  it('dia vira um intervalo de um dia', () => {
    expect(intervaloDoRecorte({ modo: 'dia', dia: '2026-09-05' }))
      .toEqual({ inicio: '2026-09-05', fim: '2026-09-05' });
  });
  it('período devolve as próprias pontas', () => {
    expect(intervaloDoRecorte({ modo: 'periodo', mes: '2026-09', inicio: '2026-09-02', fim: '2026-09-04' }))
      .toEqual({ inicio: '2026-09-02', fim: '2026-09-04' });
  });
});

describe('somarDias', () => {
  it('atravessa a virada do mês', () => {
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01');
  });
  it('atravessa a virada do ano para trás', () => {
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('trocarModo', () => {
  it('mes → dia escolhe hoje quando hoje cai no mês em foco', () => {
    expect(trocarModo({ modo: 'mes', mes: '2026-09' }, 'dia', HOJE))
      .toEqual({ modo: 'dia', dia: '2026-09-05' });
  });
  it('mes → dia escolhe o último dia quando o mês já fechou', () => {
    expect(trocarModo({ modo: 'mes', mes: '2026-07' }, 'dia', HOJE))
      .toEqual({ modo: 'dia', dia: '2026-07-31' });
  });
  it('dia → mes mantém o mês daquele dia', () => {
    expect(trocarModo({ modo: 'dia', dia: '2026-07-14' }, 'mes', HOJE))
      .toEqual({ modo: 'mes', mes: '2026-07' });
  });
  it('mes → periodo abre com o mês inteiro selecionado', () => {
    expect(trocarModo({ modo: 'mes', mes: '2026-09' }, 'periodo', HOJE))
      .toEqual({ modo: 'periodo', mes: '2026-09', inicio: '2026-09-01', fim: '2026-09-30' });
  });
});

describe('query', () => {
  it('ida e volta preserva o recorte de dia', () => {
    const r: Recorte = { modo: 'dia', dia: '2026-09-05' };
    const params = new URLSearchParams(queryDoRecorte(r));
    expect(recorteDaQuery(params, HOJE)).toEqual(r);
  });
  it('aba=diario legado vira recorte de dia em hoje', () => {
    const params = new URLSearchParams({ aba: 'diario' });
    expect(recorteDaQuery(params, HOJE)).toEqual({ modo: 'dia', dia: HOJE });
  });
  it('query sem recorte devolve null', () => {
    expect(recorteDaQuery(new URLSearchParams({ aba: 'analitico' }), HOJE)).toBeNull();
  });
});
