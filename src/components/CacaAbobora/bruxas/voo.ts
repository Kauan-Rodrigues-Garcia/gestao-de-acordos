/**
 * voo.ts — como a bruxa voa. Puro: posição, velocidade e humor, nada de tela.
 *
 * ## O pedido (Cleber, 09/10/2026)
 *
 * «Ela é um pouco mais rápida, porque está em cima de uma vassoura voando pela
 * tela… para que seja um pouquinho mais difícil de clicar e acertar.»
 *
 * O zumbi anda 2 px a cada 240 ms (≈ 8 px/s na tela) e para. A bruxa voa de
 * verdade: tem inércia (acelera e faz curva, não teleporta de direção), sobe e
 * desce numa onda leve, e muda de humor:
 *
 *   chega     o «puf» de fumaça: um instante parada, rindo, e parte
 *   cruzeiro  vai de um ponto a outro da zona, na velocidade da dificuldade
 *   mergulho  desce num rasante rápido e…
 *   sobe      …volta para o alto, ainda rápida
 *   paira     PARA no ar e gargalha — a chance de quem está de olho
 *   brava     perdeu o chapéu num tiro: voa em zigue-zague, mais rápida
 *   foge      o tempo acabou: sai pela borda de cima, rindo
 *
 * A velocidade é em pixels da ARTE por segundo (na tela, ×2). Os números de
 * `VELOCIDADES` estão para o Cleber escolher no laboratório.
 */

export type Dificuldade = 'calma' | 'normal' | 'rapida' | 'insana';

/** Velocidade de cruzeiro, px da arte por segundo (na tela, o dobro). */
export const VELOCIDADES: Readonly<Record<Dificuldade, number>> = {
  calma: 28,
  normal: 42,
  rapida: 60,
  insana: 85,
};

export type Modo = 'chega' | 'cruzeiro' | 'mergulho' | 'sobe' | 'paira' | 'brava' | 'foge' | 'fora';

/** Onde o CENTRO do sprite pode ir. */
export interface Zona { x0: number; y0: number; x1: number; y1: number }

export interface Voo {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Para onde olha: 1 direita, -1 esquerda. Só vira com folga (sem tremer). */
  lado: 1 | -1;
  modo: Modo;
  /** Até quando fica neste modo (em `t`). */
  ate: number;
  alvo: { x: number; y: number };
  base: number;
  aleatorio: () => number;
}

export type EventoVoo = 'gargalha' | 'mergulha' | 'brava' | 'foge';

const ACELERACAO = 240;
const CHEGOU = 10;
/** Quanto passa da borda até ser «fora» (metade do sprite e mais um pouco). */
const MARGEM_FORA = 40;

export function criarVoo(zona: Zona, base: number, aleatorio: () => number = Math.random, onde?: { x: number; y: number }): Voo {
  const x = onde?.x ?? zona.x0 + aleatorio() * (zona.x1 - zona.x0);
  const y = onde?.y ?? zona.y0 + aleatorio() * (zona.y1 - zona.y0) * 0.7;
  const lado = x < (zona.x0 + zona.x1) / 2 ? 1 : -1;
  return { t: 0, x, y, vx: 0, vy: 0, lado, modo: 'chega', ate: 0.7, alvo: { x, y }, base, aleatorio };
}

const entre = (v: Voo, a: number, b: number) => a + v.aleatorio() * (b - a);
const limitar = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function sortearAlvo(v: Voo, z: Zona, longe = true): void {
  // Longe de onde está: atravessa a tela em vez de ficar rodando no mesmo canto.
  for (let i = 0; i < 6; i++) {
    const x = entre(v, z.x0, z.x1), y = entre(v, z.y0, z.y1);
    if (!longe || Math.hypot(x - v.x, y - v.y) > (z.x1 - z.x0) * 0.3 || i === 5) { v.alvo = { x, y }; return; }
  }
}

/** Velocidade que o modo quer, em múltiplos da base. */
function fator(m: Modo): number {
  switch (m) {
    case 'mergulho': return 1.9;
    case 'sobe': return 1.45;
    case 'brava': return 1.7;
    case 'foge': return 2.4;
    case 'paira': case 'chega': case 'fora': return 0;
    default: return 1;
  }
}

function mudar(v: Voo, z: Zona, modo: Modo, ev: EventoVoo[]): void {
  v.modo = modo;
  switch (modo) {
    case 'cruzeiro':
      v.ate = v.t + entre(v, 3, 6);
      sortearAlvo(v, z);
      break;
    case 'mergulho': {
      const dir = v.vx !== 0 ? Math.sign(v.vx) : v.lado;
      v.alvo = { x: limitar(v.x + dir * entre(v, 90, 170), z.x0, z.x1), y: z.y1 };
      v.ate = v.t + 3;
      ev.push('mergulha');
      break;
    }
    case 'sobe': {
      const dir = v.vx !== 0 ? Math.sign(v.vx) : v.lado;
      v.alvo = { x: limitar(v.x + dir * entre(v, 70, 140), z.x0, z.x1), y: entre(v, z.y0, z.y0 + (z.y1 - z.y0) * 0.35) };
      v.ate = v.t + 3;
      break;
    }
    case 'paira':
      v.ate = v.t + entre(v, 1.3, 2.1);
      ev.push('gargalha');
      break;
    case 'brava':
      v.ate = v.t + 4;
      sortearAlvo(v, z, false);
      ev.push('brava');
      break;
    case 'foge': {
      const lado = v.x < (z.x0 + z.x1) / 2 ? -1 : 1;
      v.alvo = { x: lado < 0 ? z.x0 - 200 : z.x1 + 200, y: z.y0 - 160 };
      v.ate = Infinity;
      ev.push('foge');
      break;
    }
    default:
      break;
  }
}

/** Ela perdeu o chapéu: fica brava. */
export function enfurecer(v: Voo, z: Zona): EventoVoo[] {
  const ev: EventoVoo[] = [];
  if (v.modo !== 'foge' && v.modo !== 'fora') mudar(v, z, 'brava', ev);
  return ev;
}

/** O tempo da rodada acabou. */
export function fugir(v: Voo, z: Zona): EventoVoo[] {
  const ev: EventoVoo[] = [];
  if (v.modo !== 'foge' && v.modo !== 'fora') mudar(v, z, 'foge', ev);
  return ev;
}

export function avancarVoo(v: Voo, z: Zona, dt: number): EventoVoo[] {
  const ev: EventoVoo[] = [];
  v.t += dt;
  const d = Math.hypot(v.alvo.x - v.x, v.alvo.y - v.y);

  // Troca de humor: no fim do tempo, ou ao chegar no alvo.
  if (v.modo === 'chega' && v.t >= v.ate) mudar(v, z, 'cruzeiro', ev);
  else if (v.modo === 'paira' && v.t >= v.ate) mudar(v, z, 'cruzeiro', ev);
  else if (v.modo === 'mergulho' && (d < CHEGOU * 2 || v.t >= v.ate)) mudar(v, z, 'sobe', ev);
  else if (v.modo === 'sobe' && (d < CHEGOU * 2 || v.t >= v.ate)) mudar(v, z, 'cruzeiro', ev);
  else if (v.modo === 'brava') {
    if (v.t >= v.ate) mudar(v, z, 'cruzeiro', ev);
    else if (d < CHEGOU * 2) sortearAlvo(v, z, false);
  } else if (v.modo === 'cruzeiro') {
    if (v.t >= v.ate) {
      const r = v.aleatorio();
      mudar(v, z, r < 0.3 ? 'mergulho' : r < 0.52 ? 'paira' : 'cruzeiro', ev);
    } else if (d < CHEGOU) sortearAlvo(v, z);
  }

  // A direção que ela quer, com uma oscilação de lado (voo vivo, não régua).
  const vel = v.base * fator(v.modo);
  let qx = 0, qy = 0;
  if (vel > 0) {
    const dd = Math.max(d, 0.001);
    // Freia ao chegar (menos na fuga, que passa direto).
    const chegando = v.modo === 'foge' ? 1 : Math.min(1, dd / 40);
    const ux = (v.alvo.x - v.x) / dd, uy = (v.alvo.y - v.y) / dd;
    const ondula = Math.sin(v.t * 2.3) * 0.28;
    qx = (ux - uy * ondula) * vel * Math.max(0.35, chegando);
    qy = (uy + ux * ondula) * vel * Math.max(0.35, chegando);
  }
  const acel = ACELERACAO * (v.modo === 'brava' || v.modo === 'mergulho' ? 1.6 : 1);
  const ax = qx - v.vx, ay = qy - v.vy;
  const na = Math.hypot(ax, ay);
  const k = na > acel * dt ? (acel * dt) / na : 1;
  v.vx += ax * k;
  v.vy += ay * k;
  v.x += v.vx * dt;
  v.y += v.vy * dt;

  // Nunca sai da zona sem querer (só fugindo).
  if (v.modo !== 'foge') {
    if (v.x < z.x0 || v.x > z.x1) { v.x = limitar(v.x, z.x0, z.x1); v.vx *= -0.3; }
    if (v.y < z.y0 || v.y > z.y1) { v.y = limitar(v.y, z.y0, z.y1); v.vy *= -0.3; }
  } else if (v.x < z.x0 - MARGEM_FORA * 3 || v.x > z.x1 + MARGEM_FORA * 3 || v.y < z.y0 - MARGEM_FORA * 3) {
    v.modo = 'fora';
  }

  if (v.vx > 8) v.lado = 1;
  else if (v.vx < -8) v.lado = -1;
  return ev;
}

/** O sobe e desce da vassoura (só o desenho; o tiro usa o mesmo). Parada no ar, balança mais. */
export function balanco(v: Voo): number {
  const parada = v.modo === 'paira' || v.modo === 'chega';
  return Math.round(Math.sin(v.t * (parada ? 3.2 : 5.5)) * (parada ? 3 : 1.5));
}

/** A bruxa está rindo (o desenho usa os quadros de gargalhada). */
export function rindo(v: Voo): boolean {
  return v.modo === 'paira' || v.modo === 'chega' || v.modo === 'foge';
}
