/**
 * useSolicitacoesWhatsapp.test.ts — aviso de mensagem nova.
 *
 * Regra pedida: notificar sempre que chegar mensagem de outra pessoa E o
 * destinatário estiver com o chat daquele pedido FECHADO. Com o chat aberto na
 * frente do usuário a notificação é ruído — ele já está lendo.
 *
 * O realtime é mockado: guardamos o `onEvento` que o hook registra e disparamos
 * o payload à mão, que é o que o Supabase faria.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────

type Ouvinte = { onEvento?: (p: unknown) => void; onReconectado?: () => void };
const ouvintesPorTopico = new Map<string, Ouvinte[]>();

vi.mock('@/lib/realtime', () => ({
  assinarTabela: (assinatura: { topico: string }, ouvinte: Ouvinte) => {
    const lista = ouvintesPorTopico.get(assinatura.topico) ?? [];
    lista.push(ouvinte);
    ouvintesPorTopico.set(assinatura.topico, lista);
    return () => {
      const l = ouvintesPorTopico.get(assinatura.topico) ?? [];
      const i = l.indexOf(ouvinte);
      if (i >= 0) l.splice(i, 1);
    };
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}));

vi.mock('@/services/solicitacoesWhatsapp.service', () => ({
  buscarSolicitacoes: vi.fn(() => Promise.resolve({
    data: [{
      id: 'sol-1', empresa_id: 'emp', solicitante_id: 'outro',
      codigo_cliente: '5009294', nome_cliente: 'MARIA SILVA',
      status: 'em_andamento', responsavel_id: 'eu',
    }],
    dbAtiva: true, erro: null,
  })),
  buscarMensagens: vi.fn(() => Promise.resolve([])),
  enviarMensagem:  vi.fn(),
  marcarMensagensLidas: vi.fn(),
  buscarResponsaveis: vi.fn(() => Promise.resolve([])),
  buscarEventos: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useSolicitacoesWhatsapp } from './useSolicitacoesWhatsapp';

const TOPICO_MSG = 'rt-sol-wpp-msg-emp';

/** Dispara um INSERT de mensagem para todos os ouvintes do tópico de mensagens. */
function chegaMensagem(over: Partial<{ id: string; solicitacao_id: string; autor_id: string; conteudo: string }> = {}) {
  const payload = {
    eventType: 'INSERT',
    new: {
      id: 'msg-1', solicitacao_id: 'sol-1', autor_id: 'outro',
      conteudo: 'Cliente respondeu, pode seguir', lida_em: null,
      criado_em: new Date().toISOString(), empresa_id: 'emp',
      ...over,
    },
  };
  for (const o of ouvintesPorTopico.get(TOPICO_MSG) ?? []) o.onEvento?.(payload);
}

let notificacoes: { titulo: string; corpo: string; tag: string }[] = [];

beforeEach(() => {
  ouvintesPorTopico.clear();
  notificacoes = [];
  class FakeNotification {
    static permission = 'granted';
    static requestPermission = vi.fn(() => Promise.resolve('granted'));
    constructor(titulo: string, opcoes: { body: string; tag: string }) {
      notificacoes.push({ titulo, corpo: opcoes.body, tag: opcoes.tag });
    }
  }
  vi.stubGlobal('Notification', FakeNotification);
  // Aba em primeiro plano por padrão.
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

afterEach(() => { vi.unstubAllGlobals(); });

function montar(chatAbertoId: string | null = null) {
  return renderHook(() =>
    useSolicitacoesWhatsapp('emp', 'eu', {}, true, chatAbertoId),
  );
}

describe('notificação de mensagem nova', () => {
  it('notifica quando o chat daquele pedido está FECHADO', async () => {
    const { result } = montar(null);
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    expect(notificacoes).toHaveLength(1);
    expect(notificacoes[0].titulo).toContain('MARIA SILVA');
    expect(notificacoes[0].corpo).toBe('Cliente respondeu, pode seguir');
    expect(result.current.naoLidas['sol-1']).toBe(1);
  });

  it('NÃO notifica quando o chat daquele pedido está aberto na frente do usuário', async () => {
    const { result } = montar('sol-1');
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    expect(notificacoes).toHaveLength(0);
  });

  it('notifica mesmo com o chat aberto se a aba do navegador está em segundo plano', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    const { result } = montar('sol-1');
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    expect(notificacoes).toHaveLength(1);
  });

  it('chat aberto de OUTRO pedido não silencia a mensagem deste', async () => {
    const { result } = montar('sol-999');
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    expect(notificacoes).toHaveLength(1);
  });

  it('não notifica o eco da própria mensagem', async () => {
    const { result } = montar(null);
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem({ autor_id: 'eu' }); });

    expect(notificacoes).toHaveLength(0);
    expect(result.current.naoLidas['sol-1']).toBeUndefined();
    // ...mas o total da thread conta a minha mensagem também
    expect(result.current.totaisMensagens['sol-1']).toBe(1);
  });

  it('notifica a cada mensagem que chega, não só a primeira', async () => {
    const { result } = montar(null);
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem({ id: 'msg-1', conteudo: 'primeira' }); });
    act(() => { chegaMensagem({ id: 'msg-2', conteudo: 'segunda' }); });

    expect(notificacoes.map(n => n.corpo)).toEqual(['primeira', 'segunda']);
    expect(result.current.naoLidas['sol-1']).toBe(2);
  });

  it('sem permissão do SO, a contagem continua subindo', async () => {
    (Notification as unknown as { permission: string }).permission = 'denied';
    const { result } = montar(null);
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    expect(notificacoes).toHaveLength(0);
    expect(result.current.naoLidas['sol-1']).toBe(1);
  });
});
