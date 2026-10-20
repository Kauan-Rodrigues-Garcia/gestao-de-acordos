import { describe, expect, it } from 'vitest';
import { desempacotarGravacao, empacotarGravacao } from './gravacao';
import type { Gravacao } from './motor/motor';

function gravacaoDeMentira(n = 3, frames = 50): Gravacao {
  const X = new Int16Array(n * frames), Y = new Int16Array(n * frames), F = new Uint8Array(n * frames);
  for (let i = 0; i < X.length; i++) { X[i] = (i * 37) % 2240; Y[i] = (i * 91) % 16600 - 100; F[i] = i % 64; }
  return {
    seed: 4242, mapa: 'pixel', fps: 30, n, frames, dur: frames / 30, vencedor: 1, tVenc: 1.2,
    ids: ['a', 'b', 'c'], nomes: ['Ana', 'Bruno', 'Caio'], setores: ['RH', 'TI', 'TI'], dono: [0, 1, 2],
    est: [{ modelo: 'gato', cor: '#ff8a2b', acessorio: 'nenhum' }, { modelo: 'urso', cor: '#7fd3ff', acessorio: 'coroa' }, { modelo: 'polvo', cor: '#8fe36b', acessorio: 'laco' }],
    X, Y, F, tFim: new Float32Array([1.5, 1.2, 0]), ordem: new Int16Array([2, 1, 0]),
    eventos: [{ t: 0.5, tipo: 'bumper', x: 10, y: 20 }], narr: [{ t: 3, txt: 'Largou!' }], foto: null,
  };
}

describe('gravacao — empacotar e desempacotar', () => {
  it('volta igual: resumo, eventos e os vetores bit a bit', () => {
    const rec = gravacaoDeMentira();
    const volta = desempacotarGravacao(empacotarGravacao(rec));
    expect(volta.seed).toBe(4242);
    expect(volta.ids).toEqual(['a', 'b', 'c']);
    expect(volta.eventos).toEqual(rec.eventos);
    expect(volta.foto).toBeNull();
    expect(Array.from(volta.X)).toEqual(Array.from(rec.X));
    expect(Array.from(volta.Y)).toEqual(Array.from(rec.Y));
    expect(Array.from(volta.F)).toEqual(Array.from(rec.F));
    expect(Array.from(volta.tFim)).toEqual(Array.from(rec.tFim));
    expect(volta.X).toBeInstanceOf(Int16Array);
    expect(volta.tFim).toBeInstanceOf(Float32Array);
  });

  it('com tamanhos ímpares (o alinhamento dos vetores não come byte)', () => {
    const rec = gravacaoDeMentira(3, 7);
    rec.F = new Uint8Array(21).fill(5);
    const volta = desempacotarGravacao(empacotarGravacao(rec));
    expect(Array.from(volta.F)).toEqual(Array.from(rec.F));
    expect(Array.from(volta.ordem)).toEqual([2, 1, 0]);
  });

  it('arquivo de outra coisa é recusado', () => {
    expect(() => desempacotarGravacao(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
