/**
 * A regra das janelas, testada sem tela.
 * ─────────────────────────────────────────────────────────────────────────────
 * O que estes testes trancam é o que não dá para conferir olhando: a janela
 * que não se perde fora da tela, o foco que nunca fica numa janela minimizada
 * e a ordem de empilhamento que nunca dessincroniza.
 */
import { describe, it, expect } from 'vitest';
import {
  ALTURA_TITULO, FAIXA_VISIVEL, MARGEM_INICIAL, PASSO_CASCATA, VOLTAS_CASCATA,
  areaUtil, ehCelular, encaixar, estadoInicial, reduzir, retanguloNaTela,
  type AcaoJanelas, type EstadoJanelas, type Retangulo,
} from '../janelas';

const AREA: Retangulo = { x: 0, y: 0, l: 1280, a: 680 };

/** Aplica várias ações em sequência. */
function rodar(acoes: AcaoJanelas[], inicio = estadoInicial(AREA)): EstadoJanelas {
  return acoes.reduce(reduzir, inicio);
}

const abrir = (id: string, l = 480, a = 360): AcaoJanelas => ({ tipo: 'abrir', id, l, a });
const ids = (e: EstadoJanelas) => e.janelas.map(j => j.id);
const janela = (e: EstadoJanelas, id: string) => e.janelas.find(j => j.id === id)!;

/** O que TODO estado precisa obedecer, não importa como se chegou nele. */
function conferirInvariantes(e: EstadoJanelas) {
  // Um programa, uma janela.
  expect(new Set(ids(e)).size).toBe(e.janelas.length);

  // O foco é a janela visível mais alta, ou nenhuma.
  const visiveis = e.janelas.filter(j => !j.minimizada);
  expect(e.foco).toBe(visiveis.length ? visiveis[visiveis.length - 1].id : null);

  for (const j of e.janelas) {
    for (const v of [j.x, j.y, j.l, j.a]) expect(Number.isFinite(v)).toBe(true);

    // Cabe na área.
    expect(j.l).toBeLessThanOrEqual(e.area.l);
    expect(j.a).toBeLessThanOrEqual(e.area.a);

    // A barra de título inteira está dentro, na vertical.
    expect(j.y).toBeGreaterThanOrEqual(e.area.y);
    expect(j.y + Math.min(ALTURA_TITULO, j.a)).toBeLessThanOrEqual(e.area.y + e.area.a);

    // E uma faixa dela está dentro, na horizontal.
    const faixa = Math.min(FAIXA_VISIVEL, j.l);
    const visivel =
      Math.min(j.x + j.l, e.area.x + e.area.l) - Math.max(j.x, e.area.x);
    expect(visivel).toBeGreaterThanOrEqual(faixa);
  }
}

describe('abrir e fechar', () => {
  it('começa sem janela e sem foco', () => {
    const e = estadoInicial(AREA);
    expect(e.janelas).toEqual([]);
    expect(e.foco).toBeNull();
  });

  it('abrir cria a janela, no topo e com o foco', () => {
    const e = rodar([abrir('terminal'), abrir('museu')]);
    expect(ids(e)).toEqual(['terminal', 'museu']);
    expect(e.foco).toBe('museu');
    conferirInvariantes(e);
  });

  it('abrir o que já está aberto traz para a frente, sem duplicar', () => {
    const e = rodar([abrir('terminal'), abrir('museu'), abrir('terminal')]);
    expect(ids(e)).toEqual(['museu', 'terminal']);
    expect(e.foco).toBe('terminal');
  });

  it('reabrir não mexe na posição nem no tamanho que a janela já tinha', () => {
    const antes = rodar([abrir('terminal'), { tipo: 'mover', id: 'terminal', x: 300, y: 200 }]);
    const depois = reduzir(antes, abrir('terminal', 999, 999));
    expect(janela(depois, 'terminal')).toEqual(janela(antes, 'terminal'));
  });

  it('fechar passa o foco para a janela de baixo', () => {
    const e = rodar([abrir('a'), abrir('b'), abrir('c'), { tipo: 'fechar', id: 'c' }]);
    expect(ids(e)).toEqual(['a', 'b']);
    expect(e.foco).toBe('b');
  });

  it('fechar a última deixa o foco vazio', () => {
    const e = rodar([abrir('a'), { tipo: 'fechar', id: 'a' }]);
    expect(e.janelas).toEqual([]);
    expect(e.foco).toBeNull();
  });

  it('fechar uma janela de baixo não rouba o foco de quem está em cima', () => {
    const e = rodar([abrir('a'), abrir('b'), { tipo: 'fechar', id: 'a' }]);
    expect(e.foco).toBe('b');
  });

  it('fecharTudo limpa a mesa', () => {
    const e = rodar([abrir('a'), abrir('b'), { tipo: 'fecharTudo' }]);
    expect(e.janelas).toEqual([]);
    expect(e.foco).toBeNull();
  });

  it('ação sobre janela que não existe devolve o MESMO estado', () => {
    const e = rodar([abrir('a')]);
    for (const acao of [
      { tipo: 'fechar', id: 'x' },
      { tipo: 'minimizar', id: 'x' },
      { tipo: 'focar', id: 'x' },
      { tipo: 'mover', id: 'x', x: 1, y: 1 },
      { tipo: 'alternarMaximizada', id: 'x' },
    ] as AcaoJanelas[]) {
      expect(reduzir(e, acao)).toBe(e);
    }
  });
});

describe('foco e empilhamento', () => {
  it('focar leva a janela para o topo e mantém a ordem das outras', () => {
    const e = rodar([abrir('a'), abrir('b'), abrir('c'), { tipo: 'focar', id: 'a' }]);
    expect(ids(e)).toEqual(['b', 'c', 'a']);
    expect(e.foco).toBe('a');
  });

  it('minimizar tira o foco e entrega para a visível mais alta', () => {
    const e = rodar([abrir('a'), abrir('b'), abrir('c'), { tipo: 'minimizar', id: 'c' }]);
    expect(janela(e, 'c').minimizada).toBe(true);
    expect(e.foco).toBe('b');
    conferirInvariantes(e);
  });

  it('com tudo minimizado ninguém tem foco', () => {
    const e = rodar([
      abrir('a'), abrir('b'),
      { tipo: 'minimizar', id: 'a' }, { tipo: 'minimizar', id: 'b' },
    ]);
    expect(e.foco).toBeNull();
    expect(e.janelas).toHaveLength(2);
  });

  it('focar uma janela minimizada a restaura, no topo', () => {
    const e = rodar([
      abrir('a'), abrir('b'),
      { tipo: 'minimizar', id: 'a' }, { tipo: 'focar', id: 'a' },
    ]);
    expect(janela(e, 'a').minimizada).toBe(false);
    expect(ids(e)).toEqual(['b', 'a']);
    expect(e.foco).toBe('a');
  });

  it('abrir um programa minimizado também o restaura', () => {
    const e = rodar([abrir('a'), { tipo: 'minimizar', id: 'a' }, abrir('a')]);
    expect(janela(e, 'a').minimizada).toBe(false);
    expect(e.foco).toBe('a');
  });

  it('minimizar guarda a posição para a volta', () => {
    const e = rodar([
      abrir('a'), { tipo: 'mover', id: 'a', x: 400, y: 150 },
      { tipo: 'minimizar', id: 'a' }, { tipo: 'focar', id: 'a' },
    ]);
    expect(janela(e, 'a')).toMatchObject({ x: 400, y: 150 });
  });
});

describe('posição limitada à tela', () => {
  it('as janelas novas nascem em cascata', () => {
    const e = rodar([abrir('a'), abrir('b'), abrir('c')]);
    expect(janela(e, 'a')).toMatchObject({ x: MARGEM_INICIAL, y: MARGEM_INICIAL });
    expect(janela(e, 'b')).toMatchObject({
      x: MARGEM_INICIAL + PASSO_CASCATA, y: MARGEM_INICIAL + PASSO_CASCATA,
    });
    expect(janela(e, 'c').x).toBeGreaterThan(janela(e, 'b').x);
  });

  it('a cascata dá a volta em vez de descer para fora da tela', () => {
    const acoes = Array.from({ length: VOLTAS_CASCATA + 1 }, (_, i) => abrir(`p${i}`));
    const e = rodar(acoes);
    expect(janela(e, `p${VOLTAS_CASCATA}`)).toMatchObject({
      x: MARGEM_INICIAL, y: MARGEM_INICIAL,
    });
    conferirInvariantes(e);
  });

  it('a cascata respeita uma área que não começa em zero', () => {
    // Barra de tarefas em cima: a área útil começa abaixo dela.
    const e = rodar([abrir('a')], estadoInicial({ x: 0, y: 40, l: 1280, a: 640 }));
    expect(janela(e, 'a').y).toBe(40 + MARGEM_INICIAL);
  });

  it('não dá para arrastar a barra de título para cima da área', () => {
    const e = rodar([abrir('a'), { tipo: 'mover', id: 'a', x: 100, y: -500 }]);
    expect(janela(e, 'a').y).toBe(0);
  });

  it('nem para baixo: a barra de título continua alcançável', () => {
    const e = rodar([abrir('a'), { tipo: 'mover', id: 'a', x: 100, y: 99999 }]);
    expect(janela(e, 'a').y).toBe(AREA.a - ALTURA_TITULO);
  });

  it('para os lados sobra uma faixa da janela dentro da tela', () => {
    const esquerda = rodar([abrir('a'), { tipo: 'mover', id: 'a', x: -99999, y: 50 }]);
    expect(janela(esquerda, 'a').x).toBe(-(480 - FAIXA_VISIVEL));

    const direita = rodar([abrir('a'), { tipo: 'mover', id: 'a', x: 99999, y: 50 }]);
    expect(janela(direita, 'a').x).toBe(AREA.l - FAIXA_VISIVEL);

    conferirInvariantes(esquerda);
    conferirInvariantes(direita);
  });

  it('mover não muda a ordem de empilhamento nem o foco', () => {
    const e = rodar([abrir('a'), abrir('b'), { tipo: 'mover', id: 'a', x: 200, y: 200 }]);
    expect(ids(e)).toEqual(['a', 'b']);
    expect(e.foco).toBe('b');
  });

  it('posição sem número é recusada', () => {
    const e = rodar([abrir('a')]);
    expect(reduzir(e, { tipo: 'mover', id: 'a', x: NaN, y: 10 })).toBe(e);
    expect(reduzir(e, { tipo: 'mover', id: 'a', x: 10, y: Infinity })).toBe(e);
  });

  it('janela maior que a área encolhe para caber', () => {
    const e = rodar([abrir('a', 5000, 5000)]);
    expect(janela(e, 'a').l).toBe(AREA.l);
    expect(janela(e, 'a').a).toBe(AREA.a);
    conferirInvariantes(e);
  });

  it('a tela encolhendo traz de volta as janelas que ficariam de fora', () => {
    const e = rodar([
      abrir('a'), { tipo: 'mover', id: 'a', x: 1100, y: 600 },
      { tipo: 'redimensionarArea', area: { x: 0, y: 0, l: 375, a: 600 } },
    ]);
    conferirInvariantes(e);
    expect(janela(e, 'a').l).toBeLessThanOrEqual(375);
  });

  it('área com medida estragada vira área vazia, não NaN', () => {
    const e = rodar([
      abrir('a'),
      { tipo: 'redimensionarArea', area: { x: NaN, y: 0, l: -50, a: Infinity } },
    ]);
    expect(e.area).toEqual({ x: 0, y: 0, l: 0, a: 0 });
    for (const v of Object.values(janela(e, 'a'))) {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('encaixar não altera uma janela que já está no lugar', () => {
    const j = { id: 'a', x: 50, y: 60, l: 400, a: 300, minimizada: false, maximizada: false };
    expect(encaixar(j, AREA)).toEqual(j);
  });
});

describe('maximizar', () => {
  it('ocupa a área útil inteira e volta para onde estava', () => {
    const base = rodar([abrir('a'), { tipo: 'mover', id: 'a', x: 300, y: 120 }]);
    const cheia = reduzir(base, { tipo: 'alternarMaximizada', id: 'a' });

    expect(janela(cheia, 'a').maximizada).toBe(true);
    expect(retanguloNaTela(janela(cheia, 'a'), cheia.area)).toEqual(AREA);

    const volta = reduzir(cheia, { tipo: 'alternarMaximizada', id: 'a' });
    expect(janela(volta, 'a')).toEqual(janela(base, 'a'));
  });

  it('janela maximizada não se arrasta', () => {
    const e = rodar([abrir('a'), { tipo: 'alternarMaximizada', id: 'a' }]);
    expect(reduzir(e, { tipo: 'mover', id: 'a', x: 500, y: 500 })).toBe(e);
  });

  it('maximizar traz a janela para a frente', () => {
    const e = rodar([abrir('a'), abrir('b'), { tipo: 'alternarMaximizada', id: 'a' }]);
    expect(ids(e)).toEqual(['b', 'a']);
    expect(e.foco).toBe('a');
  });

  it('acompanha a área quando a tela muda de tamanho', () => {
    const nova: Retangulo = { x: 0, y: 40, l: 800, a: 500 };
    const e = rodar([
      abrir('a'), { tipo: 'alternarMaximizada', id: 'a' },
      { tipo: 'redimensionarArea', area: nova },
    ]);
    expect(retanguloNaTela(janela(e, 'a'), e.area)).toEqual(nova);
  });
});

describe('pureza', () => {
  it('não altera o estado recebido', () => {
    const e = rodar([abrir('a'), abrir('b')]);
    const copia = JSON.parse(JSON.stringify(e));
    reduzir(e, { tipo: 'mover', id: 'a', x: 500, y: 300 });
    reduzir(e, { tipo: 'focar', id: 'a' });
    reduzir(e, { tipo: 'minimizar', id: 'b' });
    reduzir(e, { tipo: 'fechar', id: 'a' });
    expect(e).toEqual(copia);
  });

  /**
   * Uma sessão inteira, com sorteio de semente fixa: abre, arrasta para longe,
   * minimiza, fecha, gira a tela. As invariantes valem em TODO passo.
   */
  it('uma sessão longa e bagunçada nunca quebra as invariantes', () => {
    let semente = 20261113;
    const sorteio = () => {
      semente = (semente * 1664525 + 1013904223) % 4294967296;
      return semente / 4294967296;
    };
    const programas = ['terminal', 'fliperama', 'criadores', 'projetos', 'math', 'museu', 'console'];
    const um = () => programas[Math.floor(sorteio() * programas.length)];

    let e = estadoInicial(AREA);
    for (let i = 0; i < 2000; i++) {
      const r = sorteio();
      const acao: AcaoJanelas =
        r < 0.25 ? abrir(um(), 200 + sorteio() * 1400, 150 + sorteio() * 900)
        : r < 0.50 ? { tipo: 'mover', id: um(), x: (sorteio() - 0.5) * 6000, y: (sorteio() - 0.5) * 6000 }
        : r < 0.62 ? { tipo: 'focar', id: um() }
        : r < 0.74 ? { tipo: 'minimizar', id: um() }
        : r < 0.84 ? { tipo: 'fechar', id: um() }
        : r < 0.92 ? { tipo: 'alternarMaximizada', id: um() }
        : { tipo: 'redimensionarArea', area: {
            x: 0, y: sorteio() < 0.5 ? 0 : 40,
            l: 320 + sorteio() * 1600, a: 300 + sorteio() * 900,
          } };

      e = reduzir(e, acao);
      conferirInvariantes(e);
    }
  });
});

describe('área útil', () => {
  it('barra embaixo: a área começa no topo e perde a altura da barra', () => {
    expect(areaUtil({ l: 1280, a: 720 }, { posicao: 'base', altura: 48 }))
      .toEqual({ x: 0, y: 0, l: 1280, a: 672 });
  });

  it('barra em cima: a área começa DEPOIS dela', () => {
    expect(areaUtil({ l: 1280, a: 720 }, { posicao: 'topo', altura: 36 }))
      .toEqual({ x: 0, y: 36, l: 1280, a: 684 });
  });

  /** O que isto garante na prática: nenhuma janela nasce embaixo da barra. */
  it('janela aberta e maximizada nunca invade a barra, em cima ou embaixo', () => {
    for (const posicao of ['topo', 'base'] as const) {
      const tela = { l: 1024, a: 700 };
      const area = areaUtil(tela, { posicao, altura: 40 });
      const e = rodar([abrir('a', 5000, 5000), { tipo: 'alternarMaximizada', id: 'a' }], estadoInicial(area));
      const r = retanguloNaTela(janela(e, 'a'), e.area);
      if (posicao === 'topo') expect(r.y).toBeGreaterThanOrEqual(40);
      else expect(r.y + r.a).toBeLessThanOrEqual(tela.a - 40);
    }
  });

  it('tela menor que a barra não gera altura negativa', () => {
    expect(areaUtil({ l: 300, a: 20 }, { posicao: 'base', altura: 48 }).a).toBe(0);
  });

  it('375 px é celular; 768 px já não é', () => {
    expect(ehCelular(375)).toBe(true);
    expect(ehCelular(767)).toBe(true);
    expect(ehCelular(768)).toBe(false);
    expect(ehCelular(1280)).toBe(false);
  });
});
