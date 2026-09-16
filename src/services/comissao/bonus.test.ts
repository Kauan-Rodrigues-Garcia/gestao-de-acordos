/**
 * bonus.test.ts — o bônus de comissão (pedido de 16/09/2026).
 *
 *   • meta: «R$ 200,00 se bater a 4ª Meta» — vale a meta DA PESSOA;
 *   • valor: «mais R$ 200,00 se fizer R$ 200.000,00»;
 *   • especial: «R$ 20.000,00 numa semana» — só os dias do período contam;
 *   • na PaguePlay o alvo gravado em bruto é medido em H.O.;
 *   • o bônus não soma no total da comissão.
 */
import { describe, it, expect } from 'vitest';
import { calcularBonus, somarPeriodo, totalDosBonus, ultimoDiaDoMes, type BonusComissao } from './bonus';
import { calcularComissao, type ConfigComissao } from './comissao';
import { montarEntradaComissao } from './entradaDoOperador';

function bonus(over: Partial<BonusComissao> = {}): BonusComissao {
  return {
    id: 'b1', empresaId: 'e1', setorId: 's1', ano: 2026, mes: 9,
    tipo: 'meta', metaOrdem: 4, valorAlvo: null, periodoInicio: null, periodoFim: null,
    valorBonus: 200, descricao: null, usuarioIds: ['ana'],
    ...over,
  };
}

const DEGRAUS = [34_000, 37_000, 40_000, 43_000].map((meta, i) => ({ ordem: i + 1, meta }));

function um(b: BonusComissao, over: Partial<Parameters<typeof calcularBonus>[0]> = {}) {
  return calcularBonus({
    bonus: [b], degraus: DEGRAUS, recebido: 38_450, fatorUnidade: 1,
    recebidoPorDia: null, hoje: '2026-09-16', ...over,
  })[0];
}

describe('bônus de meta', () => {
  it('bater a 4ª Meta: falta o que falta para a 4ª', () => {
    const r = um(bonus());
    expect(r).toMatchObject({ alvo: 43_000, realizado: 38_450, falta: 4_550, atingido: false, situacao: 'em_andamento' });
  });

  it('batida, fica garantido', () => {
    const r = um(bonus(), { recebido: 43_000 });
    expect(r).toMatchObject({ atingido: true, situacao: 'atingido', falta: null });
  });

  it('quem não tem a 4ª Meta no mês não tem como bater', () => {
    const r = um(bonus(), { degraus: DEGRAUS.slice(0, 2) });
    expect(r).toMatchObject({ situacao: 'sem_meta', alvo: null, atingido: false });
  });

  it('mês que acabou sem bater: não atingido', () => {
    expect(um(bonus(), { hoje: '2026-10-02' }).situacao).toBe('nao_atingido');
  });
});

describe('bônus de valor', () => {
  it('mais R$ 200,00 se fizer R$ 200.000,00', () => {
    const b = bonus({ tipo: 'valor', metaOrdem: null, valorAlvo: 200_000 });
    expect(um(b, { recebido: 199_999.99 })).toMatchObject({ atingido: false, falta: 0.01 });
    expect(um(b, { recebido: 200_000 })).toMatchObject({ atingido: true });
  });

  it('na PaguePlay o alvo em bruto é medido em H.O.', () => {
    const b = bonus({ tipo: 'valor', metaOrdem: null, valorAlvo: 100_000 });
    const r = um(b, { fatorUnidade: 0.2496, recebido: 24_960 });
    expect(r).toMatchObject({ alvo: 24_960, atingido: true });
  });
});

describe('meta especial', () => {
  const semana = bonus({
    tipo: 'especial', metaOrdem: null, valorAlvo: 20_000,
    periodoInicio: '2026-09-07', periodoFim: '2026-09-11',
  });
  const porDia = {
    '2026-09-05': 9_000,   // antes do período — não conta
    '2026-09-07': 5_000,
    '2026-09-09': 8_000,
    '2026-09-11': 4_000,
    '2026-09-12': 9_000,   // depois — não conta
  };

  it('só os dias do período contam', () => {
    expect(somarPeriodo(porDia, '2026-09-07', '2026-09-11')).toBe(17_000);
    expect(um(semana, { recebidoPorDia: porDia })).toMatchObject({ realizado: 17_000, falta: 3_000, situacao: 'nao_atingido' });
  });

  it('dentro do período, em andamento; antes dele, aguardando', () => {
    expect(um(semana, { recebidoPorDia: porDia, hoje: '2026-09-09' }).situacao).toBe('em_andamento');
    expect(um(semana, { recebidoPorDia: {}, hoje: '2026-09-02' }).situacao).toBe('aguardando');
  });

  it('batida no período, garantida', () => {
    const r = um(semana, { recebidoPorDia: { ...porDia, '2026-09-10': 3_000 } });
    expect(r).toMatchObject({ realizado: 20_000, atingido: true, situacao: 'atingido' });
  });

  it('sem o realizado por dia ainda, não chuta «não atingido»', () => {
    const r = um(semana, { recebidoPorDia: null, hoje: '2026-09-20' });
    expect(r).toMatchObject({ realizado: null, falta: null, atingido: false, situacao: 'em_andamento' });
  });
});

describe('o bônus ao lado da comissão', () => {
  const cfg: ConfigComissao = {
    id: 'cfg', empresaId: 'e1', setorId: 's1', equipeId: null, grupoUsuarios: false, usuarioIds: [],
    ano: 2026, mes: 9, modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [{ ordem: 1, pct: 1, pctEspecial: null }],
  };
  const todos = [
    bonus({ id: 'b-ana', metaOrdem: 1, valorBonus: 150 }),
    bonus({ id: 'b-bruno', metaOrdem: 1, valorBonus: 999, usuarioIds: ['bruno'] }),
    bonus({ id: 'b-valor', tipo: 'valor', metaOrdem: null, valorAlvo: 50_000, valorBonus: 300 }),
  ];

  function da(operadorId: string, configs: ConfigComissao[] = [cfg]) {
    return calcularComissao(montarEntradaComissao({
      meta: { meta_valor: 10_000, metas_extras: [] },
      recebidoBruto: 20_000, recebidoHO: 0, recebidoIndiretoBruto: 0, isPaguePlay: false,
      configs, setorOrigemId: 's1', equipeOrigemId: null, operadorId, bonus: todos, hoje: '2026-09-16',
    }));
  }

  it('só os bônus da pessoa, e o total da comissão não muda', () => {
    const r = da('ana');
    expect(r.bonus.map(b => b.id)).toEqual(['b-ana', 'b-valor']);
    expect(r.total).toBe(200);
    expect(r.totalBonus).toBe(150);
    expect(totalDosBonus(r.bonus)).toBe(150);
  });

  it('sem configuração de comissão no mês, o bônus continua aparecendo', () => {
    const r = da('ana', []);
    expect(r.motivo).toBe('sem_config');
    expect(r.bonus).toHaveLength(2);
    expect(r.totalBonus).toBe(150);
  });
});

it('último dia do mês, fevereiro incluído', () => {
  expect(ultimoDiaDoMes(2026, 9)).toBe('2026-09-30');
  expect(ultimoDiaDoMes(2028, 2)).toBe('2028-02-29');
});
