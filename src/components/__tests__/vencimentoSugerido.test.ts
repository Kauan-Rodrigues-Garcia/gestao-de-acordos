/**
 * vencimentoSugerido.test.ts
 *
 * A BookPlay vinha usando a regra de data da PaguePlay por herança, e era a
 * queixa principal de 05/08/2026. As duas regras convivem:
 *
 *   PaguePlay — sempre o último dia do mês seguinte;
 *   BookPlay  — +30 dias na primeira vez, depois o mesmo DIA do mês seguinte,
 *               para a data que o operador escolheu valer para a série toda.
 */
import { describe, it, expect } from 'vitest';
import {
  ultimoDiaProxMes, trintaDiasDepois, mesmoDiaProxMes, vencimentoSugerido,
} from '../ModalReagendar';

describe('ultimoDiaProxMes (PaguePlay)', () => {
  it('vai para o último dia do mês seguinte', () => {
    expect(ultimoDiaProxMes('2026-08-05')).toBe('2026-09-30');
    expect(ultimoDiaProxMes('2026-01-15')).toBe('2026-02-28');
  });

  it('vira o ano em dezembro', () => {
    expect(ultimoDiaProxMes('2026-12-10')).toBe('2027-01-31');
  });
});

describe('trintaDiasDepois (BookPlay, 1ª vez)', () => {
  it('soma 30 dias corridos, atravessando o mês', () => {
    expect(trintaDiasDepois('2026-08-05')).toBe('2026-09-04');
    expect(trintaDiasDepois('2026-01-31')).toBe('2026-03-02');   // 2026 não é bissexto
  });

  it('vira o ano', () => {
    expect(trintaDiasDepois('2026-12-15')).toBe('2027-01-14');
  });
});

describe('mesmoDiaProxMes (BookPlay, série em andamento)', () => {
  it('mantém o dia escolhido pelo operador', () => {
    expect(mesmoDiaProxMes('2026-09-20')).toBe('2026-10-20');
    expect(mesmoDiaProxMes('2026-10-20')).toBe('2026-11-20');
  });

  it('satura em mês curto em vez de escorregar para o mês seguinte', () => {
    expect(mesmoDiaProxMes('2026-01-31')).toBe('2026-02-28');
    expect(mesmoDiaProxMes('2026-03-31')).toBe('2026-04-30');
  });

  it('vira o ano', () => {
    expect(mesmoDiaProxMes('2026-12-20')).toBe('2027-01-20');
  });
});

describe('vencimentoSugerido', () => {
  it('PaguePlay ignora o número da parcela — sempre fim do mês seguinte', () => {
    expect(vencimentoSugerido('2026-08-05', true, 2)).toBe('2026-09-30');
    expect(vencimentoSugerido('2026-08-05', true, 7)).toBe('2026-09-30');
  });

  it('BookPlay: da parcela 1 para a 2, +30 dias', () => {
    expect(vencimentoSugerido('2026-08-05', false, 2)).toBe('2026-09-04');
  });

  it('BookPlay: da 2ª em diante, mesmo dia do mês seguinte', () => {
    expect(vencimentoSugerido('2026-09-20', false, 3)).toBe('2026-10-20');
  });

  // O cenário exato descrito pelo usuário: acordo tabulado em 05/08, a
  // sugestão vem 04/09, o operador puxa para o dia 20 e a partir daí TODAS as
  // parcelas caem no dia 20 — sem escorregar um dia por mês, que é o que
  // aconteceria se a série continuasse somando 30 dias.
  it('a data escolhida pelo operador se mantém no dia 20 pela série toda', () => {
    expect(vencimentoSugerido('2026-08-05', false, 2)).toBe('2026-09-04');
    const escolhida = '2026-09-20';
    let venc = escolhida;
    const dias: string[] = [];
    for (let parcela = 3; parcela <= 6; parcela++) {
      venc = vencimentoSugerido(venc, false, parcela);
      dias.push(venc);
    }
    expect(dias).toEqual(['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20']);
    expect(dias.every(d => d.endsWith('-20'))).toBe(true);
  });
});
