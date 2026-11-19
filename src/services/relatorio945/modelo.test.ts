import { describe, expect, it } from 'vitest';
import { diaDaSemana, faltaInicio, horaDoCorteLocal, instrucaoDeExportacao, segundoDiaUtil } from './modelo';

describe('regras da tela do 945', () => {
  it('só recusa quando o arquivo chega na zona aberta e começa depois dela', () => {
    expect(faltaInicio('2026-10-23', '2026-10-26', '2026-10-19')).toBe(true);
    expect(faltaInicio('2026-10-01', '2026-10-26', '2026-10-19')).toBe(false);
    expect(faltaInicio('2026-10-19', '2026-10-26', '2026-10-19')).toBe(false);
    // carga histórica, toda antes do dia exigido
    expect(faltaInicio('2026-03-01', '2026-03-31', '2026-10-19')).toBe(false);
    expect(faltaInicio('2026-10-26', '2026-10-26', null)).toBe(false);
  });

  it('com mês por validar, pede o mês inteiro desde o dia 1º', () => {
    expect(instrucaoDeExportacao({ inicio_exigido: '2026-11-01', hoje: '2026-12-02' }))
      .toBe('Validação de novembro: exporte o relatório 945 com data inicial 01/11/2026 até hoje (o mês inteiro).');
  });

  it('sem exigência, libera qualquer período e diz quando vem a próxima validação', () => {
    expect(instrucaoDeExportacao({ inicio_exigido: null, hoje: '2026-11-19' }))
      .toBe('Pode importar o 945 de qualquer período, até só de hoje. A validação de novembro (o mês inteiro) fica para 02/12 (qua).');
    // dia 1º: a que vem é a do mês passado, no dia seguinte
    expect(instrucaoDeExportacao({ inicio_exigido: null, hoje: '2026-12-01' }))
      .toBe('Pode importar o 945 de qualquer período, até só de hoje. A validação de novembro (o mês inteiro) fica para 02/12 (qua).');
  });

  it('2º dia útil pula fim de semana', () => {
    expect(segundoDiaUtil('2026-11-19')).toBe('2026-11-03');
    expect(segundoDiaUtil('2027-01-20')).toBe('2027-01-04');
  });

  it('formata dia da semana e corte local', () => {
    expect(diaDaSemana('2026-10-25')).toBe('dom');
    expect(horaDoCorteLocal('2026-10-26T08:55:00')).toBe('26/10/2026 08:55');
    expect(horaDoCorteLocal(null)).toBe('—');
  });
});
