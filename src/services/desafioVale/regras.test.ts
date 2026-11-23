import { describe, expect, it } from 'vitest';
import {
  casasDoProximoCupom, comProjecao, contarCupons, cuponsPorOperador, diasDoPeriodo, faixaDoSetor, faixaPiso, faltaParaOPct, faseDoPeriodo,
  metaNoVale, pctProjetado, pixNoPeriodoDoCupom, proximaFaixa, textoDaFaixa,
} from './regras';
import type { FaixaVale, PixDoCupom } from './desafioVale.service';

const FAIXAS: FaixaVale[] = [{ pct: 90, valor: 100 }, { pct: 0, valor: 80 }, { pct: 100, valor: 120 }];

describe('faixas do vale pelo % do setor', () => {
  it('100% ou mais = R$ 120; 90 a 99 = R$ 100; abaixo de 90 = R$ 80', () => {
    expect(faixaDoSetor(100, FAIXAS)?.valor).toBe(120);
    expect(faixaDoSetor(134.2, FAIXAS)?.valor).toBe(120);
    expect(faixaDoSetor(99.99, FAIXAS)?.valor).toBe(100); // cortado: 99,99% não vira 100%
    expect(faixaDoSetor(90, FAIXAS)?.valor).toBe(100);
    expect(faixaDoSetor(89.9, FAIXAS)?.valor).toBe(80);
    expect(faixaDoSetor(0, FAIXAS)?.valor).toBe(80);
  });

  it('setor sem % não tem faixa; o piso é a de baixo', () => {
    expect(faixaDoSetor(null, FAIXAS)).toBeNull();
    expect(faixaPiso(FAIXAS)?.valor).toBe(80);
  });

  it('a próxima faixa', () => {
    expect(proximaFaixa(85, FAIXAS)?.valor).toBe(100);
    expect(proximaFaixa(95, FAIXAS)?.valor).toBe(120);
    expect(proximaFaixa(101, FAIXAS)).toBeNull();
  });

  it('o texto de cada faixa', () => {
    const [alta, media, baixa] = [FAIXAS[2], FAIXAS[0], FAIXAS[1]];
    expect(textoDaFaixa(alta, FAIXAS)).toBe('100% ou mais');
    expect(textoDaFaixa(media, FAIXAS)).toBe('de 90% a 99%');
    expect(textoDaFaixa(baixa, FAIXAS)).toBe('abaixo de 90%');
  });

  it('quanto falta para o setor chegar a um %', () => {
    expect(faltaParaOPct(800_000, 1_000_000, 90)).toBe(100_000);
    expect(faltaParaOPct(950_000, 1_000_000, 90)).toBe(0);
    expect(faltaParaOPct(1, null, 90)).toBeNull();
  });
});

describe('o período', () => {
  it('23 a 30/11 tem 8 dias, com o fim de semana', () => {
    const d = diasDoPeriodo('2026-11-23', '2026-11-30');
    expect(d).toHaveLength(8);
    expect(d[0]).toBe('2026-11-23');
    expect(d[7]).toBe('2026-11-30');
  });
  it('a fase', () => {
    expect(faseDoPeriodo('2026-11-23', '2026-11-30', '2026-11-22')).toBe('antes');
    expect(faseDoPeriodo('2026-11-23', '2026-11-30', '2026-11-30')).toBe('durante');
    expect(faseDoPeriodo('2026-11-23', '2026-11-30', '2026-12-01')).toBe('depois');
  });
});

describe('as 9 médias', () => {
  const regras = { inicio: '2026-11-23', fim: '2026-11-30', medias: 9 };
  // Novembro/2026: 21 dias úteis − Finados (02) − Consciência Negra (20) = 19.
  const feriados = ['2026-11-02', '2026-11-20'];

  it('média = meta do mês ÷ dias úteis; 9 médias é a meta', () => {
    const m = metaNoVale(regras, 190_000, { '2026-11-23': 30_000 }, feriados, '2026-11-24');
    expect(m.diasUteisMes).toBe(19);
    expect(m.mediaDiaria).toBe(10_000);
    expect(m.meta).toBe(90_000);
    expect(m.feito).toBe(30_000);
    expect(m.medias).toBe(3);
    expect(m.falta).toBe(60_000);
    expect(m.bateu).toBe(false);
    // 24 a 30/11: ter, qua, qui, sex e seg = 5 dias úteis.
    expect(m.diasUteisRestantes).toBe(5);
    expect(m.porDiaUtil).toBe(12_000);
  });

  it('pagamento de sábado conta; batendo, não pede mais nada', () => {
    const m = metaNoVale(regras, 190_000, { '2026-11-23': 50_000, '2026-11-28': 40_000, '2026-11-20': 99_999 }, feriados, '2026-11-30');
    expect(m.feito).toBe(90_000); // o dia 20 é antes do desafio
    expect(m.bateu).toBe(true);
    expect(m.medias).toBe(9);
    expect(m.porDiaUtil).toBeNull();
  });

  it('sem meta no mês, a regra não vale', () => {
    const m = metaNoVale(regras, 0, {}, feriados, '2026-11-23');
    expect(m.meta).toBeNull();
    expect(m.bateu).toBe(false);
  });

  it('depois do fim, não sobra dia', () => {
    const m = metaNoVale(regras, 190_000, {}, feriados, '2026-12-01');
    expect(m.diasUteisRestantes).toBe(0);
    expect(m.porDiaUtil).toBeNull();
  });
});

describe('cupons do Pix', () => {
  const pix = (operador_id: string, status: PixDoCupom['status']): PixDoCupom => ({
    id: Math.random().toString(36), operador_id, operador_nome: null, setor_id: null, nr_cliente: '1', status, criado_em: '2026-11-23T15:00:00Z',
  });

  it('a cada 3 aprovados, 1 cupom; pendente não conta ainda', () => {
    const c = contarCupons([...Array(7)].map(() => pix('a', 'aprovado')).concat([pix('a', 'pendente'), pix('a', 'pendente'), pix('a', 'desaprovado')]), 3);
    expect(c).toMatchObject({ aprovados: 7, pendentes: 2, desaprovados: 1, cupons: 2, sobra: 1, faltamParaOProximo: 2, cuponsSeAprovar: 3 });
  });

  it('por operador', () => {
    const m = cuponsPorOperador([pix('a', 'aprovado'), pix('a', 'aprovado'), pix('a', 'aprovado'), pix('b', 'pendente')], 3);
    expect(m.get('a')?.cupons).toBe(1);
    expect(m.get('b')?.cupons).toBe(0);
    expect(m.get('b')?.pendentes).toBe(1);
  });

  it('o período é o dia de São Paulo', () => {
    const d = { cupom_ativo: true, cupom_inicio: '2026-11-23', cupom_fim: '2026-11-26' };
    expect(pixNoPeriodoDoCupom('2026-11-23T03:00:00Z', d)).toBe(true);   // 00:00 de 23 em SP
    expect(pixNoPeriodoDoCupom('2026-11-23T02:59:00Z', d)).toBe(false);  // 23:59 de 22 em SP
    expect(pixNoPeriodoDoCupom('2026-11-27T02:30:00Z', d)).toBe(true);   // 23:30 de 26 em SP
    expect(pixNoPeriodoDoCupom('2026-11-27T03:00:00Z', d)).toBe(false);
    expect(pixNoPeriodoDoCupom('2026-11-24T12:00:00Z', { ...d, cupom_ativo: false })).toBe(false);
  });
});

describe('as casas do próximo cupom', () => {
  it('1 aprovado sobrando e 1 pendente: ok, espera, falta', () => {
    expect(casasDoProximoCupom({ sobra: 1, pendentes: 1 }, 3)).toEqual(['ok', 'espera', 'falta']);
  });
  it('pendentes demais só ocupam o que cabe', () => {
    expect(casasDoProximoCupom({ sobra: 0, pendentes: 5 }, 3)).toEqual(['espera', 'espera', 'espera']);
  });
  it('nada ainda: tudo falta', () => {
    expect(casasDoProximoCupom({ sobra: 0, pendentes: 0 }, 3)).toEqual(['falta', 'falta', 'falta']);
  });
});

describe('a projeção do setor (a conta do Painel)', () => {
  // Novembro/2026: 21 dias úteis − Finados (02) − Consciência Negra (20) = 19.
  const regua = { feriados: ['2026-11-02', '2026-11-20'], contarDiaAtual: false };

  it('em 23/11, sem contar hoje: 13 dias passados de 19 → 65% realizado projeta 95%', () => {
    expect(pctProjetado(650_000, 1_000_000, regua, '2026-11-30', '2026-11-23')).toBeCloseTo(95, 1);
  });
  it('contando hoje: 14 dias → 88,21%', () => {
    expect(pctProjetado(650_000, 1_000_000, { ...regua, contarDiaAtual: true }, '2026-11-30', '2026-11-23')).toBeCloseTo(88.21, 1);
  });
  it('passado o mês, a projeção é o realizado', () => {
    expect(pctProjetado(650_000, 1_000_000, regua, '2026-11-30', '2026-12-01')).toBe(65);
  });
  it('sem meta, sem projeção', () => {
    expect(pctProjetado(650_000, null, regua, '2026-11-30', '2026-11-23')).toBeNull();
  });

  const setor = {
    setor_id: 's', nome: 'Play 1', cidade: null, regra: 'nosso_produto', participa: true,
    pct: 65, origem: 'automatico' as const, pct_manual: null, pct_auto: 65, recebido: 650_000, meta: 1_000_000,
  };
  it('durante o mês, o vale segue a projeção (e guarda o realizado)', () => {
    const s = comProjecao(setor, regua, '2026-11-30', '2026-11-23', false);
    expect(s.origem).toBe('projecao');
    expect(s.pct).toBeCloseTo(95, 1);
    expect(s.pct_realizado).toBe(65);
    expect(faixaDoSetor(s.pct, FAIXAS)?.valor).toBe(100);   // pelo realizado seria R$ 80
  });
  it('o manual e o fechamento confirmado não mudam; Cofen não projeta', () => {
    expect(comProjecao({ ...setor, origem: 'manual', pct: 88, pct_manual: 88 }, regua, '2026-11-30', '2026-11-23', false).pct).toBe(88);
    expect(comProjecao(setor, regua, '2026-11-30', '2026-11-23', true).pct).toBe(65);
    expect(comProjecao({ ...setor, regra: 'cofen' }, regua, '2026-11-30', '2026-11-23', false).origem).toBe('automatico');
  });
});
