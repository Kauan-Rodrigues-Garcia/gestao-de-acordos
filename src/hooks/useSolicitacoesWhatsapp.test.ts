/**
 * useSolicitacoesWhatsapp.test.ts — aviso de mensagem nova.
 *
 * A notificação do SO virou o aviso de ÚLTIMO recurso: desde a migration
 * 20260731a a mensagem do chat vira linha em `notificacoes`, então com a janela
 * à frente o usuário já recebe o card no canto e o sino. O aviso do sistema
 * operacional só dispara com a janela do navegador ATRÁS de outra coisa — senão
 * seriam três avisos da mesma mensagem.
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

/** Mensagens que a query de contagem enxerga. Cada teste ajusta se precisar. */
let mensagensNoBanco: unknown[] = [];

// Desde 16/08/2026 a contagem é recortada pelos pedidos que estão na tela
// (`.in('solicitacao_id', …)`) em vez de varrer a empresa — daí o `in` aqui.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const resposta = Promise.resolve({ data: mensagensNoBanco, error: null });
      const alvo = {
        select: () => alvo,
        eq: () => alvo,
        in: () => resposta,
        then: (r: (v: unknown) => unknown) => resposta.then(r),
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
  it('notifica quando a janela do navegador está atrás', async () => {
    janelaAtras();
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    expect(notificacoes).toHaveLength(1);
    expect(notificacoes[0].titulo).toContain('MARIA SILVA');
    expect(notificacoes[0].corpo).toBe('Cliente respondeu, pode seguir');
    expect(result.current.naoLidas['sol-1']).toBe(1);
  });

  it('NÃO notifica com a janela à frente — o card e o sino já avisam', async () => {
    const { result } = montar();          // document.hidden = false
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    expect(notificacoes).toHaveLength(0);
    // ...mas a mensagem continua contando no badge da aba
    expect(result.current.naoLidas['sol-1']).toBe(1);
  });

  it('não notifica o eco da própria mensagem', async () => {
    janelaAtras();
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem({ autor_id: 'eu' }); });

    expect(notificacoes).toHaveLength(0);
    expect(result.current.naoLidas['sol-1']).toBeUndefined();
    // ...mas o total da thread conta a minha mensagem também
    expect(result.current.totaisMensagens['sol-1']).toBe(1);
  });

  it('notifica a cada mensagem que chega, não só a primeira', async () => {
    janelaAtras();
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem({ id: 'msg-1', conteudo: 'primeira' }); });
    act(() => { chegaMensagem({ id: 'msg-2', conteudo: 'segunda' }); });

    expect(notificacoes.map(n => n.corpo)).toEqual(['primeira', 'segunda']);
    expect(result.current.naoLidas['sol-1']).toBe(2);
  });

  it('sem permissão do SO, a contagem continua subindo', async () => {
    janelaAtras();
    (Notification as unknown as { permission: string }).permission = 'denied';
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { chegaMensagem(); });

    expect(notificacoes).toHaveLength(0);
    expect(result.current.naoLidas['sol-1']).toBe(1);
  });
});

describe('badge de não lidas é de cada um (migration 20260731d)', () => {
  const MSG = {
    solicitacao_id: 'sol-1',
    autor_id:       'outro',
    criado_em:      '2026-07-31T10:00:00.000Z',
  };

  it('o líder abrir a conversa NÃO apaga o meu badge', async () => {
    // Era o bug: `lida_em` era um carimbo por mensagem, então a leitura de
    // qualquer pessoa limpava o aviso de todas as outras.
    mensagensNoBanco = [MSG];
    const { result } = montar();
    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBe(1));

    // O líder lê depois da mensagem e o realtime avisa a minha tela.
    leiturasNoBanco = [{
      solicitacao_id: 'sol-1', usuario_id: 'lider', lido_ate: '2026-07-31T23:00:00.000Z',
    }];
    await act(async () => {
      for (const o of ouvintesPorTopico.get('rt-sol-wpp-leitura-emp') ?? []) o.onEvento?.({});
    });

    expect(result.current.naoLidas['sol-1']).toBe(1);
  });

  it('o meu próprio cursor zera o meu badge', async () => {
    mensagensNoBanco = [MSG];
    const { result } = montar();
    await waitFor(() => expect(result.current.naoLidas['sol-1']).toBe(1));

    leiturasNoBanco = [{
      solicitacao_id: 'sol-1', usuario_id: 'eu', lido_ate: '2026-07-31T23:00:00.000Z',
    }];
    await act(async () => {
      for (const o of ouvintesPorTopico.get('rt-sol-wpp-leitura-emp') ?? []) o.onEvento?.({});
    });

    expect(result.current.naoLidas['sol-1']).toBeUndefined();
  });
});
