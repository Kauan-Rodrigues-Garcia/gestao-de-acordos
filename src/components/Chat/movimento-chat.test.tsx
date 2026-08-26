import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BalaoDigitando, EstiloEntrada, IconeChat } from './comum';

describe('movimento essencial do chat', () => {
  it('mantém os pontos digitando animados sem bloqueio do movimento reduzido', () => {
    const { container } = render(<BalaoDigitando />);
    expect(screen.getByRole('status', { name: 'digitando' })).toBeInTheDocument();
    expect(container.querySelectorAll('.chat-d')).toHaveLength(3);
    expect(container.querySelector('style')?.textContent).not.toContain('prefers-reduced-motion');
  });

  it('mantém o ícone e a entrada das mensagens animados', () => {
    const { container } = render(<><IconeChat ativo /><EstiloEntrada /></>);
    expect(container.querySelectorAll('.chat-p-anima')).toHaveLength(3);
    expect(container.textContent).not.toContain('prefers-reduced-motion');
  });
});
