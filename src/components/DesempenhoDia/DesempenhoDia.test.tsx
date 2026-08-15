/**
 * DesempenhoDia.test.tsx
 *
 * O painel deixou de ser exclusivo da PaguePlay, e é aí que mora o risco: cada
 * operação tem peças que a outra não tem, e uma peça exibida no tenant errado
 * ou some sem explicação, ou mostra zero como se fosse número real.
 *
 *   BookPlay  — sem alternador H.O./Bruto (`total_ho` é zero em toda linha),
 *               sem Direto/Extra, COM Pix Automático
 *   PaguePlay — com alternador, com Direto/Extra quando o setor tem a lógica,
 *               SEM Pix Automático
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { FaixaDinheiro } from './FaixaDinheiro';
import { FaixaContexto } from './FaixaContexto';
import { FaixaOperacao } from './FaixaOperacao';
import type { BarraEstados, MetaDoDia, Variacao } from '@/lib/desempenhoDia';

const SEM_VARIACAO: Variacao = { pct: null, base: 0 };

const BARRA: BarraEstados = {
  pago: 31, aVerificar: 34, naoPago: 18, total: 83, conversao: 63,
};

function renderDinheiro(props: Partial<Parameters<typeof FaixaDinheiro>[0]> = {}) {
  return render(
    <FaixaDinheiro
      recebido={118402}
      recebidoOposto={29554}
      meta={null}
      vsOntem={SEM_VARIACAO}
      vsMedia={SEM_VARIACAO}
      unidade={null}
      onUnidade={vi.fn()}
      {...props}
    />,
  );
}

describe('FaixaDinheiro — alternador de unidade', () => {
  it('PaguePlay recebe o alternador', () => {
    renderDinheiro({ unidade: 'ho' });
    expect(screen.getByRole('group', { name: /unidade/i })).toBeTruthy();
  });

  it('BookPlay não recebe alternador nem a linha da unidade oposta', () => {
    renderDinheiro({ unidade: null });
    expect(screen.queryByRole('group', { name: /unidade/i })).toBeNull();
    // A linha "bruto: R$ ..." só existe quando há duas unidades para comparar.
    expect(screen.queryByText(/bruto:/i)).toBeNull();
  });

  it('o alternador avisa quem clicou', () => {
    const onUnidade = vi.fn();
    renderDinheiro({ unidade: 'ho', onUnidade });
    fireEvent.click(screen.getByRole('button', { name: /bruto/i }));
    expect(onUnidade).toHaveBeenCalledWith('bruto');
  });

  it('declara a fonte do número — é a única faixa que lê o ERP', () => {
    renderDinheiro();
    expect(screen.getByText(/relatório do erp/i)).toBeTruthy();
  });
});

describe('FaixaDinheiro — meta e variação', () => {
  const meta: MetaDoDia = { valor: 96500, percentual: 123, diasUteis: 21 };

  it('sem meta, nenhuma barra é desenhada', () => {
    renderDinheiro({ meta: null });
    expect(screen.queryByText(/meta do dia/i)).toBeNull();
  });

  it('com meta, mostra o alvo e o percentual', () => {
    renderDinheiro({ meta });
    // Duas ocorrências de propósito: o rótulo do bloco e a leitura do
    // percentual logo abaixo da barra.
    expect(screen.getAllByText(/meta do dia/i)).toHaveLength(2);
    expect(screen.getByText(/123% da meta do dia/)).toBeTruthy();
    expect(screen.getByText(/21 dias úteis/)).toBeTruthy();
  });

  /**
   * Sem base de comparação o chip some. Mostrar «+100%» sobre um ontem zerado
   * inventaria um número — ver `variacao()`.
   */
  it('variação sem base não vira chip', () => {
    renderDinheiro({ vsOntem: SEM_VARIACAO, vsMedia: SEM_VARIACAO });
    expect(screen.queryByText(/vs\. ontem/i)).toBeNull();
  });

  it('variação com base vira chip com sinal', () => {
    renderDinheiro({ vsOntem: { pct: 8, base: 100000 } });
    expect(screen.getByText(/vs\. ontem/i)).toBeTruthy();
    expect(screen.getByText(/\+8%/)).toBeTruthy();
  });

  it('queda aparece com sinal negativo', () => {
    renderDinheiro({ vsMedia: { pct: -12, base: 100000 } });
    expect(screen.getByText(/-12%/)).toBeTruthy();
  });
});

describe('FaixaContexto — blocos por operação', () => {
  beforeEach(() => vi.clearAllMocks());

  it('PaguePlay: Direto/Extra aparece, Pix não', () => {
    render(
      <FaixaContexto
        diretoExtra={{ direto: 24100, extra: 5454 }}
        pix={null}
        tags={[]}
      />,
    );
    expect(screen.getByText(/direto e extra/i)).toBeTruthy();
    expect(screen.queryByText(/pix autom/i)).toBeNull();
  });

  it('BookPlay: Pix aparece, Direto/Extra não', () => {
    render(
      <FaixaContexto
        diretoExtra={null}
        pix={{ aprovados: 4, pendentes: 1, comissao: 750, valorAprovado: 3000 }}
        tags={[]}
      />,
    );
    expect(screen.getByText(/pix autom/i)).toBeTruthy();
    expect(screen.queryByText(/direto e extra/i)).toBeNull();
  });

  /**
   * A regra que motivou a faixa: 0,6% dos acordos têm tag, e na versão 1.0 o
   * bloco vazio era o maior elemento do painel.
   */
  it('sem nada para dizer, a faixa inteira some', () => {
    const { container } = render(
      <FaixaContexto diretoExtra={null} pix={null} tags={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('Direto/Extra zerado não desenha bloco', () => {
    const { container } = render(
      <FaixaContexto diretoExtra={{ direto: 0, extra: 0 }} pix={null} tags={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('Pix sem movimento no dia não desenha bloco', () => {
    const { container } = render(
      <FaixaContexto
        diretoExtra={null}
        pix={{ aprovados: 0, pendentes: 0, comissao: 0, valorAprovado: 0 }}
        tags={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('tag do dia aparece com nome e fatia', () => {
    render(
      <FaixaContexto
        diretoExtra={null}
        pix={null}
        tags={[{ tagId: 't1', nome: 'IA DE VOZ', cor: '#f00', valor: 1000, qtd: 3, pct: 10 }]}
      />,
    );
    expect(screen.getByText('IA DE VOZ')).toBeTruthy();
    expect(screen.getByText('10%')).toBeTruthy();
  });
});

describe('FaixaOperacao — a barra de três estados', () => {
  it('mostra os três estados com os rótulos certos', () => {
    render(<FaixaOperacao estados={BARRA} formalizados={12} valorPago={8940} />);
    expect(screen.getByText('31')).toBeTruthy();
    expect(screen.getByText('pagos')).toBeTruthy();
    expect(screen.getByText('a verificar')).toBeTruthy();
    expect(screen.getByText('não pagos')).toBeTruthy();
  });

  it('declara que a fonte são os acordos, e não o ERP', () => {
    render(<FaixaOperacao estados={BARRA} formalizados={12} valorPago={8940} />);
    expect(screen.getByText(/acordos tabulados/i)).toBeTruthy();
  });

  it('a conversão aparece só quando algo foi conferido', () => {
    render(<FaixaOperacao estados={BARRA} formalizados={0} valorPago={0} />);
    expect(screen.getByText('63%')).toBeTruthy();

    const soPendentes: BarraEstados = {
      pago: 0, aVerificar: 40, naoPago: 0, total: 40, conversao: null,
    };
    const { container } = render(
      <FaixaOperacao estados={soPendentes} formalizados={0} valorPago={0} />,
    );
    expect(container.textContent).not.toMatch(/conversão/i);
  });

  it('dia sem acordo diz isso, em vez de desenhar barra vazia', () => {
    const vazia: BarraEstados = {
      pago: 0, aVerificar: 0, naoPago: 0, total: 0, conversao: null,
    };
    render(<FaixaOperacao estados={vazia} formalizados={0} valorPago={0} />);
    expect(screen.getByText(/nenhum acordo com vencimento/i)).toBeTruthy();
  });
});
