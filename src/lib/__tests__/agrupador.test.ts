/**
 * agrupador.test.ts
 *
 * O caso real: uma importação do Analítico insere 2.400 linhas e o Postgres
 * manda 2.400 eventos. O que estes testes garantem é que isso vira um punhado
 * de releituras — e não 2.400 — sem que a tela fique parada durante toda a
 * importação, que é o defeito de um `debounce` puro.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { criarAgrupador } from '@/lib/agrupador';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('criarAgrupador', () => {
  it('não dispara antes da janela de silêncio', () => {
    const acao = vi.fn();
    const g = criarAgrupador(acao, { esperaMs: 250, tetoMs: 1_200 });
    g.avisar();
    vi.advanceTimersByTime(200);
    expect(acao).not.toHaveBeenCalled();
  });

  it('dispara uma vez quando a rajada assenta', () => {
    const acao = vi.fn();
    const g = criarAgrupador(acao, { esperaMs: 250, tetoMs: 1_200 });
    g.avisar();
    vi.advanceTimersByTime(300);
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('mil avisos em rajada viram UMA chamada', () => {
    const acao = vi.fn();
    const g = criarAgrupador(acao, { esperaMs: 250, tetoMs: 10_000 });
    for (let i = 0; i < 1_000; i++) {
      g.avisar();
      vi.advanceTimersByTime(5);
    }
    vi.advanceTimersByTime(300);
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('o teto impede que uma rajada longa deixe a tela parada', () => {
    const acao = vi.fn();
    const g = criarAgrupador(acao, { esperaMs: 250, tetoMs: 1_000 });

    // Avisos de 100 em 100 ms por 3 segundos: um debounce puro nunca dispararia.
    for (let i = 0; i < 30; i++) {
      g.avisar();
      vi.advanceTimersByTime(100);
    }
    expect(acao.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(acao.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('cada rajada nova recomeça a contagem do teto', () => {
    const acao = vi.fn();
    const g = criarAgrupador(acao, { esperaMs: 200, tetoMs: 1_000 });

    g.avisar();
    vi.advanceTimersByTime(250);
    expect(acao).toHaveBeenCalledTimes(1);

    g.avisar();
    vi.advanceTimersByTime(250);
    expect(acao).toHaveBeenCalledTimes(2);
  });

  it('`agora` antecipa o disparo pendente', () => {
    const acao = vi.fn();
    const g = criarAgrupador(acao, { esperaMs: 250 });
    g.avisar();
    g.agora();
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('`agora` sem nada pendente não inventa uma chamada', () => {
    const acao = vi.fn();
    const g = criarAgrupador(acao, { esperaMs: 250 });
    g.agora();
    expect(acao).not.toHaveBeenCalled();
  });

  it('`cancelar` impede o disparo — é o cleanup do efeito', () => {
    const acao = vi.fn();
    const g = criarAgrupador(acao, { esperaMs: 250 });
    g.avisar();
    g.cancelar();
    vi.advanceTimersByTime(1_000);
    expect(acao).not.toHaveBeenCalled();
  });

  it('informa se há disparo pendente', () => {
    const g = criarAgrupador(() => {}, { esperaMs: 250 });
    expect(g.pendente()).toBe(false);
    g.avisar();
    expect(g.pendente()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(g.pendente()).toBe(false);
  });
});
