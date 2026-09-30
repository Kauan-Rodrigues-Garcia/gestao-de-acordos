/** A chave do resumo por hora na visão Equipe (migration 20260930192744). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const estado = { valor: 'ativo' as string };
const definir = vi.fn();
const resumo = { disponivel: true, ligado: false };

vi.mock('../useAvisos', () => ({
  useAvisos: () => ({ estado: estado.valor, ocupado: false, ativar: vi.fn(), desativar: vi.fn() }),
}));
vi.mock('./useResumoEquipe', () => ({
  useResumoEquipe: () => ({ ...resumo, salvando: false, definir }),
}));

import { AvisosDaEquipe } from './AvisosDaEquipe';

beforeEach(() => { definir.mockReset(); estado.valor = 'ativo'; resumo.disponivel = true; resumo.ligado = false; });

describe('AvisosDaEquipe', () => {
  it('com avisos ativos: a chave do resumo, desligada por padrão para o elite, e liga no toque', () => {
    render(<AvisosDaEquipe empresaId="e" />);
    const chave = screen.getByRole('switch', { name: /Resumo da equipe a cada hora/ });
    expect((chave as HTMLInputElement).checked).toBe(false);
    fireEvent.click(chave);
    expect(definir).toHaveBeenCalledWith(true);
    expect(screen.getByText('Equipe bateu a meta')).toBeTruthy();
  });

  it('líder (padrão ligado) desliga', () => {
    resumo.ligado = true;
    render(<AvisosDaEquipe empresaId="e" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(definir).toHaveBeenCalledWith(false);
  });

  it('sem avisos no aparelho: oferece ativar, sem a chave', () => {
    estado.valor = 'inativo';
    render(<AvisosDaEquipe empresaId="e" />);
    expect(screen.getByRole('button', { name: 'Ativar avisos' })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('banco sem a migration: não promete aviso da equipe; desativar segue', () => {
    resumo.disponivel = false;
    render(<AvisosDaEquipe empresaId="e" />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Equipe bateu a meta')).toBeNull();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeTruthy();
  });

  it('recurso desligado no build: nada', () => {
    estado.valor = 'desligado';
    const { container } = render(<AvisosDaEquipe empresaId="e" />);
    expect(container.textContent).toBe('');
  });
});
