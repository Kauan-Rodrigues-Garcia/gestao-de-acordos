/**
 * periodo.test.ts — a leitura do analítico do Desempenho do Dia.
 *
 * Até 19/10/2026 ela baixava a EMPRESA inteira para qualquer escopo e parava
 * em 12 páginas. Com o 59 escrevendo no analítico, a janela de 15 dias da
 * BookPlay passou de 12 mil linhas (12.423 na janela que termina em 16/10) e o
 * corte levava as linhas mais novas — o painel do setor somava menos do que o
 * setor recebeu, sem aviso.
 *
 * Fixa as duas metades do conserto: o recorte desce ao banco, e nada corta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Chamada = { metodo: string; args: unknown[] };

const banco = vi.hoisted(() => ({
  /** Quantas linhas a consulta «tem» no banco. */
  total: 0,
  /** Uma lista de chamadas por consulta montada. */
  consultas: [] as Chamada[][],
}));

vi.mock('@/lib/supabase', () => {
  function construtor() {
    const chamadas: Chamada[] = [];
    banco.consultas.push(chamadas);
    let faixa: [number, number] = [0, 999];
    const alvo: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'gte', 'lte', 'in', 'or', 'order']) {
      alvo[metodo] = (...args: unknown[]) => { chamadas.push({ metodo, args }); return alvo; };
    }
    alvo.range = (de: number, ate: number) => {
      chamadas.push({ metodo: 'range', args: [de, ate] });
      faixa = [de, ate];
      return alvo;
    };
    alvo.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
      const [de, ate] = faixa;
      const n = Math.max(0, Math.min(ate, banco.total - 1) - de + 1);
      const data = Array.from({ length: n }, (_, i) => ({
        data_pagamento: '2026-10-16',
        valor_recebido: 1,
        total_ho: 0,
        operador_id: `op-${de + i}`,
        setor_id: 's-1',
        procedencia: 'relatorio_59',
        contribuicao_de_setor_id: null,
      }));
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return alvo;
  }
  return { supabase: { from: () => construtor() } };
});

import { buscarAnaliticoPeriodo, recorteDoPeriodo } from './desempenhoDia.service';

const BASE = { empresaId: 'e-1', de: '2026-10-02', ate: '2026-10-16' };

const usou = (c: Chamada[], metodo: string) => c.filter(x => x.metodo === metodo);

beforeEach(() => {
  banco.total = 0;
  banco.consultas = [];
});

describe('recorteDoPeriodo', () => {
  it('operador explícito manda, qualquer que seja o escopo', () => {
    expect(recorteDoPeriodo({ tipo: 'empresa' }, 'u-1'))
      .toEqual({ tipo: 'operador', operadorId: 'u-1' });
  });

  it('equipe vira a lista de pessoas', () => {
    expect(recorteDoPeriodo({ tipo: 'equipe', operadores: new Set(['a', 'b']) }))
      .toEqual({ tipo: 'pessoas', operadores: ['a', 'b'] });
  });

  it('equipe com créditos de quem saiu não recorta por pessoa — perderia o crédito', () => {
    expect(recorteDoPeriodo({
      tipo: 'equipe', operadores: new Set(['a']), creditos: new Set(['x|s-1']),
    })).toEqual({ tipo: 'tudo' });
  });

  it('empresa e sem escopo', () => {
    expect(recorteDoPeriodo({ tipo: 'empresa' })).toEqual({ tipo: 'empresa' });
    expect(recorteDoPeriodo(null)).toEqual({ tipo: 'tudo' });
  });
});

describe('buscarAnaliticoPeriodo', () => {
  it('lê a empresa até o fim, mesmo passando de 12 mil linhas', async () => {
    banco.total = 13_500;
    const r = await buscarAnaliticoPeriodo({ ...BASE, escopo: { tipo: 'empresa' } });
    expect(r.erro).toBeNull();
    expect(r.linhas).toHaveLength(13_500);
  });

  it('empresa: a contribuição sai no banco, sem perder procedência nula', async () => {
    banco.total = 10;
    await buscarAnaliticoPeriodo({ ...BASE, escopo: { tipo: 'empresa' } });
    const filtros = banco.consultas.flatMap(c => usou(c, 'or')).map(x => x.args[0]);
    expect(new Set(filtros)).toEqual(new Set(['procedencia.is.null,procedencia.neq.contribuicao_59']));
  });

  it('equipe: só as pessoas dela, em fatias de 100 ids', async () => {
    banco.total = 5;
    const operadores = new Set(Array.from({ length: 250 }, (_, i) => `p-${i}`));
    await buscarAnaliticoPeriodo({ ...BASE, escopo: { tipo: 'equipe', operadores } });
    const fatias = banco.consultas.flatMap(c => usou(c, 'in'));
    expect(fatias).toHaveLength(3);
    expect(fatias.map(f => (f.args[1] as string[]).length)).toEqual([100, 100, 50]);
    expect(fatias.every(f => f.args[0] === 'operador_id')).toBe(true);
    // Nenhuma consulta sem recorte: a empresa inteira não desce mais.
    expect(banco.consultas.every(c => usou(c, 'in').length === 1)).toBe(true);
  });

  it('equipe vazia não consulta nada', async () => {
    const r = await buscarAnaliticoPeriodo({ ...BASE, escopo: { tipo: 'equipe', operadores: new Set() } });
    expect(r).toEqual({ linhas: [], erro: null });
    expect(banco.consultas).toHaveLength(0);
  });

  it('operador: o filtro é a pessoa', async () => {
    banco.total = 3;
    await buscarAnaliticoPeriodo({ ...BASE, operadorId: 'u-1', escopo: { tipo: 'empresa' } });
    const eqs = banco.consultas.flatMap(c => usou(c, 'eq')).map(x => x.args);
    expect(eqs).toContainEqual(['operador_id', 'u-1']);
    expect(banco.consultas.flatMap(c => usou(c, 'or'))).toHaveLength(0);
  });

  it('toda página é ordenada pela PK', async () => {
    banco.total = 2_500;
    await buscarAnaliticoPeriodo({ ...BASE, escopo: { tipo: 'empresa' } });
    expect(banco.consultas.every(c => usou(c, 'order').some(o => o.args[0] === 'id'))).toBe(true);
  });
});
