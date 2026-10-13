import { describe, expect, it } from 'vitest';
import { alvoDoDia, rotuloDoProximoDia } from './alvoDoDia';
import { ritmoDoConjunto } from './ritmo';

// Outubro/2026, feriado 12/10 (segunda): 21 dias úteis, meta diária 1.000.
const FERIADOS = ['2026-10-12'];

describe('alvoDoDia — onde tem que estar hoje e no próximo dia útil', () => {
  it('amanhã é o esperado + uma meta diária', () => {
    const a = alvoDoDia({ recebido: 10_500, esperado: 11_000, metaDiaria: 1_000, hojeISO: '2026-10-14', feriados: FERIADOS })!;
    expect(a.hoje).toBe(11_000);
    expect(a.diferencaHoje).toBe(-500);
    expect(a.amanha).toEqual({ alvo: 12_000, falta: 1_500, data: '2026-10-15', rotulo: 'amanhã' });
  });

  it('quem já passou do alvo de amanhã não tem falta', () => {
    const a = alvoDoDia({ recebido: 13_000, esperado: 11_000, metaDiaria: 1_000, hojeISO: '2026-10-14', feriados: FERIADOS })!;
    expect(a.diferencaHoje).toBe(2_000);
    expect(a.amanha?.falta).toBe(0);
  });

  it('sexta: o próximo dia útil é segunda, com o nome do dia', () => {
    const a = alvoDoDia({ recebido: 0, esperado: 1_000, metaDiaria: 1_000, hojeISO: '2026-10-16', feriados: FERIADOS })!;
    expect(a.amanha?.data).toBe('2026-10-19');
    expect(a.amanha?.rotulo).toBe('segunda, 19/10');
  });

  it('véspera de feriado pula o feriado', () => {
    const a = alvoDoDia({ recebido: 0, esperado: 1_000, metaDiaria: 1_000, hojeISO: '2026-10-09', feriados: FERIADOS })!;
    expect(a.amanha?.data).toBe('2026-10-13');
    expect(a.amanha?.rotulo).toBe('terça, 13/10');
  });

  it('no último dia útil do mês não há amanhã', () => {
    const a = alvoDoDia({ recebido: 0, esperado: 21_000, metaDiaria: 1_000, hojeISO: '2026-10-30', feriados: FERIADOS })!;
    expect(a.amanha).toBeNull();
  });

  it('sem meta diária, sem alvo', () => {
    expect(alvoDoDia({ recebido: 0, esperado: 0, metaDiaria: 0, hojeISO: '2026-10-14', feriados: [] })).toBeNull();
  });

  it('rótulo do próximo dia', () => {
    expect(rotuloDoProximoDia('2026-10-15', '2026-10-14')).toBe('amanhã');
    expect(rotuloDoProximoDia('2026-11-03', '2026-10-30')).toBe('terça, 03/11');
  });
});

describe('ritmoDoConjunto traz o alvo do dia', () => {
  it('com a meta diária do mês (meta ÷ dias úteis)', () => {
    const r = ritmoDoConjunto({
      recebido: 9_000, meta: 21_000, mes: '2026-10', hojeISO: '2026-10-14', feriados: FERIADOS, contarHoje: true,
    })!;
    // Até 14/10, contando hoje e sem o feriado: 9 dias úteis.
    expect(r.alvo?.hoje).toBeCloseTo(9_000, 6);
    expect(r.alvo?.amanha?.alvo).toBeCloseTo(10_000, 6);
    expect(r.alvo?.amanha?.falta).toBeCloseTo(1_000, 6);
  });

  it('mês que já fechou não tem alvo', () => {
    const r = ritmoDoConjunto({
      recebido: 100, meta: 100, mes: '2026-09', hojeISO: '2026-10-06', feriados: [], contarHoje: true,
    })!;
    expect(r.alvo).toBeNull();
  });
});
