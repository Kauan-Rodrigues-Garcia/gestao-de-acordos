/**
 * mesPix.test.ts — a fronteira do mês no fuso da operação.
 *
 * O defeito que estes testes fixam: `criado_em` chega em UTC, e a aba tinha
 * duas réguas para a mesma pergunta. A tabela mostrava a data em São Paulo, os
 * cards cortavam o mês com `startsWith` sobre o ISO em UTC. Um acordo
 * registrado em 31/08 às 21h30 aparecia como 31/08 na lista e contava em
 * SETEMBRO na dobra, no ranking e na premiação.
 *
 * A janela é estreita — 21h às 00h do último dia do mês — e é exatamente
 * quando a operação corre atrás da meta.
 */
import { describe, it, expect } from 'vitest';
import { dataLocalPix, mesLocalPix, noMesPix } from '../mesPix';

describe('dataLocalPix', () => {
  it('lê o instante no fuso de São Paulo, não em UTC', () => {
    // 00:30 UTC do dia 1º ainda é 21:30 do dia 31 em São Paulo.
    expect(dataLocalPix('2026-09-01T00:30:00Z')).toBe('2026-08-31');
    // E meia-noite local é 03:00 UTC do mesmo dia.
    expect(dataLocalPix('2026-09-01T03:00:00Z')).toBe('2026-09-01');
  });

  it('meio-dia local (o que `instanteDoDiaPix` grava) cai no próprio dia', () => {
    expect(dataLocalPix('2026-08-31T15:00:00Z')).toBe('2026-08-31');
  });

  it('entrada inválida devolve os dez primeiros caracteres, sem estourar', () => {
    expect(dataLocalPix('isto não é uma data')).toBe('isto não é');
    expect(dataLocalPix('')).toBe('');
  });

  it('o cache devolve o mesmo resultado para a mesma string', () => {
    const iso = '2026-09-01T00:30:00Z';
    expect(dataLocalPix(iso)).toBe(dataLocalPix(iso));
  });
});

describe('mesLocalPix / noMesPix', () => {
  it('o acordo das 21h30 do dia 31 é do mês que a pessoa viu na tela', () => {
    const registradoAsNoveEMeiaDaNoite = '2026-09-01T00:30:00Z';

    expect(mesLocalPix(registradoAsNoveEMeiaDaNoite)).toBe('2026-08');
    expect(noMesPix(registradoAsNoveEMeiaDaNoite, '2026-08')).toBe(true);
    expect(noMesPix(registradoAsNoveEMeiaDaNoite, '2026-09')).toBe(false);
  });

  it('o primeiro dia do mês também: 21h do dia 31/07 não é agosto', () => {
    expect(noMesPix('2026-08-01T00:10:00Z', '2026-08')).toBe(false);
    expect(noMesPix('2026-08-01T00:10:00Z', '2026-07')).toBe(true);
  });

  it('o meio do mês não muda de lado', () => {
    expect(noMesPix('2026-08-15T10:00:00Z', '2026-08')).toBe(true);
    expect(noMesPix('2026-08-15T23:00:00Z', '2026-08')).toBe(true);
  });

  it('mês vazio não recorta nada — é o filtro desligado', () => {
    expect(noMesPix('2026-08-15T10:00:00Z', '')).toBe(true);
  });
});
