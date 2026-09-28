/**
 * entradaDoOperador.test.ts — de «linha de meta + recebido» para a entrada do cálculo.
 *
 * Dashboard e aba Comissão chegam ao cálculo por caminhos diferentes. Esta
 * função é o ponto em que os dois viram a mesma entrada — é aqui que a unidade
 * da PaguePlay e a origem do clone precisam estar certas.
 */
import { describe, it, expect } from 'vitest';
import { montarEntradaComissao, lerMetasExtras } from './entradaDoOperador';
import type { ConfigComissao } from './comissao';

function config(over: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    id: 'cfg-s1', empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 9,
    modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [{ ordem: 1, pct: 1.75, pctEspecial: null }],
    ...over,
  };
}

const BASE = {
  meta: { meta_valor: 34_000, metas_extras: [37_000, 40_000] },
  recebidoBruto: 150_000,
  recebidoHO: 37_440,
  recebidoIndiretoBruto: 1_200,
  isPaguePlay: false,
  configs: [config()],
  setorOrigemId: 's1',
  equipeOrigemId: null,
};

describe('montarEntradaComissao', () => {
  it('BookPlay mede em bruto, fator 1', () => {
    const e = montarEntradaComissao(BASE);
    expect(e.recebidoDireto).toBe(150_000);
    expect(e.fatorUnidade).toBe(1);
    expect(e.metaBruta).toBe(34_000);
    expect(e.metasExtrasBrutas).toEqual([37_000, 40_000]);
    expect(e.recebidoIndiretoBruto).toBe(1_200);
  });

  /*
   * O fator da PaguePlay é a proporção do PRÓPRIO recebido (H.O. ÷ bruto),
   * não o percentual configurado. BASE tem 37.440 de H.O. sobre 150.000 de
   * bruto — 24,96%, um mês gravado antes de 29/09/2026. Com o configurado
   * (22,60%) a meta encolheria 10% contra um recebido que não encolheu, e a
   * pessoa subiria de faixa sem ter recebido um real a mais.
   */
  it('PaguePlay mede em H.O., com o fator do próprio recebido', () => {
    const e = montarEntradaComissao({ ...BASE, isPaguePlay: true });
    expect(e.recebidoDireto).toBe(37_440);
    expect(e.fatorUnidade).toBeCloseTo(0.2496, 10);
  });

  it('mês gravado a 24,96% com o configurado em 22,60%: a % é a mesma do bruto', () => {
    const e = montarEntradaComissao({ ...BASE, isPaguePlay: true });
    const pctEmHO    = e.recebidoDireto / ((e.metaBruta ?? 0) * e.fatorUnidade);
    const pctEmBruto = BASE.recebidoBruto / BASE.meta.meta_valor;
    expect(pctEmHO).toBeCloseTo(pctEmBruto, 10);
  });

  it('mês do relatório novo (22,60%) também', () => {
    const e = montarEntradaComissao({ ...BASE, isPaguePlay: true, recebidoHO: 33_900 });
    expect(e.fatorUnidade).toBeCloseTo(0.226, 10);
  });

  it('sem recebido ainda, o fator é o percentual configurado', () => {
    const e = montarEntradaComissao({ ...BASE, isPaguePlay: true, recebidoBruto: 0, recebidoHO: 0 });
    expect(e.fatorUnidade).toBe(0.2260);
  });

  it('sem linha de meta, não há meta', () => {
    const e = montarEntradaComissao({ ...BASE, meta: null });
    expect(e.metaBruta).toBeNull();
    expect(e.metasExtrasBrutas).toEqual([]);
    expect(e.metaIndiretaBruta).toBeNull();
  });

  it('meta indireta só existe com a opção ligada e valor positivo', () => {
    expect(montarEntradaComissao({
      ...BASE, meta: { meta_valor: 34_000, meta_indireta_ativa: true, meta_indireta_valor: 5_000 },
    }).metaIndiretaBruta).toBe(5_000);
    expect(montarEntradaComissao({
      ...BASE, meta: { meta_valor: 34_000, meta_indireta_ativa: false, meta_indireta_valor: 5_000 },
    }).metaIndiretaBruta).toBeNull();
  });

  it('a configuração sai da origem do operador, com a exceção da equipe vencendo', () => {
    const excecao = config({ id: 'cfg-x', equipeId: 'eq-x' });
    const e = montarEntradaComissao({ ...BASE, configs: [config(), excecao], equipeOrigemId: 'eq-x' });
    expect(e.config?.id).toBe('cfg-x');
    expect(e.doSetor?.id).toBe('cfg-s1');
  });
});

describe('lerMetasExtras', () => {
  it('coluna ausente ou fora do formato vira lista vazia', () => {
    expect(lerMetasExtras(undefined)).toEqual([]);
    expect(lerMetasExtras('[1,2]')).toEqual([]);
    expect(lerMetasExtras(null)).toEqual([]);
  });

  it('descarta zero e lixo, e converte texto numérico', () => {
    expect(lerMetasExtras([37_000, 0, '40000', 'abc'])).toEqual([37_000, 40_000]);
  });
});
