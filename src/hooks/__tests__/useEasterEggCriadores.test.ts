/**
 * A janela dos cinco cliques.
 *
 * A regra parece trivial e tem três armadilhas: um clique não pode abrir, cinco
 * cliques lentos não podem abrir, e a janela precisa recomeçar em vez de travar
 * quem clicou devagar.
 */
import { describe, it, expect } from 'vitest';
import { proximoEstado, JANELA_MS, CLIQUES_NECESSARIOS } from '../useEasterEggCriadores';

/** Simula uma sequência de cliques com intervalos dados, em ms. */
function sequencia(intervalos: number[]): { cliques: number; abriu: boolean } {
  let cliques = 0;
  let primeiro: number | null = null;
  let agora = 1_000_000;
  let abriu = false;

  for (const dt of intervalos) {
    agora += dt;
    const r = proximoEstado(cliques, primeiro, agora);
    cliques = r.cliques;
    primeiro = r.primeiroEm;
    if (r.abrir) { abriu = true; break; }
  }
  return { cliques, abriu };
}

describe('proximoEstado', () => {
  it('o primeiro clique começa a contagem', () => {
    const r = proximoEstado(0, null, 5000);
    expect(r).toEqual({ cliques: 1, primeiroEm: 5000, abrir: false });
  });

  it('um clique não abre nada', () => {
    expect(sequencia([0]).abriu).toBe(false);
  });

  it('quatro cliques rápidos não abrem', () => {
    expect(sequencia([0, 100, 100, 100]).abriu).toBe(false);
  });

  it('cinco cliques rápidos abrem', () => {
    expect(sequencia([0, 100, 100, 100, 100]).abriu).toBe(true);
  });

  it('exatamente no limite da janela ainda abre', () => {
    const passo = JANELA_MS / (CLIQUES_NECESSARIOS - 1);
    expect(sequencia([0, passo, passo, passo, passo]).abriu).toBe(true);
  });

  /** O caso que evita abertura acidental de quem só clica no logo às vezes. */
  it('cinco cliques lentos NÃO abrem', () => {
    expect(sequencia([0, 1000, 1000, 1000, 1000]).abriu).toBe(false);
  });

  it('clique muito depois recomeça a contagem em 1', () => {
    const r = proximoEstado(4, 1000, 1000 + JANELA_MS + 1);
    expect(r.cliques).toBe(1);
    expect(r.abrir).toBe(false);
  });

  /**
   * Quem clicou devagar não pode ficar preso: depois de recomeçar, cinco
   * cliques rápidos ainda funcionam.
   */
  it('depois de expirar, uma nova rajada abre normalmente', () => {
    let cliques = 0;
    let primeiro: number | null = null;
    let agora = 0;

    // Rajada lenta, que expira.
    for (const dt of [0, 2000, 2000]) {
      agora += dt;
      const r = proximoEstado(cliques, primeiro, agora);
      cliques = r.cliques; primeiro = r.primeiroEm;
    }
    // Agora uma rajada rápida.
    let abriu = false;
    for (const dt of [0, 80, 80, 80, 80]) {
      agora += dt;
      const r = proximoEstado(cliques, primeiro, agora);
      cliques = r.cliques; primeiro = r.primeiroEm;
      if (r.abrir) { abriu = true; break; }
    }
    expect(abriu).toBe(true);
  });

  it('a janela conta do PRIMEIRO clique, não do último', () => {
    // Quatro cliques colados no fim da janela: o quinto já está fora.
    let cliques = 0;
    let primeiro: number | null = null;
    let agora = 0;
    for (const dt of [0, 10, 10, 10]) {
      agora += dt;
      const r = proximoEstado(cliques, primeiro, agora);
      cliques = r.cliques; primeiro = r.primeiroEm;
    }
    agora += JANELA_MS;                       // muito depois do primeiro
    const r = proximoEstado(cliques, primeiro, agora);
    expect(r.abrir).toBe(false);
    expect(r.cliques).toBe(1);
  });
});
