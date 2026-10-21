import { describe, it, expect } from 'vitest';
import { diasUteisDoSetor } from '@/lib/diasUteisDoSetor';

const geral = { feriados: ['2026-10-12'], contar_dia_atual: false };

describe('diasUteisDoSetor', () => {
  it('sem exceção, o setor segue a configuração geral', () => {
    expect(diasUteisDoSetor({ data: geral, porSetor: {} }, 'play1')).toEqual({
      feriados: ['2026-10-12'], contarDiaAtual: false, doSetor: false,
    });
  });

  it('com exceção, a lista do setor manda sozinha', () => {
    const fonte = {
      data: geral,
      porSetor: { play1: { feriados: ['2026-10-28'], contar_dia_atual: true } },
    };
    expect(diasUteisDoSetor(fonte, 'play1')).toEqual({
      feriados: ['2026-10-28'], contarDiaAtual: true, doSetor: true,
    });
    // O setor ao lado continua na geral.
    expect(diasUteisDoSetor(fonte, 'play2').feriados).toEqual(['2026-10-12']);
  });

  it('exceção com lista vazia é «trabalha em todos os dias úteis», não a geral', () => {
    const fonte = { data: geral, porSetor: { play1: { feriados: [], contar_dia_atual: false } } };
    expect(diasUteisDoSetor(fonte, 'play1')).toEqual({
      feriados: [], contarDiaAtual: false, doSetor: true,
    });
  });

  it('sem setor, ou sem `porSetor` (mock antigo, migration pendente), usa a geral', () => {
    expect(diasUteisDoSetor({ data: geral }, 'play1').doSetor).toBe(false);
    expect(diasUteisDoSetor({ data: geral, porSetor: { play1: { feriados: [], contar_dia_atual: true } } }, null).doSetor).toBe(false);
  });

  it('sem configuração nenhuma: sem feriado e sem contar hoje', () => {
    expect(diasUteisDoSetor({ data: null }, 'play1')).toEqual({
      feriados: [], contarDiaAtual: false, doSetor: false,
    });
    expect(diasUteisDoSetor(null, 'play1').feriados).toEqual([]);
  });
});
