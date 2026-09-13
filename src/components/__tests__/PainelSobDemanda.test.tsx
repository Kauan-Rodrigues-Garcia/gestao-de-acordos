/**
 * PainelSobDemanda — a casca dos painéis que saíram do pacote de entrada.
 *
 * Quatro garantias: não baixa antes de alguém abrir; abre; FICA montado depois
 * de fechar (senão a animação de saída some); e um download que falha avisa em
 * vez de derrubar a tela.
 */
import { lazy, useState } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastErro } = vi.hoisted(() => ({ toastErro: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastErro } }));

import { PainelSobDemanda } from '../PainelSobDemanda';

function PainelDeVerdade({ aberto }: { aberto: boolean }) {
  return <div data-testid="painel" data-aberto={String(aberto)}>painel</div>;
}

function montar(carregar: () => Promise<{ default: typeof PainelDeVerdade }>) {
  const Painel = lazy(carregar);
  function Tela() {
    const [aberto, setAberto] = useState(false);
    return (
      <>
        <button onClick={() => setAberto(a => !a)}>alternar</button>
        <p>resto da tela</p>
        <PainelSobDemanda aberto={aberto} nome="Comissão">
          <Painel aberto={aberto} />
        </PainelSobDemanda>
      </>
    );
  }
  return render(<Tela />);
}

beforeEach(() => {
  toastErro.mockClear();
});

describe('PainelSobDemanda', () => {
  it('não baixa o painel antes da primeira abertura', async () => {
    const carregar = vi.fn(async () => ({ default: PainelDeVerdade }));
    montar(carregar);
    await act(async () => {});
    expect(carregar).not.toHaveBeenCalled();
    expect(screen.queryByTestId('painel')).toBeNull();
  });

  it('abre ao clicar e continua montado depois de fechar', async () => {
    const carregar = vi.fn(async () => ({ default: PainelDeVerdade }));
    montar(carregar);

    fireEvent.click(screen.getByText('alternar'));
    const painel = await screen.findByTestId('painel');
    expect(painel.dataset.aberto).toBe('true');

    fireEvent.click(screen.getByText('alternar'));
    // Montado, recebendo `aberto=false`: é o painel quem anima a saída.
    expect(screen.getByTestId('painel').dataset.aberto).toBe('false');
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it('download que falha avisa com toast e o resto da tela continua de pé', async () => {
    const erroConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    montar(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));

    fireEvent.click(screen.getByText('alternar'));
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });

    expect(toastErro).toHaveBeenCalledTimes(1);
    expect(toastErro.mock.calls[0][0]).toContain('Comissão');
    expect(screen.getByText('resto da tela')).toBeInTheDocument();
    expect(screen.queryByText(/Algo deu errado/)).toBeNull();
    erroConsole.mockRestore();
  });

  it('onFalha é chamado uma vez, mesmo com quem o passa re-renderizando', async () => {
    const erroConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Painel = lazy(() => Promise.reject(new Error('offline')));
    const onFalha = vi.fn();
    function Tela() {
      const [n, setN] = useState(0);
      return (
        <>
          <button onClick={() => setN(v => v + 1)}>renderizar {n}</button>
          {/* Arrow nova a cada render, como na BolhaChat. */}
          <PainelSobDemanda aberto nome="Chat" onFalha={() => onFalha()}>
            <Painel />
          </PainelSobDemanda>
        </>
      );
    }
    render(<Tela />);
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    fireEvent.click(screen.getByText(/renderizar/));
    fireEvent.click(screen.getByText(/renderizar/));

    expect(onFalha).toHaveBeenCalledTimes(1);
    expect(toastErro).toHaveBeenCalledTimes(1);
    erroConsole.mockRestore();
  });
});
