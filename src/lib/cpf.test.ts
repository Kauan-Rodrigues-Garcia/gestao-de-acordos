/**
 * cpf.test.ts — o reconhecedor de CPF que guarda o campo de código.
 *
 * O que se perde se isto quebrar, nos dois sentidos:
 *   • frouxo demais → CPF de cliente entra no banco, contra a política que a
 *     diretoria fixou em 28/07/2026;
 *   • rígido demais → o operador não consegue tabular um código legítimo e não
 *     entende o motivo. O segundo é o pior dos dois.
 */
import { describe, it, expect } from 'vitest';
import { ehCpf, apenasDigitos } from './cpf';

// CPFs com dígitos verificadores válidos (gerados para o teste, não reais).
const CPF_VALIDO      = '52998224725';
const CPF_VALIDO_2    = '16899535009';
const CPF_MASCARADO   = '529.982.247-25';

describe('apenasDigitos', () => {
  it('tira máscara, espaço e o que mais vier', () => {
    expect(apenasDigitos('529.982.247-25')).toBe('52998224725');
    expect(apenasDigitos(' 529 982 247 25 ')).toBe('52998224725');
  });

  it('nulo e indefinido viram string vazia', () => {
    expect(apenasDigitos(null)).toBe('');
    expect(apenasDigitos(undefined)).toBe('');
    expect(apenasDigitos('')).toBe('');
  });
});

describe('ehCpf — reconhece', () => {
  it('CPF válido, com e sem máscara', () => {
    expect(ehCpf(CPF_VALIDO)).toBe(true);
    expect(ehCpf(CPF_MASCARADO)).toBe(true);
    expect(ehCpf(CPF_VALIDO_2)).toBe(true);
  });

  it('CPF colado com espaços em volta', () => {
    expect(ehCpf('  529.982.247-25  ')).toBe(true);
  });
});

describe('ehCpf — NÃO bloqueia trabalho legítimo', () => {
  it('códigos reais do ERP passam', () => {
    // Conferidos nos relatórios de julho/2026: os códigos de cliente têm 7
    // dígitos e os NrDocumento 8. Se algum deles fosse recusado, o operador
    // ficaria sem conseguir tabular.
    for (const codigo of ['4141294', '3137004', '6016114', '80332997', '12904826', '80409419']) {
      expect(ehCpf(codigo)).toBe(false);
    }
  });

  it('número de 11 dígitos com verificador errado passa', () => {
    // É o preço consciente da precisão: só recusamos o que É um CPF.
    expect(ehCpf('12345678901')).toBe(false);
  });

  it('sequência de um dígito só é recusada como CPF', () => {
    // Passa na conta dos verificadores — o caso clássico que engana validador
    // ingênuo. Não é CPF, mas também não é código: os dois lados concordam.
    for (const seq of ['00000000000', '11111111111', '99999999999']) {
      expect(ehCpf(seq)).toBe(false);
    }
  });

  it('tamanho errado nunca é CPF', () => {
    expect(ehCpf('5299822472')).toBe(false);    // 10
    expect(ehCpf('529982247250')).toBe(false);  // 12
    expect(ehCpf('')).toBe(false);
  });

  it('texto, nulo e indefinido não quebram', () => {
    expect(ehCpf(null)).toBe(false);
    expect(ehCpf(undefined)).toBe(false);
    expect(ehCpf('INS-100')).toBe(false);
    expect(ehCpf('abc')).toBe(false);
    expect(ehCpf({})).toBe(false);
  });

  it('CNPJ não é confundido com CPF', () => {
    // 14 dígitos — fora do escopo desta trava, mas não pode virar falso
    // positivo. Se um dia CNPJ também for bloqueado, é regra separada.
    expect(ehCpf('11222333000181')).toBe(false);
  });
});
