import { afterEach, describe, expect, it } from 'vitest';
import {
  CARTAZ_EM_MS, QUEIMA_ANTES_MS, VOLTA_EM_MS, esquecerQueda, lembrarQueda, planoDaVolta, quedaGuardada, relogio,
} from './aranhaPerdida';

const T0 = 1_790_000_000_000;

afterEach(() => { esquecerQueda(); });

describe('a queda guardada', () => {
  it('recarregar a página dentro dos cinco minutos: continua perdida', () => {
    lembrarQueda(T0);
    expect(quedaGuardada(T0 + 60_000)).toBe(T0);
  });

  it('passados os cinco minutos: já voltou, e a lembrança some', () => {
    lembrarQueda(T0);
    expect(quedaGuardada(T0 + VOLTA_EM_MS)).toBeNull();
    expect(localStorage.getItem('hw:aranha-perdida-em')).toBeNull();
  });

  it('sem queda, ou lixo no armazenamento: nada', () => {
    expect(quedaGuardada(T0)).toBeNull();
    localStorage.setItem('hw:aranha-perdida-em', 'abc');
    expect(quedaGuardada(T0)).toBeNull();
  });

  it('queda no futuro (relógio mexido): ignora', () => {
    lembrarQueda(T0 + 10_000);
    expect(quedaGuardada(T0)).toBeNull();
  });
});

describe('a linha do tempo', () => {
  it('logo depois da queda: o morcego vem em 5 s, o fogo antes da volta', () => {
    const p = planoDaVolta(T0, T0);
    expect(p).toEqual({ cartazJaChegou: false, cartazEm: CARTAZ_EM_MS, queimaEm: VOLTA_EM_MS - QUEIMA_ANTES_MS, voltaEm: VOLTA_EM_MS });
  });

  it('página aberta com o cartaz já pendurado: aparece direto', () => {
    const p = planoDaVolta(T0, T0 + 2 * 60_000);
    expect(p.cartazJaChegou).toBe(true);
    expect(p.cartazEm).toBe(0);
    expect(p.voltaEm).toBe(3 * 60_000);
  });

  it('página aberta no meio do fogo: sem cartaz, só a volta', () => {
    const p = planoDaVolta(T0, T0 + VOLTA_EM_MS - 2_000);
    expect(p.queimaEm).toBeNull();
    expect(p.voltaEm).toBe(2_000);
  });
});

describe('o relógio do cartaz', () => {
  it('minutos e segundos, arredondando para cima', () => {
    expect(relogio(VOLTA_EM_MS)).toBe('5:00');
    expect(relogio(61_001)).toBe('1:02');
    expect(relogio(900)).toBe('0:01');
    expect(relogio(-5)).toBe('0:00');
  });
});
