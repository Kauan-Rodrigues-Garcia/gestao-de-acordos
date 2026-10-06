import { describe, expect, it } from 'vitest';
import { CHARADAS, SIMBOLOS, cifrar, confere, normalizar, sortearCharada } from './charadas';

describe('cifrar', () => {
  it('mesma letra, mesmo sinal — com ou sem acento', () => {
    const casas = cifrar('A ESCURIDÃO', 7);
    const glifo = (i: number) => { const c = casas[i]; return 'espaco' in c ? null : c.glifo; };
    expect(casas[1]).toEqual({ espaco: true });
    expect(glifo(0)).toBe(glifo(9)); // A e Ã
  });

  it('letras diferentes, sinais diferentes, todos entre os 26', () => {
    const casas = cifrar('O guarda-chuva', 42).filter(c => !('espaco' in c)) as { letra: string; glifo: number }[];
    const porLetra = new Map<string, number>();
    for (const c of casas) {
      const antes = porLetra.get(c.letra);
      if (antes !== undefined) expect(c.glifo).toBe(antes);
      porLetra.set(c.letra, c.glifo);
    }
    expect(new Set(porLetra.values()).size).toBe(porLetra.size);
    expect([...porLetra.values()].every(g => g >= 0 && g < SIMBOLOS.length)).toBe(true);
  });

  it('a semente troca a cifra e a mesma semente repete', () => {
    expect(cifrar('O MAPA', 1)).toEqual(cifrar('O MAPA', 1));
    expect(cifrar('O MAPA', 1)).not.toEqual(cifrar('O MAPA', 2));
  });

  it('o hífen vira espaço e a letra guarda o acento para a revelação', () => {
    expect(cifrar('A-É', 3).map(c => ('espaco' in c ? '_' : c.letra)).join('')).toBe('A_É');
  });
});

describe('palpite', () => {
  it('acento, caixa, artigo, hífen e espaço não contam', () => {
    expect(confere('guarda chuva', 'O guarda-chuva')).toBe(true);
    expect(confere('o GUARDA-CHUVA', 'O guarda-chuva')).toBe(true);
    expect(confere('escuridao', 'A escuridão')).toBe(true);
    expect(confere('  Silêncio! ', 'O silêncio')).toBe(true);
  });

  it('errado, vazio ou só o artigo não vale', () => {
    expect(confere('pente', 'O mapa')).toBe(false);
    expect(confere('', 'O mapa')).toBe(false);
    expect(confere('o', 'O mapa')).toBe(false);
  });

  it('artigo sozinho não some (senão «a» viraria vazio)', () => {
    expect(normalizar('a')).toBe('a');
  });
});

describe('sortearCharada', () => {
  it('não repete até todas saírem', () => {
    const vistas: number[] = [];
    for (let i = 0; i < CHARADAS.length; i++) vistas.push(sortearCharada(vistas, Math.random()));
    expect(new Set(vistas).size).toBe(CHARADAS.length);
  });

  it('depois de todas, recomeça', () => {
    const todas = CHARADAS.map((_, i) => i);
    expect(sortearCharada(todas, 0)).toBe(0);
    expect(sortearCharada(todas, 0.9999)).toBe(CHARADAS.length - 1);
  });
});
