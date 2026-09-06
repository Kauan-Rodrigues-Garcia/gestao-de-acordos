/**
 * A lista de pessoas MONTA, e mostra o que prometeu? — teste de fumaça.
 *
 * ## Por que ele existe
 *
 * A aba "Por operador" foi reescrita com typecheck limpo, build passando e
 * 4.493 testes verdes — e quebrava ao abrir, porque nenhum teste MONTAVA a
 * tela. O remédio virou padrão da casa (`AnaliticoLider.montagem.test.tsx`), e
 * esta lista nasceu depois dessa lição: ela é nova, é o coração da aba
 * Usuários, e recebe dezoito props.
 *
 * Não confere número nenhum. Responde a primeira pergunta que o usuário faz —
 * abre? — e mais quatro que a reforma de 06/09/2026 prometeu: a transferência
 * está na linha, o clone não é transferível, a coluna Empresa some quando não
 * há duas empresas para distinguir, e buscar abre os setores recolhidos.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Perfil } from '@/lib/supabase';
import { ListaPessoas, type GrupoDeSetor } from './ListaPessoas';

// framer-motion anima altura no colapso; no jsdom isso não acrescenta nada e
// só deixa o teste lento.
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => ({ children, ...p }: { children?: React.ReactNode }) =>
      <div {...p}>{children}</div>,
  }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

function pessoa(over: Partial<Perfil> & { id: string; nome: string }): Perfil {
  return {
    email: `${over.id}@empresa.com`, perfil: 'operador', ativo: true,
    lider_id: null, setor_id: 'setor-1', ...over,
  } as Perfil;
}

const GRUPOS: GrupoDeSetor[] = [{
  id: 'setor-1',
  nomeSetor: 'Play 1',
  lista: [
    pessoa({ id: 'p1', nome: 'Ana Souza', usuario: 'ana.souza', equipe_id: 'eq-1' }),
    { ...pessoa({ id: 'p2', nome: 'Bruno Lima' }), _cloneDe: 'Play 2' },
  ],
}];

const BASE = {
  grupos: GRUPOS,
  recolhidos: new Set<string>(),
  onAlternarSetor: vi.fn(),
  buscaAtiva: false,
  selecionados: new Set<string>(),
  onAlternarSelecao: vi.fn(),
  onSelecionarGrupo: vi.fn(),
  onlineIds: new Set<string>(['p1']),
  perfilAtualId: 'quem-olha',
  impersonando: null,
  podeTransferir: true,
  podeGerenciarSituacao: true,
  podeImpersonar: false,
  podeEditar: () => true,
  mostrarEmpresa: false,
  nomeEmpresa: () => 'PaguePlay',
  nomeEquipe: (u: Perfil) => (u.equipe_id ? 'Equipe Alfa' : null),
  onEditar: vi.fn(),
  onTransferir: vi.fn(),
  onSituacao: vi.fn(),
  onEntrarComo: vi.fn(),
  onVerFoto: vi.fn(),
};

describe('ListaPessoas monta', () => {
  it('desenha o setor, a gente dele e a equipe de cada um', () => {
    render(<ListaPessoas {...BASE} />);
    expect(screen.getByText('Play 1')).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
    // A coluna Equipe é nova: antes, saber a equipe de alguém exigia abrir
    // outra aba e escolher o setor de novo.
    expect(screen.getByText('Equipe Alfa')).toBeInTheDocument();
  });

  it('a transferência é uma ação de linha — o motivo inteiro da reforma', () => {
    render(<ListaPessoas {...BASE} />);
    // Uma só: o clone não recebe o botão (ver o teste abaixo).
    const botoes = screen.getAllByTitle('Transferir de setor ou empresa');
    expect(botoes).toHaveLength(1);
  });

  it('o clone não é transferível nem selecionável aqui', () => {
    render(<ListaPessoas {...BASE} />);
    // Ele é gerido no setor de origem; transferir a cópia não moveria a pessoa.
    expect(screen.getByText('clone de Play 2')).toBeInTheDocument();
    expect(screen.getByText('no setor de origem')).toBeInTheDocument();
    expect(screen.getByLabelText('Selecionar Ana Souza')).toBeInTheDocument();
    expect(screen.queryByLabelText('Selecionar Bruno Lima')).not.toBeInTheDocument();
  });

  it('sem transferir, some o checkbox e some o botão', () => {
    render(<ListaPessoas {...BASE} podeTransferir={false} />);
    expect(screen.queryByLabelText('Selecionar Ana Souza')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Transferir de setor ou empresa')).not.toBeInTheDocument();
  });

  it('a coluna Empresa só aparece quando há empresa para distinguir', () => {
    // Ela repetia o mesmo valor em toda linha para quem tem uma empresa só —
    // largura morta numa tabela que rolava na horizontal.
    const { rerender } = render(<ListaPessoas {...BASE} />);
    expect(screen.queryByText('Empresa')).not.toBeInTheDocument();
    rerender(<ListaPessoas {...BASE} mostrarEmpresa />);
    expect(screen.getByText('Empresa')).toBeInTheDocument();
    expect(screen.getAllByText('PaguePlay').length).toBeGreaterThan(0);
  });

  it('setor recolhido esconde a gente — mas a busca abre de volta', () => {
    const recolhidos = new Set(['setor-1']);
    const { rerender } = render(<ListaPessoas {...BASE} recolhidos={recolhidos} />);
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();

    // Esconder um resultado atrás de um grupo fechado é o oposto de buscar.
    rerender(<ListaPessoas {...BASE} recolhidos={recolhidos} buscaAtiva />);
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  });
});
