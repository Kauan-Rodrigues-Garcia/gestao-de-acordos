/**
 * NotificacoesProvider.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * O provider substituiu três implementações que coexistiam (painel, badge do
 * header e um hook morto). Estes testes fixam o que a consolidação prometeu:
 *
 *   • `naoLidas` derivado da MESMA lista que o painel exibe — header e painel não
 *     podem divergir, que era o sintoma da versão com dois canais;
 *   • mutações otimistas, e `limparTodas` que DESFAZ quando o banco recusa;
 *   • reconexão do canal relê a lista (eventos perdidos não voltam).
 *
 * ── A transição de 21/09/2026 (migration 20260921120000) ────────────────────
 * O provider passou a ouvir DOIS caminhos ao mesmo tempo: o broadcast novo no
 * tópico do dono (`notificacoes:<id>`) e o `postgres_changes` antigo, que fica
 * até a tabela sair da publicação. O que estes testes travam é a consequência
 * que importa: a mesma notificação chegando pelos dois caminhos NÃO pode
 * duplicar na lista nem pulsar o badge duas vezes.
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
  onEvento?:      (p: unknown) => void;
  onSinal?:       (p: Record<string, unknown>, sinal?: string) => void;
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

/** O canal de broadcast no tópico do dono (caminho novo). */
const sinal  = () => assinaturas.find(a => a.topico === 'notificacoes:user-1')!;
/** O canal de postgres_changes (caminho antigo, até sair da publicação). */
const tabela = () => assinaturas.find(a => a.topico === 'rt-notificacoes-user-1')!;

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
  it('ouve o broadcast do dono e o postgres_changes, um canal cada', async () => {
    montar();
    await waitFor(() => expect(fetchNotificacoesMock).toHaveBeenCalled());

    expect(assinaturas).toHaveLength(2);

    // Caminho novo: tópico privado do dono, um sinal só.
    expect(sinal().escutas).toEqual([{ sinal: 'nova' }]);

    // Caminho antigo: uma escuta para os três eventos. Eram três, uma por
    // evento, e cada uma é uma linha em `realtime.subscription`.
    expect(tabela().escutas).toEqual([
      { tabela: 'notificacoes', evento: '*', filtro: 'usuario_id=eq.user-1' },
    ]);
  });

  it('cancela os dois canais ao desmontar', async () => {
    const { unmount } = montar();
    await waitFor(() => expect(assinaturas).toHaveLength(2));
    unmount();
    expect(cancelamentos).toHaveBeenCalledWith('notificacoes:user-1');
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
    await waitFor(() => expect(assinaturas).toHaveLength(2));

    act(() => {
      tabela().ouvinte.onEvento?.({ eventType: 'INSERT', new: n('nova') });
    });

    expect(screen.getByTestId('total')).toHaveTextContent('1');
    expect(screen.getByTestId('nao-lidas')).toHaveTextContent('1');
  });

  it('INSERT repetido do mesmo id não duplica', async () => {
    montar();
    await waitFor(() => expect(assinaturas).toHaveLength(2));

    act(() => {
      tabela().ouvinte.onEvento?.({ eventType: 'INSERT', new: n('x') });
      tabela().ouvinte.onEvento?.({ eventType: 'INSERT', new: n('x') });
    });

    expect(screen.getByTestId('total')).toHaveTextContent('1');
  });

  it('UPDATE marcando lida derruba a contagem sem tirar da lista', async () => {
    listaDoBanco = [n('a')];
    montar();
    await waitFor(() => expect(screen.getByTestId('nao-lidas')).toHaveTextContent('1'));

    act(() => {
      tabela().ouvinte.onEvento?.({ eventType: 'UPDATE', new: n('a', true) });
    });

    expect(screen.getByTestId('nao-lidas')).toHaveTextContent('0');
    expect(screen.getByTestId('total')).toHaveTextContent('1');
  });

  it('DELETE remove da lista', async () => {
    listaDoBanco = [n('a'), n('b')];
    montar();
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));

    act(() => {
      tabela().ouvinte.onEvento?.({ eventType: 'DELETE', old: { id: 'a' } });
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
      expect(assinaturas).toHaveLength(2);

      act(() => {
        tabela().ouvinte.onEvento?.({ eventType: 'INSERT', new: n('x') });
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
      tabela().ouvinte.onEvento?.({ eventType: 'UPDATE', new: n('a', true) });
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

    await act(async () => { tabela().ouvinte.onReconectado?.(); });

    expect(fetchNotificacoesMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));
  });
});

// ── 6. Broadcast por dono (migration 20260921120000) ────────────────────────

describe('NotificacoesProvider — sinal do dono', () => {
  it('INSERT pelo broadcast entra na lista e pulsa', async () => {
    montar();
    await waitFor(() => expect(assinaturas).toHaveLength(2));

    act(() => {
      sinal().ouvinte.onSinal?.({ operacao: 'INSERT', notificacao: n('b1') });
    });

    expect(screen.getByTestId('total')).toHaveTextContent('1');
    expect(screen.getByTestId('nao-lidas')).toHaveTextContent('1');
    expect(screen.getByTestId('pulso')).toHaveTextContent('sim');
  });

  it('UPDATE pelo broadcast marca lida sem tirar da lista', async () => {
    listaDoBanco = [n('a')];
    montar();
    await waitFor(() => expect(screen.getByTestId('nao-lidas')).toHaveTextContent('1'));

    act(() => {
      sinal().ouvinte.onSinal?.({ operacao: 'UPDATE', notificacao: n('a', true) });
    });

    expect(screen.getByTestId('nao-lidas')).toHaveTextContent('0');
    expect(screen.getByTestId('total')).toHaveTextContent('1');
  });

  it('DELETE pelo broadcast manda só o id', async () => {
    listaDoBanco = [n('a'), n('b')];
    montar();
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('2'));

    act(() => {
      sinal().ouvinte.onSinal?.({ operacao: 'DELETE', id: 'a' });
    });

    expect(screen.getByTestId('total')).toHaveTextContent('1');
  });

  it('RECARREGAR relê a lista — é o lote grande do mesmo dono', async () => {
    listaDoBanco = [n('a')];
    montar();
    await waitFor(() => expect(fetchNotificacoesMock).toHaveBeenCalledTimes(1));

    listaDoBanco = [n('a', true), n('b', true)];
    await act(async () => { sinal().ouvinte.onSinal?.({ operacao: 'RECARREGAR' }); });

    expect(fetchNotificacoesMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('nao-lidas')).toHaveTextContent('0'));
  });

  it('payload sem notificação não derruba nada', async () => {
    montar();
    await waitFor(() => expect(assinaturas).toHaveLength(2));

    act(() => {
      sinal().ouvinte.onSinal?.({ operacao: 'INSERT' });
      sinal().ouvinte.onSinal?.({});
      sinal().ouvinte.onSinal?.({ operacao: 'COISA_NOVA' });
    });

    expect(screen.getByTestId('total')).toHaveTextContent('0');
  });

  /*
   * O invariante da transição. Enquanto a migration não tirar `notificacoes` da
   * publicação, os dois caminhos entregam a MESMA notificação. Se isto quebrar,
   * o usuário vê a notificação duplicada na lista e ouve o som duas vezes.
   */
  it('a mesma notificação pelos dois caminhos não duplica nem pulsa duas vezes', async () => {
    vi.useFakeTimers();
    try {
      montar();
      await act(async () => { await Promise.resolve(); });
      expect(assinaturas).toHaveLength(2);

      act(() => {
        sinal().ouvinte.onSinal?.({ operacao: 'INSERT', notificacao: n('dupla') });
      });
      expect(screen.getByTestId('total')).toHaveTextContent('1');
      expect(screen.getByTestId('pulso')).toHaveTextContent('sim');

      // O pulso apaga sozinho; se o segundo caminho pulsasse de novo, voltaria.
      act(() => { vi.advanceTimersByTime(900); });
      expect(screen.getByTestId('pulso')).toHaveTextContent('nao');

      act(() => {
        tabela().ouvinte.onEvento?.({ eventType: 'INSERT', new: n('dupla') });
      });

      expect(screen.getByTestId('total')).toHaveTextContent('1');
      expect(screen.getByTestId('pulso')).toHaveTextContent('nao');
    } finally {
      vi.useRealTimers();
    }
  });
});
