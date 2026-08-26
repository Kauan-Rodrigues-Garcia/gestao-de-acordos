import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusMensagem } from './StatusMensagem';
import { estadoMensagem } from './estadoMensagem';

describe('StatusMensagem', () => {
  it('separa enviada, entregue e visualizada pelos cortes persistidos', () => {
    const criada = '2026-08-26T10:00:00Z';

    expect(estadoMensagem(criada, null, null)).toBe('enviada');
    expect(estadoMensagem(criada, '2026-08-26T10:00:01Z', null)).toBe('entregue');
    expect(estadoMensagem(
      criada, '2026-08-26T10:00:01Z', '2026-08-26T10:00:02Z',
    )).toBe('lida');
  });

  it('destaca visualizada em âmbar, inclusive no balão colorido', () => {
    render(<StatusMensagem estado="lida" noBalao />);

    expect(screen.getByRole('img', { name: 'Visualizada' }))
      .toHaveClass('text-amber-300');
  });
});
