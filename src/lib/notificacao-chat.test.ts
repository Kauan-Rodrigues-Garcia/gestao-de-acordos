import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __CHAVE_NOTIFICACOES_CHAT,
  deveNotificarMensagemChat,
  executarNotificacaoChatUmaVez,
  tituloComMensagensNaoLidas,
} from './notificacao-chat';

describe('notificação do chat', () => {
  beforeEach(() => localStorage.removeItem(__CHAVE_NOTIFICACOES_CHAT));

  it('só silencia quando a janela e a mesma conversa estão abertas', () => {
    expect(deveNotificarMensagemChat({
      janelaAberta: true, conversaAberta: 'c-1', conversaDaMensagem: 'c-1',
    })).toBe(false);
    expect(deveNotificarMensagemChat({
      janelaAberta: true, conversaAberta: 'c-2', conversaDaMensagem: 'c-1',
    })).toBe(true);
    expect(deveNotificarMensagemChat({
      janelaAberta: false, conversaAberta: 'c-1', conversaDaMensagem: 'c-1',
    })).toBe(true);
  });

  it('coloca a quantidade na aba e limpa quando tudo foi lido', () => {
    expect(tituloComMensagensNaoLidas(3)).toBe('(3) Gestão de Acordos');
    expect(tituloComMensagensNaoLidas(0)).toBe('Gestão de Acordos');
  });

  it('não repete o mesmo evento realtime', async () => {
    const executar = vi.fn();
    await executarNotificacaoChatUmaVez('m-1', executar);
    await executarNotificacaoChatUmaVez('m-1', executar);
    await executarNotificacaoChatUmaVez('m-2', executar);
    expect(executar).toHaveBeenCalledTimes(2);
  });
});
