/**
 * src/providers/__tests__/PresenceProvider.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * PresenceProvider + useOnlineUsers — a batida no banco (05/10/2026).
 *
 * O que se garante:
 *   - nada de canal de Realtime: o online sai de `fn_presenca_bater`;
 *   - a batida repete a cada 15 s e leva a empresa em que a pessoa está;
 *   - a lista só vem quando muda: a aba manda a versão que já tem;
 *   - os dois conjuntos (empresa de quem olha e global) saem da mesma resposta;
 *   - voltar para a aba bate na hora, mas não duas vezes seguidas;
 *   - fechar a aba chama `fn_presenca_sair` com `keepalive`;
 *   - erro na batida não derruba a tela nem enche o console.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

const { mockPerfilRef, mockEmpresaRef, rpcSpy, channelSpy, respostaRef } = vi.hoisted(() => ({
  mockPerfilRef:  { current: null as { id: string; nome?: string; perfil?: string } | null },
  mockEmpresaRef: { current: null as { id: string } | null },
  rpcSpy:         vi.fn(),
  channelSpy:     vi.fn(),
  respostaRef:    {
    current: {
      data: null as { versao: string; online?: [string, string | null][] } | null,
      error: null as { message: string } | null,
    },
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: rpcSpy,
    channel: channelSpy,
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok-1' } } }) },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: mockPerfilRef.current }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: mockEmpresaRef.current }),
}));

import { PresenceProvider, useOnlineUsers } from '../PresenceProvider';

const USER_ID    = 'user-1';
const EMPRESA_ID = 'empresa-1';
const OUTRA      = 'empresa-2';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(PresenceProvider, null, children);
}

/** Deixa a primeira batida (sorteada em até 3 s) acontecer e voltar. */
async function primeiraBatida() {
  await act(async () => { await vi.advanceTimersByTimeAsync(3_100); });
}

describe('PresenceProvider + useOnlineUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPerfilRef.current  = { id: USER_ID, nome: 'Ana', perfil: 'operador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };
    respostaRef.current = {
      data: { versao: 'v1', online: [[USER_ID, EMPRESA_ID], ['user-2', EMPRESA_ID], ['user-3', OUTRA]] },
      error: null,
    };
    rpcSpy.mockReset();
    rpcSpy.mockImplementation(() => Promise.resolve(respostaRef.current));
    channelSpy.mockReset();
    // O desmontar de cada teste é um logout: sai pela rede, que aqui não existe.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fora do provider devolve os valores padrão', () => {
    const { result } = renderHook(() => useOnlineUsers());
    expect(result.current.onlineIds.size).toBe(0);
    expect(result.current.loading).toBe(true);
  });

  it('sem pessoa ou sem empresa não bate', async () => {
    mockPerfilRef.current = null;
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(rpcSpy).not.toHaveBeenCalled();

    mockPerfilRef.current = { id: USER_ID };
    mockEmpresaRef.current = null;
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('não abre canal de Realtime — era o que estourava o limite de presence', async () => {
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(channelSpy).not.toHaveBeenCalled();
    expect(rpcSpy).toHaveBeenCalledWith('fn_presenca_bater', { p_empresa: EMPRESA_ID, p_versao: null });
  });

  it('separa onlineIds (minha empresa) de onlineIdsGlobal (todas) e solta o loading', async () => {
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect([...result.current.onlineIds].sort()).toEqual([USER_ID, 'user-2']);
    expect([...result.current.onlineIdsGlobal].sort()).toEqual([USER_ID, 'user-2', 'user-3']);
    expect(result.current.loading).toBe(false);
  });

  it('para super_admin os dois conjuntos são iguais', async () => {
    mockPerfilRef.current = { id: USER_ID, perfil: 'super_admin' };
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(result.current.onlineIds.size).toBe(3);
    expect(result.current.onlineIdsGlobal.size).toBe(3);
  });

  it('bate de novo a cada 15 s e acompanha quem saiu', async () => {
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    respostaRef.current = { data: { versao: 'v2', online: [[USER_ID, EMPRESA_ID]] }, error: null };
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(rpcSpy).toHaveBeenCalledTimes(2);
    expect([...result.current.onlineIds]).toEqual([USER_ID]);
  });

  it('manda a versão que tem; resposta sem lista mantém a lista', async () => {
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    const antes = result.current.onlineIdsGlobal;

    respostaRef.current = { data: { versao: 'v1' }, error: null };
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(rpcSpy).toHaveBeenLastCalledWith('fn_presenca_bater', { p_empresa: EMPRESA_ID, p_versao: 'v1' });
    expect(result.current.onlineIdsGlobal).toBe(antes);
    expect(result.current.onlineIdsGlobal.size).toBe(3);
  });

  it('erro na batida mantém a lista, avisa uma vez e tenta na próxima', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    const antes = result.current.onlineIds;

    respostaRef.current = { data: null, error: { message: 'Could not find the function' } };
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.onlineIds).toBe(antes);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledTimes(3);
    aviso.mockRestore();
  });

  it('voltar para a aba bate na hora, mas não logo depois de outra batida', async () => {
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    // Recente demais: ignora.
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0); });
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0); });
    expect(rpcSpy).toHaveBeenCalledTimes(2);
  });

  it('trocar de empresa bate com a empresa nova', async () => {
    const { rerender } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    mockEmpresaRef.current = { id: OUTRA };
    rerender();
    await primeiraBatida();
    expect(rpcSpy).toHaveBeenLastCalledWith('fn_presenca_bater', { p_empresa: OUTRA, p_versao: null });
  });

  it('fechar a aba chama fn_presenca_sair com keepalive e o token da última batida', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();

    window.dispatchEvent(new Event('pagehide'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/rest\/v1\/rpc\/fn_presenca_sair$/);
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('desmontar (logout) para de bater e sai da lista', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    const { unmount } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/fn_presenca_sair$/), expect.objectContaining({ keepalive: true }));
  });
});
