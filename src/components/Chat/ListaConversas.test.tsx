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
      ultima_atividade_em: '2026-08-26T10:00:00Z',
      em_historico: false,
      ultimo_texto: 'Mensagem muito grande '.repeat(80),
      ultimo_autor_id: 'p-1',
      nao_lidas: 7,
      leitura_do_outro: null,
      entrega_minha: null,
      entrega_do_outro: null,
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

  /*
   * Este teste já cobrou `absolute right-2 z-20` do botão — as classes exatas
   * da implementação anterior. Era justamente ela que quebrava: fora do fluxo,
   * o botão caía por cima da aba Disparos na janela compacta, e escolher
   * Disparos parecia apagar as outras duas abas.
   *
   * Fixar classe de posicionamento em teste trava o defeito no lugar. O que
   * precisa continuar verdade é o COMPORTAMENTO: as três abas seguem
   * alcançáveis depois de trocar de aba, e o botão da aba ativa é clicável.
   */
  it('mantém as três abas e o botão de novo disparo alcançáveis na aba Disparos', async () => {
    const user = userEvent.setup();
    const disparo: DisparoChat = {
      id: 'd-compacto', texto: 'Aviso', anexos: [],
      criado_em: '2026-08-26T09:00:00Z', total_destinos: 123,
    };

    render(<ListaConversas {...baseProps} conversas={[]} disparos={[disparo]} />);
    await user.click(screen.getByRole('button', { name: /Disparos 1/i }));

    for (const nome of [/Conversas/i, /Histórico/i, /Disparos 1/i]) {
      expect(screen.getByRole('button', { name: nome })).toBeInTheDocument();
    }

    const botao = screen.getByRole('button', { name: 'Novo disparo' });
    await user.click(botao);
    expect(baseProps.onNovoDisparo).toHaveBeenCalledTimes(1);
  });

  it('mostra abaixo do horário o estado da última mensagem enviada', () => {
    const conversa: ConversaChat = {
      id: 'c-status', outro_id: 'p-2', outro_nome: 'Bruno', outro_usuario: 'bruno',
      outro_foto: null, outro_empresa: null,
      ultima_mensagem_em: '2026-08-26T10:00:00Z',
      ultima_atividade_em: '2026-08-26T10:00:00Z', em_historico: false,
      ultimo_texto: 'Recebeu?', ultimo_autor_id: 'eu', nao_lidas: 0,
      entrega_minha: '2026-08-26T09:00:00Z',
      entrega_do_outro: '2026-08-26T10:00:01Z',
      leitura_do_outro: null,
    };

    render(<ListaConversas {...baseProps} conversas={[conversa]} disparos={[]} />);

    expect(screen.getByRole('img', { name: 'Entregue' })).toBeInTheDocument();
  });

  it('separa conversas de hoje do histórico sem duplicar a lista', async () => {
    const user = userEvent.setup();
    const hoje: ConversaChat = {
      id: 'c-hoje', outro_id: 'p-hoje', outro_nome: 'Hoje', outro_usuario: 'hoje',
      outro_foto: null, outro_empresa: null,
      ultima_mensagem_em: '2026-08-28T12:00:00Z',
      ultima_atividade_em: '2026-08-28T12:00:00Z', em_historico: false,
      ultimo_texto: 'Mensagem atual', ultimo_autor_id: 'p-hoje', nao_lidas: 0,
      leitura_do_outro: null, entrega_minha: null, entrega_do_outro: null,
    };
    const antiga: ConversaChat = {
      ...hoje,
      id: 'c-antiga', outro_id: 'p-antiga', outro_nome: 'Antiga', outro_usuario: 'antiga',
      ultima_mensagem_em: '2026-08-27T12:00:00Z',
      ultima_atividade_em: '2026-08-27T12:00:00Z', em_historico: true,
      ultimo_texto: 'Mensagem anterior',
    };

    render(<ListaConversas {...baseProps} conversas={[hoje, antiga]} disparos={[]} />);

    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.queryByText('Antiga')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Histórico' }));
    expect(screen.getByText('Antiga')).toBeInTheDocument();
    expect(screen.queryByText('Hoje')).not.toBeInTheDocument();
  });

  it('mostra as abas na ordem Conversas, Histórico e Disparos', () => {
    render(<ListaConversas {...baseProps} conversas={[]} disparos={[]} />);
    const abas = screen.getAllByRole('button').filter(b =>
      ['Conversas', 'Histórico', 'Disparos'].includes(b.textContent ?? ''));
    expect(abas.map(a => a.textContent)).toEqual(['Conversas', 'Histórico', 'Disparos']);
  });
});
