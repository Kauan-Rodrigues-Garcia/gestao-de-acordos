/**
 * O formato do número de WhatsApp.
 *
 * O que estes testes protegem: a NORMALIZAÇÃO. Ela é o que faz
 * `UNIQUE (empresa_id, numero)` significar alguma coisa — se `(18) 99999-9999`
 * e `18999999999` chegarem diferentes ao banco, o mesmo número entra duas vezes
 * e a regra central do módulo ("o mesmo número não deve poder ser cadastrado
 * duas vezes") deixa de valer sem ninguém perceber.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizarNumero,
  numeroValido,
  erroDoNumero,
  mascararNumero,
} from '../numerosFormato';

describe('normalizarNumero', () => {
  it('reduz qualquer máscara ao mesmo dígito', () => {
    const esperado = '18999999999';
    expect(normalizarNumero('(18) 99999-9999')).toBe(esperado);
    expect(normalizarNumero('18 99999 9999')).toBe(esperado);
    expect(normalizarNumero('18.99999.9999')).toBe(esperado);
    expect(normalizarNumero(' 18999999999 ')).toBe(esperado);
    expect(normalizarNumero('18999999999')).toBe(esperado);
  });

  it('tira o 55 do país quando ele sobra', () => {
    expect(normalizarNumero('+55 18 99999-9999')).toBe('18999999999');
    expect(normalizarNumero('5518999999999')).toBe('18999999999');
    // Fixo: 12 dígitos com 55 na frente vira 10.
    expect(normalizarNumero('551833334444')).toBe('1833334444');
  });

  it('não confunde 55 de DDD com 55 de país', () => {
    // DDD 55 é Santa Maria/RS. Onze dígitos já estão prontos — mexer aqui
    // transformaria um número legítimo do RS em outro número.
    expect(normalizarNumero('55999998888')).toBe('55999998888');
  });

  it('não inventa dígito quando o valor é lixo', () => {
    expect(normalizarNumero('')).toBe('');
    expect(normalizarNumero(null)).toBe('');
    expect(normalizarNumero(undefined)).toBe('');
    expect(normalizarNumero('sem número aqui')).toBe('');
  });
});

describe('numeroValido', () => {
  it('aceita celular de 11 e fixo de 10', () => {
    expect(numeroValido('18999999999')).toBe(true);
    expect(numeroValido('1833334444')).toBe(true);
  });

  it('aceita DDD de qualquer região, porque o site vende aleatório', () => {
    for (const ddd of ['11', '18', '47', '68', '95', '99']) {
      expect(numeroValido(`${ddd}999999999`)).toBe(true);
    }
  });

  it('recusa quantidade de dígitos fora de 10 e 11', () => {
    expect(numeroValido('189999999')).toBe(false);   // 9
    expect(numeroValido('189999999999')).toBe(false); // 12
    expect(numeroValido('')).toBe(false);
  });

  it('recusa DDD impossível', () => {
    expect(numeroValido('09999999999')).toBe(false);
    expect(numeroValido('10999999999')).toBe(false);
    expect(numeroValido('00999999999')).toBe(false);
  });

  it('não exige o nono dígito 9', () => {
    // O pedido diz DDD aleatório e número comprado por site. Recusar número
    // real por regra de formato é pior do que aceitar um número torto.
    expect(numeroValido('18899999999')).toBe(true);
  });

  it('normaliza antes de julgar', () => {
    expect(numeroValido('(18) 99999-9999')).toBe(true);
    expect(numeroValido('+55 18 99999-9999')).toBe(true);
  });
});

describe('erroDoNumero', () => {
  it('devolve null quando o número serve', () => {
    expect(erroDoNumero('(18) 99999-9999')).toBeNull();
  });

  it('explica o que está errado, sem jargão', () => {
    expect(erroDoNumero('')).toMatch(/informe/i);
    expect(erroDoNumero('189999999')).toMatch(/10 ou 11/);
    expect(erroDoNumero('09999999999')).toMatch(/DDD/);
  });
});

describe('mascararNumero', () => {
  it('formata celular e fixo', () => {
    expect(mascararNumero('18999999999')).toBe('(18) 99999-9999');
    expect(mascararNumero('1833334444')).toBe('(18) 3333-4444');
  });

  it('formata o que já vem mascarado, sem duplicar parêntese', () => {
    expect(mascararNumero('(18) 99999-9999')).toBe('(18) 99999-9999');
  });

  it('devolve o que recebeu quando não dá para formatar', () => {
    // A tela precisa mostrar ALGUMA coisa. Esconder um número torto é pior
    // do que exibi-lo torto: escondido, ninguém corrige.
    expect(mascararNumero('189')).toBe('189');
    expect(mascararNumero('')).toBe('');
  });
});
