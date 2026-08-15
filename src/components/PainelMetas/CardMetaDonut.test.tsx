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
import { CardMetaDonut, fatiasDeForma, corDaMeta } from './CardMetaDonut';

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

  it('lista só as duas maiores formas, e avisa quantas faltam', () => {
    render0();
    expect(screen.getByText('Pix')).toBeInTheDocument();
    expect(screen.getByText('Boleto')).toBeInTheDocument();
    expect(screen.queryByText('Cartão')).not.toBeInTheDocument();
    expect(screen.getByText(/\+1 mais/)).toBeInTheDocument();
  });

  it('mostra a % de cada forma', () => {
    render0();
    expect(screen.getByText('61,5%')).toBeInTheDocument();
    expect(screen.getByText('30,8%')).toBeInTheDocument();
  });

  it('meta batida acende o aviso', () => {
    render0({ recebido: 140_000 });
    expect(screen.getByText('Meta atingida!')).toBeInTheDocument();
  });

  it('sem formas, nem a seção nem o botão de breakdown aparecem', () => {
    render0({ porForma: {} });
    expect(screen.queryByText('Top formas de pagamento')).not.toBeInTheDocument();
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

  it('volta para o resumo', async () => {
    const user = userEvent.setup();
    render0();
    await user.click(screen.getByRole('button', { name: /Formas/ }));
    await screen.findByText('Cartão');
    await user.click(screen.getByRole('button', { name: /Resumo/ }));
    expect(await screen.findByText('da meta')).toBeInTheDocument();
    expect(screen.queryByText('Cartão')).not.toBeInTheDocument();
  });
});
