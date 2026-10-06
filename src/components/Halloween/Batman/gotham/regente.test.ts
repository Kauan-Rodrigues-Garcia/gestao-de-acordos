import { describe, expect, it, vi } from 'vitest';

const som = vi.hoisted(() => ({ estado: { noAr: 'batman', prefs: { chuva: false } } }));
vi.mock('../../SomAmbiente/motor', () => ({ ganhoDoVolume: () => 1, lerEstadoSom: () => som.estado, progresso: () => ({ atual: 100, duracao: 200 }), assinarSom: () => () => {} }));
vi.mock('../modoBatman', () => ({ FAIXA_BATMAN: 'batman', nivelAgora: () => 1, lerModoBatman: () => ({ fase: 'dentro' }) }));

const { niveisNaMusica, niveisAgora, CHUVA_CHEIA_S, RAIOS_DESDE_S } = await import('./regente');
const ponto = (atual: number, duracao = 200) => ({ atual, duracao });

describe('a cena segue a música', () => {
  it('no começo da música: sem chuva, sem raio e sem vermelho', () => {
    const n = niveisNaMusica(ponto(0), 1);
    expect(n.chuva).toBe(0);
    expect(n.raios).toBe(0);
    expect(n.tom).toBe(0);
  });

  it('a chuva enche nos primeiros segundos', () => {
    expect(niveisNaMusica(ponto(CHUVA_CHEIA_S / 2), 1).chuva).toBeCloseTo(0.5);
    expect(niveisNaMusica(ponto(CHUVA_CHEIA_S + 30), 1).chuva).toBe(1);
  });

  it('os raios só depois de um tempo, e aumentam até o fim', () => {
    expect(niveisNaMusica(ponto(RAIOS_DESDE_S - 1), 1).raios).toBe(0);
    const meio = niveisNaMusica(ponto(100), 1).raios, fim = niveisNaMusica(ponto(199), 1).raios;
    expect(meio).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(meio);
  });

  it('avermelha e pisca mais conforme a música avança', () => {
    const a = niveisNaMusica(ponto(30), 1), b = niveisNaMusica(ponto(180), 1);
    expect(b.tom).toBeGreaterThan(a.tom);
    expect(b.piscar).toBeGreaterThan(a.piscar);
  });

  it('fora do modo, nada; na entrada, sobe junto com o vermelho', () => {
    expect(niveisNaMusica(ponto(100), 0)).toEqual({ chuva: 0, raios: 0, tom: 0, piscar: 0 });
    expect(niveisNaMusica(ponto(100), 0.25).tom).toBeCloseTo(niveisNaMusica(ponto(100), 1).tom / 2);
  });

  it('sem saber o ponto (F5 antes de a música carregar), vale o meio da faixa com chuva cheia', () => {
    const n = niveisNaMusica(null, 1);
    expect(n.chuva).toBe(1);
    expect(n.raios).toBeGreaterThan(0);
  });
});

describe('o vermelho vem com a música', () => {
  it('sobe aos poucos e está inteiro perto do fim', () => {
    const t = [0, 50, 100, 150].map(s => niveisNaMusica(ponto(s), 1).tom);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    expect(niveisNaMusica(ponto(190), 1).tom).toBe(1);
  });
});

describe('a gota do player', () => {
  it('desligada (o padrão): sem chuva e sem raio; ligada, chove', () => {
    som.estado = { noAr: 'batman', prefs: { chuva: false } };
    const seco = niveisAgora();
    expect(seco.chuva).toBe(0);
    expect(seco.raios).toBe(0);
    expect(seco.tom).toBeGreaterThan(0);

    vi.spyOn(performance, 'now').mockReturnValue(1e9);
    som.estado = { noAr: 'batman', prefs: { chuva: true } };
    const molhado = niveisAgora();
    expect(molhado.chuva).toBeGreaterThan(0.9);
    expect(molhado.raios).toBeGreaterThan(0);
  });
});
