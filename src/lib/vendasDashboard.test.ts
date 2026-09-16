import { describe, it, expect } from 'vitest';
import {
  serieDoMes, ticketMedio, aproveitamento, coberturaDeRecebimento,
  fatiasDaRegua, variacao, COR_DA_GAVETA,
} from './vendasDashboard';
import { resumirVendas, GAVETAS_EM_ORDEM, type VendaSomavel } from './vendas';
import type { PontoDoDia } from './vendasPlacar';

function venda(p: Partial<VendaSomavel> = {}): VendaSomavel {
  return {
    situacao: 'confirmada',
    contrato_assinado: true,
    valor_total: 1_000,
    valor_recebido: 0,
    valor_entrada: null,
    ...p,
  };
}

describe('serieDoMes', () => {
  it('preenche os dias sem venda em vez de comprimir o mês', () => {
    const pontos: PontoDoDia[] = [
      { dia: '2026-09-01', quantidade: 1, valor: 100 },
      { dia: '2026-09-04', quantidade: 2, valor: 300 },
    ];
    const serie = serieDoMes(pontos, '2026-09');

    expect(serie).toHaveLength(30);
    expect(serie[0]).toMatchObject({ dia: 1, rotulo: '01', valor: 100 });
    // Os dias 02 e 03 existem, valendo zero — é o que dá a leitura de ritmo.
    expect(serie[1]).toMatchObject({ dia: 2, valor: 0, quantidade: 0 });
    expect(serie[2]).toMatchObject({ dia: 3, valor: 0, quantidade: 0 });
    expect(serie[3]).toMatchObject({ dia: 4, valor: 300, quantidade: 2 });
  });

  it('acumula reto nos dias vazios, em vez de deixar a linha sumir', () => {
    const serie = serieDoMes(
      [{ dia: '2026-09-01', quantidade: 1, valor: 100 },
       { dia: '2026-09-03', quantidade: 1, valor: 50 }],
      '2026-09',
    );
    expect(serie.map(p => p.acumulado).slice(0, 4)).toEqual([100, 100, 150, 150]);
    // O último dia do mês carrega o total: é o número do rodapé do gráfico.
    expect(serie[serie.length - 1].acumulado).toBe(150);
  });

  it('respeita o tamanho do mês', () => {
    expect(serieDoMes([], '2026-02')).toHaveLength(28);
    expect(serieDoMes([], '2026-01')).toHaveLength(31);
  });

  it('soma dois pontos que caem no mesmo dia', () => {
    const serie = serieDoMes(
      [{ dia: '2026-09-05', quantidade: 1, valor: 10 },
       { dia: '2026-09-05', quantidade: 2, valor: 20 }],
      '2026-09',
    );
    expect(serie[4]).toMatchObject({ quantidade: 3, valor: 30 });
  });
});

describe('ticketMedio', () => {
  it('divide o faturamento pela quantidade da régua', () => {
    expect(ticketMedio({ quantidade: 4, valor: 2_000 })).toBe(500);
  });

  it('devolve null sem venda — «R$ 0,00» se leria como venda de graça', () => {
    expect(ticketMedio({ quantidade: 0, valor: 0 })).toBeNull();
  });
});

describe('aproveitamento', () => {
  it('é a fatia da régua dentro do que chegou a ser confirmado', () => {
    const resumo = resumirVendas([
      venda(), venda(),                                            // na meta
      venda({ contrato_assinado: false }),                         // pendente
      venda({ situacao: 'devolvida' }),                            // devolvida
    ]);
    // 2 de 4 — a pendente entra no denominador, não é perda nem acerto.
    expect(aproveitamento(resumo)).toBe(0.5);
  });

  it('não conta a aberta, que nunca chegou a ser confirmada', () => {
    const resumo = resumirVendas([venda(), venda({ situacao: 'aberta' })]);
    expect(aproveitamento(resumo)).toBe(1);
  });

  it('devolve null sem denominador', () => {
    expect(aproveitamento(resumirVendas([venda({ situacao: 'aberta' })]))).toBeNull();
    expect(aproveitamento(resumirVendas([]))).toBeNull();
  });
});

describe('coberturaDeRecebimento', () => {
  it('mede o recebido contra o faturado da régua', () => {
    const resumo = resumirVendas([
      venda({ valor_total: 1_000, valor_recebido: 250 }),
      venda({ valor_total: 1_000, valor_recebido: 0 }),
    ]);
    expect(coberturaDeRecebimento(resumo)).toBeCloseTo(0.125, 5);
  });

  it('devolve null sem faturamento — 0/0 não é 0%', () => {
    expect(coberturaDeRecebimento({ valor: 0, recebido: 0 })).toBeNull();
  });
});

describe('fatiasDaRegua', () => {
  const resumo = resumirVendas([
    venda({ valor_total: 700 }),
    venda({ valor_total: 100, contrato_assinado: false }),
    venda({ valor_total: 200, situacao: 'cancelada' }),
  ]);

  it('mantém a ordem da régua, e não a do tamanho', () => {
    const fatias = fatiasDaRegua(resumo, GAVETAS_EM_ORDEM);
    expect(fatias.map(f => f.gaveta)).toEqual(['na_meta', 'pendente_assinatura', 'cancelada']);
  });

  it('omite gaveta vazia em vez de desenhar uma legenda de zeros', () => {
    const fatias = fatiasDaRegua(resumo, GAVETAS_EM_ORDEM);
    expect(fatias.some(f => f.gaveta === 'devolvida')).toBe(false);
    expect(fatias.some(f => f.gaveta === 'aberta')).toBe(false);
  });

  it('calcula a participação sobre o valor de todas as gavetas', () => {
    const fatias = fatiasDaRegua(resumo, GAVETAS_EM_ORDEM);
    expect(fatias.find(f => f.gaveta === 'na_meta')?.perc).toBe(70);
    expect(fatias.find(f => f.gaveta === 'cancelada')?.perc).toBe(20);
    // As participações fecham o todo: é o que torna o anel honesto.
    expect(fatias.reduce((s, f) => s + f.perc, 0)).toBeCloseTo(100, 5);
  });

  it('devolvida e cancelada não saem da mesma cor — no anel virariam uma fatia', () => {
    expect(COR_DA_GAVETA.devolvida).not.toBe(COR_DA_GAVETA.cancelada);
  });

  it('não devolve fatia nenhuma para um mês vazio', () => {
    expect(fatiasDaRegua(resumirVendas([]), GAVETAS_EM_ORDEM)).toEqual([]);
  });
});

describe('variacao', () => {
  it('mede a diferença relativa e a direção', () => {
    expect(variacao(120, 100)).toMatchObject({ direcao: 'up', rotulo: '+20%' });
    expect(variacao(80, 100)).toMatchObject({ direcao: 'down', rotulo: '−20%' });
  });

  it('chama de estável o que mudou menos de meio por cento', () => {
    expect(variacao(100.4, 100)).toMatchObject({ direcao: 'neutral', rotulo: 'estável' });
  });

  /*
   * O caso do Comercial hoje: setembro carregado, agosto não importado. Sem
   * este null, todo card abriria com «+100%» e a seta ficaria verde para
   * sempre — uma mentira com cara de notícia boa.
   */
  it('devolve null quando o mês anterior não tem base de comparação', () => {
    expect(variacao(740_166.8, 0)).toBeNull();
    expect(variacao(740_166.8, Number.NaN)).toBeNull();
  });
});
