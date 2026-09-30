/**
 * O acumulado da equipe — a conta do card do Painel do Líder, agora também da
 * tela da equipe no celular.
 */
import { describe, it, expect } from 'vitest';
import { somarPorEquipe, diasDaEquipe } from './acumuladoDaEquipe';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';

const resumo = (id: string, total: number, ho = 0, ajuste = 0): ResumoOperadorAnalitico => ({
  operador_id: id, operador_usuario: id, operador_nome: id,
  total_recebido: total, total_ho: ho, total_pagamentos: 1, ajuste_manual: ajuste,
});
const info = (equipe: string | null) => ({ equipe_id: equipe, equipe_nome: equipe ?? '', setor_id: 's1' });

describe('somarPorEquipe', () => {
  it('soma cada operador na equipe principal, com H.O. e ajuste', () => {
    const r = somarPorEquipe({
      resumos: [resumo('a', 100, 25, 10), resumo('b', 50, 12)],
      operadorEquipeMap: { a: info('eq1'), b: info('eq1') },
      equipesExtrasPorOperador: {},
      creditosDeOrigem: [],
    });
    expect(r.eq1).toEqual({ bruto: 150, ho: 37, ajuste: 10 });
  });

  it('clone conta também na equipe clonada, mas não duas vezes na própria', () => {
    const r = somarPorEquipe({
      resumos: [resumo('a', 100)],
      operadorEquipeMap: { a: info('eq1') },
      equipesExtrasPorOperador: { a: ['eq1', 'eq2'] },
      creditosDeOrigem: [],
    });
    expect(r.eq1.bruto).toBe(100);
    expect(r.eq2.bruto).toBe(100);
  });

  it('crédito de origem entra na equipe de origem sem ajuste', () => {
    const r = somarPorEquipe({
      resumos: [],
      operadorEquipeMap: {},
      equipesExtrasPorOperador: {},
      creditosDeOrigem: [{ perfilId: 'x', nome: 'X', equipeId: 'eq-origem', setorId: 's0', bruto: 80, ho: 20 }],
    });
    expect(r['eq-origem']).toEqual({ bruto: 80, ho: 20, ajuste: 0 });
  });

  it('operador sem equipe não cai em equipe nenhuma', () => {
    const r = somarPorEquipe({
      resumos: [resumo('a', 100)],
      operadorEquipeMap: { a: info(null) },
      equipesExtrasPorOperador: {},
      creditosDeOrigem: [],
    });
    expect(r).toEqual({});
  });
});

describe('diasDaEquipe', () => {
  // setembro/2026: 22 dias úteis (seg–sex), sem feriado.
  it('mês cheio', () => {
    expect(diasDaEquipe({
      ano: 2026, mes: 9, feriados: [], hojeISO: '2026-09-30', contarHoje: true,
    })).toEqual({ totalUteis: 22, decorridos: 22 });
  });

  it('treinamento conta a partir do início', () => {
    const d = diasDaEquipe({
      ano: 2026, mes: 9, feriados: [], hojeISO: '2026-09-30', contarHoje: false,
      inicioTreino: '2026-09-21',
    });
    expect(d.totalUteis).toBe(8);
    expect(d.decorridos).toBe(7);
  });
});
