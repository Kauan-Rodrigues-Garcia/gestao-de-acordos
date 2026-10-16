/**
 * coracoes.test.ts — a barra de vida em corações e o modo leve da chefona.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  POR_FILEIRA, TOTAL, coracoesDaVida, coracoesDeOuro, posicaoDoCoracao, pulinhoDaRegeneracao, tamanhoDosCoracoes,
} from './coracoes';
import { CLASSE_VEU, FILTRO_NEGATIVO, VEU_LEVE, alvosPorAtributo, feiticosLeves, lancar } from './feiticos';
import { JANELA_S, QUADRO_PESADO_MS, criarVigiaDeQuadros } from './leve';
import { tamanhoDaPlaca } from './conquista';
import { glifoMC } from './fonteMC';
import { CONQUISTA, milhar } from './palcoChefona';

const conta = (l: readonly string[], k: string) => l.filter(x => x === k).length;

describe('os corações da barra', () => {
  it('vida cheia: todos cheios; zero: todos vazios', () => {
    expect(conta(coracoesDaVida(3000, 3000), 'cheio')).toBe(TOTAL);
    expect(conta(coracoesDaVida(0, 3000), 'vazio')).toBe(TOTAL);
  });

  it('cada coração é uma fração da vida, com meio coração no fim', () => {
    // 40 corações = 80 metades: 1.000 de 3.000 são 26,7 metades → 27 (13 cheios e meio).
    const l = coracoesDaVida(1000, 3000);
    expect(conta(l, 'cheio')).toBe(13);
    expect(l[13]).toBe('metade');
    expect(conta(l, 'vazio')).toBe(TOTAL - 14);
  });

  it('qualquer vida acima de zero mostra pelo menos meio coração', () => {
    expect(coracoesDaVida(1, 100_000)[0]).toBe('metade');
  });

  it('a cura a caminho pinta os vazios logo depois da vida', () => {
    const l = coracoesDaVida(1500, 3000, 600);
    expect(conta(l, 'cheio')).toBe(20);
    expect(conta(l, 'cura') + conta(l, 'cura-metade')).toBe(8);
    expect(l[20]).toBe('cura');
  });

  it('a Absorção vira uma fileira dourada, no máximo uma', () => {
    expect(coracoesDeOuro(0, 3000)).toEqual([]);
    expect(coracoesDeOuro(300, 3000)).toHaveLength(4);
    expect(coracoesDeOuro(999_999, 3000)).toHaveLength(POR_FILEIRA);
  });

  it('duas fileiras de 20, e a dourada empurra as da vida para baixo', () => {
    expect(posicaoDoCoracao(0, false)).toEqual({ x: 0, y: 0 });
    expect(posicaoDoCoracao(20, false)).toEqual({ x: 0, y: 10 });
    expect(posicaoDoCoracao(20, true)).toEqual({ x: 0, y: 20 });
    expect(tamanhoDosCoracoes(false)).toEqual({ largura: 161, altura: 19 });
    expect(tamanhoDosCoracoes(true).altura).toBe(29);
  });

  it('com muita gente a vida passa de dezenas de milhares: o texto leva o ponto do milhar', () => {
    expect(milhar(40700)).toBe('40.700');
    expect(milhar(700)).toBe('700');
    // Cada coração continua sendo 1/40 da vida, por maior que ela seja.
    expect(conta(coracoesDaVida(20350, 40700), 'cheio')).toBe(20);
  });

  it('a Regeneração corre um coração por vez; sem ela, nenhum', () => {
    expect(pulinhoDaRegeneracao(0, false)).toBe(-1);
    const vistos = new Set(Array.from({ length: 200 }, (_, i) => pulinhoDaRegeneracao(i / 60, true)));
    expect(vistos.size).toBeGreaterThan(30);
  });
});

describe('a chefona em computador fraco', () => {
  afterEach(() => { feiticosLeves(false); document.body.innerHTML = ''; vi.useRealTimers(); });

  it('o vigia só acusa quando a média da janela passa do limite', () => {
    const leve = criarVigiaDeQuadros();
    const quadros = Math.ceil((JANELA_S * 1000) / 16);
    expect(Array.from({ length: quadros }, () => leve(16)).some(Boolean)).toBe(false);
    const pesado = criarVigiaDeQuadros();
    const lentos = Math.ceil((JANELA_S * 1000) / (QUADRO_PESADO_MS + 20));
    expect(Array.from({ length: lentos }, () => pesado(QUADRO_PESADO_MS + 20)).some(Boolean)).toBe(true);
  });

  it('leve, a Visão Noturna vira um véu de cor: o filtro da página fica intacto', () => {
    document.body.innerHTML = '<div id="tela"><span data-alvo-feitico="aba">Acordos</span></div>';
    const raiz = document.getElementById('tela')!;
    feiticosLeves(true);
    for (const v of ['temas', 'negativo', 'ofuscante']) {
      const l = lancar('visao', alvosPorAtributo(() => raiz, () => raiz), Math.random, 1, v);
      expect(raiz.style.filter).toBe('');
      const veu = document.querySelector<HTMLElement>(`.${CLASSE_VEU}`)!;
      expect(veu.style.background).toContain('rgba');
      l.desfazer();
      expect(document.querySelector(`.${CLASSE_VEU}`)).toBeNull();
    }
    feiticosLeves(false);
    const n = lancar('visao', alvosPorAtributo(() => raiz, () => raiz), Math.random, 1, 'negativo');
    expect(raiz.style.filter).toBe(FILTRO_NEGATIVO);
    n.desfazer();
    expect(VEU_LEVE.negativo).toMatch(/^rgba/);
  });

  it('leve, o Encantamento não distorce a página (sem o filtro SVG)', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="tela"><span data-alvo-feitico="aba">Acordos</span></div>';
    const raiz = document.getElementById('tela')!;
    feiticosLeves(true);
    const l = lancar('encantamento', alvosPorAtributo(() => raiz, () => raiz));
    expect(document.getElementById('bx-distorcao')).toBeNull();
    expect(raiz.style.filter).toBe('');
    l.desfazer();
  });
});

describe('a placa de conquista épica', () => {
  it('cresce com o texto mais comprido, e a estrela da raridade tem desenho próprio', () => {
    const t = tamanhoDaPlaca(CONQUISTA);
    expect(t.altura).toBe(62);
    expect(t.largura).toBeGreaterThanOrEqual(200);
    expect(tamanhoDaPlaca({ ...CONQUISTA, descricao: 'x'.repeat(80) }).largura).toBeGreaterThan(t.largura);
    expect(glifoMC('★')).not.toEqual(glifoMC('?'));
  });
});
