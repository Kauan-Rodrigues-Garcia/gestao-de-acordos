/**
 * useEstadoLembrado.test.tsx — a escolha de quem olha sobrevive à navegação.
 *
 * Os dois casos que importam são os dois defeitos que este hook nasceu para não
 * ter: perder o valor ao desmontar (a queixa) e ler da chave errada enquanto
 * empresa e perfil ainda não chegaram (o jeito silencioso de perder o valor
 * mesmo tendo guardado).
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEstadoLembrado } from '../useEstadoLembrado';
import { __resetCacheParaTestes, gravarInstantaneo } from '@/lib/cacheInstantaneo';

function Contador({ chave }: { chave: string }) {
  const [n, setN] = useEstadoLembrado(chave, 0);
  return (
    <button onClick={() => setN(v => v + 1)}>
      valor: {n}
    </button>
  );
}

describe('useEstadoLembrado', () => {
  beforeEach(() => { __resetCacheParaTestes(); });

  it('devolve o valor inicial quando não há nada guardado', () => {
    render(<Contador chave="c1" />);
    expect(screen.getByRole('button')).toHaveTextContent('valor: 0');
  });

  it('o valor volta depois de desmontar e montar de novo', async () => {
    const user = userEvent.setup();
    const tela = render(<Contador chave="c2" />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('valor: 2');

    // Sair da aba e voltar: é a navegação do sistema, e era exatamente aqui que
    // a busca digitada e o painel aberto se perdiam.
    tela.unmount();
    render(<Contador chave="c2" />);
    expect(screen.getByRole('button')).toHaveTextContent('valor: 2');
  });

  it('uma chave não enxerga o valor da outra', async () => {
    const user = userEvent.setup();
    const tela = render(<Contador chave="empresa-a" />);
    await user.click(screen.getByRole('button'));
    tela.unmount();

    render(<Contador chave="empresa-b" />);
    expect(screen.getByRole('button')).toHaveTextContent('valor: 0');
  });

  it('relê quando a chave chega depois — empresa e perfil demoram um render', () => {
    // O valor já está guardado sob a chave definitiva.
    gravarInstantaneo('pix|empresa-1|ana', 7);

    // A tela monta com a chave provisória, do render em que `empresa` é
    // `undefined`. Sem a releitura, o estado ficaria preso no zero lido dela e
    // o «lembrado» abriria vazio para sempre.
    const tela = render(<Contador chave="pix|-|-" />);
    expect(screen.getByRole('button')).toHaveTextContent('valor: 0');

    act(() => { tela.rerender(<Contador chave="pix|empresa-1|ana" />); });
    expect(screen.getByRole('button')).toHaveTextContent('valor: 7');
  });
});
