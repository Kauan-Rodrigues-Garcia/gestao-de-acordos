/**
 * A projeção 3D escrita à mão.
 *
 * Como não há Three.js para garantir a conta, o teste é quem garante. Os casos
 * abaixo cobrem os erros que dão sintoma visual confuso: sólido virando do
 * avesso, aramado embaralhado e perspectiva invertida.
 */
import { describe, it, expect } from 'vitest';
import {
  rotacionarX, rotacionarY, projetar, transformar,
  cubo, icosaedro, ordenarPorProfundidade, opacidadePorProfundidade,
} from '../projecao3d';
import { PHI } from '../matematica';

describe('rotações', () => {
  it('meia volta em Y espelha X e Z', () => {
    const p = rotacionarY({ x: 10, y: 5, z: 0 }, Math.PI);
    expect(p.x).toBeCloseTo(-10);
    expect(p.y).toBe(5);
    expect(p.z).toBeCloseTo(0);
  });

  it('rotação em Y não mexe no Y', () => {
    expect(rotacionarY({ x: 3, y: 42, z: 7 }, 1.234).y).toBe(42);
  });

  it('rotação em X não mexe no X', () => {
    expect(rotacionarX({ x: 42, y: 3, z: 7 }, 0.77).x).toBe(42);
  });

  it('um quarto de volta em X leva Y para Z', () => {
    const p = rotacionarX({ x: 0, y: 10, z: 0 }, Math.PI / 2);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(10);
  });

  it('girar e desgirar volta ao ponto de partida', () => {
    const original = { x: 13, y: -7, z: 21 };
    const ida = rotacionarY(original, 0.9);
    const volta = rotacionarY(ida, -0.9);
    expect(volta.x).toBeCloseTo(original.x);
    expect(volta.z).toBeCloseTo(original.z);
  });
});

describe('projetar', () => {
  it('o que está mais longe fica menor', () => {
    const perto = projetar({ x: 100, y: 0, z: -100 }, 0, 0);
    const longe = projetar({ x: 100, y: 0, z:  100 }, 0, 0);
    expect(perto.escala).toBeGreaterThan(longe.escala);
    expect(Math.abs(perto.x)).toBeGreaterThan(Math.abs(longe.x));
  });

  it('no plano da câmera a escala é 1', () => {
    expect(projetar({ x: 50, y: 50, z: 0 }, 0, 0, 420).escala).toBe(1);
  });

  it('o centro da tela desloca tudo', () => {
    const p = projetar({ x: 0, y: 0, z: 0 }, 300, 200);
    expect(p).toMatchObject({ x: 300, y: 200 });
  });

  /**
   * Sem o piso no denominador, um vértice atrás da câmera produz escala
   * negativa — e o sólido vira do avesso no meio da rotação.
   */
  it('vértice atrás da câmera não inverte o sólido', () => {
    const p = projetar({ x: 100, y: 0, z: -9999 }, 0, 0, 420);
    expect(p.escala).toBeGreaterThan(0);
    expect(Number.isFinite(p.x)).toBe(true);
  });
});

describe('sólidos', () => {
  it('o cubo tem 8 vértices e 12 arestas', () => {
    const c = cubo(100);
    expect(c.vertices).toHaveLength(8);
    expect(c.arestas).toHaveLength(12);
  });

  it('o lado do cubo é o pedido', () => {
    const c = cubo(80);
    const xs = c.vertices.map(v => v.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(80);
  });

  it('o icosaedro tem 12 vértices e 30 arestas', () => {
    const i = icosaedro(100);
    expect(i.vertices).toHaveLength(12);
    expect(i.arestas).toHaveLength(30);
  });

  it('todos os vértices do icosaedro ficam à mesma distância do centro', () => {
    for (const v of icosaedro(100).vertices) {
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(100, 6);
    }
  });

  /** É de φ que saem os vértices — a mesma constante do Math Lab. */
  it('a razão áurea aparece nas coordenadas do icosaedro', () => {
    const i = icosaedro(1);
    const comprimento = Math.sqrt(1 + PHI * PHI);
    const esperado = PHI / comprimento;
    const coords = i.vertices.flatMap(v => [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)]);
    expect(coords.some(c => Math.abs(c - esperado) < 1e-9)).toBe(true);
  });

  it('nenhuma aresta aponta para vértice inexistente', () => {
    for (const solido of [cubo(), icosaedro()]) {
      for (const [a, b] of solido.arestas) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(solido.vertices.length);
      }
    }
  });
});

describe('ordenarPorProfundidade', () => {
  /** Canvas 2D não tem z-buffer: a ordem de desenho É a profundidade. */
  it('do mais distante para o mais próximo', () => {
    const pontos = [
      { x: 0, y: 0, escala: 1, z: -100 },
      { x: 0, y: 0, escala: 1, z:  100 },
      { x: 0, y: 0, escala: 1, z:    0 },
    ];
    const ordenadas = ordenarPorProfundidade([[0, 2], [1, 2]], pontos);
    const primeiraZ = (pontos[ordenadas[0][0]].z + pontos[ordenadas[0][1]].z) / 2;
    const segundaZ  = (pontos[ordenadas[1][0]].z + pontos[ordenadas[1][1]].z) / 2;
    expect(primeiraZ).toBeGreaterThan(segundaZ);
  });

  it('não altera o array recebido', () => {
    const arestas: [number, number][] = [[0, 1], [1, 2]];
    const copia = JSON.parse(JSON.stringify(arestas));
    ordenarPorProfundidade(arestas, [
      { x: 0, y: 0, escala: 1, z: 5 },
      { x: 0, y: 0, escala: 1, z: -5 },
      { x: 0, y: 0, escala: 1, z: 0 },
    ]);
    expect(arestas).toEqual(copia);
  });
});

describe('opacidadePorProfundidade', () => {
  it('perto é mais opaco que longe', () => {
    expect(opacidadePorProfundidade(-100, 100))
      .toBeGreaterThan(opacidadePorProfundidade(100, 100));
  });

  it('fica sempre dentro de uma faixa visível', () => {
    for (let z = -200; z <= 200; z += 20) {
      const o = opacidadePorProfundidade(z, 100);
      expect(o).toBeGreaterThanOrEqual(0.25);
      expect(o).toBeLessThanOrEqual(1);
    }
  });
});

describe('transformar', () => {
  it('devolve um ponto projetado por vértice', () => {
    const c = cubo(50);
    expect(transformar(c.vertices, 0.3, 0.2, 100, 100)).toHaveLength(8);
  });

  it('sem rotação, o cubo continua simétrico em torno do centro', () => {
    const c = cubo(100);
    const pts = transformar(c.vertices, 0, 0, 0, 0);
    const somaX = pts.reduce((s, p) => s + p.x, 0);
    expect(somaX).toBeCloseTo(0, 6);
  });
});
