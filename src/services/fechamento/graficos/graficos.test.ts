/**
 * Os gráficos do relatório, um a um.
 *
 * São funções puras — entram números, sai SVG — e é por isso que dá para testar
 * cada uma sozinha em vez de procurar substring dentro de um documento de
 * 40 KB. Os casos aqui são os que quebram gráfico gerado à mão: fatia de volta
 * completa, escala que corta a linha de referência, série de um ponto só,
 * divisão por zero.
 */

import { describe, it, expect } from 'vitest';
import { svgBarrasDiarias, type DiaBarra } from './barrasDiarias';
import { svgDonut, resolverFatias } from './donut';
import { svgPizzaQuartis } from './pizzaQuartis';
import { htmlPodio, htmlRankingBarras, type ItemRanking } from './rankingBarras';
import { svgSparkline } from './sparkline';
import { barraProgressoMarcos } from './progressoMarcos';

const dias = (valores: number[]): DiaBarra[] =>
  valores.map((valor, i) => ({ dia: i + 1, valor, qtd: valor > 0 ? 1 : 0 }));

describe('svgBarrasDiarias', () => {
  it('desenha uma barra por dia com movimento e nenhuma nos zerados', () => {
    const svg = svgBarrasDiarias(dias([100, 0, 300]));
    expect((svg.match(/<rect/g) ?? []).length).toBe(2);
  });

  it('a escala acomoda a meta mesmo quando ela passa do melhor dia', () => {
    const svg = svgBarrasDiarias(dias([100, 200]), { metaDiaria: 10_000 });
    expect(svg).toContain('meta/dia útil');
    // A linha da meta precisa cair DENTRO da área do gráfico.
    const y = Number(/stroke-dasharray[^>]*\/>/.exec(svg) && /y1="([\d.]+)"[^>]*stroke-dasharray/.exec(svg)?.[1]);
    const yLinha = Number(/<line x1="46" y1="([\d.]+)"[^>]*stroke-dasharray/.exec(svg)?.[1] ?? NaN);
    expect(Number.isNaN(yLinha) ? y : yLinha).toBeGreaterThanOrEqual(0);
  });

  it('marca visualmente os dias não úteis', () => {
    const comFds: DiaBarra[] = [
      { dia: 1, valor: 100, qtd: 1 },
      { dia: 2, valor: 0, qtd: 0, naoUtil: true },
    ];
    expect(svgBarrasDiarias(comFds)).toContain('opacity="0.07"');
  });

  it('série vazia não gera gráfico', () => {
    expect(svgBarrasDiarias([])).toBe('');
  });

  it('sem meta não desenha a linha de referência', () => {
    expect(svgBarrasDiarias(dias([100]))).not.toContain('meta/dia útil');
  });
});

describe('svgDonut', () => {
  it('forma única vira círculo, não arco de volta completa', () => {
    const svg = svgDonut([{ rotulo: 'Pix', valor: 500, qtd: 5 }], 500);
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<path');
    expect(svg).toContain('100%');
  });

  it('duas formas viram dois arcos', () => {
    const svg = svgDonut([
      { rotulo: 'Pix', valor: 300, qtd: 3 },
      { rotulo: 'Boleto', valor: 200, qtd: 2 },
    ], 500);
    expect((svg.match(/<path/g) ?? []).length).toBe(2);
  });

  it('total zero não gera gráfico', () => {
    expect(svgDonut([{ rotulo: 'Pix', valor: 0, qtd: 0 }], 0)).toBe('');
  });
});

describe('resolverFatias', () => {
  it('ordena por valor e mantém todas quando cabem na paleta', () => {
    const r = resolverFatias([
      { rotulo: 'B', valor: 100, qtd: 1 },
      { rotulo: 'A', valor: 300, qtd: 3 },
    ], 400);
    expect(r.map(f => f.rotulo)).toEqual(['A', 'B']);
    expect(r[0].pctValor).toBe(75);
  });

  it('agrega em "outras" o que excede a paleta, sem perder valor', () => {
    const muitas = Array.from({ length: 12 }, (_, i) => ({
      rotulo: `F${i}`, valor: 100 - i, qtd: 1,
    }));
    const total = muitas.reduce((s, f) => s + f.valor, 0);
    const r = resolverFatias(muitas, total);

    expect(r.length).toBe(8);
    expect(r[r.length - 1].rotulo).toContain('Outras');
    expect(r.reduce((s, f) => s + f.valor, 0)).toBe(total);
  });

  it('descarta forma com valor zero', () => {
    const r = resolverFatias([
      { rotulo: 'Pix', valor: 100, qtd: 1 },
      { rotulo: 'Cartão', valor: 0, qtd: 0 },
    ], 100);
    expect(r.map(f => f.rotulo)).toEqual(['Pix']);
  });
});

describe('svgPizzaQuartis', () => {
  const faixas = [
    { quartil: 1, minPct: 100, quantidade: 0 },
    { quartil: 2, minPct: 80, quantidade: 3 },
    { quartil: 3, minPct: 50, quantidade: 5 },
    { quartil: 4, minPct: 0, quantidade: 2 },
  ];

  it('quartil vazio some da pizza mas fica na legenda com zero', () => {
    const svg = svgPizzaQuartis(faixas);
    expect((svg.match(/<path/g) ?? []).length).toBe(3);
    expect(svg).toContain('1º quartil');
    expect(svg).toContain('class="zerado"');
  });

  it('todos no mesmo quartil vira círculo completo', () => {
    const svg = svgPizzaQuartis([
      { quartil: 1, minPct: 100, quantidade: 0 },
      { quartil: 3, minPct: 50, quantidade: 7 },
    ]);
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<path');
  });

  it('sem ninguém não gera gráfico', () => {
    expect(svgPizzaQuartis([{ quartil: 1, minPct: 100, quantidade: 0 }])).toBe('');
  });
});

describe('ranking', () => {
  const itens = (n: number): ItemRanking[] =>
    Array.from({ length: n }, (_, i) => ({
      nome: `Op ${i + 1}`, valor: 1000 - i * 100, qtd: 10 - i,
    }));

  it('pódio só com três ou mais', () => {
    expect(htmlPodio(itens(2))).toBe('');
    expect(htmlPodio(itens(3))).toContain('1º lugar');
  });

  it('barra proporcional ao primeiro colocado', () => {
    const html = htmlRankingBarras(itens(2));
    expect(html).toContain('width:100.0%');
    expect(html).toContain('width:90.0%');
  });

  it('uma pessoa só não vira gráfico comparativo', () => {
    expect(htmlRankingBarras(itens(1))).toBe('');
  });

  it('marca a linha da própria pessoa quando pedido', () => {
    const html = htmlRankingBarras([
      { nome: 'A', valor: 10, qtd: 1 },
      { nome: 'Eu', valor: 5, qtd: 1, destacado: true },
    ]);
    expect(html).toContain('class="eu"');
  });
});

describe('svgSparkline', () => {
  it('gera a linha e marca o pico', () => {
    const svg = svgSparkline([0, 10, 3, 25, 1]);
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<circle');
  });

  it('menos de dois pontos não vira linha', () => {
    expect(svgSparkline([5])).toBe('');
    expect(svgSparkline([])).toBe('');
  });

  it('série toda zerada não estoura a divisão', () => {
    const svg = svgSparkline([0, 0, 0]);
    expect(svg).toContain('<polyline');
    expect(svg).not.toContain('NaN');
  });
});

describe('barraProgressoMarcos', () => {
  it('sem meta não desenha barra', () => {
    const r = barraProgressoMarcos({ realizado: 100, meta: 0 });
    expect(r.html).toBe('');
    expect(r.batidos).toBe(0);
  });

  it('barra simples quando não há metas extras', () => {
    const r = barraProgressoMarcos({ realizado: 50, meta: 100 });
    expect(r.html).toContain('>50%</span>');
    expect(r.html).not.toContain('com-marcos');
    expect(r.batidos).toBe(0);
  });

  it('conta os degraus batidos e aponta o próximo', () => {
    const r = barraProgressoMarcos({
      realizado: 150, meta: 100,
      opcoes: { marcos: [{ valor: 200, rotulo: '2ª meta' }, { valor: 300, rotulo: '3ª meta' }] },
    });
    expect(r.batidos).toBe(1);
    expect(r.proximo?.valor).toBe(200);
    expect(r.html).toContain('com-marcos');
    expect((r.html.match(/class="marco/g) ?? []).length).toBe(3);
  });

  it('realizado acima de todos os degraus preenche sem transbordar', () => {
    const r = barraProgressoMarcos({
      realizado: 500, meta: 100,
      opcoes: { marcos: [{ valor: 200, rotulo: '2ª meta' }] },
    });
    expect(r.batidos).toBe(2);
    expect(r.proximo).toBeNull();
    expect(r.html).toContain('width:100.0%');
    expect(r.html).toContain('>500%</span>');
  });

  it('percentual sai da PRIMEIRA meta, não do último degrau', () => {
    const r = barraProgressoMarcos({
      realizado: 100, meta: 100,
      opcoes: { marcos: [{ valor: 400, rotulo: '2ª meta' }] },
    });
    expect(r.html).toContain('>100%</span>');
  });
});
