/**
 * diretoria.service.test.ts — as contas puras do Painel Diretoria.
 *
 * São três funções pequenas e é justamente por isso que elas têm teste: cada
 * uma tem um caso de borda que, errado, produz um número plausível na tela em
 * vez de um erro. Número plausível e errado é o que ninguém reporta.
 */
import { describe, it, expect } from 'vitest';
import {
  variacao, acumular, estimativaDeFechamento, type DiaDaSerie,
} from './diretoria.service';

const dia = (d: number, valor: number, valorAnterior: number, dentroDoCorte = true): DiaDaSerie =>
  ({ dia: d, valor, valorAnterior, dentroDoCorte });

describe('variacao', () => {
  it('mede o crescimento contra a base', () => {
    expect(variacao(150, 100)).toBeCloseTo(50, 6);
    expect(variacao(80, 100)).toBeCloseTo(-20, 6);
  });

  it('base zero devolve null, e NÃO zero', () => {
    // Um mês sem anterior não cresceu 0% — ele não tem com o que comparar. Zero
    // aqui viraria um selo de «estagnado» onde não há medida nenhuma.
    expect(variacao(1000, 0)).toBeNull();
  });

  it('não devolve NaN para entrada inválida', () => {
    expect(variacao(Number.NaN, 100)).toBeNull();
    expect(variacao(100, Number.NaN)).toBeNull();
  });

  it('base negativa mede pela distância, sem inverter o sinal', () => {
    // `Math.abs` no denominador: crescer de -100 para -50 é melhora, e o sinal
    // do resultado tem que dizer isso.
    expect(variacao(-50, -100)).toBeCloseTo(50, 6);
  });
});

describe('acumular', () => {
  it('soma dia a dia nas duas séries', () => {
    const r = acumular([dia(1, 10, 5), dia(2, 20, 5), dia(3, 30, 10)]);
    expect(r.map(d => d.valor)).toEqual([10, 30, 60]);
    expect(r.map(d => d.valorAnterior)).toEqual([5, 10, 20]);
  });

  it('congela depois do corte em vez de continuar somando', () => {
    // O gráfico mostra o mês inteiro, mas o acumulado só existe até onde há
    // dado. Continuar somando desenharia uma linha subindo sobre dias que ainda
    // não aconteceram.
    const r = acumular([dia(1, 10, 5), dia(2, 20, 5), dia(3, 99, 99, false)]);
    expect(r[2].valor).toBe(30);
    expect(r[2].valorAnterior).toBe(10);
    expect(r[2].dentroDoCorte).toBe(false);
  });

  it('não muta a série recebida', () => {
    const original = [dia(1, 10, 5), dia(2, 20, 5)];
    acumular(original);
    expect(original.map(d => d.valor)).toEqual([10, 20]);
  });

  it('série vazia devolve vazia', () => {
    expect(acumular([])).toEqual([]);
  });
});

describe('estimativaDeFechamento', () => {
  it('projeta pelo ritmo até o corte', () => {
    expect(estimativaDeFechamento(1000, 10, 30)).toBeCloseTo(3000, 6);
  });

  it('mês fechado devolve o próprio valor, não uma projeção', () => {
    expect(estimativaDeFechamento(3000, 30, 30)).toBe(3000);
    expect(estimativaDeFechamento(3000, 31, 30)).toBe(3000);
  });

  it('sem corte, sem mês ou sem recebimento devolve null', () => {
    // Projetar de zero é inventar um número que a tela mostraria como se fosse
    // medido.
    expect(estimativaDeFechamento(1000, 0, 30)).toBeNull();
    expect(estimativaDeFechamento(1000, 10, 0)).toBeNull();
    expect(estimativaDeFechamento(0, 10, 30)).toBeNull();
  });
});
