/**
 * projecao3d.ts — 3D em Canvas 2D, sem biblioteca.
 * ─────────────────────────────────────────────────────────────────────────────
 * ## Por que não Three.js
 *
 * Three.js resolveria isto em menos linhas, mas custaria três coisas: uma
 * dependência de centenas de kilobytes num projeto cujo pacote principal já foi
 * apontado como pesado; um caminho de fallback complicado, porque WebGL falha
 * em hardware fraco e em alguns navegadores corporativos; e — o que mais pesa
 * aqui — **esconderia justamente a parte que a página existe para mostrar**.
 *
 * Uma página que quer demonstrar matemática aplicada não deve importar a
 * matemática. Então a rotação, a projeção em perspectiva e a ordenação por
 * profundidade estão escritas aqui, em umas cem linhas, e desenhadas em Canvas
 * 2D — que existe em praticamente todo lugar.
 *
 * ## A conta
 *
 * Rotação em torno de Y (guinada) e X (arfagem), depois projeção:
 *
 *     escala = distanciaCamera / (distanciaCamera + z)
 *     xTela  = cx + x · escala
 *     yTela  = cy + y · escala
 *
 * Quanto maior o `z` (mais longe), menor a escala — é isso, e só isso, que
 * produz a sensação de profundidade.
 */

export interface Ponto3D { x: number; y: number; z: number }
export interface PontoProjetado { x: number; y: number; escala: number; z: number }
/** Par de índices na lista de vértices. */
export type Aresta = [number, number];

export interface Solido {
  vertices: Ponto3D[];
  arestas: Aresta[];
}

/** Gira em torno do eixo Y. Ângulo em radianos. */
export function rotacionarY(p: Ponto3D, a: number): Ponto3D {
  const cos = Math.cos(a);
  const sen = Math.sin(a);
  return { x: p.x * cos + p.z * sen, y: p.y, z: -p.x * sen + p.z * cos };
}

/** Gira em torno do eixo X. */
export function rotacionarX(p: Ponto3D, a: number): Ponto3D {
  const cos = Math.cos(a);
  const sen = Math.sin(a);
  return { x: p.x, y: p.y * cos - p.z * sen, z: p.y * sen + p.z * cos };
}

/**
 * Projeta um ponto do espaço na tela.
 *
 * `distanciaCamera` controla a força da perspectiva: valor alto achata (parece
 * projeção isométrica), valor baixo exagera (parece lente grande-angular).
 *
 * O `Math.max` no denominador impede divisão por zero e inversão de sinal
 * quando um vértice passa por trás da câmera — sem ele o sólido vira do avesso
 * durante a rotação.
 */
export function projetar(
  p: Ponto3D, cx: number, cy: number, distanciaCamera = 420,
): PontoProjetado {
  const denominador = Math.max(distanciaCamera + p.z, 1);
  const escala = distanciaCamera / denominador;
  return { x: cx + p.x * escala, y: cy + p.y * escala, escala, z: p.z };
}

/** Aplica as duas rotações e projeta, na ordem certa. */
export function transformar(
  vertices: Ponto3D[], anguloY: number, anguloX: number,
  cx: number, cy: number, distanciaCamera = 420,
): PontoProjetado[] {
  return vertices.map(v => projetar(rotacionarX(rotacionarY(v, anguloY), anguloX), cx, cy, distanciaCamera));
}

/**
 * Cubo centrado na origem.
 *
 * Ordem dos vértices: os quatro de trás (z negativo), depois os quatro da
 * frente. As arestas dependem dessa ordem.
 */
export function cubo(lado = 100): Solido {
  const m = lado / 2;
  const vertices: Ponto3D[] = [
    { x: -m, y: -m, z: -m }, { x:  m, y: -m, z: -m },
    { x:  m, y:  m, z: -m }, { x: -m, y:  m, z: -m },
    { x: -m, y: -m, z:  m }, { x:  m, y: -m, z:  m },
    { x:  m, y:  m, z:  m }, { x: -m, y:  m, z:  m },
  ];
  const arestas: Aresta[] = [
    [0, 1], [1, 2], [2, 3], [3, 0],   // face de trás
    [4, 5], [5, 6], [6, 7], [7, 4],   // face da frente
    [0, 4], [1, 5], [2, 6], [3, 7],   // ligações
  ];
  return { vertices, arestas };
}

/**
 * Icosaedro — 12 vértices, 30 arestas.
 *
 * Os vértices saem de três retângulos áureos perpendiculares entre si. É o
 * mesmo φ do Math Lab aparecendo onde ninguém espera, e é por isso que este
 * sólido foi escolhido para o núcleo do Cyberpunk em vez de uma esfera.
 */
export function icosaedro(raio = 100): Solido {
  const phi = (1 + Math.sqrt(5)) / 2;
  const brutos: Ponto3D[] = [
    { x: -1, y:  phi, z: 0 }, { x:  1, y:  phi, z: 0 },
    { x: -1, y: -phi, z: 0 }, { x:  1, y: -phi, z: 0 },
    { x: 0, y: -1, z:  phi }, { x: 0, y:  1, z:  phi },
    { x: 0, y: -1, z: -phi }, { x: 0, y:  1, z: -phi },
    { x:  phi, y: 0, z: -1 }, { x:  phi, y: 0, z:  1 },
    { x: -phi, y: 0, z: -1 }, { x: -phi, y: 0, z:  1 },
  ];
  // Normaliza para o raio pedido: os vértices brutos têm comprimento √(1+φ²).
  const comprimento = Math.sqrt(1 + phi * phi);
  const k = raio / comprimento;
  const vertices = brutos.map(v => ({ x: v.x * k, y: v.y * k, z: v.z * k }));

  const arestas: Aresta[] = [
    [0, 1], [0, 5], [0, 7], [0, 10], [0, 11],
    [1, 5], [1, 7], [1, 8], [1, 9],
    [2, 3], [2, 4], [2, 6], [2, 10], [2, 11],
    [3, 4], [3, 6], [3, 8], [3, 9],
    [4, 5], [4, 9], [4, 11],
    [5, 9], [5, 11],
    [6, 7], [6, 8], [6, 10],
    [7, 8], [7, 10],
    [8, 9], [10, 11],
  ];
  return { vertices, arestas };
}

/**
 * Ordena arestas da mais distante para a mais próxima.
 *
 * Canvas 2D não tem buffer de profundidade: o que for desenhado por último fica
 * por cima. Desenhar em ordem de profundidade é o que substitui o z-buffer, e é
 * o que faz o aramado parecer sólido em vez de embaralhado.
 */
export function ordenarPorProfundidade(
  arestas: Aresta[], pontos: PontoProjetado[],
): Aresta[] {
  return [...arestas].sort((a, b) => {
    const za = (pontos[a[0]].z + pontos[a[1]].z) / 2;
    const zb = (pontos[b[0]].z + pontos[b[1]].z) / 2;
    return zb - za;
  });
}

/**
 * Opacidade pela profundidade: perto some menos, longe some mais.
 *
 * Sem isso o aramado fica com todas as linhas iguais e o olho não consegue
 * dizer qual face está na frente.
 */
export function opacidadePorProfundidade(z: number, raio: number): number {
  if (raio <= 0) return 1;
  const t = (z + raio) / (raio * 2);   // 0 = mais perto, 1 = mais longe
  return 0.25 + (1 - Math.min(Math.max(t, 0), 1)) * 0.75;
}
