/**
 * acumuladoDoSetor.test.ts — o número do card de setor, fora do JSX.
 *
 * A aba Comissão da tela de Metas confirma «o setor bateu a meta» olhando este
 * número. Se ele divergir do card de Desempenho Equipes, a liderança confirma
 * uma coisa enquanto o card diz outra — e é dinheiro que depende disso.
 */
import { describe, it, expect } from 'vitest';
import { somarAnaliticoPorSetor, acumuladoDoSetor, type SomaDoSetor } from './acumuladoDoSetor';
import type { ResumoOperadorAnalitico, OperadorEquipeInfo } from './analitico.service';

function resumo(id: string, bruto: number, ho = 0, ajuste = 0): ResumoOperadorAnalitico {
  return {
    operador_id: id, operador_usuario: id, operador_nome: id,
    total_recebido: bruto, total_ho: ho, total_pagamentos: 1, ajuste_manual: ajuste,
  } as ResumoOperadorAnalitico;
}

const MAPA: Record<string, OperadorEquipeInfo> = {
  ana:   { equipe_id: 'eq-a',  equipe_nome: 'A',  setor_id: 's1' },
  bruno: { equipe_id: 'eq-b',  equipe_nome: 'B',  setor_id: 's2' },
};
const SETOR_DA_EQUIPE = new Map<string, string>([
  ['eq-a', 's1'], ['eq-a2', 's1'], ['eq-b', 's2'],
]);

function somar(over: Partial<Parameters<typeof somarAnaliticoPorSetor>[0]> = {}) {
  return somarAnaliticoPorSetor({
    resumos: [resumo('ana', 1_000, 250), resumo('bruno', 500, 120)],
    operadorEquipeMap: MAPA,
    equipesExtrasPorOperador: {},
    setorDaEquipe: SETOR_DA_EQUIPE,
    orfaosPorSetor: {},
    ...over,
  });
}

describe('somarAnaliticoPorSetor', () => {
  it('soma cada operador no setor dele', () => {
    const r = somar();
    expect(r.s1).toEqual({ bruto: 1_000, ho: 250, ajuste: 0 });
    expect(r.s2).toEqual({ bruto: 500, ho: 120, ajuste: 0 });
  });

  it('clone soma também no setor da equipe clonada, sem sair do próprio', () => {
    const r = somar({ equipesExtrasPorOperador: { bruno: ['eq-a'] } });
    expect(r.s1.bruto).toBe(1_500);
    expect(r.s2.bruto).toBe(500);
  });

  it('clone numa equipe do próprio setor não conta duas vezes', () => {
    const r = somar({ equipesExtrasPorOperador: { ana: ['eq-a2'] } });
    expect(r.s1.bruto).toBe(1_000);
  });

  it('órfãos entram só no bruto do setor da importação', () => {
    const r = somar({ orfaosPorSetor: { s1: { total: 300, qtd: 2 } } });
    expect(r.s1).toEqual({ bruto: 1_300, ho: 250, ajuste: 0 });
  });

  it('o ajuste manual viaja junto com o recebido', () => {
    const r = somar({ resumos: [resumo('ana', 1_000, 250, 200)] });
    expect(r.s1.ajuste).toBe(200);
  });
});

describe('acumuladoDoSetor', () => {
  const somaPorSetor: Record<string, SomaDoSetor> = { s1: { bruto: 1_000, ho: 250, ajuste: 50 } };
  const totalPorSetor = { s1: { total: 1_200, ho: 300 } };

  it('BookPlay, setor normal: total do relatório mais o Receptivo', () => {
    expect(acumuladoDoSetor({
      setorId: 's1', isPaguePlay: false, alternativo: false,
      somaPorSetor, totalPorSetor, receptivoPorSetor: { s1: { acumulado: 100 } },
    })).toEqual({ bruto: 1_300, ho: 300, ajuste: 50 });
  });

  it('BookPlay, setor alternativo: soma dos usuários mais o Receptivo', () => {
    expect(acumuladoDoSetor({
      setorId: 's1', isPaguePlay: false, alternativo: true,
      somaPorSetor, totalPorSetor, receptivoPorSetor: { s1: { acumulado: 100 } },
    })).toEqual({ bruto: 1_100, ho: 250, ajuste: 50 });
  });

  it('PaguePlay: soma dos operadores', () => {
    expect(acumuladoDoSetor({
      setorId: 's1', isPaguePlay: true, alternativo: false,
      somaPorSetor, totalPorSetor, receptivoPorSetor: {},
    })).toEqual({ bruto: 1_000, ho: 250, ajuste: 50 });
  });

  it('o Receptivo não entra no H.O. — é valor digitado em bruto', () => {
    const r = acumuladoDoSetor({
      setorId: 's1', isPaguePlay: false, alternativo: false,
      somaPorSetor, totalPorSetor, receptivoPorSetor: { s1: { acumulado: 999 } },
    });
    expect(r.ho).toBe(300);
  });

  it('setor sem dado nenhum é zero, não NaN', () => {
    expect(acumuladoDoSetor({
      setorId: 'sx', isPaguePlay: false, alternativo: false,
      somaPorSetor, totalPorSetor, receptivoPorSetor: {},
    })).toEqual({ bruto: 0, ho: 0, ajuste: 0 });
  });
});
