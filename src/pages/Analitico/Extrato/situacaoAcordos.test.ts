/**
 * A situação do acordo de cada recebimento — `situacaoAcordos.ts`.
 *
 * O resumo do operador passou a dizer o que falta DEPOIS de tabular
 * (16/11/2026). Os casos abaixo são os que enganariam a conta se ela olhasse
 * só o `acordo_id` da linha.
 */
import { describe, it, expect } from 'vitest';
import {
  chaveDoAcordo, codigosTabulados, resumirSituacoes, situacaoDasLinhas,
  type AcordoDoOperador,
} from './situacaoAcordos';

const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id, codigo: '13027352', status_tabulacao: 'tabulado' as const,
  data_pagamento: '2026-11-12', lote_id: 'lote-1', ...extra,
});

const acordo = (id: string, extra: Partial<AcordoDoOperador> = {}): AcordoDoOperador => ({
  id, nr_cliente: '13027352', instituicao: 'BOOKPLAY', status: 'pago', tipo: 'boleto',
  parcelas: 1, numero_parcela: 1, acordo_grupo_id: null,
  vencimento: '2026-11-10', data_pagamento: '2026-11-12', ...extra,
});

const situacao = (linhas: ReturnType<typeof linha>[], acordos: AcordoDoOperador[]) =>
  situacaoDasLinhas(linhas, acordos).get(linhas[0].id);

describe('situacaoDasLinhas', () => {
  it('linha sem acordo do operador é «a tabular» — divergente também', () => {
    expect(situacao([linha('l', { status_tabulacao: 'nao_tabulado' })], [])?.situacao).toBe('a_tabular');
    expect(situacao([linha('l', { status_tabulacao: 'divergente' })], [acordo('a')])?.situacao).toBe('a_tabular');
  });

  it('tabulado e pago, parcela única: em dia', () => {
    expect(situacao([linha('l')], [acordo('a')])?.situacao).toBe('em_dia');
  });

  it('tabulado mas o acordo não está pago: falta marcar pago', () => {
    const r = situacao([linha('l')], [acordo('a', { status: 'verificar_pendente', data_pagamento: null })]);
    expect(r).toEqual({ situacao: 'marcar_pago', acordoId: 'a' });
  });

  it('pago e parcelado sem a próxima parcela: falta reagendar, dizendo qual', () => {
    const r = situacao([linha('l')], [
      acordo('p2', { parcelas: 10, numero_parcela: 2, acordo_grupo_id: 'g' }),
      acordo('p1', { parcelas: 10, numero_parcela: 1, acordo_grupo_id: 'g', vencimento: '2026-10-10', data_pagamento: '2026-10-11' }),
    ]);
    expect(r).toEqual({ situacao: 'reagendar', acordoId: 'p2', parcela: 3, parcelas: 10 });
  });

  it('a próxima parcela agendada, mesmo para outro mês, deixa em dia', () => {
    // O servidor liga a linha ao acordo mais novo (a parcela 3, pendente). Pelo
    // `acordo_id` a linha pareceria «falta marcar pago».
    const r = situacao([linha('l')], [
      acordo('p2', { parcelas: 10, numero_parcela: 2, acordo_grupo_id: 'g' }),
      acordo('p3', {
        parcelas: 10, numero_parcela: 3, acordo_grupo_id: 'g', status: 'verificar_pendente',
        vencimento: '2026-12-10', data_pagamento: null,
      }),
    ]);
    expect(r?.situacao).toBe('em_dia');
  });

  it('última parcela paga não pede reagendamento', () => {
    const r = situacao([linha('l')], [acordo('p3', { parcelas: 3, numero_parcela: 3, acordo_grupo_id: 'g' })]);
    expect(r?.situacao).toBe('em_dia');
  });

  it('recorrente não reagenda', () => {
    const r = situacao([linha('l')], [
      acordo('a', { tipo: 'pix_automatico', parcelas: 12, numero_parcela: 2, acordo_grupo_id: 'g' }),
    ]);
    expect(r?.situacao).toBe('em_dia');
  });

  it('pago só em mês anterior: o pagamento deste mês não está marcado', () => {
    const r = situacao([linha('l')], [acordo('a', { vencimento: '2026-10-10', data_pagamento: '2026-10-12' })]);
    expect(r?.situacao).toBe('marcar_pago');
  });

  it('Extra tabulado no Direto do colega (sem acordo próprio) fica em dia', () => {
    expect(situacao([linha('l')], [])?.situacao).toBe('em_dia');
  });

  it('ajuste manual não cobra acordo', () => {
    // A linha de ajuste é sintética: sem isto ela contaria como «a tabular».
    const r = situacao([linha('l', { lote_id: 'ajuste-manual', status_tabulacao: 'nao_tabulado' })], []);
    expect(r?.situacao).toBe('em_dia');
  });

  describe('regra Cofen: o código casa com a instituição', () => {
    const cofen = (id: string, extra: Partial<AcordoDoOperador> = {}) =>
      acordo(id, { nr_cliente: null, instituicao: '13027352', ...extra });

    it('acha o acordo pela instituição quando não há NR', () => {
      expect(chaveDoAcordo(cofen('a'))).toBe('13027352');
      expect(situacao([linha('l')], [cofen('a', { status: 'verificar_pendente' })])?.situacao).toBe('marcar_pago');
    });

    it('cartão parcelado não reagenda na regra Cofen, e reagenda em Nosso produto', () => {
      const plano = { tipo: 'cartao', parcelas: 6, numero_parcela: 1, acordo_grupo_id: 'g' };
      expect(situacao([linha('l')], [cofen('a', plano)])?.situacao).toBe('em_dia');
      expect(situacao([linha('l')], [acordo('a', plano)])?.situacao).toBe('reagendar');
    });

    it('instituição de Nosso produto é categoria, não chave', () => {
      expect(chaveDoAcordo(acordo('a', { nr_cliente: '999', instituicao: '13027352' }))).toBe('999');
    });
  });
});

describe('resumirSituacoes e codigosTabulados', () => {
  it('soma por situação; linha sem resposta conta em dia', () => {
    const linhas = [linha('a'), linha('b'), linha('c')];
    const mapa = new Map([
      ['a', { situacao: 'marcar_pago' as const }],
      ['b', { situacao: 'reagendar' as const }],
    ]);
    expect(resumirSituacoes(linhas, mapa)).toEqual({ total: 3, a_tabular: 0, marcar_pago: 1, reagendar: 1, em_dia: 1 });
  });

  it('só busca acordo dos códigos tabulados, sem repetir', () => {
    expect(codigosTabulados([
      linha('a'), linha('b'), linha('c', { codigo: ' 55 ' }),
      linha('d', { codigo: '77', status_tabulacao: 'nao_tabulado' }),
    ])).toEqual(['13027352', '55']);
  });
});
