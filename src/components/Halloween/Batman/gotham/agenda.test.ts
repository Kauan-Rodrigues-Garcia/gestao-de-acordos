import { describe, expect, it } from 'vitest';
import { adiar, daVez, novaAgenda, reagendar } from './agenda';

const MIN = 60_000;

describe('agenda de Gotham', () => {
  it('nada vence no primeiro minuto', () => {
    expect(daVez(novaAgenda(1, 0, () => 0.5), 59_000)).toBeNull();
  });

  it('a primeira charada em 1 a 2 min; o primeiro Batmóvel em 2 a 4', () => {
    expect(novaAgenda(1, 0, () => 0)).toMatchObject({ charada: 1 * MIN, batmovel: 2 * MIN });
    expect(novaAgenda(1, 0, () => 1)).toMatchObject({ charada: 2 * MIN, batmovel: 4 * MIN });
  });

  it('vence primeiro o mais atrasado', () => {
    expect(daVez({ dono: 1, charada: 5_000, batmovel: 2_000 }, 10_000)).toBe('batmovel');
    expect(daVez({ dono: 1, charada: 1_000, batmovel: 2_000 }, 10_000)).toBe('charada');
  });

  it('reagenda: charada de 7 a 12 min; o Batmóvel volta de 6 a 12', () => {
    const a = novaAgenda(1, 0, () => 0.5);
    expect(reagendar(a, 'charada', 0, () => 0).charada).toBe(7 * MIN);
    expect(reagendar(a, 'batmovel', 0, () => 1).batmovel).toBe(12 * MIN);
  });

  it('adiar empurra 30 s só aquele evento', () => {
    const a = novaAgenda(1, 0, () => 0.5);
    const b = adiar(a, 'batmovel', 10 * MIN);
    expect(b.batmovel).toBe(10 * MIN + 30_000);
    expect(b.charada).toBe(a.charada);
  });
});
