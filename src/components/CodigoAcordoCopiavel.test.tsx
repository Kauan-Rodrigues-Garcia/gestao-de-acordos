/**
 * CodigoAcordoCopiavel.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O que estes testes protegem:
 *   • o clique copia o código — era o que a PaguePlay não fazia;
 *   • o rótulo do tenant vai no toast (NR na Bookplay, Código na PaguePlay);
 *   • `stopPropagation`: a linha da tabela abre o detalhe no clique, então
 *     copiar não pode abrir o acordo junto;
 *   • acordo sem código continua mostrando o traço, não um botão vazio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ copiarTexto: vi.fn(() => Promise.resolve(true)) }));

vi.mock('@/lib/clipboard', () => ({ copiarTexto: mocks.copiarTexto }));

import { CodigoAcordoCopiavel } from './CodigoAcordoCopiavel';

beforeEach(() => { mocks.copiarTexto.mockClear(); });

describe('CodigoAcordoCopiavel', () => {
  it('copia o código ao clicar', () => {
    render(<CodigoAcordoCopiavel codigo="A-1234" label="Código" />);
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.copiarTexto).toHaveBeenCalledWith(
      'A-1234', 'Código copiado', 'Não foi possível copiar o Código.',
    );
  });

  it('usa o rótulo NR na Bookplay', () => {
    render(<CodigoAcordoCopiavel codigo="99887" label="NR" />);
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.copiarTexto).toHaveBeenCalledWith(
      '99887', 'NR copiado', 'Não foi possível copiar o NR.',
    );
  });

  it('copia sem os espaços das pontas', () => {
    render(<CodigoAcordoCopiavel codigo="  777  " label="Código" />);
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.copiarTexto.mock.calls[0][0]).toBe('777');
  });

  it('não deixa o clique subir para a linha da tabela', () => {
    const aoClicarNaLinha = vi.fn();
    render(
      <div onClick={aoClicarNaLinha}>
        <CodigoAcordoCopiavel codigo="A-1" label="Código" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(mocks.copiarTexto).toHaveBeenCalled();
    expect(aoClicarNaLinha).not.toHaveBeenCalled();
  });

  it('sem código, mostra o traço e nenhum botão', () => {
    const { rerender } = render(<CodigoAcordoCopiavel codigo={null} label="Código" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();

    // String vazia e só-espaços caem no mesmo lugar: um botão que copia nada
    // seria pior que o traço.
    rerender(<CodigoAcordoCopiavel codigo="   " label="Código" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
