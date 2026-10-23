import { describe, it, expect } from 'vitest';
import { areaDoRecorte, centrado, limitar, tamanhoDaSaida, zoomNoCentro, type Medidas } from './recorte';

// Moldura 16:9 de 640×360; foto em pé de 1000×2000.
const M: Medidas = { molduraL: 640, molduraA: 360, imagemL: 1000, imagemA: 2000 };

describe('recorte do jumpscare', () => {
  it('abre centrado, cobrindo a moldura inteira', () => {
    const p = centrado(M);
    const r = areaDoRecorte(M, p);
    expect(r.sx).toBeCloseTo(0);
    expect(r.sl).toBeCloseTo(1000);          // a largura inteira da foto
    expect(r.sa).toBeCloseTo(1000 * 360 / 640);
    expect(r.sy).toBeCloseTo((2000 - r.sa) / 2); // o meio da altura
  });

  it('arrastar para fora não deixa sobrar faixa vazia', () => {
    const p = limitar(M, { zoom: 1, x: 500, y: 500 });
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    const fundo = limitar(M, { zoom: 1, x: -99_999, y: -99_999 });
    const r = areaDoRecorte(M, fundo);
    expect(r.sx + r.sl).toBeCloseTo(1000);
    expect(r.sy + r.sa).toBeCloseTo(2000);
  });

  it('zoom mantém o centro da moldura no mesmo ponto da foto', () => {
    const antes = centrado(M);
    const ra = areaDoRecorte(M, antes);
    const depois = zoomNoCentro(M, antes, 2);
    const rd = areaDoRecorte(M, depois);
    expect(rd.sl).toBeCloseTo(ra.sl / 2);
    expect(rd.sx + rd.sl / 2).toBeCloseTo(ra.sx + ra.sl / 2);
    expect(rd.sy + rd.sa / 2).toBeCloseTo(ra.sy + ra.sa / 2);
  });

  it('zoom fora da faixa e número inválido viram valor seguro', () => {
    expect(zoomNoCentro(M, centrado(M), 99).zoom).toBe(5);
    expect(limitar(M, { zoom: Number.NaN, x: Number.NaN, y: 0 }).zoom).toBe(1);
  });

  it('a saída nunca amplia e tem no máximo 1920 de largura', () => {
    expect(tamanhoDaSaida(800, 16 / 9)).toEqual({ l: 800, a: 450 });
    expect(tamanhoDaSaida(4000, 16 / 9)).toEqual({ l: 1920, a: 1080 });
  });
});
