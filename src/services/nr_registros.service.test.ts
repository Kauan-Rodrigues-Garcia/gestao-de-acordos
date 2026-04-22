/**
 * nr_registros.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre as 7 funções exportadas do serviço que é a FONTE DE VERDADE do
 * bloqueio de NR/Inscrição. Se este arquivo quebrar, a consequência é
 * tabulações duplicadas — o pior bug que já aconteceu neste projeto.
 *
 * Abordagem: mock chainable PostgrestBuilder-like. O builder retorna `this`
 * em cada método e é thenable: resolve com `{ data, error }` controlados
 * pelo teste. Suporta: select, eq, neq, limit, in, order, upsert, delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do Supabase ────────────────────────────────────────────────────────

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

/**
 * Controlado pelo teste antes de cada chamada.
 * A próxima chamada a um builder que terminar (await) consome esta variável.
 */
let nextResult: MockResult = { data: null, error: null };

/** Registra tudo que foi chamado no builder para asserções posteriores. */
type BuilderCall = {
  table: string;
  operation: 'select' | 'upsert' | 'delete' | null;
  selectCols?: string;
  upsertPayload?: unknown;
  upsertOptions?: unknown;
  filters: Array<[string, string, unknown]>; // [method, col, val]
  limit?: number;
  order?: { col: string; opts?: unknown };
};

const calls: BuilderCall[] = [];
let currentCall: BuilderCall | null = null;

function createBuilder(table: string) {
  currentCall = {
    table,
    operation: null,
    filters: [],
  };
  calls.push(currentCall);

  const builder = {
    select: vi.fn((cols?: string) => {
      currentCall!.operation = 'select';
      currentCall!.selectCols = cols;
      return builder;
    }),
    upsert: vi.fn((payload: unknown, opts?: unknown) => {
      currentCall!.operation = 'upsert';
      currentCall!.upsertPayload = payload;
      currentCall!.upsertOptions = opts;
      return builder;
    }),
    delete: vi.fn(() => {
      currentCall!.operation = 'delete';
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      currentCall!.filters.push(['eq', col, val]);
      return builder;
    }),
    neq: vi.fn((col: string, val: unknown) => {
      currentCall!.filters.push(['neq', col, val]);
      return builder;
    }),
    in: vi.fn((col: string, vals: unknown) => {
      currentCall!.filters.push(['in', col, vals]);
      return builder;
    }),
    limit: vi.fn((n: number) => {
      currentCall!.limit = n;
      return builder;
    }),
    order: vi.fn((col: string, opts?: unknown) => {
      currentCall!.order = { col, opts };
      return builder;
    }),
    // Thenable — quando o código fizer await, consome nextResult.
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
  supabase: {
    from: vi.fn((table: string) => createBuilder(table)),
  },
}));

// Importa o SUT depois do vi.mock.
import {
  verificarNrRegistro,
  registrarNr,
  transferirNr,
  liberarNr,
  liberarNrPorAcordoId,
  fetchNrRegistros,
  verificarNrsEmLote,
} from './nr_registros.service';

beforeEach(() => {
  calls.length = 0;
  currentCall = null;
  nextResult = { data: null, error: null };
});

// ── verificarNrRegistro ─────────────────────────────────────────────────────

describe('verificarNrRegistro', () => {
  it('retorna null sem consultar quando nrValue é vazio/whitespace', async () => {
    const result = await verificarNrRegistro('', 'emp1', 'nr_cliente');
    expect(result).toBeNull();
    expect(calls).toHaveLength(0);

    const result2 = await verificarNrRegistro('   ', 'emp1', 'nr_cliente');
    expect(result2).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('retorna null quando não há conflito (data vazio)', async () => {
    nextResult = { data: [], error: null };
    const r = await verificarNrRegistro('777', 'emp1', 'nr_cliente');
    expect(r).toBeNull();

    expect(calls[0].table).toBe('nr_registros');
    expect(calls[0].operation).toBe('select');
    expect(calls[0].filters).toEqual([
      ['eq', 'empresa_id', 'emp1'],
      ['eq', 'nr_value', '777'],
      ['eq', 'campo', 'nr_cliente'],
    ]);
    expect(calls[0].limit).toBe(1);
  });

  it('retorna NrConflito quando há ocupação, mapeando campos', async () => {
    nextResult = {
      data: [{ id: 'r1', operador_id: 'op1', operador_nome: 'Maria', acordo_id: 'a1' }],
      error: null,
    };
    const r = await verificarNrRegistro('777', 'emp1', 'nr_cliente');
    expect(r).toEqual({
      registroId: 'r1',
      acordoId: 'a1',
      operadorId: 'op1',
      operadorNome: 'Maria',
    });
  });

  it('aplica fallback "Operador desconhecido" quando operador_nome é null', async () => {
    nextResult = {
      data: [{ id: 'r1', operador_id: 'op1', operador_nome: null, acordo_id: 'a1' }],
      error: null,
    };
    const r = await verificarNrRegistro('777', 'emp1', 'nr_cliente');
    expect(r?.operadorNome).toBe('Operador desconhecido');
  });

  it('adiciona filtro .neq quando acordoIdExcluir é fornecido (usado na edição)', async () => {
    nextResult = { data: [], error: null };
    await verificarNrRegistro('777', 'emp1', 'instituicao', 'acordo-x');

    // O filtro neq deve estar presente, usado para excluir o próprio acordo.
    expect(calls[0].filters).toContainEqual(['neq', 'acordo_id', 'acordo-x']);
    expect(calls[0].filters).toContainEqual(['eq', 'campo', 'instituicao']);
  });

  it('faz trim do nrValue antes de consultar', async () => {
    nextResult = { data: [], error: null };
    await verificarNrRegistro('  777 ', 'emp1', 'nr_cliente');
    expect(calls[0].filters).toContainEqual(['eq', 'nr_value', '777']);
  });
});

// ── registrarNr ─────────────────────────────────────────────────────────────

describe('registrarNr', () => {
  it('retorna ok:true sem consultar quando nrValue é vazio', async () => {
    const r = await registrarNr({
      empresaId: 'e1', nrValue: '   ', campo: 'nr_cliente',
      operadorId: 'op1', operadorNome: 'Maria', acordoId: 'a1',
    });
    expect(r).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it('faz upsert com onConflict e retorna ok:true', async () => {
    nextResult = { data: null, error: null };
    const r = await registrarNr({
      empresaId: 'e1', nrValue: '777', campo: 'nr_cliente',
      operadorId: 'op1', operadorNome: 'Maria', acordoId: 'a1',
    });
    expect(r).toEqual({ ok: true });
    expect(calls[0].operation).toBe('upsert');
    expect(calls[0].upsertPayload).toMatchObject({
      empresa_id: 'e1', nr_value: '777', campo: 'nr_cliente',
      operador_id: 'op1', operador_nome: 'Maria', acordo_id: 'a1',
    });
    expect(calls[0].upsertOptions).toEqual({ onConflict: 'empresa_id,nr_value,campo' });
  });

  it('retorna ok:false com mensagem quando upsert falha', async () => {
    nextResult = { data: null, error: { message: 'RLS denied' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await registrarNr({
      empresaId: 'e1', nrValue: '777', campo: 'nr_cliente',
      operadorId: 'op1', operadorNome: 'Maria', acordoId: 'a1',
    });
    expect(r).toEqual({ ok: false, error: 'RLS denied' });
    warn.mockRestore();
  });

  it('faz trim do nrValue antes do upsert', async () => {
    nextResult = { data: null, error: null };
    await registrarNr({
      empresaId: 'e1', nrValue: '  777  ', campo: 'nr_cliente',
      operadorId: 'op1', operadorNome: 'Maria', acordoId: 'a1',
    });
    expect(calls[0].upsertPayload).toMatchObject({ nr_value: '777' });
  });
});

// ── transferirNr ────────────────────────────────────────────────────────────

describe('transferirNr', () => {
  it('é no-op quando nrValue vazio', async () => {
    const r = await transferirNr({
      empresaId: 'e1', nrValue: '', campo: 'nr_cliente',
      novoOperadorId: 'op2', novoOperadorNome: 'João', novoAcordoId: 'a2',
    });
    expect(r).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it('faz upsert transferindo titularidade e retorna ok:true', async () => {
    nextResult = { data: null, error: null };
    const r = await transferirNr({
      empresaId: 'e1', nrValue: '777', campo: 'instituicao',
      novoOperadorId: 'op2', novoOperadorNome: 'João', novoAcordoId: 'a2',
    });
    expect(r).toEqual({ ok: true });
    expect(calls[0].upsertPayload).toMatchObject({
      empresa_id: 'e1', nr_value: '777', campo: 'instituicao',
      operador_id: 'op2', operador_nome: 'João', acordo_id: 'a2',
    });
    expect(calls[0].upsertOptions).toEqual({ onConflict: 'empresa_id,nr_value,campo' });
  });

  it('propaga erro quando upsert falha', async () => {
    nextResult = { data: null, error: { message: 'conflict' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await transferirNr({
      empresaId: 'e1', nrValue: '777', campo: 'nr_cliente',
      novoOperadorId: 'op2', novoOperadorNome: 'João', novoAcordoId: 'a2',
    });
    expect(r).toEqual({ ok: false, error: 'conflict' });
    warn.mockRestore();
  });
});

// ── liberarNr ───────────────────────────────────────────────────────────────

describe('liberarNr', () => {
  it('é no-op quando nrValue vazio', async () => {
    const r = await liberarNr({ empresaId: 'e1', nrValue: '', campo: 'nr_cliente' });
    expect(r).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it('faz delete com os 3 filtros corretos', async () => {
    nextResult = { data: null, error: null };
    const r = await liberarNr({ empresaId: 'e1', nrValue: ' 777 ', campo: 'nr_cliente' });
    expect(r).toEqual({ ok: true });
    expect(calls[0].operation).toBe('delete');
    expect(calls[0].filters).toEqual([
      ['eq', 'empresa_id', 'e1'],
      ['eq', 'nr_value', '777'],
      ['eq', 'campo', 'nr_cliente'],
    ]);
  });

  it('retorna erro quando delete falha', async () => {
    nextResult = { data: null, error: { message: 'forbidden' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await liberarNr({ empresaId: 'e1', nrValue: '777', campo: 'nr_cliente' });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
    warn.mockRestore();
  });
});

// ── liberarNrPorAcordoId ────────────────────────────────────────────────────

describe('liberarNrPorAcordoId', () => {
  it('é no-op com acordoId vazio', async () => {
    const r = await liberarNrPorAcordoId('');
    expect(r).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });

  it('deleta por acordo_id', async () => {
    nextResult = { data: null, error: null };
    const r = await liberarNrPorAcordoId('a1');
    expect(r).toEqual({ ok: true });
    expect(calls[0].operation).toBe('delete');
    expect(calls[0].filters).toEqual([['eq', 'acordo_id', 'a1']]);
  });

  it('retorna erro quando delete falha', async () => {
    nextResult = { data: null, error: { message: 'nope' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await liberarNrPorAcordoId('a1');
    expect(r).toEqual({ ok: false, error: 'nope' });
    warn.mockRestore();
  });
});

// ── fetchNrRegistros ────────────────────────────────────────────────────────

describe('fetchNrRegistros', () => {
  it('retorna lista ordenada por atualizado_em desc', async () => {
    nextResult = {
      data: [{ id: 'r1', nr_value: '777' }, { id: 'r2', nr_value: '888' }],
      error: null,
    };
    const r = await fetchNrRegistros('e1');
    expect(r).toHaveLength(2);
    expect(calls[0].order).toEqual({ col: 'atualizado_em', opts: { ascending: false } });
    expect(calls[0].filters).toContainEqual(['eq', 'empresa_id', 'e1']);
  });

  it('retorna [] quando há erro', async () => {
    nextResult = { data: null, error: { message: 'fail' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await fetchNrRegistros('e1');
    expect(r).toEqual([]);
    warn.mockRestore();
  });

  it('retorna [] quando data é null sem erro', async () => {
    nextResult = { data: null, error: null };
    const r = await fetchNrRegistros('e1');
    expect(r).toEqual([]);
  });
});

// ── verificarNrsEmLote ──────────────────────────────────────────────────────

describe('verificarNrsEmLote', () => {
  it('retorna Map vazio sem consultar quando lista vazia', async () => {
    const m = await verificarNrsEmLote([], 'e1', 'nr_cliente');
    expect(m.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('retorna Map vazio quando só há strings vazias/whitespace', async () => {
    const m = await verificarNrsEmLote(['', '  ', '\t'], 'e1', 'nr_cliente');
    expect(m.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('deduplica e trima entradas antes de consultar', async () => {
    nextResult = { data: [], error: null };
    await verificarNrsEmLote(['777', ' 777 ', '888', '888'], 'e1', 'nr_cliente');
    const inFilter = calls[0].filters.find(f => f[0] === 'in');
    expect(inFilter).toBeTruthy();
    // Valores normalizados, sem duplicatas.
    expect((inFilter![2] as string[]).sort()).toEqual(['777', '888']);
  });

  it('constroi Map indexado por nr_value com conflitos encontrados', async () => {
    nextResult = {
      data: [
        { id: 'r1', nr_value: '777', operador_id: 'op1', operador_nome: 'Maria', acordo_id: 'a1' },
        { id: 'r2', nr_value: '888', operador_id: 'op2', operador_nome: null,    acordo_id: 'a2' },
      ],
      error: null,
    };
    const m = await verificarNrsEmLote(['777', '888', '999'], 'e1', 'nr_cliente');
    expect(m.size).toBe(2);
    expect(m.get('777')).toEqual({
      registroId: 'r1', acordoId: 'a1', operadorId: 'op1', operadorNome: 'Maria',
    });
    expect(m.get('888')?.operadorNome).toBe('Operador desconhecido');
    expect(m.get('999')).toBeUndefined();
  });
});
