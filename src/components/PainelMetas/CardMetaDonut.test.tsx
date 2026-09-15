/**
 * CardMetaDonut — o donut da meta e o breakdown por forma de pagamento.
 *
 * O gráfico de pizza do breakdown não desenha em jsdom (o `ResponsiveContainer`
 * mede 0×0), então a distribuição é verificada por `fatiasDeForma`, que é pura,
 * e a lista de linhas pelo DOM.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardMetaDonut } from './CardMetaDonut';
import { fatiasDeForma, corDaMeta } from './metaDonut';
import { ALTURA_CARD_PROGRESSO } from './tamanhoCards';

const FORMAS = {
  'Pix':    { valor: 40_000, qtd: 80 },
  'Boleto': { valor: 20_000, qtd: 30 },
  'Cartão': { valor: 5_000,  qtd: 4 },
};

const render0 = (over: Partial<Parameters<typeof CardMetaDonut>[0]> = {}) =>
  render(
    <CardMetaDonut
      recebido={65_611.62}
      meta={130_000}
      escopoRotulo="individual"
      porForma={FORMAS}
      {...over}
    />,
  );

describe('fatiasDeForma', () => {
  it('ordena pelo valor, do maior para o menor', () => {
    expect(fatiasDeForma(FORMAS).map(f => f.label)).toEqual(['Pix', 'Boleto', 'Cartão']);
  });

  it('a % é sobre o VALOR, não sobre a quantidade de pagamentos', () => {
    const fatias = fatiasDeForma(FORMAS);
    // Pix: 40.000 de 65.000 = 61,5% do dinheiro — embora tenha 80 dos 114 pgtos
    expect(fatias[0].perc).toBeCloseTo(61.5, 1);
    expect(fatias[1].perc).toBeCloseTo(30.8, 1);
    expect(fatias[2].perc).toBeCloseTo(7.7, 1);
  });

  it('as fatias somam ~100%', () => {
    const soma = fatiasDeForma(FORMAS).reduce((s, f) => s + f.perc, 0);
    expect(soma).toBeGreaterThan(99);
    expect(soma).toBeLessThan(101);
  });

  it('sem formas devolve lista vazia, sem dividir por zero', () => {
    expect(fatiasDeForma({})).toEqual([]);
  });

  it('total zerado não vira NaN', () => {
    const fatias = fatiasDeForma({ 'Pix': { valor: 0, qtd: 0 } });
    expect(fatias[0].perc).toBe(0);
  });

  // Pedido de 14/09/2026: o card agrupa como o «Como o dinheiro chega» do
  // Painel Diretoria — as variações do 59 viram um meio só.
  it('agrupa as variações do ERP nas famílias do Painel Diretoria', () => {
    const fatias = fatiasDeForma({
      'PIX':                          { valor: 100, qtd: 1 },
      'Pix QR Code':                  { valor: 50,  qtd: 2 },
      'PIX AUTOMÁTICO':               { valor: 40,  qtd: 3 },
      'CARTÃO DE CRÉDITO':            { valor: 30,  qtd: 1 },
      'CARTÃO SITE PARCIAL + BOLETO': { valor: 20,  qtd: 1 },
      'RECORRENTE':                   { valor: 15,  qtd: 1 },
      'BOLETO BANCÁRIO':              { valor: 10,  qtd: 1 },
      'Boleto Negociação':            { valor: 5,   qtd: 1 },
      'Pix/Boleto':                   { valor: 4,   qtd: 1 },
    });
    expect(fatias.map(f => [f.label, f.valor, f.qtd])).toEqual([
      ['Pix', 150, 3],
      ['Cartão', 50, 2],
      ['Pix automático', 40, 3],
      ['Cartão recorrente', 15, 1],
      ['Boleto', 15, 2],
      ['Boleto/Pix Cofen', 4, 1],
    ]);
  });
});

describe('corDaMeta', () => {
  it('usa as faixas do card original (100 / 70 / 40)', () => {
    expect(corDaMeta(120)).toBe('#22c55e');
    expect(corDaMeta(100)).toBe('#22c55e');
    expect(corDaMeta(80)).toBe('#6366f1');
    expect(corDaMeta(50)).toBe('#f59e0b');
    expect(corDaMeta(10)).toBe('#ef4444');
  });
});

describe('CardMetaDonut — resumo', () => {
  it('mostra a % da meta e o rodapé com os dois valores', () => {
    render0();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('da meta')).toBeInTheDocument();
    expect(screen.getByText('meta individual')).toBeInTheDocument();
  });

  // O «Top formas de pagamento» saiu da vista padrão em 14/09/2026: ela é só
  // gráfico, percentual e valor. As formas ficam atrás do botão.
  it('não lista formas de pagamento na vista da meta', () => {
    render0();
    expect(screen.queryByText('Top formas de pagamento')).not.toBeInTheDocument();
    expect(screen.queryByText('Pix')).not.toBeInTheDocument();
    expect(screen.queryByText('61,5%')).not.toBeInTheDocument();
  });

  it('o botão se chama «Formas de pagamento»', () => {
    render0();
    expect(screen.getByRole('button', { name: 'Formas de pagamento' })).toBeInTheDocument();
  });

  it('meta batida acende o aviso', () => {
    render0({ recebido: 140_000 });
    expect(screen.getByText('Meta atingida!')).toBeInTheDocument();
  });

  it('sem formas, o botão de breakdown não aparece', () => {
    render0({ porForma: {} });
    expect(screen.queryByRole('button', { name: /Formas/ })).not.toBeInTheDocument();
  });
});

describe('CardMetaDonut — breakdown', () => {
  // `AnimatePresence mode="wait"` só monta o novo bloco depois da saída do
  // anterior — daí o findBy* em vez de getBy* logo após o clique.
  it('abre e mostra TODAS as formas com valor e %', async () => {
    const user = userEvent.setup();
    render0();
    await user.click(screen.getByRole('button', { name: /Formas/ }));

    expect(await screen.findByText('Cartão')).toBeInTheDocument();
    expect(screen.getByText('Pix')).toBeInTheDocument();
    expect(screen.getByText('Boleto')).toBeInTheDocument();
    expect(screen.getByText('7,7%')).toBeInTheDocument();
    // No modo detalhado cada linha também traz o valor em reais
    expect(screen.getByText(/40\.000,00/)).toBeInTheDocument();
  });

  it('volta para o progresso da meta', async () => {
    const user = userEvent.setup();
    render0();
    await user.click(screen.getByRole('button', { name: /Formas/ }));
    await screen.findByText('Cartão');
    await user.click(screen.getByRole('button', { name: 'Progresso da meta' }));
    expect(await screen.findByText('da meta')).toBeInTheDocument();
    expect(screen.queryByText('Cartão')).not.toBeInTheDocument();
  });

  /*
   * O card não muda de tamanho ao alternar (pedido de 14/09/2026). jsdom não
   * mede layout, então o contrato verificável é a altura FIXA ser a mesma classe
   * nas duas vistas — a mesma que o card de Comissão usa.
   */
  it('mantém a mesma altura fixa nas duas vistas', async () => {
    const user = userEvent.setup();
    const { container } = render0();
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain(ALTURA_CARD_PROGRESSO);

    await user.click(screen.getByRole('button', { name: /Formas/ }));
    await screen.findByText('Cartão');
    expect(card.className).toContain(ALTURA_CARD_PROGRESSO);
  });
});
