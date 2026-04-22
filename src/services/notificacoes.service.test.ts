/**
 * notificacoes.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre as 5 funções exportadas do serviço de notificações:
 *   - fetchNotificacoes (lista ordenada + limit 50)
 *   - marcarComoLida (update lida=true por id)
 *   - marcarTodasLidas (update das não-lidas do usuário)
 *   - limparTodasNotificacoes (delete por usuário)
 *   - criarNotificacao (insert com/sem empresa_id)
 *
 * Serviço crítico: é chamado por AcordoNovoInline (CASO A + CASO B),
 * AcordoDetalheInline (Extra→Direto) e AcordoNovoInline.autorizarTransferencia.
 * Se quebrar, operadores não são avisados de transferências / conversões.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do Supabase (padrão thenable — mesmo de nr_registros e lixeira) ────

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

let nextResult: MockResult = { data: null, error: null };

interface BuilderCall {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete' | null;
  payload?: unknown;
  filters: Array<[string, string, unknown]>;
  limit?: number;
  order?: { col: string; opts?: unknown };
}

const calls: BuilderCall[] = [];
let currentCall: BuilderCall | null = null;

function createBuilder(table: string) {
  currentCall = { table, operation: null, filters: [] };
  calls.push(currentCall);

  const builder = {
    select: vi.fn(() => { currentCall!.operation = 'select'; return builder; }),
    insert: vi.fn((payload: unknown) => { currentCall!.operation = 'insert'; currentCall!.payload = payload; return builder; }),
    update: vi.fn((payload: unknown) => { currentCall!.operation = 'update'; currentCall!.payload = payload; return builder; }),
    delete: vi.fn(() => { currentCall!.operation = 'delete'; return builder; }),
    eq:     vi.fn((col: string, val: unknown) => { currentCall!.filters.push(['eq', col, val]); return builder; }),
    order:  vi.fn((col: string, opts?: unknown) => { currentCall!.order = { col, opts }; return builder; }),
    limit:  vi.fn((n: number) => { currentCall!.limit = n; return builder; }),
    // Thenable.
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(nextResult).then(resolve, reject);
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e);
      }
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)) },
}));

// SUT depois do vi.mock.
import {
  fetchNotificacoes,
  marcarComoLida,
  marcarTodasLidas,
  limparTodasNotificacoes,
  criarNotificacao,
} from './notificacoes.service';

beforeEach(() => {
  calls.length = 0;
  currentCall = null;
  nextResult = { data: null, error: null };
});

// ── fetchNotificacoes ───────────────────────────────────────────────────────

describe('fetchNotificacoes', () => {
  it('retorna lista ordenada por criado_em desc com limit 50', async () => {
    nextResult = {
      data: [
        { id: 'n1', titulo: 'A', lida: false },
        { id: 'n2', titulo: 'B', lida: true },
      ],
      error: null,
    };

    const r = await fetchNotificacoes('user-1');

    expect(r).toHaveLength(2);
    expect(calls[0].table).toBe('notificacoes');
    expect(calls[0].operation).toBe('select');
    expect(calls[0].filters).toEqual([['eq', 'usuario_id', 'user-1']]);
    expect(calls[0].order).toEqual({ col: 'criado_em', opts: { ascending: false } });
    expect(calls[0].limit).toBe(50);
  });

  it('retorna [] quando há erro', async () => {
    nextResult = { data: null, error: { message: 'rls denied' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await fetchNotificacoes('user-1');

    expect(r).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('retorna [] quando data é null sem erro', async () => {
    nextResult = { data: null, error: null };
    const r = await fetchNotificacoes('user-1');
    expect(r).toEqual([]);
  });
});

// ── marcarComoLida ──────────────────────────────────────────────────────────

describe('marcarComoLida', () => {
  it('faz update lida=true pelo id', async () => {
    nextResult = { data: null, error: null };

    await marcarComoLida('notif-1');

    expect(calls[0].table).toBe('notificacoes');
    expect(calls[0].operation).toBe('update');
    expect(calls[0].payload).toEqual({ lida: true });
    expect(calls[0].filters).toEqual([['eq', 'id', 'notif-1']]);
  });

  it('loga warning sem lançar quando update falha', async () => {
    nextResult = { data: null, error: { message: 'fail' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Não deve lançar — retorno é void.
    await expect(marcarComoLida('notif-1')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ── marcarTodasLidas ────────────────────────────────────────────────────────

describe('marcarTodasLidas', () => {
  it('faz update apenas nas não-lidas do usuário', async () => {
    nextResult = { data: null, error: null };

    await marcarTodasLidas('user-1');

    expect(calls[0].operation).toBe('update');
    expect(calls[0].payload).toEqual({ lida: true });
    // Dois filtros: usuario_id + lida=false (para não sobrescrever as já lidas).
    expect(calls[0].filters).toEqual([
      ['eq', 'usuario_id', 'user-1'],
      ['eq', 'lida', false],
    ]);
  });

  it('loga warning sem lançar quando update falha', async () => {
    nextResult = { data: null, error: { message: 'fail' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(marcarTodasLidas('user-1')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ── limparTodasNotificacoes ─────────────────────────────────────────────────

describe('limparTodasNotificacoes', () => {
  it('deleta todas as notificações do usuário', async () => {
    nextResult = { data: null, error: null };

    await limparTodasNotificacoes('user-1');

    expect(calls[0].operation).toBe('delete');
    expect(calls[0].filters).toEqual([['eq', 'usuario_id', 'user-1']]);
  });

  it('loga warning sem lançar quando delete falha', async () => {
    nextResult = { data: null, error: { message: 'fail' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(limparTodasNotificacoes('user-1')).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ── criarNotificacao ────────────────────────────────────────────────────────

describe('criarNotificacao', () => {
  it('faz insert com titulo, mensagem, usuario_id e empresa_id', async () => {
    nextResult = { data: null, error: null };

    await criarNotificacao({
      usuario_id: 'user-1',
      titulo:     '📎 Novo acordo EXTRA',
      mensagem:   'O NR 777 agora possui um acordo extra',
      empresa_id: 'emp-1',
    });

    expect(calls[0].operation).toBe('insert');
    expect(calls[0].payload).toEqual({
      usuario_id: 'user-1',
      titulo:     '📎 Novo acordo EXTRA',
      mensagem:   'O NR 777 agora possui um acordo extra',
      empresa_id: 'emp-1',
    });
  });

  it('faz insert sem empresa_id (campo opcional)', async () => {
    nextResult = { data: null, error: null };

    await criarNotificacao({
      usuario_id: 'user-1',
      titulo:     'Teste',
      mensagem:   'Mensagem simples',
    });

    expect(calls[0].operation).toBe('insert');
    // empresa_id NÃO aparece no payload quando não fornecido — o tipo é opcional.
    expect(calls[0].payload).toEqual({
      usuario_id: 'user-1',
      titulo:     'Teste',
      mensagem:   'Mensagem simples',
    });
  });

  it('loga warning sem lançar quando insert falha', async () => {
    nextResult = { data: null, error: { message: 'rls denied' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(criarNotificacao({
      usuario_id: 'user-1',
      titulo:     'X',
      mensagem:   'Y',
    })).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
