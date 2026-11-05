import { describe, expect, it } from 'vitest';
import { fratura, texturaDoGelo } from './rachaduras';

/** Os pontos de um caminho «M x y L x y…». */
const pontos = (d: string) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);

describe('as rachaduras do gelo', () => {
  it('são sempre as mesmas (não mudam a cada desenho)', () => {
    expect(texturaDoGelo()).toEqual(texturaDoGelo());
    expect(fratura(40, 42)).toEqual(fratura(40, 42));
  });

  it('a textura tem muitos veios finos, e curtos', () => {
    const { fortes, finas } = texturaDoGelo();
    expect((fortes.match(/M/g) ?? []).length).toBe(9);
    expect((finas.match(/M/g) ?? []).length).toBeGreaterThan(30);
  });

  it('a fratura sai do ponto do impacto, com raios e galhos, e não vai longe demais', () => {
    const t = fratura(40, 42);
    expect(t.filter(x => !x.fina).length).toBe(11);
    expect(t.filter(x => x.fina).length).toBeGreaterThan(12);
    for (const x of t.filter(x => !x.fina)) expect(pontos(x.d)[0]).toEqual([40, 42]);
    for (const x of t) for (const [px, py] of pontos(x.d)) expect(Math.hypot(px - 40, py - 42)).toBeLessThan(60);
  });

  it('o mais perto do centro racha primeiro', () => {
    const t = fratura(40, 42);
    const raios = t.filter(x => !x.fina).map(x => x.atraso);
    expect(Math.max(...raios)).toBeLessThan(0.15);
    expect(t.every(x => x.atraso >= 0 && x.atraso <= 0.75)).toBe(true);
  });
});
