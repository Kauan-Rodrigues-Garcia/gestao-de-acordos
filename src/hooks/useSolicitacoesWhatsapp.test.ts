/**
 * useSolicitacoesWhatsapp.test.ts — aviso de mensagem nova.
 *
 * A notificação do SO virou o aviso de ÚLTIMO recurso: desde a migration
 * 20260731a a mensagem do chat vira linha em `notificacoes`, então com a janela
 * à frente o usuário já recebe o card no canto e o sino. O aviso do sistema
 * operacional só dispara com a janela do navegador ATRÁS de outra coisa — senão
 * seriam três avisos da mesma mensagem.
 *
 * Desde 20261013170000 o tempo real é o aviso `solicitacoes:<empresa>` do
 * banco: só os ids do pedido e do autor, nunca o conteúdo. O realtime é
 * mockado: a mensagem entra no "banco" de mentira e o aviso é disparado à mão,
 * que é o que o gatilho faria.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────

type Ouvinte = { onSinal?: (p: Record<string, unknown>, s: string) => void; onReconectado?: () => void };
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

interface Msg { solicitacao_id: string; autor_id: string; criado_em: string; conteudo?: string }

/** Mensagens que as consultas enxergam. Cada teste ajusta se precisar. */
let mensagensNoBanco: Msg[] = [];

// Duas consultas tocam as mensagens: a contagem (recortada pelos pedidos na
// tela, `.in(...)`) e a notificação (a última do pedido, `.order().limit(1)`).
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const alvo = {
        select: () => alvo,
        eq: () => alvo,
        order: () => alvo,
        in: () => Promise.resolve({ data: mensagensNoBanco, error: null }),
        limit: () => Promise.resolve({ data: mensagensNoBanco.slice(-1), error: null }),
      };
      return alvo;
    },
  },
}));

/** Cursores de leitura que o service devolve. */
let leiturasNoBanco: unknown[] = [];

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
  marcarConversaLida: vi.fn(() => Promise.resolve()),
  buscarLeituras: vi.fn(() => Promise.resolve(leiturasNoBanco)),
  buscarResponsaveis: vi.fn(() => Promise.resolve([])),
  buscarEventos: vi.fn(() => Promise.resolve([])),
  DIAS_HISTORICO_PADRAO: 30,
}));

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { useSolicitacoesWhatsapp } from './useSolicitacoesWhatsapp';

const TOPICO = 'solicitacoes:emp';

function avisar(payload: Record<string, unknown>) {
  for (const o of ouvintesPorTopico.get(TOPICO) ?? []) o.onSinal?.(payload, 'mudou');
}

/** Grava uma mensagem no "banco" e manda o aviso, como o gatilho faria. */
function chegaMensagem(over: Partial<Msg> = {}) {
  const msg: Msg = {
    solicitacao_id: 'sol-1', autor_id: 'outro',
    conteudo: 'Cliente respondeu, pode seguir',
    criado_em: new Date(Date.now() + mensagensNoBanco.length).toISOString(),
    ...over,
  };
  mensagensNoBanco = [...mensagensNoBanco, msg];
  avisar({
    tabela: 'solicitacoes_whatsapp_mensagens', operacao: 'INSERT',
    ids: [msg.solicitacao_id], autores: [msg.autor_id],
  });
}

let notificacoes: { titulo: string; corpo: string; tag: string }[] = [];

beforeEach(() => {
  ouvintesPorTopico.clear();
  notificacoes = [];
  mensagensNoBanco = [];
  leiturasNoBanco = [];
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

function montar() {
  return renderHook(() => useSolicitacoesWhatsapp('emp', 'eu', {}, true));
}

/** Coloca a janela do navegador atrás de outra coisa. */
function janelaAtras() {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
}

describe('notificação de mensagem nova', () => {
  it('notifica quando a janela do navegador está atrás — o texto vem da releitura, não do aviso', async () => {
    janelaAtras();
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    await waitFor(() => expect(notificacoes).toHaveLength(1));
    expect(notificacoes[0].titulo).toContain('MARIA SILVA');
    expect(notificacoes[0].corpo).toBe('Cliente respondeu, pode seguir');
    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBe(1));
  });

  it('NÃO notifica com a janela à frente — o card e o sino já avisam', async () => {
    const { result } = montar();          // document.hidden = false
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    // ...mas a mensagem continua contando no badge da aba
    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBe(1));
    expect(notificacoes).toHaveLength(0);
  });

  it('não notifica o eco da própria mensagem', async () => {
    janelaAtras();
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem({ autor_id: 'eu' }); });

    // O total da thread conta a minha mensagem também.
    await waitFor(() => expect(result.current.totaisMensagens['sol-1']).toBe(1));
    expect(notificacoes).toHaveLength(0);
    expect(result.current.naoLidas['sol-1']).toBeUndefined();
  });

  it('notifica a cada mensagem que chega, não só a primeira', async () => {
    janelaAtras();
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem({ conteudo: 'primeira' }); });
    await waitFor(() => expect(notificacoes).toHaveLength(1));
    act(() => { chegaMensagem({ conteudo: 'segunda' }); });
    await waitFor(() => expect(notificacoes).toHaveLength(2));

    expect(notificacoes.map(n => n.corpo)).toEqual(['primeira', 'segunda']);
    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBe(2));
  });

  it('sem permissão do SO, a contagem continua subindo', async () => {
    janelaAtras();
    (Notification as unknown as { permission: string }).permission = 'denied';
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBe(1));
    expect(notificacoes).toHaveLength(0);
  });

  it('aviso de pedido que não está na tela não reconta nem notifica', async () => {
    janelaAtras();
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem({ solicitacao_id: 'sol-de-outro-setor' }); });
    await new Promise(r => setTimeout(r, 400));

    expect(notificacoes).toHaveLength(0);
    expect(result.current.totaisMensagens['sol-de-outro-setor']).toBeUndefined();
  });
});

describe('badge de não lidas é de cada um (migration 20260731d)', () => {
  const MSG: Msg = {
    solicitacao_id: 'sol-1',
    autor_id:       'outro',
    criado_em:      '2026-07-31T10:00:00.000Z',
  };
  const avisoDeLeitura = (quem: string) => avisar({
    tabela: 'solicitacoes_whatsapp_leitura', operacao: 'UPDATE', ids: ['sol-1'], autores: [quem],
  });

  it('o líder abrir a conversa NÃO apaga o meu badge', async () => {
    // Era o bug: `lida_em` era um carimbo por mensagem, então a leitura de
    // qualquer pessoa limpava o aviso de todas as outras.
    mensagensNoBanco = [MSG];
    const { result } = montar();
    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBe(1));

    // O líder lê depois da mensagem e o aviso chega à minha tela.
    leiturasNoBanco = [{
      solicitacao_id: 'sol-1', usuario_id: 'lider', lido_ate: '2026-07-31T23:00:00.000Z',
    }];
    act(() => { avisoDeLeitura('lider'); });
    await new Promise(r => setTimeout(r, 400));

    expect(result.current.naoLidas['sol-1']).toBe(1);
  });

  it('o meu próprio cursor zera o meu badge', async () => {
    mensagensNoBanco = [MSG];
    const { result } = montar();
    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBe(1));

    leiturasNoBanco = [{
      solicitacao_id: 'sol-1', usuario_id: 'eu', lido_ate: '2026-07-31T23:00:00.000Z',
    }];
    act(() => { avisoDeLeitura('eu'); });

    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBeUndefined());
  });
});
