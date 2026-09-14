/**
 * CardEquipe.test.tsx — o botão que leva o card para a conversa.
 *
 * As contas e o texto têm testes próprios (`desempenhoEquipe`,
 * `mensagemEquipe`). Aqui fica só o que é do card: onde o botão aparece e o
 * que ele entrega.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import { CardEquipe } from './CardEquipe';

const { copiarTexto } = vi.hoisted(() => ({
  copiarTexto: vi.fn(async (_texto: string, _ok?: string, _erro?: string) => true),
}));
vi.mock('@/lib/clipboard', () => ({ copiarTexto }));

const PROPS = {
  titulo: 'Time Matheus',
  acumulado: 45_000,
  meta: 100_000,
  totalUteis: 20,
  decorridos: 10,
  quartis: QUARTIS_PADRAO,
  operadores: [{ id: 'a', nome: 'Ana Paula', recebido: 12_000, meta: 20_000 }],
};

describe('CardEquipe — copiar para a equipe', () => {
  beforeEach(() => { copiarTexto.mockClear(); });

  it('o botão mora na área aberta, não no card fechado', () => {
    render(<CardEquipe {...PROPS} mes="2026-09" />);
    expect(screen.queryByRole('button', { name: /Copiar para a equipe/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Time Matheus'));
    expect(screen.getByRole('button', { name: /Copiar para a equipe/ })).toBeInTheDocument();
  });

  it('copia o texto da equipe, com o mesmo acumulado do card', () => {
    render(<CardEquipe {...PROPS} mes="2026-09" />);
    fireEvent.click(screen.getByText('Time Matheus'));
    fireEvent.click(screen.getByRole('button', { name: /Copiar para a equipe/ }));

    expect(copiarTexto).toHaveBeenCalledTimes(1);
    const texto = copiarTexto.mock.calls[0][0];
    expect(texto).toContain('*Time Matheus* — setembro/2026');
    expect(texto).toMatch(/R\$\s?45\.000,00/);
  });

  it('no card de setor, o botão fala do setor', () => {
    render(<CardEquipe {...PROPS} ehSetor mes="2026-09" />);
    fireEvent.click(screen.getByText('Time Matheus'));
    expect(screen.getByRole('button', { name: /Copiar para o setor/ })).toBeInTheDocument();
  });

  it('sem o mês não há o que datar, e o botão não aparece', () => {
    render(<CardEquipe {...PROPS} />);
    fireEvent.click(screen.getByText('Time Matheus'));
    expect(screen.queryByRole('button', { name: /Copiar para/ })).not.toBeInTheDocument();
  });
});

describe('CardEquipe — PaguePlay lê em H.O.', () => {
  beforeEach(() => { copiarTexto.mockClear(); });

  const PP = { ...PROPS, mostrarHO: true, acumuladoHO: 11_232, metaHO: 24_960 };

  it('o H.O. é o número grande, e o bruto desce para a linha de apoio', () => {
    render(<CardEquipe {...PP} />);
    expect(screen.getByText('Acumulado H.O.')).toBeInTheDocument();
    expect(screen.getByText('Meta H.O.')).toBeInTheDocument();
    expect(screen.getByText(/Bruto R\$\s?45\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/Bruto R\$\s?100\.000,00/)).toBeInTheDocument();
    // «Falta p/ meta» na MESMA unidade do acumulado: 24.960 − 11.232.
    expect(screen.getByText(/R\$\s?13\.728,00/)).toBeInTheDocument();
  });

  it('o texto copiado fala em H.O. e traz o bruto de apoio', () => {
    render(<CardEquipe {...PP} mes="2026-09" />);
    fireEvent.click(screen.getByText('Time Matheus'));
    fireEvent.click(screen.getByRole('button', { name: /Copiar para a equipe/ }));
    const texto = copiarTexto.mock.calls[0][0];
    expect(texto).toMatch(/\*Recebido da equipe \(H\.O\.\):\* R\$\s?11\.232,00/);
    expect(texto).toMatch(/\*Bruto:\* R\$\s?45\.000,00/);
  });

  it('BookPlay continua em bruto, sem linha de apoio', () => {
    render(<CardEquipe {...PROPS} />);
    expect(screen.getByText('Acumulado')).toBeInTheDocument();
    expect(screen.queryByText(/^Bruto /)).not.toBeInTheDocument();
  });
});
