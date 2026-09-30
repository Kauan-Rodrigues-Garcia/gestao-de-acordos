/**
 * Quem cai na tela mínima (`/m`) — decisão 5 da spec do mobile.
 *
 * Celular + cargo que recebe no próprio nome + sem a escolha «Versão completa»
 * → `/m`. Qualquer outra combinação fica no site de sempre.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHAVE_VERSAO, deveAbrirMobile, ehCelular, gravarVersao, lerVersao, ofereceVersaoCelular,
  type AmbienteTela,
} from './preferencia';

const celular: AmbienteTela = { toqueGrosso: true, largura: 390 };
const desktop: AmbienteTela = { toqueGrosso: false, largura: 1440 };

beforeEach(() => {
  localStorage.clear();
});

describe('ehCelular', () => {
  it('toque grosso e tela estreita é celular', () => {
    expect(ehCelular(celular)).toBe(true);
  });
  it('notebook com tela sensível ao toque não é celular', () => {
    expect(ehCelular({ toqueGrosso: true, largura: 1366 })).toBe(false);
  });
  it('janela estreita de desktop não é celular', () => {
    expect(ehCelular({ toqueGrosso: false, largura: 500 })).toBe(false);
  });
  it('tablet em pé (768) ainda conta', () => {
    expect(ehCelular({ toqueGrosso: true, largura: 768 })).toBe(true);
  });
});

describe('deveAbrirMobile', () => {
  it('operador no celular, sem escolha → tela mínima', () => {
    expect(deveAbrirMobile('operador', celular)).toBe(true);
  });
  it('elite também recebe no próprio nome → tela mínima', () => {
    expect(deveAbrirMobile('elite', celular)).toBe(true);
  });
  it('líder no celular fica no site de sempre (1ª versão é só de quem recebe)', () => {
    expect(deveAbrirMobile('lider', celular)).toBe(false);
  });
  it('sem perfil carregado não redireciona', () => {
    expect(deveAbrirMobile(null, celular)).toBe(false);
  });
  it('operador no desktop fica no site de sempre', () => {
    expect(deveAbrirMobile('operador', desktop)).toBe(false);
  });
  it('quem escolheu «Versão completa» não é redirecionado de novo', () => {
    gravarVersao('completa');
    expect(deveAbrirMobile('operador', celular)).toBe(false);
  });
  it('voltar para a versão para celular apaga a escolha', () => {
    gravarVersao('completa');
    gravarVersao('mobile');
    expect(lerVersao()).toBe('mobile');
    expect(localStorage.getItem(CHAVE_VERSAO)).toBeNull();
    expect(deveAbrirMobile('operador', celular)).toBe(true);
  });
});

describe('localStorage indisponível', () => {
  it('ler que lança vale como «sem escolha»: vai para a tela mínima', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('bloqueado'); };
    try {
      expect(lerVersao()).toBe('mobile');
      expect(deveAbrirMobile('operador', celular)).toBe(true);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
  it('gravar que lança não derruba a tela', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('cheio'); };
    try {
      expect(() => gravarVersao('completa')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('super admin (teste)', () => {
  it('não é redirecionado no celular — usa o site completo', () => {
    expect(deveAbrirMobile('super_admin', celular)).toBe(false);
  });
  it('vê o ícone da versão para celular em qualquer aparelho', () => {
    expect(ofereceVersaoCelular('super_admin', desktop)).toBe(true);
    expect(ofereceVersaoCelular('super_admin', celular)).toBe(true);
  });
  it('operador só vê o ícone no celular; líder nunca', () => {
    expect(ofereceVersaoCelular('operador', celular)).toBe(true);
    expect(ofereceVersaoCelular('operador', desktop)).toBe(false);
    expect(ofereceVersaoCelular('lider', celular)).toBe(false);
  });
});
