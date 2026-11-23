import { describe, expect, it } from 'vitest';
import { cuponsFicticios, metaFicticia, setorFicticio } from './ficticio';

const d = {
  inicio: '2026-11-23', fim: '2026-11-30', medias: 9,
  cupom_inicio: '2026-11-23', cupom_fim: '2026-11-26', cupom_pix: 3,
};

describe('dados fictícios do «Ver como»', () => {
  it('9,4 médias: bateu, com a média fictícia de R$ 10 mil', () => {
    const m = metaFicticia(d, 9.4, '2026-11-25');
    expect(m.mediaDiaria).toBe(10_000);
    expect(m.feito).toBeCloseTo(94_000, 2);
    expect(m.bateu).toBe(true);
    expect(m.medias).toBe(9.4);
  });

  it('com a pessoa real, usa a média dela e troca só o feito', () => {
    const real = metaFicticia(d, 0, '2026-11-25');
    const m = metaFicticia(d, 4.5, '2026-11-25', { ...real, mediaDiaria: 8_000, diasUteisMes: 19 });
    expect(m.mediaDiaria).toBe(8_000);
    expect(m.feito).toBeCloseTo(36_000, 2);
    expect(m.bateu).toBe(false);
    expect(m.falta).toBe(36_000);
  });

  it('o feito cai só nos dias úteis até o dia simulado', () => {
    const m = metaFicticia(d, 3, '2026-11-24');
    expect(m.recebidoPorDia.slice(0, 2).reduce((a, b) => a + b, 0)).toBeCloseTo(30_000, 2);
    expect(m.recebidoPorDia.slice(2).every(v => v === 0)).toBe(true);
  });

  it('cupons: 7 aprovados e 2 pendentes = 2 cupons, 3 se aprovar', () => {
    const c = cuponsFicticios(d, { aprovados: 7, pendentes: 2 });
    expect(c).toMatchObject({ aprovados: 7, pendentes: 2, cupons: 2, cuponsSeAprovar: 3 });
    expect(c.linhas).toHaveLength(9);
  });

  it('o time fictício tem quem bateu e quem não, em duas equipes', () => {
    const t = setorFicticio(d, '2026-11-30');
    expect(t.setor.equipes).toHaveLength(2);
    expect(t.setor.total).toBe(10);
    expect(t.setor.bateram).toBe(4);
    expect(t.pix.some(p => p.status === 'pendente')).toBe(true);
  });
});
