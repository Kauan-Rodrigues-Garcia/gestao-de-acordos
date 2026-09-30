/**
 * As linhas da aba Quartis — a conta que o Painel do Líder e o celular usam.
 *
 * Setembro/2026: 22 dias úteis. Com hoje = 30/09 e `contarHoje`, 22 decorridos
 * — o esperado é a meta inteira, e a % é recebido ÷ meta.
 */
import { describe, it, expect } from 'vitest';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import {
  montarLinhasQuartil, distribuicaoQuartis,
  type EntradaLinhasQuartil, type PerfilOp,
} from './linhasQuartil';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';

const op = (id: string, extra: Partial<PerfilOp> = {}): PerfilOp => ({
  id, nome: id.toUpperCase(), foto_url: null, setor_id: 's1', equipe_id: 'eq1', ...extra,
});
const resumo = (id: string, total: number, ho = 0): ResumoOperadorAnalitico => ({
  operador_id: id, operador_usuario: id, operador_nome: id,
  total_recebido: total, total_ho: ho, total_pagamentos: 4,
});

function entrada(parcial: Partial<EntradaLinhasQuartil>): EntradaLinhasQuartil {
  return {
    anoNum: 2026, mesNum: 9, mes: '2026-09', hojeISO: '2026-09-30',
    feriados: [], contarHoje: true, quartis: QUARTIS_PADRAO,
    resumos: [], operadores: [], metasOp: {}, metasIndiretas: {}, indiretoMap: {},
    emHO: false, ho: 0.2496, setorIds: [], equipeIds: [],
    operadorEquipeMap: {}, equipesExtrasPorOperador: {},
    setorDaEquipe: new Map([['eq1', 's1'], ['eq2', 's1']]),
    nomeDaEquipe: new Map([['eq1', 'Equipe 1'], ['eq2', 'Equipe 2']]),
    treinoMap: {},
    ...parcial,
  };
}
const todas = (r: ReturnType<typeof montarLinhasQuartil>) => [...r.porSetor.values()].flat();

describe('montarLinhasQuartil', () => {
  it('projeção e faixa pela meta e pelos dias úteis', () => {
    const r = montarLinhasQuartil(entrada({
      operadores: [op('a'), op('b')],
      resumos: [resumo('a', 1000), resumo('b', 700)],
      metasOp: { a: 1000, b: 1000 },
    }));
    const [a, b] = todas(r);
    expect(a.op.id).toBe('a');
    expect(a.projecao).toBe(100);
    expect(a.quartil?.quartil).toBe(1);
    expect(b.projecao).toBe(70);
    expect(b.quartil?.quartil).toBe(3);
    expect(a.equipeNome).toBe('Equipe 1');
    expect(a.pagamentos).toBe(4);
  });

  it('férias e desligado saem; sem meta vai para a lista à parte', () => {
    const r = montarLinhasQuartil(entrada({
      operadores: [op('a'), op('f', { situacao: 'ferias' }), op('d', { situacao: 'desligado' }), op('s')],
      resumos: [resumo('a', 500)],
      metasOp: { a: 1000, f: 1000, d: 1000 },
    }));
    expect(todas(r).map(l => l.op.id)).toEqual(['a']);
    expect(r.semMeta.map(o => o.id)).toEqual(['s']);
  });

  it('arquivado some só dos meses depois da saída', () => {
    const arq = op('x', { arquivado: true, desligado_em: '2026-08-20' });
    const setembro = montarLinhasQuartil(entrada({ operadores: [arq], metasOp: { x: 1000 } }));
    expect(todas(setembro)).toHaveLength(0);
    const agosto = montarLinhasQuartil(entrada({
      mes: '2026-08', mesNum: 8, hojeISO: '2026-08-31', operadores: [arq], metasOp: { x: 1000 },
    }));
    expect(todas(agosto)).toHaveLength(1);
  });

  it('recorte por equipe inclui o clone emprestado', () => {
    const r = montarLinhasQuartil(entrada({
      operadores: [op('a'), op('b', { equipe_id: 'eq2' }), op('c', { equipe_id: 'eq2' })],
      metasOp: { a: 1000, b: 1000, c: 1000 },
      equipeIds: ['eq1'],
      equipesExtrasPorOperador: { c: ['eq1'] },
    }));
    expect(todas(r).map(l => l.op.id).sort()).toEqual(['a', 'c']);
  });

  it('em H.O. o recebido é o total_ho e a meta é convertida', () => {
    const r = montarLinhasQuartil(entrada({
      operadores: [op('a')], resumos: [resumo('a', 1000, 250)], metasOp: { a: 1000 }, emHO: true,
    }));
    const [a] = todas(r);
    expect(a.recebido).toBe(250);
    expect(a.meta).not.toBe(1000);
  });

  it('equipe de treinamento projeta contra os dias desde o início', () => {
    const r = montarLinhasQuartil(entrada({
      operadores: [op('a')], resumos: [resumo('a', 350)], metasOp: { a: 1000 },
      treinoMap: { eq1: '2026-09-21' },
    }));
    const [a] = todas(r);
    expect(a.dias).toEqual({ totalUteis: 8, decorridos: 8 });
    expect(a.projecao).toBe(35);
  });
});

describe('distribuicaoQuartis', () => {
  it('conta por faixa, na ordem da 1ª para a 4ª', () => {
    const r = montarLinhasQuartil(entrada({
      operadores: [op('a'), op('b'), op('c')],
      resumos: [resumo('a', 1000), resumo('b', 900), resumo('c', 100)],
      metasOp: { a: 1000, b: 1000, c: 1000 },
    }));
    expect(distribuicaoQuartis(todas(r), QUARTIS_PADRAO)).toEqual({
      total: 3,
      fatias: [
        { quartil: 1, qtd: 1 }, { quartil: 2, qtd: 1 },
        { quartil: 3, qtd: 0 }, { quartil: 4, qtd: 1 },
      ],
    });
  });
});
