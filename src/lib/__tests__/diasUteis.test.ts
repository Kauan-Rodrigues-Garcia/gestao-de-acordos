import { describe, it, expect } from 'vitest';
import {
  ehDiaUtil, diasUteisDoMes, diasUteisDecorridos,
  quartilAtual, proximoQuartil, QUARTIS_PADRAO,
} from '@/lib/diasUteis';

// Julho/2026: dia 1 é quarta-feira; 23 dias úteis (seg–sex).
describe('diasUteis', () => {
  it('identifica dia útil vs fim de semana', () => {
    expect(ehDiaUtil('2026-07-10')).toBe(true);   // sexta
    expect(ehDiaUtil('2026-07-11')).toBe(false);  // sábado
    expect(ehDiaUtil('2026-07-12')).toBe(false);  // domingo
    expect(ehDiaUtil('2026-07-13')).toBe(true);   // segunda
  });

  it('conta os dias úteis do mês', () => {
    expect(diasUteisDoMes(2026, 7)).toBe(23);
  });

  it('subtrai feriados em dia útil, ignora feriado no fim de semana', () => {
    expect(diasUteisDoMes(2026, 7, ['2026-07-09'])).toBe(22);              // quinta
    expect(diasUteisDoMes(2026, 7, ['2026-07-11'])).toBe(23);              // sábado — não subtrai
    expect(diasUteisDoMes(2026, 7, ['2026-07-09', '2026-07-20'])).toBe(21); // dois feriados úteis
  });

  it('conta dias úteis decorridos incluindo hoje', () => {
    // até sexta 10/07: dias 1,2,3 (qua,qui,sex) + 6..10 (seg–sex) = 8
    expect(diasUteisDecorridos(2026, 7, [], '2026-07-10')).toBe(8);
    // num sábado, conta só os anteriores
    expect(diasUteisDecorridos(2026, 7, [], '2026-07-11')).toBe(8);
    // feriado no dia 9 remove um dia decorrido
    expect(diasUteisDecorridos(2026, 7, ['2026-07-09'], '2026-07-10')).toBe(7);
  });
});

describe('quartis', () => {
  it('classifica a projeção na faixa correta', () => {
    expect(quartilAtual(110, QUARTIS_PADRAO)?.quartil).toBe(1);
    expect(quartilAtual(100, QUARTIS_PADRAO)?.quartil).toBe(1);
    expect(quartilAtual(85, QUARTIS_PADRAO)?.quartil).toBe(2);
    expect(quartilAtual(50, QUARTIS_PADRAO)?.quartil).toBe(3);
    expect(quartilAtual(10, QUARTIS_PADRAO)?.quartil).toBe(4);
    expect(quartilAtual(0, QUARTIS_PADRAO)?.quartil).toBe(4);
  });

  it('encontra o próximo quartil acima (null quando já é o melhor)', () => {
    const q2 = quartilAtual(85, QUARTIS_PADRAO);
    expect(proximoQuartil(q2, QUARTIS_PADRAO)?.quartil).toBe(1);
    const q1 = quartilAtual(120, QUARTIS_PADRAO);
    expect(proximoQuartil(q1, QUARTIS_PADRAO)).toBeNull();
  });

  it('lida com listas vazias', () => {
    expect(quartilAtual(50, [])).toBeNull();
    expect(proximoQuartil(null, QUARTIS_PADRAO)).toBeNull();
  });
});
