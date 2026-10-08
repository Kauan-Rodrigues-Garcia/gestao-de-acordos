/**
 * O cartão «Cafezinho» da pesquisa de experiência (08/10/2026).
 *
 * O que este arquivo trava: a nota grava no toque e a pessoa troca de carinha
 * à vontade; «Tá ok» e «Tô curtindo» agradecem e fecham em 5 s, a menos que a
 * pessoa toque em «Adicionar comentário» — aí só fecha no Enviar; «Ruim» abre
 * o campo na hora; não existe «Agora não»; e a prévia não grava nada.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { votar, comentar } = vi.hoisted(() => ({
  votar: vi.fn(async () => {}),
  comentar: vi.fn(async () => {}),
}));
vi.mock('./pesquisa', async importOriginal => ({
  ...(await importOriginal<typeof import('./pesquisa')>()),
  votarPesquisa: votar,
  comentarPesquisa: comentar,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { CartaoPesquisa } from './CartaoPesquisa';

/** Deixa a fila de gravações andar. */
const esvaziar = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers();
  votar.mockClear();
  comentar.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe('CartaoPesquisa', () => {
  it('cumprimenta pelo primeiro nome e não tem «Agora não»', () => {
    render(<CartaoPesquisa nome="Ana Paula Souza" onFechar={() => {}} />);
    expect(screen.getByText('Oi, Ana!')).toBeTruthy();
    expect(screen.queryByText(/agora não/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Ruim/ })).toBeTruthy();
  });

  it('a nota grava no toque, e trocar de carinha grava de novo, na ordem', async () => {
    render(<CartaoPesquisa nome="Ana" onFechar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Tô curtindo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ruim/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tá ok/ }));
    await esvaziar(); await esvaziar();
    expect(votar.mock.calls.map(c => (c as unknown[])[0])).toEqual(['boa', 'ruim', 'media']);
    expect(screen.getByRole('button', { name: /Tá ok/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('«Tô curtindo» agradece e fecha sozinho em 5 s', async () => {
    const onFechar = vi.fn();
    render(<CartaoPesquisa nome="Ana" onFechar={onFechar} />);
    fireEvent.click(screen.getByRole('button', { name: /Tô curtindo/ }));
    expect(screen.getByText('Que bom, Ana! Valeu demais.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Adicionar comentário/ })).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('Valeu, Ana!')).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(2400); });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(onFechar).toHaveBeenCalled();
    expect(comentar).not.toHaveBeenCalled();
  });

  it('«Adicionar comentário» para o relógio: só fecha no Enviar', async () => {
    const onFechar = vi.fn();
    render(<CartaoPesquisa nome="Ana" onFechar={onFechar} />);
    fireEvent.click(screen.getByRole('button', { name: /Tá ok/ }));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar comentário/ }));
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(onFechar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Comentário (opcional)'), { target: { value: 'O filtro podia lembrar o mês' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar' })); });
    await esvaziar();
    expect(comentar).toHaveBeenCalledWith('O filtro podia lembrar o mês');
    expect(screen.getByText('Prontinho, já foi encaminhado!')).toBeTruthy();
  });

  it('«Ruim» abre o campo na hora; o texto fica ao trocar de carinha', () => {
    render(<CartaoPesquisa nome="Ana" onFechar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ruim/ }));
    const campo = screen.getByLabelText('Comentário (opcional)') as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: 'lento de manhã' } });
    expect(screen.getByRole('button', { name: 'Só a carinha mesmo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tô curtindo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar comentário/ }));
    expect((screen.getByLabelText('Comentário (opcional)') as HTMLTextAreaElement).value).toBe('lento de manhã');
  });

  it('a prévia não grava nada', async () => {
    render(<CartaoPesquisa nome="Ana" previa onFechar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Ruim/ }));
    fireEvent.change(screen.getByLabelText('Comentário (opcional)'), { target: { value: 'teste' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar' })); });
    await esvaziar();
    expect(votar).not.toHaveBeenCalled();
    expect(comentar).not.toHaveBeenCalled();
  });
});
