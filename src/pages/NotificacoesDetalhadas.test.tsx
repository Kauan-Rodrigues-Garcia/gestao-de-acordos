/**
 * NotificacoesDetalhadas.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Testes da página /notificacoes — NotificacoesDetalhadas.tsx
 *
 * Stack: Vitest 4.1 + @testing-library/react 16 + happy-dom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Notificacao } from '@/lib/supabase';

// ── Mocks compartilhados via vi.hoisted ──────────────────────────────────

const mocks = vi.hoisted(() => ({
  supabaseCalls: [] as Array<any>,
  channelCalls: [] as Array<any>,
  nextResults: {} as Record<string, { data?: unknown; error?: { message: string } | null }>,
  realtimeCallback: null as null | (() => void),
}));

// 1) supabase — builder thenable com fila por tabela
vi.mock('@/lib/supabase', () => {
  const from = (table: string) => {
    const call: any = { table, filters: [], operation: null, payload: null };
    mocks.supabaseCalls.push(call);
    const builder: any = {
      select: (arg?: unknown) => {
        call.operation ??= 'select';
        call.selectArg = arg;
        return builder;
      },
      insert: (p: unknown) => {
        call.operation = 'insert';
        call.payload = p;
        return builder;
      },
      update: (p: unknown) => {
        call.operation = 'update';
        call.payload = p;
        return builder;
      },
      delete: () => {
        call.operation = 'delete';
        return builder;
      },
      eq: (c: string, v: unknown) => {
        call.filters.push(['eq', c, v]);
        return builder;
      },
      gte: (c: string, v: unknown) => {
        call.filters.push(['gte', c, v]);
        return builder;
      },
      order: (c: string, o?: unknown) => {
        call.order = { c, o };
        return builder;
      },
      limit: (n: number) => {
        call.limit = n;
        return builder;
      },
      then: (resolve: any, reject: any) =>
        Promise.resolve(
          mocks.nextResults[table] ?? { data: [], error: null }
        ).then(resolve, reject),
    };
    return builder;
  };

  const channel = (name: string) => {
    const ch: any = { name };
    ch.on = (_event: string, _filter: any, cb: () => void) => {
      mocks.realtimeCallback = cb;
      return ch;
    };
    ch.subscribe = () => ch;
    return ch;
  };

  return {
    supabase: {
      from,
      channel,
      removeChannel: vi.fn(),
    },
    // Exportar o tipo para que o import no componente funcione
    Notificacao: undefined,
  };
});

// 2) useAuth — user fixo
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// 3) framer-motion — stub via Proxy (versão JSX-compatível)
vi.mock('framer-motion', () => {
  const handler = {
    get: (_: any, tag: string) =>
      (props: any) => {
        const { children, layout, initial, animate, exit, ...rest } = props ?? {};
        return React.createElement('div', rest, children);
      },
  };
  return {
    motion: new Proxy({}, handler),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

// 4) ScrollArea — stub leve
vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: any) => React.createElement('div', null, children),
}));

// ── Import do componente (após todos os mocks) ───────────────────────────
import NotificacoesDetalhadas from './NotificacoesDetalhadas';

// ── Helpers de dados ─────────────────────────────────────────────────────

/** Data fixa do sistema: 2026-04-22T14:00:00-03:00 (=2026-04-22T17:00:00Z) */
const NOW_ISO = '2026-04-22T17:00:00.000Z';

function makeNotif(over: Partial<any> = {}): any {
  return {
    id: crypto.randomUUID(),
    usuario_id: 'user-1',
    titulo: 'Título',
    mensagem: 'Mensagem',
    lida: false,
    // 1h antes do "now" fixo
    criado_em: new Date('2026-04-22T16:00:00.000Z').toISOString(),
    empresa_id: null,
    ...over,
  } as unknown as Notificacao;
}

/** Retorna ISO para "hoje" às 10h UTC (dentro do dia 22/04/2026) */
function hojeISO(hh = 10) {
  return new Date(`2026-04-22T${String(hh).padStart(2, '0')}:00:00.000Z`).toISOString();
}

/** Retorna ISO para "ontem" às 10h UTC (21/04/2026) */
function ontemISO() {
  return new Date('2026-04-21T10:00:00.000Z').toISOString();
}

/** Retorna ISO para "N dias atrás" às 10h UTC */
function diasAtrasISO(n: number) {
  const d = new Date('2026-04-22T17:00:00.000Z');
  d.setDate(d.getDate() - n);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

// ── Setup / Teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  mocks.supabaseCalls.length = 0;
  mocks.channelCalls.length = 0;
  mocks.nextResults = {};
  mocks.realtimeCallback = null;

  // Data fixa: 2026-04-22T14:00 BRT
  // Usamos shouldAdvanceTime:false + toFake apenas para Date, sem bloquear Promises/setTimeout
  vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW_ISO));

  // confirm retorna true por padrão (pode ser sobrescrito por teste)
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});


// ── Testes ────────────────────────────────────────────────────────────────

describe('NotificacoesDetalhadas', () => {
  // ── 1. Render inicial — estado de carregamento ──────────────────────────
  it('exibe "Carregando notificações..." no primeiro render e depois estado vazio', async () => {
    // nextResults não configurado → fallback { data: [], error: null }
    render(<NotificacoesDetalhadas />);

    // Deve mostrar carregando imediatamente (antes do fetch resolver)
    expect(screen.getByText('Carregando notificações...')).toBeInTheDocument();

    // Após o fetch resolver (lista vazia), mostra estado vazio
    await waitFor(() => {
      expect(
        screen.getByText('Sem notificações nos últimos 5 dias.')
      ).toBeInTheDocument();
    });
  });

  // ── 2. Lista carregada + agrupamento por dia ────────────────────────────
  it('agrupa notificações por Hoje / Ontem / dia da semana formatado', async () => {
    const n1 = makeNotif({ titulo: 'Notif Hoje',   criado_em: hojeISO(10) });
    const n2 = makeNotif({ titulo: 'Notif Ontem',  criado_em: ontemISO() });
    const n3 = makeNotif({ titulo: 'Notif 3 dias', criado_em: diasAtrasISO(3) });

    mocks.nextResults['notificacoes'] = { data: [n1, n2, n3], error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Notif Hoje')).toBeInTheDocument();
    });

    // Headers de grupos
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('Ontem')).toBeInTheDocument();
    // O 3° grupo deve ter o label do dia da semana (não "Hoje" nem "Ontem")
    expect(screen.queryAllByText('Hoje').length).toBe(1);
    expect(screen.queryAllByText('Ontem').length).toBe(1);

    // Contagem "(1)" em cada grupo
    const parenteseCounts = screen.queryAllByText('(1)');
    expect(parenteseCounts.length).toBeGreaterThanOrEqual(3);

    // Todos os títulos visíveis
    expect(screen.getByText('Notif Hoje')).toBeInTheDocument();
    expect(screen.getByText('Notif Ontem')).toBeInTheDocument();
    expect(screen.getByText('Notif 3 dias')).toBeInTheDocument();
  });

  // ── 3. Query correta ao Supabase ────────────────────────────────────────
  it('realiza a query correta: usuario_id, gte 5 dias, order desc, limit 500', async () => {
    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(mocks.supabaseCalls.length).toBeGreaterThanOrEqual(1);
    });

    const call = mocks.supabaseCalls[0];
    expect(call.table).toBe('notificacoes');
    expect(call.operation).toBe('select');
    expect(call.limit).toBe(500);
    expect(call.order).toMatchObject({ c: 'criado_em', o: { ascending: false } });

    // Filtros: eq usuario_id=user-1 e gte criado_em=<5 dias atrás>
    const eqFilter = call.filters.find((f: any) => f[0] === 'eq' && f[1] === 'usuario_id');
    expect(eqFilter).toBeDefined();
    expect(eqFilter[2]).toBe('user-1');

    const gteFilter = call.filters.find((f: any) => f[0] === 'gte' && f[1] === 'criado_em');
    expect(gteFilter).toBeDefined();
    // A data deve ser aproximadamente 5 dias atrás
    const cincoDiasAtras = new Date(Date.now() - 5 * 86_400_000);
    const filtroData = new Date(gteFilter[2] as string);
    // Tolerância de 60 segundos
    expect(Math.abs(filtroData.getTime() - cincoDiasAtras.getTime())).toBeLessThan(60_000);
  });

  // ── 4. Contagem de não lidas no header ──────────────────────────────────
  it('exibe "· 2 não lidas" no subtítulo quando há 2 não lidas de 3', async () => {
    const notifs = [
      makeNotif({ lida: false }),
      makeNotif({ lida: false }),
      makeNotif({ lida: true }),
    ];
    mocks.nextResults['notificacoes'] = { data: notifs, error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      // Pode haver múltiplos elementos com "2 não lidas" (header global + badge de grupo)
      const elements = screen.getAllByText(/2 não lidas/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 5. Filtro textual — filtra e limpa ──────────────────────────────────
  it('filtra por texto parcial no título e volta ao normal ao limpar', async () => {
    const n1 = makeNotif({ titulo: 'Acordo Extra',   criado_em: hojeISO(10) });
    const n2 = makeNotif({ titulo: 'Pagamento Recebido', criado_em: hojeISO(9) });
    const n3 = makeNotif({ titulo: 'Aviso Importante', criado_em: hojeISO(8) });

    mocks.nextResults['notificacoes'] = { data: [n1, n2, n3], error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Acordo Extra')).toBeInTheDocument();
    });

    // Digitar 'pagam' — só sobra "Pagamento Recebido"
    const input = screen.getByPlaceholderText(/Pesquisar por título ou mensagem/i);
    await userEvent.type(input, 'pagam');

    await waitFor(() => {
      expect(screen.queryByText('Acordo Extra')).not.toBeInTheDocument();
      expect(screen.queryByText('Aviso Importante')).not.toBeInTheDocument();
      expect(screen.getByText('Pagamento Recebido')).toBeInTheDocument();
    });

    // O grupo "Hoje" deve ter contagem (1)
    expect(screen.getByText('(1)')).toBeInTheDocument();

    // Limpar filtro — voltam todas
    await userEvent.clear(input);

    await waitFor(() => {
      expect(screen.getByText('Acordo Extra')).toBeInTheDocument();
      expect(screen.getByText('Pagamento Recebido')).toBeInTheDocument();
      expect(screen.getByText('Aviso Importante')).toBeInTheDocument();
    });
  });

  // ── 6. Filtro sem resultado ─────────────────────────────────────────────
  it('exibe mensagem específica quando filtro não bate com nenhuma notificação', async () => {
    mocks.nextResults['notificacoes'] = {
      data: [makeNotif({ titulo: 'Titulo normal' })],
      error: null,
    };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Titulo normal')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Pesquisar por título ou mensagem/i);
    await userEvent.type(input, 'xyznonexistent');

    await waitFor(() => {
      expect(
        screen.getByText('Nenhuma notificação corresponde à busca.')
      ).toBeInTheDocument();
    });
  });

  // ── 7. marcarLida ──────────────────────────────────────────────────────
  it('chama update com {lida:true} e filtro id ao clicar em "Marcar como lida"', async () => {
    const notif = makeNotif({ lida: false, titulo: 'Para marcar' });
    mocks.nextResults['notificacoes'] = { data: [notif], error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Para marcar')).toBeInTheDocument();
    });

    const btn = screen.getByTitle('Marcar como lida');
    fireEvent.click(btn);

    await waitFor(() => {
      const updateCall = mocks.supabaseCalls.find(
        c => c.table === 'notificacoes' && c.operation === 'update'
      );
      expect(updateCall).toBeDefined();
      expect(updateCall.payload).toEqual({ lida: true });
      const idFilter = updateCall.filters.find((f: any) => f[0] === 'eq' && f[1] === 'id');
      expect(idFilter).toBeDefined();
      expect(idFilter[2]).toBe(notif.id);
    });
  });

  // ── 8. marcarTodasLidas ────────────────────────────────────────────────
  it('clica "Marcar todas lidas" e dispara update correto', async () => {
    const notifs = [
      makeNotif({ lida: false }),
      makeNotif({ lida: false }),
    ];
    mocks.nextResults['notificacoes'] = { data: notifs, error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Marcar todas lidas')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Marcar todas lidas'));

    await waitFor(() => {
      const updateCall = mocks.supabaseCalls.find(
        c => c.table === 'notificacoes' &&
             c.operation === 'update' &&
             c.filters.some((f: any) => f[0] === 'eq' && f[1] === 'lida')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall.payload).toEqual({ lida: true });

      const userFilter = updateCall.filters.find((f: any) => f[1] === 'usuario_id');
      expect(userFilter[2]).toBe('user-1');

      const lidaFilter = updateCall.filters.find((f: any) => f[1] === 'lida');
      expect(lidaFilter[2]).toBe(false);
    });
  });

  // ── 9. excluirNotificacao ──────────────────────────────────────────────
  it('chama delete com filtro id ao clicar em "Excluir"', async () => {
    const notif = makeNotif({ titulo: 'Para excluir' });
    mocks.nextResults['notificacoes'] = { data: [notif], error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Para excluir')).toBeInTheDocument();
    });

    const btn = screen.getByTitle('Excluir');
    fireEvent.click(btn);

    await waitFor(() => {
      const deleteCall = mocks.supabaseCalls.find(
        c => c.table === 'notificacoes' && c.operation === 'delete' &&
             c.filters.some((f: any) => f[1] === 'id')
      );
      expect(deleteCall).toBeDefined();
      const idFilter = deleteCall.filters.find((f: any) => f[1] === 'id');
      expect(idFilter[2]).toBe(notif.id);
    });
  });

  // ── 10. Limpar todas com confirm=false não executa ─────────────────────
  it('não executa delete quando confirm retorna false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));

    const notif = makeNotif();
    mocks.nextResults['notificacoes'] = { data: [notif], error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Limpar todas')).toBeInTheDocument();
    });

    const callsAntes = mocks.supabaseCalls.length;
    fireEvent.click(screen.getByText('Limpar todas'));

    // Aguarda um tick e garante que nenhum delete foi adicionado
    await act(async () => {});
    const deleteCall = mocks.supabaseCalls.slice(callsAntes).find(
      c => c.operation === 'delete'
    );
    expect(deleteCall).toBeUndefined();
  });

  // ── 11. Limpar todas com confirm=true executa delete + recarrega ────────
  it('executa delete por usuario_id e depois recarrega quando confirm=true', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));

    const notif = makeNotif();
    mocks.nextResults['notificacoes'] = { data: [notif], error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Limpar todas')).toBeInTheDocument();
    });

    const callsAntes = mocks.supabaseCalls.length;

    // Após "Limpar todas", lista ficará vazia
    mocks.nextResults['notificacoes'] = { data: [], error: null };

    fireEvent.click(screen.getByText('Limpar todas'));

    await waitFor(() => {
      // Deve existir um delete com filtro usuario_id
      const deleteCall = mocks.supabaseCalls.slice(callsAntes).find(
        c => c.table === 'notificacoes' &&
             c.operation === 'delete' &&
             c.filters.some((f: any) => f[1] === 'usuario_id')
      );
      expect(deleteCall).toBeDefined();
      const uidFilter = deleteCall.filters.find((f: any) => f[1] === 'usuario_id');
      expect(uidFilter[2]).toBe('user-1');

      // E um novo select (recarregamento)
      const selectCalls = mocks.supabaseCalls.slice(callsAntes).filter(
        c => c.operation === 'select'
      );
      expect(selectCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 12. Erro ao carregar — mensagem + "Tentar novamente" ────────────────
  it('mostra mensagem de erro e re-carrega ao clicar em "Tentar novamente"', async () => {
    mocks.nextResults['notificacoes'] = { data: null, error: { message: 'rls denied' } };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(
        screen.getByText('Erro ao carregar notificações — tente novamente.')
      ).toBeInTheDocument();
      expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
    });

    // Trocar resultado para sucesso
    const notif = makeNotif({ titulo: 'Recuperado' });
    mocks.nextResults['notificacoes'] = { data: [notif], error: null };

    fireEvent.click(screen.getByText('Tentar novamente'));

    await waitFor(() => {
      expect(screen.getByText('Recuperado')).toBeInTheDocument();
      expect(
        screen.queryByText('Erro ao carregar notificações — tente novamente.')
      ).not.toBeInTheDocument();
    });
  });

  // ── 13. Realtime callback recarrega lista ──────────────────────────────
  it('recarrega a lista quando a callback realtime é disparada', async () => {
    const notifOriginal = makeNotif({ titulo: 'Notif Original' });
    mocks.nextResults['notificacoes'] = { data: [notifOriginal], error: null };

    render(<NotificacoesDetalhadas />);

    await waitFor(() => {
      expect(screen.getByText('Notif Original')).toBeInTheDocument();
    });

    // Garantir que a callback foi registrada
    expect(mocks.realtimeCallback).not.toBeNull();

    // Mudar resultado e disparar evento realtime
    const notifNova = makeNotif({ titulo: 'Notif Nova Via Realtime' });
    mocks.nextResults['notificacoes'] = { data: [notifNova], error: null };

    act(() => {
      mocks.realtimeCallback!();
    });

    await waitFor(() => {
      expect(screen.getByText('Notif Nova Via Realtime')).toBeInTheDocument();
    });
  });
});
