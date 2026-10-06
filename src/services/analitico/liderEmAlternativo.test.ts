import { describe, expect, it } from 'vitest';
import { liderNaoContaEmEquipeDeAlternativo } from './liderEmAlternativo';
import { setoresDoOperador } from './analitico.service';
import { somarPorEquipe } from '@/pages/Dashboard/Analitico/acumuladoDaEquipe';
import { somarAnaliticoPorSetor } from './acumuladoDoSetor';

/*
 * O caso do Brunno Piccolo (06/10/2026): cadastrado no Marília Digital
 * (alternativo), lidera duas equipes lá e duas no Play Mix Marília. A Thaynara
 * é clone numa equipe do Digital.
 */
const DIG = 'dig', PMM = 'pmm';
const setorDaEquipe = new Map([['d1', DIG], ['d2', DIG], ['p1', PMM], ['p2', PMM]]);
const nomeDaEquipe = new Map([['d1', 'Digital 1'], ['d2', 'Digital 2'], ['p1', 'Mix 1'], ['p2', 'Mix 2']]);
const alternativos = new Set([DIG]);

const resumo = (operador_id: string, total: number) => ({
  operador_id, operador_usuario: operador_id, operador_nome: operador_id,
  total_recebido: total, total_ho: 0, total_pagamentos: 1, ajuste_manual: 0,
});

describe('o líder não conta na equipe de setor alternativo', () => {
  // Como a composição chega: o líder em todas as equipes que lidera.
  const base = {
    operadorEquipeMap: {
      brunno:   { equipe_id: 'd1', equipe_nome: 'Digital 1', setor_id: DIG },
      thaynara: { equipe_id: 'p1', equipe_nome: 'Mix 1', setor_id: PMM },
      vanessa:  { equipe_id: 'd2', equipe_nome: 'Digital 2', setor_id: DIG },
    },
    equipesExtrasPorOperador: { brunno: ['d2', 'p1', 'p2'], thaynara: ['d1'] },
    lideradas: { brunno: ['d1', 'd2', 'p1', 'p2'], vanessa: ['d2'] },
    setorDaEquipe, nomeDaEquipe, alternativos,
  };
  const r = liderNaoContaEmEquipeDeAlternativo(base);
  const setores = (op: string) => setoresDoOperador(op, r.operadorEquipeMap, r.equipesExtrasPorOperador, setorDaEquipe);

  it('sai das equipes do alternativo e fica nas de setor normal', () => {
    expect(r.operadorEquipeMap.brunno.equipe_id).toBe('p1');
    expect(r.operadorEquipeMap.brunno.equipe_nome).toBe('Mix 1');
    expect(r.equipesExtrasPorOperador.brunno).toEqual(['p2']);
  });

  it('continua contando no total do alternativo, uma vez', () => {
    expect([...setores('brunno')].sort()).toEqual([DIG, PMM]);
    const porSetor = somarAnaliticoPorSetor({
      resumos: [resumo('brunno', 1000), resumo('thaynara', 300), resumo('vanessa', 50)],
      operadorEquipeMap: r.operadorEquipeMap, equipesExtrasPorOperador: r.equipesExtrasPorOperador,
      setorDaEquipe, orfaosPorSetor: {},
    });
    expect(porSetor[DIG].bruto).toBe(1350);
  });

  it('o dinheiro do líder não entra no card das equipes do alternativo; o do clone entra', () => {
    const porEquipe = somarPorEquipe({
      resumos: [resumo('brunno', 1000), resumo('thaynara', 300), resumo('vanessa', 50)],
      operadorEquipeMap: r.operadorEquipeMap, equipesExtrasPorOperador: r.equipesExtrasPorOperador,
      creditosDeOrigem: [],
    });
    expect(porEquipe.d1?.bruto).toBe(300);
    expect(porEquipe.d2).toBeUndefined();
    expect(porEquipe.p1.bruto).toBe(1300);
    expect(porEquipe.p2.bruto).toBe(1000);
  });

  it('líder só do alternativo: sem equipe, setor do alternativo', () => {
    expect(r.operadorEquipeMap.vanessa).toEqual({ equipe_id: null, equipe_nome: 'Sem equipe', setor_id: DIG });
    expect(r.equipesExtrasPorOperador.vanessa).toBeUndefined();
    expect([...setores('vanessa')]).toEqual([DIG]);
  });

  it('o clone e quem não lidera no alternativo ficam como estavam', () => {
    expect(r.operadorEquipeMap.thaynara).toBe(base.operadorEquipeMap.thaynara);
    expect(r.equipesExtrasPorOperador.thaynara).toEqual(['d1']);
  });

  it('sem setor alternativo, nada muda', () => {
    const s = liderNaoContaEmEquipeDeAlternativo({ ...base, alternativos: new Set() });
    expect(s.operadorEquipeMap).toBe(base.operadorEquipeMap);
  });
});
