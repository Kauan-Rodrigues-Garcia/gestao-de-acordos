/**
 * metaIndireta.test.ts — a combinação das duas frentes de meta `[PP]`.
 *
 * O foco é a fronteira: quem NÃO tem a opção ligada não pode ter número
 * nenhum alterado, e quem tem precisa ser medido pelo total — nunca por uma
 * das metades.
 */
import { describe, it, expect } from 'vitest';
import { combinarMetaDupla } from './metaIndireta';

const BASE = { metaDireta: 10_000, metaIndireta: null, recebidoDireto: 4_000, recebidoIndireto: 0 };

describe('opção desligada', () => {
  it('devolve exatamente a leitura de hoje', () => {
    const d = combinarMetaDupla(BASE);
    expect(d.ativa).toBe(false);
    expect(d.metaTotal).toBe(10_000);
    expect(d.recebidoTotal).toBe(4_000);
    expect(d.pctIndireta).toBeNull();
    expect(d.faltaIndireta).toBeNull();
  });

  /**
   * O extra pago não some do sistema — some DESTA conta. Somá-lo para quem
   * nunca foi cobrado por ele inflaria a % de graça.
   */
  it('ignora recebimento indireto de quem não tem meta indireta', () => {
    const d = combinarMetaDupla({ ...BASE, recebidoIndireto: 9_999 });
    expect(d.recebidoTotal).toBe(4_000);
    expect(d.recebidoIndireto).toBe(0);
  });

  it('meta indireta zero é o mesmo que desligada', () => {
    const d = combinarMetaDupla({ ...BASE, metaIndireta: 0, recebidoIndireto: 500 });
    expect(d.ativa).toBe(false);
    expect(d.metaTotal).toBe(10_000);
    expect(d.recebidoTotal).toBe(4_000);
  });
});

describe('opção ligada', () => {
  it('o total é a soma das duas frentes', () => {
    const d = combinarMetaDupla({
      metaDireta: 10_000, metaIndireta: 5_000,
      recebidoDireto: 4_000, recebidoIndireto: 2_000,
    });
    expect(d.ativa).toBe(true);
    expect(d.metaTotal).toBe(15_000);
    expect(d.recebidoTotal).toBe(6_000);
  });

  it('cada frente mantém a própria leitura', () => {
    const d = combinarMetaDupla({
      metaDireta: 10_000, metaIndireta: 5_000,
      recebidoDireto: 4_000, recebidoIndireto: 2_500,
    });
    expect(d.pctDireta).toBe(40);
    expect(d.pctIndireta).toBe(50);
    expect(d.faltaDireta).toBe(6_000);
    expect(d.faltaIndireta).toBe(2_500);
  });

  it('meta batida não vira falta negativa', () => {
    const d = combinarMetaDupla({
      metaDireta: 10_000, metaIndireta: 5_000,
      recebidoDireto: 12_000, recebidoIndireto: 7_000,
    });
    expect(d.faltaDireta).toBe(0);
    expect(d.faltaIndireta).toBe(0);
    expect(d.recebidoTotal).toBe(19_000);
  });

  /**
   * O caso que a meta indireta existe para não punir: mal na direta, muito bem
   * na indireta. Pela metade direta seriam 40%; pelo total, 80%.
   */
  it('quem foi bem no extra não é medido só pela metade direta', () => {
    const d = combinarMetaDupla({
      metaDireta: 10_000, metaIndireta: 10_000,
      recebidoDireto: 4_000, recebidoIndireto: 12_000,
    });
    expect(d.pctDireta).toBe(40);
    expect(Math.round((d.recebidoTotal / (d.metaTotal ?? 1)) * 100)).toBe(80);
  });

  it('sem meta direta, a indireta vira a meta inteira', () => {
    const d = combinarMetaDupla({
      metaDireta: null, metaIndireta: 5_000,
      recebidoDireto: 0, recebidoIndireto: 1_000,
    });
    expect(d.metaTotal).toBe(5_000);
    expect(d.recebidoTotal).toBe(1_000);
    expect(d.pctDireta).toBeNull();
  });

  it('recebimento indireto negativo não subtrai do total', () => {
    const d = combinarMetaDupla({
      metaDireta: 10_000, metaIndireta: 5_000,
      recebidoDireto: 4_000, recebidoIndireto: -300,
    });
    expect(d.recebidoIndireto).toBe(0);
    expect(d.recebidoTotal).toBe(4_000);
  });
});

describe('sem meta nenhuma', () => {
  it('continua sem meta, em vez de virar zero', () => {
    const d = combinarMetaDupla({
      metaDireta: null, metaIndireta: null,
      recebidoDireto: 3_000, recebidoIndireto: 500,
    });
    expect(d.ativa).toBe(false);
    expect(d.metaTotal).toBeNull();
    expect(d.pctDireta).toBeNull();
    expect(d.pctIndireta).toBeNull();
  });
});
