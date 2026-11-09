/**
 * mesAgregado.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * O mês do analítico JÁ SOMADO pelo banco (`fn_analitico_mes_agregado`,
 * migration 20261109220000). Uma linha da resposta é um grupo (operador, setor,
 * dia, procedência…) com `qtd` = quantas linhas do relatório ele junta.
 *
 * O que não pode mudar: os totais e as CONTAGENS de pagamentos. Quem contava
 * linhas passa a somar `qtd`.
 *
 * A função de linhas (`fn_analitico_mes_linhas`) e a paginação continuam como
 * reserva — ver `mesNumaLeitura.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { estado } = vi.hoisted(() => ({
  estado: {
    paginas: 0,
    rpcs: [] as { nome: string; args: Record<string, unknown> }[],
    agregado: { data: [] as unknown, error: null as { message: string } | null },
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
      if (nome === 'fn_analitico_mes_agregado') return Promise.resolve(estado.agregado);
      return Promise.resolve({ data: [], error: null });
    }),
  },
}));

vi.mock('@/lib/realtime', () => ({ assinarTabela: vi.fn(() => () => {}) }));

import {
  buscarRecebidoPorDia, buscarRecebidoPorDiaDosOperadores, buscarTotalOrfaosPorSetor, esquecerMesAnalitico,
} from './analitico.service';
import { hojeDoConjunto } from '@/pages/Mobile/setor/contas';

const EMPRESA = 'emp-1';
const MES     = '2026-10';
const chamadas = (nome: string) => estado.rpcs.filter(r => r.nome === nome);

const GRUPOS = [
  // 3 pagamentos do op-1 no dia 5, já somados.
  { operador_id: 'op-1', setor_id: 's1', importado_por_id: null, valor_recebido: 300, total_ho: 30, data_pagamento: '2026-10-05', qtd: 3 },
  // 2 órfãos do setor s1 no dia 5.
  { operador_id: null, setor_id: 's1', importado_por_id: null, valor_recebido: 40, total_ho: null, data_pagamento: '2026-10-05', qtd: 2 },
  // Órfão antigo sem setor: vem com quem importou (a reserva do setor).
  { operador_id: null, setor_id: null, importado_por_id: 'imp-1', valor_recebido: 10, total_ho: null, data_pagamento: '2026-10-06', qtd: 1 },
];

beforeEach(() => {
  esquecerMesAnalitico();
  estado.paginas = 0;
  estado.rpcs = [];
  estado.agregado = { data: GRUPOS, error: null };
});

describe('mês do analítico já somado', () => {
  it('pergunta a função agregada, não a de linhas, e não pagina', async () => {
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(estado.paginas).toBe(0);
    expect(chamadas('fn_analitico_mes_agregado')).toHaveLength(1);
    expect(chamadas('fn_analitico_mes_agregado')[0].args).toEqual({ p_empresa_id: EMPRESA, p_inicio: '2026-10-01', p_fim: '2026-10-31' });
    expect(chamadas('fn_analitico_mes_linhas')).toHaveLength(0);
  });

  it('o gráfico por dia carrega a quantidade de cada grupo', async () => {
    const { data } = await buscarRecebidoPorDia(EMPRESA, MES);
    const doOp1 = data.find(l => l.operador_id === 'op-1');
    expect(doOp1?.qtd).toBe(3);
    expect(doOp1?.valor_recebido).toBe(300);
  });

  it('o «hoje» do setor no celular conta pagamentos, não grupos', async () => {
    const { data } = await buscarRecebidoPorDia(EMPRESA, MES);
    expect(hojeDoConjunto(data, '2026-10-05', null)).toEqual({ total: 340, qtd: 5 });
  });

  it('o total dos órfãos por setor soma valor e quantidade dos grupos', async () => {
    const porSetor = await buscarTotalOrfaosPorSetor(EMPRESA, MES);
    expect(porSetor.s1).toEqual({ total: 40, qtd: 2 });
  });

  it('a tela Equipe do app: a função agregada recebe os operadores e a quantidade segue', async () => {
    estado.agregado = { data: [GRUPOS[0]], error: null };
    const { data } = await buscarRecebidoPorDiaDosOperadores(EMPRESA, MES, ['op-1']);
    expect(chamadas('fn_analitico_mes_agregado')[0].args).toEqual({
      p_empresa_id: EMPRESA, p_inicio: '2026-10-01', p_fim: '2026-10-31', p_operadores: ['op-1'],
    });
    expect(data.find(l => l.operador_id === 'op-1')?.qtd).toBe(3);
  });

  it('erro passageiro da agregada: pagina, e tenta a agregada de novo na próxima', async () => {
    estado.agregado = { data: null, error: { message: 'canceling statement due to statement timeout' } };
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(estado.paginas).toBe(1);

    estado.agregado = { data: GRUPOS, error: null };
    esquecerMesAnalitico();
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(chamadas('fn_analitico_mes_agregado')).toHaveLength(2);
  });

  it('banco sem a agregada: cai na de linhas e não pergunta pela agregada de novo', async () => {
    estado.agregado = { data: null, error: { message: 'Could not find the function public.fn_analitico_mes_agregado in the schema cache' } };
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(chamadas('fn_analitico_mes_linhas')).toHaveLength(1);

    esquecerMesAnalitico();
    await buscarRecebidoPorDia(EMPRESA, MES);
    expect(chamadas('fn_analitico_mes_agregado')).toHaveLength(1);
    expect(chamadas('fn_analitico_mes_linhas')).toHaveLength(2);
  });
});
