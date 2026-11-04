/**
 * mesNumaLeitura.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O mês do analítico numa requisição (`fn_analitico_mes_linhas`, migration
 * 20261030150000). A paginação por OFFSET relia o mês inteiro a cada página —
 * 15% do banco na auditoria de 30/10/2026. Sem a função no banco, a paginação
 * de antes continua valendo.
 *
 * A ordem dos casos importa: «função ausente» é lembrada até recarregar a
 * página, então ela fica por último.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { estado } = vi.hoisted(() => ({
  estado: {
    paginas: 0,
    rpcs: [] as { nome: string; args: Record<string, unknown> }[],
    respostaRpc: { data: [] as unknown, error: null as { message: string } | null },
  },
}));

function createBuilder(table: string) {
  const builder = {
    select: vi.fn(() => builder),
    eq:     vi.fn(() => builder),
    in:     vi.fn(() => builder),
    gte:    vi.fn(() => builder),
    lte:    vi.fn(() => builder),
    order:  vi.fn(() => builder),
    range:  vi.fn(() => {
      if (table === 'analitico_recebimentos') estado.paginas++;
      return builder;
    }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((t: string) => createBuilder(t)),
    rpc:  vi.fn((nome: string, args: Record<string, unknown>) => {
      estado.rpcs.push({ nome, args });
      if (nome === 'fn_analitico_mes_linhas') return Promise.resolve(estado.respostaRpc);
      return Promise.resolve({ data: [], error: null });
    }),
  },
}));

vi.mock('@/lib/realtime', () => ({ assinarTabela: vi.fn(() => () => {}) }));

import { buscarRecebidoPorDia, buscarRecebidoPorDiaDosOperadores, esquecerMesAnalitico } from './analitico.service';

const EMPRESA = 'emp-1';
const MES     = '2026-10';
const chamadasDoMes = () => estado.rpcs.filter(r => r.nome === 'fn_analitico_mes_linhas');

beforeEach(() => {
  esquecerMesAnalitico();
  estado.paginas = 0;
  estado.rpcs = [];
  estado.respostaRpc = { data: [], error: null };
});

describe('mês do analítico numa leitura', () => {
  it('lê o mês pela função, sem paginar', async () => {
    estado.respostaRpc = {
      data: [
        { operador_id: 'op-1', setor_id: 's1', importado_por_id: null, valor_recebido: 100, total_ho: 0, data_pagamento: '2026-10-05' },
        { operador_id: 'op-2', setor_id: 's1', importado_por_id: null, valor_recebido: 50,  total_ho: 0, data_pagamento: '2026-10-05' },
      ],
      error: null,
    };
    const { data } = await buscarRecebidoPorDia(EMPRESA, MES);

    expect(estado.paginas).toBe(0);
    expect(chamadasDoMes()).toHaveLength(1);
    expect(chamadasDoMes()[0].args).toEqual({ p_empresa_id: EMPRESA, p_inicio: '2026-10-01', p_fim: '2026-10-31' });
    expect(data.map(l => [l.operador_id, l.valor_recebido])).toEqual([['op-1', 100], ['op-2', 50]]);
  });

  it('tela Equipe do app: a função recebe os operadores', async () => {
    estado.respostaRpc = {
      data: [{ operador_id: 'op-1', setor_id: 's1', valor_recebido: 80, data_pagamento: '2026-10-02' }],
      error: null,
    };
    const { data } = await buscarRecebidoPorDiaDosOperadores(EMPRESA, MES, ['op-1']);

    expect(estado.paginas).toBe(0);
    expect(chamadasDoMes()[0].args).toEqual({
      p_empresa_id: EMPRESA, p_inicio: '2026-10-01', p_fim: '2026-10-31', p_operadores: ['op-1'],
    });
    expect(data.some(l => l.operador_id === 'op-1' && l.valor_recebido === 80)).toBe(true);
  });

  it('erro passageiro da função cai na paginação e tenta a função de novo depois', async () => {
    estado.respostaRpc = { data: null, error: { message: 'canceling statement due to statement timeout' } };
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(estado.paginas).toBe(1);

    esquecerMesAnalitico();
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(chamadasDoMes()).toHaveLength(2);
  });

  it('banco sem a migration: pagina, e não pergunta pela função de novo', async () => {
    estado.respostaRpc = {
      data: null,
      error: { message: 'Could not find the function public.fn_analitico_mes_linhas in the schema cache' },
    };
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(estado.paginas).toBe(1);

    esquecerMesAnalitico();
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(chamadasDoMes()).toHaveLength(1);
    expect(estado.paginas).toBe(2);
  });
});
