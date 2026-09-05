// src/components/KpiTile.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendingUp } from 'lucide-react';
import { KpiTile } from './KpiTile';

describe('KpiTile', () => {
  it('mostra rótulo, valor e subtítulo', () => {
    render(
      <KpiTile rotulo="Total recebido" valor="R$ 1.000,00"
        sub="inclui R$ 200,00 de ajuste" Icon={TrendingUp} tom="primario" />,
    );
    expect(screen.getByText('Total recebido')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
    expect(screen.getByText('inclui R$ 200,00 de ajuste')).toBeInTheDocument();
  });

  it('sem subtítulo não deixa parágrafo vazio', () => {
    const { container } = render(
      <KpiTile rotulo="Operadores" valor={23} Icon={TrendingUp} tom="neutro" />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});
