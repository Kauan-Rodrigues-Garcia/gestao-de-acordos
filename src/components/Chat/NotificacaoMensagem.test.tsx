import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificacaoMensagem } from './NotificacaoMensagem';

describe('NotificacaoMensagem', () => {
  it('mostra foto, nome e mensagem e abre a conversa pelo card', async () => {
    const user = userEvent.setup();
    const abrir = vi.fn();
    render(
      <NotificacaoMensagem
        nome="Ana Souza"
        foto="https://exemplo.test/ana.png"
        mensagem="Bom dia, consegue me ajudar?"
        onAbrir={abrir}
        onFechar={vi.fn()}
      />,
    );

    expect(document.querySelector('img')).toHaveAttribute('src', 'https://exemplo.test/ana.png');
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Bom dia, consegue me ajudar?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir conversa com Ana Souza' }));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('fecha sem abrir a conversa', async () => {
    const user = userEvent.setup();
    const abrir = vi.fn();
    const fechar = vi.fn();
    render(
      <NotificacaoMensagem
        nome="Bruno" foto={null} mensagem="Arquivo" onAbrir={abrir} onFechar={fechar}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Fechar notificação do chat' }));
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(abrir).not.toHaveBeenCalled();
  });
});
