/**
 * O formulário do evento: um modelo só de banco de horas, com o horário
 * configurado logo abaixo — e o que vai para a casa do dia.
 */
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormEvento } from './FormEvento';
import { RASCUNHO_VAZIO, detalheDoRascunho, type RascunhoEvento } from './rascunho';

let ultimo: RascunhoEvento = RASCUNHO_VAZIO;

function Controlado({ inicial = RASCUNHO_VAZIO }: { inicial?: RascunhoEvento }) {
  const [r, setR] = useState(inicial);
  ultimo = r;
  return <FormEvento valor={r} onChange={setR} pessoas={[]} notaFeriado="Feriado vem de Usuários → Metas." />;
}

describe('FormEvento', () => {
  it('um botão só de banco de horas, sem ponto facultativo nem expediente especial', () => {
    render(<Controlado />);
    expect(screen.getAllByRole('button', { name: /Banco de horas/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Ponto facultativo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Expediente especial/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Feriado$/ })).toBeNull();
  });

  it('configura a duração e mostra como fica na casa do dia', () => {
    render(<Controlado />);
    expect(detalheDoRascunho(ultimo)).toBe('01 hora');
    fireEvent.click(screen.getByRole('button', { name: 'Mais meia hora' }));
    expect(detalheDoRascunho(ultimo)).toBe('01h30');
    fireEvent.click(screen.getByRole('button', { name: '2h' }));
    expect(detalheDoRascunho(ultimo)).toBe('02 horas');
    expect(screen.getByText(/Na casa do dia/).textContent).toContain('Banco de horas · 02 horas');
  });

  it('troca para «das … às …» e «até às …»', () => {
    render(<Controlado />);
    fireEvent.click(screen.getByRole('radio', { name: 'Das … às …' }));
    fireEvent.change(screen.getByLabelText('Início do banco de horas'), { target: { value: '09:00' } });
    expect(detalheDoRascunho(ultimo)).toBe('09:00 às 12:00');
    fireEvent.click(screen.getByRole('radio', { name: 'Até às …' }));
    expect(detalheDoRascunho(ultimo)).toBe('até às 12:00');
  });

  it('outro modelo esconde o horário do banco', () => {
    render(<Controlado />);
    fireEvent.click(screen.getByRole('button', { name: /Reunião do setor/ }));
    expect(screen.queryByText('Horário do banco')).toBeNull();
    expect(ultimo.banco).toBeNull();
    expect(screen.getByLabelText(/Horário ou detalhe/)).toBeInTheDocument();
  });
});
