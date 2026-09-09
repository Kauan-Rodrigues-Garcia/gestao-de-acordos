/**
 * AnelProjecao.test.tsx — o anel que substituiu o texto do card «Projeção».
 *
 * Um caso guia todos os outros: o ARCO fecha em uma volta e o NÚMERO não. Sem
 * o teto, 140% desenharia uma volta e meia e o anel viraria uma espiral; sem a
 * liberdade do número, quem está em 140% leria 100% e acharia que empatou com
 * quem está exatamente no esperado.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnelProjecao } from './AnelProjecao';

/** O arco desenhado, em % da volta, lido do `stroke-dasharray`/`offset`. */
function voltaDesenhada(container: HTMLElement): number {
  const arco = container.querySelectorAll('circle')[1];
  const total = Number(arco.getAttribute('stroke-dasharray'));
  const vazio = Number(arco.style.strokeDashoffset || total);
  return Math.round(((total - vazio) / total) * 100);
}

describe('AnelProjecao', () => {
  it('desenha o arco na fração da projeção', () => {
    const { container } = render(<AnelProjecao pct={85} cor="#6366f1" />);
    expect(voltaDesenhada(container)).toBe(85);
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('acima de 100 o arco para na volta cheia, e o número não', () => {
    const { container } = render(<AnelProjecao pct={140} cor="#22c55e" />);
    expect(voltaDesenhada(container)).toBe(100);
    expect(screen.getByText('140%')).toBeInTheDocument();
  });

  it('zero não vira arco negativo', () => {
    const { container } = render(<AnelProjecao pct={0} cor="#ef4444" />);
    expect(voltaDesenhada(container)).toBe(0);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('anuncia a leitura completa a quem usa leitor de tela', () => {
    render(<AnelProjecao pct={85} cor="#6366f1" />);
    expect(screen.getByRole('img', { name: 'Projeção: 85% do esperado até hoje' }))
      .toBeInTheDocument();
  });

  it('o arco veste a cor recebida — a régua é de quem chama', () => {
    const { container } = render(<AnelProjecao pct={60} cor="#f59e0b" />);
    expect(container.querySelectorAll('circle')[1].getAttribute('stroke'))
      .toBe('#f59e0b');
  });
});
