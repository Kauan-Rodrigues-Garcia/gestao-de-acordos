/**
 * src/services/direto_extra.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre as 3 funções exportadas do serviço direto_extra:
 *   - fetchDiretoExtraConfigs  (queries por empresa_id)
 *   - setDiretoExtraConfig     (upsert com payload + onConflict corretos)
 *   - resolverDiretoExtraAtivo (função pura — sem mock de Supabase)
 *
 * Padrão de mock: builder thenable por chamada (closure local, sem estado
 * global de "currentCall"). Cada chamada a `from()` cria um builder isolado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Tipos auxiliares ──────────────────────────────────────────────────────

type MockResult = {
  data: unknown;
  error: { message: string } | null;
};

interface BuilderCall {
  table: string;
  operation: 'select' | 'upsert' | null;
  payload?: unknown;
  upsertOpts?: unknown;
  filters: Array<[string, string, unknown]>;
}

// ── Fila por tabela (resultsByTable) e lista de calls capturadas ──────────

const resultsByTable: Record<string, MockResult[]> = {};
const calls: BuilderCall[] = [];

function dequeueResult(table: string): MockResult {
  const queue = resultsByTable[table];
  if (queue && queue.length > 0) return queue.shift()!;
  return { data: null, error: null };
}

function createBuilder(table: string) {
  const call: BuilderCall = { table, operation: null, filters: [] };
  calls.push(call);

  const builder = {
    select: vi.fn(() => { call.operation = 'select'; return builder; }),
    upsert: vi.fn((payload: unknown, opts?: unknown) => {
      call.operation = 'upsert';
      call.payload   = payload;
      call.upsertOpts = opts;
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      call.filters.push(['eq', col, val]);
      return builder;
    }),
    // Thenable — permite usar await diretamente no builder
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(dequeueResult(table)).then(resolve, reject);
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e);
      }
    },
  };
  return builder;
}

// Mock ANTES dos imports do SUT
// ── Fila e captura das chamadas de RPC ────────────────────────────────────
//
// `setDiretoExtraConfig` deixou de fazer `upsert` direto: a gravação do escopo
// e o alinhamento das exceções precisam ser atômicos, e isso mora em
// `fn_direto_extra_definir`. Ver a migration 20260818220000.

const rpcResults: MockResult[] = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

function enqueueRpc(r: MockResult) { rpcResults.push(r); }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((t: string) => createBuilder(t)),
    rpc: vi.fn((fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResults.shift() ?? { data: null, error: null });
    }),
  },
}));

// SUT — importado depois do vi.mock
import {
  fetchDiretoExtraConfigs,
  setDiretoExtraConfig,
  resolverDiretoExtraAtivo,
  type DiretoExtraConfig,
} from './direto_extra.service';

// ── Helpers ───────────────────────────────────────────────────────────────

function enqueue(table: string, result: MockResult) {
  if (!resultsByTable[table]) resultsByTable[table] = [];
  resultsByTable[table].push(result);
}

function makeCfg(overrides: Partial<DiretoExtraConfig> = {}): DiretoExtraConfig {
  return {
    id:            'cfg-1',
    empresa_id:    'emp-1',
    escopo:        'setor',
    referencia_id: 'ref-1',
    ativo:         true,
    criado_em:     '2026-01-01T00:00:00Z',
    atualizado_em: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  rpcResults.length = 0;
  for (const k of Object.keys(resultsByTable)) delete resultsByTable[k];
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchDiretoExtraConfigs
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchDiretoExtraConfigs', () => {
  it('retorna a lista filtrada pela empresa_id', async () => {
    const cfg = makeCfg();
    enqueue('direto_extra_config', { data: [cfg], error: null });

    const result = await fetchDiretoExtraConfigs('emp-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(cfg);

    const c = calls[0];
    expect(c.table).toBe('direto_extra_config');
    expect(c.operation).toBe('select');
    expect(c.filters).toContainEqual(['eq', 'empresa_id', 'emp-1']);
  });

  it('retorna [] e emite warn quando há erro', async () => {
    enqueue('direto_extra_config', { data: null, error: { message: 'rls denied' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchDiretoExtraConfigs('emp-1');

    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('retorna [] quando data é null sem erro', async () => {
    enqueue('direto_extra_config', { data: null, error: null });

    const result = await fetchDiretoExtraConfigs('emp-1');

    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setDiretoExtraConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('setDiretoExtraConfig', () => {
  /**
   * A gravação passou a ser RPC, e não `upsert` direto.
   *
   * O motivo é o defeito de 18/08/2026: ativar a lógica para uma equipe de 4
   * pessoas pegava só para 1 — a única sem config de `usuario`. As outras três
   * tinham uma, desligada, de semanas antes, e o mais específico vence. Agora o
   * servidor grava o escopo E apaga as exceções que o contradizem, numa
   * transação só (`fn_direto_extra_definir`).
   */
  it('sucesso → chama a RPC com os quatro parâmetros e devolve os alinhados', async () => {
    enqueueRpc({ data: { ok: true, alinhados_usuario: 3, alinhados_equipe: 0 }, error: null });

    const result = await setDiretoExtraConfig({
      empresaId:    'emp-1',
      escopo:       'equipe',
      referenciaId: 'eq-1',
      ativo:        true,
    });

    expect(result).toEqual({ ok: true, alinhados: 3 });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('fn_direto_extra_definir');
    expect(rpcCalls[0].args).toEqual({
      p_empresa_id:    'emp-1',
      p_escopo:        'equipe',
      p_referencia_id: 'eq-1',
      p_ativo:         true,
    });
  });

  it('soma os alinhamentos de usuário e de equipe', async () => {
    enqueueRpc({ data: { ok: true, alinhados_usuario: 5, alinhados_equipe: 2 }, error: null });

    const result = await setDiretoExtraConfig({
      empresaId: 'emp-1', escopo: 'setor', referenciaId: 'setor-1', ativo: true,
    });

    expect(result).toEqual({ ok: true, alinhados: 7 });
  });

  /** Nada a alinhar é o caso comum: a tela não deve anunciar coisa nenhuma. */
  it('sem exceções contraditórias, alinhados é zero', async () => {
    enqueueRpc({ data: { ok: true, alinhados_usuario: 0, alinhados_equipe: 0 }, error: null });

    const result = await setDiretoExtraConfig({
      empresaId: 'emp-1', escopo: 'usuario', referenciaId: 'user-7', ativo: false,
    });

    expect(result).toEqual({ ok: true, alinhados: 0 });
    expect(rpcCalls[0].args).toMatchObject({ p_escopo: 'usuario', p_ativo: false });
  });

  it('erro de transporte → {ok:false, error} e warn no console', async () => {
    enqueueRpc({ data: null, error: { message: 'permission denied' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await setDiretoExtraConfig({
      empresaId: 'emp-1', escopo: 'equipe', referenciaId: 'eq-1', ativo: false,
    });

    expect(result).toEqual({ ok: false, error: 'permission denied' });
    expect(warn).toHaveBeenCalled();
  });

  /** A RPC recusa por regra de negócio devolvendo `ok:false`, sem erro HTTP. */
  it('recusa da própria função → {ok:false} com a mensagem dela', async () => {
    enqueueRpc({ data: { ok: false, erro: 'nao_autorizado' }, error: null });

    const result = await setDiretoExtraConfig({
      empresaId: 'emp-1', escopo: 'setor', referenciaId: 'setor-1', ativo: true,
    });

    expect(result).toEqual({ ok: false, error: 'nao_autorizado' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolverDiretoExtraAtivo  — função PURA (zero mock de Supabase)
// ─────────────────────────────────────────────────────────────────────────────

describe('resolverDiretoExtraAtivo', () => {
  it('retorna false quando não há configs e usuário sem setor/equipe', () => {
    expect(
      resolverDiretoExtraAtivo({
        userId:       'u-1',
        userSetorId:  null,
        userEquipeId: null,
        configs:      [],
      }),
    ).toBe(false);
  });

  it('retorna true quando há config de usuario ativo=true', () => {
    const configs: DiretoExtraConfig[] = [makeCfg({ escopo: 'usuario', referencia_id: 'u-1', ativo: true })];
    expect(
      resolverDiretoExtraAtivo({ userId: 'u-1', userSetorId: 's-1', userEquipeId: 'eq-1', configs }),
    ).toBe(true);
  });

  it('retorna false quando config de usuario tem ativo=false (não cai para equipe/setor)', () => {
    const configs: DiretoExtraConfig[] = [
      makeCfg({ escopo: 'usuario', referencia_id: 'u-1', ativo: false }),
      makeCfg({ id: 'cfg-2', escopo: 'equipe', referencia_id: 'eq-1', ativo: true }),
      makeCfg({ id: 'cfg-3', escopo: 'setor',  referencia_id: 's-1',  ativo: true }),
    ];
    expect(
      resolverDiretoExtraAtivo({ userId: 'u-1', userSetorId: 's-1', userEquipeId: 'eq-1', configs }),
    ).toBe(false);
  });

  it('retorna true via equipe quando não há config de usuario', () => {
    const configs: DiretoExtraConfig[] = [
      makeCfg({ escopo: 'equipe', referencia_id: 'eq-1', ativo: true }),
    ];
    expect(
      resolverDiretoExtraAtivo({ userId: 'u-1', userSetorId: null, userEquipeId: 'eq-1', configs }),
    ).toBe(true);
  });

  it('retorna true via setor quando não há config de usuario nem equipe', () => {
    const configs: DiretoExtraConfig[] = [
      makeCfg({ escopo: 'setor', referencia_id: 's-1', ativo: true }),
    ];
    expect(
      resolverDiretoExtraAtivo({ userId: 'u-1', userSetorId: 's-1', userEquipeId: null, configs }),
    ).toBe(true);
  });

  it('ignora config de equipe quando userEquipeId é null, cai para setor', () => {
    const configs: DiretoExtraConfig[] = [
      makeCfg({ escopo: 'equipe', referencia_id: 'eq-1', ativo: true }),
      makeCfg({ id: 'cfg-2', escopo: 'setor', referencia_id: 's-1', ativo: false }),
    ];
    // equipeId=null → pula equipe; setorId=s-1 → config setor ativo=false → false
    expect(
      resolverDiretoExtraAtivo({ userId: 'u-1', userSetorId: 's-1', userEquipeId: null, configs }),
    ).toBe(false);
  });

  it('retorna false quando userSetorId é undefined e não há equipe/usuario com config', () => {
    const configs: DiretoExtraConfig[] = [
      makeCfg({ escopo: 'setor', referencia_id: 's-x', ativo: true }),
    ];
    expect(
      resolverDiretoExtraAtivo({ userId: 'u-1', userSetorId: undefined, userEquipeId: null, configs }),
    ).toBe(false);
  });

  it('com userEquipeId mas SEM config para essa equipe → cai para setor (cobre false-branch)', () => {
    // Cobre o ramo: if (userEquipeId) { const cfgEquipe = find(...); if (cfgEquipe) ... }
    //   ↑ aqui entramos no if externo mas NÃO entramos no if interno (cfgEquipe é undefined)
    const configs: DiretoExtraConfig[] = [
      makeCfg({ escopo: 'setor', referencia_id: 's-1', ativo: true }),
    ];
    expect(
      resolverDiretoExtraAtivo({
        userId: 'u-1',
        userSetorId: 's-1',
        userEquipeId: 'eq-sem-config', // existe, mas não há config para ela
        configs,
      }),
    ).toBe(true); // herda do setor
  });

  it('com userSetorId mas SEM config para esse setor → retorna false (cobre false-branch)', () => {
    // Cobre o ramo: if (userSetorId) { const cfgSetor = find(...); if (cfgSetor) ... }
    //   ↑ aqui entramos no if externo mas NÃO entramos no if interno (cfgSetor é undefined)
    const configs: DiretoExtraConfig[] = [
      // nenhuma config para o setor dele — tem outra config qualquer só pra lista não ser vazia
      makeCfg({ escopo: 'usuario', referencia_id: 'outro-user', ativo: true }),
    ];
    expect(
      resolverDiretoExtraAtivo({
        userId: 'u-1',
        userSetorId: 's-sem-config',
        userEquipeId: null,
        configs,
      }),
    ).toBe(false);
  });
});
