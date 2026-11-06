import { describe, expect, it } from 'vitest';
import { ALCANCE_DA_FRATURA, RAIOS_DA_FRATURA, fratura, texturaDoGelo } from './rachaduras';

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

  it('a fratura sai do ponto do impacto, com raios e galhos, e é pequena', () => {
    const t = fratura(40, 42);
    expect(t.filter(x => !x.fina).length).toBe(RAIOS_DA_FRATURA);
    expect(t.filter(x => x.fina).length).toBeGreaterThan(8);
    for (const x of t.filter(x => !x.fina)) expect(pontos(x.d)[0]).toEqual([40, 42]);
    // Raio mais um galho, com folga do passo: nada passa de ~1/3 do bloco.
    for (const x of t) for (const [px, py] of pontos(x.d)) expect(Math.hypot(px - 40, py - 42)).toBeLessThan(ALCANCE_DA_FRATURA + 9);
  });

  it('aparece aos poucos: o anel, os raios um depois do outro, e os galhos depois do raio deles', () => {
    const t = fratura(40, 42);
    const raios = t.filter(x => !x.fina).map(x => x.atraso);
    expect(raios).toEqual([...raios].sort((a, b) => a - b));
    expect(Math.max(...raios) - Math.min(...raios)).toBeGreaterThan(0.2);
    // Tudo começa antes de 0,7 s: com 0,3 s de traço, termina antes de a música entrar (1 s).
    expect(t.every(x => x.atraso >= 0 && x.atraso <= 0.7)).toBe(true);
  });
});
