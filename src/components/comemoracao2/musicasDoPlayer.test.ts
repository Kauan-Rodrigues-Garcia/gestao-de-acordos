/**
 * musicasDoPlayer.test.ts — as faixas do player na comemoração.
 *
 * O que se perde se isto quebrar: uma festa apontando para música que não
 * existe (silêncio na tela de todo mundo) ou uma faixa estourando o volume.
 */
import { describe, it, expect } from 'vitest';
import { MUSICAS_DO_PLAYER, musicaDoPlayer, volumeComGanho } from './musicasDoPlayer';
import { designDoJson, designPadrao, designParaJson } from './design';

describe('MUSICAS_DO_PLAYER', () => {
  it('traz todas as faixas do player numa lista só, sem repetir', () => {
    const ids = MUSICAS_DO_PLAYER.map((m) => m.id);
    expect(ids.length).toBeGreaterThanOrEqual(17);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada uma tem nome, arquivo do app e ganho', () => {
    for (const m of MUSICAS_DO_PLAYER) {
      expect(m.nome).toBeTruthy();
      expect(m.url).toMatch(/^\/sounds\/.+\.mp3$/);
      expect(m.ganho).toBeGreaterThan(0);
    }
  });

  it('faixa que saiu do app não é encontrada (a festa cai no som do catálogo)', () => {
    expect(musicaDoPlayer('sumiu')).toBeNull();
    expect(musicaDoPlayer(null)).toBeNull();
    expect(musicaDoPlayer(MUSICAS_DO_PLAYER[0].id)?.id).toBe(MUSICAS_DO_PLAYER[0].id);
  });
});

describe('volumeComGanho', () => {
  it('aplica o ganho e respeita o teto', () => {
    expect(volumeComGanho(15, 2)).toBe(30);
    expect(volumeComGanho(80, 2.86)).toBe(100);
    expect(volumeComGanho(15, 0)).toBe(15);
    expect(volumeComGanho(Number.NaN, 1)).toBe(0);
  });
});

describe('design com música do player e trecho', () => {
  it('vai e volta do banco', () => {
    const d = { ...designPadrao(), somFaixa: 'raindance', somInicioS: 42.5 };
    const volta = designDoJson(designParaJson(d));
    expect(volta?.somFaixa).toBe('raindance');
    expect(volta?.somInicioS).toBe(42.5);
  });

  it('lixo no JSON vira null', () => {
    const d = designDoJson({ versao: 2, somFaixa: '../../x.mp3', somInicioS: -3 });
    expect(d?.somFaixa).toBeNull();
    expect(d?.somInicioS).toBeNull();
  });
});
