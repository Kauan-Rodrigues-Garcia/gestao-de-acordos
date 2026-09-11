/**
 * rascunhoConfig.test.ts — o formulário da comissão entre o que se digita e o que se grava.
 *
 * O formulário grava sozinho. Estes casos seguram as três coisas que não podem
 * escapar nessa gravação: faixa sem percentual não vai ao banco, exceção de
 * equipe nunca leva a regra do setor, e reformatar um campo não dispara escrita.
 */
import { describe, it, expect } from 'vitest';
import {
  rascunhoDe, rascunhoParaExcecao, payloadDe, assinaturaDo, faixasSemPct,
  comFaixaNova, semFaixa, type RascunhoConfig,
} from './rascunhoConfig';
import type { ConfigComissao } from '@/services/comissao/comissao';

const ALVO_SETOR = { empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 9 };
const ALVO_EQUIPE = { ...ALVO_SETOR, equipeId: 'eq-x' };

function config(over: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    id: 'cfg', empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 9,
    modoIndireta: 'separado', pctIndireta: 1.5, pctIndiretaEspecial: 3,
    regraSetor: 'percentual_especial', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [
      { ordem: 2, pct: 2.11, pctEspecial: null },
      { ordem: 1, pct: 1.75, pctEspecial: 2 },
    ],
    ...over,
  };
}

function rascunho(over: Partial<RascunhoConfig> = {}): RascunhoConfig {
  return {
    modoIndireta: 'junto', pctIndireta: '', pctIndiretaEspecial: '',
    regraSetor: 'nenhuma', multiplicador: '',
    faixas: [{ ordem: 1, pct: '1,75', pctEspecial: '' }],
    ...over,
  };
}

describe('rascunhoDe', () => {
  it('mês sem configuração começa com uma faixa vazia', () => {
    const r = rascunhoDe(null);
    expect(r.faixas).toEqual([{ ordem: 1, pct: '', pctEspecial: '' }]);
    expect(r.regraSetor).toBe('nenhuma');
    expect(r.modoIndireta).toBe('junto');
  });

  it('ida e volta sem perder valor, com as faixas em ordem', () => {
    const p = payloadDe(rascunhoDe(config()), ALVO_SETOR);
    expect(p).toEqual({
      ...ALVO_SETOR,
      modoIndireta: 'separado', pctIndireta: 1.5, pctIndiretaEspecial: 3,
      regraSetor: 'percentual_especial', multiplicador: null,
      faixas: [
        { ordem: 1, pct: 1.75, pctEspecial: 2 },
        { ordem: 2, pct: 2.11, pctEspecial: null },
      ],
    });
  });
});

describe('payloadDe', () => {
  it('exceção de equipe nunca leva a regra do setor', () => {
    const p = payloadDe(rascunho({ regraSetor: 'multiplicador', multiplicador: '2' }), ALVO_EQUIPE);
    expect(p?.regraSetor).toBe('nenhuma');
    expect(p?.multiplicador).toBeNull();
  });

  it('o multiplicador só vai junto com a regra de multiplicador', () => {
    expect(payloadDe(rascunho({ regraSetor: 'percentual_especial', multiplicador: '2' }), ALVO_SETOR)?.multiplicador)
      .toBeNull();
    expect(payloadDe(rascunho({ regraSetor: 'multiplicador', multiplicador: '2,5' }), ALVO_SETOR)?.multiplicador)
      .toBe(2.5);
  });

  it('faixa sem percentual não vira gravação', () => {
    const r = rascunho({ faixas: [
      { ordem: 1, pct: '1,75', pctEspecial: '' },
      { ordem: 2, pct: '', pctEspecial: '' },
    ] });
    expect(faixasSemPct(r)).toEqual([2]);
    expect(payloadDe(r, ALVO_SETOR)).toBeNull();
  });
});

describe('assinaturaDo', () => {
  it('reformatar um campo não muda a assinatura', () => {
    const a = rascunho({ faixas: [{ ordem: 1, pct: '2,1', pctEspecial: '' }] });
    const b = rascunho({ faixas: [{ ordem: 1, pct: '2,10', pctEspecial: '' }] });
    expect(assinaturaDo(a)).toBe(assinaturaDo(b));
  });

  it('mudar um valor muda a assinatura', () => {
    const a = rascunho({ faixas: [{ ordem: 1, pct: '2,1', pctEspecial: '' }] });
    const b = rascunho({ faixas: [{ ordem: 1, pct: '2,2', pctEspecial: '' }] });
    expect(assinaturaDo(a)).not.toBe(assinaturaDo(b));
  });
});

describe('faixas', () => {
  it('a faixa nova entra no fim', () => {
    const r = comFaixaNova(rascunho({ faixas: [
      { ordem: 1, pct: '1,75', pctEspecial: '' },
      { ordem: 2, pct: '2,11', pctEspecial: '' },
    ] }));
    expect(r.faixas.map(f => f.ordem)).toEqual([1, 2, 3]);
    expect(r.faixas[2]).toEqual({ ordem: 3, pct: '', pctEspecial: '' });
  });

  it('remover renumera as seguintes', () => {
    const r = semFaixa(rascunho({ faixas: [
      { ordem: 1, pct: '1,75', pctEspecial: '' },
      { ordem: 2, pct: '2,11', pctEspecial: '' },
      { ordem: 3, pct: '3,30', pctEspecial: '' },
    ] }), 0);
    expect(r.faixas).toEqual([
      { ordem: 1, pct: '2,11', pctEspecial: '' },
      { ordem: 2, pct: '3,30', pctEspecial: '' },
    ]);
  });

  it('a última faixa não sai — sempre sobra uma', () => {
    expect(semFaixa(rascunho(), 0).faixas).toHaveLength(1);
  });
});

describe('rascunhoParaExcecao', () => {
  it('a exceção nasce com as faixas do padrão e sem a regra do setor', () => {
    const r = rascunhoParaExcecao(config({ regraSetor: 'multiplicador', multiplicador: 2 }));
    expect(r.faixas.map(f => f.pct)).toEqual(['1,75', '2,11']);
    expect(r.regraSetor).toBe('nenhuma');
    expect(r.multiplicador).toBe('');
  });

  it('sem padrão, a exceção começa vazia', () => {
    expect(rascunhoParaExcecao(null).faixas).toEqual([{ ordem: 1, pct: '', pctEspecial: '' }]);
  });
});
