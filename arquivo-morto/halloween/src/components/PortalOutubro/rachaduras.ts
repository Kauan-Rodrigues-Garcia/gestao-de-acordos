/**
 * rachaduras.ts — o desenho das rachaduras do vidro, dia a dia.
 *
 * Cada rachadura é uma linha que anda aos tropeços a partir de uma borda (ou
 * de um canto) e solta galhos pelo caminho. Tudo sai de uma semente fixa: a
 * tela de todo mundo racha igual, e o F5 não muda nada.
 *
 * Cada uma tem a hora em que nasce e quanto leva para crescer: a semana vai
 * se espalhando pelo dia, e o relógio de teste acelerado mostra o vidro
 * rachando. A caixa do desenho é 1920 × 1080; a tela a cobre (`slice`), então
 * uma rachadura que nasce na borda nasce na borda de qualquer monitor.
 *
 *   seg  um ponto de impacto no canto de cima, à direita
 *   ter  atravessa o topo, da direita para a esquerda
 *   qua  as bordas, com outro impacto na esquerda
 *   qui  de baixo para cima, com um impacto embaixo à direita
 *   sex  entram um pouco mais, sem chegar no meio
 *
 * Vidro trinca em reta: passos longos e quebras de ângulo secas, não curvas.
 *
 * Puro: o relógio entra como número.
 */
import { DIAS } from './fases';

export const LARGURA = 1920;
export const ALTURA = 1080;

const HORA = 3_600_000;

export interface Rachadura {
  id: number;
  dia: 1 | 2 | 3 | 4 | 5;
  /** O caminho SVG (na caixa 1920 × 1080). */
  d: string;
  pontos: readonly [number, number][];
  /** Comprimento total (para o traço crescer). */
  comprimento: number;
  nasceEm: number;
  cresceMs: number;
  /** A grossura do traço (px na caixa). */
  largura: number;
  galho: boolean;
}

/** Acaso com semente (mulberry32). */
export function sorteador(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Semente {
  dia: 1 | 2 | 3 | 4 | 5;
  x: number;
  y: number;
  /** Direção, em radianos (0 = direita, π/2 = para baixo). */
  angulo: number;
  comprimento: number;
  largura: number;
  /** Nasce entre estas horas do dia dele. */
  nasceDe: number;
  nasceAte: number;
  cresceH: number;
  /** Quanto o caminho insiste na direção (0 = solto, 0,3 = quase reto). */
  firmeza?: number;
  /** Começa num ponto de impacto (a «teia» de vidro quebrado). */
  impacto?: boolean;
}

const PI = Math.PI;

/** Para o meio da tela, com um desvio. */
const paraOMeio = (x: number, y: number, desvio: number) => Math.atan2(ALTURA / 2 - y, LARGURA / 2 - x) + desvio;

const SEMENTES: readonly Semente[] = [
  // Segunda: o ponto de impacto no canto de cima, à direita, e uma fissura saindo dele.
  { dia: 1, x: 1838, y: 34, angulo: 2.55, comprimento: 260, largura: 1.5, nasceDe: 7.5, nasceAte: 7.5, cresceH: 3, impacto: true },
  // Terça: atravessa o topo, da direita para a esquerda.
  { dia: 2, x: 1800, y: 40, angulo: PI + 0.03, comprimento: 1450, largura: 1.4, nasceDe: 8, nasceAte: 8, cresceH: 6, firmeza: 0.35 },
  { dia: 2, x: 1932, y: 230, angulo: PI + 0.3, comprimento: 200, largura: 1.2, nasceDe: 12, nasceAte: 13, cresceH: 2 },
  // Quarta: as bordas (com um impacto na esquerda).
  { dia: 3, x: 26, y: 430, angulo: 0.1, comprimento: 300, largura: 1.4, nasceDe: 7, nasceAte: 9, cresceH: 3, impacto: true },
  { dia: 3, x: -12, y: 1092, angulo: -0.8, comprimento: 340, largura: 1.4, nasceDe: 8, nasceAte: 10, cresceH: 3 },
  { dia: 3, x: 1932, y: 650, angulo: PI - 0.1, comprimento: 300, largura: 1.4, nasceDe: 9, nasceAte: 11, cresceH: 3 },
  { dia: 3, x: -12, y: -12, angulo: 0.7, comprimento: 240, largura: 1.2, nasceDe: 10, nasceAte: 12, cresceH: 2 },
  // Quinta: de baixo para cima (outro impacto, embaixo à direita).
  { dia: 4, x: 700, y: 1092, angulo: -1.7, comprimento: 300, largura: 1.4, nasceDe: 7, nasceAte: 9, cresceH: 3 },
  { dia: 4, x: 1860, y: 1040, angulo: -2.5, comprimento: 340, largura: 1.5, nasceDe: 8, nasceAte: 10, cresceH: 3, impacto: true },
  { dia: 4, x: 1380, y: 1092, angulo: -1.35, comprimento: 280, largura: 1.3, nasceDe: 9, nasceAte: 11, cresceH: 3 },
  { dia: 4, x: -12, y: 780, angulo: -0.05, comprimento: 320, largura: 1.3, nasceDe: 10, nasceAte: 12, cresceH: 3 },
  { dia: 4, x: 1932, y: 330, angulo: PI + 0.18, comprimento: 320, largura: 1.3, nasceDe: 11, nasceAte: 13, cresceH: 3 },
  // Sexta: entram mais um pouco, sem chegar no meio (tudo pronto antes das 16h).
  { dia: 5, x: 320, y: -12, angulo: paraOMeio(320, -12, 0.2), comprimento: 380, largura: 1.5, nasceDe: 6, nasceAte: 8, cresceH: 3 },
  { dia: 5, x: 1560, y: -12, angulo: paraOMeio(1560, -12, -0.2), comprimento: 380, largura: 1.5, nasceDe: 7, nasceAte: 9, cresceH: 3 },
  { dia: 5, x: -12, y: 230, angulo: paraOMeio(-12, 230, 0.15), comprimento: 420, largura: 1.5, nasceDe: 8, nasceAte: 10, cresceH: 3 },
  { dia: 5, x: 1932, y: 870, angulo: paraOMeio(1932, 870, -0.15), comprimento: 420, largura: 1.5, nasceDe: 9, nasceAte: 11, cresceH: 3 },
  { dia: 5, x: 1100, y: 1092, angulo: paraOMeio(1100, 1092, 0.25), comprimento: 340, largura: 1.5, nasceDe: 10, nasceAte: 12, cresceH: 2.5 },
  { dia: 5, x: 300, y: 1060, angulo: paraOMeio(300, 1060, -0.1), comprimento: 360, largura: 1.5, nasceDe: 11, nasceAte: 12.5, cresceH: 2.5, impacto: true },
];

const fora = (x: number, y: number) => x < -60 || y < -60 || x > LARGURA + 60 || y > ALTURA + 60;

/** Gera a rede inteira (as sementes, os galhos e os pontos de impacto). Sempre igual. */
export function gerarRachaduras(semente = 3010): Rachadura[] {
  const acaso = sorteador(semente);
  const todas: Rachadura[] = [];
  let id = 0;

  const guardar = (dia: Semente['dia'], pontos: [number, number][], nasceEm: number, cresceMs: number, largura: number, galho: boolean) => {
    let comprimento = 0;
    for (let k = 1; k < pontos.length; k++) comprimento += Math.hypot(pontos[k][0] - pontos[k - 1][0], pontos[k][1] - pontos[k - 1][1]);
    todas.push({
      id: id++,
      dia,
      d: 'M' + pontos.map(([px, py]) => `${px} ${py}`).join('L'),
      pontos,
      comprimento: Math.max(1, comprimento),
      nasceEm,
      cresceMs,
      largura,
      galho,
    });
  };

  /*
   * Vidro trinca em retas: passos longos, quase na mesma direção, e de vez em
   * quando uma quebra de ângulo seca.
   */
  const andar = (
    s: Pick<Semente, 'dia' | 'x' | 'y' | 'angulo' | 'comprimento' | 'largura' | 'firmeza'>,
    nasceEm: number,
    cresceMs: number,
    profundidade: number,
  ) => {
    const pontos: [number, number][] = [[s.x, s.y]];
    let x = s.x, y = s.y, ang = s.angulo, andado = 0;
    const firmeza = s.firmeza ?? 0.2;
    const galhos: { x: number; y: number; ang: number; resto: number; em: number }[] = [];
    while (andado < s.comprimento) {
      const passo = 34 + acaso() * 48;
      const quebra = acaso() < 0.28 ? (acaso() - 0.5) * 1.1 : (acaso() - 0.5) * 0.22;
      ang += (s.angulo - ang) * firmeza + quebra;
      x += Math.cos(ang) * passo;
      y += Math.sin(ang) * passo;
      andado += passo;
      pontos.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      if (fora(x, y)) break;
      if (profundidade < 2 && pontos.length > 2 && acaso() < (s.dia === 5 ? 0.12 : 0.18)) {
        const lado = acaso() < 0.5 ? -1 : 1;
        galhos.push({ x, y, ang: ang + lado * (0.45 + acaso() * 0.7), resto: (s.comprimento - andado) * (0.25 + acaso() * 0.3), em: andado });
      }
    }
    guardar(s.dia, pontos, nasceEm, cresceMs, s.largura, profundidade > 0);
    const total = todas[todas.length - 1].comprimento;
    for (const g of galhos) {
      if (g.resto < 30) continue;
      andar(
        { dia: s.dia, x: g.x, y: g.y, angulo: g.ang, comprimento: g.resto, largura: Math.max(0.9, s.largura * 0.7) },
        nasceEm + cresceMs * (g.em / total),
        cresceMs * (g.resto / total) * 1.3,
        profundidade + 1,
      );
    }
  };

  /** O ponto de impacto: raios curtos em volta e dois anéis quebrados ligando os raios (a «teia» do vidro). */
  const impacto = (s: Semente, nasceEm: number) => {
    const n = 7;
    const angulos = Array.from({ length: n }, (_, k) => s.angulo + (k / n) * PI * 2 + (acaso() - 0.5) * 0.4);
    const pontoEm = (a: number, r: number): [number, number] => [Math.round((s.x + Math.cos(a) * r) * 10) / 10, Math.round((s.y + Math.sin(a) * r) * 10) / 10];
    for (const a of angulos.slice(1)) {
      const r = 50 + acaso() * 90;
      guardar(s.dia, [[s.x, s.y], pontoEm(a + (acaso() - 0.5) * 0.15, r * 0.5), pontoEm(a, r)], nasceEm, 8 * 60_000, s.largura * 0.8, true);
    }
    for (const r of [18 + acaso() * 6, 40 + acaso() * 10]) {
      for (let k = 0; k < n; k++) {
        if (acaso() < 0.35) continue; // anel quebrado: falta pedaço
        const a0 = angulos[k], a1 = angulos[(k + 1) % n] + (k + 1 === n ? PI * 2 : 0);
        guardar(s.dia, [pontoEm(a0, r * (0.9 + acaso() * 0.2)), pontoEm(a1, r * (0.9 + acaso() * 0.2))], nasceEm + 4 * 60_000, 6 * 60_000, s.largura * 0.7, true);
      }
    }
  };

  for (const s of SEMENTES) {
    const nasce = DIAS[s.dia] + (s.nasceDe + acaso() * (s.nasceAte - s.nasceDe)) * HORA;
    if (s.impacto) impacto(s, nasce);
    andar(s, nasce, s.cresceH * HORA, 0);
  }
  return todas;
}

/** Quanto de uma rachadura já apareceu (0 a 1). */
export function crescimento(r: Pick<Rachadura, 'nasceEm' | 'cresceMs'>, agora: number): number {
  if (agora <= r.nasceEm) return 0;
  return Math.min(1, (agora - r.nasceEm) / r.cresceMs);
}

/** A ponta de uma rachadura crescendo (para os farelos caírem dali). */
export function pontaEm(r: Pick<Rachadura, 'pontos'>, fracao: number): [number, number] {
  const i = Math.min(r.pontos.length - 1, Math.max(0, Math.round(fracao * (r.pontos.length - 1))));
  return r.pontos[i];
}
