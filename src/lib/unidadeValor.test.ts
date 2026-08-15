/**
 * unidadeValor.test.ts
 *
 * O caso que fixa o resto: a meta real da PaguePlay em agosto/2026 é
 * R$ 72.115,38 e vale exatamente R$ 18.000,00 em H.O. Se essa conversão
 * quebrar, o painel passa a cobrar do operador uma meta que não existe.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  metaNaUnidade, rotuloUnidade, unidadeOposta, ehUnidadeValida,
  chaveUnidade, lerUnidade, gravarUnidade, UNIDADE_PADRAO,
} from './unidadeValor';

/** Meta de operador da PaguePlay, agosto/2026 — valor real do banco. */
const META_PP = 72115.38;

describe('metaNaUnidade', () => {
  it('converte a meta gravada para H.O. — 72.115,38 vira 18.000', () => {
    expect(metaNaUnidade(META_PP, 'ho')).toBeCloseTo(18000, 2);
  });

  it('devolve a meta intacta em bruto', () => {
    expect(metaNaUnidade(META_PP, 'bruto')).toBe(META_PP);
  });

  it('propaga ausência de meta em vez de virar zero', () => {
    // Zero significaria "meta de R$ 0,00 batida"; null faz o card sumir.
    expect(metaNaUnidade(null, 'ho')).toBeNull();
    expect(metaNaUnidade(undefined, 'bruto')).toBeNull();
    expect(metaNaUnidade(Number.NaN, 'ho')).toBeNull();
  });

  it('preserva a proporção: metade da meta bruta é metade da meta em H.O.', () => {
    const inteira = metaNaUnidade(META_PP, 'ho')!;
    const metade  = metaNaUnidade(META_PP / 2, 'ho')!;
    expect(metade).toBeCloseTo(inteira / 2, 6);
  });
});

describe('rótulos e opostos', () => {
  it('rotula as duas unidades', () => {
    expect(rotuloUnidade('ho')).toBe('H.O.');
    expect(rotuloUnidade('bruto')).toBe('Bruto');
  });

  it('unidadeOposta é involutiva', () => {
    expect(unidadeOposta('ho')).toBe('bruto');
    expect(unidadeOposta(unidadeOposta('ho'))).toBe('ho');
  });

  it('valida a entrada vinda do localStorage', () => {
    expect(ehUnidadeValida('ho')).toBe(true);
    expect(ehUnidadeValida('bruto')).toBe(true);
    expect(ehUnidadeValida('HO')).toBe(false);
    expect(ehUnidadeValida(null)).toBe(false);
  });
});

describe('persistência', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('o padrão é H.O.', () => {
    expect(UNIDADE_PADRAO).toBe('ho');
    expect(lerUnidade('user-1')).toBe('ho');
  });

  it('grava e lê a escolha do usuário', () => {
    gravarUnidade('user-1', 'bruto');
    expect(lerUnidade('user-1')).toBe('bruto');
  });

  it('não vaza a escolha de um usuário para outro na mesma máquina', () => {
    gravarUnidade('user-1', 'bruto');
    expect(lerUnidade('user-2')).toBe('ho');
    expect(chaveUnidade('user-1')).not.toBe(chaveUnidade('user-2'));
  });

  it('valor corrompido no storage cai no padrão', () => {
    window.localStorage.setItem(chaveUnidade('user-1'), 'liquido');
    expect(lerUnidade('user-1')).toBe('ho');
  });

  it('localStorage indisponível não derruba a tela', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('acesso negado');
    });
    expect(lerUnidade('user-1')).toBe('ho');
    expect(() => gravarUnidade('user-1', 'bruto')).not.toThrow();
    spy.mockRestore();
  });
});
