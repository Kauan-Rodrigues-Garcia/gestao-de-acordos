/**
 * O percentual de H.O. da PaguePlay deixou de ser constante (29/09/2026).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  HO_PERCENTUAL_PADRAO, getHoPercentual, setHoPercentual, normalizarHoPercentual,
  hoPercentualDaConfig, useHoPercentual, paraHO, deHO, rotuloHoPercentual,
  percentualImplicito, repassePercentuais, fatorDoRecebido,
} from './hoPercentual';

afterEach(() => setHoPercentual(HO_PERCENTUAL_PADRAO));

describe('o padrão', () => {
  it('é 22,60% — o que o relatório do ERP pratica hoje', () => {
    expect(HO_PERCENTUAL_PADRAO).toBe(0.2260);
    expect(getHoPercentual()).toBe(0.2260);
  });
});

describe('normalizar', () => {
  it('aceita fração entre 0 e 1', () => {
    expect(normalizarHoPercentual(0.2496)).toBe(0.2496);
    expect(normalizarHoPercentual('0.25')).toBe(0.25);
  });
  it('recusa o que não é fração válida e volta ao padrão', () => {
    for (const v of [0, 1, -0.1, 22.6, 'abc', null, undefined, NaN]) {
      expect(normalizarHoPercentual(v), String(v)).toBe(HO_PERCENTUAL_PADRAO);
    }
  });
});

describe('a configuração da empresa', () => {
  it('lê `ho_percentual` de empresas.config', () => {
    expect(hoPercentualDaConfig({ ho_percentual: 0.2315 })).toBe(0.2315);
  });
  it('sem o campo, ou sem config, fica no padrão', () => {
    expect(hoPercentualDaConfig({})).toBe(HO_PERCENTUAL_PADRAO);
    expect(hoPercentualDaConfig(null)).toBe(HO_PERCENTUAL_PADRAO);
  });
  it('jsonb pode devolver o número como texto', () => {
    expect(hoPercentualDaConfig({ ho_percentual: '0.2260' })).toBe(0.2260);
  });
});

describe('o store', () => {
  it('troca vale para quem lê fora do React', () => {
    setHoPercentual(0.25);
    expect(getHoPercentual()).toBe(0.25);
    expect(paraHO(1000)).toBe(250);
  });

  it('as telas re-renderizam quando o percentual muda', () => {
    const { result } = renderHook(() => useHoPercentual());
    expect(result.current).toBe(0.2260);
    act(() => setHoPercentual(0.2496));
    expect(result.current).toBe(0.2496);
  });
});

describe('conversões', () => {
  it('bruto ⇄ H.O.', () => {
    expect(paraHO(10_000)).toBeCloseTo(2_260, 6);
    expect(deHO(2_260)).toBe(10_000);
  });
  it('H.O. → bruto arredonda em centavos', () => {
    expect(deHO(10_000)).toBe(44_247.79);
  });
});

describe('rótulo', () => {
  it('formato brasileiro, duas casas', () => {
    expect(rotuloHoPercentual(0.226)).toBe('22,60%');
    expect(rotuloHoPercentual(0.2496)).toBe('24,96%');
  });
});

describe('percentual que o relatório pratica', () => {
  it('Total HO ÷ Recebido', () => {
    expect(percentualImplicito(10_000, 2_260)).toBeCloseTo(0.226, 6);
  });
  it('sem recebido ou sem H.O. (BookPlay) não há percentual', () => {
    expect(percentualImplicito(0, 100)).toBeNull();
    expect(percentualImplicito(1000, 0)).toBeNull();
  });
});

describe('repasse', () => {
  it('o resto do H.O., 3:1 entre Coren e Cofen, somando 100%', () => {
    const { coren, cofen } = repassePercentuais(0.226);
    expect(coren).toBeCloseTo(0.5805, 6);
    expect(cofen).toBeCloseTo(0.1935, 6);
    expect(0.226 + coren + cofen).toBeCloseTo(1, 10);
  });
  it('a 24,96% volta a divisão original', () => {
    const { coren, cofen } = repassePercentuais(0.2496);
    expect(coren).toBeCloseTo(0.5628, 6);
    expect(cofen).toBeCloseTo(0.1876, 6);
  });
});

describe('fatorDoRecebido — a meta na escala do recebido que ela mede', () => {
  it('é a proporção H.O. ÷ bruto do próprio recebido', () => {
    expect(fatorDoRecebido(150_000, 37_440)).toBeCloseTo(0.2496, 10);
  });
  it('não depende do percentual configurado quando há recebido', () => {
    setHoPercentual(0.2260);
    expect(fatorDoRecebido(1000, 249.6)).toBeCloseTo(0.2496, 10);
  });
  it('sem recebido (ou sem H.O.), o configurado', () => {
    setHoPercentual(0.2315);
    expect(fatorDoRecebido(0, 0)).toBe(0.2315);
    expect(fatorDoRecebido(1000, 0)).toBe(0.2315);
  });
});
