/**
 * O cartão da equipe MONTA, e mostra o que prometeu? — teste de fumaça.
 *
 * Padrão da casa (`ListaPessoas.montagem.test.tsx`): typecheck verde não diz
 * que a tela abre. Aqui: abre com subgrupo, líder e clone; o modo mover
 * aparece com gente selecionada; e quem só olha não ganha botão de mexer.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CartaoEquipe, type CartaoEquipeProps } from './CartaoEquipe';
import { destinosDoSetor, type EquipeEq, type PessoaEq } from './modelo';

const equipe: EquipeEq = { id: 'eq1', nome: 'Alfa', setor_id: 's1', empresa_id: 'e1', treinamento: true };
const pessoa = (id: string, nome: string, subgrupo_id: string | null = null): PessoaEq => ({
  id, nome, email: '', perfil: 'operador', setor_id: 's1', equipe_id: 'eq1', empresa_id: 'e1', subgrupo_id,
});
const membros = [pessoa('p1', 'Ana Souza', 'g1'), pessoa('p2', 'Bruno Lima'), pessoa('p3', 'Carla Dias')];
const grupos = [{ id: 'g1', equipe_id: 'eq1', nome: 'Manhã' }];

function props(over: Partial<CartaoEquipeProps> = {}): CartaoEquipeProps {
  return {
    equipe, membros, grupos,
    lideres: [{ vinculoId: 'v1', nome: 'Lia Líder', naoResolvido: false, outroSetor: null }],
    clones: [{ cloneId: 'c1', pessoaId: 'x', nome: 'Davi Clone', naoResolvido: false, origem: 'clone de Beta', dica: '', conta: true }],
    ehTransferida: id => id === 'p3',
    emprestada: () => [],
    busca: '',
    podeGerenciar: true, podeExcluir: true, podeComposicao: true, podeMover: true,
    selecionados: new Set(),
    opcoes: destinosDoSetor([equipe], grupos, membros),
    onAlternar: vi.fn(), onArrastar: vi.fn(), onSoltar: vi.fn(), onMover: vi.fn(),
    onLevarSelecionados: vi.fn(), onTirar: vi.fn(),
    onRenomear: vi.fn(async () => true), onAlternarTreino: vi.fn(), onExcluir: vi.fn(),
    onCriarSubgrupo: vi.fn(async () => true), onRenomearSubgrupo: vi.fn(async () => true), onExcluirSubgrupo: vi.fn(),
    lideresDisponiveis: () => [], onAdicionarLider: vi.fn(), onRemoverLider: vi.fn(),
    clonagem: null, onRemoverClone: vi.fn(), onContaRecebimento: vi.fn(),
    ...over,
  };
}

describe('CartaoEquipe monta', () => {
  it('mostra nome, líder, subgrupo, clone e a transferida sem contá-la', () => {
    render(<CartaoEquipe {...props()} />);
    expect(screen.getByRole('heading', { name: 'Alfa' })).toBeTruthy();
    expect(screen.getByText('Lia Líder')).toBeTruthy();
    expect(screen.getByText('Manhã · 1')).toBeTruthy();
    expect(screen.getByText('Davi Clone')).toBeTruthy();
    expect(screen.getByText('transferida')).toBeTruthy();
    // 3 linhas, uma transferida: a equipe tem 2 pessoas.
    expect(screen.getByLabelText('2 pessoas').textContent).toBe('2');
  });

  it('com gente selecionada, o cartão e o subgrupo viram alvo', () => {
    const onLevar = vi.fn();
    render(<CartaoEquipe {...props({ selecionados: new Set(['outra', 'mais']), onLevarSelecionados: onLevar })} />);
    fireEvent.click(screen.getByRole('button', { name: /Mover as 2 para cá/ }));
    expect(onLevar).toHaveBeenCalledWith({ equipeId: 'eq1', subgrupoId: null });
    fireEvent.click(screen.getByRole('button', { name: 'para cá' }));
    expect(onLevar).toHaveBeenLastCalledWith({ equipeId: 'eq1', subgrupoId: 'g1' });
  });

  it('clicar no círculo seleciona; a transferida não se seleciona', () => {
    const onAlternar = vi.fn();
    render(<CartaoEquipe {...props({ onAlternar })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Bruno Lima' }));
    expect(onAlternar).toHaveBeenCalledWith('p2');
    expect((screen.getByRole('button', { name: 'Selecionar Carla Dias' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('quem só olha não ganha botão de mexer', () => {
    render(<CartaoEquipe {...props({ podeGerenciar: false, podeComposicao: false, podeMover: false, selecionados: new Set(['x']) })} />);
    expect(screen.queryByRole('button', { name: /Ações da equipe/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /para cá/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tirar .* da equipe/ })).toBeNull();
  });

  it('busca apaga quem não casa', () => {
    const { container } = render(<CartaoEquipe {...props({ busca: 'bruno' })} />);
    expect(container.querySelectorAll('[data-casa="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-longe="true"]').length).toBeGreaterThan(0);
  });
});
