/** qualidade.test.ts — a qualidade automática da guerra desce quando trava e só sobe com folga. */
import { describe, expect, it } from 'vitest';
import { criarQualidade, nivelDoAparelho } from './qualidade.js';

const rodar = (q: ReturnType<typeof criarQualidade>, ms: number, intervalo: number, gasto: number) => { for (let t = 0; t < ms; t += intervalo) q.quadro(intervalo, gasto, false); };

describe('qualidade da guerra', () => {
  it('o aparelho decide onde começa', () => {
    expect(nivelDoAparelho({ hardwareConcurrency: 2, deviceMemory: 4 })).toBe(0);
    expect(nivelDoAparelho({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(1);
    expect(nivelDoAparelho({ hardwareConcurrency: 12, deviceMemory: 16 })).toBe(2);
    expect(nivelDoAparelho({})).toBe(1);
  });
  it('travando (menos de ~42 q/s por mais de 1 s), desce um nível de cada vez', () => {
    const q = criarQualidade({ inicio: 2 });
    rodar(q, 3000, 16.7, 4); expect(q.nivel).toBe(2);
    rodar(q, 1500, 40, 30); expect(q.nivel).toBe(1);
    rodar(q, 1500, 40, 30); expect(q.nivel).toBe(0);
  });
  it('um engasgo só (troca de aba, coleta de lixo) não derruba', () => {
    const q = criarQualidade({ inicio: 1 });
    rodar(q, 2000, 16.7, 4); q.quadro(400, 5, false); q.quadro(120, 5, false); rodar(q, 2000, 16.7, 4);
    expect(q.nivel).toBe(1);
  });
  it('sobe de volta com 8 s de folga, nunca acima de onde começou, e não fica subindo e descendo', () => {
    const q = criarQualidade({ inicio: 1 });
    rodar(q, 1500, 40, 30); expect(q.nivel).toBe(0);
    rodar(q, 9000, 33.3, 3); expect(q.nivel).toBe(1);   // no leve (30 q/s) quem conta é o trabalho
    rodar(q, 20000, 16.7, 2); expect(q.nivel).toBe(1);  // o teto é onde começou
    rodar(q, 1500, 40, 30); expect(q.nivel).toBe(0);
    rodar(q, 20000, 33.3, 2); expect(q.nivel).toBe(0);  // desceu duas vezes: fica
  });
  it('o modo leve do app fica no leve', () => {
    const q = criarQualidade({ leve: true, inicio: 2 });
    rodar(q, 20000, 16.7, 1); expect(q.nivel).toBe(0);
  });
  it('avisa quando muda', () => {
    const q = criarQualidade({ inicio: 1 }); const vistos: number[] = [];
    q.aoMudar(n => vistos.push(n)); rodar(q, 1500, 40, 30);
    expect(vistos).toEqual([0]);
  });
});
