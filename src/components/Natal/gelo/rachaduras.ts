/**
 * As rachaduras do bloco de gelo (Cleber, 05/11/2026: «rachaduras menores e
 * mais detalhadas», como gelo de verdade — uma rede de veios finos e brancos).
 *
 * Dois desenhos, num quadro 80 × 80 (o bloco cheio), presos ao FUNDO do bloco
 * — quando o gelo derrete, o alto some e os veios de baixo ficam no lugar:
 *
 *   - `texturaDoGelo`: os veios de sempre, finos, que o gelo já tem;
 *   - `fratura`: a rachadura que se espalha do ponto do «impacto» quando o
 *     mouse fica em cima — raios tortos com galhos, cada um com o seu atraso
 *     (o mais perto do centro racha primeiro).
 *
 * Sorteio com semente fixa: o desenho é sempre o mesmo (nada de mudar a cada
 * render) e dá para testar.
 */

export type Ponto = readonly [number, number];
export const QUADRO = 80;

function sorteador(semente: number) {
  let a = semente | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);
const caminho = (pontos: readonly Ponto[]) => pontos.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('');

/** Um veio torto: anda em passos curtos, mudando um pouco de direção a cada um. */
function veio(sorte: () => number, de: Ponto, angulo: number, comprimento: number, passo: number, torto: number): Ponto[] {
  const pontos: Ponto[] = [de];
  let [x, y] = de, a = angulo, andou = 0;
  while (andou < comprimento) {
    a += (sorte() - 0.5) * 2 * torto;
    const p = passo * (0.6 + sorte() * 0.8);
    x += Math.cos(a) * p;
    y += Math.sin(a) * p;
    andou += p;
    pontos.push([x, y]);
  }
  return pontos;
}

/** Os veios que o gelo já tem: longos (mais marcados) e os galhinhos finos. */
export function texturaDoGelo(semente = 7): { fortes: string; finas: string } {
  const sorte = sorteador(semente);
  const fortes: string[] = [], finas: string[] = [];
  for (let i = 0; i < 9; i++) {
    // Começa numa borda e entra no bloco.
    const lado = i % 4;
    const t = sorte() * QUADRO;
    const de: Ponto = lado === 0 ? [t, 0] : lado === 1 ? [QUADRO, t] : lado === 2 ? [t, QUADRO] : [0, t];
    const paraDentro = Math.atan2(QUADRO / 2 - de[1], QUADRO / 2 - de[0]) + (sorte() - 0.5) * 1.4;
    const v = veio(sorte, de, paraDentro, 26 + sorte() * 34, 4.5, 0.42);
    fortes.push(caminho(v));
    // Galhinhos saindo do veio.
    for (let g = 0; g < 3; g++) {
      const k = 1 + Math.floor(sorte() * (v.length - 1));
      const ang = paraDentro + (sorte() < 0.5 ? -1 : 1) * (0.6 + sorte() * 0.9);
      finas.push(caminho(veio(sorte, v[k], ang, 5 + sorte() * 12, 2.6, 0.5)));
    }
  }
  // Três «estrelinhas» de trinca: pontos de onde saem raios curtinhos.
  for (let e = 0; e < 3; e++) {
    const c: Ponto = [12 + sorte() * 56, 14 + sorte() * 56];
    const n = 4 + Math.floor(sorte() * 3);
    for (let r = 0; r < n; r++) {
      finas.push(caminho(veio(sorte, c, (r / n) * Math.PI * 2 + sorte() * 0.6, 3 + sorte() * 5, 1.6, 0.4)));
    }
  }
  return { fortes: fortes.join(''), finas: finas.join('') };
}

export interface Trinca {
  d: string;
  /** Segundos até começar a rachar (o mais perto do impacto vai primeiro). */
  atraso: number;
  /** Galho fino (mais claro) ou raio principal. */
  fina: boolean;
}

/** Quantos raios a fratura tem, e até onde (no quadro de 80) o mais comprido vai. */
export const RAIOS_DA_FRATURA = 8;
export const ALCANCE_DA_FRATURA = 17;

/**
 * A fratura do impacto em (cx, cy): raios curtos e tortos com galhinhos
 * (Cleber, 05/11/2026: «uma rachadura um pouco menor», que «apareça aos poucos
 * com animação»). Os raios saem um depois do outro; cada galho racha depois
 * do raio dele, mais tarde quanto mais longe do centro. Tudo termina antes do
 * segundo em que a música entra.
 */
export function fratura(cx: number, cy: number, semente = 3): Trinca[] {
  const sorte = sorteador(semente);
  const trincas: Trinca[] = [];
  // Um anel quebrado bem pequeno em volta do impacto, como vidro: é o primeiro a aparecer.
  for (let s = 0; s < 5; s++) {
    const a0 = (s / 5) * Math.PI * 2 + sorte() * 0.5, a1 = a0 + 0.55 + sorte() * 0.4, rr = 2.4 + sorte() * 1.2;
    trincas.push({
      d: `M${f(cx + Math.cos(a0) * rr)} ${f(cy + Math.sin(a0) * rr)}L${f(cx + Math.cos(a1) * (rr + 0.6))} ${f(cy + Math.sin(a1) * (rr + 0.6))}`,
      atraso: Number((0.02 + s * 0.03).toFixed(2)), fina: true,
    });
  }
  for (let r = 0; r < RAIOS_DA_FRATURA; r++) {
    const ang = (r / RAIOS_DA_FRATURA) * Math.PI * 2 + (sorte() - 0.5) * 0.6;
    const raio = veio(sorte, [cx, cy], ang, 7 + sorte() * (ALCANCE_DA_FRATURA - 9), 2.1, 0.34);
    // Um depois do outro (o passo, 0,0375 s, é maior que o sorteio, então a ordem não troca).
    const atraso = 0.1 + (r / RAIOS_DA_FRATURA) * 0.3 + sorte() * 0.03;
    trincas.push({ d: caminho(raio), atraso: Number(atraso.toFixed(2)), fina: false });
    for (let k = 2; k < raio.length; k++) {
      if (sorte() > 0.35) continue;
      const lado = sorte() < 0.5 ? -1 : 1;
      const galho = veio(sorte, raio[k], ang + lado * (0.5 + sorte() * 0.7), 2.5 + sorte() * 4, 1.4, 0.45);
      trincas.push({ d: caminho(galho), atraso: Number((atraso + 0.18 + (k / raio.length) * 0.2).toFixed(2)), fina: true });
    }
  }
  return trincas;
}
