import { describe, expect, it } from 'vitest';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { LinhaQuartil } from '@/pages/Dashboard/Analitico/linhasQuartil';
import type { EquipeNaTela } from '../equipe/montarEquipe';
import { hojeDoConjunto, quartisDoSetor } from './contas';

const linha = (id: string, q: number | null): LinhaQuartil => ({
  op: { id, nome: id, foto_url: null, setor_id: 's', equipe_id: null },
  quartil: q ? QUARTIS_PADRAO.find(x => x.quartil === q)! : null,
} as unknown as LinhaQuartil);
const equipe = (id: string, linhas: LinhaQuartil[]) => ({ id, linhas } as unknown as EquipeNaTela);

describe('quartisDoSetor', () => {
  it('quantidade e % por faixa; quem está em duas equipes conta uma vez; sem meta fica fora', () => {
    const r = quartisDoSetor([
      equipe('a', [linha('p1', 1), linha('p2', 2), linha('p3', null)]),
      equipe('b', [linha('p1', 1), linha('p4', 4)]),
    ]);
    expect(r.total).toBe(3);
    expect(r.faixas.map(f => [f.quartil, f.qtd])).toEqual([[1, 1], [2, 1], [3, 0], [4, 1]]);
    expect(r.faixas[0].pct).toBeCloseTo(100 / 3, 6);
  });
  it('ninguém com meta: total zero, sem dividir por zero', () => {
    expect(quartisDoSetor([equipe('a', [linha('p1', null)])]).faixas.every(f => f.pct === 0)).toBe(true);
  });
});

describe('hojeDoConjunto', () => {
  const l = (data: string, valor: number, op: string | null) => ({
    operador_id: op, setor_id: 's', importado_por_id: null, valor_recebido: valor, data_pagamento: data,
  });
  it('soma só o dia de hoje e só o escopo pedido', () => {
    const linhas = [l('2026-10-06', 100, 'a'), l('2026-10-06', 50, 'b'), l('2026-10-05', 999, 'a')];
    expect(hojeDoConjunto(linhas, '2026-10-06', { tipo: 'equipe', operadores: new Set(['a']) })).toEqual({ total: 100, qtd: 1 });
    expect(hojeDoConjunto(linhas, '2026-10-06', null)).toEqual({ total: 150, qtd: 2 });
  });
});
