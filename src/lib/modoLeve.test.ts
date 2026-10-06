/**
 * Modo leve (06/10/2026): quando oferecer, o silêncio do «Agora não» e o que o
 * interruptor faz no <html>.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  JANELA_MS, SILENCIO_MS, definirModoLeve, deveSugerir, esperaDaReleitura, maquinaModesta,
  modoLeveLigado, podeSugerir, recusarSugestao, type Travada,
} from './modoLeve';

const AGORA = 1_000_000;
/** `n` quadros de `ms` cada, todos dentro da janela. */
const quadros = (n: number, ms: number): Travada[] =>
  Array.from({ length: n }, (_, i) => ({ fim: AGORA - i * 1_000, duracao: ms }));

describe('deveSugerir', () => {
  it('máquina comum: 12 travadas somando 3 s em 2 min', () => {
    expect(deveSugerir(quadros(12, 250), AGORA)).toBe(true);
    expect(deveSugerir(quadros(11, 400), AGORA)).toBe(false);   // poucas, mesmo longas
    expect(deveSugerir(quadros(40, 70), AGORA)).toBe(false);    // muitas, mas somam 2,8 s
    expect(deveSugerir(quadros(45, 70), AGORA)).toBe(true);     // animação engasgando direto
  });

  it('uma travada enorme (abrir a tela, importar relatório) não é máquina fraca', () => {
    expect(deveSugerir([{ fim: AGORA, duracao: 8_000 }], AGORA)).toBe(false);
  });

  it('quadro abaixo de 50 ms e travada fora da janela não contam', () => {
    expect(deveSugerir(quadros(100, 49), AGORA)).toBe(false);
    const antigas = quadros(30, 300).map(t => ({ ...t, fim: t.fim - JANELA_MS - 1 }));
    expect(deveSugerir(antigas, AGORA)).toBe(false);
  });

  it('máquina modesta fica mais sensível: 8 travadas somando 2 s', () => {
    const oito = quadros(8, 260);
    expect(deveSugerir(oito, AGORA)).toBe(false);
    expect(deveSugerir(oito, AGORA, { nucleos: 4 })).toBe(true);
    expect(deveSugerir(oito, AGORA, { memoriaGb: 2 })).toBe(true);
  });

  it('maquinaModesta lê só o que o navegador informar', () => {
    expect(maquinaModesta({})).toBe(false);
    expect(maquinaModesta({ nucleos: 8, memoriaGb: 8 })).toBe(false);
    expect(maquinaModesta({ nucleos: 2 })).toBe(true);
  });
});

describe('interruptor e oferta', () => {
  beforeEach(() => {
    localStorage.clear();
    definirModoLeve(false);
  });

  it('ligar marca o <html>, guarda na máquina e alonga a releitura', () => {
    expect(esperaDaReleitura()).toEqual({ esperaMs: 300, tetoMs: 1_200 });
    definirModoLeve(true);
    expect(modoLeveLigado()).toBe(true);
    expect(document.documentElement.hasAttribute('data-leve')).toBe(true);
    expect(localStorage.getItem('gestao:modo-leve')).toBe('1');
    expect(esperaDaReleitura()).toEqual({ esperaMs: 3_000, tetoMs: 10_000 });
    definirModoLeve(false);
    expect(document.documentElement.hasAttribute('data-leve')).toBe(false);
  });

  it('«Agora não» cala a oferta por 7 dias; com o modo ligado ela nem aparece', () => {
    expect(podeSugerir(AGORA)).toBe(true);
    recusarSugestao(AGORA);
    expect(podeSugerir(AGORA + SILENCIO_MS - 1)).toBe(false);
    expect(podeSugerir(AGORA + SILENCIO_MS)).toBe(true);
    localStorage.clear();
    definirModoLeve(true);
    expect(podeSugerir(AGORA)).toBe(false);
  });
});
