/**
 * paginacaoOrdenada.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Toda consulta paginada por `range` tem que ordenar por uma chave ÚNICA.
 *
 * Cada página é uma consulta independente. Sem `ORDER BY` — ou com um que
 * empata, como `data_pagamento` num mês em que centenas de linhas caem no mesmo
 * dia — o Postgres não promete a mesma ordem entre duas execuções: as páginas se
 * sobrepõem, um pedaço do meio some, e o total sai diferente A CADA
 * CARREGAMENTO. Em `paginarParalelo` é pior, porque as 4 páginas da onda saem
 * simultâneas.
 *
 * Medido na BookPlay em 12/08/2026: o card "Total recebido" do Play 5 mostrou
 * R$ 220.034,54, R$ 170.691,84 e R$ 93.772,00 em carregamentos seguidos, para um
 * relatório de R$ 143.114,70 que estava CORRETO no banco. `lerMesAnalitico` — a
 * leitura que alimenta o card do setor, os órfãos e o gráfico por dia — não
 * tinha ordem nenhuma.
 *
 * Estes testes olham a FORMA da consulta, não o resultado: um mock não
 * reproduz o embaralhamento do Postgres, mas a ausência do `.order` é
 * exatamente a condição que o causa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Consulta {
  table: string;
  /** Colunas de `.order()`, na ordem em que foram aplicadas. */
  ordens: string[];
  /** true quando `.range()` foi usado — só aí a ordem passa a ser obrigatória. */
  paginou: boolean;
  /** `.order()` veio antes do `.range()`? */
  ordemAntesDoRange: boolean;
}

const consultas: Consulta[] = [];

function createBuilder(table: string) {
  const consulta: Consulta = { table, ordens: [], paginou: false, ordemAntesDoRange: true };
  consultas.push(consulta);

  const builder = {
    select: vi.fn(() => builder),
    eq:  vi.fn(() => builder),
    in:  vi.fn(() => builder),
    is:  vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn((coluna: string) => {
      if (consulta.paginou) consulta.ordemAntesDoRange = false;
      consulta.ordens.push(coluna);
      return builder;
    }),
    range: vi.fn(() => { consulta.paginou = true; return builder; }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      // Página vazia: a paginação para na primeira, e o teste olha só a FORMA.
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)) },
}));

import { buscarTotalPorSetor, buscarAnalitico, buscarTotalOrfaosPorSetor } from './analitico.service';

const EMPRESA = 'emp-1';
const MES     = '2026-08';

/** A consulta paginada da tabela — a que o range corta. */
function consultaPaginada(table: string) {
  return consultas.find(c => c.table === table && c.paginou);
}

beforeEach(() => {
  consultas.length = 0;
});

describe('leitura do mês (card do setor, órfãos, gráfico por dia)', () => {
  it('ordena por `id` antes de paginar', async () => {
    await buscarTotalPorSetor(EMPRESA, MES);

    const q = consultaPaginada('analitico_recebimentos');
    expect(q, 'a leitura do mês deveria estar paginada').toBeDefined();
    expect(q!.ordens).toContain('id');
    expect(q!.ordemAntesDoRange, '.order() tem que vir antes do .range()').toBe(true);
  });

  it('vale para a leitura dos órfãos também — é a mesma consulta', async () => {
    await buscarTotalOrfaosPorSetor(EMPRESA, MES);

    const q = consultaPaginada('analitico_recebimentos');
    expect(q!.ordens).toContain('id');
  });
});

describe('buscarAnalitico', () => {
  it('desempata `data_pagamento` com `id`', async () => {
    await buscarAnalitico({ empresaId: EMPRESA, mes: MES });

    const q = consultaPaginada('analitico_recebimentos');
    // `data_pagamento` sozinho não serve: num mês, centenas de linhas caem no
    // mesmo dia, e o empate devolve a ordem para o planejador.
    expect(q!.ordens).toEqual(['data_pagamento', 'id']);
    expect(q!.ordens[q!.ordens.length - 1], 'o desempate final tem que ser único').toBe('id');
  });
});
