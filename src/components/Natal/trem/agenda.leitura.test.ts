/**
 * A agenda do trem relida só com alguém olhando (auditoria de RAM, 09/11/2026).
 *
 * Eram 22 mil leituras de `fn_natal_trem_estado` por dia, a cada 60 s em toda
 * aba aberta — inclusive escondida ou atrás do ERP. Agora:
 *   - o relógio de 60 s só relê com alguém olhando;
 *   - a volta (`ouvirVolta`) paga o que ficou devendo, e paga também na
 *     revisita de 5 min de quem está de lado, que chega com ninguém olhando;
 *   - leitura recente não se repete.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const estado = vi.hoisted(() => ({
  ninguem: false,
  voltas: new Set<() => void>(),
  chamadas: 0,
}));

vi.mock('@/lib/atencao', () => ({
  ninguemOlhando: () => estado.ninguem,
  ouvirVolta: (f: () => void) => { estado.voltas.add(f); return () => { estado.voltas.delete(f); }; },
}));

vi.mock('@/lib/supabaseSemTipo', () => ({
  rpcSemTipo: () => {
    estado.chamadas += 1;
    return Promise.resolve({
      data: { ativo: true, abre: '08:00', fecha: '17:00', inicio: null, inscritos: 0 },
      error: null,
    });
  },
}));

const volta = () => { for (const f of estado.voltas) f(); };

async function montar() {
  const mod = await import('./agenda');
  const hook = renderHook(() => mod.useAgendaDoTrem());
  await vi.advanceTimersByTimeAsync(0);
  return hook;
}

describe('a agenda do trem só relê com alguém olhando', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    estado.ninguem = false;
    estado.voltas.clear();
    estado.chamadas = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lê ao montar e a cada 60 s com alguém olhando', async () => {
    const h = await montar();
    expect(estado.chamadas).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(estado.chamadas).toBe(2);
    h.unmount();
  });

  it('ninguém olhando: o relógio não relê, e a volta paga uma vez', async () => {
    const h = await montar();
    estado.ninguem = true;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(estado.chamadas).toBe(1);

    estado.ninguem = false;
    volta();
    await vi.advanceTimersByTimeAsync(0);
    expect(estado.chamadas).toBe(2);
    h.unmount();
  });

  it('a revisita de quem está de lado chega com ninguém olhando e relê', async () => {
    const h = await montar();
    estado.ninguem = true;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    volta();
    await vi.advanceTimersByTimeAsync(0);
    expect(estado.chamadas).toBe(2);
    h.unmount();
  });

  it('a volta logo depois de uma leitura não relê de novo', async () => {
    const h = await montar();
    await vi.advanceTimersByTimeAsync(10_000);
    volta();
    await vi.advanceTimersByTimeAsync(0);
    expect(estado.chamadas).toBe(1);
    h.unmount();
  });

  it('desmontou o último: para o relógio e a volta', async () => {
    const h = await montar();
    h.unmount();
    expect(estado.voltas.size).toBe(0);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(estado.chamadas).toBe(1);
  });
});
