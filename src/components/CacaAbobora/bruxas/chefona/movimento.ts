/**
 * movimento.ts — como a Bruxa do Pântano flutua e como ela foge do tiro.
 *
 * Puro (sem DOM): tudo em pixels da ARTE (a tela dividida pela escala), com o
 * sorteio injetado, para os testes rodarem sem navegador.
 *
 * ## Voo
 *
 * A bruxa do Minecraft não voa: ela está sob LEVITAÇÃO (o palco solta as
 * partículas do efeito em volta dela). Persegue um ponto da metade de cima da
 * tela; chegou perto, sorteia outro. A velocidade vira aos poucos (`VIRADA`),
 * então a curva é redonda. De pé, como mob do jogo: não inclina.
 *
 * ## Manobras: o desvio
 *
 * Quando apanha demais (ou na sorte), ela bebe uma poção (ou usa um item) e
 * foge do tiro:
 *
 *   velocidade  Poção de Velocidade: dispara de lado
 *   salto       Poção de Salto: despenca até quase o chão e pula de volta
 *   perola      Pérola do Ender: ergue a pérola, JOGA (ela voa em arco até
 *               outro lugar) e, quando a pérola cai, ela se teleporta para lá
 *               (o teleporte do Enderman)
 *   levitacao   Poção de Levitação: sobe de uma vez
 *
 * Desde 15/10/2026 ela só é intocável no instante do teleporte (`invulneravel`):
 * antes ficava intocável a manobra inteira, e quem clicava rápido via metade
 * dos cliques virar «ESQUIVOU!» (o Kauan: «não está indo vários cliques»). Nas
 * poções ela continua levando tiro; o desvio é a velocidade.
 */

export type Manobra = 'velocidade' | 'salto' | 'perola' | 'levitacao';

export const MANOBRAS: readonly Manobra[] = ['velocidade', 'salto', 'perola', 'levitacao'];

/** O letreiro de cada manobra. */
export const NOME_MANOBRA: Readonly<Record<Manobra, string>> = {
  velocidade: 'POÇÃO DE VELOCIDADE!',
  salto: 'POÇÃO DE SALTO!',
  perola: 'PÉROLA DO ENDER!',
  levitacao: 'LEVITAÇÃO!',
};

/** A cor das partículas de cada manobra (as do efeito no jogo). */
export const COR_MANOBRA: Readonly<Record<Manobra, string>> = {
  velocidade: '#7cafc6',
  salto: '#22ff4c',
  perola: '#c040ff',
  levitacao: '#ceffff',
};

/** Quanto cada manobra dura (s). */
export const DURACAO_MANOBRA: Readonly<Record<Manobra, number>> = {
  velocidade: 0.65,
  salto: 1.4,
  perola: 1.5,
  levitacao: 1.2,
};

/**
 * A Pérola do Ender, em fração da manobra: até `SAI` ela mira com a pérola na
 * mão; de `SAI` a `CHEGA` a pérola voa; em `CHEGA` ela some e reaparece onde a
 * pérola caiu; de `VOLTA` em diante ela já está lá, visível.
 */
export const PEROLA_SAI = 0.22;
export const PEROLA_CHEGA = 0.74;
export const PEROLA_VOLTA = 0.8;

export interface Zona { x0: number; y0: number; x1: number; y1: number; chao: number }

interface EmManobra {
  tipo: Manobra;
  t: number;
  dura: number;
  x0: number;
  y0: number;
  /** Para onde ela vai (o fim da disparada, o ponto onde reaparece). */
  x1: number;
  y1: number;
  dir: 1 | -1;
  /** O teleporte já trocou de lugar. */
  trocou: boolean;
}

export interface Corpo {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Para onde ela olha. */
  lado: 1 | -1;
  alvoX: number;
  alvoY: number;
  /** Rotação do sprite (rad), positiva = horário. Só a tontura e a morte giram. */
  giro: number;
  visivel: boolean;
  manobra: EmManobra | null;
}

/** O que a tela precisa saber para tocar som e soltar partícula. */
export type EventoMovimento =
  | { tipo: 'some'; x: number; y: number }
  | { tipo: 'aparece'; x: number; y: number }
  /** A pérola saiu da mão (de onde ela está, para onde vai). */
  | { tipo: 'lancou'; x: number; y: number; ateX: number; ateY: number }
  | { tipo: 'fim' };

/** Quão rápido a velocidade vira para o alvo (1/s). */
const VIRADA = 2.2;
/** Chegou a esta distância do alvo: sorteia outro. */
const PERTO = 14;

const entre = (r: () => number, a: number, b: number) => a + r() * (b - a);
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const suave = (u: number) => u * u * (3 - 2 * u);

export function novoAlvo(c: Corpo, z: Zona, r: () => number): void {
  // Longe do ponto atual: sem isso ela fica rodando no mesmo canto.
  for (let i = 0; i < 6; i++) {
    c.alvoX = entre(r, z.x0, z.x1);
    c.alvoY = entre(r, z.y0, z.y1);
    if (Math.hypot(c.alvoX - c.x, c.alvoY - c.y) > (z.x1 - z.x0) / 4) break;
  }
}

/** Ela entra pelo lado esquerdo ou direito, um pouco acima do meio. */
export function criarCorpo(z: Zona, r: () => number): Corpo {
  const daEsquerda = r() < 0.5;
  const c: Corpo = {
    x: daEsquerda ? z.x0 - 60 : z.x1 + 60,
    y: entre(r, z.y0, (z.y0 + z.y1) / 2),
    vx: 0, vy: 0,
    lado: daEsquerda ? 1 : -1,
    alvoX: 0, alvoY: 0, giro: 0, visivel: true, manobra: null,
  };
  c.alvoX = daEsquerda ? z.x0 + (z.x1 - z.x0) * 0.3 : z.x1 - (z.x1 - z.x0) * 0.3;
  c.alvoY = c.y;
  return c;
}

/** Só no teleporte da pérola ela não leva tiro (some de um lugar e aparece no outro). */
export function invulneravel(c: Corpo): boolean {
  return c.manobra?.tipo === 'perola' && !c.visivel;
}

/** Onde está a manobra da pérola: mirando, com a pérola no ar (0–1 do voo), ou já foi. */
export function faseDaPerola(c: Corpo): { mirando: boolean; voo: number | null } | null {
  const m = c.manobra;
  if (!m || m.tipo !== 'perola') return null;
  const u = m.t / m.dura;
  if (u < PEROLA_SAI) return { mirando: true, voo: null };
  if (u < PEROLA_CHEGA) return { mirando: false, voo: (u - PEROLA_SAI) / (PEROLA_CHEGA - PEROLA_SAI) };
  return { mirando: false, voo: null };
}

/** Uma manobra que caiba onde ela está (o salto precisa de chão; a levitação, de céu). */
export function escolherManobra(c: Corpo, z: Zona, r: () => number, ultima?: Manobra | null): Manobra {
  const cabe = MANOBRAS.filter(m => {
    if (m === ultima) return false;
    if (m === 'salto') return z.chao - c.y > 70;
    if (m === 'levitacao') return c.y - z.y0 > 40;
    return true;
  });
  const lista = cabe.length ? cabe : MANOBRAS.filter(m => m !== ultima);
  return lista[Math.floor(r() * lista.length) % lista.length];
}

export function iniciarManobra(c: Corpo, tipo: Manobra, z: Zona, r: () => number): void {
  // Para o lado que tem mais espaço.
  const dir: 1 | -1 = c.x - z.x0 > z.x1 - c.x ? -1 : 1;
  let x1 = c.x, y1 = c.y;
  if (tipo === 'velocidade') x1 = limitar(c.x + dir * 150, z.x0, z.x1);
  if (tipo === 'perola') {
    // Longe de onde ela está: a pérola tem que ir de verdade para outro canto.
    for (let i = 0; i < 8; i++) {
      x1 = entre(r, z.x0, z.x1);
      y1 = entre(r, z.y0, z.y1);
      if (Math.abs(x1 - c.x) > (z.x1 - z.x0) / 3) break;
    }
  }
  c.manobra = { tipo, t: 0, dura: DURACAO_MANOBRA[tipo], x0: c.x, y0: c.y, x1, y1, dir, trocou: false };
  c.lado = dir;
  c.giro = 0;
}

function passoManobra(c: Corpo, z: Zona, dt: number): EventoMovimento[] {
  const m = c.manobra!;
  const ev: EventoMovimento[] = [];
  m.t += dt;
  const u = Math.min(1, m.t / m.dura);
  switch (m.tipo) {
    case 'velocidade': {
      const k = suave(u);
      c.x = m.x0 + (m.x1 - m.x0) * k;
      c.y = m.y0 - Math.sin(u * Math.PI) * 6;
      break;
    }
    case 'salto': {
      // Despenca (sem a levitação) e o pulo da poção leva de volta.
      const fundo = Math.max(m.y0, z.chao - 44);
      if (u < 0.45) c.y = m.y0 + (fundo - m.y0) * (u / 0.45) ** 2;
      else {
        const k = suave((u - 0.45) / 0.55);
        const pico = Math.max(z.y0 - 6, m.y0 - 30);
        // Sobe até o pico e assenta de volta na altura de onde saiu.
        c.y = k < 0.7 ? fundo + (pico - fundo) * Math.sin((k / 0.7) * Math.PI / 2) : pico + (m.y0 - pico) * suave((k - 0.7) / 0.3);
      }
      c.x = limitar(m.x0 + m.dir * 80 * u, z.x0, z.x1);
      break;
    }
    case 'perola': {
      // Parada no ar enquanto mira e enquanto a pérola voa; olha para onde jogou.
      c.lado = m.x1 >= m.x0 ? 1 : -1;
      if (u >= PEROLA_SAI && m.t - dt < PEROLA_SAI * m.dura) ev.push({ tipo: 'lancou', x: c.x, y: c.y, ateX: m.x1, ateY: m.y1 });
      if (u >= PEROLA_CHEGA && !m.trocou) {
        // A pérola caiu: ela some daqui e aparece lá.
        m.trocou = true;
        ev.push({ tipo: 'some', x: c.x, y: c.y });
        c.visivel = false;
        c.x = m.x1;
        c.y = m.y1;
      }
      if (u >= PEROLA_VOLTA && !c.visivel) {
        c.visivel = true;
        ev.push({ tipo: 'aparece', x: c.x, y: c.y });
      }
      break;
    }
    case 'levitacao': {
      const topo = Math.max(z.y0 - 10, m.y0 - 90);
      const k = u < 0.6 ? suave(u / 0.6) : 1 - suave((u - 0.6) / 0.4) * 0.3;
      c.y = m.y0 + (topo - m.y0) * k;
      c.x = limitar(m.x0 + m.dir * 20 * u, z.x0, z.x1);
      break;
    }
  }
  c.giro = 0;
  if (u >= 1) {
    c.manobra = null;
    c.visivel = true;
    c.vx = m.dir * 30;
    c.vy = 0;
    ev.push({ tipo: 'fim' });
  }
  return ev;
}

/**
 * Um passo de voo. `vel` em px da arte por segundo. Devolve o que a tela
 * precisa ouvir (sumiu, apareceu, a manobra acabou).
 */
export function avancarCorpo(c: Corpo, z: Zona, dt: number, vel: number, r: () => number): EventoMovimento[] {
  if (c.manobra) return passoManobra(c, z, dt);
  const dx = c.alvoX - c.x, dy = c.alvoY - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist < PERTO) novoAlvo(c, z, r);
  const k = Math.min(1, dt * VIRADA);
  const alvoVx = dist > 0 ? (dx / dist) * vel : 0;
  const alvoVy = dist > 0 ? (dy / dist) * vel * 0.7 : 0;
  c.vx += (alvoVx - c.vx) * k;
  c.vy += (alvoVy - c.vy) * k;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  // Enquanto entra (fora da zona) ela não é presa; depois fica dentro dela.
  if (c.x >= z.x0 && c.x <= z.x1) c.y = limitar(c.y, z.y0, z.y1);
  if (Math.abs(c.vx) > 8) c.lado = c.vx > 0 ? 1 : -1;
  c.giro = 0;
  return [];
}

/** Ela para no ar (conjurando, atordoada): freia até parar. */
export function pairar(c: Corpo, dt: number): void {
  const k = Math.min(1, dt * 4);
  c.vx -= c.vx * k;
  c.vy -= c.vy * k;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.giro -= c.giro * k;
}

/** O sobe-e-desce da levitação (px da arte), pelo relógio. */
export function balanco(t: number): number {
  return Math.round(Math.sin(t * 2.4) * 2);
}
