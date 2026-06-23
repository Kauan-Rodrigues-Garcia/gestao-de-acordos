import { describe, it, expect } from 'vitest';
import { extrairDadosPrintPP } from './printParser';

describe('extrairDadosPrintPP', () => {
  it('extrai todos os campos de um boleto parcelado', () => {
    const texto = `
      Código: 5375194
      Cliente: SIMONE MARIA CAVALCANTI DE LIRA
      Forma de pagamento: Boleto
      Parcelas: 4
      Valor total: R$ 1.422,81
      1ª parcela R$ 355,71
      Primeiro vencimento: 23/06/2026
    `;
    const dados = extrairDadosPrintPP(texto);
    expect(dados.instituicao).toBe('5375194');
    expect(dados.tipo).toBe('boleto');
    expect(dados.parcelas).toBe('4');
    expect(dados.vencimento).toBe('2026-06-23');
    expect(dados.valor).toBe('1.422,81');
  });

  it('mapeia PIX como tipo boleto', () => {
    const dados = extrairDadosPrintPP('Forma de pagamento: PIX\nValor: R$ 200,00');
    expect(dados.tipo).toBe('boleto');
  });

  it('não extrai parcelas quando é cartão', () => {
    const texto = `
      Código: 9988776
      Forma de pagamento: Cartão de Crédito
      Parcelas: 6
      Valor total: R$ 600,00
      Vencimento: 10/07/2026
    `;
    const dados = extrairDadosPrintPP(texto);
    expect(dados.tipo).toBe('cartao');
    expect(dados.parcelas).toBeUndefined();
    expect(dados.vencimento).toBe('2026-07-10');
    expect(dados.valor).toBe('600,00');
  });

  it('reconhece formato "4x" para parcelas', () => {
    const dados = extrairDadosPrintPP('Boleto em 4x de R$ 355,70\nValor total R$ 1.422,80');
    expect(dados.parcelas).toBe('4');
  });

  it('usa o maior valor quando não há rótulo "total"', () => {
    const texto = 'Boleto\nParcela: R$ 355,71\nR$ 355,70\nR$ 1.422,81\n02/02/2026';
    const dados = extrairDadosPrintPP(texto);
    expect(dados.valor).toBe('1.422,81');
  });

  it('prefere a data rotulada quando há mais de uma data', () => {
    const texto = `
      Data de cadastro: 01/01/2026
      Data de pagamento: 23/06/2026
      Boleto R$ 100,00
    `;
    const dados = extrairDadosPrintPP(texto);
    expect(dados.vencimento).toBe('2026-06-23');
  });

  it('ignora parcelas fora do intervalo válido (1..12)', () => {
    const dados = extrairDadosPrintPP('Boleto\nParcelas: 99\nR$ 100,00');
    expect(dados.parcelas).toBeUndefined();
  });

  it('retorna objeto vazio para texto irreconhecível', () => {
    expect(extrairDadosPrintPP('texto qualquer sem dados')).toEqual({});
    expect(extrairDadosPrintPP('')).toEqual({});
  });
});
