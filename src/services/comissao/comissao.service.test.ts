/**
 * comissao.service.test.ts — o que dá para provar sem banco: o calendário do
 * «mês anterior» e a leitura das linhas que o PostgREST devolve.
 */
import { describe, it, expect } from 'vitest';
import { mesAnterior, configDaLinha, type LinhaConfig } from './comissao.service';

describe('mesAnterior', () => {
  it('volta um mês', () => {
    expect(mesAnterior(2026, 9)).toEqual({ ano: 2026, mes: 8 });
  });

  it('janeiro busca dezembro do ano anterior', () => {
    expect(mesAnterior(2026, 1)).toEqual({ ano: 2025, mes: 12 });
  });
});

function linha(over: Partial<LinhaConfig> = {}): LinhaConfig {
  return {
    id: 'cfg', empresa_id: 'e1', setor_id: 's1', equipe_id: null, ano: 2026, mes: 9,
    modo_indireta: 'junto', pct_indireta: null, pct_indireta_especial: null,
    regra_setor: 'nenhuma', multiplicador: null,
    setor_meta_confirmada_em: null, setor_meta_confirmada_por: null, setor_meta_confirmada_por_nome: null,
    comissao_faixas: [],
    ...over,
  };
}

describe('configDaLinha', () => {
  it('numeric chega como texto do PostgREST e vira número', () => {
    const c = configDaLinha(linha({
      pct_indireta: '1.500', multiplicador: '2.000',
      comissao_faixas: [{ ordem: 1, pct: '1.750', pct_especial: '2.000' }],
    }));
    expect(c.pctIndireta).toBe(1.5);
    expect(c.multiplicador).toBe(2);
    expect(c.faixas).toEqual([{ ordem: 1, pct: 1.75, pctEspecial: 2 }]);
  });

  it('faixas saem em ordem, qualquer que seja a ordem da resposta', () => {
    const c = configDaLinha(linha({
      comissao_faixas: [
        { ordem: 2, pct: 2.11, pct_especial: null },
        { ordem: 1, pct: 1.75, pct_especial: null },
      ],
    }));
    expect(c.faixas.map(f => f.ordem)).toEqual([1, 2]);
  });

  it('valor fora da lista cai no padrão seguro', () => {
    const c = configDaLinha(linha({ modo_indireta: 'outro', regra_setor: 'dobro' }));
    expect(c.modoIndireta).toBe('junto');
    expect(c.regraSetor).toBe('nenhuma');
  });

  it('sem faixas na resposta, a configuração não tem faixas', () => {
    expect(configDaLinha(linha({ comissao_faixas: null })).faixas).toEqual([]);
  });

  it('a confirmação da meta do setor atravessa inteira', () => {
    const c = configDaLinha(linha({
      setor_meta_confirmada_em: '2026-09-28T14:32:00Z',
      setor_meta_confirmada_por: 'u1',
      setor_meta_confirmada_por_nome: 'Fulano',
    }));
    expect(c.setorMetaConfirmadaEm).toBe('2026-09-28T14:32:00Z');
    expect(c.setorMetaConfirmadaPorNome).toBe('Fulano');
  });
});
