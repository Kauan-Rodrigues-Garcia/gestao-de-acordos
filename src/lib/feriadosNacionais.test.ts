import { describe, it, expect } from 'vitest';
import { feriadosNacionais, pascoa } from './feriadosNacionais';

const dia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('feriados nacionais', () => {
  it('Páscoa em anos conhecidos', () => {
    expect(dia(pascoa(2025))).toBe('2025-04-20');
    expect(dia(pascoa(2026))).toBe('2026-04-05');
    expect(dia(pascoa(2027))).toBe('2027-03-28');
  });

  it('os móveis de 2026 saem da Páscoa', () => {
    const f = new Map(feriadosNacionais(2026).map(x => [x.dia, x.nome]));
    expect(f.get('2026-02-16')).toBe('Carnaval');
    expect(f.get('2026-02-17')).toBe('Carnaval');
    expect(f.get('2026-04-03')).toBe('Sexta-feira Santa');
    expect(f.get('2026-06-04')).toBe('Corpus Christi');
  });

  it('os fixos, em ordem de data', () => {
    const f = feriadosNacionais(2026);
    expect(f.map(x => x.dia)).toEqual([...f.map(x => x.dia)].sort());
    expect(f.find(x => x.dia === '2026-10-12')?.nome).toBe('Nossa Senhora Aparecida');
    expect(f.find(x => x.dia === '2026-11-20')?.nome).toBe('Consciência Negra');
    expect(f).toHaveLength(13);
  });
});
