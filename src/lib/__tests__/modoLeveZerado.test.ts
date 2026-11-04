import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/lib/sinais', () => ({ assinarSinal: vi.fn(() => () => undefined) }));

const { deveDesligar } = await import('@/lib/modoLeveZerado');

const ZERADO = '2026-10-29T15:00:00.000Z';
const zerado = new Date(ZERADO).getTime();

describe('deveDesligar', () => {
  it('nada zerado, ou modo leve desligado: não mexe', () => {
    expect(deveDesligar(null, true, null)).toBe(false);
    expect(deveDesligar(ZERADO, false, null)).toBe(false);
  });

  it('ligado antes do clique do administrador: desliga', () => {
    expect(deveDesligar(ZERADO, true, zerado - 60_000)).toBe(true);
  });

  it('ligado sem hora guardada (antes de 29/10): desliga', () => {
    expect(deveDesligar(ZERADO, true, null)).toBe(true);
  });

  it('a pessoa ligou de novo depois do clique: fica ligado', () => {
    expect(deveDesligar(ZERADO, true, zerado + 60_000)).toBe(false);
  });
});
