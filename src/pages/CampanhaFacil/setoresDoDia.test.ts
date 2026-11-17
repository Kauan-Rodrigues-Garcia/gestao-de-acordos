import { describe, it, expect } from 'vitest';
import type { LoteCampanha, PlacarOperador } from './campanhaFacilEnvios.service';
import {
  agruparPorSetor, campanhaDoDia, faltam, limitesDoDia, pctEnviado, setoresSemCampanha, totalDoDia,
} from './setoresDoDia';

function lote(p: Partial<LoteCampanha>): LoteCampanha {
  return {
    id: 'l', empresa_id: 'e', setor_id: 's1', setor_nome: 'Setor 1', titulo: 'Campanha', arquivo_nome: '',
    modelo: null, sem_valores: false, total: 0, ativa: true, lancada_em: '2026-11-16T12:00:00Z',
    desativada_em: null, relancada_em: null, editada_em: null, criado_em: '2026-11-16T12:00:00Z',
    expira_em: '2026-11-19T12:00:00Z', encerrada_em: null, placar: null, votos_bom: 0, votos_ruim: 0,
    criado_por: 'lider1', criado_por_nome: 'Ana', ...p,
  };
}
const op = (id: string, total: number, enviados: number, nao = 0): PlacarOperador =>
  ({ operador_id: id, nome: id, total, enviados, nao_enviados: nao });

describe('campanha do dia', () => {
  it('soma o placar e conta quem acabou (enviada ou «não deu»)', () => {
    const c = campanhaDoDia(lote({ total: 30 }), [op('a', 10, 10), op('b', 10, 7, 3), op('c', 10, 2)]);
    expect(c.andamento).toEqual({ total: 30, enviados: 19, nao: 3 });
    expect(c.concluiram).toBe(2);
    expect(c.operadores).toBe(3);
    expect(faltam(c.andamento)).toBe(8);
  });

  it('sem andamento lido, fica o total do lançamento e nada enviado', () => {
    const c = campanhaDoDia(lote({ total: 40 }), null);
    expect(c.andamento).toEqual({ total: 40, enviados: 0, nao: 0 });
    expect(c.operadores).toBe(0);
  });

  it('a porcentagem é cortada, não arredondada', () => {
    expect(pctEnviado({ total: 1000, enviados: 996, nao: 0 })).toBe(99);
    expect(pctEnviado({ total: 0, enviados: 0, nao: 0 })).toBe(0);
  });
});

describe('agrupar por setor', () => {
  const nomes = new Map([['s1', 'Cobrança'], ['s2', 'Receptivo'], ['s3', 'Jornada']]);
  const campanhas = [
    campanhaDoDia(lote({ id: '1', setor_id: 's1', lancada_em: '2026-11-16T11:00:00Z', criado_por: 'ana', criado_por_nome: 'Ana' }), [op('a', 10, 10), op('b', 10, 5)]),
    campanhaDoDia(lote({ id: '2', setor_id: 's1', lancada_em: '2026-11-16T14:00:00Z', criado_por: 'ana', criado_por_nome: 'Ana' }), [op('b', 5, 5)]),
    campanhaDoDia(lote({ id: '3', setor_id: 's2', lancada_em: '2026-11-16T13:00:00Z', criado_por: 'bia', criado_por_nome: 'Bia' }), [op('c', 100, 0)]),
    campanhaDoDia(lote({ id: '4', setor_id: 's1', lancada_em: '2026-11-16T09:00:00Z', criado_por: 'caio', criado_por_nome: 'Caio' }), [op('d', 3, 3)]),
  ];
  const setores = agruparPorSetor(campanhas, nomes);

  it('separa por setor, com o nome do cadastro, e ordena por mensagens', () => {
    expect(setores.map((s) => s.nome)).toEqual(['Receptivo', 'Cobrança']);
    expect(setores[1].andamento).toEqual({ total: 28, enviados: 23, nao: 0 });
  });

  it('as campanhas do setor vêm da mais nova para a mais antiga', () => {
    expect(setores[1].campanhas.map((c) => c.lote.id)).toEqual(['2', '1', '4']);
    expect(setores[1].ultima).toBe('2026-11-16T14:00:00Z');
  });

  it('a mesma pessoa em duas campanhas conta uma vez; acabou só se acabou tudo', () => {
    // a: 10/10; b: 5/10 + 5/5 = 10/15; d: 3/3.
    expect(setores[1].operadores).toBe(3);
    expect(setores[1].concluiram).toBe(2);
  });

  it('separa por líder: quantas campanhas cada um fez no setor, de quem fez mais para quem fez menos', () => {
    const l = setores[1].lideres;
    expect(l.map((x) => [x.nome, x.campanhas.length])).toEqual([['Ana', 2], ['Caio', 1]]);
    expect(l[0].campanhas.map((c) => c.lote.id)).toEqual(['2', '1']);
    expect(l[0].andamento).toEqual({ total: 25, enviados: 20, nao: 0 });
    expect(l[0].ultima).toBe('2026-11-16T14:00:00Z');
  });

  it('o líder é pela conta, não pelo nome: dois homônimos ficam separados', () => {
    const r = agruparPorSetor([
      campanhaDoDia(lote({ id: 'x', criado_por: 'u1', criado_por_nome: 'Ana' }), null),
      campanhaDoDia(lote({ id: 'y', criado_por: 'u2', criado_por_nome: 'Ana' }), null),
    ]);
    expect(r[0].lideres).toHaveLength(2);
  });

  it('os setores sem campanha ficam à parte', () => {
    const todos = [{ id: 's1', nome: 'Cobrança' }, { id: 's2', nome: 'Receptivo' }, { id: 's3', nome: 'Jornada' }];
    expect(setoresSemCampanha(todos, setores)).toEqual([{ id: 's3', nome: 'Jornada' }]);
  });

  it('o total do dia soma os setores', () => {
    expect(totalDoDia(setores)).toEqual({ campanhas: 4, lideres: 3, total: 128, enviados: 23, nao: 0 });
  });

  it('campanha antiga sem setor vai para «Sem setor»', () => {
    const r = agruparPorSetor([campanhaDoDia(lote({ setor_id: null, setor_nome: null, total: 5 }), null)]);
    expect(r[0].nome).toBe('Sem setor');
  });
});

describe('limites do dia', () => {
  it('vai da meia-noite local até a próxima meia-noite', () => {
    const { de, ate } = limitesDoDia(new Date(2026, 10, 16, 15, 30));
    expect(new Date(de)).toEqual(new Date(2026, 10, 16));
    expect(new Date(ate)).toEqual(new Date(2026, 10, 17));
  });
});
