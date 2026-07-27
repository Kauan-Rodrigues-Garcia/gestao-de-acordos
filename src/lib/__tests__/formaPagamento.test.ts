import { describe, it, expect } from 'vitest';
import { rotuloFormaPagamento, corFormaPagamento } from '../formaPagamento';

describe('rotuloFormaPagamento', () => {
  it('usa forma_detalhe quando presente (BookPlay)', () => {
    expect(rotuloFormaPagamento('boleto_pix', 'Pix Automático')).toBe('Pix Automático');
    expect(rotuloFormaPagamento('cartao', 'Cartão de Crédito')).toBe('Cartão de Crédito');
    expect(rotuloFormaPagamento('boleto_pix', 'Boleto Negociação')).toBe('Boleto Negociação');
  });

  it('cai no rótulo binário canônico sem forma_detalhe (PaguePlay)', () => {
    expect(rotuloFormaPagamento('cartao', null)).toBe('Cartão');
    expect(rotuloFormaPagamento('boleto_pix', null)).toBe('Boleto/Pix');
    expect(rotuloFormaPagamento('boleto_pix', undefined)).toBe('Boleto/Pix');
  });

  it('ignora forma_detalhe vazia ou só espaços', () => {
    expect(rotuloFormaPagamento('cartao', '')).toBe('Cartão');
    expect(rotuloFormaPagamento('cartao', '   ')).toBe('Cartão');
  });

  it('trata forma_pagamento desconhecida como não-cartão', () => {
    expect(rotuloFormaPagamento(null, null)).toBe('Boleto/Pix');
    expect(rotuloFormaPagamento(undefined, undefined)).toBe('Boleto/Pix');
  });
});

describe('corFormaPagamento', () => {
  it('dá cores distintas e estáveis por forma', () => {
    const cores = {
      pix: corFormaPagamento('PIX'),
      pixAuto: corFormaPagamento('PIX Automático'),
      cartao: corFormaPagamento('Cartão de Crédito'),
      recorrenteCartao: corFormaPagamento('Cartão Recorrente'),
      boletoNeg: corFormaPagamento('Boleto Negociação'),
      boletoBanc: corFormaPagamento('Boleto Bancário'),
      recorrente: corFormaPagamento('Recorrente'),
    };
    // Pix Automático não colide com Pix comum
    expect(cores.pixAuto).not.toBe(cores.pix);
    // Cartão recorrente difere de cartão de crédito
    expect(cores.recorrenteCartao).not.toBe(cores.cartao);
    // Boleto bancário difere de boleto negociação
    expect(cores.boletoBanc).not.toBe(cores.boletoNeg);
    // Todas são hex
    for (const c of Object.values(cores)) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('estável entre chamadas', () => {
    expect(corFormaPagamento('PIX')).toBe(corFormaPagamento('PIX'));
  });

  it('fallback para forma desconhecida', () => {
    expect(corFormaPagamento('Qualquer Coisa')).toBe('#6366f1');
  });
});
