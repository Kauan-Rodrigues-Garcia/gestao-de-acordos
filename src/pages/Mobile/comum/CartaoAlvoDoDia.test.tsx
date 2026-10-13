/**
 * «Onde precisa estar»: hoje e o próximo dia útil, com quanto falta.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartaoAlvoDoDia } from './CartaoAlvoDoDia';

describe('CartaoAlvoDoDia', () => {
  it('mostra o alvo de hoje e o de amanhã, com o que falta', () => {
    render(
      <CartaoAlvoDoDia unidadeHO={false} alvo={{
        hoje: 11_000, diferencaHoje: -500,
        amanha: { alvo: 12_000, falta: 1_500, data: '2026-10-15', rotulo: 'amanhã' },
      }} />,
    );
    expect(screen.getByRole('region', { name: 'Onde precisa estar' })).toBeInTheDocument();
    expect(screen.getByText('R$ 11.000')).toBeInTheDocument();
    expect(screen.getByText('faltam R$ 500')).toBeInTheDocument();
    expect(screen.getByText('Amanhã')).toBeInTheDocument();
    expect(screen.getByText('R$ 12.000')).toBeInTheDocument();
    expect(screen.getByText('faltam R$ 1.500')).toBeInTheDocument();
  });

  it('à frente hoje; próximo dia útil com o nome do dia; H.O. no título', () => {
    render(
      <CartaoAlvoDoDia unidadeHO titulo="Onde você precisa estar" alvo={{
        hoje: 11_000, diferencaHoje: 2_000,
        amanha: { alvo: 12_000, falta: 0, data: '2026-10-19', rotulo: 'segunda, 19/10' },
      }} />,
    );
    expect(screen.getByText('Onde você precisa estar · H.O.')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.000 à frente')).toBeInTheDocument();
    expect(screen.getByText('segunda, 19/10')).toBeInTheDocument();
    expect(screen.getByText('já garantido')).toBeInTheDocument();
  });

  it('no último dia útil não há amanhã', () => {
    render(<CartaoAlvoDoDia unidadeHO={false} alvo={{ hoje: 21_000, diferencaHoje: -100, amanha: null }} />);
    expect(screen.getByText('hoje é o último dia útil')).toBeInTheDocument();
  });
});
