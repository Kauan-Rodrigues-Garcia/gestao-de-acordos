/**
 * As visões do app por cargo (Cleber, 06/10/2026 — desenho §2.0).
 * Operador NUNCA tem a visão completa de equipe ou setor.
 */
import { describe, expect, it } from 'vitest';
import { acessoDasVisoes, rotaDaVisao, visaoDaBusca } from './visoes';

describe('acessoDasVisoes', () => {
  it('operador: Eu, Equipe e Setor — Equipe e Setor só no Resumo', () => {
    expect(acessoDasVisoes('operador', false)).toEqual({ visoes: ['eu', 'equipe', 'setor'], completo: false });
  });
  it('operador com a chave do Painel do Líder (elite) tem as visões completas', () => {
    expect(acessoDasVisoes('elite', true)).toEqual({ visoes: ['eu', 'equipe', 'setor'], completo: true });
  });
  it('elite sem a chave fica no Resumo, como o operador', () => {
    expect(acessoDasVisoes('elite', false).completo).toBe(false);
  });
  it('líder e gerência: Equipe e Setor completos, sem «Eu»', () => {
    expect(acessoDasVisoes('lider', true)).toEqual({ visoes: ['equipe', 'setor'], completo: true });
    expect(acessoDasVisoes('gerencia', true)).toEqual({ visoes: ['equipe', 'setor'], completo: true });
  });
  it('cargos fora do app: nenhuma visão', () => {
    expect(acessoDasVisoes('diretoria', true).visoes).toEqual([]);
    expect(acessoDasVisoes(null, false).visoes).toEqual([]);
  });
});

describe('rotaDaVisao', () => {
  it('Resumo do operador fica dentro da /m', () => {
    expect(rotaDaVisao('equipe', false)).toBe('/m?visao=equipe');
    expect(rotaDaVisao('setor', false)).toBe('/m?visao=setor');
  });
  it('visões completas vão às telas próprias', () => {
    expect(rotaDaVisao('equipe', true)).toBe('/m/equipe');
    expect(rotaDaVisao('setor', true)).toBe('/m/setor');
    expect(rotaDaVisao('eu', true)).toBe('/m');
  });
  it('a busca da /m escolhe a visão; o resto é «eu»', () => {
    expect(visaoDaBusca('?visao=setor')).toBe('setor');
    expect(visaoDaBusca('?visao=qualquer')).toBe('eu');
    expect(visaoDaBusca('')).toBe('eu');
  });
});
