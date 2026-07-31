/**
 * trechoAudio.test.ts — o pedaço da música que toca.
 *
 * O erro que estes casos evitam é silencioso: um trecho que começa perto do
 * fim da música e dura mais do que sobra toca silêncio, e ninguém descobre até
 * a comemoração acontecer na frente do time.
 */
import { describe, it, expect } from 'vitest';
import {
  limitarTrecho, trechoSugerido, fimDoTrecho, formatarSegundos,
  TRECHO_MAX_S, TRECHO_MIN_S,
} from './trechoAudio';

describe('limitarTrecho', () => {
  it('trecho normal passa intacto', () => {
    expect(limitarTrecho({ inicio: 30, duracao: 20 }, 180))
      .toEqual({ inicio: 30, duracao: 20 });
  });

  it('corta a duração pelo que sobra da música', () => {
    // Começa em 50 s numa música de 60 s: só há 10 s pela frente.
    expect(limitarTrecho({ inicio: 50, duracao: 60 }, 60))
      .toEqual({ inicio: 50, duracao: 10 });
  });

  it('respeita o teto de 60 s', () => {
    expect(limitarTrecho({ inicio: 0, duracao: 200 }, 600).duracao).toBe(TRECHO_MAX_S);
  });

  it('não deixa a duração ficar abaixo do mínimo', () => {
    expect(limitarTrecho({ inicio: 0, duracao: 0 }, 180).duracao).toBe(TRECHO_MIN_S);
    expect(limitarTrecho({ inicio: 0, duracao: -5 }, 180).duracao).toBe(TRECHO_MIN_S);
  });

  it('início negativo vira zero', () => {
    expect(limitarTrecho({ inicio: -10, duracao: 20 }, 180).inicio).toBe(0);
  });

  it('início além do fim é puxado para caber o mínimo', () => {
    const r = limitarTrecho({ inicio: 999, duracao: 20 }, 60);
    expect(r.inicio).toBe(60 - TRECHO_MIN_S);
    expect(fimDoTrecho(r)).toBeLessThanOrEqual(60);
  });

  it('o trecho NUNCA passa do fim da música', () => {
    // A regra que importa: passar do fim toca silêncio.
    for (const [inicio, duracao, total] of [
      [50, 60, 60], [170, 30, 180], [0, 500, 12], [11.5, 45, 12],
    ] as const) {
      expect(fimDoTrecho(limitarTrecho({ inicio, duracao }, total)))
        .toBeLessThanOrEqual(total + 0.05);
    }
  });

  it('música de duração desconhecida vira o trecho mínimo', () => {
    // `audio.duration` vem NaN ou Infinity em stream e arquivo corrompido.
    for (const total of [0, NaN, Infinity, -3]) {
      expect(limitarTrecho({ inicio: 10, duracao: 30 }, total))
        .toEqual({ inicio: 0, duracao: TRECHO_MIN_S });
    }
  });

  it('arredonda para uma casa, para não gravar dízima no banco', () => {
    const r = limitarTrecho({ inicio: 12.3456, duracao: 20.9876 }, 180);
    expect(r.inicio).toBe(12.3);
    expect(r.duracao).toBe(21);
  });
});

describe('trechoSugerido', () => {
  it('música longa: começa do zero, 30 s', () => {
    expect(trechoSugerido(180)).toEqual({ inicio: 0, duracao: 30 });
  });

  it('música curta: usa o que tem', () => {
    expect(trechoSugerido(12)).toEqual({ inicio: 0, duracao: 12 });
  });

  it('sem duração conhecida não estoura', () => {
    expect(trechoSugerido(NaN)).toEqual({ inicio: 0, duracao: TRECHO_MIN_S });
  });
});

describe('formatarSegundos', () => {
  it('mostra minuto e segundo', () => {
    expect(formatarSegundos(0)).toBe('0:00');
    expect(formatarSegundos(9)).toBe('0:09');
    expect(formatarSegundos(95)).toBe('1:35');
    expect(formatarSegundos(600)).toBe('10:00');
  });

  it('valor inválido vira 0:00 em vez de NaN na tela', () => {
    expect(formatarSegundos(NaN)).toBe('0:00');
    expect(formatarSegundos(-5)).toBe('0:00');
  });
});
