import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockListar, mockDisparar, mockSubir } = vi.hoisted(() => ({
  mockListar: vi.fn(), mockDisparar: vi.fn(), mockSubir: vi.fn(),
}));

vi.mock('@/services/chat/chat.service', () => ({
  LIMITE_ANEXO: 10 * 1024 * 1024,
  listarContatos: (...args: unknown[]) => mockListar(...args),
  dispararMensagem: (...args: unknown[]) => mockDisparar(...args),
  subirAnexo: (...args: unknown[]) => mockSubir(...args),
}));

import { DisparoDialog } from './DisparoDialog';
import type { ContatoChat } from '@/services/chat/chat.service';

function contato(parcial: Partial<ContatoChat> & Pick<ContatoChat, 'perfil_id' | 'nome'>): ContatoChat {
  return {
    usuario: null, foto_url: null, cargo: 'operador',
    setor_id: 'setor-1', setor_nome: 'Cobrança',
    equipe_id: 'equipe-1', equipe_nome: 'Equipe Azul',
    empresa_slug: 'bookplay', multiempresa: false,
    ...parcial,
  };
}

describe('DisparoDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDisparar.mockResolvedValue({ disparoId: 'd-1', enviados: 1, pulados: [], erro: null });
  });

  it('mostra quem não tem equipe e põe líderes antes dos demais com tag', async () => {
    mockListar.mockResolvedValue([
      contato({ perfil_id: 'op-1', nome: 'Ana Operadora' }),
      contato({ perfil_id: 'lider-1', nome: 'Bruno Líder', cargo: 'lider' }),
      contato({ perfil_id: 'sem-1', nome: 'Carlos Sem Equipe', equipe_id: null, equipe_nome: null }),
      contato({ perfil_id: 'lider-sem', nome: 'Diana Líder', cargo: 'lider', equipe_id: null, equipe_nome: null }),
    ]);

    render(<DisparoDialog aberto onFechar={vi.fn()} onPronto={vi.fn()} />);

    expect(await screen.findByText('Sem equipe')).toBeInTheDocument();
    expect(screen.getByText('Carlos Sem Equipe')).toBeInTheDocument();
    expect(screen.getByText('Diana Líder')).toBeInTheDocument();
    expect(screen.getAllByText('Líder')).toHaveLength(2);

    const equipe = screen.getByText('Equipe Azul').parentElement?.parentElement;
    expect(equipe).not.toBeNull();
    const botoes = within(equipe as HTMLElement).getAllByRole('button');
    const nomes = botoes.map(b => b.textContent ?? '');
    expect(nomes.findIndex(n => n.includes('Bruno Líder')))
      .toBeLessThan(nomes.findIndex(n => n.includes('Ana Operadora')));
  });

  it('envia foto ou arquivo para todos mesmo sem texto', async () => {
    const user = userEvent.setup();
    mockListar.mockResolvedValue([
      contato({ perfil_id: 'op-1', nome: 'Ana Operadora' }),
    ]);
    mockSubir.mockResolvedValue({
      anexo: { url: 'disparos/rascunho/foto.png', nome: 'foto.png', tipo: 'image/png', tamanho: 4 },
      erro: null,
    });

    render(<DisparoDialog aberto onFechar={vi.fn()} onPronto={vi.fn()} />);
    await user.click(await screen.findByText('Ana Operadora'));
    await user.click(screen.getByRole('button', { name: 'Avançar' }));

    const arquivo = new File(['foto'], 'foto.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Anexar foto ou arquivo'), arquivo);
    await user.click(screen.getByRole('button', { name: 'Enviar para 1' }));

    await waitFor(() => expect(mockSubir).toHaveBeenCalled());
    expect(String(mockSubir.mock.calls[0][1])).toMatch(/^disparos\//);
    expect(mockDisparar).toHaveBeenCalledWith(
      ['op-1'],
      '',
      [{ url: 'disparos/rascunho/foto.png', nome: 'foto.png', tipo: 'image/png', tamanho: 4 }],
    );
  });
});
