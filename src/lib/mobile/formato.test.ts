/**
 * Formatos da tela mínima e (depois) do aviso de pagamento.
 *
 * O nome do cliente aparece na tela de bloqueio, que é pública: primeiro nome +
 * inicial do último. A forma segue o vocabulário de `lib/formasPagamento`.
 */
import { describe, it, expect } from 'vitest';
import { abreviarCliente, formaDoPagamento, limparNomeCliente, nomeDoCliente, valorCurto } from './formato';

describe('abreviarCliente', () => {
  it('primeiro nome + inicial do último, com maiúscula só na inicial', () => {
    expect(abreviarCliente('MARIA SILVA OLIVEIRA')).toBe('Maria O.');
  });
  it('ignora partícula no fim («de», «da», «dos»)', () => {
    expect(abreviarCliente('joão batista dos')).toBe('João B.');
  });
  it('partícula no meio não atrapalha', () => {
    expect(abreviarCliente('Ana de Souza')).toBe('Ana S.');
  });
  it('nome único fica sozinho', () => {
    expect(abreviarCliente('Rosângela')).toBe('Rosângela');
  });
  it('espaços extras não viram inicial vazia', () => {
    expect(abreviarCliente('  carlos   eduardo  ')).toBe('Carlos E.');
  });
  it('vazio ou nulo vira «Cliente»', () => {
    expect(abreviarCliente('')).toBe('Cliente');
    expect(abreviarCliente(null)).toBe('Cliente');
    expect(abreviarCliente(undefined)).toBe('Cliente');
  });
});

describe('formaDoPagamento', () => {
  it('BookPlay: o detalhe do ERP decide a família', () => {
    expect(formaDoPagamento('boleto_pix', 'Pix')).toMatchObject({ chave: 'pix', rotulo: 'Pix', curto: 'PIX' });
    expect(formaDoPagamento('boleto_pix', 'Boleto Negociação')).toMatchObject({ chave: 'boleto', rotulo: 'Boleto', curto: 'BOL' });
    expect(formaDoPagamento('cartao', 'Cartão de Crédito')).toMatchObject({ chave: 'cartao', rotulo: 'Cartão', curto: 'CART' });
    expect(formaDoPagamento('cartao', 'Cartão Recorrente')).toMatchObject({ chave: 'cartao_recorrente', curto: 'REC' });
    expect(formaDoPagamento('boleto_pix', 'Pix Automático')).toMatchObject({ chave: 'pix_automatico', curto: 'PIX' });
  });

  it('PaguePlay sem detalhe: «Pix/Boleto» consolidado, não «Cofen»', () => {
    const f = formaDoPagamento('boleto_pix', null);
    expect(f.rotulo).toBe('Pix/Boleto');
    expect(f.chave).toBe('boleto_pix');
    expect(f.curto).toBe('PIX/BOL');
  });

  it('PaguePlay cartão sem detalhe', () => {
    expect(formaDoPagamento('cartao', '')).toMatchObject({ chave: 'cartao', rotulo: 'Cartão', curto: 'CART' });
  });

  it('o consolidado do ERP BookPlay continua sendo o «Cofen» do painel', () => {
    expect(formaDoPagamento('boleto_pix', 'Pix/Boleto').chave).toBe('boleto_pix_cofen');
  });

  it('ajuste manual não se passa por forma de pagamento', () => {
    expect(formaDoPagamento('boleto_pix', 'Ajuste manual')).toMatchObject({ chave: 'ajuste', rotulo: 'Ajuste manual', curto: 'AJ' });
  });

  it('rótulo desconhecido fica com o nome do ERP', () => {
    const f = formaDoPagamento('boleto_pix', 'Depósito');
    expect(f.rotulo).toBe('Depósito');
    expect(f.curto).toBe('DEP');
  });

  it('toda forma tem cor', () => {
    expect(formaDoPagamento('boleto_pix', 'Pix').cor).toMatch(/^#/);
  });
});

describe('valorCurto', () => {
  it('abrevia mil e milhão com uma casa', () => {
    expect(valorCurto(41_900)).toBe('R$ 41,9 mil');
    expect(valorCurto(40_000)).toBe('R$ 40 mil');
    expect(valorCurto(1_234_567)).toBe('R$ 1,2 mi');
    expect(valorCurto(850.4)).toBe('R$ 850');
  });
  it('sinal para sobra e falta', () => {
    expect(valorCurto(9_200, { sinal: true })).toBe('+R$ 9,2 mil');
    expect(valorCurto(-1_564, { sinal: true })).toBe('−R$ 1,6 mil');
  });
});

describe('limparNomeCliente', () => {
  it('tira o código grudado na frente do nome, nas formas que aparecem', () => {
    expect(limparNomeCliente('123456 - MARIA SILVA')).toBe('MARIA SILVA');
    expect(limparNomeCliente('98765-JOAO SOUZA')).toBe('JOAO SOUZA');
    expect(limparNomeCliente('4455 ANA LIMA')).toBe('ANA LIMA');
    expect(limparNomeCliente('12/345 : CARLA DIAS')).toBe('CARLA DIAS');
  });
  it('tira o NR da própria linha mesmo curto', () => {
    expect(limparNomeCliente('77 PEDRO ALVES', '77')).toBe('PEDRO ALVES');
  });
  it('nome sem código fica como está', () => {
    expect(limparNomeCliente('MARIA SILVA')).toBe('MARIA SILVA');
    expect(limparNomeCliente('Ana 2ª via')).toBe('Ana 2ª via');
  });
});

describe('nomeDoCliente', () => {
  it('nome completo, com partículas em minúscula', () => {
    expect(nomeDoCliente('123 - MARIA DA SILVA')).toBe('Maria da Silva');
    expect(nomeDoCliente(null)).toBe('Cliente');
  });
  it('abreviado também limpa o código', () => {
    expect(abreviarCliente('123456 - MARIA SILVA OLIVEIRA')).toBe('Maria O.');
  });
});
