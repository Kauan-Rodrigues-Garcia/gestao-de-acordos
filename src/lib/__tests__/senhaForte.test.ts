import { describe, expect, it } from 'vitest';
import { problemaDaSenha } from '../senhaForte';

describe('régua da senha própria', () => {
  it('recusa a senha inicial e as vizinhas', () => {
    expect(problemaDaSenha('12345')).toMatch(/ao menos 6/);
    expect(problemaDaSenha('123456')).toMatch(/letra e um número/);
    expect(problemaDaSenha('12345678')).toMatch(/letra e um número/);
    expect(problemaDaSenha('a1234567')).toMatch(/fácil demais/);
    expect(problemaDaSenha('Senha2026')).toMatch(/fácil demais/);
    expect(problemaDaSenha('mundial99')).toMatch(/fácil demais/);
  });

  it('exige letra e número', () => {
    expect(problemaDaSenha('abcdxyzw')).toMatch(/letra e um número/);
    expect(problemaDaSenha('98127364')).toMatch(/letra e um número/);
  });

  it('recusa repetição', () => {
    expect(problemaDaSenha('aaaa1111')).toMatch(/repete/);
  });

  it('recusa o próprio nome ou login dentro da senha', () => {
    const dono = { usuario: 'maria_silva', nome: 'Maria Conceição Silva' };
    expect(problemaDaSenha('maria2026x', dono)).toMatch(/nome nem o seu login/);
    expect(problemaDaSenha('xSILVA4827', dono)).toMatch(/nome nem o seu login/);
    expect(problemaDaSenha('Conceicao77', dono)).toMatch(/nome nem o seu login/);
  });

  it('pedaço curto do nome não trava a senha', () => {
    expect(problemaDaSenha('anel4827tk', { usuario: 'ana_sa', nome: 'Ana Sá' })).toBeNull();
  });

  it('aceita uma senha razoável', () => {
    expect(problemaDaSenha('cafe7mesa42', { usuario: 'joao_pereira' })).toBeNull();
    expect(problemaDaSenha('k7m4px')).toBeNull();
    expect(problemaDaSenha('gato27')).toBeNull();
  });

  it('teto de 72 (o bcrypt ignora o resto)', () => {
    expect(problemaDaSenha(`a1${'x'.repeat(71)}`)).toMatch(/no máximo 72/);
  });
});
