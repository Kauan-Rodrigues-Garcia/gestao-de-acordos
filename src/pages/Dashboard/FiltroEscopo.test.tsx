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
 *   3. a RÉGUA «Minha visão · Minha equipe · Meu setor» manda nos dois, e em
 *      «Minha visão» os dois somem: o recorte já é uma pessoa só.
 *
 * A régua substituiu o interruptor «Só os meus números» em 09/09/2026. O
 * interruptor dizia se o individual estava ligado e calava sobre o que se via
 * quando desligado; a régua nomeia os três degraus e mostra em qual se está.
 *
 * O teste é por CARGO no sentido de «conjunto de níveis liberados» — nunca pelo
 * nome do cargo. Quem decide é o painel de permissões; aqui só se confere que a
 * tela obedece ao que ele liberou.
 */
import { render, screen, within } from '@testing-library/react';
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

/** Todos os níveis — o ponto de partida de quem testa a régua cheia. */
const TUDO: NivelEscopo[] = ['individual', 'equipe', 'setor', 'todos_setores'];

function montar(over: {
  niveis: NivelEscopo[];
  visao?: VisaoEscopo;
  setorFiltro?: string | null;
  podeTodasEquipes?: boolean;
  setorDoPerfil?: string | null;
  equipeDoPerfil?: string | null;
  equipes?: { id: string; nome: string }[];
  onVisao?: (v: VisaoEscopo) => void;
  onSetor?: (id: string | null) => void;
}) {
  const props = {
    niveis: over.niveis,
    setores: SETORES,
    setorFiltro: over.setorFiltro ?? null,
    onSetor: over.onSetor ?? vi.fn(),
    equipes: over.equipes ?? EQUIPES,
    podeTodasEquipes: over.podeTodasEquipes ?? true,
    visao: over.visao ?? ('setor' as VisaoEscopo),
    onVisao: over.onVisao ?? vi.fn(),
    setorDoPerfil: over.setorDoPerfil ?? 's-1',
    equipeDoPerfil: over.equipeDoPerfil === undefined ? 'e-1' : over.equipeDoPerfil,
  };
  return render(<FiltroEscopo {...props} />);
}

/** Os rótulos da régua, na ordem em que a tela os desenha. */
function degraus(): string[] {
  const grupo = screen.getByRole('group', { name: 'Nível de visualização' });
  return within(grupo).getAllByRole('button').map(b => b.textContent?.trim() ?? '');
}

describe('FiltroEscopo — a régua de visões', () => {
  it('sobe na ordem pedida: Minha visão → Minha equipe → Meu setor', () => {
    montar({ niveis: TUDO, setorFiltro: 's-1' });
    expect(degraus()).toEqual(['Minha visão', 'Minha equipe', 'Meu setor']);
  });

  it('cada degrau exige o seu nível', () => {
    const { unmount } = montar({ niveis: ['equipe', 'setor'], setorFiltro: 's-1' });
    expect(degraus()).toEqual(['Minha equipe', 'Meu setor']);
    unmount();

    montar({ niveis: ['individual', 'setor'], setorFiltro: 's-1' });
    expect(degraus()).toEqual(['Minha visão', 'Meu setor']);
  });

  it('sem equipe no cadastro, «Minha equipe» não aparece nem com o nível', () => {
    // O nível está liberado; o degrau não teria para onde apontar.
    montar({ niveis: TUDO, setorFiltro: 's-1', equipeDoPerfil: null });
    expect(degraus()).toEqual(['Minha visão', 'Meu setor']);
  });

  it('«todos_setores» sozinho já habilita «Meu setor»', () => {
    montar({ niveis: ['individual', 'todos_setores'] });
    expect(degraus()).toEqual(['Minha visão', 'Meu setor']);
  });

  it('marca como ativo o degrau em que a tela está', () => {
    const primeira = montar({ niveis: TUDO, setorFiltro: 's-1', visao: 'individual' });
    expect(screen.getByRole('button', { name: /Minha visão/ }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Meu setor/ }))
      .toHaveAttribute('aria-pressed', 'false');
    primeira.unmount();

    // «Minha equipe» é o `equipe:<id>` da equipe do cadastro, e não outra.
    const segunda = montar({ niveis: TUDO, setorFiltro: 's-1', visao: 'equipe:e-1' });
    expect(screen.getByRole('button', { name: /Minha equipe/ }))
      .toHaveAttribute('aria-pressed', 'true');
    segunda.unmount();

    montar({ niveis: TUDO, setorFiltro: 's-1', visao: 'equipe:e-2', equipeDoPerfil: 'e-1' });
    expect(screen.getByRole('button', { name: /Minha equipe/ }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('cada degrau leva ao seu recorte', async () => {
    const onVisao = vi.fn();
    montar({ niveis: TUDO, setorFiltro: 's-1', visao: 'setor', onVisao });

    await userEvent.click(screen.getByRole('button', { name: /Minha visão/ }));
    expect(onVisao).toHaveBeenCalledWith('individual');

    await userEvent.click(screen.getByRole('button', { name: /Minha equipe/ }));
    expect(onVisao).toHaveBeenCalledWith('equipe:e-1');

    await userEvent.click(screen.getByRole('button', { name: /Meu setor/ }));
    expect(onVisao).toHaveBeenCalledWith('setor');
  });

  it('o interruptor «Só os meus números» não existe mais', () => {
    montar({ niveis: TUDO, setorFiltro: 's-1' });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Só os meus números')).not.toBeInTheDocument();
  });

  it('um degrau sozinho não é escada — a régua some', () => {
    // Só `individual`: nada a escolher, e nada mais na caixa.
    const { container } = montar({ niveis: ['individual'] });
    expect(container).toBeEmptyDOMElement();
  });
});

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

  it('«Minha visão» esconde setor e equipe', () => {
    montar({
      niveis: TUDO,
      setorFiltro: 's-1',
      visao: 'individual',
    });
    expect(screen.queryByText('Todos os setores')).not.toBeInTheDocument();
    expect(screen.queryByText('Play 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipe A')).not.toBeInTheDocument();
    // A régua continua — é ela que traz a pessoa de volta.
    expect(degraus()).toEqual(['Minha visão', 'Minha equipe', 'Meu setor']);
  });

  it('a linha «Pessoa» com dois chips não existe mais', () => {
    montar({ niveis: TUDO, setorFiltro: 's-1' });
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
   * A linha de equipe que só repetiria a régua.
   *
   * Quem foi limitado à própria equipe recebe `equipes` recortado a ela. Sem
   * «Todas as equipes», isso é UM chip que leva exatamente aonde «Minha
   * equipe» acabou de levar — dois caminhos para o mesmo clique, um deles
   * escondido numa segunda linha.
   */
  it('a linha de equipe some quando só ofereceria a própria equipe', () => {
    const { unmount } = montar({
      niveis: ['individual', 'equipe', 'setor'],
      setorFiltro: 's-1',
      podeTodasEquipes: false,
      equipes: [EQUIPES[0]],
      equipeDoPerfil: 'e-1',
    });
    expect(screen.queryByText('Equipe A')).not.toBeInTheDocument();
    expect(degraus()).toContain('Minha equipe');
    unmount();

    // Com uma equipe a MAIS para escolher, a linha volta.
    montar({
      niveis: ['individual', 'equipe', 'setor'],
      setorFiltro: 's-1',
      podeTodasEquipes: false,
      equipeDoPerfil: 'e-1',
    });
    expect(screen.getByText('Equipe B')).toBeInTheDocument();
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
