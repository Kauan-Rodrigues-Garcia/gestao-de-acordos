/**
 * A FaixaDiasUteis só desenha — quem calcula é `usePainelMetas`, e os casos de
 * CALENDÁRIO (feriado em dia útil, feriado no fim de semana, mês fechado,
 * equipe em treinamento) estão testados lá e em `lib/__tests__/diasUteis.test.ts`.
 *
 * Aqui a pergunta é outra: os três números chegam à tela nos lugares certos?
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FaixaDiasUteis } from './FaixaDiasUteis';

function rotuloDoNumero(texto: string): string {
  // O rótulo é o irmão imediato do número dentro do mesmo item.
  const numero = screen.getByText(texto);
  return numero.parentElement?.textContent?.replace(texto, '').trim() ?? '';
}

describe('FaixaDiasUteis', () => {
  it('mostra os três números com os rótulos certos', () => {
    render(<FaixaDiasUteis passados={6} restantes={15} total={21} />);
    expect(rotuloDoNumero('6')).toBe('dias úteis passados');
    expect(rotuloDoNumero('15')).toBe('restantes');
    expect(rotuloDoNumero('21')).toBe('no mês');
  });

  it('mês fechado: tudo passado, nada restante', () => {
    render(<FaixaDiasUteis passados={23} restantes={0} total={23} />);
    expect(rotuloDoNumero('0')).toBe('restantes');
    expect(screen.getAllByText('23')).toHaveLength(2);
  });

  it('início do mês: nenhum dia decorrido', () => {
    render(<FaixaDiasUteis passados={0} restantes={21} total={21} />);
    expect(rotuloDoNumero('0')).toBe('dias úteis passados');
  });

  it('mês sem dia útil nenhum não divide por zero', () => {
    const { container } = render(<FaixaDiasUteis passados={0} restantes={0} total={0} />);
    expect(container.querySelector('[style*="width: 0%"]')).toBeTruthy();
  });
});
