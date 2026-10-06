import { describe, expect, it } from 'vitest';
import { faltaParaPassar } from './regras';

describe('quanto falta para passar quem está acima', () => {
  it('é a diferença mais um centavo', () => {
    expect(faltaParaPassar(26960.04, 23604)).toBeCloseTo(3356.05, 2);
  });

  it('empatado no valor: um centavo (empate não passa)', () => {
    expect(faltaParaPassar(1000, 1000)).toBe(0.01);
  });

  it('não sai negativo nem com centavos quebrados', () => {
    expect(faltaParaPassar(10.1, 10.3)).toBe(0.01);
    expect(faltaParaPassar(0.3, 0.1)).toBeCloseTo(0.21, 2);
  });
});
