import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarMapaOnline, lerAviso, type AvisoPresenca } from '../presencaAoVivo';

const entrou = (pessoa: string, em: number, empresa: string | null = 'e1'): AvisoPresenca => ({ tipo: 'entrou', pessoa, empresa, em });
const saiu   = (pessoa: string, em: number): AvisoPresenca => ({ tipo: 'saiu', pessoa, empresa: 'e1', em });

describe('lerAviso', () => {
  it('aceita o formato do banco e recusa o resto', () => {
    expect(lerAviso({ tipo: 'entrou', pessoa: 'a', empresa: 'e1', em: 10 })).toEqual(entrou('a', 10));
    expect(lerAviso({ tipo: 'saiu', pessoa: 'a', empresa: null, em: '12' })).toEqual({ tipo: 'saiu', pessoa: 'a', empresa: null, em: 12 });
    expect(lerAviso({ tipo: 'outro', pessoa: 'a', em: 1 })).toBeNull();
    expect(lerAviso({ tipo: 'entrou', em: 1 })).toBeNull();
    expect(lerAviso({ tipo: 'entrou', pessoa: 'a', em: 'x' })).toBeNull();
    expect(lerAviso(null)).toBeNull();
  });
});

describe('criarMapaOnline', () => {
  let aoMudar: ReturnType<typeof vi.fn>;
  const ids = (m: { linhas(): [string, string | null][] }) => m.linhas().map(([p]) => p).sort();

  beforeEach(() => { vi.useFakeTimers(); aoMudar = vi.fn(); });
  afterEach(() => { vi.useRealTimers(); });

  it('«entrou» aparece na hora', () => {
    const m = criarMapaOnline({ graca: 15_000, aoMudar });
    m.aplicarLista([['a', 'e1']], 100);
    m.aplicarAviso(entrou('b', 200));
    expect(ids(m)).toEqual(['a', 'b']);
  });

  it('«saiu» espera a graça antes de tirar', () => {
    const m = criarMapaOnline({ graca: 15_000, aoMudar });
    m.aplicarLista([['a', 'e1'], ['b', 'e1']], 100);
    m.aplicarAviso(saiu('b', 200));
    vi.advanceTimersByTime(14_999);
    expect(ids(m)).toEqual(['a', 'b']);
    vi.advanceTimersByTime(1);
    expect(ids(m)).toEqual(['a']);
  });

  it('F5: «saiu» seguido de «entrou» dentro da graça não pisca', () => {
    const m = criarMapaOnline({ graca: 15_000, aoMudar });
    m.aplicarLista([['a', 'e1'], ['b', 'e1']], 100);
    m.aplicarAviso(saiu('b', 200));
    vi.advanceTimersByTime(4_000);
    m.aplicarAviso(entrou('b', 4_200));
    vi.advanceTimersByTime(30_000);
    expect(ids(m)).toEqual(['a', 'b']);
  });

  it('lista atrasada não apaga quem entrou depois dela', () => {
    const m = criarMapaOnline({ graca: 15_000, aoMudar });
    m.aplicarAviso(entrou('novo', 500));
    m.aplicarLista([['a', 'e1']], 400);   // lida antes da entrada
    expect(ids(m)).toEqual(['a', 'novo']);
    m.aplicarLista([['a', 'e1']], 900);   // lida depois e sem ela: a lista manda
    expect(ids(m)).toEqual(['a']);
  });

  it('lista sem a pessoa em espera de saída mantém a espera até o fim', () => {
    const m = criarMapaOnline({ graca: 15_000, aoMudar });
    m.aplicarLista([['a', 'e1'], ['b', 'e1']], 100);
    m.aplicarAviso(saiu('b', 200));
    m.aplicarLista([['a', 'e1']], 300);   // o F5 ainda não bateu
    expect(ids(m)).toEqual(['a', 'b']);
    m.aplicarAviso(entrou('b', 3_000));
    vi.advanceTimersByTime(20_000);
    expect(ids(m)).toEqual(['a', 'b']);
  });

  it('lista mais nova que o «saiu» e com a pessoa cancela a espera', () => {
    const m = criarMapaOnline({ graca: 15_000, aoMudar });
    m.aplicarLista([['a', 'e1'], ['b', 'e1']], 100);
    m.aplicarAviso(saiu('b', 200));
    m.aplicarLista([['a', 'e1'], ['b', 'e1']], 5_000);
    vi.advanceTimersByTime(20_000);
    expect(ids(m)).toEqual(['a', 'b']);
  });

  it('«entrou» com outra empresa troca a empresa da pessoa', () => {
    const m = criarMapaOnline({ graca: 15_000, aoMudar });
    m.aplicarLista([['a', 'e1']], 100);
    m.aplicarAviso(entrou('a', 200, 'e2'));
    expect(m.linhas()).toEqual([['a', 'e2']]);
  });

  it('encerrar para os timers de saída', () => {
    const m = criarMapaOnline({ graca: 15_000, aoMudar });
    m.aplicarLista([['a', 'e1']], 100);
    m.aplicarAviso(saiu('a', 200));
    m.encerrar();
    vi.advanceTimersByTime(20_000);
    expect(ids(m)).toEqual(['a']);
  });
});
