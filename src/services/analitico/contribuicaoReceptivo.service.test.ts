/**
 * contribuicaoReceptivo.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A Contribuição Receptivo saiu do localStorage para o banco (migration
 * 20260730a). Estes testes fixam os três pontos que a mudança precisa acertar:
 *
 *   1. `dbAtiva` distingue "migration pendente" de "erro real" — é o que decide
 *      se a tela cai no fallback local ou reclama;
 *   2. NUMERIC volta como STRING do postgres, então o service tem que
 *      normalizar — senão o card soma strings e concatena valores;
 *   3. o upsert usa a UNIQUE (empresa, setor, mes), não um insert cego: dois
 *      líderes salvando ao mesmo tempo não podem gerar duas linhas somando
 *      dobrado no card do setor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do Supabase (padrão thenable do projeto) ───────────────────────────

type MockResult<T = unknown> = { data: T; error: { message: string } | null };

let nextResult: MockResult = { data: null, error: null };
/** Faz o builder LANÇAR, simulando falha de rede em vez de erro do postgres. */
let lancarNoAwait = false;

interface BuilderCall {
  table: string;
  operation: 'select' | 'upsert' | null;
  payload?: unknown;
  upsertOpts?: unknown;
  filters: Array<[string, string, unknown]>;
}

const calls: BuilderCall[] = [];
let currentCall: BuilderCall | null = null;

function createBuilder(table: string) {
  currentCall = { table, operation: null, filters: [] };
  calls.push(currentCall);

  const builder = {
    select: vi.fn(() => { currentCall!.operation = 'select'; return builder; }),
    upsert: vi.fn((payload: unknown, opts?: unknown) => {
      currentCall!.operation  = 'upsert';
      currentCall!.payload    = payload;
      currentCall!.upsertOpts = opts;
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => { currentCall!.filters.push(['eq', col, val]); return builder; }),
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) => {
      if (lancarNoAwait) {
        const erro = new Error('network down');
        return reject ? reject(erro) : Promise.reject(erro);
      }
      return Promise.resolve(nextResult).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)) },
}));

import {
  buscarContribuicoesReceptivo,
  salvarContribuicaoReceptivo,
} from './contribuicaoReceptivo.service';

const EMPRESA = 'emp-1';
const SETOR   = 'setor-1';
const MES     = '2026-07';

beforeEach(() => {
  calls.length   = 0;
  currentCall    = null;
  nextResult     = { data: null, error: null };
  lancarNoAwait  = false;
});

// ── buscarContribuicoesReceptivo ────────────────────────────────────────────

describe('buscarContribuicoesReceptivo', () => {
  it('busca a empresa e o mês na tabela certa', async () => {
    nextResult = { data: [], error: null };

    await buscarContribuicoesReceptivo(EMPRESA, MES);

    expect(calls[0].table).toBe('contribuicao_receptivo');
    expect(calls[0].operation).toBe('select');
    expect(calls[0].filters).toEqual([
      ['eq', 'empresa_id', EMPRESA],
      ['eq', 'mes', MES],
    ]);
  });

  it('indexa por setor_id', async () => {
    nextResult = {
      data: [
        { setor_id: 's1', acumulado: 1000, meta: 5000 },
        { setor_id: 's2', acumulado: 250.5, meta: 0 },
      ],
      error: null,
    };

    const { porSetor, dbAtiva } = await buscarContribuicoesReceptivo(EMPRESA, MES);

    expect(dbAtiva).toBe(true);
    expect(porSetor).toEqual({
      s1: { acumulado: 1000,  meta: 5000 },
      s2: { acumulado: 250.5, meta: 0 },
    });
  });

  it('converte NUMERIC vindo como string em número', async () => {
    // O postgres devolve NUMERIC como string. Sem o Number(), o card do setor
    // faria `baseSetor + "1234.56"` e concatenaria em vez de somar.
    nextResult = {
      data: [{ setor_id: 's1', acumulado: '1234.56', meta: '9999.99' }],
      error: null,
    };

    const { porSetor } = await buscarContribuicoesReceptivo(EMPRESA, MES);

    expect(porSetor.s1.acumulado).toBe(1234.56);
    expect(porSetor.s1.meta).toBe(9999.99);
    expect(typeof porSetor.s1.acumulado).toBe('number');
  });

  it('setor sem linha simplesmente não aparece no mapa', async () => {
    nextResult = { data: [], error: null };
    const { porSetor } = await buscarContribuicoesReceptivo(EMPRESA, MES);
    expect(porSetor).toEqual({});
  });

  it('migration pendente → dbAtiva false, sem ruído no console', async () => {
    nextResult = {
      data: null,
      error: { message: 'relation "public.contribuicao_receptivo" does not exist' },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { porSetor, dbAtiva } = await buscarContribuicoesReceptivo(EMPRESA, MES);

    // dbAtiva=false é o sinal para a tela cair no localStorage antigo.
    expect(dbAtiva).toBe(false);
    expect(porSetor).toEqual({});
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('erro REAL mantém dbAtiva true e loga', async () => {
    // Distinção que importa: RLS recusando não é migration faltando, e não deve
    // fazer a tela voltar para o localStorage.
    nextResult = { data: null, error: { message: 'permission denied for table' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { porSetor, dbAtiva } = await buscarContribuicoesReceptivo(EMPRESA, MES);

    expect(dbAtiva).toBe(true);
    expect(porSetor).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('exceção (rede fora) → dbAtiva false em vez de estourar', async () => {
    lancarNoAwait = true;
    const { porSetor, dbAtiva } = await buscarContribuicoesReceptivo(EMPRESA, MES);
    expect(dbAtiva).toBe(false);
    expect(porSetor).toEqual({});
  });
});

// ── salvarContribuicaoReceptivo ─────────────────────────────────────────────

describe('salvarContribuicaoReceptivo', () => {
  it('faz upsert com onConflict na chave (empresa, setor, mes)', async () => {
    nextResult = { data: null, error: null };

    const ok = await salvarContribuicaoReceptivo({
      empresaId: EMPRESA, setorId: SETOR, mes: MES,
      acumulado: 1500, meta: 8000, atualizadoPor: 'user-9',
    });

    expect(ok).toBe(true);
    expect(calls[0].table).toBe('contribuicao_receptivo');
    expect(calls[0].operation).toBe('upsert');
    expect(calls[0].payload).toEqual({
      empresa_id:     EMPRESA,
      setor_id:       SETOR,
      mes:            MES,
      acumulado:      1500,
      meta:           8000,
      atualizado_por: 'user-9',
    });
    // Sem onConflict, dois líderes salvando gerariam duas linhas e o card do
    // setor somaria a contribuição em dobro.
    expect(calls[0].upsertOpts).toEqual({ onConflict: 'empresa_id,setor_id,mes' });
  });

  it('atualizadoPor ausente vira null', async () => {
    nextResult = { data: null, error: null };

    await salvarContribuicaoReceptivo({
      empresaId: EMPRESA, setorId: SETOR, mes: MES, acumulado: 0, meta: 0,
    });

    expect((calls[0].payload as { atualizado_por: unknown }).atualizado_por).toBeNull();
  });

  it('devolve false quando o banco recusa (RLS)', async () => {
    nextResult = { data: null, error: { message: 'new row violates row-level security policy' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ok = await salvarContribuicaoReceptivo({
      empresaId: EMPRESA, setorId: SETOR, mes: MES, acumulado: 10, meta: 20,
    });

    // É por este false que a tela desfaz a atualização otimista.
    expect(ok).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('devolve false quando a chamada estoura', async () => {
    lancarNoAwait = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ok = await salvarContribuicaoReceptivo({
      empresaId: EMPRESA, setorId: SETOR, mes: MES, acumulado: 10, meta: 20,
    });

    expect(ok).toBe(false);
    warn.mockRestore();
  });

  it('aceita zero — apagar o valor é uma edição válida', async () => {
    nextResult = { data: null, error: null };

    const ok = await salvarContribuicaoReceptivo({
      empresaId: EMPRESA, setorId: SETOR, mes: MES, acumulado: 0, meta: 0,
    });

    expect(ok).toBe(true);
    expect(calls[0].payload).toMatchObject({ acumulado: 0, meta: 0 });
  });
});
