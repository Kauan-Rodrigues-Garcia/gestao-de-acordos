import { describe, it, expect } from 'vitest';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import {
  metaAtingida, alcanceDaMeta, mediaPorDu, montarLinhaFechamento, resumirFechamento,
  type EntradaLinhaFechamento, type LinhaFechamento,
} from './calculoFechamento';
import { SITUACOES_FECHAMENTO, FORA_DO_FATURAMENTO_TOTAL } from './situacoes';

/** Mês fechado de 22 dias úteis: a projeção é o próprio fechamento ÷ meta. */
function entrada(parcial: Partial<EntradaLinhaFechamento>): EntradaLinhaFechamento {
  return {
    operadorId: parcial.operadorId ?? 'op',
    nome: 'Operador',
    equipeNome: null,
    fechamento: 0,
    meta: null,
    metasExtras: [],
    duTrabalhado: null,
    situacao: null,
    totalUteis: 22,
    decorridos: 22,
    ...parcial,
  };
}

function linha(parcial: Partial<EntradaLinhaFechamento>): LinhaFechamento {
  return montarLinhaFechamento(entrada(parcial), QUARTIS_PADRAO);
}

describe('a linha de exemplo da planilha (paulo_silva)', () => {
  const l = linha({
    fechamento: 201_000, meta: 130_000, duTrabalhado: 16, situacao: 'assiduo',
  });

  it('ALCANCE META = fechamento ÷ meta = 154,62%', () => {
    expect(l.alcance).toBeCloseTo(1.5461538461538462, 12);
    expect((l.alcance! * 100).toFixed(2)).toBe('154.62');
  });

  it('MÉDIA FATURAMENTO D.U. = 201.000 ÷ 16 = 12.562,50', () => {
    expect(l.mediaPorDu).toBe(12_562.5);
  });

  it('o quartil vem das faixas do Gestão — 155% é o 1º', () => {
    expect(l.quartil).toBe(1);
  });

  it('os cards da planilha: faturamento, média por dia útil e por funcionário', () => {
    const r = resumirFechamento([l], QUARTIS_PADRAO);
    expect(r.faturamentoTotal).toBe(201_000);      // L4 = Outros!D25
    expect(r.mediaPorDiaUtil).toBe(12_562.5);      // P4 = Outros!K5
    expect(r.mediaPorFuncionario).toBe(201_000);   // T8 = Outros!D27
  });
});

describe('vazio da planilha vira null', () => {
  it('alcance sem meta, meta zero ou fechamento zero', () => {
    expect(alcanceDaMeta(100, null)).toBeNull();
    expect(alcanceDaMeta(100, 0)).toBeNull();
    expect(alcanceDaMeta(0, 100)).toBeNull();
  });

  it('média por D.U. sem D.U., com D.U. zero ou fechamento zero', () => {
    expect(mediaPorDu(100, null)).toBeNull();
    expect(mediaPorDu(100, 0)).toBeNull();
    expect(mediaPorDu(0, 10)).toBeNull();
  });
});

describe('META ATINGIDA pelos degraus que já existem', () => {
  it('sem meta não há degrau', () => {
    expect(metaAtingida(50_000, null, [60_000])).toBeNull();
  });

  it('abaixo da 1ª meta é 0', () => {
    expect(metaAtingida(39_999.99, 40_000, [45_000])).toBe(0);
  });

  it('bater exatamente a meta conta — a comparação é em centavos', () => {
    expect(metaAtingida(40_000, 40_000, [])).toBe(1);
    expect(metaAtingida(0.1 + 0.2, 0.3, [])).toBe(1);
  });

  it('o maior degrau alcançado entre meta e metas extras', () => {
    expect(metaAtingida(52_000, 40_000, [45_000, 50_000, 60_000])).toBe(3);
    expect(metaAtingida(201_000, 130_000, [150_000, 170_000, 200_000])).toBe(4);
  });

  it('extra zerada não é degrau', () => {
    expect(metaAtingida(10, 5, [0, 0])).toBe(1);
  });
});

describe('quartil igual ao do Analítico', () => {
  it('sem meta não há quartil', () => {
    expect(linha({ fechamento: 10_000 }).quartil).toBeNull();
  });

  it('mês aberto usa o ritmo até hoje, e não o alcance do mês cheio', () => {
    // 11 de 22 dias: metade da meta já é 100% do esperado.
    const l = linha({ fechamento: 50_000, meta: 100_000, decorridos: 11 });
    expect(l.alcance).toBe(0.5);
    expect(l.quartil).toBe(1);
  });

  it('fechamento zero com meta cai no pior quartil, como na aba Quartis', () => {
    expect(linha({ fechamento: 0, meta: 100_000 }).quartil).toBe(4);
  });
});

describe('Outros!D25 — FATURAMENTO TOTAL', () => {
  it('a fórmula deixa de fora LICENÇA e FÉRIAS, e só elas', () => {
    expect([...FORA_DO_FATURAMENTO_TOTAL].sort()).toEqual(['ferias', 'licenca']);
    expect(SITUACOES_FECHAMENTO).toHaveLength(13);
  });

  it('soma quem tem situação, fora licença e férias; quem não tem situação não entra', () => {
    const linhas = [
      linha({ operadorId: 'a', fechamento: 100, situacao: 'assiduo' }),
      linha({ operadorId: 'b', fechamento: 200, situacao: 'desligado' }),
      linha({ operadorId: 'c', fechamento: 400, situacao: 'ferias' }),
      linha({ operadorId: 'd', fechamento: 800, situacao: 'licenca' }),
      linha({ operadorId: 'e', fechamento: 1_600, situacao: null }),
    ];
    const r = resumirFechamento(linhas, QUARTIS_PADRAO);
    expect(r.faturamentoTotal).toBe(300);
    expect(r.somaFechamentos).toBe(3_100);
    // D26 conta as treze — férias e licença continuam no divisor.
    expect(r.comSituacao).toBe(4);
    expect(r.mediaPorFuncionario).toBe(75);
  });
});

describe('Outros!K5 — MÉDIA POR DIA ÚTIL', () => {
  it('é a soma de TODOS os fechamentos ÷ a média dos D.U. preenchidos', () => {
    const linhas = [
      linha({ operadorId: 'a', fechamento: 1_000, duTrabalhado: 10 }),
      linha({ operadorId: 'b', fechamento: 2_000, duTrabalhado: 20 }),
      // Sem D.U.: soma no numerador, fica fora da média (AVERAGE ignora vazio).
      linha({ operadorId: 'c', fechamento: 3_000, duTrabalhado: null }),
    ];
    const r = resumirFechamento(linhas, QUARTIS_PADRAO);
    expect(r.comDu).toBe(2);
    expect(r.mediaPorDiaUtil).toBe(6_000 / 15);
  });

  it('D.U. zero digitado entra na média', () => {
    const r = resumirFechamento([
      linha({ operadorId: 'a', fechamento: 900, duTrabalhado: 0 }),
      linha({ operadorId: 'b', fechamento: 900, duTrabalhado: 18 }),
    ], QUARTIS_PADRAO);
    expect(r.mediaPorDiaUtil).toBe(1_800 / 9);
  });

  it('sem D.U. nenhum, ou média zero, fica vazio (IFERROR)', () => {
    expect(resumirFechamento([linha({ fechamento: 900 })], QUARTIS_PADRAO).mediaPorDiaUtil)
      .toBeNull();
    expect(resumirFechamento([linha({ fechamento: 900, duTrabalhado: 0 })], QUARTIS_PADRAO)
      .mediaPorDiaUtil).toBeNull();
  });
});

describe('Outros!D27 — MÉDIA POR FUNCIONÁRIO', () => {
  it('fica vazia quando ninguém tem situação', () => {
    const r = resumirFechamento([linha({ fechamento: 500 })], QUARTIS_PADRAO);
    expect(r.comSituacao).toBe(0);
    expect(r.mediaPorFuncionario).toBeNull();
  });
});

describe('gráficos', () => {
  const linhas = [
    linha({ operadorId: 'a', fechamento: 120, meta: 100, situacao: 'assiduo' }),
    linha({ operadorId: 'b', fechamento: 90, meta: 100, situacao: 'assiduo' }),
    linha({ operadorId: 'c', fechamento: 10, meta: 100, situacao: 'falta' }),
    linha({ operadorId: 'd', fechamento: 10, situacao: null }),
  ];
  const r = resumirFechamento(linhas, QUARTIS_PADRAO);

  it('funcionários e percentual por quartil, sobre quem tem quartil', () => {
    expect(r.totalComQuartil).toBe(3);
    expect(r.porQuartil.map(q => [q.quartil, q.qtd])).toEqual([[1, 1], [2, 1], [3, 0], [4, 1]]);
    expect(r.porQuartil[0].pct).toBeCloseTo(1 / 3, 10);
  });

  it('funcionários e percentual por situação, na ordem da planilha', () => {
    expect(r.porSituacao.map(s => s.codigo)).toEqual(SITUACOES_FECHAMENTO.map(s => s.codigo));
    const assiduo = r.porSituacao.find(s => s.codigo === 'assiduo')!;
    expect(assiduo.qtd).toBe(2);
    expect(assiduo.pct).toBeCloseTo(2 / 3, 10);
    expect(assiduo.fechamento).toBe(210);
    expect(r.porSituacao.find(s => s.codigo === 'ferias')!.pct).toBe(0);
  });

  it('sem ninguém, os percentuais são zero e não NaN', () => {
    const vazio = resumirFechamento([], QUARTIS_PADRAO);
    expect(vazio.porQuartil.every(q => q.pct === 0)).toBe(true);
    expect(vazio.porSituacao.every(s => s.pct === 0)).toBe(true);
  });
});
