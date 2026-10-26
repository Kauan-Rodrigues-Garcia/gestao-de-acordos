import { describe, expect, it } from 'vitest';
import { diaDaSemana, faltaInicio, horaDoCorteLocal, instrucaoDeExportacao } from './modelo';

describe('regras da tela do 945', () => {
  it('só recusa quando o arquivo chega na zona aberta e começa depois dela', () => {
    expect(faltaInicio('2026-10-23', '2026-10-26', '2026-10-19')).toBe(true);
    expect(faltaInicio('2026-10-01', '2026-10-26', '2026-10-19')).toBe(false);
    expect(faltaInicio('2026-10-19', '2026-10-26', '2026-10-19')).toBe(false);
    // carga histórica, toda antes do dia exigido
    expect(faltaInicio('2026-03-01', '2026-03-31', '2026-10-19')).toBe(false);
    expect(faltaInicio('2026-10-26', '2026-10-26', null)).toBe(false);
  });

  it('a instrução diz a data e o dia da semana — segunda pede a sexta, não o domingo', () => {
    expect(instrucaoDeExportacao({ inicio_exigido: '2026-10-23', hoje: '2026-10-26' }))
      .toBe('Exporte o relatório 945 com data inicial 23/10/2026 (sex) até hoje.');
    expect(instrucaoDeExportacao({ inicio_exigido: null, hoje: '2026-10-26' })).toMatch(/qualquer período/);
  });

  it('formata dia da semana e corte local', () => {
    expect(diaDaSemana('2026-10-25')).toBe('dom');
    expect(horaDoCorteLocal('2026-10-26T08:55:00')).toBe('26/10/2026 08:55');
    expect(horaDoCorteLocal(null)).toBe('—');
  });
});
