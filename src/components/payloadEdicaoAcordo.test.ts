/**
 * payloadEdicaoAcordo.test.ts — o payload da edição, sem montar tela.
 *
 * Este objeto é gravado por dois caminhos: o salvamento direto e a aprovação de
 * um pedido de autorização (onde quem aplica é o servidor). Os testes existem
 * para os dois nunca gravarem coisas diferentes.
 */
import { describe, it, expect } from 'vitest';
import { montarPayloadEdicao, type EntradaPayloadEdicao } from './payloadEdicaoAcordo';

const BASE: EntradaPayloadEdicao = {
  isPaguePlay: false,
  nomeCliente: '  Maria Silva  ',
  nrCliente:   ' NR-123 ',
  instituicao: '',
  vencimento:  '2026-09-10',
  valorNum:    1000,
  tipo:        'boleto',
  parcelasNum: 1,
  whatsapp:    ' 11999998888 ',
  status:      'verificar_pendente',
  observacoes: '  nota  ',
  estado:      '',
  isExtra:     false,
  tagIds:      [],
  parcelamentoAlterado: false,
  usouQuarentaPct: false,
  numeroParcela: 1,
};

describe('campos básicos', () => {
  it('apara os textos e mantém o que a tela digitou', () => {
    const p = montarPayloadEdicao(BASE);
    expect(p.nome_cliente).toBe('Maria Silva');
    expect(p.nr_cliente).toBe('NR-123');
    expect(p.valor).toBe(1000);
    expect(p.vencimento).toBe('2026-09-10');
  });

  /** Limpar um campo é mandar `null` — não omitir a chave. */
  it('observação vazia vira null, e não some do payload', () => {
    const p = montarPayloadEdicao({ ...BASE, observacoes: '   ' });
    expect('observacoes' in p).toBe(true);
    expect(p.observacoes).toBeNull();
  });

  it('instituição vazia vira null', () => {
    expect(montarPayloadEdicao(BASE).instituicao).toBeNull();
  });

  it('sem tags grava null, não array vazio', () => {
    expect(montarPayloadEdicao(BASE).tag_ids).toBeNull();
    expect(montarPayloadEdicao({ ...BASE, tagIds: ['t-1'] }).tag_ids).toEqual(['t-1']);
  });
});

describe('parcelas por tenant', () => {
  it('BookPlay: qualquer forma parcela, o número vale sempre', () => {
    const p = montarPayloadEdicao({ ...BASE, tipo: 'pix', parcelasNum: 4 });
    expect(p.parcelas).toBe(4);
  });

  it('PaguePlay: forma que não parcela é forçada a 1', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto_pix', parcelasNum: 4,
    });
    expect(p.parcelas).toBe(1);
  });

  it('PaguePlay: forma parcelada mantém o número', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 4,
    });
    expect(p.parcelas).toBe(4);
  });
});

describe('recálculo do parcelamento [PP]', () => {
  /** Sem a flag, os campos de parcela não são tocados. */
  it('não mexe em valor_total quando o parcelamento não mudou', () => {
    const p = montarPayloadEdicao({ ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 4 });
    expect('valor_total' in p).toBe(false);
    expect('usou_quarenta_pct' in p).toBe(false);
  });

  it('rateio simples: o valor da linha é a parcela, o total vai para valor_total', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 4,
      valorNum: 1000, parcelamentoAlterado: true, numeroParcela: 1,
    });
    expect(p.valor_total).toBe(1000);
    expect(p.valor).toBe(250);
    expect(p.usou_quarenta_pct).toBe(false);
    expect(p.numero_parcela).toBe(1);
  });

  it('regra dos 40%: a primeira parcela é 40% do total', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 4,
      valorNum: 1000, parcelamentoAlterado: true,
      usouQuarentaPct: true, numeroParcela: 1,
    });
    expect(p.valor).toBe(400);
    expect(p.usou_quarenta_pct).toBe(true);
  });

  /**
   * Com duas parcelas a regra seria 40% e 60% — não é o acordo que se vendeu.
   * Por isso ela só vale a partir de três.
   */
  it('a regra dos 40% se desliga sozinha com duas parcelas', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 2,
      valorNum: 1000, parcelamentoAlterado: true,
      usouQuarentaPct: true, numeroParcela: 1,
    });
    expect(p.usou_quarenta_pct).toBe(false);
    expect(p.valor).toBe(500);
  });

  it('a linha guarda a parcela CORRENTE, não a primeira', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 4,
      valorNum: 1000, parcelamentoAlterado: true,
      usouQuarentaPct: true, numeroParcela: 3,
    });
    // 40% na primeira, o resto dividido entre as outras três.
    expect(p.valor).toBe(200);
    expect(p.numero_parcela).toBe(3);
  });

  it('reduzir abaixo da parcela corrente não deixa o índice estourar', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 2,
      valorNum: 1000, parcelamentoAlterado: true, numeroParcela: 5,
    });
    expect(p.numero_parcela).toBe(2);
    expect(p.valor).toBe(500);
  });

  it('voltar para parcela única limpa o total e a flag', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 1,
      valorNum: 1000, parcelamentoAlterado: true, usouQuarentaPct: true,
    });
    expect(p.valor_total).toBeNull();
    expect(p.usou_quarenta_pct).toBe(false);
    expect(p.valor).toBe(1000);
  });
});

describe('override do fluxo Direto/Extra', () => {
  it('vence o toggle da tela', () => {
    const p = montarPayloadEdicao({
      ...BASE, isExtra: false,
      override: {
        tipo_vinculo: 'extra',
        vinculo_operador_id: 'op-1',
        vinculo_operador_nome: 'Fulano',
      },
    });
    expect(p.tipo_vinculo).toBe('extra');
    expect(p.vinculo_operador_id).toBe('op-1');
  });

  /** O override entra ANTES do recálculo, que continua mandando no valor. */
  it('não atropela o recálculo de parcelas', () => {
    const p = montarPayloadEdicao({
      ...BASE, isPaguePlay: true, tipo: 'boleto', parcelasNum: 4,
      valorNum: 1000, parcelamentoAlterado: true,
      override: { tipo_vinculo: 'extra', valor: 999 },
    });
    expect(p.tipo_vinculo).toBe('extra');
    expect(p.valor).toBe(250);
  });
});
