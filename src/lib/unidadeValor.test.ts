/**
 * unidadeValor.test.ts
 *
 * O caso que fixa o resto: a meta real da PaguePlay em agosto/2026 é
 * R$ 72.115,38 e vale exatamente R$ 18.000,00 em H.O. Se essa conversão
 * quebrar, o painel passa a cobrar do operador uma meta que não existe.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setHoPercentual, HO_PERCENTUAL_PADRAO } from '@/lib/hoPercentual';
import {
  metaNaUnidade, rotuloUnidade, unidadeOposta, ehUnidadeValida,
  chaveUnidade, lerUnidade, gravarUnidade, UNIDADE_PADRAO,
} from './unidadeValor';

/** Meta de operador da PaguePlay, agosto/2026 — valor real do banco. */
const META_PP = 72115.38;

describe('metaNaUnidade', () => {
  it('converte a meta gravada para H.O. — a 24,96%, 72.115,38 vira 18.000', () => {
    setHoPercentual(0.2496);
    try {
      expect(metaNaUnidade(META_PP, 'ho')).toBeCloseTo(18000, 2);
    } finally {
      setHoPercentual(HO_PERCENTUAL_PADRAO);
    }
  });

  it('é o número da aba Metas, ao centavo: R$ 5.000,00 digitado lê R$ 5.000,00', () => {
    // A aba Metas grava 5000 ÷ 0,2260 = 22.123,89 (centavos) e mostra
    // 22.123,89 × 0,2260 = 4.999,99914 como «5.000,00». O painel tem de mostrar
    // o mesmo — antes, pela proporção do recebido, saía 4.999,98.
    expect(metaNaUnidade(22123.89, 'ho')).toBe(5000);
    // Setor: R$ 1.500.000,00 na aba Metas, e não R$ 1.532.895,71.
    expect(metaNaUnidade(Math.round((1_500_000 / 0.2260) * 100) / 100, 'ho')).toBe(1_500_000);
  });

  it('no padrão novo (22,60%), a mesma meta bruta lê 16.298,08 de H.O.', () => {
    // A meta é gravada em bruto: trocar o percentual muda a LEITURA em H.O.
    expect(metaNaUnidade(META_PP, 'ho')).toBeCloseTo(72115.38 * 0.2260, 2);
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
