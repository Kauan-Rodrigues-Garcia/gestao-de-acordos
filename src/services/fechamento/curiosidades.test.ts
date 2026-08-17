/**
 * As curiosidades do fechamento.
 *
 * O que estes testes protegem acima de tudo é a regra "sem base, omitida":
 * um relatório apresentado à diretoria não pode carregar um número que parece
 * medido e foi inferido. Cada curiosidade tem um caso que a faz sumir.
 */

import { describe, it, expect } from 'vitest';
import { montarCuriosidades, type EntradaCuriosidades } from './curiosidades';
import type { LinhaOperadorFechamento, PontoDia } from './tipos';

function op(over: Partial<LinhaOperadorFechamento> = {}): LinhaOperadorFechamento {
  return {
    id: 'op', nome: 'Alguém', usuario: 'alguem',
    setorNome: 'Receptivo', equipeNome: 'Matheus',
    bruto: 1000, ho: 0, qtd: 10, meta: 2000, pctMeta: 50,
    projecaoPct: 50, quartil: 3, diferenca: -1000,
    metasExtras: [], metasBatidas: 0, porDia: [], porForma: [],
    ...over,
  };
}

const dias = (valores: number[]): PontoDia[] =>
  valores.map((bruto, i) => ({ dia: i + 1, bruto, ho: 0, qtd: bruto > 0 ? 2 : 0 }));

function entrada(over: Partial<EntradaCuriosidades> = {}): EntradaCuriosidades {
  return {
    porDia: dias([100, 100, 100, 100]),
    porForma: [],
    totalBruto: 400,
    metaDiaria: null,
    operadores: [],
    comparativo: null,
    ...over,
  };
}

const titulos = (e: EntradaCuriosidades) => montarCuriosidades(e).map(c => c.titulo);

describe('dia de pico', () => {
  it('aparece quando um dia pesa 5% ou mais do mês', () => {
    const e = entrada({ porDia: dias([10, 10, 500]), totalBruto: 520 });
    const c = montarCuriosidades(e).find(x => x.titulo === 'Dia de pico');
    expect(c?.destaque).toBe('Dia 3');
    expect(c?.texto).toContain('%');
  });

  it('some quando o mês é uniforme — dia comum não é curiosidade', () => {
    const uniforme = entrada({
      porDia: dias(Array.from({ length: 30 }, () => 100)),
      totalBruto: 3000,
    });
    expect(titulos(uniforme)).not.toContain('Dia de pico');
  });

  it('some num mês sem movimento', () => {
    expect(titulos(entrada({ porDia: dias([0, 0]), totalBruto: 0 }))).not.toContain('Dia de pico');
  });
});

describe('sequência acima da meta diária', () => {
  it('sem meta a curiosidade não existe — não dá para inferir o alvo', () => {
    const e = entrada({ porDia: dias([500, 500, 500, 500]), metaDiaria: null });
    expect(titulos(e)).not.toContain('Melhor sequência');
  });

  it('conta a maior sequência de dias com movimento acima da meta', () => {
    const e = entrada({
      porDia: dias([500, 500, 500, 10, 500, 500]),
      metaDiaria: 100,
    });
    const c = montarCuriosidades(e).find(x => x.titulo === 'Melhor sequência');
    expect(c?.destaque).toBe('3 dias seguidos');
  });

  it('dia zerado não quebra a sequência — fim de semana não é fracasso', () => {
    const e = entrada({
      porDia: dias([500, 0, 500, 0, 500]),
      metaDiaria: 100,
    });
    const c = montarCuriosidades(e).find(x => x.titulo === 'Melhor sequência');
    expect(c?.destaque).toBe('3 dias seguidos');
  });

  it('menos de três dias não vira sequência', () => {
    const e = entrada({ porDia: dias([500, 500, 10]), metaDiaria: 100 });
    expect(titulos(e)).not.toContain('Melhor sequência');
  });
});

describe('metas individuais', () => {
  it('conta quantos bateram entre os que tinham meta', () => {
    const e = entrada({
      operadores: [
        op({ id: '1', nome: 'A', bruto: 3000, meta: 2000 }),
        op({ id: '2', nome: 'B', bruto: 1000, meta: 2000 }),
        op({ id: '3', nome: 'C', bruto: 500, meta: null }),
      ],
    });
    const c = montarCuriosidades(e).find(x => x.titulo === 'Metas individuais');
    // Só os dois COM meta entram na base.
    expect(c?.destaque).toBe('1 de 2');
  });

  it('diz explicitamente quando ninguém bateu', () => {
    const e = entrada({
      operadores: [
        op({ id: '1', bruto: 100, meta: 2000 }),
        op({ id: '2', bruto: 200, meta: 2000 }),
      ],
    });
    const c = montarCuriosidades(e).find(x => x.titulo === 'Metas individuais');
    expect(c?.texto).toContain('Ninguém');
  });

  it('some quando quase ninguém tem meta', () => {
    const e = entrada({ operadores: [op({ meta: 2000 })] });
    expect(titulos(e)).not.toContain('Metas individuais');
  });
});

describe('maior subida', () => {
  const tres = [
    op({ id: 'a', nome: 'Ana', bruto: 3000 }),
    op({ id: 'b', nome: 'Bia', bruto: 2000 }),
    op({ id: 'c', nome: 'Caio', bruto: 1000 }),
  ];

  it('sem mês anterior não existe subida', () => {
    expect(titulos(entrada({ operadores: tres, comparativo: null })))
      .not.toContain('Maior subida');
  });

  it('aponta quem ganhou mais posições', () => {
    const e = entrada({
      operadores: tres,
      comparativo: {
        mesAnterior: '2026-06', mesAnteriorRotulo: 'Junho 2026', temBase: true,
        brutoAnterior: 1, qtdAnterior: 1, metaAnterior: null,
        variacaoBruto: 0, variacaoBrutoPct: null, variacaoQtd: 0, variacaoQtdPct: null,
        posicaoAnteriorPorOperador: { a: 3, b: 2, c: 1 },
      },
    });
    const c = montarCuriosidades(e).find(x => x.titulo === 'Maior subida');
    expect(c?.destaque).toBe('Ana');
    expect(c?.texto).toContain('Junho 2026');
  });

  it('some quando ninguém subiu', () => {
    const e = entrada({
      operadores: tres,
      comparativo: {
        mesAnterior: '2026-06', mesAnteriorRotulo: 'Junho 2026', temBase: true,
        brutoAnterior: 1, qtdAnterior: 1, metaAnterior: null,
        variacaoBruto: 0, variacaoBrutoPct: null, variacaoQtd: 0, variacaoQtdPct: null,
        posicaoAnteriorPorOperador: { a: 1, b: 2, c: 3 },
      },
    });
    expect(titulos(e)).not.toContain('Maior subida');
  });
});

describe('forma que mais cresceu', () => {
  const forma = (rotulo: string, bruto: number) => ({ rotulo, bruto, ho: 0, qtd: 1, pct: 0 });

  it('sem mês anterior não há crescimento a medir', () => {
    const e = entrada({ porForma: [forma('Pix', 500)] });
    expect(titulos(e)).not.toContain('Forma que mais cresceu');
  });

  it('aponta a de maior ganho absoluto', () => {
    const e = entrada({
      porForma: [forma('Pix', 500), forma('Boleto', 300)],
      porFormaAnterior: [forma('Pix', 100), forma('Boleto', 250)],
    });
    const c = montarCuriosidades(e).find(x => x.titulo === 'Forma que mais cresceu');
    expect(c?.destaque).toBe('Pix');
  });

  it('forma que não existia antes fica de fora — crescer do zero é infinito', () => {
    const e = entrada({
      porForma: [forma('Pix Automático', 900)],
      porFormaAnterior: [forma('Boleto', 250)],
    });
    expect(titulos(e)).not.toContain('Forma que mais cresceu');
  });
});

describe('concentração do topo', () => {
  it('some com time pequeno', () => {
    const e = entrada({ operadores: [op(), op(), op()] });
    expect(titulos(e)).not.toContain('Concentração');
  });

  it('mede o peso dos três primeiros', () => {
    const e = entrada({
      totalBruto: 1000,
      operadores: [
        op({ id: '1', bruto: 400 }), op({ id: '2', bruto: 300 }),
        op({ id: '3', bruto: 200 }), op({ id: '4', bruto: 60 }),
        op({ id: '5', bruto: 40 }),
      ],
    });
    const c = montarCuriosidades(e).find(x => x.titulo === 'Concentração');
    expect(c?.destaque).toBe('90%');
  });
});

describe('montarCuriosidades', () => {
  it('mês sem nada devolve lista vazia, e não cartões de zero', () => {
    expect(montarCuriosidades(entrada({ porDia: dias([]), totalBruto: 0 }))).toEqual([]);
  });
});
