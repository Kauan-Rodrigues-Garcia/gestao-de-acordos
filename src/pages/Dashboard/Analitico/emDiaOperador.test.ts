/**
 * emDiaOperador.test.ts
 *
 * A estrela vai para a tela e o texto vai para o WhatsApp do operador. Os dois
 * afirmam a mesma coisa — «você atingiu a média diária necessária» —, então o
 * que estes casos protegem é a honestidade dessa frase:
 *
 *   • a régua é a mesma nas duas lentes: meta ÷ dias úteis do mês;
 *   • o que a tela escreve em centavos decide igual à conta;
 *   • sem meta não há régua, e sem régua não há estrela.
 */
import { describe, it, expect } from 'vitest';
import {
  avaliarEmDia, diasDoOperador, operadoresEmDia, type CalendarioDoMes,
} from './emDiaOperador';
import { diasUteisDoMes, diasUteisDecorridos } from '@/lib/diasUteis';

/** Meta 22.000 em 22 dias úteis → média diária necessária de 1.000. */
const REGUA = { meta: 22_000, totalUteis: 22 };

describe('avaliarEmDia — lente Mês', () => {
  it('média igual à necessária já está em dia', () => {
    const a = avaliarEmDia({ ...REGUA, lente: 'mes', valor: 10_000, decorridos: 10 })!;
    expect(a.metaDiaria).toBe(1_000);
    expect(a.mediaDiaria).toBe(1_000);
    expect(a.emDia).toBe(true);
  });

  it('um centavo de média abaixo não está', () => {
    const a = avaliarEmDia({ ...REGUA, lente: 'mes', valor: 9_999.9, decorridos: 10 })!;
    expect(a.emDia).toBe(false);
  });

  it('decide pelo que a tela escreve, em centavos', () => {
    // 9.999,99 ÷ 10 = 999,999 — a tela escreve R$ 1.000,00. Negar a estrela ao
    // lado de dois valores iguais seria a tela discordando de si mesma.
    const a = avaliarEmDia({ ...REGUA, lente: 'mes', valor: 9_999.99, decorridos: 10 })!;
    expect(a.emDia).toBe(true);
  });

  it('no primeiro dia útil cobra um dia, não divide por zero', () => {
    expect(avaliarEmDia({ ...REGUA, lente: 'mes', valor: 1_000, decorridos: 0 })!.emDia).toBe(true);
    expect(avaliarEmDia({ ...REGUA, lente: 'mes', valor: 500, decorridos: 0 })!.emDia).toBe(false);
  });
});

describe('avaliarEmDia — lente Dia', () => {
  it('compara o recebido do dia com a média diária necessária', () => {
    const a = avaliarEmDia({ ...REGUA, lente: 'dia', valor: 1_250, decorridos: 15 })!;
    expect(a.emDia).toBe(true);
    expect(a.mediaDiaria).toBe(1_250);
    expect(a.metaDiaria).toBe(1_000);
  });

  it('não usa os dias decorridos — o dia é um dia só', () => {
    expect(avaliarEmDia({ ...REGUA, lente: 'dia', valor: 999, decorridos: 15 })!.emDia).toBe(false);
    expect(avaliarEmDia({ ...REGUA, lente: 'dia', valor: 1_000, decorridos: 0 })!.emDia).toBe(true);
  });

  it('dia sem recebimento não está em dia', () => {
    expect(avaliarEmDia({ ...REGUA, lente: 'dia', valor: 0, decorridos: 5 })!.emDia).toBe(false);
  });
});

describe('avaliarEmDia — sem régua', () => {
  it('sem meta devolve null, e não «fora do ritmo»', () => {
    expect(avaliarEmDia({ lente: 'mes', valor: 5_000, meta: null, totalUteis: 22, decorridos: 5 })).toBeNull();
    expect(avaliarEmDia({ lente: 'dia', valor: 5_000, meta: 0, totalUteis: 22, decorridos: 5 })).toBeNull();
  });

  it('mês sem dia útil devolve null em vez de Infinity', () => {
    expect(avaliarEmDia({ lente: 'dia', valor: 5_000, meta: 22_000, totalUteis: 0, decorridos: 0 })).toBeNull();
  });
});

/** 15/09/2026 é terça; o dia de hoje não conta, como no padrão da aba Metas. */
const CAL: CalendarioDoMes = {
  ano: 2026, mes: 9, feriados: [], contarHoje: false, hojeISO: '2026-09-15',
};

describe('diasDoOperador', () => {
  it('sem treinamento usa o mês cheio', () => {
    expect(diasDoOperador(CAL, null)).toEqual({
      totalUteis: diasUteisDoMes(2026, 9, []),
      decorridos: diasUteisDecorridos(2026, 9, [], '2026-09-15', undefined, false),
    });
  });

  it('equipe em treinamento conta a partir do início, como nos Quartis', () => {
    const d = diasDoOperador(CAL, '2026-09-14');
    expect(d.totalUteis).toBeLessThan(diasUteisDoMes(2026, 9, []));
    expect(d.totalUteis).toBe(diasUteisDoMes(2026, 9, [], '2026-09-14'));
    expect(d.decorridos).toBe(diasUteisDecorridos(2026, 9, [], '2026-09-15', '2026-09-14', false));
  });

  it('respeita feriado e o «contar o dia atual» da aba Metas', () => {
    const semHoje = diasDoOperador(CAL, null);
    expect(diasDoOperador({ ...CAL, contarHoje: true }, null).decorridos).toBe(semHoje.decorridos + 1);
    // 16/09/2026 é quarta-feira.
    expect(diasDoOperador({ ...CAL, feriados: ['2026-09-16'] }, null).totalUteis)
      .toBe(semHoje.totalUteis - 1);
  });
});

describe('operadoresEmDia', () => {
  const diariaCheia = 22_000 / diasUteisDoMes(2026, 9, []);
  const base = {
    lente: 'dia' as const,
    metaPorOperador: { ana: 22_000, bruno: 22_000 } as Record<string, number>,
    treinoPorEquipe: {} as Record<string, string | null>,
    equipeDoOperador: (_id: string) => 'eq-1' as string | null,
    calendario: CAL,
  };

  it('devolve só quem está em dia', () => {
    const m = operadoresEmDia({
      ...base,
      linhas: [
        { operador_id: 'ana',   valor: diariaCheia + 1 },
        { operador_id: 'bruno', valor: diariaCheia - 1 },
      ],
    });
    expect([...m.keys()]).toEqual(['ana']);
  });

  it('quem não tem meta fica de fora, por maior que seja o recebido', () => {
    const m = operadoresEmDia({ ...base, linhas: [{ operador_id: 'diego', valor: 1_000_000 }] });
    expect(m.size).toBe(0);
  });

  it('clone desenhado em duas equipes vira uma entrada só', () => {
    const m = operadoresEmDia({
      ...base,
      linhas: [
        { operador_id: 'ana', valor: diariaCheia * 2 },
        { operador_id: 'ana', valor: diariaCheia * 2 },
      ],
    });
    expect(m.size).toBe(1);
  });

  it('o treinamento vem da equipe de ORIGEM do operador', () => {
    // Com menos dias úteis a média necessária sobe: quem estava em dia contra o
    // mês cheio deixa de estar contra os dias do treinamento.
    const linhas = [{ operador_id: 'ana', valor: Math.ceil(diariaCheia) }];
    expect(operadoresEmDia({ ...base, linhas }).has('ana')).toBe(true);
    expect(operadoresEmDia({
      ...base,
      linhas,
      treinoPorEquipe: { 'eq-treino': '2026-09-14' },
      equipeDoOperador: id => (id === 'ana' ? 'eq-treino' : 'eq-1'),
    }).has('ana')).toBe(false);
  });

  it('na lente Mês usa os dias úteis trabalhados até hoje', () => {
    const dec = diasUteisDecorridos(2026, 9, [], '2026-09-15', undefined, false);
    const m = operadoresEmDia({
      ...base,
      lente: 'mes',
      linhas: [
        { operador_id: 'ana',   valor: diariaCheia * dec },
        { operador_id: 'bruno', valor: diariaCheia * dec - 50 },
      ],
    });
    expect(m.has('ana')).toBe(true);
    expect(m.has('bruno')).toBe(false);
    expect(m.get('ana')!.lente).toBe('mes');
  });
});
