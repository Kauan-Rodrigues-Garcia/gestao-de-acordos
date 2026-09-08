import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { desafioFixture } from '@/test/fixtures/desafio';
import { DesafioMenu } from './index';

describe('DesafioMenu', () => {
  it('mantém apenas a mídia recolhida e acrescenta só Desafios ao expandir', () => {
    const onToggle = vi.fn();
    const { container, rerender } = render(<DesafioMenu desafio={desafioFixture} expandido={false} aberto={false} onToggle={onToggle} />);
    const imagem = container.querySelector('img')!;
    expect(imagem).toHaveAttribute('width', '40');
    expect(imagem).toHaveAttribute('height', '40');
    expect(screen.queryByText('Desafios')).not.toBeInTheDocument();
    expect(screen.queryByText(desafioFixture.nome)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desafios' }));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<DesafioMenu desafio={desafioFixture} expandido aberto onToggle={onToggle} />);
    expect(screen.getByText('Desafios')).toBeInTheDocument();
    expect(screen.queryByText(desafioFixture.nome)).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBe(imagem);
    expect(imagem).toHaveAttribute('width', '40');
    expect(screen.getByRole('button', { name: 'Desafios' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('continua acessível sem mídia cadastrada', () => {
    const { container } = render(<DesafioMenu desafio={{ ...desafioFixture, midiaUrl: null }} expandido={false} aberto={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Desafios' })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
