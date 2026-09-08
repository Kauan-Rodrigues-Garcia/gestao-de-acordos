import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResultadoParticipante } from '@/services/desafios/calcularDesafio';
import { ClassificacaoDesafio } from './ClassificacaoDesafio';
import { estiloDoTema } from './tema';

function participante(posicao: number): ResultadoParticipante {
  return {
    pessoa: {
      id: `p${posicao}`, nome: `Pessoa ${posicao}`, usuario: null, fotoUrl: null,
      equipeId: null, equipeNome: 'Equipe Play', equipesLideradas: [], setorId: null,
      situacao: 'ativo', setores: [], equipes: [], perfil: 'operador', empresaId: null, convidado: false,
    },
    posicao, recebido: 16635.31, qtd: 10, meta: 12761.90, falta: 0,
    progresso: 130.35, bateuMeta: false, paraUltrapassar: null, nomeAcima: null,
  };
}

const lista = Array.from({ length: 7 }, (_, i) => participante(i + 1));
const visual = { tema: estiloDoTema('corrida'), mostrarFotos: true, animar: false, corridaDeProjecao: true };
const premios = [
  { posicao: 1, premio: 'Tablet' }, { posicao: 3, premio: 'Jantar' },
  { posicao: 5, premio: 'Almoço' }, { posicao: 6, premio: 'Vale-presente' },
];

describe('ClassificacaoDesafio', () => {
  it('separa top 5 e demais sem duplicar participantes nem inventar prêmios nas lacunas', () => {
    render(<ClassificacaoDesafio lista={lista} premios={premios} {...visual} />);
    const top = screen.getByRole('region', { name: 'Primeiros colocados' });
    const demais = screen.getByRole('region', { name: 'Demais colocados' });
    expect(within(top).getAllByRole('listitem')).toHaveLength(5);
    expect(within(demais).getAllByRole('listitem')).toHaveLength(2);
    lista.forEach(p => expect(screen.getAllByText(p.pessoa.nome)).toHaveLength(1));
    expect(within(top).getAllByRole('button')).toHaveLength(3);
    expect(within(demais).getByRole('button', { name: 'Prêmio do 6º lugar: Vale-presente' })).toBeInTheDocument();
    expect(screen.queryByText(/16\.635|12\.761|da projeção|previstos até hoje/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Premiação' })).not.toBeInTheDocument();
  });

  it('o prêmio acompanha a posição quando duas pessoas trocam de lugar', () => {
    const { rerender } = render(<ClassificacaoDesafio lista={lista} premios={premios} {...visual} />);
    const trocada = [{ ...lista[5], posicao: 1 }, ...lista.slice(1, 5), { ...lista[0], posicao: 6 }, lista[6]];
    rerender(<ClassificacaoDesafio lista={trocada} premios={premios} {...visual} />);
    const primeiro = screen.getByText('Pessoa 6').closest('li')!;
    expect(within(primeiro).getByText('Tablet')).toBeInTheDocument();
    expect(within(primeiro).queryByText('Vale-presente')).not.toBeInTheDocument();
    const sexto = screen.getByText('Pessoa 1').closest('li')!;
    expect(within(sexto).getByText('Vale-presente')).toBeInTheDocument();
  });

  it('abre e fecha os detalhes da premiação sem esconder o prêmio', () => {
    render(<ClassificacaoDesafio lista={lista} premios={premios} {...visual} />);
    const botao = screen.getByRole('button', { name: 'Prêmio do 1º lugar: Tablet' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Prêmio previsto para o 1º lugar/)).toBeVisible();
    fireEvent.click(botao);
    expect(screen.getByText(/Prêmio previsto para o 1º lugar/)).not.toBeVisible();
    expect(screen.getByText('Tablet')).toBeVisible();
  });

  it('aceita poucos participantes, campanha sem prêmio e ausência de meta', () => {
    render(<ClassificacaoDesafio lista={[{ ...lista[0], meta: null }]} premios={[]} {...visual} />);
    expect(screen.getByText('TOP 1')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Demais colocados' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('mantém o valor recebido nas campanhas que não são de projeção', () => {
    render(<ClassificacaoDesafio lista={lista.slice(0, 1)} premios={[]} {...visual} corridaDeProjecao={false} />);
    expect(screen.getByText(/16\.635,31/)).toBeInTheDocument();
    expect(screen.getByText('recebidos')).toBeInTheDocument();
  });
});
