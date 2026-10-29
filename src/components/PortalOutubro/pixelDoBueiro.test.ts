import { describe, expect, it } from 'vitest';
import {
  ALTURA_DA_MAO, ALTURA_DO_BUEIRO, BOCA, LARGURA_DA_MAO, LARGURA_DO_BUEIRO, PALETA_DA_MAO, PALETA_DO_BUEIRO, PX,
  montarBueiro, montarMao, montarOlhos, paletaDosOlhos,
} from './pixelDoBueiro';

/** As letras que um desenho usa, menos o vazio. */
const letras = (g: readonly string[]) => new Set(g.join('').replace(/\./g, ''));

describe('o bueiro em pixel art', () => {
  const g = montarBueiro();

  it('tem o tamanho dele, e cada letra tem cor (as da barra vêm do tema)', () => {
    expect(g).toHaveLength(ALTURA_DO_BUEIRO);
    expect(g.every(l => l.length === LARGURA_DO_BUEIRO)).toBe(true);
    for (const ch of letras(g)) expect(PALETA_DO_BUEIRO[ch] ?? (['B', 'R', 'r'].includes(ch) ? 'tema' : undefined), ch).toBeTruthy();
  });

  it('a boca é escura e cabe na barra de cima (56 px), com a beira passando dela', () => {
    for (let y = BOCA.y; y < BOCA.y + BOCA.a; y++) expect(g[y].slice(BOCA.x, BOCA.x + BOCA.l)).toMatch(/^x+$/);
    expect((BOCA.y + BOCA.a) * PX).toBeLessThanOrEqual(56);
    expect(g[19]).toMatch(/[FG]/);
  });

  it('a borda quebrada da barra contorna o buraco, e as rachaduras saem pela barra', () => {
    expect(g[0]).toMatch(/R/);
    expect(g.join('')).toMatch(/r/);
  });
});

describe('os olhos no escuro', () => {
  it('cabem na boca; a pupila anda com o olhar; piscando, só o risco', () => {
    const meio = montarOlhos(0, false), direita = montarOlhos(1, false), fechado = montarOlhos(0, true);
    expect(meio).toHaveLength(BOCA.a);
    expect(meio.every(l => l.length === BOCA.l)).toBe(true);
    expect(direita).not.toEqual(meio);
    expect(fechado.join('')).not.toMatch(/[ap]/);
    expect(fechado.join('')).toMatch(/c/);
  });

  it('amarelos, e vermelhos com a mão para fora', () => {
    const olhos = montarOlhos(0, false);
    for (const vermelho of [false, true]) for (const ch of letras(olhos)) expect(paletaDosOlhos(vermelho)[ch], ch).toBeTruthy();
    expect(paletaDosOlhos(true).a).not.toBe(paletaDosOlhos(false).a);
  });
});

describe('a mão com o barco', () => {
  const m = montarMao();

  it('tem o tamanho dela e cada letra tem cor', () => {
    expect(m).toHaveLength(ALTURA_DA_MAO);
    expect(m.every(l => l.length === LARGURA_DA_MAO)).toBe(true);
    for (const ch of letras(m)) expect(PALETA_DA_MAO[ch], ch).toBeTruthy();
  });

  it('o braço desce do alto, a luva segura o barco à vista', () => {
    expect(m[0]).toMatch(/[gGlK]/);
    const papel = m.join('').split('').filter(ch => ch === 'p' || ch === 'P').length;
    expect(papel).toBeGreaterThan(30);
    expect(m.join('')).toMatch(/w/);
  });
});
