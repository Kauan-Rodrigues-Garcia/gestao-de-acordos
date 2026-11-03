/**
 * O jumpscare nunca fica preso na tela (Cleber, 23/10/2026: «tome cuidado
 * para que não seja possível bugar a imagem para alguém»).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'emp-1' } }) }));
vi.mock('@/lib/sinais', () => ({ assinarSinal: () => () => undefined }));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: () => Promise.resolve({ data: null, error: { message: 'sem banco' } }) },
}));

import {
  DURACAO_MAX_MS, DURACAO_MIN_MS, DURACAO_PADRAO_MS, TOLERANCIA_ATRASO_MS,
  dispararTeste, duracaoSegura, momentoDoDisparo,
} from './jumpscare';
import { JumpscareOverlay } from './JumpscareOverlay';

describe('duracaoSegura', () => {
  it('fica sempre dentro da faixa', () => {
    expect(duracaoSegura(300)).toBe(300);
    expect(duracaoSegura(99_999)).toBe(DURACAO_MAX_MS);
    expect(duracaoSegura(-5)).toBe(DURACAO_MIN_MS);
    expect(duracaoSegura('abc')).toBe(DURACAO_PADRAO_MS);
    expect(duracaoSegura(undefined)).toBe(DURACAO_PADRAO_MS);
  });

  it('o teto da tela é o mesmo do CHECK do banco', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../../supabase/migrations/20261023160000_jumpscare.sql'), 'utf8');
    expect(sql).toContain(`duracao_ms BETWEEN ${DURACAO_MIN_MS} AND ${DURACAO_MAX_MS}`);
  });
});

describe('momentoDoDisparo', () => {
  const alvo = '2026-10-23T18:00:00.000Z';
  const ms = new Date(alvo).getTime();

  it('antes da hora, espera o que falta', () => {
    expect(momentoDoDisparo(alvo, ms - 5000)).toEqual({ fase: 'esperar', emMs: 5000 });
  });
  it('na hora, ou um pouco atrasado, dispara', () => {
    expect(momentoDoDisparo(alvo, ms)).toEqual({ fase: 'disparar' });
    expect(momentoDoDisparo(alvo, ms + TOLERANCIA_ATRASO_MS)).toEqual({ fase: 'disparar' });
  });
  it('atrasado demais (aba que acordou depois), não dispara', () => {
    expect(momentoDoDisparo(alvo, ms + TOLERANCIA_ATRASO_MS + 1)).toEqual({ fase: 'perdido' });
    expect(momentoDoDisparo(null, ms)).toEqual({ fase: 'perdido' });
    expect(momentoDoDisparo('lixo', ms)).toEqual({ fase: 'perdido' });
  });
});

describe('JumpscareOverlay', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('aparece no teste e some sozinha na duração', () => {
    render(<JumpscareOverlay />);
    act(() => { dispararTeste('blob:x', 300); });
    const camada = screen.getByTestId('jumpscare');
    expect(camada).toBeInTheDocument();
    expect(camada.className).toContain('pointer-events-none');
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByTestId('jumpscare')).not.toBeInTheDocument();
  });

  it('duração absurda é cortada no teto', () => {
    render(<JumpscareOverlay />);
    act(() => { dispararTeste('blob:x', 60_000); });
    act(() => { vi.advanceTimersByTime(DURACAO_MAX_MS); });
    expect(screen.queryByTestId('jumpscare')).not.toBeInTheDocument();
  });

  it('sair da janela tira a imagem na hora', () => {
    render(<JumpscareOverlay />);
    act(() => { dispararTeste('blob:x', 1000); });
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(screen.queryByTestId('jumpscare')).not.toBeInTheDocument();
  });
});
