import { describe, it, expect } from 'vitest';
import { converterParaHO, metaEmHO } from './contextoEmHO';

const PP = 'emp-pp';
const BP = 'emp-bp';

describe('converterParaHO', () => {
  it('equipe da PaguePlay: meta convertida pelo percentual da empresa e recebido em H.O.', () => {
    const r = converterParaHO(
      { e3: 100_000 },
      { e3: { total: 90_000, totalHO: 20_000, qtd: 10 } },
      { e3: PP },
      { [PP]: 0.226 },
    );
    expect(r.metas).toEqual({ e3: 22_600 });
    expect(r.recebidos).toEqual({ e3: { total: 20_000, qtd: 10 } });
  });

  it('equipe da BookPlay no mesmo desafio continua em bruto', () => {
    const r = converterParaHO(
      { e1: 50_000, e3: 100_000 },
      { e1: { total: 30_000, totalHO: 0, qtd: 5 }, e3: { total: 90_000, totalHO: 20_000, qtd: 10 } },
      { e1: BP, e3: PP },
      { [PP]: 0.226 },
    );
    expect(r.metas?.e1).toBe(50_000);
    expect(r.recebidos?.e1.total).toBe(30_000);
    expect(r.metas?.e3).toBe(22_600);
  });

  it('a projeção sai igual à do card do Painel (H.O. ÷ meta em H.O.)', () => {
    const r = converterParaHO(
      { e3: 72_115.38 }, { e3: { total: 60_000, totalHO: 14_000, qtd: 1 } }, { e3: PP }, { [PP]: 0.226 },
    );
    expect(r.metas?.e3).toBe(metaEmHO(72_115.38, 0.226));
    expect((r.recebidos!.e3.total / r.metas!.e3) * 100).toBeCloseTo((14_000 / (72_115.38 * 0.226)) * 100, 2);
  });

  it('sem a migration (sem empresas_ho): nada muda', () => {
    const r = converterParaHO({ e3: 100_000 }, { e3: { total: 90_000, qtd: 10 } }, { e3: PP }, undefined);
    expect(r.metas).toEqual({ e3: 100_000 });
    expect(r.recebidos).toEqual({ e3: { total: 90_000, qtd: 10 } });
  });

  it('mapa ausente continua ausente (o cálculo cai no comportamento antigo)', () => {
    const r = converterParaHO(undefined, undefined, {}, { [PP]: 0.226 });
    expect(r.metas).toBeUndefined();
    expect(r.recebidos).toBeUndefined();
  });

  it('equipe sem empresa conhecida fica em bruto, não zera', () => {
    const r = converterParaHO({ x: 1000 }, { x: { total: 500, totalHO: 100, qtd: 1 } }, {}, { [PP]: 0.226 });
    expect(r.metas?.x).toBe(1000);
    expect(r.recebidos?.x.total).toBe(500);
  });
});
