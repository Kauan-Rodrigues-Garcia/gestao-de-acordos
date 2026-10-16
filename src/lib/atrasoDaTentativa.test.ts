import { describe, it, expect } from 'vitest';
import { atrasoDaTentativa } from './atrasoDaTentativa';

const OPCOES = { baseMs: 500, tetoMs: 8_000 };

describe('atrasoDaTentativa', () => {
  it('cresce exponencialmente e respeita o teto', () => {
    // Sorteio no máximo: o atraso é o exponencial cheio.
    const cheio = (t: number) => atrasoDaTentativa(t, OPCOES, () => 1);
    expect([1, 2, 3, 4, 5, 6, 7].map(cheio)).toEqual([500, 1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('nunca volta antes da metade do atraso', () => {
    expect(atrasoDaTentativa(3, OPCOES, () => 0)).toBe(1000);
  });

  it('duas pessoas na mesma tentativa esperam tempos diferentes', () => {
    const a = atrasoDaTentativa(4, OPCOES, () => 0.1);
    const b = atrasoDaTentativa(4, OPCOES, () => 0.9);
    expect(a).not.toBe(b);
    expect(a).toBeGreaterThanOrEqual(2000);
    expect(b).toBeLessThanOrEqual(4000);
  });
});
