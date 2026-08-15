/**
 * mapearTipoComissaoPorCodigo — o mapa que conserta as linhas antigas.
 *
 * O upsert da importação usa `ignoreDuplicates`, então linha que já existe é
 * descartada inteira e nunca recebe a coluna "Tipo comissão" (20260813a). Este
 * mapa é o que o passo de preenchimento usa para dar a classificação do
 * relatório às linhas que ficaram `NULL`.
 */

import { describe, it, expect } from 'vitest';
import { mapearTipoComissaoPorCodigo } from './analitico.service';

describe('mapearTipoComissaoPorCodigo', () => {
  it('mapeia o código para o tipo que o relatório informou', () => {
    const mapa = mapearTipoComissaoPorCodigo([
      { codigo: '1001', tipo_comissao: 'Integral' },
      { codigo: '1002', tipo_comissao: 'Extra' },
    ]);

    expect(mapa.get('1001')).toBe('Integral');
    expect(mapa.get('1002')).toBe('Extra');
    expect(mapa.size).toBe(2);
  });

  it('ignora linha sem "Tipo comissão" — relatório antigo não tem a coluna', () => {
    const mapa = mapearTipoComissaoPorCodigo([
      { codigo: '1001', tipo_comissao: null },
      { codigo: '1002' },
      { codigo: '1003', tipo_comissao: '   ' },
    ]);

    expect(mapa.size).toBe(0);
  });

  it('mesmo código repetido com o MESMO tipo continua valendo', () => {
    const mapa = mapearTipoComissaoPorCodigo([
      { codigo: '1001', tipo_comissao: 'Extra' },
      { codigo: '1001', tipo_comissao: 'Extra' },
    ]);

    expect(mapa.get('1001')).toBe('Extra');
  });

  it('código ambíguo fica de fora — escolher um dos dois seria inventar', () => {
    const mapa = mapearTipoComissaoPorCodigo([
      { codigo: '1001', tipo_comissao: 'Extra' },
      { codigo: '1001', tipo_comissao: 'Integral' },
      { codigo: '1002', tipo_comissao: 'Integral' },
    ]);

    expect(mapa.has('1001')).toBe(false);
    expect(mapa.get('1002')).toBe('Integral');
  });

  it('normaliza o código com espaços — a mesma normalização do insert', () => {
    const mapa = mapearTipoComissaoPorCodigo([
      { codigo: '  1001 ', tipo_comissao: 'Extra' },
    ]);

    expect(mapa.get('1001')).toBe('Extra');
  });

  it('código vazio não entra no mapa', () => {
    const mapa = mapearTipoComissaoPorCodigo([
      { codigo: '   ', tipo_comissao: 'Extra' },
    ]);

    expect(mapa.size).toBe(0);
  });
});
