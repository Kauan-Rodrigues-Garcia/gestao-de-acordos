/**
 * limpezaMesDiario.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * `limparMesDiario` — o mês do Recebimento diário sai junto com o do analítico.
 *
 * ## O defeito que estes testes travam
 *
 * Na BookPlay as duas abas saem do MESMO arquivo, mas "Limpar mês" só mexia no
 * analítico. Medido no banco em agosto/2026, o diário estava acima do analítico
 * em TODOS os setores da empresa:
 *
 *   Receptivo +3.503,08 · Play Mix Marília +4.418,00 · Play 5 +637,49
 *   Play 4 +268,21 · Amauri Digital +165,00 · total +8.991,78
 *
 * Play Mix Marília e Amauri Digital não tinham UMA linha de analítico — o mês
 * havia sido limpo e o diário deles seguia de pé, sozinho.
 *
 * ## A garantia
 *
 * O recorte de setor espelha `limparDadosDoMesSetor` passada a passada. Espelhar
 * inclui o `setor_id IS NULL` da passada por operador: sem ele um setor apagaria
 * a linha de alguém que hoje é dele mas que, no dia da importação, era de outro
 * setor — e é o OUTRO setor que mostra essa linha, porque
 * `diario_recebimentos.setor_id` vem do `perfis.setor_id` do operador no instante
 * do insert (trigger `fn_diario_preencher_setor`), não do carimbo do relatório.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface DeleteCall {
  table: string;
  filters: Array<[op: string, coluna: string, valor: unknown]>;
}

const calls: DeleteCall[] = [];
let erroDoBanco: { message: string } | null = null;

function createBuilder(table: string) {
  let call: DeleteCall | null = null;

  const builder = {
    delete: vi.fn(() => { call = { table, filters: [] }; calls.push(call); return builder; }),
    eq:  vi.fn((c: string, v: unknown) => { call!.filters.push(['eq',  c, v]); return builder; }),
    in:  vi.fn((c: string, v: unknown) => { call!.filters.push(['in',  c, v]); return builder; }),
    is:  vi.fn((c: string, v: unknown) => { call!.filters.push(['is',  c, v]); return builder; }),
    gte: vi.fn((c: string, v: unknown) => { call!.filters.push(['gte', c, v]); return builder; }),
    lte: vi.fn((c: string, v: unknown) => { call!.filters.push(['lte', c, v]); return builder; }),
    then: (resolve: (v: { data: null; error: { message: string } | null }) => unknown) =>
      Promise.resolve({ data: null, error: erroDoBanco }).then(resolve),
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((t: string) => createBuilder(t)) },
}));

const { limparMesDiario } = await import('./diario.service');

const EMPRESA = 'emp-1';
const MES     = '2026-08';
const SETOR   = 'setor-play-5';
const PERFIS  = ['op-1', 'op-2'];

/** Os filtros de uma passada, sem o recorte de empresa/mês que todas repetem. */
function alemDoMes(call: DeleteCall) {
  return call.filters.filter(([, coluna]) =>
    coluna !== 'empresa_id' && coluna !== 'dia_referencia');
}

/** Toda passada fica presa à empresa e ao mês — senão apaga o histórico. */
function conferirRecorteDoMes() {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.table).toBe('diario_recebimentos');
    expect(call.filters).toContainEqual(['eq',  'empresa_id',     EMPRESA]);
    expect(call.filters).toContainEqual(['gte', 'dia_referencia', '2026-08-01']);
    expect(call.filters).toContainEqual(['lte', 'dia_referencia', '2026-08-31']);
  }
}

beforeEach(() => {
  calls.length = 0;
  erroDoBanco  = null;
});

describe('limparMesDiario — recorte do mês', () => {
  it('usa dia_referencia, não data_pagamento', async () => {
    // A coluna do dia no diário é `dia_referencia`: cada linha é gravada no SEU
    // dia. Filtrar por `data_pagamento` deixaria de fora a linha sem data, que
    // cai no dia da moda do relatório.
    await limparMesDiario(EMPRESA, MES, null);
    conferirRecorteDoMes();
  });

  it('fevereiro em ano comum termina no dia 28', async () => {
    await limparMesDiario(EMPRESA, '2026-02', null);
    expect(calls[0].filters).toContainEqual(['gte', 'dia_referencia', '2026-02-01']);
    expect(calls[0].filters).toContainEqual(['lte', 'dia_referencia', '2026-02-28']);
  });

  it('sem escopo, apaga o mês inteiro da empresa numa passada só', async () => {
    const { error } = await limparMesDiario(EMPRESA, MES, null);
    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(alemDoMes(calls[0])).toEqual([]);
  });
});

describe('limparMesDiario — setor normal (porRelatorio)', () => {
  it('apaga pelo setor da linha, alcançando quem era do setor na importação', async () => {
    const { error } = await limparMesDiario(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: true,
    });

    expect(error).toBeNull();
    conferirRecorteDoMes();
    expect(alemDoMes(calls[0])).toEqual([['eq', 'setor_id', SETOR]]);
  });

  it('NÃO alcança linha do operador que está marcada em OUTRO setor', async () => {
    await limparMesDiario(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: true,
    });

    const porOperador = calls.filter(c =>
      c.filters.some(([op, coluna]) => op === 'in' && coluna === 'operador_id'));
    expect(porOperador.length).toBeGreaterThan(0);
    for (const call of porOperador) {
      expect(call.filters).toContainEqual(['is', 'setor_id', null]);
    }
  });

  it('cobre a linha sem setor, pelo operador e por quem importou', async () => {
    await limparMesDiario(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: true,
    });

    expect(alemDoMes(calls[1])).toEqual([
      ['in', 'operador_id', PERFIS],
      ['is', 'setor_id', null],
    ]);
    expect(alemDoMes(calls[2])).toEqual([
      ['is', 'operador_id', null],
      ['in', 'importado_por_id', PERFIS],
      ['is', 'setor_id', null],
    ]);
  });
});

describe('limparMesDiario — setor alternativo / PaguePlay', () => {
  it('apaga pelos operadores, sem exigir setor na linha', async () => {
    const { error } = await limparMesDiario(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: false,
    });

    expect(error).toBeNull();
    conferirRecorteDoMes();
    // Aqui o total do setor É a soma dos operadores, então a limpeza vai pelos
    // operadores — sem a trava de `setor_id IS NULL` do caso anterior.
    expect(alemDoMes(calls[0])).toEqual([['in', 'operador_id', PERFIS]]);
  });

  it('leva as linhas sem operador marcadas neste setor', async () => {
    await limparMesDiario(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: false,
    });

    expect(alemDoMes(calls[1])).toEqual([
      ['is', 'operador_id', null],
      ['eq', 'setor_id', SETOR],
    ]);
  });
});

describe('limparMesDiario — bordas', () => {
  it('escopo sem setor e sem perfis não apaga nada', async () => {
    // Um escopo vazio significa "não sei de quem é": apagar aqui seria apagar a
    // empresa toda por engano, no botão que devia ser o mais estreito.
    const { error } = await limparMesDiario(EMPRESA, MES, {
      setorId: null, perfilIds: [], porRelatorio: true,
    });
    expect(error).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('erro do banco na primeira passada interrompe as seguintes', async () => {
    erroDoBanco = { message: 'permission denied for table diario_recebimentos' };
    const { error } = await limparMesDiario(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: true,
    });
    expect(error).toBe('permission denied for table diario_recebimentos');
    expect(calls).toHaveLength(1);
  });
});
