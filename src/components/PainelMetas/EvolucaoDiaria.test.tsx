/**
 * EvolucaoDiaria.
 *
 * O Recharts não desenha nada em jsdom — `ResponsiveContainer` mede 0×0 e as
 * `Cell` nunca chegam ao DOM. Então o peso das barras é testado pela função
 * pura `opacidadeDaBarra`, e o que sobra de DOM (legenda e rodapé) renderizando.
 *
 * O destaque do dia corrente depende de `diaDeHoje` chegar `null` em mês
 * fechado — quem decide isso é `usePainelMetas` (`noMesAtual`), coberto lá.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EvolucaoDiaria } from './EvolucaoDiaria';
import { opacidadeDaBarra, OPACIDADES } from './opacidadeBarra';

const PADRAO = {
  1:  { bruto: 611.62,    ho: 0, qtd: 3 },
  8:  { bruto: 10_789.01, ho: 0, qtd: 40 },
  10: { bruto: 18_384.11, ho: 0, qtd: 121 },
  11: { bruto: 4_667.80,  ho: 0, qtd: 12 },
};

const AGENDADO = [
  { dia: 12, agendado: 5_000 },
  { dia: 13, agendado: 2_500 },
];

const META_DIARIA = 6_190.48;

describe('opacidadeDaBarra', () => {
  it('dia que alcançou a meta fica cheio', () => {
    expect(opacidadeDaBarra(18_384.11, META_DIARIA)).toBe(OPACIDADES.acima);
  });

  it('dia abaixo da meta fica esmaecido', () => {
    expect(opacidadeDaBarra(4_667.80, META_DIARIA)).toBe(OPACIDADES.abaixo);
  });

  it('na fronteira exata conta como alcançada', () => {
    expect(opacidadeDaBarra(META_DIARIA, META_DIARIA)).toBe(OPACIDADES.acima);
  });

  it('um centavo abaixo já esmaece', () => {
    expect(opacidadeDaBarra(META_DIARIA - 0.01, META_DIARIA)).toBe(OPACIDADES.abaixo);
  });

  it('sem meta todos os dias pesam igual', () => {
    expect(opacidadeDaBarra(18_384.11, null)).toBe(OPACIDADES.neutra);
    expect(opacidadeDaBarra(0, null)).toBe(OPACIDADES.neutra);
  });

  it('o peso "abaixo" é menor que o "acima" — a leitura depende disso', () => {
    expect(OPACIDADES.abaixo).toBeLessThan(OPACIDADES.acima);
  });
});

describe('EvolucaoDiaria — legenda', () => {
  it('com meta mostra a referência de meta e o peso esmaecido', () => {
    render(<EvolucaoDiaria porDia={PADRAO} mes="2026-08" metaDiaria={META_DIARIA} diaDeHoje={11} />);
    expect(screen.getByText('Recebido')).toBeInTheDocument();
    expect(screen.getByText('Abaixo da meta')).toBeInTheDocument();
    expect(screen.getByText('Meta diária')).toBeInTheDocument();
  });

  it('sem meta some tudo que fala de meta', () => {
    render(<EvolucaoDiaria porDia={PADRAO} mes="2026-08" metaDiaria={null} diaDeHoje={11} />);
    expect(screen.getByText('Recebido')).toBeInTheDocument();
    expect(screen.queryByText('Abaixo da meta')).not.toBeInTheDocument();
    expect(screen.queryByText('Meta diária')).not.toBeInTheDocument();
    expect(screen.queryByText(/Meta\/dia/)).not.toBeInTheDocument();
  });

  it('sem agendado a série não aparece na legenda', () => {
    render(<EvolucaoDiaria porDia={PADRAO} mes="2026-08" metaDiaria={META_DIARIA} diaDeHoje={11} />);
    expect(screen.queryByText('Agendado')).not.toBeInTheDocument();
  });

  it('com agendado a série entra na legenda', () => {
    render(
      <EvolucaoDiaria
        porDia={PADRAO} agendadoPorDia={AGENDADO}
        mes="2026-08" metaDiaria={META_DIARIA} diaDeHoje={11}
      />,
    );
    expect(screen.getByText('Agendado')).toBeInTheDocument();
  });

  it('agendado todo zerado conta como ausente', () => {
    render(
      <EvolucaoDiaria
        porDia={PADRAO} agendadoPorDia={[{ dia: 5, agendado: 0 }]}
        mes="2026-08" metaDiaria={META_DIARIA} diaDeHoje={11}
      />,
    );
    expect(screen.queryByText('Agendado')).not.toBeInTheDocument();
  });
});

describe('EvolucaoDiaria — rodapé', () => {
  it('conta os dias com recebimento, soma o total e aponta o melhor dia', () => {
    render(<EvolucaoDiaria porDia={PADRAO} mes="2026-08" metaDiaria={META_DIARIA} diaDeHoje={11} />);
    expect(screen.getByText('4 dias com recebimento')).toBeInTheDocument();
    // 611,62 + 10.789,01 + 18.384,11 + 4.667,80
    expect(screen.getByText(/34\.452,54/)).toBeInTheDocument();
    expect(screen.getByText(/18\.384,11/)).toBeInTheDocument();
  });

  it('singular quando só um dia teve movimento', () => {
    render(<EvolucaoDiaria porDia={{ 3: { bruto: 500, ho: 0, qtd: 1 } }} mes="2026-08" metaDiaria={null} diaDeHoje={null} />);
    expect(screen.getByText('1 dia com recebimento')).toBeInTheDocument();
  });

  it('mês sem recebimento nenhum não quebra nem inventa melhor dia', () => {
    render(<EvolucaoDiaria porDia={{}} mes="2026-08" metaDiaria={META_DIARIA} diaDeHoje={11} />);
    expect(screen.getByText('0 dias com recebimento')).toBeInTheDocument();
    expect(screen.queryByText(/Melhor dia/)).not.toBeInTheDocument();
  });
});

describe('EvolucaoDiaria — por baixa', () => {
  // A escolha fica no navegador; cada teste começa por dia.
  beforeEach(() => { localStorage.clear(); });

  it('abre por dia e troca para baixa', () => {
    render(<EvolucaoDiaria porDia={PADRAO} mes="2026-08" metaDiaria={META_DIARIA} diaDeHoje={11} />);
    expect(screen.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Baixa' }));
    expect(screen.getByRole('button', { name: 'Baixa' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Meta por baixa')).toBeInTheDocument();
    expect(screen.getByText(/Meta\/baixa/)).toBeInTheDocument();
  });

  it('conta as baixas do mês e soma o fim de semana na baixa anterior', () => {
    // Agosto/2026: 21 dias úteis. 01 (sáb) entra na baixa 1; 08 (sáb) e 09
    // (dom) na baixa da sexta 07 — que vira uma baixa só.
    render(
      <EvolucaoDiaria
        porDia={{ ...PADRAO, 9: { bruto: 1_000, ho: 0, qtd: 1 } }}
        mes="2026-08" metaDiaria={META_DIARIA} diaDeHoje={11}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Baixa' }));
    expect(screen.getByText('4 baixas com recebimento de 21')).toBeInTheDocument();
  });

  it('feriado não abre baixa', () => {
    render(
      <EvolucaoDiaria
        porDia={PADRAO} mes="2026-08" metaDiaria={null} diaDeHoje={null}
        feriados={['2026-08-10']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Baixa' }));
    // 10/08 vira parte da baixa de sexta 07, junto com 08/08.
    expect(screen.getByText('3 baixas com recebimento de 20')).toBeInTheDocument();
  });

  it('lembra a escolha', () => {
    const { unmount } = render(<EvolucaoDiaria porDia={PADRAO} mes="2026-08" metaDiaria={null} diaDeHoje={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Baixa' }));
    unmount();
    render(<EvolucaoDiaria porDia={PADRAO} mes="2026-08" metaDiaria={null} diaDeHoje={null} />);
    expect(screen.getByRole('button', { name: 'Baixa' })).toHaveAttribute('aria-pressed', 'true');
  });
});
