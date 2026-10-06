import { describe, expect, it } from 'vitest';
import { ritmoDoConjunto } from './ritmo';

// Outubro/2026, feriado 12/10: 21 dias úteis; até 16/10 (contando hoje), 11.
const base = { mes: '2026-10', hojeISO: '2026-10-16', feriados: ['2026-10-12'], contarHoje: true };

describe('ritmoDoConjunto — a conta do Painel Líder', () => {
  it('esperado = meta ÷ dias úteis × decorridos; fecha pelo ritmo', () => {
    const r = ritmoDoConjunto({ ...base, recebido: 234_032, meta: 420_000 })!;
    expect(r.esperado).toBeCloseTo((420_000 / 21) * 11, 2);
    expect(r.pctRitmo).toBeCloseTo(234_032 / ((420_000 / 21) * 11) * 100, 6);
    expect(r.fecha).toBeCloseTo((234_032 / 11) * 21, 2);
    expect(r.falta).toBeCloseTo(420_000 - 234_032, 2);
  });
  it('sem meta, sem ritmo', () => {
    expect(ritmoDoConjunto({ ...base, recebido: 10, meta: null })).toBeNull();
    expect(ritmoDoConjunto({ ...base, recebido: 10, meta: 0 })).toBeNull();
  });
  it('mês que já fechou conta todos os dias úteis', () => {
    const r = ritmoDoConjunto({ ...base, mes: '2026-09', hojeISO: '2026-10-06', feriados: [], recebido: 100, meta: 100 })!;
    expect(r.esperado).toBeCloseTo(100, 6);
    expect(r.falta).toBe(0);
  });
});
