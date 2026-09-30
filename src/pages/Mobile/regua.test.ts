import { describe, it, expect } from 'vitest';
import { escalaDaRegua, rotuloDoDia } from './regua';

describe('escalaDaRegua', () => {
  it('o preenchimento é a % do caminho, com as faixas na ordem', () => {
    const e = escalaDaRegua(38_420.5, [34_000, 37_000, 40_000, 43_000]);
    const marcos = e.marcos.map(m => m.pct);
    expect(marcos[3]).toBeLessThan(100);
    expect(e.cheio).toBeGreaterThan(marcos[1]);
    expect(e.cheio).toBeLessThan(marcos[2]);
  });
  /** O defeito de 30/09/2026: abaixo da 1ª meta a barra não aparecia. */
  it('abaixo da 1ª meta a barra já mostra o quanto foi feito', () => {
    const e = escalaDaRegua(20_000, [34_000, 37_000, 40_000, 43_000]);
    expect(e.cheio).toBeCloseTo((20_000 / (43_000 * 1.04)) * 100, 5);
    expect(e.cheio).toBeGreaterThan(40);
  });
  it('recebido acima da última faixa enche quase tudo, sem passar de 100', () => {
    const e = escalaDaRegua(60_000, [34_000, 37_000]);
    expect(e.cheio).toBeLessThanOrEqual(100);
    expect(e.cheio).toBeGreaterThan(e.marcos[1].pct);
  });
  it('começo do mês: barra vazia, sem valor negativo', () => {
    expect(escalaDaRegua(0, [34_000]).cheio).toBe(0);
  });
  it('uma faixa só funciona', () => {
    const e = escalaDaRegua(10_000, [34_000]);
    expect(e.marcos).toHaveLength(1);
    expect(e.marcos[0].pct).toBeGreaterThan(0);
    expect(e.marcos[0].pct).toBeLessThan(100);
  });
  it('sem faixa: tudo vazio', () => {
    expect(escalaDaRegua(5_000, [])).toEqual({ cheio: 0, marcos: [] });
  });
});

describe('rotuloDoDia', () => {
  it('hoje, ontem e data curta', () => {
    expect(rotuloDoDia('2026-09-30', '2026-09-30')).toBe('Hoje');
    expect(rotuloDoDia('2026-09-29', '2026-09-30')).toBe('Ontem');
    expect(rotuloDoDia('2026-09-01', '2026-09-30')).toBe('01/09');
  });
  it('ontem atravessando o mês', () => {
    expect(rotuloDoDia('2026-09-30', '2026-10-01')).toBe('Ontem');
  });
});
