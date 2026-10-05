/**
 * BolhaChat no modo `celular` — o chat dentro do app (05/10/2026).
 *
 * O que este arquivo trava: a abóbora segue o tema de Halloween (e some com
 * ele); aberto, é a tela inteira sem o botão de aumentar; e o link do aviso
 * (`conversaInicial`) abre direto na conversa e avisa quem passou.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { abrir } = vi.hoisted(() => ({ abrir: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu', nome: 'Eu', chat_boas_vindas_em: '2026-01-01' } }) }));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => true, loading: false }),
}));
vi.mock('@/hooks/useChat', () => {
  const chat = {
    naoLidasTotal: 0, conversas: [], disparos: [], mensagens: [],
    aberta: null, conversaAberta: null,
    carregando: false, carregandoMais: false, carregandoMensagens: false,
    erroMensagens: null, temMais: false,
    abrir, abrirCom: async () => null, recarregar: () => {},
    enviar: async () => {}, reenviar: async () => {}, verAnteriores: async () => {},
  };
  return { useChat: () => chat };
});
vi.mock('@/hooks/useChatPresenca', () => {
  const presenca = { online: new Set(), digitando: new Set(), gravando: new Set(), avisarAtividade: () => {} };
  return { useChatPresenca: () => presenca };
});
vi.mock('@/services/chat/chat.service', () => ({
  possoUsarOChat: async () => true,
  apagarConversa: async () => ({}), buscarConversa: async () => null,
  fixarConversa: async () => ({}), rotuloAnexo: () => '', quemCurtiu: async () => [],
  urlDoAnexo: async () => null, urlDoAnexoEmCache: () => null,
}));
vi.mock('@/lib/notificacao-chat', () => ({
  deveNotificarMensagemChat: () => false,
  executarNotificacaoChatUmaVez: () => {},
  tituloComMensagensNaoLidas: () => 'Gestão',
}));
vi.mock('@/lib/som-chat', () => ({ prepararSomChat: () => {}, tocarSomChat: () => {} }));
vi.mock('@/components/ui/sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/Halloween/Desenhos', () => ({ AboboraChat: () => <span data-testid="abobora" /> }));
vi.mock('@/components/Chat/janela', () => {
  const nada = () => null;
  return {
    ListaConversas: () => <div>lista de conversas</div>,
    Conversa: nada, PainelMonitor: nada, DisparoDialog: nada,
    NovaConversaDialog: nada, NovoGrupoDialog: nada, ConfigGrupoDialog: nada,
    GaleriaDialog: nada, BoasVindasChat: nada,
  };
});

import { BolhaChat } from './BolhaChat';
import { TemaHalloweenContext } from '@/components/Halloween/tema';

function montar(halloween: boolean, props: Parameters<typeof BolhaChat>[0] = {}) {
  return render(
    <TemaHalloweenContext.Provider value={halloween}>
      <BolhaChat modo="celular" {...props} />
    </TemaHalloweenContext.Provider>,
  );
}

beforeEach(() => {
  abrir.mockReset();
  vi.stubGlobal('requestIdleCallback', () => 0);
  vi.stubGlobal('cancelIdleCallback', () => {});
});

describe('BolhaChat no celular', () => {
  it('tema de Halloween ligado: o botão é a abóbora', async () => {
    montar(true);
    await screen.findByRole('button', { name: 'Abrir o chat' });
    expect(screen.getByTestId('abobora')).toBeInTheDocument();
  });

  it('tema desligado: volta o ícone normal do chat', async () => {
    montar(false);
    const botao = await screen.findByRole('button', { name: 'Abrir o chat' });
    expect(screen.queryByTestId('abobora')).not.toBeInTheDocument();
    expect(botao.className).toContain('bg-primary');
  });

  it('aberto é a tela inteira, sem o botão de aumentar a janela', async () => {
    montar(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir o chat' }));
    expect(screen.getByRole('button', { name: 'Fechar o chat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aumentar a janela|Diminuir a janela/ })).not.toBeInTheDocument();
  });

  it('vindo do aviso: abre direto na conversa e avisa que abriu', async () => {
    const aberta = vi.fn();
    montar(false, { conversaInicial: 'c-42', onConversaInicialAberta: aberta });
    await waitFor(() => expect(abrir).toHaveBeenCalledWith('c-42'));
    expect(aberta).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Fechar o chat' })).toBeInTheDocument();
  });
});
