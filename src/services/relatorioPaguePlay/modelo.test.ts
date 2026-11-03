/**
 * inicioSugerido — o período do arquivo de conciliação não sai das linhas.
 *
 * Caso real de 03/11/2026: exportado de 31/10 a 03/11 (sábado, domingo e
 * Finados no meio), o arquivo só tinha linhas com Data 03/11. A sugestão antiga
 * (03/11 a 03/11) caía na trava «ontem e hoje».
 */
import { describe, it, expect } from 'vitest';
import { inicioSugerido, validarPeriodo } from './modelo';

const dias = (...datas: string[]) => datas.map(data => ({ data }));

describe('inicioSugerido', () => {
  it('depois de fim de semana e feriado: começa no dia seguinte ao último importado', () => {
    const inicio = inicioSugerido('2026-11-03', '2026-11-03', '2026-11-03', true, dias('2026-10-29', '2026-10-30'));
    expect(inicio).toBe('2026-10-31');
    expect(() => validarPeriodo(inicio, '2026-11-03', '2026-11-03', true)).not.toThrow();
  });

  it('dia comum, ontem importado em andamento: sugere ontem', () => {
    expect(inicioSugerido('2026-11-04', '2026-11-04', '2026-11-04', true, dias('2026-11-03'))).toBe('2026-11-03');
  });

  it('sem histórico: sugere ontem', () => {
    expect(inicioSugerido('2026-11-04', '2026-11-04', '2026-11-04', true, [])).toBe('2026-11-03');
  });

  it('arquivo que já começa antes fica como está', () => {
    expect(inicioSugerido('2026-10-01', '2026-11-03', '2026-11-03', true, dias('2026-10-30'))).toBe('2026-10-01');
  });

  it('fora da primeira importação do dia, ou carga histórica, vale a primeira linha', () => {
    expect(inicioSugerido('2026-11-03', '2026-11-03', '2026-11-03', false, dias('2026-10-30'))).toBe('2026-11-03');
    expect(inicioSugerido('2026-10-05', '2026-10-09', '2026-11-03', true, dias('2026-10-30'))).toBe('2026-10-05');
  });
});
