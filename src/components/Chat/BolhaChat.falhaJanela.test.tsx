/**
 * BolhaChat — a janela que não baixa não pode sumir com o chat.
 *
 * Um deploy troca os arquivos; a aba antiga pede um pedaço que não existe
 * mais. Sem tratamento, o erro subiria até o boundary do App e trocaria a tela
 * inteira por «Erro crítico». E, contido mas sem desfazer o estado, a janela
 * ficaria «aberta» e vazia — escondendo a bolha que a reabre.
 *
 * O esperado: segunda tentativa, aviso, janela fechada, bolha de volta.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { toastErro } = vi.hoisted(() => ({ toastErro: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu', nome: 'Eu' } }) }));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => true, loading: false }),
}));
vi.mock('@/hooks/useChat', () => {
  const chat = {
    naoLidasTotal: 0, conversas: [], disparos: [], mensagens: [],
    aberta: null, conversaAberta: null,
    carregando: false, carregandoMais: false, carregandoMensagens: false,
    erroMensagens: null, temMais: false,
    abrir: () => {}, abrirCom: async () => null, recarregar: () => {},
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
vi.mock('sonner', () => ({ toast: { error: toastErro, success: vi.fn() } }));

vi.mock('@/components/Chat/janela', () => {
  throw new Error('Failed to fetch dynamically imported module: /assets/janela-velho.js');
});

import { BolhaChat } from './BolhaChat';

describe('BolhaChat — falha ao baixar a janela', () => {
  it('avisa, fecha a janela e devolve a bolha, sem derrubar a tela', async () => {
    vi.stubGlobal('requestIdleCallback', () => 0);
    const erroConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<BolhaChat />);

    fireEvent.click(await screen.findByRole('button', { name: 'Abrir o chat' }));

    // Espera a segunda tentativa (800 ms) e a rejeição final.
    expect(await screen.findByRole('button', { name: 'Abrir o chat' }, { timeout: 4_000 }))
      .toBeInTheDocument();
    expect(toastErro).toHaveBeenCalledTimes(1);
    expect(String(toastErro.mock.calls[0][0])).toContain('Chat');
    expect(screen.queryByText(/Algo deu errado|Erro crítico/)).toBeNull();

    erroConsole.mockRestore();
    vi.unstubAllGlobals();
  }, 10_000);
});
