import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import {
  DESFAZER_PAGO_MS, esquecerPagoDesfazivel, guardarPagoDesfazivel, pagoDesfazivel,
} from './desfazerPago';

const antes = { statusAnterior: 'verificar_pendente', vencimentoAnterior: '2026-10-10', dataPagamentoAnterior: null };

describe('desfazer o «pago» por 5 minutos', () => {
  it('guarda o estado de antes e devolve até a janela fechar', () => {
    const t0 = 1_000_000;
    guardarPagoDesfazivel('a1', antes, t0);
    expect(pagoDesfazivel('a1', t0 + 60_000)).toMatchObject(antes);
    expect(pagoDesfazivel('a1', t0 + DESFAZER_PAGO_MS - 1)).not.toBeNull();
    expect(pagoDesfazivel('a1', t0 + DESFAZER_PAGO_MS)).toBeNull();
    // Passou da hora, foi esquecido de vez.
    expect(pagoDesfazivel('a1', t0)).toBeNull();
  });

  it('esquecer tira o botão na hora', () => {
    guardarPagoDesfazivel('a2', antes);
    esquecerPagoDesfazivel('a2');
    expect(pagoDesfazivel('a2')).toBeNull();
  });

  it('a janela é de 5 minutos', () => {
    expect(DESFAZER_PAGO_MS).toBe(5 * 60_000);
  });
});
