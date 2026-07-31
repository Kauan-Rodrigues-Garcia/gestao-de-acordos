/**
 * layout.test.ts — o editor de posição.
 *
 * O que se perde se isto quebrar: o líder monta o card de um jeito e ele
 * aparece de outro na tela dos outros — ou com o GIF cortado pela metade,
 * porque foi arrastado para fora.
 */
import { describe, it, expect } from 'vitest';
import {
  posicaoDe, limitarNoCard, posicaoArrastada, definirPosicao, escalarElemento,
  ehLayoutPadrao, layoutDoJson, layoutParaJson, LAYOUT_PADRAO, ELEMENTOS,
  MARGEM_PCT, ESCALA_MIN, ESCALA_MAX,
  type LayoutComemoracao,
} from './layout';

const CARD = { largura: 640, altura: 360 };

describe('posicaoDe', () => {
  it('sem layout salvo, usa o de fábrica', () => {
    expect(posicaoDe({}, 'titulo')).toEqual(LAYOUT_PADRAO.titulo);
  });

  it('layout nulo não estoura', () => {
    expect(posicaoDe(null, 'midia')).toEqual(LAYOUT_PADRAO.midia);
  });

  it('usa a posição salva quando existe', () => {
    const l: LayoutComemoracao = { titulo: { x: 20, y: 30, escala: 1.2 } };
    expect(posicaoDe(l, 'titulo')).toEqual({ x: 20, y: 30, escala: 1.2 });
  });
});

describe('limitarNoCard', () => {
  it('prende dentro da margem', () => {
    // Sem isso o líder arrasta o GIF pela metade para fora e ele sai cortado.
    expect(limitarNoCard({ x: -50, y: 200, escala: 1 }))
      .toEqual({ x: MARGEM_PCT, y: 100 - MARGEM_PCT, escala: 1 });
  });

  it('prende a escala', () => {
    expect(limitarNoCard({ x: 50, y: 50, escala: 9 }).escala).toBe(ESCALA_MAX);
    expect(limitarNoCard({ x: 50, y: 50, escala: 0 }).escala).toBe(ESCALA_MIN);
  });

  it('NaN vira o mínimo em vez de contaminar o card', () => {
    expect(limitarNoCard({ x: NaN, y: NaN, escala: NaN }))
      .toEqual({ x: MARGEM_PCT, y: MARGEM_PCT, escala: ESCALA_MIN });
  });

  it('valor bom passa intacto', () => {
    expect(limitarNoCard({ x: 50, y: 40, escala: 1 })).toEqual({ x: 50, y: 40, escala: 1 });
  });
});

describe('posicaoArrastada', () => {
  const origem = { x: 50, y: 50, escala: 1 };

  it('converte pixels em porcentagem do card', () => {
    // 64 px num card de 640 = 10%.
    expect(posicaoArrastada(origem, { dx: 64, dy: 36 }, CARD))
      .toEqual({ x: 60, y: 60, escala: 1 });
  });

  it('arrastar para a esquerda diminui o x', () => {
    expect(posicaoArrastada(origem, { dx: -64, dy: 0 }, CARD).x).toBe(40);
  });

  it('não deixa sair do card', () => {
    expect(posicaoArrastada(origem, { dx: -9999, dy: -9999 }, CARD))
      .toEqual({ x: MARGEM_PCT, y: MARGEM_PCT, escala: 1 });
  });

  it('O BUG: encostar na margem não trava o arrasto', () => {
    // A versão antiga somava o incremento à posição JÁ PRESA pelo limite, então
    // o elemento parava de andar assim que raspava na borda, mesmo com o mouse
    // continuando. Aqui a conta parte sempre da origem do arrasto.
    const naMargem = posicaoArrastada(origem, { dx: -9999, dy: 0 }, CARD);
    expect(naMargem.x).toBe(MARGEM_PCT);
    // Mouse volta para a direita: o elemento acompanha na hora.
    expect(posicaoArrastada(origem, { dx: 64, dy: 0 }, CARD).x).toBe(60);
  });

  it('deslocamento zero devolve a origem', () => {
    expect(posicaoArrastada(origem, { dx: 0, dy: 0 }, CARD)).toEqual(origem);
  });

  it('card de tamanho zero não vira Infinity', () => {
    // Acontece no primeiro frame, antes de o card ser medido.
    expect(posicaoArrastada(origem, { dx: 10, dy: 10 }, { largura: 0, altura: 0 }))
      .toEqual(origem);
  });

  it('preserva a escala', () => {
    expect(posicaoArrastada({ ...origem, escala: 1.5 }, { dx: 32, dy: 0 }, CARD).escala).toBe(1.5);
  });
});

describe('definirPosicao', () => {
  it('grava o elemento e prende no card', () => {
    const r = definirPosicao({}, 'titulo', { x: 999, y: 20, escala: 1 });
    expect(r.titulo).toEqual({ x: 100 - MARGEM_PCT, y: 20, escala: 1 });
  });

  it('mexe só no elemento indicado', () => {
    const antes: LayoutComemoracao = { midia: { x: 10, y: 10, escala: 1 } };
    const r = definirPosicao(antes, 'titulo', { x: 30, y: 30, escala: 1 });
    expect(r.midia).toEqual({ x: 10, y: 10, escala: 1 });
  });
});

describe('ordem de fábrica', () => {
  it('empilha GIF, título, pessoas e mensagem, de cima para baixo', () => {
    const { midia, titulo, pessoas, mensagem } = LAYOUT_PADRAO;
    expect(midia.y).toBeLessThan(titulo.y);
    expect(titulo.y).toBeLessThan(pessoas.y);
    expect(pessoas.y).toBeLessThan(mensagem.y);
  });

  it('tudo centralizado na horizontal', () => {
    for (const { id } of ELEMENTOS) {
      expect(LAYOUT_PADRAO[id].x).toBe(50);
    }
  });

  it('nada nasce fora do card', () => {
    for (const { id } of ELEMENTOS) {
      expect(LAYOUT_PADRAO[id]).toEqual(limitarNoCard(LAYOUT_PADRAO[id]));
    }
  });
});

describe('escalarElemento', () => {
  it('troca a escala e mantém a posição', () => {
    const r = escalarElemento({ titulo: { x: 30, y: 40, escala: 1 } }, 'titulo', 1.4);
    expect(r.titulo).toEqual({ x: 30, y: 40, escala: 1.4 });
  });

  it('respeita o teto', () => {
    expect(escalarElemento({}, 'titulo', 99).titulo!.escala).toBe(ESCALA_MAX);
  });
});

describe('ehLayoutPadrao', () => {
  it('vazio é padrão', () => {
    expect(ehLayoutPadrao({})).toBe(true);
    expect(ehLayoutPadrao(null)).toBe(true);
  });

  it('igual ao de fábrica é padrão, mesmo escrito por extenso', () => {
    expect(ehLayoutPadrao({ ...LAYOUT_PADRAO })).toBe(true);
  });

  it('qualquer elemento fora do lugar já não é padrão', () => {
    expect(ehLayoutPadrao({ titulo: { x: 10, y: 10, escala: 1 } })).toBe(false);
  });
});

describe('layoutDoJson', () => {
  it('lê o que o banco devolve', () => {
    const r = layoutDoJson({ titulo: { x: 20, y: 30, escala: 1.1 } });
    expect(r.titulo).toEqual({ x: 20, y: 30, escala: 1.1 });
  });

  it('ignora elemento desconhecido de uma versão futura', () => {
    const r = layoutDoJson({ titulo: { x: 20, y: 30 }, rodape: { x: 1, y: 1 } });
    expect(Object.keys(r)).toEqual(['titulo']);
  });

  it('sem escala assume 1', () => {
    expect(layoutDoJson({ titulo: { x: 20, y: 30 } }).titulo!.escala).toBe(1);
  });

  it('coordenada não numérica é descartada', () => {
    expect(layoutDoJson({ titulo: { x: 'meio', y: 30 } })).toEqual({});
  });

  it('valor fora da faixa é preso ao limite, não descartado', () => {
    expect(layoutDoJson({ titulo: { x: 999, y: -999, escala: 1 } }).titulo)
      .toEqual({ x: 100 - MARGEM_PCT, y: MARGEM_PCT, escala: 1 });
  });

  it('lixo devolve vazio em vez de quebrar a tela', () => {
    for (const entrada of [null, undefined, 'texto', 42, []]) {
      expect(layoutDoJson(entrada)).toEqual({});
    }
  });
});

describe('layoutParaJson', () => {
  it('vira objeto simples, pronto para a coluna JSONB', () => {
    const r = layoutParaJson({ titulo: { x: 20, y: 30, escala: 1.1 } });
    expect(r).toEqual({ titulo: { x: 20, y: 30, escala: 1.1 } });
  });

  it('ida e volta preserva o layout', () => {
    const original: LayoutComemoracao = {
      titulo: { x: 20, y: 30, escala: 1.1 },
      midia:  { x: 60, y: 20, escala: 0.8 },
    };
    expect(layoutDoJson(layoutParaJson(original))).toEqual(original);
  });

  it('vazio continua vazio', () => {
    expect(layoutParaJson({})).toEqual({});
  });
});
