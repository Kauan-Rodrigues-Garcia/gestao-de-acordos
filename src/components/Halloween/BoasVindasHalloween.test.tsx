/**
 * BoasVindasHalloween — a contagem do botão e a trilha que nasce e morre com a
 * mensagem.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const trilhaFalsa = vi.hoisted(() => ({
  tocar: vi.fn(),
  parar: vi.fn(),
  alternarSom: vi.fn(),
  aoMudar: null as null | ((e: string) => void),
}));

vi.mock('./trilha', () => ({
  tocarTrilhaHalloween: (aoMudar: (e: string) => void) => {
    trilhaFalsa.tocar();
    trilhaFalsa.aoMudar = aoMudar;
    return { estado: 'carregando', parar: trilhaFalsa.parar, alternarSom: trilhaFalsa.alternarSom };
  },
}));

import BoasVindasHalloween, { ESPERA_MINIMA_MS } from './BoasVindasHalloween';

const botaoEntrar = () => screen.getByRole('button', { name: /Entrar no Halloween|Preparando/ });

beforeEach(() => {
  vi.useFakeTimers();
  trilhaFalsa.tocar.mockClear();
  trilhaFalsa.parar.mockClear();
  trilhaFalsa.alternarSom.mockClear();
  trilhaFalsa.aoMudar = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BoasVindasHalloween', () => {
  it('o botão fica parado 3 segundos, com a contagem, mesmo com o tema pronto', async () => {
    const aoFechar = vi.fn();
    render(<BoasVindasHalloween abrirDireto nome="Ana Souza" preparar={() => Promise.resolve()} aoFechar={aoFechar} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(botaoEntrar()).toBeDisabled();
    expect(botaoEntrar()).toHaveTextContent('Entrar no Halloween em 3…');

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(botaoEntrar()).toHaveTextContent('em 2…');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(botaoEntrar()).toHaveTextContent('em 1…');

    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(botaoEntrar());
    expect(aoFechar).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(botaoEntrar()).toBeEnabled();
    expect(botaoEntrar()).toHaveTextContent('Entrar no Halloween 🎃');
    fireEvent.click(botaoEntrar());
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it('passados os 3 segundos, ainda espera o tema (até o teto)', async () => {
    render(<BoasVindasHalloween abrirDireto nome={null} preparar={() => new Promise(() => {})} aoFechar={() => {}} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(ESPERA_MINIMA_MS); });
    expect(botaoEntrar()).toBeDisabled();
    expect(botaoEntrar()).toHaveTextContent('Preparando as teias…');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(botaoEntrar()).toBeEnabled();
  });

  it('a música começa com a mensagem e para quando ela sai', () => {
    const { unmount } = render(
      <BoasVindasHalloween abrirDireto nome="Ana" preparar={() => Promise.resolve()} aoFechar={() => {}} />,
    );
    expect(trilhaFalsa.tocar).toHaveBeenCalledTimes(1);
    expect(trilhaFalsa.parar).not.toHaveBeenCalled();
    unmount();
    expect(trilhaFalsa.parar).toHaveBeenCalledTimes(1);
  });

  it('o alto-falante só aparece com música e alterna o som', () => {
    render(<BoasVindasHalloween abrirDireto nome="Ana" preparar={() => Promise.resolve()} aoFechar={() => {}} />);
    expect(screen.queryByRole('button', { name: /música/ })).toBeNull();

    act(() => trilhaFalsa.aoMudar?.('tocando'));
    fireEvent.click(screen.getByRole('button', { name: 'Desligar a música' }));
    expect(trilhaFalsa.alternarSom).toHaveBeenCalledTimes(1);

    act(() => trilhaFalsa.aoMudar?.('muda'));
    expect(screen.getByRole('button', { name: 'Ligar a música' })).toBeInTheDocument();

    act(() => trilhaFalsa.aoMudar?.('indisponivel'));
    expect(screen.queryByRole('button', { name: /música/ })).toBeNull();
  });
});

describe('BoasVindasHalloween — chega fechada', () => {
  const envelope = () => screen.queryByRole('dialog', { name: 'Você tem uma mensagem' });
  const carta = () => screen.queryByRole('dialog', { name: /Obrigado/ });

  it('mostra só o envelope, no meio da tela, sem carta e sem música', () => {
    render(<BoasVindasHalloween nome="Ana" preparar={() => Promise.resolve()} aoFechar={() => {}} />);
    expect(envelope()).toBeInTheDocument();
    expect(envelope()).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Ler agora' })).toHaveFocus();
    expect(carta()).toBeNull();
    expect(trilhaFalsa.tocar).not.toHaveBeenCalled();
  });

  it('é obrigatória: Esc não fecha o envelope', () => {
    const aoFechar = vi.fn();
    render(<BoasVindasHalloween nome="Ana" preparar={() => Promise.resolve()} aoFechar={aoFechar} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(aoFechar).not.toHaveBeenCalled();
    expect(envelope()).toBeInTheDocument();
  });

  it('«Ler agora» abre a carta, avisa o Layout (solta o tema) e só então a música começa', async () => {
    const aoAbrirCarta = vi.fn();
    const preparar = vi.fn(() => Promise.resolve());
    render(<BoasVindasHalloween nome="Ana" preparar={preparar} aoFechar={() => {}} aoAbrirCarta={aoAbrirCarta} />);
    expect(preparar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ler agora' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(aoAbrirCarta).toHaveBeenCalledTimes(1);
    expect(carta()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ler agora' })).toBeNull();
    expect(trilhaFalsa.tocar).toHaveBeenCalledTimes(1);
    // O tema começa a carregar junto com a carta, não antes.
    expect(preparar).toHaveBeenCalledTimes(1);
  });
});
