/**
 * Os dias úteis da pessoa na aba Metas (09/11/2026): seguir o setor ou
 * escolher os dias, com o atalho «começou em».
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DialogDiasDaPessoa } from './DialogDiasDaPessoa';

// Novembro/2026 com 02/11 e 20/11 de feriado: 19 dias úteis no setor.
const FERIADOS = ['2026-11-02', '2026-11-20'];

function montar(extra: Partial<Parameters<typeof DialogDiasDaPessoa>[0]> = {}) {
  const onSalvar = vi.fn().mockResolvedValue(true);
  const onFechar = vi.fn();
  render(
    <DialogDiasDaPessoa aberto nome="Ana" mes="2026-11" feriadosDoSetor={FERIADOS}
      diasAtuais={null} onSalvar={onSalvar} onFechar={onFechar} {...extra} />,
  );
  return { onSalvar, onFechar };
}

describe('DialogDiasDaPessoa', () => {
  it('nasce seguindo o setor, e salvar assim grava null', async () => {
    const { onSalvar } = montar();
    expect(screen.getByRole('radio', { name: /Segue os dias úteis do setor/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/19 dias úteis no mês/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith(null));
  });

  it('personalizado: «começou em» 16/11 marca só os dias úteis do setor dali em diante', async () => {
    const { onSalvar } = montar();
    fireEvent.click(screen.getByRole('radio', { name: /Dias úteis personalizados/ }));
    fireEvent.change(screen.getByLabelText('Começou em'), { target: { value: '2026-11-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    // O feriado do setor (20/11) não é dia que se escolha.
    expect((screen.getByRole('button', { name: /Dia 20,/ }) as HTMLButtonElement).disabled).toBe(true);
    // Tira o dia 30 com um clique.
    fireEvent.click(screen.getByRole('button', { name: 'Dia 30, trabalha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSalvar).toHaveBeenCalledWith([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19',
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
    ]));
  });

  it('abre com os dias gravados e não deixa salvar sem nenhum dia', () => {
    montar({ diasAtuais: ['2026-11-30'] });
    expect(screen.getByRole('radio', { name: /Dias úteis personalizados/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Dia 30, trabalha' }));
    expect(screen.getByText('Escolha pelo menos um dia.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('somente leitura: sem Salvar', () => {
    montar({ somenteLeitura: true });
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });
});
