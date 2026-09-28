import { describe, expect, it } from 'vitest';
import { agruparAcordosPorDia, contarPorStatus } from './acordosPorDia';
import { rotuloDoDia } from './rotuloDoDia';

type A = { id: string; vencimento: string; status: string; cpf?: boolean };
const a = (id: string, vencimento: string, status = 'verificar_pendente', cpf = false): A => ({ id, vencimento, status, cpf });
const temCpf = (x: A) => !!x.cpf;

describe('agruparAcordosPorDia', () => {
  it('corta a fila em blocos sem mudar a ordem — hoje continua primeiro', () => {
    const lista = [a('1', '2026-09-28'), a('2', '2026-09-28', 'pago'), a('3', '2026-09-15'), a('4', '2026-09-16'), a('5', '2026-09-15')];
    const grupos = agruparAcordosPorDia(lista, temCpf);
    expect(grupos.map(g => g.dia)).toEqual(['2026-09-28', '2026-09-15', '2026-09-16']);
    expect(grupos[0].acordos.map(x => x.id)).toEqual(['1', '2']);
    expect(grupos[1].acordos.map(x => x.id)).toEqual(['3', '5']);
  });

  it('acordo com CPF ganha um bloco próprio no topo, fora dos dias', () => {
    const grupos = agruparAcordosPorDia([a('1', '2026-09-28'), a('2', '2026-09-10', 'pago', true)], temCpf);
    expect(grupos[0]).toMatchObject({ chave: 'cpf', dia: null });
    expect(grupos[0].acordos.map(x => x.id)).toEqual(['2']);
    expect(grupos[1].dia).toBe('2026-09-28');
  });

  it('lista vazia não gera bloco', () => {
    expect(agruparAcordosPorDia([], temCpf)).toEqual([]);
  });
});

describe('contarPorStatus', () => {
  it('pendente é tudo que ainda não foi pago nem dado como não pago', () => {
    expect(contarPorStatus([a('1', 'x'), a('2', 'x', 'pago'), a('3', 'x', 'nao_pago'), a('4', 'x', 'pago')]))
      .toEqual({ total: 4, pendentes: 1, pagos: 2, naoPagos: 1 });
  });
});

describe('rotuloDoDia', () => {
  it('nomeia hoje, ontem e amanhã; o resto pelo dia da semana', () => {
    expect(rotuloDoDia('2026-09-28', '2026-09-28')).toBe('Hoje · 28/09/2026');
    expect(rotuloDoDia('2026-09-27', '2026-09-28')).toBe('Ontem · 27/09/2026');
    expect(rotuloDoDia('2026-09-29', '2026-09-28')).toBe('Amanhã · 29/09/2026');
    expect(rotuloDoDia('2026-09-15', '2026-09-28')).toBe('Terça-feira · 15/09/2026');
  });

  it('vira o mês sem errar o «ontem»', () => {
    expect(rotuloDoDia('2026-09-30', '2026-10-01')).toBe('Ontem · 30/09/2026');
  });
});
