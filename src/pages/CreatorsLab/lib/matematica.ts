/**
 * matematica.ts — a matemática que move a página, isolada e testável.
 * ─────────────────────────────────────────────────────────────────────────────
 * O Creators Lab quer demonstrar que animação é matemática, não mágica de
 * biblioteca. Então as contas vivem aqui, puras, com nome e teste — e os
 * componentes só desenham o resultado.
 *
 * Todas as funções são determinísticas: mesma entrada, mesma saída. Nenhuma lê
 * relógio, `Math.random` ou DOM.
 */

/** Proporção áurea. Usada em proporções de layout e no Easter Egg do Math Lab. */
export const PHI = 1.618033988749895;

export const TAU = Math.PI * 2;

/** Prende um número entre dois limites. */
export function limitar(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Interpolação linear. `t` fora de [0,1] extrapola de propósito. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Converte uma posição dentro de um retângulo para o intervalo −1..1.
 *
 * É a base de todo card que reage ao mouse: o centro vale 0, as bordas valem
 * −1 e 1, e o resultado não depende do tamanho do elemento.
 */
export function normalizarNoRetangulo(
  x: number, y: number, largura: number, altura: number,
): { nx: number; ny: number } {
  if (largura <= 0 || altura <= 0) return { nx: 0, ny: 0 };
  return {
    nx: limitar((x / largura) * 2 - 1, -1, 1),
    ny: limitar((y / altura) * 2 - 1, -1, 1),
  };
}

/**
 * Inclinação de um card a partir da posição normalizada do cursor.
 *
 * O eixo Y do mouse gira o card no eixo X — e com sinal invertido, senão o card
 * "foge" do cursor em vez de encará-lo.
 *
 * `intensidade` em graus. Acima de ~12° o card parece quebrado em vez de
 * inclinado; o padrão fica bem abaixo disso.
 */
export function inclinacaoDoCard(
  nx: number, ny: number, intensidade = 8,
): { rotacaoX: number; rotacaoY: number } {
  return {
    rotacaoX: -ny * intensidade,
    rotacaoY:  nx * intensidade,
  };
}

/** Distância euclidiana. A conta mais usada da página. */
export function distancia(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Influência de um ponto sobre outro, caindo com a distância.
 *
 * Vale 1 no centro e 0 a partir do raio. É o que faz partícula acender perto do
 * cursor sem precisar de condicional.
 */
export function influencia(dist: number, raio: number): number {
  if (raio <= 0) return 0;
  return limitar(1 - dist / raio, 0, 1);
}

/**
 * Repulsão entre cursor e partícula, com a força caindo pelo quadrado da
 * distância.
 *
 * A física diz `1/d²`, e a física não se importa que `d` chegue a zero. Aqui
 * importa: sem o `epsilon` no denominador, uma partícula exatamente sob o
 * cursor receberia força infinita e sairia da tela para sempre. O teto também é
 * proposital — mesmo perto, a força não pode passar de um limite utilizável.
 */
export function repulsao(
  dx: number, dy: number, forca = 1200, epsilon = 8, teto = 40,
): { fx: number; fy: number } {
  const distQuadrada = dx * dx + dy * dy + epsilon * epsilon;
  const dist = Math.sqrt(distQuadrada);
  const magnitude = limitar(forca / distQuadrada, 0, teto);
  return {
    fx: (dx / dist) * magnitude,
    fy: (dy / dist) * magnitude,
  };
}

/**
 * Posição num movimento circular.
 *
 *   x = cx + raio · cos(θ)
 *   y = cy + raio · sen(θ)
 *
 * `achatamento` comprime o eixo Y para dar a impressão de uma órbita vista de
 * lado, em vez de um círculo de frente.
 */
export function pontoOrbital(
  cx: number, cy: number, raio: number, angulo: number, achatamento = 1,
): { x: number; y: number } {
  return {
    x: cx + raio * Math.cos(angulo),
    y: cy + raio * Math.sin(angulo) * achatamento,
  };
}

/** Onda senoidal com amplitude, frequência e fase. */
export function onda(
  x: number, amplitude: number, frequencia: number, fase: number,
  tipo: 'sin' | 'cos' = 'sin',
): number {
  const f = tipo === 'sin' ? Math.sin : Math.cos;
  return amplitude * f(x * frequencia + fase);
}

/**
 * Retângulo áureo: dada a largura, a altura que satisfaz φ.
 *
 * É a proporção que o Math Lab desenha e o Easter Egg explica.
 */
export function alturaAurea(largura: number): number {
  return largura / PHI;
}

/**
 * Sequência de Fibonacci, que converge para φ na razão entre termos seguidos.
 *
 * É a demonstração de que φ não foi escolhido por gosto: ele emerge da
 * sequência.
 */
export function fibonacci(n: number): number[] {
  if (n <= 0) return [];
  const seq = [1, 1];
  while (seq.length < n) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
  return seq.slice(0, n);
}

/** Razão entre os dois últimos termos — aproxima φ conforme `n` cresce. */
export function razaoFibonacci(n: number): number {
  const seq = fibonacci(Math.max(n, 2));
  return seq[seq.length - 1] / seq[seq.length - 2];
}
