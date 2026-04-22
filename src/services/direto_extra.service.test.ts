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
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)) },
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
  it('sucesso → retorna {ok:true} e passa payload+onConflict corretos ao upsert', async () => {
    enqueue('direto_extra_config', { data: null, error: null });

    const result = await setDiretoExtraConfig({
      empresaId:    'emp-1',
      escopo:       'setor',
      referenciaId: 'setor-1',
      ativo:        true,
    });

    expect(result).toEqual({ ok: true });

    const c = calls[0];
    expect(c.table).toBe('direto_extra_config');
    expect(c.operation).toBe('upsert');

    // Valida payload (atualizado_em deve ser string ISO válida)
    const payload = c.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      empresa_id:    'emp-1',
      escopo:        'setor',
      referencia_id: 'setor-1',
      ativo:         true,
    });
    expect(typeof payload.atualizado_em).toBe('string');
    expect(() => new Date(payload.atualizado_em as string).toISOString()).not.toThrow();

    // Valida onConflict
    expect(c.upsertOpts).toEqual({ onConflict: 'empresa_id,escopo,referencia_id' });
  });

  it('erro → retorna {ok:false, error:mensagem} e emite warn', async () => {
    enqueue('direto_extra_config', { data: null, error: { message: 'permission denied' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await setDiretoExtraConfig({
      empresaId:    'emp-1',
      escopo:       'equipe',
      referenciaId: 'eq-1',
      ativo:        false,
    });

    expect(result).toEqual({ ok: false, error: 'permission denied' });
    expect(warn).toHaveBeenCalled();
  });

  it('aceita escopo "equipe" e persiste referencia_id corretamente', async () => {
    enqueue('direto_extra_config', { data: null, error: null });

    await setDiretoExtraConfig({
      empresaId:    'emp-2',
      escopo:       'equipe',
      referenciaId: 'eq-99',
      ativo:        true,
    });

    const payload = calls[0].payload as Record<string, unknown>;
    expect(payload.escopo).toBe('equipe');
    expect(payload.referencia_id).toBe('eq-99');
    expect(payload.empresa_id).toBe('emp-2');
  });

  it('aceita escopo "usuario" e sinaliza ativo=false corretamente', async () => {
    enqueue('direto_extra_config', { data: null, error: null });

    await setDiretoExtraConfig({
      empresaId:    'emp-1',
      escopo:       'usuario',
      referenciaId: 'user-7',
      ativo:        false,
    });

    const payload = calls[0].payload as Record<string, unknown>;
    expect(payload.escopo).toBe('usuario');
    expect(payload.referencia_id).toBe('user-7');
    expect(payload.ativo).toBe(false);
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
