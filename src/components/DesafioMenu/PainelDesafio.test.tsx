import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { desafioFixture, resultadoDesafioFixture } from '@/test/fixtures/desafio';
import { PainelDesafio } from './PainelDesafio';

const mocks = vi.hoisted(() => ({ resultado: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'p4', setor_id: 'setor-teste' } }) }));
vi.mock('@/hooks/useDesafios', () => ({ useResultadoDesafio: mocks.resultado }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resultado.mockReturnValue({ resultado: resultadoDesafioFixture(26), carregando: false, erro: null });
});

describe('PainelDesafio', () => {
  it('mostra projeção sem reais nem conclusão, sem mídia no cabeçalho e sem cortar o ranking', () => {
    render(<PainelDesafio desafio={desafioFixture} aberto onClose={vi.fn()} />);
    const painel = screen.getByRole('dialog');
    expect(painel).not.toHaveTextContent('R$');
    expect(painel).not.toHaveTextContent(/concluído|Meta batida/);
    expect(within(painel).getByText('Sua projeção')).toBeInTheDocument();
    expect(within(painel).getAllByText('120,8%')).toHaveLength(2);
    expect(painel.querySelector('header img')).toBeNull();
    expect(painel.querySelector(`img[src="${desafioFixture.midiaUrl}"]`)).toBeNull();
    expect(within(painel).getByText('Participante 26')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Primeiros colocados' })).getAllByRole('listitem')).toHaveLength(5);
    expect(within(screen.getByRole('region', { name: 'Demais colocados' })).getAllByRole('listitem')).toHaveLength(21);
    expect(screen.queryByRole('heading', { name: 'Premiação' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prêmio do 1º lugar: Tablet Samsung' })).toBeInTheDocument();
  });

  it('usa o mesmo recorte da consulta e não busca a campanha com a gaveta fechada', () => {
    const { rerender } = render(<PainelDesafio desafio={desafioFixture} aberto onClose={vi.fn()} />);
    expect(mocks.resultado).toHaveBeenLastCalledWith(desafioFixture, { operadorId: 'p4', setorDeCadastro: 'setor-teste' });
    rerender(<PainelDesafio desafio={desafioFixture} aberto={false} onClose={vi.fn()} />);
    expect(mocks.resultado).toHaveBeenLastCalledWith(null, { operadorId: 'p4', setorDeCadastro: 'setor-teste' });
  });

  it('mantém valores em campanhas por recebimento e preserva prêmio único', () => {
    const desafio = { ...desafioFixture, premio: 'Dia de folga', regra: { ...desafioFixture.regra, fonteMeta: 'individual' as const, premios: [] } };
    render(<PainelDesafio desafio={desafio} aberto onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('R$');
    expect(screen.queryByText('Sua projeção')).not.toBeInTheDocument();
    expect(screen.getByText('Dia de folga')).toBeInTheDocument();
  });

  it('respeita campanha só de equipes e usa percentuais também nos integrantes', () => {
    const desafio = { ...desafioFixture, regra: { ...desafioFixture.regra, modo: ['equipe' as const] } };
    render(<PainelDesafio desafio={desafio} aberto onClose={vi.fn()} />);
    expect(screen.queryByRole('region', { name: 'Primeiros colocados' })).not.toBeInTheDocument();
    const equipes = screen.getByRole('region', { name: 'Disputa entre equipes' });
    fireEvent.click(within(equipes).getByRole('button'));
    expect(within(equipes).getByText('Ana Rodrigues')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent('R$');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('concluíram');
  });

  it('exibe ausência de meta sem inventar zero por cento', () => {
    const resultado = resultadoDesafioFixture();
    resultado.individual[3].meta = null;
    mocks.resultado.mockReturnValue({ resultado, carregando: false, erro: null });
    render(<PainelDesafio desafio={desafioFixture} aberto onClose={vi.fn()} />);
    expect(screen.getByText('Sua equipe ainda não tem meta para calcular a projeção.')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('apresenta carregamento e erro sem anunciar placar zerado', () => {
    mocks.resultado.mockReturnValue({ resultado: null, carregando: true, erro: null });
    const { rerender } = render(<PainelDesafio desafio={desafioFixture} aberto onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Total recebido')).not.toBeInTheDocument();
    mocks.resultado.mockReturnValue({ resultado: null, carregando: false, erro: 'Falha de rede' });
    rerender(<PainelDesafio desafio={desafioFixture} aberto onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar');
  });

  it('fecha pelo botão e por Escape', () => {
    const onClose = vi.fn();
    render(<PainelDesafio desafio={desafioFixture} aberto onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar desafios' }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
