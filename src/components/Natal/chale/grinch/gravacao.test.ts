import { describe, expect, it } from 'vitest';
import { GRAVACAO_CHAMINE, GRAVACAO_JANELA, aplicarNoGrinch, duracao, type Deixa } from './gravacao';
import { POSTO, type ItemDoChale } from './roteiro';

const itens = (g: readonly Deixa[]) => g.flatMap(d => ('bag' in d ? [d.bag] : []));

describe('a gravação do Grinch', () => {
  it.each([['janela', GRAVACAO_JANELA], ['chaminé', GRAVACAO_CHAMINE]] as const)('pela %s: as deixas estão em ordem de hora', (_, g) => {
    for (let i = 1; i < g.length; i++) expect(g[i].t).toBeGreaterThanOrEqual(g[i - 1].t);
    expect(g[0].t).toBe(0);
  });

  it('pela janela ele bagunça tudo o que os duendes sabem consertar, cada coisa uma vez', () => {
    const feitos = itens(GRAVACAO_JANELA);
    expect([...feitos].sort()).toEqual((Object.keys(POSTO) as ItemDoChale[]).sort());
    expect(new Set(feitos).size).toBe(feitos.length);
  });

  it('pela chaminé só mexe no que aparece com só a lareira na tela', () => {
    expect([...itens(GRAVACAO_CHAMINE)].sort()).toEqual(['bola', 'guirlanda', 'meias', 'tapete', 'velas']);
  });

  it.each([['janela', GRAVACAO_JANELA], ['chaminé', GRAVACAO_CHAMINE]] as const)('pela %s: termina com o boneco escondido e a sala bagunçada', (_, g) => {
    const some = g.flatMap(d => ('g' in d && d.g.mostra !== undefined ? [d.g.mostra] : []));
    expect(some[0]).toBe(true);
    expect(some[some.length - 1]).toBe(false);
    const fases = g.flatMap(d => ('fase' in d ? [d.fase] : []));
    expect(fases[fases.length - 1]).toBe('baguncado');
    expect(duracao(g)).toBe(g[g.length - 1].t);
  });

  it('é leve: menos de três deixas por segundo', () => {
    expect(GRAVACAO_JANELA.length / duracao(GRAVACAO_JANELA)).toBeLessThan(3);
  });

  it('aplicar um movimento só mexe em atributos e no transform', () => {
    const el = document.createElement('div');
    aplicarNoGrinch(el, { mostra: true, x: 196, dur: 0.5, pose: 'espreita', cara: 'riso', olha: -1, anda: 1, salto: 'pulinho' });
    expect(el.dataset).toMatchObject({ visivel: '1', pose: 'espreita', cara: 'riso', olha: '-1', anda: '1', salto: 'pulinho' });
    expect(el.style.transform).toBe('translateX(196px)');
    expect(el.style.transitionDuration).toBe('0.5s');
    aplicarNoGrinch(el, { anda: 0 });
    expect(el.dataset.anda).toBeUndefined();
    aplicarNoGrinch(el, { mostra: false });
    expect(el.dataset.visivel).toBeUndefined();
    expect(el.dataset.salto).toBeUndefined();
  });
});
