/**
 * A matemática do Creators Lab.
 *
 * Estas funções movem partícula, inclinam card e desenham órbita. Quando erram,
 * o sintoma é visual e vago — "ficou estranho" — e ninguém acha a causa. Por
 * isso elas vivem fora dos componentes e têm teste próprio.
 */
import { describe, it, expect } from 'vitest';
import {
  PHI, limitar, lerp, normalizarNoRetangulo, inclinacaoDoCard, distancia,
  influencia, repulsao, pontoOrbital, onda, alturaAurea, fibonacci, razaoFibonacci,
} from '../matematica';

describe('limitar', () => {
  it('prende nos dois extremos e deixa passar o meio', () => {
    expect(limitar(-5, 0, 10)).toBe(0);
    expect(limitar(50, 0, 10)).toBe(10);
    expect(limitar(7, 0, 10)).toBe(7);
  });
});

describe('lerp', () => {
  it('anda de a até b', () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 1)).toBe(100);
    expect(lerp(0, 100, 0.25)).toBe(25);
  });
});

describe('normalizarNoRetangulo', () => {
  it('o centro é a origem', () => {
    expect(normalizarNoRetangulo(50, 50, 100, 100)).toEqual({ nx: 0, ny: 0 });
  });

  it('os cantos são -1 e 1', () => {
    expect(normalizarNoRetangulo(0, 0, 100, 100)).toEqual({ nx: -1, ny: -1 });
    expect(normalizarNoRetangulo(100, 100, 100, 100)).toEqual({ nx: 1, ny: 1 });
  });

  it('o resultado não depende do tamanho do elemento', () => {
    const pequeno = normalizarNoRetangulo(25, 25, 100, 100);
    const grande  = normalizarNoRetangulo(250, 250, 1000, 1000);
    expect(pequeno).toEqual(grande);
  });

  /** Elemento ainda sem medida no primeiro quadro — não pode virar NaN. */
  it('tamanho zero devolve a origem, não NaN', () => {
    expect(normalizarNoRetangulo(10, 10, 0, 0)).toEqual({ nx: 0, ny: 0 });
  });
});

describe('inclinacaoDoCard', () => {
  /**
   * O sinal invertido no eixo X é o detalhe que separa "o card encara o
   * cursor" de "o card foge do cursor".
   */
  it('mouse embaixo inclina o card para trás', () => {
    const { rotacaoX } = inclinacaoDoCard(0, 1, 10);
    expect(rotacaoX).toBe(-10);
  });

  it('mouse à direita gira para a direita', () => {
    expect(inclinacaoDoCard(1, 0, 10).rotacaoY).toBe(10);
  });

  it('no centro não inclina', () => {
    expect(inclinacaoDoCard(0, 0)).toEqual({ rotacaoX: -0, rotacaoY: 0 });
  });
});

describe('distancia', () => {
  it('resolve o triângulo 3-4-5', () => {
    expect(distancia(0, 0, 3, 4)).toBe(5);
  });
  it('é zero no mesmo ponto', () => {
    expect(distancia(7, 7, 7, 7)).toBe(0);
  });
});

describe('influencia', () => {
  it('vale 1 no centro e 0 na borda', () => {
    expect(influencia(0, 100)).toBe(1);
    expect(influencia(100, 100)).toBe(0);
  });
  it('não passa de 0 além do raio', () => {
    expect(influencia(500, 100)).toBe(0);
  });
  it('raio zero não divide por zero', () => {
    expect(influencia(10, 0)).toBe(0);
  });
});

describe('repulsao', () => {
  /** É o teste que existe por causa de um bug clássico: força infinita. */
  it('cursor exatamente sobre a partícula não gera infinito nem NaN', () => {
    const { fx, fy } = repulsao(0, 0);
    expect(Number.isFinite(fx)).toBe(true);
    expect(Number.isFinite(fy)).toBe(true);
  });

  it('nunca passa do teto', () => {
    const { fx, fy } = repulsao(0.001, 0.001, 1200, 8, 40);
    expect(Math.hypot(fx, fy)).toBeLessThanOrEqual(40.0001);
  });

  it('perto empurra mais que longe', () => {
    const perto = repulsao(10, 0);
    const longe = repulsao(300, 0);
    expect(Math.abs(perto.fx)).toBeGreaterThan(Math.abs(longe.fx));
  });

  it('empurra na direção contrária ao cursor', () => {
    // dx positivo = partícula à direita do cursor → força para a direita.
    expect(repulsao(50, 0).fx).toBeGreaterThan(0);
    expect(repulsao(-50, 0).fx).toBeLessThan(0);
  });
});

describe('pontoOrbital', () => {
  it('ângulo zero fica à direita do centro', () => {
    const p = pontoOrbital(100, 100, 50, 0);
    expect(p.x).toBeCloseTo(150);
    expect(p.y).toBeCloseTo(100);
  });

  it('um quarto de volta fica embaixo', () => {
    const p = pontoOrbital(100, 100, 50, Math.PI / 2);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(150);
  });

  it('o achatamento comprime só o eixo vertical', () => {
    const p = pontoOrbital(0, 0, 100, Math.PI / 2, 0.4);
    expect(p.y).toBeCloseTo(40);
  });
});

describe('onda', () => {
  it('sin começa em zero e cos começa no topo', () => {
    expect(onda(0, 10, 1, 0, 'sin')).toBeCloseTo(0);
    expect(onda(0, 10, 1, 0, 'cos')).toBeCloseTo(10);
  });
  it('a amplitude limita o alcance', () => {
    for (let x = 0; x < 20; x += 0.3) {
      expect(Math.abs(onda(x, 7, 1.5, 0))).toBeLessThanOrEqual(7.0001);
    }
  });
});

describe('proporção áurea', () => {
  it('φ tem o valor conhecido', () => {
    expect(PHI).toBeCloseTo(1.618033988, 8);
  });

  it('φ satisfaz φ² = φ + 1', () => {
    expect(PHI * PHI).toBeCloseTo(PHI + 1, 10);
  });

  it('a altura áurea divide a largura por φ', () => {
    expect(alturaAurea(1618.033988749895)).toBeCloseTo(1000, 6);
  });

  it('Fibonacci começa 1,1,2,3,5,8', () => {
    expect(fibonacci(6)).toEqual([1, 1, 2, 3, 5, 8]);
  });

  it('lista vazia para n não positivo', () => {
    expect(fibonacci(0)).toEqual([]);
  });

  /** A demonstração de que φ não foi escolhido por gosto: ele emerge. */
  it('a razão entre termos de Fibonacci converge para φ', () => {
    expect(razaoFibonacci(5)).not.toBeCloseTo(PHI, 5);
    expect(razaoFibonacci(30)).toBeCloseTo(PHI, 8);
  });
});
