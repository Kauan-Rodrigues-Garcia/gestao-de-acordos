/**
 * FiltroEscopo.test.tsx — a cascata do recorte do Dashboard, travada por teste.
 *
 * O desenho foi ditado em 03/09/2026, e a razão de existir deste arquivo é que
 * ele já foi refeito três vezes: cada rodada mexia numa das condições de
 * visibilidade e desarrumava outra, e o defeito só aparecia no cargo que
 * ninguém tinha aberto para conferir.
 *
 * As regras, na ordem em que foram pedidas:
 *
 *   1. filtro de SETOR só para quem enxerga mais de um setor;
 *   2. filtro de EQUIPE só com UM setor em foco — «todos os setores» o esconde,
 *      porque «equipe de qual setor?» não tem resposta;
 *   3. o INDIVIDUAL é um interruptor à parte, e ligado ele esconde os outros
 *      dois: o recorte já é uma pessoa só.
 *
 * O teste é por CARGO no sentido de «conjunto de níveis liberados» — nunca pelo
 * nome do cargo. Quem decide é o painel de permissões; aqui só se confere que a
 * tela obedece ao que ele liberou.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FiltroEscopo, type VisaoEscopo } from './FiltroEscopo';
import type { NivelEscopo } from '@/lib/permissoes-escopo';

const SETORES = [
  { id: 's-1', nome: 'Play 4' },
  { id: 's-2', nome: 'Play 5' },
];
const EQUIPES = [
  { id: 'e-1', nome: 'Equipe A' },
  { id: 'e-2', nome: 'Equipe B' },
];

function montar(over: {
  niveis: NivelEscopo[];
  visao?: VisaoEscopo;
  setorFiltro?: string | null;
  podeTodasEquipes?: boolean;
  setorDoPerfil?: string | null;
  onVisao?: (v: VisaoEscopo) => void;
  onSetor?: (id: string | null) => void;
}) {
  const props = {
    niveis: over.niveis,
    setores: SETORES,
    setorFiltro: over.setorFiltro ?? null,
    onSetor: over.onSetor ?? vi.fn(),
    equipes: EQUIPES,
    podeTodasEquipes: over.podeTodasEquipes ?? true,
    visao: over.visao ?? ('setor' as VisaoEscopo),
    onVisao: over.onVisao ?? vi.fn(),
    setorDoPerfil: over.setorDoPerfil ?? 's-1',
  };
  return render(<FiltroEscopo {...props} />);
}

describe('FiltroEscopo — a cascata do recorte', () => {
  it('o filtro de setor só existe para quem enxerga mais de um setor', () => {
    // Alcance de setor, mas de UM setor: escolher entre setores não é opção.
    const { unmount } = montar({ niveis: ['individual', 'setor'] });
    expect(screen.queryByText('Todos os setores')).not.toBeInTheDocument();
    expect(screen.queryByText('Play 5')).not.toBeInTheDocument();
    unmount();

    montar({ niveis: ['setor', 'todos_setores'] });
    expect(screen.getByText('Todos os setores')).toBeInTheDocument();
    expect(screen.getByText('Play 5')).toBeInTheDocument();
  });

  it('«todos os setores» esconde a linha de equipe — equipe de qual setor?', () => {
    const { unmount } = montar({
      niveis: ['equipe', 'setor', 'todos_setores'],
      setorFiltro: null,
    });
    expect(screen.queryByText('Equipe A')).not.toBeInTheDocument();
    unmount();

    // Com UM setor em foco, as equipes daquele setor aparecem.
    montar({
      niveis: ['equipe', 'setor', 'todos_setores'],
      setorFiltro: 's-2',
    });
    expect(screen.getByText('Equipe A')).toBeInTheDocument();
    expect(screen.getByText('Equipe B')).toBeInTheDocument();
  });

  it('quem não escolhe setor vê as equipes do PRÓPRIO setor', () => {
    montar({ niveis: ['individual', 'equipe', 'setor'], setorDoPerfil: 's-1' });
    expect(screen.queryByText('Todos os setores')).not.toBeInTheDocument();
    expect(screen.getByText('Equipe A')).toBeInTheDocument();
  });

  it('individual ligado esconde setor e equipe', async () => {
    const onVisao = vi.fn();
    const { unmount } = montar({
      niveis: ['individual', 'equipe', 'setor', 'todos_setores'],
      setorFiltro: 's-1',
      visao: 'setor',
      onVisao,
    });

    // Desligado: os três controles convivem.
    expect(screen.getByText('Todos os setores')).toBeInTheDocument();
    expect(screen.getByText('Equipe A')).toBeInTheDocument();
    const chave = screen.getByRole('switch', { name: /apenas os seus próprios números/i });
    expect(chave).toBeInTheDocument();

    await userEvent.click(chave);
    expect(onVisao).toHaveBeenCalledWith('individual');
    unmount();

    // Ligado: sobra o interruptor, e nada que não se aplique a uma pessoa só.
    montar({
      niveis: ['individual', 'equipe', 'setor', 'todos_setores'],
      setorFiltro: 's-1',
      visao: 'individual',
    });
    expect(screen.queryByText('Todos os setores')).not.toBeInTheDocument();
    expect(screen.queryByText('Play 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipe A')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /apenas os seus próprios números/i }))
      .toBeInTheDocument();
  });

  it('desligar o individual devolve o recorte de setor', async () => {
    const onVisao = vi.fn();
    montar({
      niveis: ['individual', 'setor', 'todos_setores'],
      visao: 'individual',
      onVisao,
    });
    await userEvent.click(screen.getByRole('switch', { name: /apenas os seus próprios números/i }));
    expect(onVisao).toHaveBeenCalledWith('setor');
  });

  it('a linha «Pessoa» com dois chips não existe mais', () => {
    montar({ niveis: ['individual', 'equipe', 'setor', 'todos_setores'], setorFiltro: 's-1' });
    // Era um filtro fingindo ter duas dimensões quando só tem uma.
    expect(screen.queryByText('Todas as pessoas')).not.toBeInTheDocument();
    expect(screen.queryByText('Só os meus')).not.toBeInTheDocument();
    expect(screen.queryByText('Pessoa:')).not.toBeInTheDocument();
  });

  it('«Todas as equipes» some para quem foi limitado à própria equipe', () => {
    montar({
      niveis: ['equipe', 'setor', 'todos_setores'],
      setorFiltro: 's-1',
      podeTodasEquipes: false,
    });
    expect(screen.queryByText('Todas as equipes')).not.toBeInTheDocument();
    expect(screen.getByText('Equipe A')).toBeInTheDocument();
  });

  /*
   * O caminho de volta de quem NÃO tem «Todas as equipes».
   *
   * Relatado em 05/09/2026: um operador limitado à própria equipe entrava no
   * recorte dela e ficava preso — a visão de setor era o estado em que a tela
   * abria, e nenhum controle a alcançava de volta. O chip de setor já
   * desligava no segundo clique; o de equipe, não.
   *
   * Voltar para 'setor' não concede alcance nenhum: é o estado inicial, o
   * mesmo que a pessoa via antes de tocar no filtro.
   */
  it('clicar na equipe ATIVA devolve a visão do setor', async () => {
    const onVisao = vi.fn();
    montar({
      niveis: ['equipe', 'setor'],
      setorFiltro: 's-1',
      podeTodasEquipes: false,
      visao: 'equipe:e-1',
      onVisao,
    });
    // Sem o botão «Todas as equipes», o chip da própria equipe É a saída.
    expect(screen.queryByText('Todas as equipes')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Equipe A'));
    expect(onVisao).toHaveBeenCalledWith('setor');
  });

  it('clicar numa equipe INATIVA entra no recorte dela', async () => {
    const onVisao = vi.fn();
    montar({
      niveis: ['equipe', 'setor', 'todos_setores'],
      setorFiltro: 's-1',
      visao: 'equipe:e-1',
      onVisao,
    });
    await userEvent.click(screen.getByText('Equipe B'));
    expect(onVisao).toHaveBeenCalledWith('equipe:e-2');
  });

  it('sem nada a oferecer, o controle inteiro some em vez de virar moldura vazia', () => {
    const { container } = montar({ niveis: ['individual'] });
    expect(container).toBeEmptyDOMElement();
  });
});
