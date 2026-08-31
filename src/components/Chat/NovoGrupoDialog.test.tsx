import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockListar } = vi.hoisted(() => ({ mockListar: vi.fn() }));

vi.mock('@/services/chat/chat.service', () => ({
  listarContatos: (...args: unknown[]) => mockListar(...args),
}));

vi.mock('@/services/chat/grupos.service', () => ({
  criarGrupo: vi.fn(),
  configurarGrupo: vi.fn(),
  subirFotoDoGrupo: vi.fn(),
}));

import { NovoGrupoDialog } from './NovoGrupoDialog';
import type { ContatoChat } from '@/services/chat/chat.service';

function contato(parcial: Partial<ContatoChat> & Pick<ContatoChat, 'perfil_id' | 'nome'>): ContatoChat {
  return {
    usuario: null,
    foto_url: null,
    cargo: 'operador',
    setor_id: 'setor-1',
    setor_nome: 'Cobrança',
    equipe_id: 'equipe-1',
    equipe_nome: 'Equipe Azul',
    empresa_slug: 'bookplay',
    multiempresa: false,
    ...parcial,
  };
}

describe('NovoGrupoDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra líderes primeiro e identifica cada um com a tag', async () => {
    mockListar.mockResolvedValue([
      contato({ perfil_id: 'op-1', nome: 'Ana Operadora' }),
      contato({ perfil_id: 'lider-1', nome: 'Bruno Líder', cargo: 'lider' }),
      contato({ perfil_id: 'op-2', nome: 'Carlos Operador' }),
      contato({ perfil_id: 'lider-2', nome: 'Diana Líder', cargo: 'lider' }),
    ]);

    render(<NovoGrupoDialog aberto onFechar={vi.fn()} onCriado={vi.fn()} />);

    expect(await screen.findByText('Ana Operadora')).toBeInTheDocument();
    expect(screen.getAllByText('Líder')).toHaveLength(2);

    const nomes = screen.getAllByRole('button').map(botao => botao.textContent ?? '');
    expect(nomes.findIndex(nome => nome.includes('Bruno Líder')))
      .toBeLessThan(nomes.findIndex(nome => nome.includes('Ana Operadora')));
    expect(nomes.findIndex(nome => nome.includes('Diana Líder')))
      .toBeLessThan(nomes.findIndex(nome => nome.includes('Carlos Operador')));
  });
});
