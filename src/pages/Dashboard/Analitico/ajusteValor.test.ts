/**
 * ajusteValor.test.ts — o campo de valor do ajuste manual.
 *
 * Um campo de dinheiro digitado à mão recebe as duas convenções, porque as duas
 * chegam de gente diferente: quem copia do relatório traz "1.234,56" e quem
 * digita rápido traz "1234.56". Recusar uma delas produz "valor inválido" para
 * quem digitou certo — e este é o campo que decide quanto entra no recebimento
 * de alguém.
 */
import { describe, it, expect } from 'vitest';
import { valorDigitadoParaNumero } from './ajusteValor';

describe('valorDigitadoParaNumero', () => {
  it('aceita a forma brasileira, com milhar e vírgula', () => {
    expect(valorDigitadoParaNumero('1.234,56')).toBe(1234.56);
    expect(valorDigitadoParaNumero('10.000,00')).toBe(10000);
  });

  it('aceita a forma com ponto decimal', () => {
    expect(valorDigitadoParaNumero('1234.56')).toBe(1234.56);
  });

  it('aceita número inteiro simples', () => {
    expect(valorDigitadoParaNumero('2000')).toBe(2000);
  });

  it('ignora R$ e espaços colados pelo copiar-e-colar', () => {
    expect(valorDigitadoParaNumero('R$ 1.500,00')).toBe(1500);
    expect(valorDigitadoParaNumero(' 300 ')).toBe(300);
  });

  it('arredonda para centavos — não deixa passar fração de centavo', () => {
    expect(valorDigitadoParaNumero('10,999')).toBe(11);
    expect(valorDigitadoParaNumero('0,014')).toBe(0.01);
  });

  it('recusa vazio, texto e zero', () => {
    expect(valorDigitadoParaNumero('')).toBeNull();
    expect(valorDigitadoParaNumero('   ')).toBeNull();
    expect(valorDigitadoParaNumero('abc')).toBeNull();
    expect(valorDigitadoParaNumero('0')).toBeNull();
    expect(valorDigitadoParaNumero('0,00')).toBeNull();
  });

  it('recusa negativo digitado — quem decide o sinal é o botão', () => {
    // Duas fontes de verdade para o mesmo sinal já se perderam em telas assim:
    // o campo dizia "-500" e o botão dizia "somar".
    expect(valorDigitadoParaNumero('-500')).toBeNull();
  });
});
