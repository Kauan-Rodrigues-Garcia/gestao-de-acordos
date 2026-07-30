/**
 * NotificacoesProvider.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O provider substituiu três implementações que coexistiam (painel, badge do
 * header e um hook morto). Estes testes fixam o que a consolidação prometeu:
 *
 *   • UMA assinatura de realtime, com as três escutas (INSERT/UPDATE/DELETE);
 *   • `naoLidas` derivado da MESMA lista que o painel exibe — header e painel não
 *     podem divergir, que era o sintoma da versão com dois canais;
 *   • mutações otimistas, e `limparTodas` que DESFAZ quando o banco recusa;
 *   • reconexão do canal relê a lista (eventos perdidos não voltam).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockUser = { id: 'user-1' };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

type Ouvinte = {
  onEvento?: (p: unknown) => void;
  onReconectado?: () => void;
};

const assinaturas: Array<{ topico: string; escutas: unknown[]; ouvinte: Ouvinte }> = [];
const cancelamentos = vi.fn();

vi.mock('@/lib/realtime', () => ({
  assinarTabela: (
    assinatura: { topico: string; escutas: unknown[] },
    ouvinte: Ouvinte,
  ) => {
    assinaturas.push({ ...assinatura, ouvinte });
    return () => cancelamentos(assinatura.topico);
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let listaDoBanco: Array<Record<string, unknown>> = [];
let limparRetorna = true;

const fetchNotificacoesMock  = vi.fn(async () => listaDoBanco);
const marcarComoLidaMock     = vi.fn(async () => {});
const marcarTodasLidasMock   = vi.fn(async () => {});
const excluirMock            = vi.fn(async () => true);
const limparTodasMock        = vi.fn(async () => limparRetorna);

vi.mock('@/services/notificacoes.service', () => ({
  fetchNotificacoes:        (...a: unknown[]) => fetchNotificacoesMock(...(a as [])),
  marcarComoLida:           (...a: unknown[]) => marcarComoLidaMock(...(a as [])),
  marcarTodasLidas:         (...a: unknown[]) => marcarTodasLidasMock(...(a as [])),
  excluirNotificacao:       (...a: unknown[]) => excluirMock(...(a as [])),
  limparTodasNotificacoes:  (...a: unknown[]) => limparTodasMock(...(a as [])),
}));

import { NotificacoesProvider, useNotificacoes } from '../NotificacoesProvider';

// ── Sonda ───────────────────────────────────────────────────────────────────

let api: ReturnType<typeof useNotificacoes>;

function Sonda() {
  api = useNotificacoes();
  return (
    <div>
      <span data-testid="nao-lidas">{api.naoLidas}</span>
      <span data-testid="total">{api.notificacoes.length}</span>
      <span data-testid="pulso">{api.animarBadge ? 'sim' : 'nao'}</span>
    </div>
  );
}

function montar(children: ReactNode = <Sonda />) {
  return render(<NotificacoesProvider>{children}</NotificacoesProvider>);
}

const n = (id: string, lida = false) => ({
  id, titulo: `T-${id}`, mensagem: 'm', lida, criado_em: '2026-07-29T10:00:00Z',
  usuario_id: 'user-1',
});

beforeEach(() => {
  assinaturas.length = 0;
  cancelamentos.mockClear();
  fetchNotificacoesMock.mockClear();
  marcarComoLidaMock.mockClear();
  marcarTodasLidasMock.mockClear();
  excluirMock.mockClear();
  limparTodasMock.mockClear();
  listaDoBanco  = [];
  limparRetorna = true;
});

// ── 1. Assinatura única ─────────────────────────────────────────────────────

describe('NotificacoesProvider — assinatura', () => {
  it('abre UMA assinatura para o usuário, com as três escutas', async () => {
    montar();
    await waitFor(() => expect(fetchNotificacoesMock).toHaveBeenCalled());

    expect(assinaturas).toHaveLength(1);
    expect(assinaturas[0].topico).toBe('rt-notificacoes-user-1');
    expect(assinaturas[0].escutas).toEqual([
      { tabela: 'notificacoes', evento: 'INSERT', filtro: 'usuario_id=eq.user-1' },
      { tabela: 'notificacoes', evento: 'UPDATE', filtro: 'usuario_id=eq.user-1' },
      { tabela: 'notificacoes', evento: 'DELETE', filtro: 'usuario_id=eq.user-1' },
    ]);
  });

  it('cancela a assinatura ao desmontar', async () => {
    const { unmount } = montar();
    await waitFor(() => expect(assinaturas).toHaveLength(1));
    unmount();
    expect(cancelamentos).toHaveBeenCalledWith('rt-notificacoes-user-1');
  });

  it('carrega a lista do banco no mount', async () => {
    listaDoBanco = [n('a'), n('b', true)];
    montar();
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));
    expect(fetchNotificacoesMock).toHaveBeenCalledWith('user-1');
  });
});

// ── 2. naoLidas derivado da mesma lista ─────────────────────────────────────

describe('NotificacoesProvider — contagem de não lidas', () => {
  it('conta apenas as não lidas da lista carregada', async () => {
    listaDoBanco = [n('a'), n('b', true), n('c')];
    montar();
    await waitFor(() => expect(screen.getByTestId('nao-lidas')).toHaveTextContent('2'));
  });

  it('INSERT entra na lista e sobe a contagem', async () => {
    montar();
    await waitFor(() => expect(assinaturas).toHaveLength(1));

    act(() => {
      assinaturas[0].ouvinte.onEvento?.({ eventType: 'INSERT', new: n('nova') });
    });

    expect(screen.getByTestId('total')).toHaveTextContent('1');
    expect(screen.getByTestId('nao-lidas')).toHaveTextContent('1');
  });

  it('INSERT repetido do mesmo id não duplica', async () => {
    montar();
    await waitFor(() => expect(assinaturas).toHaveLength(1));

    act(() => {
      assinaturas[0].ouvinte.onEvento?.({ eventType: 'INSERT', new: n('x') });
      assinaturas[0].ouvinte.onEvento?.({ eventType: 'INSERT', new: n('x') });
    });

    expect(screen.getByTestId('total')).toHaveTextContent('1');
  });

  it('UPDATE marcando lida derruba a contagem sem tirar da lista', async () => {
    listaDoBanco = [n('a')];
    montar();
    await waitFor(() => expect(screen.getByTestId('nao-lidas')).toHaveTextContent('1'));

    act(() => {
      assinaturas[0].ouvinte.onEvento?.({ eventType: 'UPDATE', new: n('a', true) });
    });

    expect(screen.getByTestId('nao-lidas')).toHaveTextContent('0');
    expect(screen.getByTestId('total')).toHaveTextContent('1');
  });

  it('DELETE remove da lista', async () => {
    listaDoBanco = [n('a'), n('b')];
    montar();
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));

    act(() => {
      assinaturas[0].ouvinte.onEvento?.({ eventType: 'DELETE', old: { id: 'a' } });
    });

    expect(screen.getByTestId('total')).toHaveTextContent('1');
  });
});

// ── 3. Pulso do badge ───────────────────────────────────────────────────────

describe('NotificacoesProvider — pulso do badge', () => {
  it('INSERT liga o pulso e ele apaga sozinho', async () => {
    vi.useFakeTimers();
    try {
      montar();
      // fetch inicial resolve nos microtasks
      await act(async () => { await Promise.resolve(); });
      expect(assinaturas).toHaveLength(1);

      act(() => {
        assinaturas[0].ouvinte.onEvento?.({ eventType: 'INSERT', new: n('x') });
      });
      expect(screen.getByTestId('pulso')).toHaveTextContent('sim');

      act(() => { vi.advanceTimersByTime(900); });
      expect(screen.getByTestId('pulso')).toHaveTextContent('nao');
    } finally {
      vi.useRealTimers();
    }
  });

  it('UPDATE não pulsa — só notificação nova pulsa', async () => {
    listaDoBanco = [n('a')];
    montar();
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('1'));

    act(() => {
      assinaturas[0].ouvinte.onEvento?.({ eventType: 'UPDATE', new: n('a', true) });
    });

    expect(screen.getByTestId('pulso')).toHaveTextContent('nao');
  });
});

// ── 4. Mutações ─────────────────────────────────────────────────────────────

describe('NotificacoesProvider — mutações', () => {
  it('marcarLida atualiza a tela antes de esperar o banco', async () => {
    listaDoBanco = [n('a')];
    montar();
    await waitFor(() => expect(screen.getByTestId('nao-lidas')).toHaveTextContent('1'));

    await act(async () => { await api.marcarLida('a'); });

    expect(screen.getByTestId('nao-lidas')).toHaveTextContent('0');
    expect(marcarComoLidaMock).toHaveBeenCalledWith('a');
  });

  it('marcarTodasLidas zera a contagem e persiste para o usuário', async () => {
    listaDoBanco = [n('a'), n('b')];
    montar();
    await waitFor(() => expect(screen.getByTestId('nao-lidas')).toHaveTextContent('2'));

    await act(async () => { await api.marcarTodasLidas(); });

    expect(screen.getByTestId('nao-lidas')).toHaveTextContent('0');
    expect(marcarTodasLidasMock).toHaveBeenCalledWith('user-1');
  });

  it('excluir remove da lista e persiste', async () => {
    listaDoBanco = [n('a'), n('b')];
    montar();
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));

    await act(async () => { await api.excluir('a'); });

    expect(screen.getByTestId('total')).toHaveTextContent('1');
    expect(excluirMock).toHaveBeenCalledWith('a');
  });

  it('limparTodas esvazia a lista quando o banco aceita', async () => {
    listaDoBanco = [n('a'), n('b')];
    montar();
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));

    await act(async () => { await api.limparTodas(); });

    expect(screen.getByTestId('total')).toHaveTextContent('0');
  });

  it('limparTodas RESTAURA a lista quando o banco recusa', async () => {
    // Antes, o delete recusado pela RLS deixava a tela vazia: o usuário achava
    // que tinha limpado e as notificações voltavam no F5 seguinte.
    limparRetorna = false;
    listaDoBanco  = [n('a'), n('b')];
    montar();
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));

    await act(async () => { await api.limparTodas(); });

    expect(screen.getByTestId('total')).toHaveTextContent('2');
  });
});

// ── 5. Reconexão ────────────────────────────────────────────────────────────

describe('NotificacoesProvider — reconexão', () => {
  it('onReconectado relê a lista', async () => {
    listaDoBanco = [n('a')];
    montar();
    await waitFor(() => expect(fetchNotificacoesMock).toHaveBeenCalledTimes(1));

    // Chegou notificação enquanto o canal estava caído: não vem como evento.
    listaDoBanco = [n('a'), n('nova-durante-a-queda')];

    await act(async () => { assinaturas[0].ouvinte.onReconectado?.(); });

    expect(fetchNotificacoesMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));
  });
});
