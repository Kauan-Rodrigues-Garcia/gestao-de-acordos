import { describe, it, expect } from 'vitest';
import {
  diasUteisComercial, diasUteisDecorridosComercial, diasUteisDesdeComercial,
  ehDiaUtilComercial, metaProporcional,
} from './vendasCalendario';
import { diasUteisDoMes } from './diasUteis';

describe('vendasCalendario', () => {
  it('sem configuração, conta igual ao calendário antigo (seg–sex)', () => {
    for (let m = 1; m <= 12; m++) expect(diasUteisComercial(2026, m)).toBe(diasUteisDoMes(2026, m));
  });

  it('feriado sai, sábado entra quando configurado, domingo nunca', () => {
    const cal = { feriados: ['2026-10-12'], sabadoUtil: true };
    expect(ehDiaUtilComercial('2026-10-12', cal)).toBe(false); // segunda, feriado
    expect(ehDiaUtilComercial('2026-10-10', cal)).toBe(true);  // sábado
    expect(ehDiaUtilComercial('2026-10-11', cal)).toBe(false); // domingo
    expect(diasUteisComercial(2026, 10, cal)).toBe(26);
  });

  it('decorridos e «desde» repartem o mês sem sobra', () => {
    const total = diasUteisComercial(2026, 10);
    const ate14 = diasUteisDecorridosComercial(2026, 10, '2026-10-14');
    const desde15 = diasUteisDesdeComercial(2026, 10, '2026-10-15');
    expect(ate14 + desde15).toBe(total);
  });

  it('meta proporcional arredonda a quantidade para cima e o valor em centavos', () => {
    expect(metaProporcional({ quantidade: 12, valor: 70000 }, 11, 22)).toEqual({ quantidade: 6, valor: 35000 });
    expect(metaProporcional({ quantidade: 12, valor: 1000 }, 7, 22)).toEqual({ quantidade: 4, valor: 318.18 });
    // Mês inteiro (ou mais) não reduz nada.
    expect(metaProporcional({ quantidade: 12, valor: 1000 }, 22, 22)).toEqual({ quantidade: 12, valor: 1000 });
  });
});
