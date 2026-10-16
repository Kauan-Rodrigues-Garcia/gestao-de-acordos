import { describe, expect, it } from 'vitest';
import {
  CONTAGEM_LOBBY_S, PONTO_DA_BRUXA_S, VOLUME_INICIO, VOLUME_LUTA,
  faltaParaMusica, mmss, posicaoDaMusica, precisaPular, volumeDaMusica,
} from './trilha';

describe('trilha do lobby da bruxa', () => {
  it('a contagem é de 3 minutos e a bruxa nasce no drop da música (2:27,4)', () => {
    expect(CONTAGEM_LOBBY_S).toBe(180);
    expect(PONTO_DA_BRUXA_S).toBeCloseTo(147.4, 5);
  });

  it('a música começa quando falta o tempo do drop, 32,6 s depois de abrir a contagem', () => {
    expect(posicaoDaMusica(180)).toBeNull();
    expect(posicaoDaMusica(PONTO_DA_BRUXA_S + 0.5)).toBeNull();
    expect(posicaoDaMusica(PONTO_DA_BRUXA_S)).toBe(0);
    expect(faltaParaMusica(180)).toBeCloseTo(32.6, 5);
    expect(faltaParaMusica(100)).toBe(0);
  });

  it('quem entra no meio cai no mesmo ponto que todo mundo', () => {
    expect(posicaoDaMusica(60)).toBeCloseTo(87.4, 5);
    expect(posicaoDaMusica(0)).toBe(PONTO_DA_BRUXA_S);
    // Na luta a conta continua: 1 minuto depois de ela nascer é o drop + 60 s.
    expect(posicaoDaMusica(-60)).toBeCloseTo(207.4, 5);
    // Depois do fim da faixa, nada.
    expect(posicaoDaMusica(-300)).toBeNull();
  });

  it('o volume começa em 6%, só sobe e chega a 10% na chegada', () => {
    expect(volumeDaMusica(170)).toBe(0);
    expect(volumeDaMusica(PONTO_DA_BRUXA_S)).toBeCloseTo(VOLUME_INICIO, 5);
    let antes = 0;
    for (let falta = PONTO_DA_BRUXA_S; falta >= 0; falta -= 1) {
      const v = volumeDaMusica(falta);
      expect(v).toBeGreaterThanOrEqual(antes);
      antes = v;
    }
    expect(volumeDaMusica(0)).toBeCloseTo(VOLUME_LUTA, 5);
    expect(volumeDaMusica(-30)).toBe(VOLUME_LUTA);
    // Começa em 6% e chega a 10%; na metade da espera ainda está perto do começo.
    expect(VOLUME_INICIO).toBe(0.06);
    expect(VOLUME_LUTA).toBe(0.1);
    expect(volumeDaMusica(73)).toBeLessThan(0.075);
  });

  it('só pula a música quando o desvio passa da tolerância', () => {
    expect(precisaPular(10, 10.2)).toBe(false);
    expect(precisaPular(10, 10.4)).toBe(true);
  });

  it('formata o relógio', () => {
    expect(mmss(146)).toBe('2:26');
    expect(mmss(9.2)).toBe('0:10');
    expect(mmss(-3)).toBe('0:00');
  });
});
