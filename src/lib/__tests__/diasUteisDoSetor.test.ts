import { describe, it, expect } from 'vitest';
import { diasDoSetorNoIntervalo, diasUteisDoSetor } from '@/lib/diasUteisDoSetor';
import { diasUteisDecorridos, diasUteisDoMes } from '@/lib/diasUteis';

const geral = { feriados: ['2026-10-12'], contar_dia_atual: false };

describe('diasUteisDoSetor', () => {
  it('sem exceção, o setor segue a configuração geral', () => {
    expect(diasUteisDoSetor({ data: geral, porSetor: {} }, 'play1')).toEqual({
      feriados: ['2026-10-12'], contarDiaAtual: false, doSetor: false, daPessoa: false,
    });
  });

  it('com exceção, a lista do setor manda sozinha', () => {
    const fonte = {
      data: geral,
      porSetor: { play1: { feriados: ['2026-10-28'], contar_dia_atual: true } },
    };
    expect(diasUteisDoSetor(fonte, 'play1')).toEqual({
      feriados: ['2026-10-28'], contarDiaAtual: true, doSetor: true, daPessoa: false,
    });
    // O setor ao lado continua na geral.
    expect(diasUteisDoSetor(fonte, 'play2').feriados).toEqual(['2026-10-12']);
  });

  it('exceção com lista vazia é «trabalha em todos os dias úteis», não a geral', () => {
    const fonte = { data: geral, porSetor: { play1: { feriados: [], contar_dia_atual: false } } };
    expect(diasUteisDoSetor(fonte, 'play1')).toEqual({
      feriados: [], contarDiaAtual: false, doSetor: true, daPessoa: false,
    });
  });

  it('sem setor, ou sem `porSetor` (mock antigo, migration pendente), usa a geral', () => {
    expect(diasUteisDoSetor({ data: geral }, 'play1').doSetor).toBe(false);
    expect(diasUteisDoSetor({ data: geral, porSetor: { play1: { feriados: [], contar_dia_atual: true } } }, null).doSetor).toBe(false);
  });

  it('sem configuração nenhuma: sem feriado e sem contar hoje', () => {
    expect(diasUteisDoSetor({ data: null }, 'play1')).toEqual({
      feriados: [], contarDiaAtual: false, doSetor: false, daPessoa: false,
    });
    expect(diasUteisDoSetor(null, 'play1').feriados).toEqual([]);
  });
});

describe('dias úteis da pessoa', () => {
  // Novembro/2026: 21 dias de seg–sex; a geral tira 02/11 e 20/11 → 19.
  const geralNov = { feriados: ['2026-11-02', '2026-11-20'], contar_dia_atual: false };
  const desde16 = diasDoSetorNoIntervalo('2026-11', geralNov.feriados, '2026-11-16');

  it('começou no dia 16: só os dias úteis do setor dali em diante', () => {
    expect(desde16).toEqual([
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19',
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-30',
    ]);
  });

  it('a régua da pessoa conta só os dias dela, e o resto segue o setor', () => {
    const fonte = { data: geralNov, porPessoa: { ana: { mes: '2026-11', dias: desde16 } } };
    const r = diasUteisDoSetor(fonte, 'play1', 'ana');
    expect(r.daPessoa).toBe(true);
    expect(r.contarDiaAtual).toBe(false);
    expect(diasUteisDoMes(2026, 11, r.feriados)).toBe(10);
    expect(diasUteisDecorridos(2026, 11, r.feriados, '2026-11-18', undefined, false)).toBe(2);
    // Outra pessoa, ou sem `perfilId`: a régua do setor.
    expect(diasUteisDoSetor(fonte, 'play1', 'bia').daPessoa).toBe(false);
    expect(diasUteisDoMes(2026, 11, diasUteisDoSetor(fonte, 'play1').feriados)).toBe(19);
  });

  it('feriado do setor fica fora mesmo se estiver na lista da pessoa', () => {
    const fonte = {
      data: geralNov,
      porSetor: { play1: { feriados: ['2026-11-02', '2026-11-20', '2026-11-30'], contar_dia_atual: true } },
      porPessoa: { ana: { mes: '2026-11', dias: desde16 } },
    };
    const r = diasUteisDoSetor(fonte, 'play1', 'ana');
    expect(r.doSetor).toBe(true);
    expect(r.contarDiaAtual).toBe(true);
    expect(diasUteisDoMes(2026, 11, r.feriados)).toBe(9);
  });

  it('o atalho «até»: saiu no dia 13', () => {
    expect(diasDoSetorNoIntervalo('2026-11', geralNov.feriados, null, '2026-11-13')).toHaveLength(9);
  });
});
