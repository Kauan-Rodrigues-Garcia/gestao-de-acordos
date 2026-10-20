/**
 * ritmo.ts — o diretor de ritmo da chefona (16/10/2026).
 *
 * Pedido do Cleber: «um sistema que impede a luta de acabar se estiver muito
 * fácil, e não deixa ficar muito tempo… que funcione com 1 ou 100 pessoas».
 *
 * ## A ideia
 *
 * A luta tem uma LINHA IDEAL: a vida cai reta de cheia, quando ela chega, a
 * zero aos `alvoS` (90 s). A cada lote o banco olha onde a vida está em relação
 * à linha e multiplica o dano daquele lote:
 *
 *   - à frente da linha (caindo rápido demais): o dano vale menos, até
 *     `multMin`; muito à frente, ela bebe uma Poção de Cura sozinha (a mesma
 *     animação da cura do super_admin);
 *   - atrás da linha (caindo devagar): o dano vale mais, até `multMax`, e depois
 *     dos 90 s o teto sobe a cada segundo (o golpe de misericórdia);
 *   - antes de `minS` (60 s) ela não cai: a vida para no `piso`;
 *   - a partir de `maxS` (115 s) qualquer tiro a derruba (o prazo é 120 s).
 *
 * O multiplicador é o MESMO para todo mundo naquele instante: o ranking (que
 * soma o dano de cada um antes do multiplicador) continua justo.
 *
 * Funciona com qualquer número de pessoas porque não conta pessoas: só olha a
 * vida e o relógio. A conta é a mesma no banco (migration 20261016200000,
 * `fn_chefona_ritmo`) — mudou um número aqui, mude lá; o teste confere.
 */

export const RITMO = {
  /** A luta ideal (s), a mais curta e a mais longa. */
  alvoS: 90,
  minS: 60,
  maxS: 115,
  /** Quanto o multiplicador reage à distância da linha (exp(força × distância)). */
  forca: 7,
  multMin: 0.25,
  multMax: 5,
  /** Depois dos 90 s, quanto o teto do multiplicador sobe por segundo. */
  misericordiaPorS: 1,
  /** Antes de `minS`, a vida não desce disto (fração da máxima). */
  piso: 0.05,
  /** Ela bebe sozinha quando está tanto à frente da linha, no máximo a cada tanto, e até tanto da luta. */
  curaAFrente: 0.15,
  curaIntervaloS: 8,
  curaMax: 0.3,
  curaAteS: 80,
} as const;

/** Onde a vida deveria estar (fração da máxima) aos `t` segundos de luta. */
export function alvoDaVida(t: number): number {
  return Math.min(1, Math.max(0, 1 - t / RITMO.alvoS));
}

/** O multiplicador do dano agora, com a vida em `fracao` da máxima, aos `t` s de luta. */
export function ritmoDaLuta(t: number, fracao: number): number {
  if (!(t >= 0)) return 1;
  const distancia = fracao - alvoDaVida(t);
  const teto = RITMO.multMax + Math.max(0, t - RITMO.alvoS) * RITMO.misericordiaPorS;
  return Math.min(teto, Math.max(RITMO.multMin, Math.exp(RITMO.forca * distancia)));
}

/**
 * Quanto ela cura sozinha agora (fração da vida máxima), ou 0: só bem à
 * frente da linha, até `curaAteS`, e com `curaIntervaloS` desde a última cura.
 */
export function curaDoRitmo(t: number, fracao: number, desdeAUltimaCuraS: number): number {
  if (t < 0 || t >= RITMO.curaAteS || desdeAUltimaCuraS < RITMO.curaIntervaloS) return 0;
  const aFrente = alvoDaVida(t) - fracao;
  if (aFrente < RITMO.curaAFrente) return 0;
  return Math.min(RITMO.curaMax, aFrente - 0.05);
}

/** Cada tela mostra um sinal quando o ritmo muda de faixa (com folga, para não piscar). */
export type FaixaDoRitmo = 'resistente' | 'normal' | 'fraca';
export function faixaDoRitmo(mult: number, antes: FaixaDoRitmo): FaixaDoRitmo {
  if (antes === 'resistente') return mult > 0.8 ? (mult >= 1.6 ? 'fraca' : 'normal') : 'resistente';
  if (antes === 'fraca') return mult < 1.3 ? (mult <= 0.65 ? 'resistente' : 'normal') : 'fraca';
  return mult <= 0.65 ? 'resistente' : mult >= 1.6 ? 'fraca' : 'normal';
}
