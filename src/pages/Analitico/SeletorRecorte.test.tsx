// src/pages/Analitico/SeletorRecorte.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeletorRecorte } from './SeletorRecorte';

describe('SeletorRecorte', () => {
  it('esconde o modo Dia de quem não tem a permissão', () => {
    render(
      <SeletorRecorte recorte={{ modo: 'mes', mes: '2026-09' }}
        onMudar={vi.fn()} podeVerDia={false} />,
    );
    expect(screen.queryByRole('button', { name: /Dia/ })).not.toBeInTheDocument();
    // Nome exato: com `role="button"`, /Mês/ tambem casaria com "Mês atual".
    expect(screen.getByRole('button', { name: 'Mês' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicar em Dia troca o recorte', () => {
    const onMudar = vi.fn();
    render(
      <SeletorRecorte recorte={{ modo: 'mes', mes: '2026-09' }}
        onMudar={onMudar} podeVerDia />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Dia/ }));
    expect(onMudar).toHaveBeenCalledWith(
      expect.objectContaining({ modo: 'dia' }),
    );
  });

  it('no modo mês a seta anterior recua um mês', () => {
    const onMudar = vi.fn();
    render(
      <SeletorRecorte recorte={{ modo: 'mes', mes: '2026-09' }}
        onMudar={onMudar} podeVerDia />,
    );
    fireEvent.click(screen.getByLabelText('Anterior'));
    expect(onMudar).toHaveBeenCalledWith({ modo: 'mes', mes: '2026-08' });
  });
});
