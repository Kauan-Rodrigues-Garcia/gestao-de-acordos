/**
 * src/providers/__tests__/PresenceProvider.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * PresenceProvider + useOnlineUsers — batida no banco + aviso na hora.
 *
 * O que se garante:
 *   - nada de Presence: o online sai de `fn_presenca_bater` e do sinal
 *     `presenca` no tópico `presenca:global`;
 *   - a batida repete a cada 60 s, leva a empresa e a versão da lista;
 *   - os dois conjuntos (empresa de quem olha e global) saem do mesmo mapa;
 *   - «entrou» aparece na hora; «saiu» espera 3 s (o banco já esperou 15);
 *   - voltar para a aba bate na hora, mas não duas vezes seguidas;
 *   - fechar a aba chama `fn_presenca_sair` com `keepalive`;
 *   - erro na batida não derruba a tela nem enche o console.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import React from 'react';

const { mockPerfilRef, mockEmpresaRef, rpcSpy, channelSpy, respostaRef, assinarSpy, sinalRef, cancelarSpy } = vi.hoisted(() => ({
  mockPerfilRef:  { current: null as { id: string; nome?: string; perfil?: string } | null },
  mockEmpresaRef: { current: null as { id: string } | null },
  rpcSpy:         vi.fn(),
  channelSpy:     vi.fn(),
  respostaRef:    {
    current: {
      data: null as { versao: string; agora?: number; online?: [string, string | null][] } | null,
      error: null as { message: string } | null,
    },
  },
  assinarSpy:     vi.fn(),
  cancelarSpy:    vi.fn(),
  sinalRef:       { current: null as null | { onSinal?: (p: Record<string, unknown>) => void; onReconectado?: () => void } },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: rpcSpy,
    channel: channelSpy,
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok-1' } } }) },
  },
}));

vi.mock('@/lib/realtime', () => ({
  assinarTabela: assinarSpy,
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

function aviso(payload: Record<string, unknown>) {
  act(() => { sinalRef.current?.onSinal?.(payload); });
}

describe('PresenceProvider + useOnlineUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPerfilRef.current  = { id: USER_ID, nome: 'Ana', perfil: 'operador' };
    mockEmpresaRef.current = { id: EMPRESA_ID };
    respostaRef.current = {
      data: { versao: 'v1', agora: 1_000, online: [[USER_ID, EMPRESA_ID], ['user-2', EMPRESA_ID], ['user-3', OUTRA]] },
      error: null,
    };
    rpcSpy.mockReset();
    rpcSpy.mockImplementation(() => Promise.resolve(respostaRef.current));
    channelSpy.mockReset();
    cancelarSpy.mockReset();
    assinarSpy.mockReset();
    assinarSpy.mockImplementation((_a: unknown, ouvinte: typeof sinalRef.current) => { sinalRef.current = ouvinte; return cancelarSpy; });
    // O desmontar de cada teste é um logout: sai pela rede, que aqui não existe.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    // Desmonta antes de soltar o fetch falso: o desmontar é um logout, que sai pela rede.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fora do provider devolve os valores padrão', () => {
    const { result } = renderHook(() => useOnlineUsers());
    expect(result.current.onlineIds.size).toBe(0);
    expect(result.current.loading).toBe(true);
  });

  it('sem pessoa não bate nem assina; sem empresa não bate', async () => {
    mockPerfilRef.current = null;
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(rpcSpy).not.toHaveBeenCalled();
    expect(assinarSpy).not.toHaveBeenCalled();

    mockPerfilRef.current = { id: USER_ID };
    mockEmpresaRef.current = null;
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('não usa Presence: assina o sinal do banco e bate pela RPC', async () => {
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(channelSpy).not.toHaveBeenCalled();
    expect(assinarSpy).toHaveBeenCalledWith(
      { topico: 'presenca:global', escutas: [{ sinal: 'presenca' }] },
      expect.any(Object),
    );
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

  it('«entrou» aparece na hora, sem esperar batida', async () => {
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    aviso({ tipo: 'entrou', pessoa: 'user-9', empresa: EMPRESA_ID, em: 2_000 });
    expect(result.current.onlineIds.has('user-9')).toBe(true);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it('«saiu» some depois de 3 s', async () => {
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    aviso({ tipo: 'saiu', pessoa: 'user-2', empresa: EMPRESA_ID, em: 2_000 });
    expect(result.current.onlineIds.has('user-2')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_900); });
    expect(result.current.onlineIds.has('user-2')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.onlineIds.has('user-2')).toBe(false);
  });

  it('bate de novo a cada 60 s, com a versão que tem', async () => {
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    const antes = result.current.onlineIdsGlobal;

    respostaRef.current = { data: { versao: 'v1', agora: 2_000 }, error: null };
    // A primeira saiu entre 0 e 3 s: a segunda vem entre 60 e 63 s.
    await act(async () => { await vi.advanceTimersByTimeAsync(56_000); });
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(rpcSpy).toHaveBeenLastCalledWith('fn_presenca_bater', { p_empresa: EMPRESA_ID, p_versao: 'v1' });
    expect(result.current.onlineIdsGlobal).toBe(antes);
  });

  it('reconectou o Realtime: bate na hora para recuperar o intervalo', async () => {
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    await act(async () => { sinalRef.current?.onReconectado?.(); await vi.advanceTimersByTimeAsync(0); });
    expect(rpcSpy).toHaveBeenCalledTimes(2);
  });

  it('erro na batida mantém a lista, avisa uma vez e tenta na próxima', async () => {
    const avisoConsole = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    const antes = result.current.onlineIds;

    respostaRef.current = { data: null, error: { message: 'Could not find the function' } };
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.onlineIds).toBe(antes);
    expect(avisoConsole).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledTimes(3);
    avisoConsole.mockRestore();
  });

  it('voltar para a aba bate na hora, mas não logo depois de outra batida', async () => {
    renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0); });
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(0); });
    expect(rpcSpy).toHaveBeenCalledTimes(2);
  });

  it('trocar de empresa bate com a empresa nova e não reassina o aviso', async () => {
    const { rerender } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    mockEmpresaRef.current = { id: OUTRA };
    rerender();
    await primeiraBatida();
    expect(rpcSpy).toHaveBeenLastCalledWith('fn_presenca_bater', { p_empresa: OUTRA, p_versao: null });
    expect(assinarSpy).toHaveBeenCalledTimes(1);
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

  it('desmontar (logout) para de bater, cancela o aviso e sai da lista', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    const { unmount } = renderHook(() => useOnlineUsers(), { wrapper });
    await primeiraBatida();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(cancelarSpy).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/fn_presenca_sair$/), expect.objectContaining({ keepalive: true }));
  });
});
