/**
 * emDiaOperador.test.ts
 *
 * A estrela vai para a tela e o texto vai para o WhatsApp do operador. Os dois
 * afirmam a mesma coisa — «você atingiu a média diária necessária» —, então o
 * que estes casos protegem é a honestidade dessa frase:
 *
 *   • a régua é meta ÷ dias úteis do mês, e o que se compara com ela é o
 *     recebido DO DIA (a lente Mês saiu em 17/09/2026 — ver o módulo);
 *   • o que a tela escreve em centavos decide igual à conta;
 *   • sem meta não há régua, e sem régua não há estrela.
 */
import { describe, it, expect } from 'vitest';
import {
  avaliarEmDia, diasDoOperador, operadoresEmDia, type CalendarioDoMes,
} from './emDiaOperador';
import { diasUteisDoMes } from '@/lib/diasUteis';

/** Meta 22.000 em 22 dias úteis → média diária necessária de 1.000. */
const REGUA = { meta: 22_000, totalUteis: 22 };

describe('avaliarEmDia', () => {
  it('compara o recebido do dia com a média diária necessária', () => {
    const a = avaliarEmDia({ ...REGUA, valor: 1_250 })!;
    expect(a.emDia).toBe(true);
    expect(a.valor).toBe(1_250);
    expect(a.metaDiaria).toBe(1_000);
  });

  it('um centavo abaixo não está em dia', () => {
    expect(avaliarEmDia({ ...REGUA, valor: 999.99 })!.emDia).toBe(false);
  });

  it('decide pelo que a tela escreve, em centavos', () => {
    // 999,999 aparece como R$ 1.000,00. Negar a estrela ao lado de dois valores
    // iguais seria a tela discordando de si mesma.
    expect(avaliarEmDia({ ...REGUA, valor: 999.999 })!.emDia).toBe(true);
  });

  it('dia sem recebimento não está em dia', () => {
    expect(avaliarEmDia({ ...REGUA, valor: 0 })!.emDia).toBe(false);
  });
});

describe('avaliarEmDia — sem régua', () => {
  it('sem meta devolve null, e não «fora do ritmo»', () => {
    expect(avaliarEmDia({ valor: 5_000, meta: null, totalUteis: 22 })).toBeNull();
    expect(avaliarEmDia({ valor: 5_000, meta: 0, totalUteis: 22 })).toBeNull();
  });

  it('mês sem dia útil devolve null em vez de Infinity', () => {
    expect(avaliarEmDia({ valor: 5_000, meta: 22_000, totalUteis: 0 })).toBeNull();
  });
});

const CAL: CalendarioDoMes = { ano: 2026, mes: 9, feriados: [] };

describe('diasDoOperador', () => {
  it('sem treinamento usa o mês cheio', () => {
    expect(diasDoOperador(CAL, null)).toEqual({ totalUteis: diasUteisDoMes(2026, 9, []) });
  });

  it('equipe em treinamento conta a partir do início, como nos Quartis', () => {
    const d = diasDoOperador(CAL, '2026-09-14');
    expect(d.totalUteis).toBeLessThan(diasUteisDoMes(2026, 9, []));
    expect(d.totalUteis).toBe(diasUteisDoMes(2026, 9, [], '2026-09-14'));
  });

  it('respeita o feriado da aba Metas', () => {
    // 16/09/2026 é quarta-feira.
    expect(diasDoOperador({ ...CAL, feriados: ['2026-09-16'] }, null).totalUteis)
      .toBe(diasDoOperador(CAL, null).totalUteis - 1);
  });
});

describe('operadoresEmDia', () => {
  const diariaCheia = 22_000 / diasUteisDoMes(2026, 9, []);
  const base = {
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

  /*
   * A lente Mês foi retirada em 17/09/2026. Este caso tranca o que mudou para
   * quem olha a tela: o recebido do MÊS inteiro não acende mais a estrela —
   * quem manda é o valor do dia, e a régua continua sendo a diária.
   */
  it('o valor do dia é a única coisa medida: o mês inteiro não vale', () => {
    const m = operadoresEmDia({
      ...base,
      linhas: [{ operador_id: 'ana', valor: diariaCheia - 0.02 }],
    });
    expect(m.has('ana')).toBe(false);
  });
});
