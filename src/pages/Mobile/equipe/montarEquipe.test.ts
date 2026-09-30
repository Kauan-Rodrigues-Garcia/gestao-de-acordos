/**
 * A equipe no celular com os números do Painel: mesmo acumulado do card,
 * mesmas linhas dos Quartis recortadas na equipe, H.O. na PaguePlay.
 */
import { describe, it, expect } from 'vitest';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import { setHoPercentual } from '@/lib/hoPercentual';
import { montarEquipe, type FontesEquipe } from './montarEquipe';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';

const resumo = (id: string, total: number, ho = 0): ResumoOperadorAnalitico => ({
  operador_id: id, operador_usuario: id, operador_nome: id,
  total_recebido: total, total_ho: ho, total_pagamentos: 2,
});
const op = (id: string, equipe: string, extra = {}) => ({
  id, nome: `Pessoa ${id}`, foto_url: null, setor_id: 's1', equipe_id: equipe, situacao: 'ativo', ...extra,
});

function fontes(parcial: Partial<FontesEquipe> = {}): FontesEquipe {
  return {
    mes: '2026-09', hojeISO: '2026-09-30', emHO: false, ho: 0.25,
    equipes: [{ id: 'eq1', nome: 'Equipe Bryan', setor_id: 's1' }, { id: 'eq2', nome: 'Outra', setor_id: 's1' }],
    operadorEquipeMap: {
      a: { equipe_id: 'eq1', equipe_nome: 'Equipe Bryan', setor_id: 's1' },
      b: { equipe_id: 'eq1', equipe_nome: 'Equipe Bryan', setor_id: 's1' },
      c: { equipe_id: 'eq2', equipe_nome: 'Outra', setor_id: 's1' },
    },
    equipesExtrasPorOperador: {},
    resumos: [resumo('a', 900, 225), resumo('b', 300, 75), resumo('c', 5000, 1250)],
    creditosDeOrigem: [],
    metasEquipe: { eq1: 1000 },
    metasOperador: { a: 600, b: 600, c: 600 },
    metasIndiretas: {}, indiretoMap: {},
    feriados: [], contarHoje: true, quartis: QUARTIS_PADRAO, treinoMap: {},
    operadores: [op('a', 'eq1'), op('b', 'eq1'), op('c', 'eq2')],
    setores: { s1: 'Receptivo' },
    ...parcial,
  };
}

describe('montarEquipe', () => {
  it('acumulado, meta e quem está na equipe', () => {
    const e = montarEquipe(fontes(), 'eq1')!;
    expect(e.nome).toBe('Equipe Bryan');
    expect(e.setorNome).toBe('Receptivo');
    expect(e.acumulado).toBe(1200);
    expect(e.meta).toBe(1000);
    expect(e.operadorIds.sort()).toEqual(['a', 'b']);
    expect(e.linhas.map(l => l.op.id)).toEqual(['a', 'b']);
    // Fim do mês com contarHoje: esperado = meta cheia.
    expect(e.esperado).toBe(1000);
    expect(e.detalhe.projecaoPct).toBe(120);
  });

  it('clone conta na equipe clonada', () => {
    const e = montarEquipe(fontes({ equipesExtrasPorOperador: { c: ['eq1'] } }), 'eq1')!;
    expect(e.acumulado).toBe(6200);
    expect(e.operadorIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('PaguePlay: recebido em H.O. e meta convertida pelo percentual', () => {
    setHoPercentual(0.25);
    const e = montarEquipe(fontes({ emHO: true }), 'eq1')!;
    expect(e.acumulado).toBe(300);
    expect(e.meta).toBe(250);
  });

  it('equipe sem meta: sem esperado e sem projeção', () => {
    const e = montarEquipe(fontes({ metasEquipe: {} }), 'eq1')!;
    expect(e.meta).toBeNull();
    expect(e.esperado).toBeNull();
    expect(e.detalhe.projecaoPct).toBeNull();
  });

  it('equipe desconhecida devolve null', () => {
    expect(montarEquipe(fontes(), 'nao-existe')).toBeNull();
  });
});
