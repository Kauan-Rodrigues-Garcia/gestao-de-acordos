import { describe, it, expect } from 'vitest';
import { diasUteisAntesDoDesafio, MEDIAS_PARA_SAIR_AS_14, MEDIAS_PARA_SAIR_MAIS_CEDO, metaDoOperadorNoDesafio, minhaMetaPeloRecebido } from './desafioMediaOperador';

const FINADOS = '2026-11-02';

describe('dias úteis antes do desafio (base da média)', () => {
  it('desafio em 16/11/2026, com Finados: 03 a 13/11 = 9 dias', () => {
    expect(diasUteisAntesDoDesafio('2026-11-16', [FINADOS])).toBe(9);
  });
  it('sem o feriado no calendário, conta 10', () => {
    expect(diasUteisAntesDoDesafio('2026-11-16')).toBe(10);
  });
  it('o primeiro dia do desafio não entra na base', () => {
    expect(diasUteisAntesDoDesafio('2026-11-17', [FINADOS])).toBe(10);
  });
});

describe('a meta do operador: 4,5 médias diárias dele', () => {
  const base = { recebidoAntes: 72_000, diasUteisAntes: 9 };

  it('média = recebido ÷ dias trabalhados; meta = 4,5 × média', () => {
    const r = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [0, 0, 0], hoje: 0 });
    expect(r.mediaDiaria).toBe(8_000);
    expect(r.meta).toBe(36_000);
    expect(r.falta).toBe(36_000);
    // 4,5 médias em 3 dias = 1,5 média por dia, do primeiro dia em diante.
    expect(r.porDia).toBe(12_000);
  });

  it('acompanha o que ele faz nos dias do desafio', () => {
    const r = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [9_400, 11_200, 6_000], hoje: 2 });
    expect(r.feito).toBe(26_600);
    expect(r.medias).toBe(3.3);
    expect(r.falta).toBe(9_400);
    expect(r.diasRestantes).toBe(1);
    expect(r.porDia).toBe(9_400);
    expect(r.bateu).toBe(false);
  });

  it('bate exatamente em 4,5 médias', () => {
    const r = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [12_000, 12_000, 12_000], hoje: 2 });
    expect(r.bateu).toBe(true);
    expect(r.falta).toBe(0);
    expect(r.porDia).toBeNull();
    expect(r.medias).toBe(4.5);
  });

  it('4,49 médias não vira 4,5: um real a menos não bate', () => {
    const r = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [12_000, 12_000, 11_999], hoje: 2 });
    expect(r.bateu).toBe(false);
    expect(r.falta).toBe(1);
    expect(r.medias).toBe(4.4);
  });

  it('a meta não anda com o que ele faz no desafio (a média é a da véspera)', () => {
    const pouco = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [1_000, 0, 0], hoje: 0 });
    const muito = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [30_000, 0, 0], hoje: 0 });
    expect(pouco.meta).toBe(muito.meta);
  });

  it('operador sem dia trabalhado ou sem recebimento no mês: sem média, sem meta', () => {
    for (const r of [
      metaDoOperadorNoDesafio({ recebidoAntes: 0, diasUteisAntes: 9, recebidoNoDesafio: [5_000, 0, 0], hoje: 0 }),
      metaDoOperadorNoDesafio({ recebidoAntes: 10_000, diasUteisAntes: 0, recebidoNoDesafio: [5_000, 0, 0], hoje: 0 }),
    ]) {
      expect(r.mediaDiaria).toBe(0);
      expect(r.meta).toBeNull();
      expect(r.falta).toBeNull();
      expect(r.bateu).toBe(false);
      expect(r.porDia).toBeNull();
    }
  });

  it('feriado do setor a mais na base: menos dias, média maior, meta maior', () => {
    const com = metaDoOperadorNoDesafio({ recebidoAntes: 72_000, diasUteisAntes: diasUteisAntesDoDesafio('2026-11-16', [FINADOS, '2026-11-13']), recebidoNoDesafio: [0, 0, 0], hoje: 0 });
    expect(com.mediaDiaria).toBe(9_000);
    expect(com.meta).toBe(40_500);
  });
});

describe('o 2º nível: 5 médias = sai às 14:00', () => {
  const base = { recebidoAntes: 72_000, diasUteisAntes: 9 };

  it('a mesma média, fator 5: R$ 8.000 × 5 = R$ 40.000', () => {
    const r = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [0, 0, 0], hoje: 0, fator: MEDIAS_PARA_SAIR_AS_14 });
    expect(r.mediaDiaria).toBe(8_000);
    expect(r.meta).toBe(40_000);
  });

  it('com 4,5 médias ganha 1h mais cedo, mas ainda não as 14:00', () => {
    const feito = [12_000, 12_000, 12_000];
    const n1 = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: feito, hoje: 2, fator: MEDIAS_PARA_SAIR_MAIS_CEDO });
    const n2 = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: feito, hoje: 2, fator: MEDIAS_PARA_SAIR_AS_14 });
    expect(n1.bateu).toBe(true);
    expect(n2.bateu).toBe(false);
    expect(n2.falta).toBe(4_000);
  });

  it('com 5 médias bate os dois', () => {
    const feito = [14_000, 13_000, 13_000];
    const n2 = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: feito, hoje: 2, fator: MEDIAS_PARA_SAIR_AS_14 });
    expect(n2.bateu).toBe(true);
    expect(n2.medias).toBe(5);
  });
});

describe('a meta individual vem do 59 do operador, nunca do placar geral', () => {
  const DIAS = ['2026-11-16', '2026-11-17', '2026-11-18'];
  // O 59 do operador por dia: 72 mil antes do desafio (03 a 13/11) e o que fez no desafio.
  const recebido: Record<string, number> = {
    '2026-10-30': 99_999,                       // outro mês: não entra
    '2026-11-03': 8_000, '2026-11-04': 8_000, '2026-11-05': 8_000, '2026-11-06': 8_000,
    '2026-11-09': 8_000, '2026-11-10': 8_000, '2026-11-11': 8_000, '2026-11-12': 8_000, '2026-11-13': 8_000,
    '2026-11-16': 9_400, '2026-11-17': 11_200,
  };
  const regras = { dias: DIAS, regra_medias: 4.5, regra_medias_maior: 5 };

  it('média, meta e o feito saem do recebido dele', () => {
    const m = minhaMetaPeloRecebido(regras, recebido, [FINADOS], 1);
    expect(m.recebidoAntes).toBe(72_000);
    expect(m.diasUteisAntes).toBe(9);
    expect(m.mediaDiaria).toBe(8_000);
    expect(m.meta).toBe(36_000);
    expect(m.maior.meta).toBe(40_000);
    expect(m.recebidoPorDia).toEqual([9_400, 11_200, 0]);
    expect(m.falta).toBe(15_400);
  });

  it('placar geral em «só o lançamento do super_admin»: a meta do operador não muda', () => {
    const doPlacar59 = { ...regras, fonte: '59', total: 95_209.72, ajustes: [] };
    const doPlacarManual = { ...regras, fonte: 'manual', total: 150_000, ajustes: [{ valor: 150_000 }] };
    expect(minhaMetaPeloRecebido(doPlacarManual, recebido, [FINADOS], 1))
      .toEqual(minhaMetaPeloRecebido(doPlacar59, recebido, [FINADOS], 1));
  });
});
