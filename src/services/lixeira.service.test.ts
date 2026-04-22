/**
 * lixeira.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre as 4 funções exportadas do serviço de lixeira:
 *   - enviarParaLixeira (snapshot completo + motivo + autorização)
 *   - fetchLixeira (lista ordenada por excluido_em desc, com limit)
 *   - esvaziarLixeira (delete por empresa)
 *   - deletarItemLixeira (delete por id)
 *
 * Abordagem: builder chainable thenable (mesmo padrão adotado em
 * nr_registros.service.test.ts). Permite asserções sobre qual tabela,
 * operação, payload, filtros, limit e order foram disparados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Acordo } from '@/lib/supabase';

// ── Mock do Supabase ────────────────────────────────────────────────────────

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

let nextResult: MockResult = { data: null, error: null };

interface BuilderCall {
  table: string;
  operation: 'insert' | 'select' | 'delete' | null;
  insertPayload?: unknown;
  selectCols?: string;
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
    insert: vi.fn((payload: unknown) => {
      currentCall!.operation = 'insert';
      currentCall!.insertPayload = payload;
      return builder;
    }),
    select: vi.fn((cols?: string) => {
      // Supabase permite .delete().select(...) para retornar os rows afetados.
      // Só marca 'select' se não for um delete encadeado.
      if (currentCall!.operation !== 'delete') {
        currentCall!.operation = 'select';
      }
      currentCall!.selectCols = cols;
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
    lt: vi.fn((col: string, val: unknown) => {
      currentCall!.filters.push(['lt', col, val]);
      return builder;
    }),
    order: vi.fn((col: string, opts?: unknown) => {
      currentCall!.order = { col, opts };
      return builder;
    }),
    limit: vi.fn((n: number) => {
      currentCall!.limit = n;
      return builder;
    }),
    // Thenable — consumido pelo await.
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

// SUT depois do vi.mock.
import {
  enviarParaLixeira,
  fetchLixeira,
  esvaziarLixeira,
  deletarItemLixeira,
  purgarExpirados,
} from './lixeira.service';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAcordo(overrides: Partial<Acordo> = {}): Acordo {
  return {
    id: 'a-1',
    nome_cliente: 'João Teste',
    nr_cliente: '777',
    instituicao: null,
    vencimento: '2026-05-10',
    valor: 150,
    tipo: 'pix',
    parcelas: 1,
    whatsapp: null,
    observacoes: 'Obs teste',
    status: 'pago',
    operador_id: 'op-1',
    empresa_id: 'emp-1',
    ...overrides,
  } as unknown as Acordo;
}

beforeEach(() => {
  calls.length = 0;
  currentCall = null;
  nextResult = { data: null, error: null };
});

// ── enviarParaLixeira ───────────────────────────────────────────────────────

describe('enviarParaLixeira', () => {
  it('faz insert na tabela lixeira_acordos com todos os campos preenchidos', async () => {
    nextResult = { data: null, error: null };
    const acordo = makeAcordo();
    const r = await enviarParaLixeira({
      acordo,
      motivo: 'transferencia_nr',
      operadorNome: 'Op Antigo',
      autorizadoPorId: 'lider-1',
      autorizadoPorNome: 'Líder Teste',
      transferidoParaId: 'novo-op',
      transferidoParaNome: 'Op Novo',
    });

    expect(r).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('lixeira_acordos');
    expect(calls[0].operation).toBe('insert');

    // Valida todos os campos copiados do acordo + metadados de autorização.
    expect(calls[0].insertPayload).toMatchObject({
      acordo_id:             'a-1',
      empresa_id:            'emp-1',
      operador_id:           'op-1',
      operador_nome:         'Op Antigo',
      nome_cliente:          'João Teste',
      nr_cliente:            '777',
      valor:                 150,
      vencimento:            '2026-05-10',
      tipo:                  'pix',
      status:                'pago',
      observacoes:           'Obs teste',
      instituicao:           null,
      motivo:                'transferencia_nr',
      autorizado_por_id:     'lider-1',
      autorizado_por_nome:   'Líder Teste',
      transferido_para_id:   'novo-op',
      transferido_para_nome: 'Op Novo',
    });

    // `dados_completos` deve carregar o snapshot inteiro do acordo.
    const payload = calls[0].insertPayload as { dados_completos: Record<string, unknown> };
    expect(payload.dados_completos).toMatchObject({ id: 'a-1', nr_cliente: '777' });
  });

  it('preenche nulls para campos opcionais não informados (exclusao manual)', async () => {
    nextResult = { data: null, error: null };
    const acordo = makeAcordo();
    const r = await enviarParaLixeira({
      acordo,
      motivo: 'exclusao_manual',
      // sem operadorNome, sem autorização, sem transferência
    });

    expect(r).toEqual({ ok: true });
    expect(calls[0].insertPayload).toMatchObject({
      motivo:                'exclusao_manual',
      operador_nome:         null,
      autorizado_por_id:     null,
      autorizado_por_nome:   null,
      transferido_para_id:   null,
      transferido_para_nome: null,
    });
  });

  it('aceita acordo com campos vazios/ausentes (fallback null)', async () => {
    nextResult = { data: null, error: null };
    // Acordo com vários campos ausentes: empresa_id, observacoes, instituicao null.
    const acordo = makeAcordo({
      empresa_id: undefined,
      observacoes: undefined,
      instituicao: undefined,
      valor: undefined,
      vencimento: undefined,
    } as Partial<Acordo>);
    const r = await enviarParaLixeira({ acordo, motivo: 'exclusao_manual' });

    expect(r).toEqual({ ok: true });
    expect(calls[0].insertPayload).toMatchObject({
      empresa_id:  null,
      observacoes: null,
      instituicao: null,
      valor:       null,
      vencimento:  null,
    });
  });

  it('retorna ok:false com mensagem quando o insert falha (RLS)', async () => {
    nextResult = { data: null, error: { message: 'permission denied' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await enviarParaLixeira({ acordo: makeAcordo(), motivo: 'exclusao_manual' });

    expect(r).toEqual({ ok: false, error: 'permission denied' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ── fetchLixeira ────────────────────────────────────────────────────────────

describe('fetchLixeira', () => {
  it('retorna lista ordenada por excluido_em desc com limit default 200', async () => {
    nextResult = {
      data: [
        { id: 'l1', acordo_id: 'a1', nome_cliente: 'C1' },
        { id: 'l2', acordo_id: 'a2', nome_cliente: 'C2' },
      ],
      error: null,
    };

    const r = await fetchLixeira('emp-1');

    expect(r).toHaveLength(2);
    expect(calls[0].table).toBe('lixeira_acordos');
    expect(calls[0].operation).toBe('select');
    expect(calls[0].filters).toContainEqual(['eq', 'empresa_id', 'emp-1']);
    expect(calls[0].order).toEqual({ col: 'excluido_em', opts: { ascending: false } });
    expect(calls[0].limit).toBe(200);
  });

  it('respeita limit customizado', async () => {
    nextResult = { data: [], error: null };
    await fetchLixeira('emp-1', 50);
    expect(calls[0].limit).toBe(50);
  });

  it('retorna [] quando há erro', async () => {
    nextResult = { data: null, error: { message: 'fail' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await fetchLixeira('emp-1');

    expect(r).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('retorna [] quando data é null sem erro', async () => {
    nextResult = { data: null, error: null };
    const r = await fetchLixeira('emp-1');
    expect(r).toEqual([]);
  });
});

// ── esvaziarLixeira ─────────────────────────────────────────────────────────

describe('esvaziarLixeira', () => {
  it('deleta todos os itens da empresa', async () => {
    nextResult = { data: null, error: null };
    const r = await esvaziarLixeira('emp-1');

    expect(r).toEqual({ ok: true });
    expect(calls[0].operation).toBe('delete');
    expect(calls[0].filters).toEqual([['eq', 'empresa_id', 'emp-1']]);
  });

  it('retorna erro quando delete falha', async () => {
    nextResult = { data: null, error: { message: 'forbidden' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await esvaziarLixeira('emp-1');

    expect(r).toEqual({ ok: false, error: 'forbidden' });
    warn.mockRestore();
  });
});

// ── deletarItemLixeira ──────────────────────────────────────────────────────

describe('deletarItemLixeira', () => {
  it('deleta apenas o item especificado por id', async () => {
    nextResult = { data: null, error: null };
    const r = await deletarItemLixeira('item-1');

    expect(r).toEqual({ ok: true });
    expect(calls[0].operation).toBe('delete');
    expect(calls[0].filters).toEqual([['eq', 'id', 'item-1']]);
  });

  it('retorna erro quando delete falha', async () => {
    nextResult = { data: null, error: { message: 'not found' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await deletarItemLixeira('item-1');

    expect(r).toEqual({ ok: false, error: 'not found' });
    warn.mockRestore();
  });
});

describe('purgarExpirados (#9 lixeira — purga automática)', () => {
  it('deleta registros cujo expira_em < agora, filtrado por empresa', async () => {
    nextResult = { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], error: null };

    const antes = Date.now();
    const r = await purgarExpirados('emp-1');
    const depois = Date.now();

    expect(r.ok).toBe(true);
    expect(r.deletedCount).toBe(3);
    expect(calls[0].table).toBe('lixeira_acordos');
    expect(calls[0].operation).toBe('delete');

    // Filtro principal: lt em expira_em com ISO timestamp de "agora"
    const filtroLt = calls[0].filters.find(f => f[0] === 'lt' && f[1] === 'expira_em');
    expect(filtroLt).toBeDefined();
    const ts = new Date(filtroLt![2] as string).getTime();
    expect(ts).toBeGreaterThanOrEqual(antes);
    expect(ts).toBeLessThanOrEqual(depois);

    // Escopo por empresa aplicado
    const filtroEmpresa = calls[0].filters.find(f => f[0] === 'eq' && f[1] === 'empresa_id');
    expect(filtroEmpresa).toEqual(['eq', 'empresa_id', 'emp-1']);

    // Usa .select('id') para contar retorno
    expect(calls[0].operation).toBe('delete');
    expect(calls[0].selectCols).toBe('id');
  });

  it('sem empresaId: purga global (sem filtro eq empresa_id)', async () => {
    nextResult = { data: [{ id: 'x' }], error: null };

    const r = await purgarExpirados();

    expect(r.ok).toBe(true);
    expect(r.deletedCount).toBe(1);
    const filtroEmpresa = calls[0].filters.find(f => f[0] === 'eq' && f[1] === 'empresa_id');
    expect(filtroEmpresa).toBeUndefined();
    const filtroLt = calls[0].filters.find(f => f[0] === 'lt' && f[1] === 'expira_em');
    expect(filtroLt).toBeDefined();
  });

  it('quando nada expirou: deletedCount = 0 e ok = true', async () => {
    nextResult = { data: [], error: null };
    const r = await purgarExpirados('emp-2');
    expect(r).toEqual({ ok: true, deletedCount: 0 });
  });

  it('erro no delete: retorna ok=false e deletedCount=0 sem throw', async () => {
    nextResult = { data: null, error: { message: 'rls denied' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await purgarExpirados('emp-3');
    expect(r.ok).toBe(false);
    expect(r.deletedCount).toBe(0);
    expect(r.error).toBe('rls denied');

    warn.mockRestore();
  });

  it('data nula ao final: não quebra, deletedCount = 0', async () => {
    nextResult = { data: null, error: null };
    const r = await purgarExpirados('emp-4');
    expect(r).toEqual({ ok: true, deletedCount: 0 });
  });
});
