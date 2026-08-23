/**
 * CartaoTicket.test.tsx
 *
 * O cartão é o que a pessoa varre com o olho quarenta vezes por dia. O que
 * estes casos fixam é o que ele PROMETE mostrar:
 *
 *   • quem está com o ticket — ou o aviso, em cor, de que ninguém está;
 *   • o tempo desde o último movimento, e o ponto quando ele passou do limite;
 *   • a faixa de prioridade que só existe quando quer dizer algo.
 *
 * O ponto de temperatura tem teste próprio porque ele é a única informação da
 * fila que não está escrita em lugar nenhum — se ele sumir num refactor, nada
 * na tela denuncia a perda.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CartaoTicket } from './CartaoTicket';
import type { Ticket } from '@/services/tickets.service';

const AGORA = Date.parse('2026-08-23T12:00:00Z');
const HORA = 60 * 60 * 1000;

function ticket(p: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1', numero: 128, empresaId: 'emp-1', setorId: null,
    abertoPor: 'u1', abertoPorNome: 'Ana Paula',
    categoria: 'erro_sistema', assunto: 'Boleto não gera para o cliente',
    descricao: null, prioridade: 'normal', status: 'aberto',
    responsavelId: null, responsavelNome: null, campos: {},
    criadoEm:     new Date(AGORA - HORA).toISOString(),
    atualizadoEm: new Date(AGORA - HORA).toISOString(),
    fechadoEm: null,
    ...p,
  };
}

function montar(t: Ticket, extra: Partial<Parameters<typeof CartaoTicket>[0]> = {}) {
  const onAbrir = vi.fn();
  const utils = render(
    <CartaoTicket
      ticket={t}
      fotoAutor={null}
      fotoResponsavel={null}
      selecionado={false}
      onAbrir={onAbrir}
      agora={AGORA}
      {...extra}
    />,
  );
  return { ...utils, onAbrir };
}

describe('<CartaoTicket />', () => {
  it('mostra número, assunto, quem abriu e a categoria', () => {
    montar(ticket());
    expect(screen.getByText('#128')).toBeInTheDocument();
    expect(screen.getByText('Boleto não gera para o cliente')).toBeInTheDocument();
    expect(screen.getByText(/Ana Paula/)).toBeInTheDocument();
    expect(screen.getByText(/Erro no sistema/)).toBeInTheDocument();
  });

  it('avisa em cor quando o ticket não tem responsável', () => {
    montar(ticket());
    expect(screen.getByText('Sem responsável')).toBeInTheDocument();
  });

  it('mostra quem está com o ticket quando há responsável', () => {
    montar(ticket({ responsavelId: 'u2', responsavelNome: 'Marcos' }));
    expect(screen.queryByText('Sem responsável')).not.toBeInTheDocument();
    expect(screen.getByText('Marcos')).toBeInTheDocument();
  });

  it('mostra o tempo desde o último movimento', () => {
    montar(ticket({ atualizadoEm: new Date(AGORA - 3 * HORA).toISOString() }));
    expect(screen.getByText('há 3 h')).toBeInTheDocument();
  });

  it('não marca o ponto de temperatura quando o ticket está em dia', () => {
    const { container } = montar(ticket({ atualizadoEm: new Date(AGORA - HORA).toISOString() }));
    expect(container.querySelector('[title*="limite"]')).toBeNull();
  });

  it('marca o ponto quando passou do limite da prioridade', () => {
    const { container } = montar(ticket({
      prioridade: 'urgente',
      atualizadoEm: new Date(AGORA - 5 * HORA).toISOString(),
    }));
    const ponto = container.querySelector('[title*="limite"]');
    expect(ponto).not.toBeNull();
    expect(ponto?.className).toContain('bg-destructive');
  });

  it('a prioridade "normal" não pinta faixa — senão a tela inteira fica listrada', () => {
    const { container } = montar(ticket({ prioridade: 'normal' }));
    expect(container.querySelector('.bg-destructive, .bg-amber-500')).toBeNull();
  });

  it('urgente pinta a faixa e escreve a palavra', () => {
    const { container } = montar(ticket({ prioridade: 'urgente' }));
    expect(container.querySelector('.bg-destructive')).not.toBeNull();
    expect(screen.getByText('Urgente')).toBeInTheDocument();
  });

  it('avisa quem abriu ao clicar', async () => {
    const { onAbrir } = montar(ticket());
    await userEvent.click(screen.getByRole('button'));
    expect(onAbrir).toHaveBeenCalledWith('t1');
  });

  it('no quadro o estado sai do cartão — quem informa é a coluna', () => {
    montar(ticket({ status: 'em_andamento' }), { variante: 'quadro' });
    expect(screen.queryByText('Em andamento')).not.toBeInTheDocument();
    expect(screen.getByText('#128')).toBeInTheDocument();
  });

  it('só é arrastável quando a tela permite mover', () => {
    const { rerender } = montar(ticket());
    expect(screen.getByRole('button')).toHaveAttribute('draggable', 'false');

    rerender(
      <CartaoTicket
        ticket={ticket()} fotoAutor={null} fotoResponsavel={null}
        selecionado={false} onAbrir={vi.fn()} agora={AGORA} arrastavel
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('draggable', 'true');
  });

  it('mostra a empresa só quando a tela pede — quem enxerga as duas filas', () => {
    const { rerender } = montar(ticket());
    expect(screen.queryByText(/PaguePlay/)).not.toBeInTheDocument();

    rerender(
      <CartaoTicket
        ticket={ticket()} fotoAutor={null} fotoResponsavel={null}
        selecionado={false} onAbrir={vi.fn()} agora={AGORA} nomeEmpresa="PaguePlay"
      />,
    );
    expect(screen.getByText(/PaguePlay/)).toBeInTheDocument();
  });
});
