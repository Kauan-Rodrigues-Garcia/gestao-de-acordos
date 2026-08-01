/**
 * previaSom.test.ts — o player único da biblioteca.
 *
 * O que se perde se isto quebrar: volta o defeito de clicar em três músicas e
 * ouvir as três ao mesmo tempo, sem botão de pausa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const paradas: string[] = [];
const tocarMock = vi.fn((url: string) => {
  return () => { paradas.push(url); };
});

vi.mock('./som-comemoracao', () => ({
  tocarArquivoDeSom: (url: string, forcar?: boolean, opcoes?: unknown) =>
    tocarMock(url, forcar as never, opcoes as never),
}));

import {
  tocarPrevia, pausarPrevia, estaTocando, urlTocando, ouvirPrevia, __resetarPrevia,
} from './previaSom';

beforeEach(() => {
  paradas.length = 0;
  tocarMock.mockClear();
  __resetarPrevia();
});

afterEach(() => { vi.useRealTimers(); });

describe('um som por vez', () => {
  it('começar um PARA o anterior', () => {
    tocarPrevia('a.mp3');
    tocarPrevia('b.mp3');

    expect(paradas).toEqual(['a.mp3']);
    expect(urlTocando()).toBe('b.mp3');
  });

  it('três cliques seguidos deixam só o último tocando', () => {
    tocarPrevia('a.mp3');
    tocarPrevia('b.mp3');
    tocarPrevia('c.mp3');

    expect(paradas).toEqual(['a.mp3', 'b.mp3']);
    expect(estaTocando('c.mp3')).toBe(true);
    expect(estaTocando('a.mp3')).toBe(false);
  });
});

describe('play vira pause', () => {
  it('clicar no que já toca pausa em vez de reiniciar', () => {
    tocarPrevia('a.mp3');
    tocarPrevia('a.mp3');

    expect(paradas).toEqual(['a.mp3']);
    expect(urlTocando()).toBeNull();
    // Uma única reprodução: o segundo clique pausou, não tocou de novo.
    expect(tocarMock).toHaveBeenCalledTimes(1);
  });

  it('pausar sem nada tocando não faz nada', () => {
    expect(() => pausarPrevia()).not.toThrow();
    expect(urlTocando()).toBeNull();
  });
});

describe('fim natural', () => {
  it('ao acabar a duração o botão volta para play', () => {
    vi.useFakeTimers();
    tocarPrevia('a.mp3', { duracao: 20 });
    expect(estaTocando('a.mp3')).toBe(true);

    vi.advanceTimersByTime(20_000);
    expect(estaTocando('a.mp3')).toBe(false);
  });

  it('o despertar do fim não derruba um som que começou depois', () => {
    vi.useFakeTimers();
    tocarPrevia('a.mp3', { duracao: 20 });
    vi.advanceTimersByTime(5_000);
    tocarPrevia('b.mp3', { duracao: 20 });

    // Vence o timer do PRIMEIRO som; o segundo tem que continuar.
    vi.advanceTimersByTime(15_000);
    expect(estaTocando('b.mp3')).toBe(true);
  });
});

describe('avisos', () => {
  it('assinante recebe quem está tocando, e null ao pausar', () => {
    const visto: (string | null)[] = [];
    const cancelar = ouvirPrevia((u) => visto.push(u));

    tocarPrevia('a.mp3');
    pausarPrevia();
    cancelar();
    tocarPrevia('b.mp3');

    expect(visto).toEqual(['a.mp3', null]);
  });

  it('assinante que lança não impede os outros de receber', () => {
    const visto: (string | null)[] = [];
    ouvirPrevia(() => { throw new Error('quebrado'); });
    ouvirPrevia((u) => visto.push(u));

    expect(() => tocarPrevia('a.mp3')).not.toThrow();
    expect(visto).toEqual(['a.mp3']);
  });
});

describe('a prévia ignora o mudo', () => {
  it('quem clicou em ouvir pediu para ouvir', () => {
    tocarPrevia('a.mp3');
    expect(tocarMock).toHaveBeenCalledWith('a.mp3', true, undefined);
  });
});
