/**
 * A configuração MONTA e libera para quem foi escolhido? — sem banco.
 * Marcar setor → operadores dele; tirar uma equipe; incluir alguém à mão;
 * «Liberar» manda o texto limpo e a lista certa.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { GrupoDaVotacao, Participante } from '@/components/VotacaoLideres/participantes';
import type { DadosParaLiberar } from './banco';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag: string) => ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...p }: Record<string, unknown> & { children?: React.ReactNode }) => {
      const Tag = tag as unknown as React.ElementType;
      return <Tag {...p}>{children}</Tag>;
    },
  }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { MontarVotacaoOpcoes } = await import('./MontarVotacaoOpcoes');

const p = (id: string, nome: string, setorId: string, setor: string, equipeId: string, perfil = 'operador'): Participante => ({
  id, nome, foto: null, perfil, setor, setorId, equipeId, grupo: 'marca:bookplay', produto: 'cobranca', empresa: '',
});
const pessoas = [
  p('a', 'Ana Souza', 's1', 'Receptivo', 'e1'), p('b', 'Bruno Lima', 's1', 'Receptivo', 'e2'),
  p('c', 'Carla Mendes', 's2', 'Play 2', 'e3'), p('l', 'Lia Prado', 's1', 'Receptivo', 'e1', 'lider'),
];
const grupos: GrupoDaVotacao[] = [{ chave: 'marca:bookplay', rotulo: 'BookPlay · Birigui', produto: 'cobranca', setores: [
  { id: 's1', nome: 'Receptivo', grupo: 'marca:bookplay', produto: 'cobranca' },
  { id: 's2', nome: 'Play 2', grupo: 'marca:bookplay', produto: 'cobranca' },
] }];
const equipes = [{ id: 'e1', nome: 'Equipe Sol', setorId: 's1' }, { id: 'e2', nome: 'Equipe Lua', setorId: 's1' }, { id: 'e3', nome: 'Equipe Mar', setorId: 's2' }];

describe('MontarVotacaoOpcoes', () => {
  beforeEach(() => { localStorage.clear(); });

  it('sem setor marcado não libera; marcar, tirar equipe, incluir e liberar', async () => {
    const liberar = vi.fn<(d: DadosParaLiberar) => Promise<unknown>>().mockResolvedValue('id');
    const onLiberada = vi.fn();
    render(<MontarVotacaoOpcoes dados={{ pessoas, grupos, equipes }} onLiberada={onLiberada} liberar={liberar} />);

    expect(screen.getByRole('button', { name: /Liberar para 0 pessoas/ })).toBeDisabled();
    expect(screen.getByText(/Escolha quem vota/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Receptivo/ }));
    expect(screen.getByRole('button', { name: /Liberar para 2 pessoas/ })).toBeEnabled();

    // Tira a Equipe Lua (Bruno) e inclui a Carla, do Play 2, à mão.
    fireEvent.click(screen.getByRole('button', { name: /^Equipe Lua/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Incluir pessoa' }), { target: { value: 'carla' } });
    fireEvent.click(screen.getByRole('button', { name: /Carla Mendes/ }));
    expect(screen.getByRole('button', { name: /Liberar para 2 pessoas/ })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /Liberar para 2 pessoas/ }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Sorteio de prêmios ou Happy hour no Ibis');
    fireEvent.click(within(dialogo).getByRole('button', { name: /Liberar/ }));

    await waitFor(() => expect(liberar).toHaveBeenCalledTimes(1));
    const d = liberar.mock.calls[0][0];
    expect(d.eleitores.sort()).toEqual(['a', 'c']);
    expect(d.titulo).toBe('Votação de dezembro');
    expect(d.opcoes.map(o => o.id)).toEqual(['premios', 'happy_hour']);
    expect(d.opcoes[0].itens).toContain('Air Fryer');
    expect(d.publico).toMatchObject({ cargos: ['operador'], setores: ['s1'], equipes_fora: ['e2'], incluidos: ['c'] });
    expect(onLiberada).toHaveBeenCalled();
  });

  it('o cargo Líder entra com o botão do cargo; opção sem título trava', () => {
    render(<MontarVotacaoOpcoes dados={{ pessoas, grupos, equipes }} onLiberada={() => {}} liberar={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Receptivo/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Líder/ }));
    expect(screen.getByRole('button', { name: /Liberar para 3 pessoas/ })).toBeEnabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Título da opção 2' }), { target: { value: ' ' } });
    expect(screen.getByText(/A opção 2 está sem título/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Liberar para 3 pessoas/ })).toBeDisabled();
  });

  it('rascunho estragado no navegador não quebra: volta ao texto de dezembro', () => {
    localStorage.setItem('votacao-opcoes:rascunho:v1', JSON.stringify({ conteudo: { titulo: 'x', opcoes: [{ titulo: 'sem id' }] }, publico: { setores: 'errado' } }));
    render(<MontarVotacaoOpcoes dados={{ pessoas, grupos, equipes }} onLiberada={() => {}} liberar={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Título da opção 1' })).toHaveValue('Sorteio de prêmios');
  });
});
