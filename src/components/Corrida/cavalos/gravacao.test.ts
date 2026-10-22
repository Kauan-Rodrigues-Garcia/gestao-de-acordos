// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { desempacotarCavalos, empacotarCavalos } from './gravacao';
import { simular } from './simulacao.js';

describe('a gravação da corrida de cavalos', () => {
  it('ida e volta: o arquivo devolve a mesma corrida', () => {
    const rec = simular(20261022, 12);
    const volta = desempacotarCavalos(empacotarCavalos(rec));
    expect(volta.X).toBeInstanceOf(Int16Array);
    expect(Array.from(volta.X)).toEqual(Array.from(rec.X));
    const { X: _a, ...semX } = rec;
    const { X: _b, ...voltaSemX } = volta;
    expect(voltaSemX).toEqual(semX);
  });

  it('cabe no bucket: 24 cavalos em poucas dezenas de KB', () => {
    const tamanho = empacotarCavalos(simular(7, 24)).length;
    expect(tamanho).toBeLessThan(80_000);
  });

  it('recusa arquivo que não é de cavalos', () => {
    const lixo = empacotarCavalos(simular(1, 2));
    lixo[20] ^= 0xff;   // estraga o gzip
    expect(() => desempacotarCavalos(lixo)).toThrow();
  });
});

describe('a simulação', () => {
  it('é a mesma em todo aparelho: mesma semente, mesmo resultado', () => {
    const a = simular(424242, 10), b = simular(424242, 10);
    expect(Array.from(a.X)).toEqual(Array.from(b.X));
    expect(a.ordem).toEqual(b.ordem);
  });

  it('todo cavalo cruza a chegada, e o vencedor é o primeiro da ordem', () => {
    const rec = simular(99, 8);
    expect(rec.fin.every(f => f > 0)).toBe(true);
    expect(rec.vencedor).toBe(rec.ordem[0]);
    expect(rec.n).toBe(8);
  });
});
