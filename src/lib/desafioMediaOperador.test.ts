import { describe, it, expect } from 'vitest';
import { diasUteisDoMesDoDesafio, MEDIAS_PARA_SAIR_AS_14, MEDIAS_PARA_SAIR_MAIS_CEDO, metaDoOperadorNoDesafio, minhaMetaNoDesafio } from './desafioMediaOperador';
import { diasUteisDoSetor } from './diasUteisDoSetor';

const FINADOS = '2026-11-02';
const CONSCIENCIA = '2026-11-20';

describe('dias úteis da pessoa no mês (base da média)', () => {
  it('novembro/2026 tem 21 dias de segunda a sexta', () => {
    expect(diasUteisDoMesDoDesafio('2026-11-16')).toBe(21);
  });
  it('com Finados e Consciência Negra: 19', () => {
    expect(diasUteisDoMesDoDesafio('2026-11-16', [FINADOS, CONSCIENCIA])).toBe(19);
  });
  it('é o mês inteiro, não só até a véspera: o dia do desafio não muda a conta', () => {
    expect(diasUteisDoMesDoDesafio('2026-11-02', [FINADOS])).toBe(diasUteisDoMesDoDesafio('2026-11-27', [FINADOS]));
  });
  it('quem tem dias próprios (meta proporcional) conta só os dias dele', () => {
    const config = {
      data: { feriados: [FINADOS], contar_dia_atual: false },
      porPessoa: { p1: { mes: '2026-11', dias: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'] } },
    };
    const regua = diasUteisDoSetor(config, null, 'p1');
    expect(diasUteisDoMesDoDesafio('2026-11-16', regua.feriados)).toBe(4);
  });
});

describe('a meta do operador: 4,5 médias diárias dele', () => {
  // Meta de R$ 160.000 em 20 dias úteis = R$ 8.000 por dia.
  const base = { metaMensal: 160_000, diasUteisMes: 20 };

  it('média = meta do mês ÷ dias úteis dele; meta = 4,5 × média', () => {
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

  it('divisão que não fecha (19 dias): bater a meta ao centavo conta como batido', () => {
    const r = metaDoOperadorNoDesafio({ metaMensal: 100_000, diasUteisMes: 19, recebidoNoDesafio: [23_684.21, 0, 0], hoje: 0 });
    expect(r.mediaDiaria).toBeCloseTo(5_263.157894, 5);
    expect(r.bateu).toBe(true);
    expect(r.medias).toBe(4.5);
  });

  it('a meta não anda com o que ele faz no desafio', () => {
    const pouco = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [1_000, 0, 0], hoje: 0 });
    const muito = metaDoOperadorNoDesafio({ ...base, recebidoNoDesafio: [30_000, 0, 0], hoje: 0 });
    expect(pouco.meta).toBe(muito.meta);
  });

  it('sem meta no mês ou sem dia útil: sem média, sem meta', () => {
    for (const r of [
      metaDoOperadorNoDesafio({ metaMensal: 0, diasUteisMes: 20, recebidoNoDesafio: [5_000, 0, 0], hoje: 0 }),
      metaDoOperadorNoDesafio({ metaMensal: 160_000, diasUteisMes: 0, recebidoNoDesafio: [5_000, 0, 0], hoje: 0 }),
    ]) {
      expect(r.mediaDiaria).toBe(0);
      expect(r.meta).toBeNull();
      expect(r.falta).toBeNull();
      expect(r.bateu).toBe(false);
      expect(r.porDia).toBeNull();
    }
  });

  it('feriado a mais: menos dias úteis, média maior, meta maior', () => {
    const com = metaDoOperadorNoDesafio({
      metaMensal: 152_000, diasUteisMes: diasUteisDoMesDoDesafio('2026-11-16', [FINADOS, CONSCIENCIA]), recebidoNoDesafio: [0, 0, 0], hoje: 0,
    });
    expect(com.mediaDiaria).toBe(8_000);
    expect(com.meta).toBe(36_000);
  });
});

describe('o 2º nível: 5 médias = sai às 14:00', () => {
  const base = { metaMensal: 160_000, diasUteisMes: 20 };

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

describe('minhaMetaNoDesafio: meta do mês ÷ dias úteis dele; o feito é o 59 dele', () => {
  const DIAS = ['2026-11-16', '2026-11-17', '2026-11-18'];
  const recebido: Record<string, number> = {
    '2026-11-13': 99_999, // antes do desafio: não entra no feito nem na média
    '2026-11-16': 9_400, '2026-11-17': 11_200,
  };
  const regras = { dias: DIAS, regra_medias: 4.5, regra_medias_maior: 5 };

  it('média, meta e o feito', () => {
    // 152 mil ÷ 19 dias úteis (Finados e Consciência Negra fora) = 8 mil.
    const m = minhaMetaNoDesafio(regras, 152_000, recebido, [FINADOS, CONSCIENCIA], 1);
    expect(m.metaMensal).toBe(152_000);
    expect(m.diasUteisMes).toBe(19);
    expect(m.mediaDiaria).toBe(8_000);
    expect(m.meta).toBe(36_000);
    expect(m.maior.meta).toBe(40_000);
    expect(m.recebidoPorDia).toEqual([9_400, 11_200, 0]);
    expect(m.falta).toBe(15_400);
  });

  it('o recebido de antes do desafio não muda a meta', () => {
    const semAntes = { '2026-11-16': 9_400, '2026-11-17': 11_200 };
    expect(minhaMetaNoDesafio(regras, 152_000, recebido, [FINADOS, CONSCIENCIA], 1))
      .toEqual(minhaMetaNoDesafio(regras, 152_000, semAntes, [FINADOS, CONSCIENCIA], 1));
  });

  it('placar geral em «só o lançamento do super_admin»: a meta do operador não muda', () => {
    const doPlacar59 = { ...regras, fonte: '59', total: 95_209.72, ajustes: [] };
    const doPlacarManual = { ...regras, fonte: 'manual', total: 150_000, ajustes: [{ valor: 150_000 }] };
    expect(minhaMetaNoDesafio(doPlacarManual, 152_000, recebido, [FINADOS], 1))
      .toEqual(minhaMetaNoDesafio(doPlacar59, 152_000, recebido, [FINADOS], 1));
  });

  it('sem meta cadastrada: a regra não vale', () => {
    const m = minhaMetaNoDesafio(regras, 0, recebido, [FINADOS], 1);
    expect(m.meta).toBeNull();
    expect(m.maior.meta).toBeNull();
  });
});
