/**
 * petDespedida.service.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * O teste que importa aqui é o primeiro: **a requisição precisa ser
 * executada**.
 *
 * O defeito original era `void supabase.from(...).update(...).eq(...)` sem
 * `await`. O builder do supabase-js é preguiçoso: a requisição HTTP só sai
 * quando alguém chama `.then()`. Sem isso, nada era enviado, nenhum erro
 * aparecia e a despedida voltava a cada recarga da página.
 *
 * O mock abaixo é thenable como o builder de verdade e registra se o `.then()`
 * foi chamado — é isso que faz o teste falhar se alguém voltar a "otimizar" a
 * gravação tirando o await.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockResult = { data: unknown; error: { message: string } | null };

let nextResult: MockResult = { data: null, error: null };
/** Vira true só quando o código consome o builder (await / .then). */
let executado = false;
let ultimaChamada: {
  table: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
} | null = null;

function createBuilder(table: string) {
  ultimaChamada = { table, filters: [] };
  const builder = {
    update: vi.fn((payload: unknown) => { ultimaChamada!.payload = payload; return builder; }),
    eq:     vi.fn((col: string, val: unknown) => { ultimaChamada!.filters.push([col, val]); return builder; }),
    // Thenable — igual ao builder real: é AQUI que a requisição sairia.
    then: (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) => {
      executado = true;
      return Promise.resolve(nextResult).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)) },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { concluirDespedidaPet } from './petDespedida.service';
import { logger } from '@/lib/logger';

beforeEach(() => {
  nextResult = { data: null, error: null };
  executado = false;
  ultimaChamada = null;
  vi.clearAllMocks();
});

describe('concluirDespedidaPet', () => {
  it('EXECUTA a requisição — o builder preguiçoso do supabase precisa ser aguardado', async () => {
    await concluirDespedidaPet('user-1');
    expect(executado).toBe(true);
  });

  it('grava concluida na própria linha do usuário', async () => {
    await concluirDespedidaPet('user-1');
    expect(ultimaChamada?.table).toBe('perfis');
    expect(ultimaChamada?.payload).toEqual({ pet_despedida: 'concluida' });
    expect(ultimaChamada?.filters).toEqual([['id', 'user-1']]);
  });

  it('devolve true quando gravou', async () => {
    await expect(concluirDespedidaPet('user-1')).resolves.toBe(true);
  });

  it('erro do banco vira false e log — nunca silêncio', async () => {
    nextResult = { data: null, error: { message: 'permission denied' } };
    await expect(concluirDespedidaPet('user-1')).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('sem usuário não chama o banco', async () => {
    await expect(concluirDespedidaPet('')).resolves.toBe(false);
    expect(executado).toBe(false);
    expect(ultimaChamada).toBeNull();
  });
});
