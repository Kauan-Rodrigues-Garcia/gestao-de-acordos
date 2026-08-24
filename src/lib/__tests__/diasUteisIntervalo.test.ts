/**
 * diasUteisIntervalo.test.ts
 *
 * O percentual de uso que a gerência pediu — «passaram tantos dias úteis, ela
 * acessou tantas vezes» — precisa de dias úteis numa janela que atravessa
 * meses. As funções antigas são todas POR MÊS, porque meta e quartil são
 * mensais.
 *
 * O risco de escrever isso no painel de uso seria ter duas definições de «dia
 * de trabalho» no mesmo sistema: uma para meta, outra para assiduidade. Os
 * casos abaixo travam a régua única — fim de semana, feriado e fuso.
 */
import { describe, it, expect } from 'vitest';
import { diasUteisIntervalo, listarDiasUteisIntervalo } from '../diasUteis';

describe('listarDiasUteisIntervalo', () => {
  it('conta de segunda a sexta e ignora o fim de semana', () => {
    // 2026-08-03 é segunda; 2026-08-09 é domingo.
    expect(listarDiasUteisIntervalo('2026-08-03', '2026-08-09')).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07',
    ]);
  });

  it('desconta feriado que cai em dia útil', () => {
    expect(diasUteisIntervalo('2026-08-03', '2026-08-07', ['2026-08-05'])).toBe(4);
  });

  it('feriado em fim de semana não subtrai nada', () => {
    // Já é a regra do resto do sistema: sábado não era dia útil de qualquer
    // forma, e descontá-lo tiraria um dia que ninguém ia trabalhar.
    expect(diasUteisIntervalo('2026-08-03', '2026-08-07', ['2026-08-08'])).toBe(5);
  });

  it('atravessa meses — é para isso que a função existe', () => {
    // 90 dias de janela cruzam três meses; as funções por mês não respondem.
    const dias = listarDiasUteisIntervalo('2026-07-30', '2026-08-04');
    expect(dias).toEqual([
      '2026-07-30', '2026-07-31', '2026-08-03', '2026-08-04',
    ]);
  });

  it('o mesmo dia nas duas pontas conta como um, se for útil', () => {
    expect(diasUteisIntervalo('2026-08-05', '2026-08-05')).toBe(1);
    expect(diasUteisIntervalo('2026-08-08', '2026-08-08')).toBe(0);
  });

  it('não desloca por fuso', () => {
    // `new Date('2026-08-03')` é meia-noite UTC, que em São Paulo é 21h do dia
    // 2 — um domingo. Andar no calendário assim tiraria a segunda-feira da
    // conta e o percentual de todo mundo ficaria maior do que é.
    expect(listarDiasUteisIntervalo('2026-08-03', '2026-08-03')).toEqual(['2026-08-03']);
  });

  it('janela invertida ou absurda devolve vazio em vez de travar', () => {
    expect(listarDiasUteisIntervalo('2026-08-10', '2026-08-01')).toEqual([]);
    expect(listarDiasUteisIntervalo('2020-01-01', '2030-01-01')).toEqual([]);
  });
});
