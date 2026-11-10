import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: vi.fn() }));
vi.mock('@/lib/sinais', () => ({ assinarSinal: vi.fn(() => () => {}) }));

import { guardadaVale, qualPortao } from './liberacao';

describe('qual portão de senha', () => {
  it('marcado com a senha inicial só é barrado depois de liberado', () => {
    expect(qualPortao({ senha_inicial_pendente: true }, false)).toBeNull();
    expect(qualPortao({ senha_inicial_pendente: true }, true)).toBe('inicial');
  });

  it('quem não está marcado não é barrado pela liberação', () => {
    expect(qualPortao({ senha_inicial_pendente: false }, true)).toBeNull();
    expect(qualPortao({}, true)).toBeNull();
    expect(qualPortao(null, true)).toBeNull();
  });

  it('senha resetada ou conta nova: a trava de sempre, liberado ou não', () => {
    expect(qualPortao({ senha_troca_obrigatoria: true }, false)).toBe('pedido');
    expect(qualPortao({ senha_troca_obrigatoria: true, senha_inicial_pendente: true }, true)).toBe('pedido');
  });
});

describe('resposta guardada no navegador', () => {
  const agora = 1_000_000_000;
  it('liberado vale 30 min; não liberado, 5', () => {
    expect(guardadaVale({ liberadoEm: 'x', em: agora - 29 * 60_000 }, agora)).toBe(true);
    expect(guardadaVale({ liberadoEm: 'x', em: agora - 31 * 60_000 }, agora)).toBe(false);
    expect(guardadaVale({ liberadoEm: null, em: agora - 4 * 60_000 }, agora)).toBe(true);
    expect(guardadaVale({ liberadoEm: null, em: agora - 6 * 60_000 }, agora)).toBe(false);
    expect(guardadaVale(null, agora)).toBe(false);
  });
});
