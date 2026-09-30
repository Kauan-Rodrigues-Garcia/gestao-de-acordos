import { describe, it, expect } from 'vitest';
import { ehRotaDoCelular } from './rota';

describe('ehRotaDoCelular', () => {
  it('as telas do celular', () => {
    expect(ehRotaDoCelular('#/m')).toBe(true);
    expect(ehRotaDoCelular('#/m/equipe')).toBe(true);
    expect(ehRotaDoCelular('#/m?novos=1')).toBe(true);
  });
  it('o resto do site não', () => {
    expect(ehRotaDoCelular('#/')).toBe(false);
    expect(ehRotaDoCelular('#/metas')).toBe(false);
    expect(ehRotaDoCelular('#/meus-chips')).toBe(false);
    expect(ehRotaDoCelular('')).toBe(false);
  });
});
