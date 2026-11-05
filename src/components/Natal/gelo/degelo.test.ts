import { describe, expect, it } from 'vitest';
import {
  ALTURA_CHEIA, ALTURA_FINAL, CONGELOU_EM, DESCONGELA_EM, DIAS_DE_GELO,
  diasParaDescongelar, formaDoGelo, quantoDerreteu, somDoGelo,
} from './degelo';

const DIA = 86_400_000;

describe('o degelo, dia a dia', () => {
  it('começa congelado em 01/11 e descongela em 25/12', () => {
    expect(DIAS_DE_GELO).toBe(54);
    expect(quantoDerreteu(CONGELOU_EM - DIA)).toBe(0);
    expect(quantoDerreteu(CONGELOU_EM + 10)).toBe(0);
    expect(quantoDerreteu(DESCONGELA_EM)).toBe(1);
    expect(quantoDerreteu(DESCONGELA_EM + 30 * DIA)).toBe(1);
  });

  it('não muda no meio do dia, e cada dia derrete um pouco mais', () => {
    const manha = CONGELOU_EM + 4 * DIA + 3_600_000, noite = CONGELOU_EM + 4 * DIA + 20 * 3_600_000;
    expect(quantoDerreteu(manha)).toBe(quantoDerreteu(noite));
    let antes = -1;
    for (let d = 0; d <= DIAS_DE_GELO; d++) {
      const agora = quantoDerreteu(CONGELOU_EM + d * DIA + 1000);
      expect(agora).toBeGreaterThan(antes);
      antes = agora;
    }
  });

  it('conta os dias que faltam', () => {
    expect(diasParaDescongelar(DESCONGELA_EM - 2 * DIA)).toBe(2);
    expect(diasParaDescongelar(DESCONGELA_EM + DIA)).toBe(0);
  });
});

describe('o desenho do bloco', () => {
  it('encolhe, arredonda e a poça cresce conforme derrete', () => {
    const cheio = formaDoGelo(0), metade = formaDoGelo(0.5), fim = formaDoGelo(1);
    expect(cheio.altura).toBe(ALTURA_CHEIA);
    expect(fim.altura).toBe(ALTURA_FINAL);
    expect(metade.altura).toBeLessThan(cheio.altura);
    expect(metade.altura).toBeGreaterThan(fim.altura);
    expect(fim.raio).toBeGreaterThan(cheio.raio);
    expect(fim.poca).toBeGreaterThan(cheio.poca);
    expect(fim.embacado).toBeLessThan(cheio.embacado);
  });
});

describe('o som através do gelo', () => {
  it('fica menos abafado e com menos eco conforme derrete; no Natal, limpo', () => {
    const a = somDoGelo(0), b = somDoGelo(0.5), c = somDoGelo(0.99), natal = somDoGelo(1);
    expect(a.corte).toBe(420);
    expect(b.corte).toBeGreaterThan(a.corte);
    expect(c.corte).toBeGreaterThan(b.corte);
    expect(natal.corte).toBeGreaterThan(c.corte);
    expect(a.eco).toBeGreaterThan(b.eco);
    expect(natal.eco).toBeLessThan(c.eco);
  });
});
