/**
 * O aviso da votação de opções MONTA e se comporta como combinado? — banco simulado.
 *
 *   - votação aberta e não votei → a tela abre sozinha, UMA vez por sessão;
 *   - «Votar mais tarde» → fica a pílula no pé; tocar nela reabre;
 *   - escolher + confirmar → vai ao banco com a opção certa, «Voto registrado!»,
 *     e a pílula some;
 *   - já votei, ou não participo → nada;
 *   - banco sem a migration → nada, e não pergunta de novo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VOTACAO_DEZEMBRO } from './opcoes';
import type { MinhaVotacaoOpcoes } from './banco';

vi.mock('framer-motion', () => {
  const limpar = (p: Record<string, unknown>) => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) if (!['initial', 'animate', 'exit', 'transition', 'layout'].includes(k)) r[k] = v;
    return r;
  };
  return {
    motion: new Proxy({}, {
      get: (_, tag: string) => ({ children, ...p }: { children?: React.ReactNode }) => {
        const Tag = tag as unknown as React.ElementType;
        return <Tag {...limpar(p)}>{children}</Tag>;
      },
    }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu', perfil: 'operador' } }) }));

const banco = vi.hoisted(() => ({ minhas: vi.fn(), votar: vi.fn() }));
vi.mock('./banco', async importOriginal => ({
  ...(await importOriginal<typeof import('./banco')>()),
  lerMinhas: banco.minhas,
  lerResultados: async () => [],
  votar: banco.votar,
}));

const { AvisoVotacaoOpcoes } = await import('./AvisoVotacaoOpcoes');
const { ErroDoBanco } = await import('@/components/VotacaoLideres/banco');

const aberta = (meu_voto: string | null = null): MinhaVotacaoOpcoes => ({
  id: 'v1', titulo: VOTACAO_DEZEMBRO.titulo, pergunta: VOTACAO_DEZEMBRO.pergunta,
  opcoes: VOTACAO_DEZEMBRO.opcoes, meu_voto, votado_em: meu_voto ? '2026-11-16T12:00:00Z' : null,
});
const pergunta = () => screen.queryByRole('heading', { level: 1, name: /o que você prefere/ });
const pilula = () => screen.queryByRole('button', { name: /Votação de dezembro\s*Votar/ });

describe('AvisoVotacaoOpcoes', () => {
  beforeEach(() => {
    sessionStorage.clear();
    banco.minhas.mockReset();
    banco.votar.mockReset();
  });

  it('abre sozinha com as duas opções e os detalhes', async () => {
    banco.minhas.mockResolvedValue([aberta()]);
    render(<AvisoVotacaoOpcoes />);
    await waitFor(() => expect(pergunta()).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Sorteio de prêmios' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Happy hour no Ibis' })).toBeInTheDocument();
    expect(screen.getByText('Participa quem fechar acima de 80% da projeção')).toBeInTheDocument();
    expect(screen.getByText('Air Fryer')).toBeInTheDocument();
    expect(screen.getByText('Dia 04/12, depois das 17h30')).toBeInTheDocument();
    // Confirmar só depois de escolher.
    expect(screen.getByRole('button', { name: /Confirmar voto/ })).toBeDisabled();
  });

  it('«Votar mais tarde» deixa a pílula; a pílula reabre; na mesma sessão não abre sozinha de novo', async () => {
    banco.minhas.mockResolvedValue([aberta()]);
    const { unmount } = render(<AvisoVotacaoOpcoes />);
    await waitFor(() => expect(pergunta()).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Votar mais tarde|Depois/ }));
    expect(pergunta()).not.toBeInTheDocument();
    expect(pilula()).toBeInTheDocument();
    unmount();

    // Outra tela da mesma sessão: só a pílula.
    render(<AvisoVotacaoOpcoes />);
    await waitFor(() => expect(pilula()).toBeInTheDocument());
    expect(pergunta()).not.toBeInTheDocument();
    fireEvent.click(pilula()!);
    expect(pergunta()).toBeInTheDocument();
  });

  it('escolher e confirmar grava a opção, mostra «Voto registrado!» e a pílula some', async () => {
    banco.minhas.mockResolvedValue([aberta()]);
    banco.votar.mockResolvedValue(undefined);
    render(<AvisoVotacaoOpcoes />);
    await waitFor(() => expect(pergunta()).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Quero esta' })[1]);
    expect(screen.getByText(/Você escolheu/)).toHaveTextContent('Happy hour no Ibis');
    fireEvent.click(screen.getByRole('button', { name: /Confirmar voto/ }));
    await waitFor(() => expect(screen.getByText('Voto registrado!')).toBeInTheDocument());
    expect(banco.votar).toHaveBeenCalledWith('v1', 'happy_hour');
    // Depois de votar não dá para trocar.
    expect(screen.queryByRole('button', { name: /Confirmar voto/ })).not.toBeInTheDocument();
    for (const b of screen.getAllByRole('button', { name: /Escolher / })) expect(b).toBeDisabled();

    banco.minhas.mockResolvedValue([aberta('happy_hour')]);
    fireEvent.click(screen.getAllByRole('button', { name: /Fechar/ })[0]);
    expect(pergunta()).not.toBeInTheDocument();
    expect(pilula()).not.toBeInTheDocument();
  });

  it('erro do banco ao votar aparece e deixa tentar de novo', async () => {
    banco.minhas.mockResolvedValue([aberta()]);
    banco.votar.mockRejectedValueOnce(new ErroDoBanco('Esta votação não está aberta.', '22023'));
    render(<AvisoVotacaoOpcoes />);
    await waitFor(() => expect(pergunta()).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: 'Quero esta' })[0]);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar voto/ }));
    await waitFor(() => expect(screen.getByText('Esta votação não está aberta.')).toBeInTheDocument());
    expect(screen.queryByText('Voto registrado!')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmar voto/ })).toBeEnabled();
  });

  it('já votei, ou não participo: nada aparece', async () => {
    banco.minhas.mockResolvedValue([aberta('premios')]);
    const { unmount } = render(<AvisoVotacaoOpcoes />);
    await waitFor(() => expect(banco.minhas).toHaveBeenCalled());
    expect(pergunta()).not.toBeInTheDocument();
    expect(pilula()).not.toBeInTheDocument();
    unmount();

    banco.minhas.mockResolvedValue([]);
    render(<AvisoVotacaoOpcoes />);
    await waitFor(() => expect(banco.minhas).toHaveBeenCalledTimes(2));
    expect(pergunta()).not.toBeInTheDocument();
    expect(pilula()).not.toBeInTheDocument();
  });

  it('banco sem a migration: nada aparece', async () => {
    banco.minhas.mockRejectedValue(new ErroDoBanco('Could not find the function public.fn_votacao_opcoes_minhas', 'PGRST202'));
    render(<AvisoVotacaoOpcoes />);
    await waitFor(() => expect(banco.minhas).toHaveBeenCalledTimes(1));
    expect(pergunta()).not.toBeInTheDocument();
    expect(pilula()).not.toBeInTheDocument();
  });
});
