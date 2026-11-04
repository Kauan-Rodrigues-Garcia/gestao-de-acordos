/**
 * O bônus por período, na parte que é conta pura.
 *
 * Quem carimba `bonus_pct` é o gatilho da migration `20261027150000`. Aqui se
 * prova a soma: o bônus vai POR CIMA do % da linha, travado ou do setor, e é
 * o exemplo da operação — 0,25% com +0,02 vira 0,27%.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { comissaoDe, pctDaLinha, valorAPagarDe, bonusVigenteNoDia } from './pix_automatico.service';

const SETOR = 'setor-1';
const PCT = { [SETOR]: 0.25 };

describe('bônus do Pix', () => {
  it('0,25% com bônus de 0,02 vira 0,27%', () => {
    const a = { valor: 10000, status: 'pendente' as const, pct_comissao: null, setor_id: SETOR, bonus_pct: 0.02 };
    expect(pctDaLinha(a, PCT)).toBeCloseTo(0.27, 10);
    expect(comissaoDe(a, PCT)).toBe(27);
  });

  it('aprovado soma o bônus ao % travado', () => {
    const a = { valor: 10000, status: 'aprovado' as const, pct_comissao: 0.25, setor_id: SETOR, bonus_pct: 0.02 };
    expect(comissaoDe(a, { [SETOR]: 0.5 })).toBe(27);
  });

  it('sem bônus, nada muda', () => {
    const a = { valor: 10000, status: 'aprovado' as const, pct_comissao: 0.25, setor_id: SETOR };
    expect(comissaoDe(a, PCT)).toBe(25);
    expect(comissaoDe({ ...a, bonus_pct: null }, PCT)).toBe(25);
  });

  it('o valor a pagar leva o bônus e a correção', () => {
    const a = {
      valor: 10000, status: 'aprovado' as const, pct_comissao: 0.25, setor_id: SETOR,
      bonus_pct: 0.02, ajuste_valor: 3,
    };
    expect(valorAPagarDe(a, PCT)).toBe(30);
  });

  it('vigência inclui as duas pontas; sem fim vale para sempre; pausado não vale', () => {
    const b = { ativo: true, inicio: '2026-10-27', fim: '2026-10-31' };
    expect(bonusVigenteNoDia(b, '2026-10-26')).toBe(false);
    expect(bonusVigenteNoDia(b, '2026-10-27')).toBe(true);
    expect(bonusVigenteNoDia(b, '2026-10-31')).toBe(true);
    expect(bonusVigenteNoDia(b, '2026-11-01')).toBe(false);
    expect(bonusVigenteNoDia({ ...b, fim: null }, '2027-01-01')).toBe(true);
    expect(bonusVigenteNoDia({ ...b, ativo: false }, '2026-10-28')).toBe(false);
  });
});
