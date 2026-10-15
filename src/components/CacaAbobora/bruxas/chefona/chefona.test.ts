/**
 * chefona.test.ts — a Bruxa do Pântano (a bruxa do Minecraft), sem navegador.
 *
 * O que se protege: o modelo monta inteiro, com as peças certas para o tiro;
 * as manobras deixam ela intocável e dentro da tela; e toda poção volta a
 * página EXATAMENTE como estava — nenhum texto do React é reescrito.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NUMERO_DA_PARTE, alvoDaParte, parteNoPonto } from '../arte';
import {
  ALTURA_MC, CORES_MC, DROPS, LARGURA_MC, PIXEL_MC, QUADROS_MC, TEXELS_ALTURA, TEXELS_LARGURA,
  cabecaMC, comContorno, estagioDoDano, montarBruxaMC, montarTexels, rachar, rachaduras,
} from './arte';
import { estagioDeQuebra } from './caldeirao';
import { ENCANTO, letrasComRuna, paraGalatico } from './galatico';
import {
  ATRIBUTO_TEXTO, FEITICOS, FILTROS_VISAO, FILTRO_LENTIDAO, LISTA_FEITICOS, PASSO_VISAO_MS, alvosPorAtributo, disponivel,
  duracaoDoFeitico, forcaDoFeitico, lancar, negativar, nivelDaPocao, nomeEstranho, quantosAlvos, sortearSumico,
} from './feiticos';
import {
  MANOBRAS, avancarCorpo, criarCorpo, escolherManobra, iniciarManobra, invulneravel, type Zona,
} from './movimento';

/** Sorteio repetível (mulberry32), como em `../bruxas.test.ts`. */
function semente(n: number): () => number {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('o modelo da bruxa do Minecraft', () => {
  it('todo quadro monta com chapéu, cabeça, manto, ombros e pés', () => {
    for (let q = 0; q < QUADROS_MC.length; q++) {
      const presentes = new Set(montarTexels(q).partes);
      for (const p of ['chapeu', 'cabeca', 'tronco', 'bracoFrente', 'pernaFrente'] as const) {
        expect(presentes.has(NUMERO_DA_PARTE[p]), `q${q} ${p}`).toBe(true);
      }
    }
  });

  it('como na referência: pedra verde no chapéu, olhos roxos, monocelha, nariz laranja, faixa verde, pés cinza e contorno', () => {
    const cores = new Set(montarTexels(0).cores);
    for (const c of [CORES_MC.pedra, CORES_MC.olhoRoxo, CORES_MC.monocelha, CORES_MC.nariz, CORES_MC.faixa, CORES_MC.peLuz, CORES_MC.contorno]) {
      expect(cores.has(c), c).toBe(true);
    }
  });

  it('o nariz mexe sozinho: os quadros de flutuar não são todos iguais', () => {
    const narizes = [0, 1].map(q => montarTexels(q).cores.findIndex(c => c === CORES_MC.nariz));
    expect(new Set(narizes).size).toBe(2);
  });

  it('cada texel vira PIXEL_MC × PIXEL_MC pixels, e o tiro acha a peça', () => {
    const img = montarBruxaMC(0);
    expect(img.largura).toBe(TEXELS_LARGURA * PIXEL_MC);
    expect(img.altura).toBe(TEXELS_ALTURA * PIXEL_MC);
    expect([LARGURA_MC, ALTURA_MC]).toEqual([img.largura, img.altura]);
    const no = (x: number, y: number) => parteNoPonto(img, x * PIXEL_MC, y * PIXEL_MC);
    // O rosto é cabeça (o crítico); a pedra é chapéu; o ombro, o manto e o pé.
    expect(alvoDaParte('cabeca')).toBe('cabeca');
    expect(no(8, 18)).toBe(NUMERO_DA_PARTE.cabeca);
    expect(no(10, 7)).toBe(NUMERO_DA_PARTE.chapeu);
    expect(no(3, 25)).toBe(NUMERO_DA_PARTE.bracoFrente);
    expect(no(7, 35)).toBe(NUMERO_DA_PARTE.tronco);
    expect(no(7, 43)).toBe(NUMERO_DA_PARTE.pernaFrente);
    // Fora dela, nada.
    expect(parteNoPonto(img, 0, 0)).toBe(0);
  });

  it('o retrato da contagem e da conquista é a cabeça com o chapéu', () => {
    const c = cabecaMC();
    expect(c.altura).toBe(24);
    expect(c.cores).toContain(CORES_MC.pedra);
    expect(c.cores).not.toContain(CORES_MC.ombroFundo);
  });

  it('os drops da referência: 16 × 16, toda letra na paleta, e o contorno em volta', () => {
    expect(DROPS.map(d => d.nome)).toEqual([
      'Poção de Cura', 'Poção de Veneno', 'Poção de Fraqueza', 'Garrafa de Vidro',
      'Bastão de Bruxa', 'Pó de Redstone', 'Pó de Glowstone', 'Olho de Aranha',
    ]);
    for (const d of DROPS) {
      const c = comContorno(d);
      expect(c.linhas).toHaveLength(16);
      for (const l of c.linhas) {
        expect(l).toHaveLength(16);
        // A garrafa vazia não tem líquido: o L e o l ficam transparentes nela.
        for (const ch of l) if (ch !== '.' && !(d.nome === 'Garrafa de Vidro' && 'Ll'.includes(ch))) expect(c.cores[ch], `${d.nome} «${ch}»`).toBeTruthy();
      }
    }
  });
});

describe('o dano: ela racha como bloco', () => {
  it('estágios pela vida: inteira, 1, 2 e 3', () => {
    expect([1, 0.8, 0.7, 0.5, 0.3, 0.2, 0].map(estagioDoDano)).toEqual([0, 0, 1, 2, 2, 3, 3]);
  });

  it('cada estágio racha mais, só as cores mudam (o tiro por peça continua igual)', () => {
    const t = montarTexels(0);
    const sujos = [0, 1, 2, 3].map(e => {
      const r = rachar(t, e);
      expect(r.partes).toBe(t.partes);
      return r.cores.filter((c, i) => c !== t.cores[i]).length;
    });
    expect(sujos[0]).toBe(0);
    expect(sujos[1]).toBeGreaterThan(0);
    expect(sujos[2]).toBeGreaterThan(sujos[1]);
    expect(sujos[3]).toBeGreaterThan(sujos[2]);
  });

  it('a rachadura só cresce e fica no mesmo lugar (não pisca)', () => {
    expect([...rachaduras(3)]).toEqual([...rachaduras(3)]);
    for (const i of rachaduras(1)) expect(rachaduras(3).has(i)).toBe(true);
  });

  it('o caldeirão racha em dez estágios até quebrar', () => {
    expect(estagioDeQuebra(1)).toBe(0);
    expect(estagioDeQuebra(0.55)).toBe(4);
    expect(estagioDeQuebra(0)).toBe(9);
  });
});

describe('movimento da Bruxa do Pântano', () => {
  const Z: Zona = { x0: 30, x1: 600, y0: 60, y1: 200, chao: 330 };

  it('flutua dois minutos dentro da zona depois de entrar, sempre de pé', () => {
    const r = semente(7);
    const c = criarCorpo(Z, r);
    let entrou = false;
    for (let i = 0; i < 120 * 60; i++) {
      avancarCorpo(c, Z, 1 / 60, 70, r);
      expect(c.giro).toBe(0);
      if (c.x >= Z.x0 && c.x <= Z.x1) entrou = true;
      if (entrou) {
        expect(c.x).toBeGreaterThan(Z.x0 - 10);
        expect(c.x).toBeLessThan(Z.x1 + 10);
        expect(c.y).toBeGreaterThanOrEqual(Z.y0 - 0.001);
        expect(c.y).toBeLessThanOrEqual(Z.y1 + 0.001);
      }
    }
    expect(entrou).toBe(true);
  });

  for (const m of MANOBRAS) {
    it(`${m}: intocável do começo ao fim, e volta ao voo de pé`, () => {
      const r = semente(3);
      const c = criarCorpo(Z, r);
      c.x = 300; c.y = 120;
      iniciarManobra(c, m, Z, r);
      let passos = 0;
      while (c.manobra && passos < 600) {
        expect(invulneravel(c)).toBe(true);
        avancarCorpo(c, Z, 1 / 60, 70, r);
        // Nunca abaixo do chão nem fora da tela pelos lados.
        expect(c.y).toBeLessThan(Z.chao - 30);
        expect(c.x).toBeGreaterThanOrEqual(Z.x0 - 1);
        expect(c.x).toBeLessThanOrEqual(Z.x1 + 1);
        passos++;
      }
      expect(c.manobra).toBeNull();
      expect(invulneravel(c)).toBe(false);
      expect(c.giro).toBe(0);
      expect(c.visivel).toBe(true);
    });
  }

  it('não repete a manobra anterior, e sem céu não levita', () => {
    const r = semente(11);
    const c = criarCorpo(Z, r);
    c.x = 300; c.y = Z.y0 + 5;
    for (let i = 0; i < 50; i++) {
      const m = escolherManobra(c, Z, r, 'velocidade');
      expect(m).not.toBe('velocidade');
      expect(m).not.toBe('levitacao');
    }
  });
});

describe('as poções', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

  function tela(): HTMLElement {
    document.body.innerHTML = `
      <div id="tela">
        <a><span data-alvo-feitico="aba">Acordos</span></a>
        <a><span data-alvo-feitico="aba">Analítico</span></a>
        <b><span data-alvo-feitico="valor">R$ 48.312,90</span></b>
        <table><tbody>${[1, 2, 3, 4, 5, 6].map(i => `<tr data-alvo-feitico="linha"><td>${i}</td></tr>`).join('')}</tbody></table>
      </div>`;
    return document.getElementById('tela')!;
  }

  it('toda poção tem a cor do jogo e nome de poção', () => {
    for (const f of LISTA_FEITICOS) {
      expect(FEITICOS[f].cor).toMatch(/^#[0-9a-f]{6}$/);
      expect(FEITICOS[f].corClara).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(FEITICOS.invisibilidade.titulo).toBe('Poção de Invisibilidade');
  });

  it('as contas: negativo, nome do Minecraft e quantas linhas somem', () => {
    expect(negativar(' R$ 48.312,90 ')).toBe('-R$ 48.312,90');
    expect(negativar('-R$ 10,00')).toBe('-R$ 10,00');
    expect(nomeEstranho('Acordos')).toBe('Trocas com Aldeões');
    expect(nomeEstranho('Pix Automático')).toBe('Circuito de Redstone');
    expect(nomeEstranho('Metas')).toBe('Conquistas');
    expect(nomeEstranho('Zebra')).toBe('Arbez');
    expect(sortearSumico(0, semente(1))).toEqual([]);
    expect(sortearSumico(1, semente(1))).toEqual([0]);
    const s = sortearSumico(10, semente(1));
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s.length).toBeLessThan(10);
    expect(new Set(s).size).toBe(s.length);
  });

  for (const f of LISTA_FEITICOS) {
    it(`${f}: cai na tela e desfaz deixando o HTML igual ao de antes`, () => {
      vi.useFakeTimers();
      const raiz = tela();
      const antes = raiz.outerHTML;
      const textoAntes = raiz.textContent;
      const alvos = alvosPorAtributo(() => raiz, () => raiz);
      expect(disponivel(f, alvos)).toBe(true);
      const l = lancar(f, alvos, semente(5));
      expect(l.atingidos.length).toBeGreaterThan(0);
      // O texto do React nunca é reescrito: só atributo e classe por cima.
      expect(raiz.textContent).toBe(textoAntes);
      vi.advanceTimersByTime(PASSO_VISAO_MS * 3);
      l.desfazer();
      expect(raiz.outerHTML.replace(/ class=""/g, '').replace(/ style=""/g, '')).toBe(antes);
    });
  }

  it('a Poção de Dano e a Estranha desenham o texto novo pelo atributo', () => {
    const raiz = tela();
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    lancar('dano', alvos);
    lancar('estranha', alvos);
    expect(raiz.querySelector('[data-alvo-feitico="valor"]')!.getAttribute(ATRIBUTO_TEXTO)).toBe('-R$ 48.312,90');
    const abas = [...raiz.querySelectorAll('[data-alvo-feitico="aba"]')].map(a => a.getAttribute(ATRIBUTO_TEXTO));
    expect(abas).toEqual(['Trocas com Aldeões', 'Mapa']);
  });

  it('a Visão Noturna pisca de tema em tema na raiz', () => {
    vi.useFakeTimers();
    const raiz = tela();
    const l = lancar('visao', alvosPorAtributo(() => raiz, () => raiz));
    expect(raiz.style.filter).toBe(FILTROS_VISAO[0]);
    vi.advanceTimersByTime(PASSO_VISAO_MS);
    expect(raiz.style.filter).toBe(FILTROS_VISAO[1]);
    l.desfazer();
    expect(raiz.style.filter).toBe('');
  });

  it('a Lentidão apaga a tela e escolhe onde cair as teias', () => {
    const raiz = tela();
    const l = lancar('lentidao', alvosPorAtributo(() => raiz, () => raiz), semente(2));
    expect(raiz.style.filter).toBe(FILTRO_LENTIDAO);
    expect(l.atingidos[0]).toBe(raiz);
    expect(l.atingidos.length).toBeGreaterThan(1);
    l.desfazer();
    expect(raiz.style.filter).toBe('');
  });

  it('tela sem alvo: só as poções que pegam a tela toda', () => {
    document.body.innerHTML = '<div id="vazia"></div>';
    const raiz = document.getElementById('vazia')!;
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    expect(disponivel('dano', alvos)).toBe(false);
    expect(disponivel('estranha', alvos)).toBe(false);
    expect(disponivel('invisibilidade', alvos)).toBe(false);
    expect(disponivel('visao', alvos)).toBe(true);
    expect(disponivel('lentidao', alvos)).toBe(true);
    expect(disponivel('encantamento', alvos)).toBe(true);
  });
});

describe('a força e o Encantamento', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

  it('quanto mais rachada, mais fraca e mais curta (nível II → I)', () => {
    expect(forcaDoFeitico(1)).toBe(1);
    expect(forcaDoFeitico(0)).toBeCloseTo(0.35);
    expect(nivelDaPocao(1)).toBe('II');
    expect(nivelDaPocao(0.4)).toBe('I');
    expect(duracaoDoFeitico('dano', 1)).toBe(12_000);
    expect(duracaoDoFeitico('dano', 0.35)).toBeLessThan(12_000 * 0.65);
    expect(duracaoDoFeitico('visao', 0.35)).toBeGreaterThanOrEqual(3_000);
    expect(quantosAlvos(10, 1)).toBe(10);
    expect(quantosAlvos(10, 0.35)).toBe(4);
    expect(quantosAlvos(1, 0.35)).toBe(1);
    expect(sortearSumico(20, semente(2), 0.35).length).toBeLessThan(sortearSumico(20, semente(2), 1).length);
  });

  it('o Alfabeto Galáctico da mesa de encantamento: letra vira runa, acento cai, o resto fica', () => {
    expect(paraGalatico('Acordos')).toBe('ᔑᓵ𝙹∷↸𝙹ᓭ');
    expect(paraGalatico('Analítico 2')).toBe('ᔑリᔑꖎ╎ℸ̣╎ᓵ𝙹 2');
    expect(letrasComRuna(ENCANTO)).toHaveLength(11);
  });

  it('com força baixa a Poção de Dano pega menos valores', () => {
    document.body.innerHTML = `<div id="t">${[1, 2, 3, 4, 5, 6].map(i => `<b data-alvo-feitico="valor">R$ ${i},00</b>`).join('')}</div>`;
    const raiz = document.getElementById('t')!;
    const l = lancar('dano', alvosPorAtributo(() => raiz, () => raiz), semente(4), 0.35);
    expect(l.atingidos.length).toBe(3);
    l.desfazer();
  });

  it('Visão Noturna, Lentidão e Encantamento juntos: um acabar não apaga o outro', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="t" style="filter: blur(0px)"><span data-alvo-feitico="aba">Metas</span></div>';
    const raiz = document.getElementById('t')!;
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    const visao = lancar('visao', alvos);
    const lenta = lancar('lentidao', alvos);
    const enc = lancar('encantamento', alvos);
    expect(raiz.style.filter).toContain('url(#bx-distorcao)');
    visao.desfazer();
    expect(raiz.style.filter).toContain('url(#bx-distorcao)');
    expect(raiz.style.filter).toContain('saturate(0.45)');
    lenta.desfazer();
    enc.desfazer();
    expect(raiz.style.filter).toBe('blur(0px)');
    expect(document.getElementById('bx-distorcao')).toBeNull();
  });
});
