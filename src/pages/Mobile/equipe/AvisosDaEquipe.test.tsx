/** As chaves dos avisos da equipe (migration 20260930195304). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const estado = { valor: 'ativo' as string };
const definir = vi.fn();
const prefs = {
  disponivel: true,
  preferencias: { fixo: false, resumo_equipe: false, metas_operadores: false, meta_equipe: false } as
    { fixo: boolean; resumo_equipe: boolean; metas_operadores: boolean; meta_equipe: boolean } | null,
};

vi.mock('../useAvisos', () => ({
  useAvisos: () => ({ estado: estado.valor, ocupado: false, ativar: vi.fn(), desativar: vi.fn() }),
}));
vi.mock('./usePreferenciasEquipe', () => ({
  usePreferenciasEquipe: () => ({ ...prefs, salvando: false, definir }),
}));

import { AvisosDaEquipe } from './AvisosDaEquipe';

beforeEach(() => {
  definir.mockReset();
  estado.valor = 'ativo';
  prefs.disponivel = true;
  prefs.preferencias = { fixo: false, resumo_equipe: false, metas_operadores: false, meta_equipe: false };
});

describe('AvisosDaEquipe', () => {
  it('elite: três chaves, desligadas, cada uma liga à parte', () => {
    render(<AvisosDaEquipe empresaId="e" />);
    const chaves = screen.getAllByRole('switch');
    expect(chaves).toHaveLength(3);
    for (const c of chaves) expect((c as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('switch', { name: /Metas alcançadas pelos operadores/ }));
    expect(definir).toHaveBeenCalledWith('metas_operadores', true);
    fireEvent.click(screen.getByRole('switch', { name: /Equipe alcançou a meta/ }));
    expect(definir).toHaveBeenCalledWith('meta_equipe', true);
  });

  it('elite com o resumo ligado: desliga só ele', () => {
    prefs.preferencias = { fixo: false, resumo_equipe: true, metas_operadores: false, meta_equipe: false };
    render(<AvisosDaEquipe empresaId="e" />);
    fireEvent.click(screen.getByRole('switch', { name: /Resumo da equipe a cada hora/ }));
    expect(definir).toHaveBeenCalledWith('resumo_equipe', false);
  });

  it('líder: sem chaves, os três «sempre avisa»', () => {
    prefs.preferencias = { fixo: true, resumo_equipe: true, metas_operadores: true, meta_equipe: true };
    render(<AvisosDaEquipe empresaId="e" />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getAllByText('sempre avisa')).toHaveLength(3);
  });

  it('sem avisos no aparelho: oferece ativar, sem chaves', () => {
    estado.valor = 'inativo';
    render(<AvisosDaEquipe empresaId="e" />);
    expect(screen.getByRole('button', { name: 'Ativar avisos' })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('banco sem a migration: não promete aviso da equipe; desativar segue', () => {
    prefs.disponivel = false;
    prefs.preferencias = null;
    render(<AvisosDaEquipe empresaId="e" />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('sempre avisa')).toBeNull();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeTruthy();
  });

  it('recurso desligado no build: nada', () => {
    estado.valor = 'desligado';
    const { container } = render(<AvisosDaEquipe empresaId="e" />);
    expect(container.textContent).toBe('');
  });
});
