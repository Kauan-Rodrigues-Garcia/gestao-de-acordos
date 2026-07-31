/**
 * trechoAudio.test.ts — de onde a música começa.
 *
 * O líder escolhe só o ponto de partida; quanto tempo toca é a duração da
 * comemoração. O erro que estes casos evitam é silencioso: um ponto colado no
 * fim faz a comemoração rodar em silêncio, e ninguém descobre até a festa
 * acontecer na frente do time.
 */
import { describe, it, expect } from 'vitest';
import { limitarInicio, sobraApos, formatarSegundos, SOBRA_MIN_S } from './trechoAudio';

describe('limitarInicio', () => {
  it('ponto normal passa intacto', () => {
    expect(limitarInicio(30, 180)).toBe(30);
  });

  it('começo da música', () => {
    expect(limitarInicio(0, 180)).toBe(0);
  });

  it('negativo vira zero', () => {
    expect(limitarInicio(-10, 180)).toBe(0);
  });

  it('não deixa colar no fim', () => {
    // Colado no fim, sobraria menos de um segundo de música.
    expect(limitarInicio(999, 60)).toBe(60 - SOBRA_MIN_S);
    expect(limitarInicio(59.8, 60)).toBe(59);
  });

  it('música de duração desconhecida começa do zero', () => {
    // `audio.duration` vem NaN ou Infinity em stream e arquivo corrompido.
    for (const total of [0, NaN, Infinity, -3]) {
      expect(limitarInicio(30, total)).toBe(0);
    }
  });

  it('ponto inválido vira zero', () => {
    expect(limitarInicio(NaN, 180)).toBe(0);
  });

  it('arredonda para uma casa, para não gravar dízima no banco', () => {
    expect(limitarInicio(12.3456, 180)).toBe(12.3);
  });
});

describe('sobraApos', () => {
  it('conta o que resta de música', () => {
    expect(sobraApos(30, 180)).toBe(150);
  });

  it('do começo, sobra tudo', () => {
    expect(sobraApos(0, 180)).toBe(180);
  });

  it('ponto além do fim é puxado antes de contar', () => {
    expect(sobraApos(999, 60)).toBe(SOBRA_MIN_S);
  });

  it('sem duração conhecida, sobra zero', () => {
    expect(sobraApos(10, NaN)).toBe(0);
  });

  it('serve para avisar que a comemoração é mais longa que a música', () => {
    // 40 s de comemoração começando aos 150 s de uma música de 180: 30 s de
    // som e 10 s de silêncio.
    const sobra = sobraApos(150, 180);
    expect(sobra).toBe(30);
    expect(sobra).toBeLessThan(40);
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
