/**
 * SeletorUnidade.test.tsx
 *
 * O alternador é o único jeito de a PaguePlay ver o bruto depois desta mudança,
 * então "qual botão está marcado" precisa ser lido por acessibilidade, não só
 * por cor de fundo.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeletorUnidade } from './SeletorUnidade';

describe('<SeletorUnidade />', () => {
  it('oferece as duas unidades', () => {
    render(<SeletorUnidade valor="ho" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'H.O.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bruto' })).toBeInTheDocument();
  });

  it('marca a unidade ativa com aria-pressed', () => {
    render(<SeletorUnidade valor="ho" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'H.O.' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bruto' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('avisa a troca ao clicar na outra unidade', async () => {
    const onChange = vi.fn();
    render(<SeletorUnidade valor="ho" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bruto' }));
    expect(onChange).toHaveBeenCalledWith('bruto');
  });

  it('clicar na unidade já ativa não é erro — avisa o mesmo valor', async () => {
    const onChange = vi.fn();
    render(<SeletorUnidade valor="bruto" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bruto' }));
    expect(onChange).toHaveBeenCalledWith('bruto');
  });

  it('explica o que cada unidade significa', () => {
    render(<SeletorUnidade valor="ho" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'H.O.' }))
      .toHaveAttribute('title', expect.stringContaining('24,96%'));
  });
});
