import { describe, it, expect } from 'vitest';
import {
  calcularProjecao, pctLimitado, ultimoDiaComRecebimento,
} from '@/lib/projecaoMetas';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';

// Base recorrente: meta de 130.000 em 21 dias úteis = 6.190,476…/dia útil.
// É o cenário da print de referência, com 6 dias decorridos.
const BASE = {
  meta: 130_000,
  totalUteis: 21,
  decorridos: 6,
  quartis: QUARTIS_PADRAO,
};

describe('calcularProjecao — ausência de dados', () => {
  it('devolve null sem meta (null, undefined, 0 ou negativa)', () => {
    expect(calcularProjecao({ ...BASE, meta: null, recebido: 100 })).toBeNull();
    expect(calcularProjecao({ ...BASE, meta: undefined, recebido: 100 })).toBeNull();
    expect(calcularProjecao({ ...BASE, meta: 0, recebido: 100 })).toBeNull();
    expect(calcularProjecao({ ...BASE, meta: -1, recebido: 100 })).toBeNull();
  });

  it('devolve null sem dias úteis — dividir por zero daria Infinity', () => {
    expect(calcularProjecao({ ...BASE, totalUteis: 0, recebido: 100 })).toBeNull();
  });

  it('distingue "sem meta" de "0% da meta"', () => {
    expect(calcularProjecao({ ...BASE, meta: null, recebido: 0 })).toBeNull();
    expect(calcularProjecao({ ...BASE, recebido: 0 })?.projecaoPct).toBe(0);
  });
});

describe('calcularProjecao — a conta', () => {
  it('meta diária é meta ÷ dias úteis do mês', () => {
    const r = calcularProjecao({ ...BASE, recebido: 0 })!;
    expect(r.metaDiaria).toBeCloseTo(6_190.476, 2);
  });

  it('esperado é meta diária × dias decorridos', () => {
    const r = calcularProjecao({ ...BASE, recebido: 0 })!;
    expect(r.esperado).toBeCloseTo(37_142.857, 2);
  });

  it('reproduz o cenário da referência: 65.611,62 sobre 37.142,86 = 177%', () => {
    const r = calcularProjecao({ ...BASE, recebido: 65_611.62 })!;
    expect(r.projecaoPct).toBe(177);          // 176,6 arredondado
    expect(r.diferenca).toBeCloseTo(28_468.76, 2);
    expect(r.quartil?.quartil).toBe(1);
  });

  it('diferença é negativa quando o recebido está abaixo do esperado', () => {
    const r = calcularProjecao({ ...BASE, recebido: 10_000 })!;
    expect(r.diferenca).toBeLessThan(0);
    expect(r.projecaoPct).toBe(27);
    expect(r.quartil?.quartil).toBe(4);
  });

  it('aplica piso de 1 em decorridos — dia 0 não vira Infinity', () => {
    const zero = calcularProjecao({ ...BASE, decorridos: 0, recebido: 6_190.48 })!;
    const um   = calcularProjecao({ ...BASE, decorridos: 1, recebido: 6_190.48 })!;
    expect(zero.esperado).toBe(um.esperado);
    expect(zero.projecaoPct).toBe(100);
    expect(Number.isFinite(zero.projecaoPct)).toBe(true);
  });
});

describe('calcularProjecao — quartis', () => {
  it('classifica na fronteira exata da faixa (100% entra no 1º)', () => {
    const r = calcularProjecao({ ...BASE, recebido: 37_142.857 })!;
    expect(r.projecaoPct).toBe(100);
    expect(r.quartil?.quartil).toBe(1);
    expect(r.proximo).toBeNull();
    expect(r.paraSubir).toBeNull();
  });

  it('80% entra no 2º quartil e aponta o 1º como próximo', () => {
    const r = calcularProjecao({ ...BASE, recebido: 37_142.857 * 0.8 })!;
    expect(r.projecaoPct).toBe(80);
    expect(r.quartil?.quartil).toBe(2);
    expect(r.proximo?.quartil).toBe(1);
  });

  it('paraSubir é quanto falta para alcançar a faixa de cima', () => {
    const recebido = 37_142.857 * 0.8;
    const r = calcularProjecao({ ...BASE, recebido })!;
    // Próxima faixa é 100% do esperado
    expect(r.paraSubir).toBeCloseTo(r.esperado - recebido, 2);
  });

  it('paraSubir nunca é negativo', () => {
    const r = calcularProjecao({ ...BASE, recebido: 37_142.857 * 0.99, quartis: [
      { quartil: 1, min_pct: 50 }, { quartil: 2, min_pct: 0 },
    ] })!;
    expect(r.paraSubir === null || r.paraSubir >= 0).toBe(true);
  });

  it('lista de quartis vazia devolve quartil null sem quebrar a conta', () => {
    const r = calcularProjecao({ ...BASE, recebido: 50_000, quartis: [] })!;
    expect(r.quartil).toBeNull();
    expect(r.proximo).toBeNull();
    expect(r.paraSubir).toBeNull();
    expect(r.projecaoPct).toBeGreaterThan(0);
  });
});

describe('calcularProjecao — limitePct', () => {
  // Preserva a divergência histórica: o header pessoal limitava em 999,
  // a tabela de quartis não limitava.
  const absurdo = { ...BASE, recebido: 130_000 * 500 };

  it('sem limitePct devolve a % bruta (comportamento de QuartisOperadores)', () => {
    expect(calcularProjecao(absurdo)!.projecaoPct).toBeGreaterThan(999);
  });

  it('com limitePct 999 satura (comportamento de MetaProgressoHeader)', () => {
    expect(calcularProjecao({ ...absurdo, limitePct: 999 })!.projecaoPct).toBe(999);
  });

  it('o limite não muda o quartil — ambos estão no 1º', () => {
    expect(calcularProjecao(absurdo)!.quartil?.quartil).toBe(1);
    expect(calcularProjecao({ ...absurdo, limitePct: 999 })!.quartil?.quartil).toBe(1);
  });
});

describe('pctLimitado', () => {
  it('arredonda e limita', () => {
    expect(pctLimitado(50, 100)).toBe(50);
    expect(pctLimitado(1_000_000, 100)).toBe(999);
    expect(pctLimitado(1_000_000, 100, 200)).toBe(200);
  });

  it('base zero ou negativa devolve 0, não NaN nem Infinity', () => {
    expect(pctLimitado(100, 0)).toBe(0);
    expect(pctLimitado(100, -5)).toBe(0);
  });
});

describe('ultimoDiaComRecebimento', () => {
  const porDia = {
    1:  { bruto: 611.62, qtd: 3 },
    8:  { bruto: 10_789.01, qtd: 40 },
    10: { bruto: 18_384.11, qtd: 121 },
    11: { bruto: 4_667.80, qtd: 12 },
  };

  it('devolve o dia anterior com movimento, com valor e quantidade', () => {
    expect(ultimoDiaComRecebimento(porDia, 11)).toEqual({
      dia: 10, bruto: 18_384.11, qtd: 121,
    });
  });

  it('pula dias sem recebimento', () => {
    expect(ultimoDiaComRecebimento(porDia, 10)?.dia).toBe(8);
  });

  it('ignora dia presente mas zerado', () => {
    const comZero = { ...porDia, 9: { bruto: 0, qtd: 0 } };
    expect(ultimoDiaComRecebimento(comZero, 10)?.dia).toBe(8);
  });

  it('nunca devolve o próprio dia de hoje', () => {
    expect(ultimoDiaComRecebimento(porDia, 1)).toBeNull();
  });

  it('devolve null quando nenhum dia anterior teve recebimento', () => {
    expect(ultimoDiaComRecebimento({}, 15)).toBeNull();
  });

  it('mês fechado: hojeDia = diasNoMes + 1 torna todos os dias elegíveis', () => {
    expect(ultimoDiaComRecebimento(porDia, 32)?.dia).toBe(11);
  });

  it('qtd ausente vira 0 em vez de undefined', () => {
    expect(ultimoDiaComRecebimento({ 4: { bruto: 100 } }, 9)).toEqual({
      dia: 4, bruto: 100, qtd: 0,
    });
  });
});
