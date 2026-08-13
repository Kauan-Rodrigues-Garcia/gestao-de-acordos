/**
 * "Tipo comissão" (migration 20260813a) — leitura e classificação.
 *
 * O ponto crítico: a coluna é da BookPlay. A PaguePlay não a tem, e nada no
 * caminho de importação dela pode mudar por causa disto.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCols, classificarComissao, ehComissaoExtra,
} from '@/services/analitico/analiticoComum';

/** Cabeçalho do relatório PaguePlay — sem "Tipo comissão". */
const HEADER_PP = [
  'Cobradora', 'Equipe/SubGrupo', 'Cliente', 'TpDoc', 'DtPgto', 'Recebido', 'TotalHO',
];

/** Cabeçalho BookPlay com a coluna nova. */
const HEADER_BP = [
  'Cobradora', 'Cliente', 'TpDoc', 'DtPgto', 'Recebido', 'Tipo comissão',
];

describe('resolveCols — a coluna é opcional', () => {
  it('PaguePlay sem a coluna continua resolvendo o relatório', () => {
    const cols = resolveCols(HEADER_PP);
    expect(cols).not.toBeNull();
    // A ausência tem que ser silenciosa: nenhum índice para `tc`.
    expect(cols!.tc).toBeUndefined();
  });

  it('BookPlay com a coluna acha o índice certo', () => {
    const cols = resolveCols(HEADER_BP);
    expect(cols).not.toBeNull();
    expect(cols!.tc).toBe(5);
  });

  it('acha com e sem acento, maiúsculas ou espaços', () => {
    for (const rotulo of ['Tipo comissão', 'TIPO COMISSAO', 'tipo de comissão', 'Tipocomissao']) {
      const cols = resolveCols(['Cobradora', 'Cliente', 'TpDoc', 'DtPgto', 'Recebido', rotulo]);
      expect(cols?.tc, `falhou para "${rotulo}"`).toBe(5);
    }
  });

  /**
   * A PaguePlay tem métricas de comissão em REAIS. Se 'comissao' fosse alias,
   * um valor monetário viraria o rótulo do vínculo e todo mundo seria
   * classificado como "direto".
   */
  it('NÃO casa com uma coluna "Comissão" de valor', () => {
    const cols = resolveCols([...HEADER_PP, 'Comissão']);
    expect(cols!.tc).toBeUndefined();
  });

  it('a coluna nova não entra nas obrigatórias — relatório sem ela é aceito', () => {
    expect(resolveCols(HEADER_PP)).not.toBeNull();
  });
});

describe('classificarComissao', () => {
  it('Extra é extra, em qualquer caixa ou acentuação', () => {
    for (const v of ['Extra', 'EXTRA', 'extra', 'Comissão Extra']) {
      expect(classificarComissao(v), v).toBe('extra');
    }
  });

  it('Integral é direto', () => {
    expect(classificarComissao('Integral')).toBe('direto');
    expect(classificarComissao('INTEGRAL')).toBe('direto');
  });

  it('vazio, null e undefined são "não sei" — e não "direto"', () => {
    expect(classificarComissao(null)).toBeNull();
    expect(classificarComissao(undefined)).toBeNull();
    expect(classificarComissao('')).toBeNull();
    expect(classificarComissao('   ')).toBeNull();
  });

  it('valor desconhecido cai em direto, não trava a conta', () => {
    expect(classificarComissao('Outro')).toBe('direto');
  });
});

describe('ehComissaoExtra', () => {
  it('devolve undefined quando não há o que classificar', () => {
    expect(ehComissaoExtra(null)).toBeUndefined();
    expect(ehComissaoExtra('')).toBeUndefined();
  });

  it('true só para extra', () => {
    expect(ehComissaoExtra('Extra')).toBe(true);
    expect(ehComissaoExtra('Integral')).toBe(false);
  });
});
