/**
 * limpezaSetor.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * "Limpar mês" e "Remover órfãos" no escopo de um setor.
 *
 * O defeito que estes testes travam foi medido no banco da BookPlay em
 * agosto/2026: depois de limpar o mês do Play 5 sobravam 9 linhas carimbadas
 * Play 5 (R$ 4.851,21) cujos operadores pertenciam ao Play Mix Marília e ao
 * Play 4. O card do setor normal soma pelo CARIMBO (`buscarTotalPorSetor`) e a
 * limpeza apagava por OPERADOR — dois conjuntos diferentes para a mesma
 * pergunta. A tela ficava com dinheiro num mês supostamente zerado, e a
 * reimportação somava o relatório por cima do resto: R$ 146.032,70 num arquivo
 * de R$ 143.114,70.
 *
 * A garantia, portanto, é de simetria: a limpeza apaga exatamente o conjunto
 * que `linhaNoEscopo` soma, caso a caso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock do Supabase (padrão thenable do projeto) ───────────────────────────

interface DeleteCall {
  table: string;
  /** Cada filtro na ordem em que foi aplicado. */
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

import { limparDadosDoMesSetor, removerOrfaosDoMes } from './analitico.service';

const EMPRESA = 'emp-1';
const MES     = '2026-08';
const SETOR   = 'setor-play-5';
const PERFIS  = ['op-1', 'op-2'];

/** Os filtros de uma passada, sem o recorte de empresa/mês que todas repetem. */
function alemDoMes(call: DeleteCall) {
  return call.filters.filter(([, coluna]) =>
    coluna !== 'empresa_id' && coluna !== 'data_pagamento');
}

/** Toda passada tem de ficar presa à empresa e ao mês — senão apaga o histórico. */
function conferirRecorteDoMes() {
  for (const call of calls) {
    expect(call.table).toBe('analitico_recebimentos');
    expect(call.filters).toContainEqual(['eq',  'empresa_id',     EMPRESA]);
    expect(call.filters).toContainEqual(['gte', 'data_pagamento', '2026-08-01']);
    expect(call.filters).toContainEqual(['lte', 'data_pagamento', '2026-08-31']);
  }
}

beforeEach(() => {
  calls.length = 0;
  erroDoBanco  = null;
});

// ── Setor normal: o card soma pelo carimbo, a limpeza apaga pelo carimbo ────

describe('limparDadosDoMesSetor — setor normal (porRelatorio)', () => {
  it('apaga pelo CARIMBO, alcançando linha de operador de outro setor', async () => {
    const { error } = await limparDadosDoMesSetor(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: true,
    });

    expect(error).toBeNull();
    conferirRecorteDoMes();
    // A primeira passada é a que resolve o caso do Play 5: sem cláusula de
    // operador, então a linha do operador do Play Mix Marília também cai.
    expect(alemDoMes(calls[0])).toEqual([['eq', 'setor_id', SETOR]]);
  });

  it('NÃO alcança linha de operador do setor carimbada em OUTRO setor', async () => {
    await limparDadosDoMesSetor(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: true,
    });

    // Toda passada por operador exige `setor_id IS NULL`. É o que impede a
    // limpeza do Play 4 de derrubar a linha que aparece no card do Play 5.
    const porOperador = calls.filter(c =>
      c.filters.some(([op, coluna]) => op === 'in' && coluna === 'operador_id'));
    expect(porOperador.length).toBeGreaterThan(0);
    for (const call of porOperador) {
      expect(call.filters).toContainEqual(['is', 'setor_id', null]);
    }
  });

  it('cobre a linha antiga sem carimbo, pelo operador e por quem importou', async () => {
    await limparDadosDoMesSetor(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: true,
    });

    expect(calls).toHaveLength(3);
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

// ── Setor alternativo / PaguePlay: o card soma pelos operadores ─────────────

describe('limparDadosDoMesSetor — setor alternativo e PaguePlay', () => {
  it('apaga pelos operadores, sem exigir carimbo', async () => {
    await limparDadosDoMesSetor(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: false,
    });

    conferirRecorteDoMes();
    // Aqui o carimbo NÃO pode entrar: o setor alternativo não tem relatório
    // próprio, e na PaguePlay meses antigos não têm carimbo nenhum.
    expect(alemDoMes(calls[0])).toEqual([['in', 'operador_id', PERFIS]]);
  });

  it('apaga também a órfã carimbada no setor — ela conta no card', async () => {
    await limparDadosDoMesSetor(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: false,
    });

    expect(alemDoMes(calls[1])).toEqual([
      ['is', 'operador_id', null],
      ['eq', 'setor_id', SETOR],
    ]);
  });
});

describe('limparDadosDoMesSetor — bordas', () => {
  it('não apaga nada quando não há setor nem perfis', async () => {
    const { error } = await limparDadosDoMesSetor(EMPRESA, MES, {
      setorId: null, perfilIds: [], porRelatorio: true,
    });

    expect(error).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('setor sem nenhum perfil cadastrado ainda limpa pelo carimbo', async () => {
    // Caso real: setor cujo relatório traz só operadores emprestados de outros
    // setores. Pela regra antiga (`if (!perfilIds.length) return`) o botão não
    // fazia absolutamente nada, em silêncio.
    await limparDadosDoMesSetor(EMPRESA, MES, {
      setorId: SETOR, perfilIds: [], porRelatorio: true,
    });

    expect(calls).toHaveLength(1);
    expect(alemDoMes(calls[0])).toEqual([['eq', 'setor_id', SETOR]]);
  });

  it('para na primeira falha e devolve a mensagem do banco', async () => {
    erroDoBanco = { message: 'permission denied' };

    const { error } = await limparDadosDoMesSetor(EMPRESA, MES, {
      setorId: SETOR, perfilIds: PERFIS, porRelatorio: true,
    });

    expect(error).toBe('permission denied');
    expect(calls).toHaveLength(1);
  });
});

// ── Órfãos ──────────────────────────────────────────────────────────────────

describe('removerOrfaosDoMes', () => {
  it('sem escopo, remove todos os órfãos do mês', async () => {
    const { error } = await removerOrfaosDoMes(EMPRESA, MES);

    expect(error).toBeNull();
    expect(calls).toHaveLength(1);
    expect(alemDoMes(calls[0])).toEqual([['is', 'operador_id', null]]);
  });

  it('com escopo, remove o órfão CARIMBADO no setor — não só o que ele importou', async () => {
    // A lista da tela (`filtrarOrfaosDoSetor`) mostra o órfão pelo carimbo, com
    // fallback para o setor de quem importou. Filtrar só por `importado_por_id`
    // deixava na tela exatamente o órfão que o líder acabara de mandar remover.
    await removerOrfaosDoMes(EMPRESA, MES, { setorId: SETOR, perfilIds: PERFIS });

    conferirRecorteDoMes();
    expect(alemDoMes(calls[0])).toEqual([
      ['is', 'operador_id', null],
      ['eq', 'setor_id', SETOR],
    ]);
    expect(alemDoMes(calls[1])).toEqual([
      ['is', 'operador_id', null],
      ['in', 'importado_por_id', PERFIS],
      ['is', 'setor_id', null],
    ]);
  });

  it('escopo vazio não apaga nada', async () => {
    const { error } = await removerOrfaosDoMes(EMPRESA, MES, { setorId: null, perfilIds: [] });

    expect(error).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
