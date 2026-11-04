/**
 * premio.test.ts — o percentual da faixa digitado como prêmio em reais.
 */
import { describe, it, expect } from 'vitest';
import type { ConfigComissao } from '@/services/comissao/comissao';
import { metasDeReferenciaPorConfig, metasEmComum, pctDoPremio, premioDoPct } from './premio';

function config(over: Partial<ConfigComissao>): ConfigComissao {
  return {
    id: 'padrao', empresaId: 'e', setorId: 's', equipeId: null, subgrupoId: null, pessoasDoSubgrupo: [],
    grupoUsuarios: false, usuarioIds: [], ano: 2026, mes: 10, modoIndireta: 'junto',
    pctIndireta: null, pctIndiretaEspecial: null, regraSetor: 'percentual_especial', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null, faixas: [],
    ...over,
  };
}

describe('pctDoPremio × premioDoPct', () => {
  it('a planilha do Receptivo: o percentual paga o prêmio exato na meta', () => {
    const casos: [number, number][] = [
      [300, 90_000], [467, 70_000], [403.7, 53_333.33], [1_003, 93_333.33], [514.8, 56_666.67], [1_593, 86_666.67],
    ];
    for (const [premio, meta] of casos) {
      expect(premioDoPct(pctDoPremio(premio, meta), meta)).toBe(premio);
    }
  });

  it('seis casas, como o banco guarda', () => {
    expect(pctDoPremio(300, 90_000)).toBe(0.333333);
    expect(pctDoPremio(1_350, 100_000)).toBe(1.35);
  });

  it('sem prêmio ou sem meta não há percentual', () => {
    expect(pctDoPremio(0, 90_000)).toBeNull();
    expect(pctDoPremio(300, 0)).toBeNull();
    expect(premioDoPct(null, 90_000)).toBeNull();
  });
});

describe('metasEmComum', () => {
  it('faixa igual para todos vira referência; faixa diferente fica nula', () => {
    expect(metasEmComum([[30_000, 40_000, 50_000], [30_000, 45_000, 50_000]])).toEqual([30_000, null, 50_000]);
  });

  it('faixa que só alguns têm fica nula', () => {
    expect(metasEmComum([[30_000, 40_000], [30_000]])).toEqual([30_000, null]);
  });

  it('ninguém com meta: nada a mostrar', () => {
    expect(metasEmComum([])).toEqual([]);
  });
});

describe('metasDeReferenciaPorConfig', () => {
  const configs = [
    config({ id: 'padrao' }),
    config({ id: 'novatos', grupoUsuarios: true, usuarioIds: ['a', 'b'] }),
  ];
  const op = (id: string) => ({ id, setorOrigemId: 's', equipeOrigemId: null });

  it('cada pessoa conta na configuração que vale para ela', () => {
    const mapa = metasDeReferenciaPorConfig({
      configs,
      setorId: 's',
      operadores: [op('a'), op('b'), op('c'), op('d')],
      metas: [
        { tipo: 'operador', referencia_id: 'a', meta_valor: 30_000, metas_extras: [40_000] },
        { tipo: 'operador', referencia_id: 'b', meta_valor: 30_000, metas_extras: [40_000] },
        { tipo: 'operador', referencia_id: 'c', meta_valor: 70_000, metas_extras: [80_000] },
        { tipo: 'operador', referencia_id: 'd', meta_valor: 56_000, metas_extras: [80_000] },
      ],
    });
    expect(mapa.get('novatos')).toEqual([30_000, 40_000]);
    expect(mapa.get('padrao')).toEqual([null, 80_000]);
  });

  it('quem é de outro setor ou não tem meta não entra', () => {
    const mapa = metasDeReferenciaPorConfig({
      configs,
      setorId: 's',
      operadores: [op('a'), { id: 'x', setorOrigemId: 'outro', equipeOrigemId: null }, op('b')],
      metas: [
        { tipo: 'operador', referencia_id: 'a', meta_valor: 30_000, metas_extras: [] },
        { tipo: 'operador', referencia_id: 'x', meta_valor: 99_000, metas_extras: [] },
      ],
    });
    expect(mapa.get('novatos')).toEqual([30_000]);
    expect(mapa.has('padrao')).toBe(false);
  });
});
