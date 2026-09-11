/**
 * comissao.test.ts — a comissão por faixa de meta.
 *
 * O número vai para o painel de comissão do operador e para a consulta da
 * liderança, e é dinheiro. Estes casos seguram o que o pedido deixou explícito:
 *
 *   • vale a MAIOR faixa atingida — as faixas não somam;
 *   • o % da faixa atual vale sobre o VALOR REALIZADO, e não sobre o valor da
 *     meta (correção de 11/09/2026): meta de R$ 40.000, fez R$ 42.000, a
 *     comissão é sobre os R$ 42.000;
 *   • o % só muda quando a próxima meta é atingida;
 *   • faixa ainda não atingida mostra o mínimo ao chegar lá: meta × %;
 *   • o benefício do setor só existe com regra configurada E confirmação;
 *   • na PaguePlay tudo é medido em H.O.
 */
import { describe, it, expect } from 'vitest';
import {
  calcularComissao, configDoOperador,
  type ConfigComissao, type EntradaComissao,
} from './comissao';

function config(over: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    id: 'cfg-s1', empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 9,
    modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [
      { ordem: 1, pct: 1.75, pctEspecial: null },
      { ordem: 2, pct: 2.11, pctEspecial: null },
      { ordem: 3, pct: 3.30, pctEspecial: null },
      { ordem: 4, pct: 4.03, pctEspecial: null },
    ],
    ...over,
  };
}

/** Operador com as quatro faixas do pedido e R$ 38.450,00 realizados. */
function entrada(over: Partial<EntradaComissao> = {}): EntradaComissao {
  const cfg = over.config === undefined ? config() : over.config;
  return {
    metaBruta: 34_000,
    metasExtrasBrutas: [37_000, 40_000, 43_000],
    metaIndiretaBruta: null,
    recebidoDireto: 38_450,
    recebidoIndiretoBruto: 0,
    fatorUnidade: 1,
    config: cfg,
    doSetor: cfg,
    ...over,
  };
}

const CONFIRMADA = '2026-09-28T14:32:00Z';

describe('as faixas', () => {
  it('o mínimo de cada faixa = meta × %, como na tabela do pedido', () => {
    const r = calcularComissao(entrada({ recebidoDireto: 50_000 }));
    expect(r.faixas.map(f => f.minimo)).toEqual([595, 780.7, 1_320, 1_732.9]);
  });

  it('a comissão atual vale sobre o realizado, não sobre a meta', () => {
    // O exemplo do pedido: meta de R$ 40.000 (3ª), fez R$ 42.000.
    const r = calcularComissao(entrada({ recebidoDireto: 42_000 }));
    expect(r.atual?.ordem).toBe(3);
    expect(r.atual?.comissao).toBe(1_386);
    expect(r.total).toBe(1_386);
  });

  it('o % só muda quando a próxima meta é atingida', () => {
    const quase = calcularComissao(entrada({ recebidoDireto: 42_999.99 }));
    expect(quase.atual?.ordem).toBe(3);
    expect(quase.atual?.pctEfetivo).toBe(3.3);
    expect(quase.total).toBe(1_419);

    const chegou = calcularComissao(entrada({ recebidoDireto: 43_000 }));
    expect(chegou.atual?.ordem).toBe(4);
    expect(chegou.total).toBe(1_732.9);
  });

  it('vale a maior faixa atingida, sem somar as anteriores', () => {
    const r = calcularComissao(entrada());
    expect(r.motivo).toBeNull();
    expect(r.atual?.ordem).toBe(2);
    expect(r.faixas.map(f => f.situacao)).toEqual(['atingida', 'atual', 'proxima', 'nao_atingida']);
  });

  it('meio centavo arredonda para cima', () => {
    // 38.450 × 2,11% = 811,295.
    expect(calcularComissao(entrada()).total).toBe(811.3);
  });

  it('só a faixa atual tem comissão sobre o realizado', () => {
    const r = calcularComissao(entrada());
    expect(r.faixas[1].comissao).toBe(811.3);
    expect(r.faixas[0].comissao).toBeNull();
    expect(r.faixas[2].comissao).toBeNull();
    expect(r.faixas[2].minimo).toBe(1_320);
  });

  it('diz quanto falta para a próxima e para as seguintes', () => {
    const r = calcularComissao(entrada());
    expect(r.proxima?.ordem).toBe(3);
    expect(r.proxima?.falta).toBe(1_550);
    expect(r.faixas[3].falta).toBe(4_550);
    expect(r.faixas[1].falta).toBeNull();
  });

  it('bater exatamente o valor da meta já conta', () => {
    const r = calcularComissao(entrada({ recebidoDireto: 34_000 }));
    expect(r.atual?.ordem).toBe(1);
    expect(r.total).toBe(595);
  });

  it('sem a 1ª meta atingida, diz o motivo e ainda mostra a próxima', () => {
    const r = calcularComissao(entrada({ recebidoDireto: 30_000 }));
    expect(r.motivo).toBe('nenhuma_faixa');
    expect(r.atual).toBeNull();
    expect(r.proxima?.ordem).toBe(1);
    expect(r.proxima?.falta).toBe(4_000);
    expect(r.proxima?.minimo).toBe(595);
    expect(r.total).toBe(0);
  });

  it('ordena as metas extras gravadas fora de ordem', () => {
    const r = calcularComissao(entrada({ metasExtrasBrutas: [43_000, 37_000] }));
    expect(r.faixas.map(f => f.meta)).toEqual([34_000, 37_000, 43_000]);
  });

  it('faixa além das configuradas aparece sem % e não vira a atual', () => {
    const cfg = config({ faixas: [
      { ordem: 1, pct: 1.75, pctEspecial: null },
      { ordem: 2, pct: 2.11, pctEspecial: null },
    ] });
    const r = calcularComissao(entrada({ config: cfg, doSetor: cfg, recebidoDireto: 41_000 }));
    expect(r.faixas[2].atingida).toBe(true);
    expect(r.faixas[2].pctNormal).toBeNull();
    expect(r.faixas[2].minimo).toBeNull();
    expect(r.atual?.ordem).toBe(2);
    expect(r.atual?.comissao).toBe(865.1);
    expect(r.proxima?.ordem).toBe(4);
    expect(r.proxima?.falta).toBe(2_000);
  });
});

describe('sem comissão', () => {
  it('sem meta no mês', () => {
    const r = calcularComissao(entrada({ metaBruta: null }));
    expect(r.motivo).toBe('sem_meta');
    expect(r.faixas).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('sem configuração no mês', () => {
    const r = calcularComissao(entrada({ config: null, doSetor: null }));
    expect(r.motivo).toBe('sem_config');
    expect(r.faixas).toEqual([]);
    expect(r.total).toBe(0);
  });
});

describe('benefício quando o setor bate a meta', () => {
  const faixaEspecial = [{ ordem: 1, pct: 2, pctEspecial: 2.24 }];
  const setorDe32Mil = { metaBruta: 32_000, metasExtrasBrutas: [], recebidoDireto: 32_000 };

  it('% especial confirmado: 2,00% → 2,24%, R$ 640,00 → R$ 716,80', () => {
    const cfg = config({ faixas: faixaEspecial, regraSetor: 'percentual_especial', setorMetaConfirmadaEm: CONFIRMADA });
    const r = calcularComissao(entrada({ ...setorDe32Mil, config: cfg, doSetor: cfg }));
    expect(r.beneficioAtivo).toBe(true);
    expect(r.atual?.pctNormal).toBe(2);
    expect(r.atual?.pctEfetivo).toBe(2.24);
    expect(r.atual?.comissaoNormal).toBe(640);
    expect(r.atual?.comissao).toBe(716.8);
    expect(r.total).toBe(716.8);
    expect(r.totalNormal).toBe(640);
  });

  it('sem confirmação, não liga nada — mas diz o que o benefício faria', () => {
    const cfg = config({ faixas: faixaEspecial, regraSetor: 'percentual_especial' });
    const r = calcularComissao(entrada({ ...setorDe32Mil, config: cfg, doSetor: cfg }));
    expect(r.temRegraSetor).toBe(true);
    expect(r.beneficioAtivo).toBe(false);
    expect(r.atual?.pctEfetivo).toBe(2);
    expect(r.total).toBe(640);
    expect(r.atual?.pctComBeneficio).toBe(2.24);
    expect(r.atual?.comissaoComBeneficio).toBe(716.8);
  });

  it('sem regra no setor, não existe «com benefício»', () => {
    const r = calcularComissao(entrada());
    expect(r.atual?.pctComBeneficio).toBeNull();
    expect(r.atual?.comissaoComBeneficio).toBeNull();
  });

  it('% especial em branco cai no % normal', () => {
    const cfg = config({
      faixas: [{ ordem: 1, pct: 2, pctEspecial: null }],
      regraSetor: 'percentual_especial', setorMetaConfirmadaEm: CONFIRMADA,
    });
    const r = calcularComissao(entrada({ ...setorDe32Mil, config: cfg, doSetor: cfg }));
    expect(r.atual?.pctEfetivo).toBe(2);
  });

  it('multiplicador 2x vale na direta e na indireta, sobre o realizado', () => {
    const cfg = config({
      modoIndireta: 'separado', pctIndireta: 1.5,
      regraSetor: 'multiplicador', multiplicador: 2, setorMetaConfirmadaEm: CONFIRMADA,
    });
    const r = calcularComissao(entrada({
      metaIndiretaBruta: 5_000, recebidoIndiretoBruto: 5_200, config: cfg, doSetor: cfg,
    }));
    expect(r.atual?.comissao).toBe(1_622.59);   // 38.450 × 4,22%
    expect(r.indireta?.comissao).toBe(156);     //  5.200 × 3,00%
    expect(r.total).toBe(1_778.59);
    expect(r.totalNormal).toBe(889.3);          // 811,30 + 78,00
  });

  it('a indireta também diz o que o benefício faria', () => {
    const cfg = config({
      modoIndireta: 'separado', pctIndireta: 1.5, regraSetor: 'multiplicador', multiplicador: 2,
    });
    const r = calcularComissao(entrada({
      metaIndiretaBruta: 5_000, recebidoIndiretoBruto: 5_000, config: cfg, doSetor: cfg,
    }));
    expect(r.indireta?.comissao).toBe(75);
    expect(r.indireta?.pctComBeneficio).toBe(3);
    expect(r.indireta?.comissaoComBeneficio).toBe(150);
  });

  it('a regra e a confirmação vêm da linha do setor, mesmo com exceção de equipe', () => {
    const doSetor = config({ regraSetor: 'multiplicador', multiplicador: 2, setorMetaConfirmadaEm: CONFIRMADA });
    const excecao = config({ id: 'cfg-eq', equipeId: 'eq-x', faixas: [{ ordem: 1, pct: 1, pctEspecial: null }] });
    const r = calcularComissao(entrada({
      metaBruta: 30_000, metasExtrasBrutas: [], recebidoDireto: 31_000, config: excecao, doSetor,
    }));
    expect(r.atual?.pctEfetivo).toBe(2);
    expect(r.atual?.comissao).toBe(620);
  });
});

describe('direta e indireta', () => {
  it('sem meta indireta não há modo', () => {
    expect(calcularComissao(entrada()).modoIndireta).toBeNull();
  });

  it('junto: a 1ª meta é direta + indireta, e o % vale sobre o realizado total', () => {
    const cfg = config({ faixas: [{ ordem: 1, pct: 2, pctEspecial: null }] });
    const r = calcularComissao(entrada({
      metaBruta: 30_000, metasExtrasBrutas: [], metaIndiretaBruta: 5_000,
      recebidoDireto: 33_000, recebidoIndiretoBruto: 2_500, config: cfg, doSetor: cfg,
    }));
    expect(r.modoIndireta).toBe('junto');
    expect(r.recebido).toBe(35_500);
    expect(r.faixas[0].meta).toBe(35_000);
    expect(r.atual?.comissao).toBe(710);
    expect(r.indireta).toBeNull();
  });

  it('junto: só a direta não alcança a meta somada', () => {
    const cfg = config({ faixas: [{ ordem: 1, pct: 2, pctEspecial: null }] });
    const r = calcularComissao(entrada({
      metaBruta: 30_000, metasExtrasBrutas: [], metaIndiretaBruta: 5_000,
      recebidoDireto: 34_000, recebidoIndiretoBruto: 0, config: cfg, doSetor: cfg,
    }));
    expect(r.motivo).toBe('nenhuma_faixa');
  });

  it('separado: a indireta soma à parte quando atingida', () => {
    const cfg = config({ modoIndireta: 'separado', pctIndireta: 1.5 });
    const r = calcularComissao(entrada({
      metaIndiretaBruta: 5_000, recebidoIndiretoBruto: 5_000, config: cfg, doSetor: cfg,
    }));
    expect(r.modoIndireta).toBe('separado');
    expect(r.indireta?.atingida).toBe(true);
    expect(r.indireta?.comissao).toBe(75);
    expect(r.total).toBe(886.3);
  });

  it('separado: acima da meta indireta, o % vale sobre o realizado indireto', () => {
    const cfg = config({ modoIndireta: 'separado', pctIndireta: 1.5 });
    const r = calcularComissao(entrada({
      metaIndiretaBruta: 5_000, recebidoIndiretoBruto: 5_600, config: cfg, doSetor: cfg,
    }));
    expect(r.indireta?.comissao).toBe(84);
    expect(r.indireta?.minimo).toBe(75);
  });

  it('separado: indireta não atingida não soma, e diz quanto falta', () => {
    const cfg = config({ modoIndireta: 'separado', pctIndireta: 1.5 });
    const r = calcularComissao(entrada({
      metaIndiretaBruta: 5_000, recebidoIndiretoBruto: 4_000, config: cfg, doSetor: cfg,
    }));
    expect(r.indireta?.atingida).toBe(false);
    expect(r.indireta?.comissao).toBe(0);
    expect(r.indireta?.falta).toBe(1_000);
    expect(r.indireta?.minimo).toBe(75);
    expect(r.total).toBe(811.3);
  });
});

describe('PaguePlay em H.O.', () => {
  it('converte a meta bruta e aplica o % sobre o realizado H.O.', () => {
    const cfg = config({ faixas: [{ ordem: 1, pct: 1.75, pctEspecial: null }] });
    const r = calcularComissao(entrada({
      metaBruta: 136_217.95, metasExtrasBrutas: [], fatorUnidade: 0.2496,
      recebidoDireto: 34_000, config: cfg, doSetor: cfg,
    }));
    expect(r.faixas[0].meta).toBe(34_000);
    expect(r.atual?.comissao).toBe(595);
  });

  it('converte também a meta e o recebido indiretos', () => {
    const cfg = config({ modoIndireta: 'separado', pctIndireta: 1.5, faixas: [{ ordem: 1, pct: 1.75, pctEspecial: null }] });
    const r = calcularComissao(entrada({
      metaBruta: 136_217.95, metasExtrasBrutas: [], fatorUnidade: 0.2496, recebidoDireto: 34_000,
      metaIndiretaBruta: 20_032.05, recebidoIndiretoBruto: 20_032.05, config: cfg, doSetor: cfg,
    }));
    expect(r.indireta?.meta).toBe(5_000);
    expect(r.indireta?.comissao).toBe(75);
  });
});

describe('configDoOperador', () => {
  const padraoS1 = config();
  const excecaoX = config({ id: 'cfg-x', equipeId: 'eq-x' });
  const padraoS2 = config({ id: 'cfg-s2', setorId: 's2' });
  const configs = [padraoS1, excecaoX, padraoS2];

  it('a exceção da equipe vence o padrão do setor', () => {
    expect(configDoOperador({ configs, setorId: 's1', equipeId: 'eq-x' }))
      .toEqual({ config: excecaoX, doSetor: padraoS1 });
  });

  it('sem exceção, vale o padrão do setor', () => {
    expect(configDoOperador({ configs, setorId: 's1', equipeId: 'eq-y' }))
      .toEqual({ config: padraoS1, doSetor: padraoS1 });
  });

  it('setor sem configuração não herda de outro setor', () => {
    expect(configDoOperador({ configs, setorId: 's3', equipeId: null }))
      .toEqual({ config: null, doSetor: null });
  });

  it('sem setor de origem não há configuração', () => {
    expect(configDoOperador({ configs, setorId: null, equipeId: 'eq-x' }))
      .toEqual({ config: null, doSetor: null });
  });
});
