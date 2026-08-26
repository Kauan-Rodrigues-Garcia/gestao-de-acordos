import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockListarDestinos } = vi.hoisted(() => ({
  mockListarDestinos: vi.fn(),
}));

vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => true }),
}));

vi.mock('@/lib/permissoes-escopo', () => ({
  niveisLiberados: () => ['empresa'],
}));

vi.mock('@/services/chat/chat.service', () => ({
  PAGINA_DESTINOS_DISPARO: 50,
  listarDestinosDisparo: (...args: unknown[]) => mockListarDestinos(...args),
  rotuloAnexo: () => 'Anexo',
}));

import { ListaConversas } from './ListaConversas';
import type {
  ConversaChat, DestinoDisparoChat, DisparoChat,
} from '@/services/chat/chat.service';

const baseProps = {
  online: new Set<string>(),
  digitando: new Set<string>(),
  selecionada: null,
  carregando: false,
  meuId: 'eu',
  onAbrir: vi.fn(),
  onApagar: vi.fn(),
  onNovaConversa: vi.fn(),
  onNovoDisparo: vi.fn(),
};

function destino(numero: number): DestinoDisparoChat {
  return {
    perfil_id: `p-${numero}`,
    conversa_id: `c-${numero}`,
    nome: `Pessoa ${numero}`,
    usuario: `pessoa${numero}`,
    foto_url: null,
    empresa_slug: numero % 2 ? 'empresa-a' : 'empresa-b',
  };
}

describe('ListaConversas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reserva uma coluna para o contador mesmo com uma mensagem muito grande', () => {
    const conversa: ConversaChat = {
      id: 'c-1',
      outro_id: 'p-1',
      outro_nome: 'Ana',
      outro_usuario: 'ana',
      outro_foto: null,
      ultima_mensagem_em: '2026-08-26T10:00:00Z',
      ultimo_texto: 'Mensagem muito grande '.repeat(80),
      ultimo_autor_id: 'p-1',
      nao_lidas: 7,
      leitura_do_outro: null,
      outro_empresa: null,
    };

    render(<ListaConversas {...baseProps} conversas={[conversa]} disparos={[]} />);

    const contador = screen.getByLabelText('7 mensagens não lidas');
    const linha = contador.closest('button');
    expect(contador).toHaveTextContent('7');
    expect(linha).toHaveClass('grid-cols-[auto_minmax(0,1fr)_auto]');
  });

  it('expande, pagina de 50 em 50, abre a conversa e recolhe o disparo', async () => {
    const user = userEvent.setup();
    const disparo: DisparoChat = {
      id: 'd-1',
      texto: 'Bom dia, equipe!',
      anexos: [],
      criado_em: '2026-08-26T09:00:00Z',
      total_destinos: 123,
    };
    const primeiraPagina = Array.from({ length: 50 }, (_, i) => destino(i + 1));
    const segundaPagina = Array.from({ length: 50 }, (_, i) => destino(i + 51));

    mockListarDestinos.mockImplementation((_id: string, inicio: number) => Promise.resolve({
      destinos: inicio === 0 ? primeiraPagina : segundaPagina,
      temMais: true,
      erro: null,
    }));

    render(<ListaConversas {...baseProps} conversas={[]} disparos={[disparo]} />);

    await user.click(screen.getByRole('button', { name: /Disparos 1/i }));
    const card = screen.getByRole('button', { name: /123 pessoas/i });
    await user.click(card);

    expect(await screen.findByText('Pessoa 1')).toBeInTheDocument();
    expect(screen.getByText('Pessoa 50')).toBeInTheDocument();
    expect(mockListarDestinos).toHaveBeenCalledWith('d-1', 0);

    await user.click(screen.getByRole('button', { name: 'Ver mais 50' }));
    expect(await screen.findByText('Pessoa 100')).toBeInTheDocument();
    expect(mockListarDestinos).toHaveBeenCalledWith('d-1', 50);

    const pessoa1 = screen.getByText('Pessoa 1').closest('button');
    expect(pessoa1).not.toBeNull();
    await user.click(pessoa1!);
    expect(baseProps.onAbrir).toHaveBeenCalledWith('c-1');

    await user.click(card);
    await waitFor(() => expect(screen.queryByText('Pessoa 1')).not.toBeInTheDocument());
  });
});
